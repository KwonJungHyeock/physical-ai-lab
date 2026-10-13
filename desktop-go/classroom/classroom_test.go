package classroom

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

/* --- hashing ------------------------------------------------------------------------------------- */

// The same vectors are checked by web-typescript/tests/account/account-check.mts (WebCrypto) and were
// cross-checked with Python's hashlib.pbkdf2_hmac.
var hashVectors = []struct {
	secret, pepper, want string
}{
	{"4821", "", "pbkdf2-sha256$1000$AAECAwQFBgcICQoLDA0ODw$Z6JOy8PjhRTmSedeSHtn7HxPh52Qj1lcDGYj1Pc79cU"},
	{"4821", "pepper-for-test-0123456789abcdef", "pbkdf2-sha256$1000$AAECAwQFBgcICQoLDA0ODw$KeE2OSwjhcCmuG2XXsEGDXOynxLUUPEdhuHzlJ0s8p8"},
	{"비밀번호-Teacher!", "", "pbkdf2-sha256$1000$AAECAwQFBgcICQoLDA0ODw$R8kAF+RFGYjY2Mo1k5M/Bhuv6CXiqBbvmAb1vTq02k0"},
}

func TestHashVectors(t *testing.T) {
	salt := make([]byte, 16)
	for i := range salt {
		salt[i] = byte(i)
	}
	for _, v := range hashVectors {
		got, err := hashWithSalt(v.secret, []byte(v.pepper), salt, 1000)
		if err != nil || got != v.want {
			t.Fatalf("hash(%q, %q) = %s, %v; want %s", v.secret, v.pepper, got, err, v.want)
		}
		if !VerifySecret(v.want, v.secret, []byte(v.pepper)) {
			t.Fatalf("verify %q failed", v.secret)
		}
	}
}

func TestHashSecret(t *testing.T) {
	pepper := []byte("0123456789abcdef0123456789abcdef")
	h1, _ := HashSecret("1357", pepper, PinIterations)
	h2, _ := HashSecret("1357", pepper, PinIterations)
	if h1 == h2 {
		t.Fatal("same PIN, same hash: salt not random")
	}
	if strings.Contains(h1, "1357") && !strings.HasPrefix(h1, "pbkdf2-sha256$") {
		t.Fatal("format")
	}
	if !VerifySecret(h1, "1357", pepper) || VerifySecret(h1, "1358", pepper) || VerifySecret(h1, "1357", nil) {
		t.Fatal("verify: right PIN, wrong PIN, missing pepper")
	}
	for _, bad := range []string{"", "1357", "md5$1$a$b", "pbkdf2-sha256$10$AAAA$AAAA", "pbkdf2-sha256$1000$***$AAAA", "pbkdf2-sha256$99999999$AAAA$AAAA"} {
		if VerifySecret(bad, "1357", pepper) {
			t.Fatalf("malformed %q verified", bad)
		}
	}
}

func TestNewPIN(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 300; i++ {
		p, err := NewPIN()
		if err != nil || !ValidPIN(p) || weakPIN(p) {
			t.Fatalf("pin %q %v", p, err)
		}
		seen[p] = true
	}
	if len(seen) < 250 {
		t.Fatalf("PINs repeat too often: %d distinct of 300", len(seen))
	}
	for _, w := range []string{"0000", "1234", "9876", "5555"} {
		if !weakPIN(w) {
			t.Fatalf("%s should be weak", w)
		}
	}
	for _, bad := range []string{"123", "12345", "12a4", "１２３４"} {
		if ValidPIN(bad) {
			t.Fatalf("%q valid", bad)
		}
	}
}

/* --- test server --------------------------------------------------------------------------------- */

type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *clock) add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

type env struct {
	t     *testing.T
	dir   string
	clk   *clock
	store *Store
	srv   *Server
	h     http.Handler
}

func newEnv(t *testing.T) *env {
	t.Helper()
	e := &env{t: t, dir: t.TempDir(), clk: &clock{t: time.Date(2026, 10, 12, 1, 0, 0, 0, time.UTC)}}
	e.open()
	return e
}

func (e *env) open() {
	s, err := Open(e.dir, e.clk.now)
	if err != nil {
		e.t.Fatal(err)
	}
	e.store = s
	e.srv = NewServer(s, nil)
	e.srv.Logf = nil
	e.h = LANOnly(e.srv.Handler())
}

type resp struct {
	status int
	body   map[string]any
	raw    []byte
	header http.Header
}

// do: a request from remote (default a student PC on the LAN) to the server's LAN address.
func (e *env) do(method, path, token string, body any, remote ...string) resp {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, APIPrefix+path, rd)
	req.Host = "192.168.0.10:47290"
	req.RemoteAddr = "192.168.0.23:50000"
	if len(remote) > 0 {
		req.RemoteAddr = remote[0]
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	r := resp{status: w.Code, raw: w.Body.Bytes(), header: w.Header()}
	_ = json.Unmarshal(r.raw, &r.body)
	return r
}

func (e *env) must(r resp, status int) resp {
	e.t.Helper()
	if r.status != status {
		e.t.Fatalf("status %d, want %d: %s", r.status, status, r.raw)
	}
	return r
}

const local = "127.0.0.1:50000"

// operator: setup on a fresh server; returns the operator's token.
func (e *env) operator() string {
	r := e.must(e.do("POST", "/setup", "", map[string]string{"username": "admin", "password": "operator-pass-1"}, local), 200)
	return r.body["token"].(string)
}

