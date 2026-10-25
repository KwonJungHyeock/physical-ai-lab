package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The AI button's way to Ollama on this PC: only for this PC's own page, models listed, a question
// answered in the agreed shape, Ollama switched off told in plain words.
func TestLocalAI(t *testing.T) {
	var asked map[string]any
	ollama := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/tags":
			_, _ = w.Write([]byte(`{"models":[{"name":"qwen3:8b","size":5200000000,"details":{"parameter_size":"8.2B"}}]}`))
		case "/api/chat":
			_ = json.NewDecoder(r.Body).Decode(&asked)
			content, _ := json.Marshal(map[string]any{"ok": true, "lines": []string{"from edu import robot", "robot.home()"}, "explain": "처음 자세로 가요."})
			_ = json.NewEncoder(w).Encode(map[string]any{"done": true, "done_reason": "stop", "message": map[string]any{"role": "assistant", "content": string(content)}})
		}
	}))
	defer ollama.Close()
	t.Setenv("PAI_OLLAMA_URL", ollama.URL)
	h := aiHandler(http.NotFoundHandler())
	call := func(method, url, body string, local bool) (int, map[string]any) {
		r := httptest.NewRequest(method, url, strings.NewReader(body))
		r.Host = "127.0.0.1:47280"
		r.RemoteAddr = "127.0.0.1:50000"
		if local {
			r.Header.Set("X-Physical-AI", "1")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}

	if code, _ := call("GET", aiAPI, "", false); code != http.StatusForbidden {
		t.Fatalf("no header: %d", code)
	}
	code, st := call("GET", aiAPI, "", true)
	if code != 200 || st["ok"] != true || st["models"].([]any)[0].(map[string]any)["name"] != "qwen3:8b" {
		t.Fatalf("status %d %v", code, st)
	}
	ctx := `{"arm":"myCobot 280 RDK X5","joints":6,"tool":"어댑티브 그리퍼","toolKind":"grip","places":["빨강 블록","자리 1"]}`
	code, a := call("POST", aiAPI+"/ask", `{"text":"처음 자세로 가","model":"qwen3:8b","context":`+ctx+`}`, true)
	if code != 200 || a["ok"] != true || len(a["lines"].([]any)) != 2 {
		t.Fatalf("ask %d %v", code, a)
	}
	if asked["model"] != "qwen3:8b" || asked["think"] != false {
		t.Fatalf("asked %v", asked)
	}
	if code, _ := call("POST", aiAPI+"/ask", `{"text":"","model":"qwen3:8b","context":`+ctx+`}`, true); code != 400 {
		t.Fatalf("empty text: %d", code)
	}
	if code, _ := call("POST", aiAPI+"/ask", `{"text":"x","model":"a b","context":`+ctx+`}`, true); code != 400 {
		t.Fatalf("bad model: %d", code)
	}

	// Ollama switched off: a plain message, no models.
	t.Setenv("PAI_OLLAMA_URL", "http://127.0.0.1:1")
	code, st = call("GET", aiAPI, "", true)
	if code != 200 || st["ok"] != false || len(st["models"].([]any)) != 0 || !strings.Contains(st["error"].(string), "Ollama") {
		t.Fatalf("off %d %v", code, st)
	}
	if code, _ := call("POST", aiAPI+"/ask", `{"text":"x","model":"qwen3:8b","context":`+ctx+`}`, true); code != http.StatusBadGateway {
		t.Fatalf("ask while off: %d", code)
	}
}
