package classroom

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeClaude: a stand-in for the Messages API. It records each request and answers with `reply` (the
// JSON text Claude would write), or with an HTTP error when status is set.
type fakeClaude struct {
	mu     sync.Mutex
	reqs   []map[string]any
	keys   []string
	reply  string
	stop   string
	status int
}

func (f *fakeClaude) server(t *testing.T) *httptest.Server {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			http.NotFound(w, r)
			return
		}
		b, _ := io.ReadAll(r.Body)
		var req map[string]any
		_ = json.Unmarshal(b, &req)
		f.mu.Lock()
		f.reqs = append(f.reqs, req)
		f.keys = append(f.keys, r.Header.Get("X-Api-Key"))
		reply, stop, status := f.reply, f.stop, f.status
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if status != 0 {
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}`))
			return
		}
		if stop == "" {
			stop = "end_turn"
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "msg_test", "type": "message", "role": "assistant", "model": req["model"],
			"content":     []map[string]any{{"type": "text", "text": reply}},
			"stop_reason": stop, "stop_sequence": nil,
			"usage": map[string]any{"input_tokens": 120, "output_tokens": 60, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 2400},
		})
	}))
	t.Cleanup(ts.Close)
	return ts
}

func (f *fakeClaude) last() (map[string]any, string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.reqs[len(f.reqs)-1], f.keys[len(f.keys)-1]
}

var testContext = map[string]any{
	"arm": "myCobot 280 RDK X5", "joints": 6, "tool": "어댑티브 그리퍼", "toolKind": "grip",
	"places": []string{"빨강 블록", "노랑 블록", "초록 블록", "파랑 블록", "자리 1", "자리 2", "자리 3", "자리 4"},
}

func TestLLMAskThroughTheSDK(t *testing.T) {
	e := newEnv(t)
	f := &fakeClaude{reply: `{"ok":true,"lines":["from edu import robot","robot.home()","robot.pick_place(\"빨강 블록\", \"자리 1\")","robot.home()"],"explain":"빨간 블록을 1번 자리에 옮겨요."}`}
	e.srv.SetLLMCaller(ClaudeCaller(f.server(t).URL))
	op := e.operator()
	c := e.class(op, 2)
	st := e.student(c, 1)
	ask := map[string]any{"text": "빨간 블록 집어서 1번 자리에 놔", "context": testContext}

	// Off until a key is set and it is turned on; a teacher cannot set the key.
	e.must(e.do("POST", "/llm/ask", st, ask), 503)
	r := e.must(e.do("GET", "/llm", st, nil), 200)
	if r.body["available"] != false {
		t.Fatalf("available before setup: %v", r.body)
	}
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"enabled": true}), 400)
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"apiKey": "not-a-key"}), 400)
	tch := e.teacher(op, "kim")
	e.must(e.do("PUT", "/llm/settings", tch, map[string]any{"apiKey": "sk-ant-api03-teacher"}), 403)
	r = e.must(e.do("PUT", "/llm/settings", op, map[string]any{"apiKey": "sk-ant-api03-secret-key-0000", "enabled": true, "daily": 3}), 200)
	if r.body["keySet"] != true || strings.Contains(string(r.raw), "secret-key") || r.body["model"] != "claude-haiku-5-5" {
		t.Fatalf("settings view: %s", r.raw)
	}
	e.must(e.do("GET", "/llm/settings", st, nil), 403)

	// A question: the server's instructions, cached; the answer format; the student's words in their tag.
	r = e.must(e.do("POST", "/llm/ask", st, ask), 200)
	if r.body["ok"] != true || len(r.body["lines"].([]any)) != 4 || r.body["remaining"].(float64) != 2 {
		t.Fatalf("answer: %s", r.raw)
	}
	req, key := f.last()
	if key != "sk-ant-api03-secret-key-0000" || req["model"] != "claude-haiku-5-5" {
		t.Fatalf("request: key %q model %v", key, req["model"])
	}
	sys := req["system"].([]any)[0].(map[string]any)
	if !strings.Contains(sys["text"].(string), "robot.pick_place") || sys["cache_control"] == nil {
		t.Fatalf("system: %v", sys)
	}
	oc := req["output_config"].(map[string]any)
	if oc["format"].(map[string]any)["type"] != "json_schema" || oc["effort"] != "low" {
		t.Fatalf("output_config: %v", oc)
	}
	user := req["messages"].([]any)[0].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
	if !strings.Contains(user, "<student>\n빨간 블록 집어서 1번 자리에 놔\n</student>") || !strings.Contains(user, "places: 빨강 블록,") {
		t.Fatalf("user turn: %s", user)
	}

	// Too soon again, then the daily limit; the 3 s gap passes on the server's clock.
	e.must(e.do("POST", "/llm/ask", st, ask), 429)
	for i := 0; i < 2; i++ {
		e.clk.add(4 * time.Second)
		e.must(e.do("POST", "/llm/ask", st, ask), 200)
	}
	e.clk.add(4 * time.Second)
	r = e.must(e.do("POST", "/llm/ask", st, ask), 429)
	if r.body["error"] != "daily" {
		t.Fatalf("daily: %s", r.raw)
	}
	// Another student has their own count; a new day starts again.
	st2 := e.student(c, 2)
	e.must(e.do("POST", "/llm/ask", st2, ask), 200)
	e.clk.add(24 * time.Hour)
	st, st2 = e.student(c, 1), e.student(c, 2) // the sessions of yesterday have ended
	e.must(e.do("POST", "/llm/ask", st, ask), 200)

	// The answer is put into the editor: the teacher's log shows it, with the words and the lines.
	r = e.must(e.do("POST", "/llm/ask", st2, map[string]any{"text": "노란 블록 위로", "context": testContext}), 200)
	id := r.body["id"]
	e.must(e.do("POST", "/llm/ask/"+id.(string)+"/inserted", st2, nil), 200)
	e.must(e.do("POST", "/llm/ask/nope/inserted", st2, nil), 400)
	op = e.must(e.do("POST", "/login/teacher", "", map[string]string{"username": "admin", "password": "operator-pass-1"}), 200).body["token"].(string)
	tch = e.must(e.do("POST", "/login/teacher", "", map[string]string{"username": "kim", "password": "teacher-pass-1"}), 200).body["token"].(string)
	r = e.must(e.do("GET", "/classes/"+c.id+"/llm", op, nil), 200)
	entries := r.body["entries"].([]any)
	if len(entries) != 6 {
		t.Fatalf("log: %d entries: %s", len(entries), r.raw)
	}
	lastEntry := entries[5].(map[string]any)
	if lastEntry["inserted"] != true || lastEntry["no"].(float64) != 2 || lastEntry["text"] != "노란 블록 위로" {
		t.Fatalf("log entry: %v", lastEntry)
	}
	e.must(e.do("GET", "/classes/"+c.id+"/llm", tch, nil), 404) // not the teacher's class
}

func TestLLMRefusesWhatIsNotABlockProgram(t *testing.T) {
	e := newEnv(t)
	f := &fakeClaude{}
	e.srv.SetLLMCaller(ClaudeCaller(f.server(t).URL))
	op := e.operator()
	c := e.class(op, 1)
	st := e.student(c, 1)
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"apiKey": "sk-ant-api03-k", "enabled": true}), 200)
	ask := func(text string) resp {
		e.clk.add(4 * time.Second)
		return e.do("POST", "/llm/ask", st, map[string]any{"text": text, "context": testContext})
	}

	// "Can't" answers come back as they are, with no lines even if some were sent.
	f.reply = `{"ok":false,"lines":["robot.home()"],"explain":"춤은 블록으로 만들 수 없어요."}`
	r := e.must(ask("춤춰 줘"), 200)
	if r.body["ok"] != false || r.body["lines"] != nil || r.body["explain"] != "춤은 블록으로 만들 수 없어요." {
		t.Fatalf("cannot: %s", r.raw)
	}
	// A refusal stop is a polite "can't"; a broken answer, a multi-line "line" or an API error are a 502.
	f.stop = "refusal"
	r = e.must(ask("x"), 200)
	if r.body["ok"] != false {
		t.Fatalf("refusal: %s", r.raw)
	}
	f.stop = ""
	for _, bad := range []string{`not json`, `{"ok":true,"lines":[],"explain":""}`, `{"ok":true,"lines":["robot.home()\nimport os"],"explain":""}`} {
		f.reply = bad
		e.must(ask("x"), 502)
	}
	f.status = 401
	e.must(ask("x"), 502)

	// Input limits: a very long sentence, a place name with a quote, a long program.
	f.status = 0
	e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": strings.Repeat("가", 201), "context": testContext}), 400)
	bad := map[string]any{"arm": "a", "joints": 6, "tool": "t", "toolKind": "grip", "places": []string{`빨강" 블록`}}
	e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": "x", "context": bad}), 400)
	bad = map[string]any{"arm": "a", "joints": 6, "program": strings.Repeat("robot.home()\n", 200)}
	e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": "x", "context": bad}), 400)

	// Turned off by the teacher: closed at once.
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"enabled": false}), 200)
	e.must(ask("x"), 503)
}