func (e *env) teacher(op, name string) string {
	e.must(e.do("POST", "/teachers", op, map[string]string{"username": name, "password": "teacher-pass-1"}), 201)
	r := e.must(e.do("POST", "/login/teacher", "", map[string]string{"username": name, "password": "teacher-pass-1"}), 200)
	return r.body["token"].(string)
}

type classOut struct {
	id, code string
	pins     map[int]string
}

func (e *env) class(tok string, n int) classOut {
	r := e.must(e.do("POST", "/classes", tok, map[string]string{"name": "2학년 3반"}), 201)
	c := classOut{id: r.body["id"].(string), code: r.body["code"].(string), pins: map[int]string{}}
	r = e.must(e.do("POST", "/classes/"+c.id+"/students", tok, map[string]int{"count": n}), 201)
	for _, x := range r.body["issued"].([]any) {
		m := x.(map[string]any)
		c.pins[int(m["no"].(float64))] = m["pin"].(string)
	}
	return c
}

func (e *env) student(c classOut, no int) string {
	r := e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": strings.ToLower(c.code), "no": no, "pin": c.pins[no]}), 200)
	return r.body["token"].(string)
}

func uuid(n int) string { return fmt.Sprintf("%08x-0000-4000-8000-%012x", n, n) }

func (e *env) stmt(n int, verb, obj string, extra map[string]any) map[string]any {
	m := map[string]any{
		"id": uuid(n), "verb": map[string]string{"id": verb},
		"object":    map[string]any{"objectType": "Activity", "id": obj},
		"timestamp": e.clk.now().Format(time.RFC3339),
	}
	for k, v := range extra {
		m[k] = v
	}
	return m
}

func wrongPIN(p string) string {
	if p == "9999" {
		return "9998"
	}
	return "9999"
}

/* --- setup and login ----------------------------------------------------------------------------- */

func TestSetupOnlyHereAndOnce(t *testing.T) {
	e := newEnv(t)
	if r := e.do("GET", "/status", "", nil); r.body["needsSetup"] != true || fmt.Sprint(r.body["addresses"]) != "[]" {
		t.Fatalf("fresh server: %s", r.raw)
	}
	e.srv.Addresses = func() []string { return []string{"http://192.168.0.10:47290"} }
	if r := e.do("GET", "/status", "", nil); fmt.Sprint(r.body["addresses"]) != "[http://192.168.0.10:47290]" {
		t.Fatalf("addresses: %s", r.raw)
	}
	e.must(e.do("POST", "/setup", "", map[string]string{"username": "admin", "password": "operator-pass-1"}), 403)
	e.must(e.do("POST", "/setup", "", map[string]string{"username": "admin", "password": "short"}, local), 400)
	op := e.operator()
	e.must(e.do("POST", "/setup", "", map[string]string{"username": "admin2", "password": "operator-pass-2"}, local), 409)
	if r := e.must(e.do("GET", "/me", op, nil), 200); r.body["role"] != "operator" {
		t.Fatalf("me: %s", r.raw)
	}
	b, _ := os.ReadFile(filepath.Join(e.dir, "db.json"))
	if bytes.Contains(b, []byte("operator-pass-1")) {
		t.Fatal("password in db.json")
	}
}

func TestStudentLoginAndRateLimit(t *testing.T) {
	e := newEnv(t)
	op := e.operator()
	tch := e.teacher(op, "kim")
	c := e.class(tch, 3)
	if len(c.pins) != 3 || c.pins[1] == "" {
		t.Fatalf("issued: %v", c.pins)
	}
	// db.json keeps only hashes: no "pin" field, every student a pbkdf2 hash.
	b, _ := os.ReadFile(filepath.Join(e.dir, "db.json"))
	if bytes.Contains(b, []byte(`"pin"`)) || bytes.Count(b, []byte(`"pinHash": "pbkdf2-sha256$100000$`)) != 3 {
		t.Fatalf("db.json PINs: %s", b)
	}

	tok := e.student(c, 1)
	r := e.must(e.do("GET", "/me", tok, nil), 200)
	if st := r.body["student"].(map[string]any); st["no"] != 1.0 || st["classCode"] != c.code {
		t.Fatalf("me: %s", r.raw)
	}
	e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 9, "pin": "1357"}), 401)
	e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": "NOPE77", "no": 1, "pin": "1357"}), 401)

	// Five wrong PINs for 번호 2 → locked, even with the right PIN, with Retry-After.
	for i := 0; i < 5; i++ {
		e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 2, "pin": wrongPIN(c.pins[2])}, fmt.Sprintf("192.168.0.%d:1", 50+i)), 401)
	}
	r = e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 2, "pin": c.pins[2]}), 429)
	if r.header.Get("Retry-After") == "" {
		t.Fatal("no Retry-After")
	}
	// The live grid shows the lock; a PIN reset unlocks and invalidates the old PIN.
	live := e.must(e.do("GET", "/classes/"+c.id+"/live", tch, nil), 200)
	if !strings.Contains(string(live.raw), `"locked"`) {
		t.Fatalf("live without lock: %s", live.raw)
	}
	r = e.must(e.do("POST", "/classes/"+c.id+"/students/2/pin", tch, nil), 200)
	old := c.pins[2]
	c.pins[2] = r.body["pin"].(string)
	e.student(c, 2)
	if old != c.pins[2] {
		e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 2, "pin": old}), 401)
	}
	// After the lock time, a key is free again.
	for i := 0; i < 5; i++ {
		e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 3, "pin": wrongPIN(c.pins[3])}, fmt.Sprintf("192.168.0.%d:1", 60+i))
	}
	e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 3, "pin": c.pins[3]}), 429)
	e.clk.add(61 * time.Second)
	e.student(c, 3)
}

