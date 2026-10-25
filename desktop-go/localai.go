package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"physical-ai-lab/desktop/classroom"
)

// AI 버튼: the simulator on this PC asks a model in Ollama on this PC directly — no class server,
// no login, no key. Same instructions and checks as the class server's 말로 만들기
// (classroom.AskOllama); the answer is block lines the student looks at and runs in the simulator
// first. Only here on 127.0.0.1, like the USB maker, never on the class server's LAN address.
//
//	GET  /__physical-ai-simulator/ai       → {ok, url, models, error?}: is Ollama there, with which models
//	POST /__physical-ai-simulator/ai/ask   {text, context, model} → {ok, lines, explain}

const aiAPI = hello + "/ai"

// ollamaURL: Ollama on this PC, or where PAI_OLLAMA_URL points (another PC on the LAN).
func ollamaURL() string {
	if u := strings.TrimSpace(os.Getenv("PAI_OLLAMA_URL")); u != "" {
		return u
	}
	return classroom.OllamaDefaultURL
}

// One question at a time: Ollama on a classroom PC answers one after another anyway.
var aiBusy sync.Mutex

func aiHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		if p != aiAPI && !strings.HasPrefix(p, aiAPI+"/") {
			next.ServeHTTP(w, r)
			return
		}
		if !localRequest(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		switch {
		case p == aiAPI && r.Method == http.MethodGet:
			base, models, err := classroom.OllamaModels(r.Context(), ollamaURL())
			out := map[string]any{"ok": err == nil, "url": base, "models": models}
			if err != nil {
				out["models"] = []classroom.LocalModel{}
				out["error"] = "Ollama 가 켜져 있지 않아요. 작업 표시줄에서 Ollama 를 켜 주세요."
			}
			reply(w, out)
		case p == aiAPI+"/ask" && r.Method == http.MethodPost:
			var in struct {
				Text    string               `json:"text"`
				Model   string               `json:"model"`
				Context classroom.LLMContext `json:"context"`
			}
			if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&in); err != nil {
				replyError(w, http.StatusBadRequest, "요청을 읽지 못했어요.")
				return
			}
			if !aiBusy.TryLock() {
				replyError(w, http.StatusTooManyRequests, "앞의 질문에 답하는 중이에요. 잠시 뒤에 다시 보내 주세요.")
				return
			}
			defer aiBusy.Unlock()
			ctx, cancel := context.WithTimeout(r.Context(), 160*time.Second)
			defer cancel()
			a, err := classroom.AskOllama(ctx, ollamaURL(), in.Model, in.Text, in.Context)
			switch {
			case classroom.IsBadInput(err):
				replyError(w, http.StatusBadRequest, strings.TrimPrefix(err.Error(), "bad input: "))
			case err != nil:
				replyError(w, http.StatusBadGateway, "AI 에게 답을 받지 못했어요. Ollama 가 켜져 있는지 보고 다시 보내 주세요.")
			default:
				reply(w, map[string]any{"ok": a.OK, "lines": a.Lines, "explain": a.Explain})
			}
		default:
			replyError(w, http.StatusNotFound, "없는 주소예요.")
		}
	})
}
