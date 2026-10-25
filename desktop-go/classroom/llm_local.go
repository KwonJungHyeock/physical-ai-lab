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
	"unicode/utf8"
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

// LocalModel: one model Ollama has (name as Ollama calls it, size on disk, parameter count).
type LocalModel struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	Params string `json:"params,omitempty"`
}

// OllamaDefaultURL: where Ollama answers on the PC it runs on.
const OllamaDefaultURL = ollamaDefaultURL

// OllamaModels: the models Ollama has at an address (checked), or an error when it does not answer.
func OllamaModels(ctx context.Context, base string) (string, []LocalModel, error) {
	base, err := checkOllamaURL(base)
	if err != nil {
		return "", nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/tags", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return base, nil, fmt.Errorf("Ollama 에 연결할 수 없어요: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return base, nil, ollamaErr(res)
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
		return base, nil, fmt.Errorf("Ollama 의 답을 읽지 못했어요: %w", err)
	}
	out := []LocalModel{}
	for _, m := range tags.Models {
		if reOllamaModel.MatchString(m.Name) && len(out) < 100 {
			out = append(out, LocalModel{m.Name, m.Size, m.Details.ParameterSize})
		}
	}
	return base, out, nil
}

// AskOllama: one 말로 만들기 question straight to a model in Ollama, with the same checks on the
// question and the answer as the class server — for the desktop simulator's AI button on this PC.
func AskOllama(ctx context.Context, base, model, text string, c LLMContext) (LLMAnswer, error) {
	text = strings.TrimSpace(text)
	if text == "" || utf8.RuneCountInString(text) > llmMaxText {
		return LLMAnswer{}, fmt.Errorf("%w: 말은 1~%d자로 적어 주세요", errBadInput, llmMaxText)
	}
	if err := c.check(); err != nil {
		return LLMAnswer{}, err
	}
	base, err := checkOllamaURL(base)
	if err != nil {
		return LLMAnswer{}, err
	}
	if !reOllamaModel.MatchString(model) {
		return LLMAnswer{}, fmt.Errorf("%w: Ollama 모델 이름이 올바르지 않아요", errBadInput)
	}
	ctx, cancel := context.WithTimeout(ctx, llmLocalTimeout)
	defer cancel()
	a, _, err := OllamaCaller()(ctx, LLMConfig{OllamaURL: base, OllamaModel: model}, userTurn(text, c))
	if err != nil {
		return LLMAnswer{}, err
	}
	return a.tidy()
}

// IsBadInput: the question itself was refused (too long, a broken scene), not the model.
func IsBadInput(err error) bool { return errors.Is(err, errBadInput) }

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
	base, models, err := OllamaModels(r.Context(), base)
	switch {
	case IsBadInput(err):
		srv.fail(w, err)
	case err != nil:
		writeErr(w, http.StatusBadGateway, "ollama", "Ollama 에 연결할 수 없어요. 이 PC 에서 Ollama 가 켜져 있는지 확인해 주세요.")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"url": base, "models": models})
	}
}