func TestIPRateLimit(t *testing.T) {
	e := newEnv(t)
	tch := e.teacher(e.operator(), "kim")
	c := e.class(tch, 1)
	// One PC walking through 번호 1..30 with guesses: the address is locked after 30 failures.
	for i := 0; i < 30; i++ {
		e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": i + 2, "pin": "1357"}), 401)
	}
	e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 1, "pin": c.pins[1]}), 429)
	// Another PC is not affected.
	e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 1, "pin": c.pins[1]}, "192.168.0.99:1"), 200)
}

func TestTeacherLoginLimit(t *testing.T) {
	e := newEnv(t)
	e.teacher(e.operator(), "kim")
	for i := 0; i < 5; i++ {
		e.must(e.do("POST", "/login/teacher", "", map[string]string{"username": "kim", "password": "wrong-password"}), 401)
	}
	e.must(e.do("POST", "/login/teacher", "", map[string]string{"username": "KIM", "password": "teacher-pass-1"}), 429)
}

func TestRoles(t *testing.T) {
	e := newEnv(t)
	op := e.operator()
	a := e.teacher(op, "kim")
	b := e.teacher(op, "lee")
	c := e.class(a, 2)
	st := e.student(c, 1)

	e.must(e.do("GET", "/classes", st, nil), 403)
	e.must(e.do("POST", "/teachers", a, map[string]string{"username": "x-teacher", "password": "teacher-pass-1"}), 403)
	e.must(e.do("POST", "/events", a, map[string]any{"statements": []any{}}), 403)
	e.must(e.do("GET", "/classes/"+c.id, b, nil), 404)
	e.must(e.do("GET", "/classes/"+c.id+"/events", b, nil), 404)
	e.must(e.do("POST", "/classes/"+c.id+"/students", b, map[string]int{"count": 1}), 404)
	e.must(e.do("GET", "/classes/"+c.id, op, nil), 200)
	if r := e.must(e.do("GET", "/classes", b, nil), 200); len(r.body["classes"].([]any)) != 0 {
		t.Fatal("teacher sees another teacher's class")
	}
	e.must(e.do("GET", "/classes", "nonsense", nil), 401)
	e.must(e.do("GET", "/sync", a, nil), 403)

	// Disabling a teacher ends the teacher's sessions.
	var id string
	for _, u := range e.must(e.do("GET", "/teachers", op, nil), 200).body["users"].([]any) {
		if m := u.(map[string]any); m["username"] == "lee" {
			id = m["id"].(string)
		}
	}
	e.must(e.do("POST", "/teachers/"+id, op, map[string]any{"disabled": true}), 200)
	e.must(e.do("GET", "/classes", b, nil), 401)
	e.must(e.do("POST", "/login/teacher", "", map[string]string{"username": "lee", "password": "teacher-pass-1"}), 401)
}

/* --- events, live, export ------------------------------------------------------------------------ */

