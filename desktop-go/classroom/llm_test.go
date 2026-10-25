package classroom

import (
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