// fakeOllama: a stand-in for Ollama's /api/tags and /api/chat.
type fakeOllama struct {
	mu      sync.Mutex
	reqs    []map[string]any
	reply   string
	noThink bool // answer 400 to the "think" switch, like an Ollama that does not know it
}

func (f *fakeOllama) server(t *testing.T) *httptest.Server {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/tags":
			_, _ = w.Write([]byte(`{"models":[{"name":"qwen3:8b","size":5200000000,"details":{"parameter_size":"8.2B"}},{"name":"bad name;rm","size":1}]}`))
		case "/api/chat":
			var req map[string]any
			_ = json.NewDecoder(r.Body).Decode(&req)
			f.mu.Lock()
			f.reqs = append(f.reqs, req)
			reply, noThink := f.reply, f.noThink
			f.mu.Unlock()
			if _, has := req["think"]; has && noThink {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":"think value \"false\" is not supported for this model"}`))
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"model": req["model"], "done": true, "done_reason": "stop",
				"message":           map[string]any{"role": "assistant", "content": reply},
				"prompt_eval_count": 2600, "eval_count": 70,
			})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(ts.Close)
	return ts
}

func TestLLMOllamaOnThisPC(t *testing.T) {
	e := newEnv(t)
	f := &fakeOllama{reply: `{"ok":true,"lines":["from edu import robot","robot.home()","robot.pick_place(\"빨강 블록\", \"자리 1\")"],"explain":"빨간 블록을 1번 자리에 옮겨요."}`}
	ts := f.server(t)
	op := e.operator()
	c := e.class(op, 1)
	st := e.student(c, 1)
	tch := e.teacher(op, "lee")

	// The operator finds the models at the address; a teacher cannot; a broken address is refused.
	e.must(e.do("GET", "/llm/local-models?url="+ts.URL, tch, nil), 403)
	e.must(e.do("GET", "/llm/local-models?url=ftp://x", op, nil), 400)
	r := e.must(e.do("GET", "/llm/local-models?url="+ts.URL, op, nil), 200)
	models := r.body["models"].([]any)
	if len(models) != 1 || models[0].(map[string]any)["name"] != "qwen3:8b" {
		t.Fatalf("models: %s", r.raw)
	}
	e.must(e.do("GET", "/llm/local-models?url=http://127.0.0.1:1", op, nil), 502)

	// Ollama chosen: no key needed, but a model is.
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"provider": "ollama", "ollamaUrl": ts.URL, "enabled": true}), 400)
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"provider": "ollama", "ollamaModel": "qwen3:8b; rm"}), 400)
	e.must(e.do("PUT", "/llm/settings", tch, map[string]any{"provider": "ollama"}), 403)
	r = e.must(e.do("PUT", "/llm/settings", op, map[string]any{"provider": "ollama", "ollamaUrl": ts.URL + "/", "ollamaModel": "qwen3:8b", "enabled": true}), 200)
	if r.body["provider"] != "ollama" || r.body["ready"] != true || r.body["ollamaUrl"] != ts.URL || r.body["keySet"] != false {
		t.Fatalf("settings: %s", r.raw)
	}
	if e.must(e.do("GET", "/llm", st, nil), 200).body["available"] != true {
		t.Fatal("not available to the student")
	}

	// A question: the same instructions and answer shape, thinking off.
	r = e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": "빨간 블록 집어서 1번 자리에 놔", "context": testContext}), 200)
	if r.body["ok"] != true || len(r.body["lines"].([]any)) != 3 {
		t.Fatalf("answer: %s", r.raw)
	}
	f.mu.Lock()
	req := f.reqs[0]
	f.mu.Unlock()
	msgs := req["messages"].([]any)
	if req["model"] != "qwen3:8b" || req["stream"] != false || req["think"] != false || req["format"].(map[string]any)["type"] != "object" ||
		!strings.Contains(msgs[0].(map[string]any)["content"].(string), "robot.pick_place") ||
		!strings.Contains(msgs[1].(map[string]any)["content"].(string), "<student>\n빨간 블록") {
		t.Fatalf("request: %v", req)
	}

	// An Ollama that does not take the thinking switch: asked again without it.
	f.mu.Lock()
	f.noThink = true
	f.mu.Unlock()
	e.clk.add(4 * time.Second)
	e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": "다시", "context": testContext}), 200)

	// An answer that is not the agreed JSON is a 502.
	f.mu.Lock()
	f.reply = `not json`
	f.mu.Unlock()
	e.clk.add(4 * time.Second)
	e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": "x", "context": testContext}), 502)

	// The log names the local model; back to Claude without a key: closed.
	entries := e.must(e.do("GET", "/classes/"+c.id+"/llm", op, nil), 200).body["entries"].([]any)
	if entries[0].(map[string]any)["model"] != "ollama:qwen3:8b" {
		t.Fatalf("log: %v", entries[0])
	}
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"provider": "claude"}), 400)
	e.must(e.do("PUT", "/llm/settings", op, map[string]any{"provider": "claude", "enabled": false}), 200)
	e.clk.add(4 * time.Second)
	e.must(e.do("POST", "/llm/ask", st, map[string]any{"text": "x", "context": testContext}), 503)
}

// AI 버튼: the scene and the conversation reach the model inside the situation; the answer says what to
// do with it (do, blocks, talk), and an answer in words needs no lines.
func TestLLMModesSceneHistory(t *testing.T) {
	f := &fakeOllama{reply: `{"ok":true,"mode":"talk","lines":[],"explain":"블록이 로봇에 너무 가까워서 J3 를 거의 끝까지 접었어요."}`}
	ts := f.server(t)
	ctx := LLMContext{Arm: "myCobot 280 RDK X5", Joints: 6, Tool: "어댑티브 그리퍼", ToolKind: "grip", Places: []string{"빨강 블록"},
		Scene:   "tool tip now: x 135, y -25, z 13\njoints now: J3 -148.6° (1° from its limit)",
		History: "student: 빨간 블록 집어봐\nyou moved the arm: 집었어요\nrun: 끝까지 움직였어요; J3 한계까지 1°"}
	a, err := AskOllama(context.Background(), ts.URL, "qwen3:8b", "J3 에 무리가 가는데?", ctx)
	if err != nil || !a.OK || a.Mode != LLMModeTalk || len(a.Lines) != 0 {
		t.Fatalf("talk: %+v %v", a, err)
	}
	f.mu.Lock()
	user := f.reqs[0]["messages"].([]any)[1].(map[string]any)["content"].(string)
	schema := f.reqs[0]["format"].(map[string]any)
	f.mu.Unlock()
	scene, conv, student := strings.Index(user, "scene now:\ntool tip now"), strings.Index(user, "conversation so far (oldest first):\nstudent: 빨간"), strings.Index(user, "</situation>\n<student>")
	if scene < 0 || conv < scene || student < conv {
		t.Fatalf("situation: %s", user)
	}
	if req := schema["required"].([]any); len(req) != 4 || req[1] != "mode" {
		t.Fatalf("schema: %v", schema)
	}

	// A model that leaves the mode out: lines are a program, no lines an answer in words.
	for reply, want := range map[string]string{
		`{"ok":true,"lines":["from edu import robot","robot.home()"],"explain":"가요."}`:   LLMModeBlocks,
		`{"ok":true,"lines":[],"explain":"25cm 쯤이에요."}`:                                  LLMModeTalk,
		`{"ok":true,"mode":"dance","lines":["robot.home()"],"explain":"가요."}`:            LLMModeBlocks,
		`{"ok":true,"mode":"do","lines":["robot.move_to(160, 0, 90)"],"explain":"올려요."}`: LLMModeDo,
	} {
		f.mu.Lock()
		f.reply = reply
		f.mu.Unlock()
		if a, err := AskOllama(context.Background(), ts.URL, "qwen3:8b", "x", ctx); err != nil || a.Mode != want {
			t.Fatalf("%s → %+v %v", reply, a, err)
		}
	}
	// Lines promised for a program but none given: still an error.
	f.mu.Lock()
	f.reply = `{"ok":true,"mode":"do","lines":[],"explain":"가요."}`
	f.mu.Unlock()
	if _, err := AskOllama(context.Background(), ts.URL, "qwen3:8b", "x", ctx); err == nil {
		t.Fatal("do without lines accepted")
	}
	// A scene or conversation longer than the limits is refused before anything is asked.
	long := ctx
	long.Scene = strings.Repeat("x", llmMaxScene+1)
	if _, err := AskOllama(context.Background(), ts.URL, "qwen3:8b", "x", long); !IsBadInput(err) {
		t.Fatalf("long scene: %v", err)
	}
	long = ctx
	long.History = strings.Repeat("가", llmMaxHistory+1)
	if _, err := AskOllama(context.Background(), ts.URL, "qwen3:8b", "x", long); !IsBadInput(err) {
		t.Fatalf("long history: %v", err)
	}
}