func TestIngestAndLive(t *testing.T) {
	e := newEnv(t)
	tch := e.teacher(e.operator(), "kim")
	c := e.class(tch, 3)
	s1 := e.student(c, 1)
	s2 := e.student(c, 2)
	prob := "urn:robocity:site:factory:problem:2"
	spoof := map[string]any{"actor": map[string]any{"objectType": "Agent", "account": map[string]string{"homePage": "x", "name": "someone-else"}}}
	batch := []any{
		e.stmt(1, adl+"experienced", "urn:robocity:lesson:1-2:page:concept", spoof),
		e.stmt(2, adl+"failed", prob, map[string]any{"result": map[string]any{"success": false}}),
		e.stmt(3, adl+"failed", prob, nil),
		e.stmt(4, adl+"failed", prob, nil),
		e.stmt(4, adl+"failed", prob, nil),                          // duplicate in the batch
		e.stmt(5, "http://example.com/verbs/hacked", prob, nil),     // unknown verb
		e.stmt(6, adl+"answered", "https://evil.example/x", nil),    // object id
		map[string]any{"id": uuid(7), "verb": "x", "unknown": true}, // not a statement
	}
	r := e.must(e.do("POST", "/events", s1, map[string]any{"statements": batch}), 200)
	if r.body["accepted"] != 4.0 || r.body["duplicate"] != 1.0 || len(r.body["rejected"].([]any)) != 3 {
		t.Fatalf("ingest: %s", r.raw)
	}
	for i, want := range []float64{5, 6, 7} {
		if got := r.body["rejected"].([]any)[i].(map[string]any)["i"]; got != want {
			t.Fatalf("rejected index %v, want %v (%s)", got, want, r.raw)
		}
	}
	// Sent again (a lost reply): all duplicates, and "rejected" is an empty list (not null).
	r = e.must(e.do("POST", "/events", s1, map[string]any{"statements": batch[:4]}), 200)
	if r.body["accepted"] != 0.0 || r.body["duplicate"] != 4.0 || !bytes.Contains(r.raw, []byte(`"rejected":[]`)) {
		t.Fatalf("resend: %s", r.raw)
	}

	ev := e.must(e.do("GET", "/classes/"+c.id+"/events?after=0", tch, nil), 200)
	sts := ev.body["statements"].([]any)
	if len(sts) != 4 || ev.body["last"] != 4.0 {
		t.Fatalf("events: %s", ev.raw)
	}
	first := sts[0].(map[string]any)
	if name := first["actor"].(map[string]any)["account"].(map[string]any)["name"]; name != c.code+"-1" {
		t.Fatalf("actor not from the session: %v", name)
	}
	if ev2 := e.must(e.do("GET", "/classes/"+c.id+"/events?after=3", tch, nil), 200); len(ev2.body["statements"].([]any)) != 1 {
		t.Fatalf("after=3: %s", ev2.raw)
	}

	rows := func() map[float64]map[string]any {
		out := map[float64]map[string]any{}
		for _, x := range e.must(e.do("GET", "/classes/"+c.id+"/live", tch, nil), 200).body["students"].([]any) {
			m := x.(map[string]any)
			out[m["no"].(float64)] = m
		}
		return out
	}
	g := rows()
	if !strings.Contains(fmt.Sprint(g[1]["flags"]), "stuck") || g[1]["place"].(map[string]any)["object"] != prob {
		t.Fatalf("student 1: %v", g[1])
	}
	if fmt.Sprint(g[3]["flags"]) != "[never]" {
		t.Fatalf("student 3: %v", g[3])
	}
	if fmt.Sprint(g[2]["flags"]) != "[idle]" { // logged in, nothing done yet
		t.Fatalf("student 2: %v", g[2])
	}
	// A pass clears stuck; 10 quiet minutes → idle; not heard for long → offline.
	e.must(e.do("POST", "/events", s1, map[string]any{"statements": []any{e.stmt(10, adl+"passed", prob, nil)}}), 200)
	e.must(e.do("POST", "/events", s2, map[string]any{"statements": []any{e.stmt(11, adl+"attempted", "urn:robocity:lesson:1-2", nil)}}), 200)
	g = rows()
	if fmt.Sprint(g[1]["flags"]) != "[]" || fmt.Sprint(g[2]["flags"]) != "[]" {
		t.Fatalf("after pass: %v / %v", g[1], g[2])
	}
	e.clk.add(90 * time.Second)
	e.must(e.do("GET", "/me", s2, nil), 200) // heartbeat
	e.clk.add(4 * time.Minute)
	e.must(e.do("GET", "/me", s2, nil), 200)
	g = rows()
	if fmt.Sprint(g[2]["flags"]) != "[idle]" || fmt.Sprint(g[1]["flags"]) != "[offline]" {
		t.Fatalf("idle/offline: %v / %v", g[2]["flags"], g[1]["flags"])
	}

	// Survives a restart: events, sequence, de-duplication, sessions.
	e.open()
	r = e.must(e.do("POST", "/events", s1, map[string]any{"statements": []any{e.stmt(1, adl+"experienced", "urn:robocity:lesson:1-2", nil), e.stmt(12, adl+"completed", "urn:robocity:lesson:1-2", nil)}}), 200)
	if r.body["accepted"] != 1.0 || r.body["duplicate"] != 1.0 {
		t.Fatalf("after restart: %s", r.raw)
	}
	if ev := e.must(e.do("GET", "/classes/"+c.id+"/events?after=5", tch, nil), 200); ev.body["last"] != 7.0 {
		t.Fatalf("seq after restart: %s", ev.raw)
	}
}

func TestBatchLimitsAndArchive(t *testing.T) {
	e := newEnv(t)
	tch := e.teacher(e.operator(), "kim")
	c := e.class(tch, 1)
	s := e.student(c, 1)
	big := make([]any, maxBatch+1)
	for i := range big {
		big[i] = e.stmt(i+1, adl+"experienced", "urn:robocity:lesson:1-1", nil)
	}
	e.must(e.do("POST", "/events", s, map[string]any{"statements": big}), 400)
	long := e.stmt(500, adl+"answered", "urn:robocity:quiz:final:item:3", map[string]any{"result": map[string]any{"response": strings.Repeat("가", 600)}})
	if r := e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{long}}), 200); r.body["accepted"] != 0.0 {
		t.Fatalf("long answer accepted: %s", r.raw)
	}
	old := e.stmt(501, adl+"experienced", "urn:robocity:lesson:1-1", map[string]any{"timestamp": "2020-01-01T00:00:00Z"})
	if r := e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{old}}), 200); r.body["accepted"] != 0.0 {
		t.Fatalf("old timestamp accepted: %s", r.raw)
	}

	// Archive: the student's session ends, logins and events are refused, the teacher still reads.
	e.must(e.do("POST", "/classes/"+c.id+"/archive", tch, map[string]bool{"archived": true}), 200)
	e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{e.stmt(1, adl+"experienced", "urn:robocity:lesson:1-1", nil)}}), 401)
	e.must(e.do("POST", "/login/student", "", map[string]any{"classCode": c.code, "no": 1, "pin": c.pins[1]}), 401)
	e.must(e.do("GET", "/classes/"+c.id+"/export?format=csv", tch, nil), 200)
	// Delete needs the class code typed back.
	e.must(e.do("DELETE", "/classes/"+c.id+"?confirm=WRONG1", tch, nil), 400)
	e.must(e.do("DELETE", "/classes/"+c.id+"?confirm="+strings.ToLower(c.code), tch, nil), 200)
	e.must(e.do("GET", "/classes/"+c.id, tch, nil), 404)
	if _, err := os.Stat(filepath.Join(e.dir, "events", c.id+".jsonl")); !os.IsNotExist(err) {
		t.Fatal("events file left after delete")
	}
}

