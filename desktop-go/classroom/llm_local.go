package classroom

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// 말로 만들기 with a model on the teacher's own PC (Ollama), for demonstrations before there is an
// API key, or a classroom without internet. Same instructions (llm_system.md), same answer shape
// (Ollama's structured outputs take the JSON schema as `format`), same checks after; only the model
// differs, and a small local model gets more answers wrong. The block checks on the student's PC
// stay the safety either way.

const (
	llmProviderClaude = "claude"
	llmProviderOllama = "ollama"
	ollamaDefaultURL  = "http://127.0.0.1:11434"
	// A local model on a teacher's PC can be slow (no graphics card: tens of seconds), and Ollama
	// answers one question after another.
	llmLocalTimeout = 150 * time.Second
)

var reOllamaModel = regexp.MustCompile(`^[A-Za-z0-9._:/-]{1,100}$`)

// checkOllamaURL: an http(s) address with a host, nothing else in it.
func checkOllamaURL(raw string) (string, error) {
	raw = strings.TrimRight(strings.TrimSpace(raw), "/")
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || len(raw) > 200 {
		return "", fmt.Errorf("%w: Ollama 주소는 http://127.0.0.1:11434 처럼 적어 주세요", errBadInput)
	}
	return raw, nil
}

func ollamaPost(ctx context.Context, base, path string, body any) (*http.Response, error) {
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

// ollamaErr: Ollama's own message for a failed call ({"error": "..."}), short.
func ollamaErr(res *http.Response) error {
	var e struct {
		Error string `json:"error"`
	}
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	_ = json.Unmarshal(b, &e)
	if e.Error == "" {
		e.Error = strings.TrimSpace(string(b))
	}
	if len(e.Error) > 160 {
		e.Error = e.Error[:160]
	}
	return fmt.Errorf("Ollama %d %s", res.StatusCode, e.Error)
}

// OllamaCaller asks the model named in the settings at the settings' Ollama address.
func OllamaCaller() LLMCaller {
	return func(ctx context.Context, cfg LLMConfig, user string) (LLMAnswer, llmUsage, error) {
		req := map[string]any{
			"model": cfg.OllamaModel,
			"messages": []map[string]string{
				{"role": "system", "content": llmSystem},
				{"role": "user", "content": user},
			},
			"stream": false,
			"format": llmSchema,
			// Thinking models (Qwen3) would think first and take much longer; the answer is short.
			"think":      false,
			"keep_alive": "30m",
			"options":    map[string]any{"temperature": 0.2, "num_ctx": 8192},
		}
		res, err := ollamaPost(ctx, cfg.OllamaURL, "/api/chat", req)
		if err != nil {
			return LLMAnswer{}, llmUsage{}, fmt.Errorf("Ollama 에 연결할 수 없어요: %w", err)
		}
		if res.StatusCode == http.StatusBadRequest {
			// An older Ollama, or a model that refuses the thinking switch: ask once more without it.
			err := ollamaErr(res)
			res.Body.Close()
			if !strings.Contains(err.Error(), "think") {
				return LLMAnswer{}, llmUsage{}, err
			}
			delete(req, "think")
			if res, err = ollamaPost(ctx, cfg.OllamaURL, "/api/chat", req); err != nil {
				return LLMAnswer{}, llmUsage{}, fmt.Errorf("Ollama 에 연결할 수 없어요: %w", err)
			}
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return LLMAnswer{}, llmUsage{}, ollamaErr(res)
		}
		var out struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			DoneReason string `json:"done_reason"`
			PromptEval int64  `json:"prompt_eval_count"`
			Eval       int64  `json:"eval_count"`
		}
		if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&out); err != nil {
			return LLMAnswer{}, llmUsage{}, fmt.Errorf("Ollama answer: %w", err)
		}
		u := llmUsage{In: out.PromptEval, Out: out.Eval}
		if out.DoneReason == "length" {
			return LLMAnswer{}, u, errors.New("answer cut off (length)")
		}
		var a LLMAnswer
		if err := json.Unmarshal([]byte(strings.TrimSpace(out.Message.Content)), &a); err != nil {
			return LLMAnswer{}, u, fmt.Errorf("answer is not the agreed JSON: %w", err)
		}
		return a, u, nil
	}
}

// localModels: the models Ollama has at an address (the operator picks one), or why it cannot be
// reached. GET /llm/local-models?url=…
func (srv *Server) localModels(w http.ResponseWriter, r *http.Request, s session) {
	if s.Role != RoleOperator {
		writeErr(w, http.StatusForbidden, "role", "AI 종류는 운영자(관리자) 계정만 바꿀 수 있어요.")
		return
	}
	base := r.URL.Query().Get("url")
	if base == "" {
		base = srv.store.LLMConfig().OllamaURL
	}
	base, err := checkOllamaURL(base)
	if err != nil {
		srv.fail(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/tags", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "ollama", "Ollama 에 연결할 수 없어요. 이 PC 에서 Ollama 가 켜져 있는지 확인해 주세요.")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		writeErr(w, http.StatusBadGateway, "ollama", "Ollama 가 모델 목록을 주지 않았어요: "+ollamaErr(res).Error())
		return
	}
	var tags struct {
		Models []struct {
			Name    string `json:"name"`
			Size    int64  `json:"size"`
			Details struct {
				ParameterSize string `json:"parameter_size"`
			} `json:"details"`
		} `json:"models"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&tags); err != nil {
		writeErr(w, http.StatusBadGateway, "ollama", "Ollama 의 답을 읽지 못했어요.")
		return
	}
	type model struct {
		Name   string `json:"name"`
		Size   int64  `json:"size"`
		Params string `json:"params,omitempty"`
	}
	out := []model{}
	for _, m := range tags.Models {
		if reOllamaModel.MatchString(m.Name) && len(out) < 100 {
			out = append(out, model{m.Name, m.Size, m.Details.ParameterSize})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": base, "models": out})
}
