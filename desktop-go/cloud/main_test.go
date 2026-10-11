package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"physical-ai-lab/desktop/classroom"
)

func stmt(id, actor, class string) classroom.Statement {
	return classroom.Statement{
		ID:        id,
		Actor:     &classroom.Actor{ObjectType: "Agent", Account: classroom.Account{HomePage: "urn:robocity:server:0123456789abcdef", Name: actor}},
		Verb:      classroom.Verb{ID: "http://adlnet.gov/expapi/verbs/experienced"},
		Object:    classroom.Object{ObjectType: "Activity", ID: "urn:robocity:lesson:1-1"},
		Context:   &classroom.Context{Extensions: map[string]any{classroom.ExtClass: class}},
		Timestamp: "2026-10-12T01:00:00Z",
	}
}

func post(t *testing.T, h http.Handler, key string, p classroom.SyncPayload) (int, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(p)
	req := httptest.NewRequest("POST", "/v1/sync", bytes.NewReader(b))
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestReceiver(t *testing.T) {
	dir := t.TempDir()
	rc, err := newReceiver(dir, parseKeys("school-a:key-aaaaaaaaaaaaaaaa, school-b:key-bbbbbbbbbbbbbbbb"))
	if err != nil {
		t.Fatal(err)
	}
	a1, a2, cls := "aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbb", "cccccccccccccccc"
	p := classroom.SyncPayload{Kind: "robocity-sync", Version: 1, Server: "0123456789abcdef", Batch: "b-1",
		Statements: []classroom.Statement{stmt("s1", a1, cls), stmt("s2", a2, cls)}}
	if code, _ := post(t, rc, "", p); code != 401 {
		t.Fatalf("no key: %d", code)
	}
	if code, _ := post(t, rc, "key-wrong-wrong-wrong", p); code != 401 {
		t.Fatalf("wrong key: %d", code)
	}
	if code, out := post(t, rc, "key-aaaaaaaaaaaaaaaa", p); code != 200 || out["stored"] != 2.0 {
		t.Fatalf("store: %d %v", code, out)
	}
	if code, out := post(t, rc, "key-aaaaaaaaaaaaaaaa", p); code != 200 || out["stored"] != 0.0 {
		t.Fatalf("resent batch stored again: %d %v", code, out)
	}
	// A statement that is not pseudonymised is refused.
	bad := p
	bad.Batch = "b-2"
	bad.Statements = []classroom.Statement{stmt("s3", "2학년3반-7", cls)}
	if code, _ := post(t, rc, "key-aaaaaaaaaaaaaaaa", bad); code != 400 {
		t.Fatalf("named actor: %d", code)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "school-a", "0123456789abcdef", "statements-*.jsonl"))
	if len(files) != 1 {
		t.Fatalf("files %v", files)
	}
	b, _ := os.ReadFile(files[0])
	if strings.Count(string(b), "\n") != 2 {
		t.Fatalf("stored: %s", b)
	}
	// Erase one student.
	del := classroom.SyncPayload{Kind: "robocity-delete", Version: 1, Server: "0123456789abcdef", Batch: "d-1",
		Deletes: []classroom.DeleteRequest{{Class: cls, Student: a1}}}
	if code, out := post(t, rc, "key-aaaaaaaaaaaaaaaa", del); code != 200 || out["stored"] != 1.0 {
		t.Fatalf("erase: %d %v", code, out)
	}
	b, _ = os.ReadFile(files[0])
	if strings.Contains(string(b), a1) || !strings.Contains(string(b), a2) {
		t.Fatalf("after erase: %s", b)
	}
	if _, err := os.Stat(filepath.Join(dir, "school-a", "deletions.jsonl")); err != nil {
		t.Fatal("erasure not logged")
	}
	// Tenants are apart: school-b sees nothing of school-a.
	if _, err := os.Stat(filepath.Join(dir, "school-b")); !os.IsNotExist(err) {
		t.Fatal("school-b folder")
	}
}

// End to end: a real class server's sync worker sending to this receiver.
func TestFromClassServer(t *testing.T) {
	store, err := classroom.Open(t.TempDir(), nil)
	if err != nil {
		t.Fatal(err)
	}
	api := classroom.LANOnly(classroom.NewServer(store, nil).Handler())
	call := func(method, path, token, remote string, body any) map[string]any {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(method, classroom.APIPrefix+path, bytes.NewReader(b))
		req.Host, req.RemoteAddr = "127.0.0.1:47290", remote
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		api.ServeHTTP(w, req)
		if w.Code/100 != 2 {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body)
		}
		var out map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &out)
		return out
	}
	lo := "127.0.0.1:1"
	op := call("POST", "/setup", "", lo, map[string]string{"username": "admin", "password": "operator-pass-1"})["token"].(string)
	cls := call("POST", "/classes", op, lo, map[string]string{"name": "1반"})
	id, code := cls["id"].(string), cls["code"].(string)
	pin := call("POST", "/classes/"+id+"/students", op, lo, map[string]int{"count": 1})["issued"].([]any)[0].(map[string]any)["pin"]
	st := call("POST", "/login/student", "", "192.168.0.5:1", map[string]any{"classCode": code, "no": 1, "pin": pin})["token"].(string)
	call("POST", "/events", st, "192.168.0.5:1", map[string]any{"statements": []any{map[string]any{
		"id": "00000001-0000-4000-8000-000000000001", "verb": map[string]string{"id": "http://adlnet.gov/expapi/verbs/passed"},
		"object": map[string]string{"id": "urn:robocity:site:farm:problem:1"}, "timestamp": time.Now().UTC().Format(time.RFC3339),
		"result": map[string]any{"success": true, "score": map[string]float64{"scaled": 0.8}},
	}}})

	dir := t.TempDir()
	rc, _ := newReceiver(dir, map[string]string{"school-a": "key-aaaaaaaaaaaaaaaa"})
	cloud := httptest.NewServer(rc)
	defer cloud.Close()
	call("PUT", "/sync", op, lo, map[string]any{"enabled": true, "url": cloud.URL + "/v1/sync", "apiKey": "key-aaaaaaaaaaaaaaaa"})
	if err := classroom.NewSyncer(store, cloud.Client()).RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	files, _ := filepath.Glob(filepath.Join(dir, "school-a", store.ServerID(), "statements-*.jsonl"))
	if len(files) != 1 {
		t.Fatalf("nothing stored: %v", files)
	}
	b, _ := os.ReadFile(files[0])
	if !strings.Contains(string(b), "farm:problem:1") || strings.Contains(string(b), code) {
		t.Fatalf("stored: %s", b)
	}
}