func TestExportCSV(t *testing.T) {
	e := newEnv(t)
	tch := e.teacher(e.operator(), "kim")
	c := e.class(tch, 1)
	s := e.student(c, 1)
	e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{
		e.stmt(1, adl+"answered", "urn:robocity:quiz:final:item:3", map[string]any{"result": map[string]any{"response": "=HYPERLINK(\"x\")", "success": true}}),
	}}), 200)
	r := e.must(e.do("GET", "/classes/"+c.id+"/export?format=csv", tch, nil), 200)
	if !bytes.HasPrefix(r.raw, []byte("\xEF\xBB\xBF번호,")) {
		t.Fatalf("csv head: %q", r.raw[:20])
	}
	if !bytes.Contains(r.raw, []byte(`"'=HYPERLINK(""x"")"`)) || !bytes.Contains(r.raw, []byte(",O,")) {
		t.Fatalf("csv: %s", r.raw)
	}
	if cd := r.header.Get("Content-Disposition"); !strings.Contains(cd, c.code) {
		t.Fatalf("disposition %q", cd)
	}
	j := e.must(e.do("GET", "/classes/"+c.id+"/export", tch, nil), 200)
	if j.body["kind"] != "robocity-class-export" || bytes.Contains(j.raw, []byte("pinHash")) {
		t.Fatalf("json export: %s", j.raw)
	}
}

func TestRemoveStudentDeletesEvents(t *testing.T) {
	e := newEnv(t)
	tch := e.teacher(e.operator(), "kim")
	c := e.class(tch, 2)
	s1, s2 := e.student(c, 1), e.student(c, 2)
	e.must(e.do("POST", "/events", s1, map[string]any{"statements": []any{e.stmt(1, adl+"experienced", "urn:robocity:lesson:1-1", nil)}}), 200)
	e.must(e.do("POST", "/events", s2, map[string]any{"statements": []any{e.stmt(2, adl+"experienced", "urn:robocity:lesson:1-1", nil)}}), 200)
	e.must(e.do("DELETE", "/classes/"+c.id+"/students/1", tch, nil), 200)
	ev := e.must(e.do("GET", "/classes/"+c.id+"/events", tch, nil), 200)
	if n := len(ev.body["statements"].([]any)); n != 1 || ev.body["last"] != 2.0 {
		t.Fatalf("after removal: %s", ev.raw)
	}
	e.must(e.do("GET", "/me", s1, nil), 401)
	// Sequence numbers never go back.
	r := e.must(e.do("POST", "/events", s2, map[string]any{"statements": []any{e.stmt(3, adl+"experienced", "urn:robocity:lesson:1-2", nil)}}), 200)
	if r.body["accepted"] != 1.0 {
		t.Fatal(string(r.raw))
	}
	if ev := e.must(e.do("GET", "/classes/"+c.id+"/events?after=2", tch, nil), 200); ev.body["last"] != 3.0 {
		t.Fatalf("seq: %s", ev.raw)
	}
}

/* --- network guards ------------------------------------------------------------------------------ */

func TestLANAndCORS(t *testing.T) {
	e := newEnv(t)
	e.must(e.do("GET", "/status", "", nil, "203.0.113.5:1"), 403) // a public address
	req := httptest.NewRequest("GET", APIPrefix+"/status", nil)
	req.Host = "evil.example.com:47290" // DNS rebinding
	req.RemoteAddr = "192.168.0.23:1"
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	if w.Code != http.StatusMisdirectedRequest {
		t.Fatalf("rebinding host: %d", w.Code)
	}

	call := func(method, origin string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, APIPrefix+"/status", nil)
		req.Host = "192.168.0.10:47290"
		req.RemoteAddr = "192.168.0.23:1"
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		w := httptest.NewRecorder()
		e.h.ServeHTTP(w, req)
		return w
	}
	if w := call("GET", "https://evil.example"); w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("evil origin: %d", w.Code)
	}
	if w := call("OPTIONS", "http://127.0.0.1:47280"); w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "http://127.0.0.1:47280" {
		t.Fatalf("simulator preflight: %d %v", w.Code, w.Header())
	}
	if w := call("GET", "http://192.168.0.10:47290"); w.Code != 200 {
		t.Fatalf("same origin: %d", w.Code)
	}
}

/* --- cloud sync ---------------------------------------------------------------------------------- */

func TestSyncPayloadHasNoNames(t *testing.T) {
	e := newEnv(t)
	op := e.operator()
	tch := e.teacher(op, "kim")
	r := e.must(e.do("POST", "/classes", tch, map[string]string{"name": "3반 김철수선생님"}), 201)
	c := classOut{id: r.body["id"].(string), code: r.body["code"].(string), pins: map[int]string{}}
	for _, x := range e.must(e.do("POST", "/classes/"+c.id+"/students", tch, map[string]int{"count": 12}), 201).body["issued"].([]any) {
		m := x.(map[string]any)
		c.pins[int(m["no"].(float64))] = m["pin"].(string)
	}
	s := e.student(c, 12)
	e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{
		e.stmt(1, adl+"answered", "urn:robocity:quiz:final:item:3", map[string]any{
			"result":  map[string]any{"response": "제 이름은 홍길동이에요", "extensions": map[string]any{"urn:robocity:res:note": "홍길동", "urn:robocity:res:choice": "B"}},
			"context": map[string]any{"extensions": map[string]any{"urn:robocity:ctx:step": "act1", ExtNo: 99.0}},
		}),
		e.stmt(2, adl+"answered", "urn:robocity:quiz:final:item:4", map[string]any{"result": map[string]any{"response": "2"}}),
		e.stmt(3, adl+"failed", "urn:robocity:site:factory:problem:1", nil),
	}}), 200)

	var mu sync.Mutex
	var got [][]byte
	var keys []string
	cloud := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		got = append(got, b)
		keys = append(keys, r.Header.Get("Authorization"))
		mu.Unlock()
		w.WriteHeader(201)
	}))
	defer cloud.Close()

	// Plain http is refused except to this computer; a short key is refused.
	e.must(e.do("PUT", "/sync", op, map[string]any{"enabled": true, "url": "http://cloud.example.com/v1/sync", "apiKey": "k-0123456789abcdef"}), 400)
	e.must(e.do("PUT", "/sync", op, map[string]any{"enabled": true, "url": cloud.URL, "apiKey": "short"}), 400)
	sv := e.must(e.do("PUT", "/sync", op, map[string]any{"enabled": true, "url": cloud.URL + "/v1/sync", "apiKey": "k-0123456789abcdef"}), 200)
	if bytes.Contains(sv.raw, []byte("k-0123456789abcdef")) {
		t.Fatal("API key shown back")
	}

	y := NewSyncer(e.store, cloud.Client())
	if err := y.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || keys[0] != "Bearer k-0123456789abcdef" {
		t.Fatalf("posts %d, auth %v", len(got), keys)
	}
	body := string(got[0])
	for _, banned := range []string{"김철수", "3반", "홍길동", c.code, c.id, `"no"`, ExtNo, "192.168", "\"12\"", c.code + "-12"} {
		if strings.Contains(body, banned) {
			t.Fatalf("cloud payload contains %q: %s", banned, body)
		}
	}
	var p SyncPayload
	if err := json.Unmarshal(got[0], &p); err != nil || p.Kind != "robocity-sync" || len(p.Statements) != 3 {
		t.Fatalf("payload: %v %s", err, body)
	}
	a := p.Statements[0]
	if a.Result.Response != nil || a.Result.Extensions["urn:robocity:res:choice"] != "B" || a.Result.Extensions["urn:robocity:res:note"] != nil {
		t.Fatalf("free text kept or code dropped: %+v", a.Result)
	}
	if p.Statements[1].Result.Response == nil || *p.Statements[1].Result.Response != "2" {
		t.Fatal("short answer dropped")
	}
	if a.Context.Extensions["urn:robocity:ctx:step"] != "act1" || len(a.Actor.Account.Name) != 20 || a.Actor.Account.Name != p.Statements[2].Actor.Account.Name {
		t.Fatalf("pseudonym: %+v", a)
	}

	// Nothing new → nothing sent; the cursor is kept across a restart.
	if err := y.RunOnce(context.Background()); err != nil || len(got) != 1 {
		t.Fatalf("resent: %d %v", len(got), err)
	}
	e.open()
	y = NewSyncer(e.store, cloud.Client())
	if err := y.RunOnce(context.Background()); err != nil || len(got) != 1 {
		t.Fatalf("resent after restart: %d", len(got))
	}
	// Removing the student sends a deletion request with the same pseudonym.
	e.must(e.do("DELETE", "/classes/"+c.id+"/students/12", tch, nil), 200)
	if err := y.RunOnce(context.Background()); err != nil || len(got) != 2 {
		t.Fatalf("delete request: %d %v", len(got), err)
	}
	var d SyncPayload
	_ = json.Unmarshal(got[1], &d)
	if d.Kind != "robocity-delete" || len(d.Deletes) != 1 || d.Deletes[0].Student != a.Actor.Account.Name {
		t.Fatalf("delete payload: %s", got[1])
	}
}

func TestSyncFailureKeepsCursor(t *testing.T) {
	e := newEnv(t)
	op := e.operator()
	tch := e.teacher(op, "kim")
	c := e.class(tch, 1)
	s := e.student(c, 1)
	e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{e.stmt(1, adl+"experienced", "urn:robocity:lesson:1-1", nil)}}), 200)
	fails := true
	n := 0
	cloud := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		if fails {
			w.WriteHeader(503)
			return
		}
		w.WriteHeader(200)
	}))
	defer cloud.Close()
	e.must(e.do("PUT", "/sync", op, map[string]any{"enabled": true, "url": cloud.URL, "apiKey": "k-0123456789abcdef"}), 200)
	y := NewSyncer(e.store, cloud.Client())
	if err := y.RunOnce(context.Background()); err == nil {
		t.Fatal("503 not an error")
	}
	if e.store.PendingSync() != 1 {
		t.Fatal("cursor moved on failure")
	}
	fails = false
	if err := y.RunOnce(context.Background()); err != nil || e.store.PendingSync() != 0 || n != 2 {
		t.Fatalf("retry: %v pending %d posts %d", err, e.store.PendingSync(), n)
	}
	// Off: nothing is sent.
	e.must(e.do("PUT", "/sync", op, map[string]any{"enabled": false, "url": ""}), 200)
	e.must(e.do("POST", "/events", s, map[string]any{"statements": []any{e.stmt(2, adl+"experienced", "urn:robocity:lesson:1-2", nil)}}), 200)
	_ = y.RunOnce(context.Background())
	if n != 2 {
		t.Fatal("sent while off")
	}
}

func TestLimiterDoubling(t *testing.T) {
	clk := &clock{t: time.Unix(0, 0)}
	l := newLimiter(2, time.Minute, 10*time.Minute, time.Hour, clk.now)
	l.fail("k")
	if l.blocked("k") != 0 {
		t.Fatal("locked too early")
	}
	if d := l.fail("k"); d != time.Minute {
		t.Fatalf("first lock %v", d)
	}
	clk.add(time.Minute)
	l.fail("k")
	if d := l.fail("k"); d != 2*time.Minute {
		t.Fatalf("second lock %v", d)
	}
	for i := 0; i < 10; i++ {
		l.fail("k")
	}
	if d := l.blocked("k"); d > 10*time.Minute {
		t.Fatalf("cap %v", d)
	}
	l.success("k")
	if l.blocked("k") != 0 {
		t.Fatal("not cleared")
	}
}

func TestMissingSecretRefused(t *testing.T) {
	e := newEnv(t)
	e.operator()
	if err := os.Remove(filepath.Join(e.dir, "secret.key")); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(e.dir, e.clk.now); err == nil {
		t.Fatal("opened without secret.key: every login would fail")
	}
}

func TestIngestBudget(t *testing.T) {
	e := newEnv(t)
	tch := e.teacher(e.operator(), "kim")
	c := e.class(tch, 1)
	s := e.student(c, 1)
	e.srv.flood.max = 5
	mk := func(from, n int) []any {
		out := []any{}
		for i := 0; i < n; i++ {
			out = append(out, e.stmt(from+i, adl+"experienced", "urn:robocity:lesson:1-1", nil))
		}
		return out
	}
	e.must(e.do("POST", "/events", s, map[string]any{"statements": mk(1, 4)}), 200)
	r := e.must(e.do("POST", "/events", s, map[string]any{"statements": mk(10, 2)}), 429)
	if r.header.Get("Retry-After") == "" {
		t.Fatal("no Retry-After")
	}
	e.clk.add(5 * time.Minute)
	e.must(e.do("POST", "/events", s, map[string]any{"statements": mk(10, 2)}), 200)
}

func TestDevOrigin(t *testing.T) {
	e := newEnv(t)
	call := func(origin, remote string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("OPTIONS", APIPrefix+"/status", nil)
		req.Host = "127.0.0.1:47290"
		req.RemoteAddr = remote
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		w := httptest.NewRecorder()
		e.h.ServeHTTP(w, req)
		return w
	}
	// Off by default: the dev server's page is refused.
	if w := call("http://localhost:3000", local); w.Code != 403 {
		t.Fatalf("dev origin before opt-in: %d", w.Code)
	}
	for _, bad := range []string{"http://192.168.0.5:3000", "https://localhost:3000", "http://localhost", "http://evil.example:3000", "http://localhost:3000/x", "http://u@localhost:3000", "localhost:3000"} {
		if err := e.srv.AllowDevOrigin(bad); err == nil {
			t.Fatalf("AllowDevOrigin(%q) accepted", bad)
		}
	}
	if err := e.srv.AllowDevOrigin("http://localhost:3000"); err != nil {
		t.Fatal(err)
	}
	if w := call("http://localhost:3000", local); w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatalf("dev origin from this PC: %d %v", w.Code, w.Header())
	}
	// Only for requests from this PC: a LAN machine's localhost page is not the dev server here.
	if w := call("http://localhost:3000", "192.168.0.23:1"); w.Code != 403 {
		t.Fatalf("dev origin from the LAN: %d", w.Code)
	}
	if w := call("http://localhost:3001", local); w.Code != 403 {
		t.Fatalf("another port: %d", w.Code)
	}
}

func TestRobotOrigin(t *testing.T) {
	for _, ok := range []string{"http://192.168.0.7:8080", "http://10.42.0.1:8080", "http://172.16.3.4:8080", "http://169.254.1.2:8080"} {
		if !robotOrigin(ok) {
			t.Fatalf("robot origin refused: %s", ok)
		}
	}
	for _, bad := range []string{"http://8.8.8.8:8080", "https://192.168.0.7:8080", "http://192.168.0.7:3000", "http://robot.local:8080", "http://192.168.0.7", "http://u@192.168.0.7:8080", "http://[fd00::1]:8080", "http://192.168.0.7:8080/x"} {
		if robotOrigin(bad) {
			t.Fatalf("robot origin accepted: %s", bad)
		}
	}
	// End to end: a preflight from a robot's page on the LAN is answered for that origin.
	e := newEnv(t)
	req := httptest.NewRequest("OPTIONS", APIPrefix+"/events", nil)
	req.Host = "192.168.0.10:47290"
	req.RemoteAddr = "192.168.0.23:5000"
	req.Header.Set("Origin", "http://192.168.0.7:8080")
	req.Header.Set("Access-Control-Request-Method", "POST")
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	if w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != "http://192.168.0.7:8080" {
		t.Fatalf("robot page preflight: %d %v", w.Code, w.Header())
	}
}

/* --- a lesson the teacher leads ------------------------------------------------------------------ */

func TestLead(t *testing.T) {
	e := newEnv(t)
	op := e.operator()
	a := e.teacher(op, "kim")
	b := e.teacher(op, "lee")
	c := e.class(a, 3)
	s1, s2 := e.student(c, 1), e.student(c, 2)
	lead := "/classes/" + c.id + "/lead"

	// No lead yet: students see none and cannot mark.
	if r := e.must(e.do("GET", "/lead", s1, nil), 200); r.body["lead"] != nil {
		t.Fatal("lead before start")
	}
	e.must(e.do("PUT", "/lead/me", s1, map[string]any{"group": 1, "role": "robot"}), 409)

	// Roles: students cannot lead, another teacher cannot see or lead this class.
	e.must(e.do("PUT", lead, s1, map[string]any{"lesson": "p7-4", "step": 0}), 403)
	e.must(e.do("PUT", lead, b, map[string]any{"lesson": "p7-4", "step": 0}), 404)
	e.must(e.do("GET", lead, b, nil), 404)
	e.must(e.do("GET", "/lead", a, nil), 403)

	// Bad input.
	for _, in := range []map[string]any{{"lesson": "P7 4", "step": 0}, {"lesson": "p7-4", "step": 21}, {"lesson": "p7-4", "step": -1}, {"lesson": "", "step": 0}} {
		e.must(e.do("PUT", lead, a, in), 400)
	}

	// Start: step 0, robots locked.
	r := e.must(e.do("PUT", lead, a, map[string]any{"lesson": "p7-4", "step": 0}), 200)
	l := r.body["lead"].(map[string]any)
	if l["lesson"] != "p7-4" || l["gate"] != false || l["rev"].(float64) != 1 {
		t.Fatalf("start: %v", l)
	}
	r = e.must(e.do("GET", "/lead", s1, nil), 200)
	if r.body["lead"].(map[string]any)["lesson"] != "p7-4" || r.body["me"] != nil {
		t.Fatalf("student sees: %v", r.body)
	}

	// Students join with group and role, answer, ask for help.
	e.must(e.do("PUT", "/lead/me", s1, map[string]any{"group": 1, "role": "robot", "lesson": "p7-4", "step": 0, "answer": "초록 블록"}), 200)
	e.must(e.do("PUT", "/lead/me", s2, map[string]any{"group": 1, "role": "screen", "lesson": "p7-4", "step": 0, "help": true}), 200)
	for _, bad := range []map[string]any{{"group": 13}, {"group": 1, "role": "boss"}, {"group": 1, "robot": "fly"}, {"group": 1, "answer": strings.Repeat("가", 41)}, {"group": 1, "lesson": "x y"}} {
		e.must(e.do("PUT", "/lead/me", s1, bad), 400)
	}
	r = e.must(e.do("GET", lead, a, nil), 200)
	ms := r.body["marks"].([]any)
	if len(ms) != 2 || ms[0].(map[string]any)["answer"] != "초록 블록" || ms[1].(map[string]any)["help"] != true || ms[0].(map[string]any)["role"] != "robot" {
		t.Fatalf("marks: %v", ms)
	}

	// Next step, robots allowed, then stop: the stop count never goes back.
	e.clk.add(5 * time.Second)
	r = e.must(e.do("PUT", lead, a, map[string]any{"lesson": "p7-4", "step": 4, "gate": true}), 200)
	l = r.body["lead"].(map[string]any)
	if l["step"].(float64) != 4 || l["gate"] != true || l["since"].(float64) <= l["at"].(float64) {
		t.Fatalf("step: %v", l)
	}
	e.must(e.do("PUT", lead, a, map[string]any{"lesson": "p7-4", "step": 4, "gate": false, "stop": 1}), 200)
	r = e.must(e.do("PUT", lead, a, map[string]any{"lesson": "p7-4", "step": 4, "stop": 0}), 200)
	if r.body["lead"].(map[string]any)["stop"].(float64) != 1 {
		t.Fatal("stop count went back")
	}
	if r = e.must(e.do("GET", "/lead", s2, nil), 200); r.body["lead"].(map[string]any)["stop"].(float64) != 1 || r.body["me"].(map[string]any)["help"] != true {
		t.Fatalf("student after stop: %v", r.body)
	}
	// The group's member sees the group's robot PC.
	e.must(e.do("PUT", "/lead/me", s1, map[string]any{"group": 1, "role": "robot", "lesson": "p7-4", "step": 4, "robot": "done", "result": "4개 옮김"}), 200)
	if mate, _ := e.must(e.do("GET", "/lead", s2, nil), 200).body["mate"].(map[string]any); mate == nil || mate["no"].(float64) != 1 || mate["robot"] != "done" {
		t.Fatal("group's robot not shown to its member")
	}
	if e.must(e.do("GET", "/lead", s1, nil), 200).body["mate"] != nil {
		t.Fatal("the robot PC gets itself as mate")
	}

	// The operator can see it too; ending it clears it for everyone.
	e.must(e.do("GET", lead, op, nil), 200)
	e.must(e.do("DELETE", lead, a, nil), 200)
	if r = e.must(e.do("GET", "/lead", s1, nil), 200); r.body["lead"] != nil {
		t.Fatal("lead after end")
	}
	if r = e.must(e.do("GET", lead, a, nil), 200); r.body["lead"] != nil || len(r.body["marks"].([]any)) != 0 {
		t.Fatal("teacher sees an ended lead")
	}

	// A lead the teacher's screen left alone runs out.
	e.must(e.do("PUT", lead, a, map[string]any{"lesson": "p7-1", "step": 0}), 200)
	e.clk.add(31 * time.Minute)
	if r = e.must(e.do("GET", "/lead", s1, nil), 200); r.body["lead"] != nil {
		t.Fatal("idle lead still on")
	}
}
