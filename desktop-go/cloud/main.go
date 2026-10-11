// Command cloud: a minimal reference receiver for the class servers' cloud sync (desktop-go/classroom,
// sync.go). It accepts pseudonymised learning events with an API key and keeps them append-only:
//
//	<data>/<tenant>/<server>/statements-YYYY-MM.jsonl   one statement per line, as received
//	<data>/<tenant>/batches.log                         batch ids already stored (a resent batch is ignored)
//	<data>/<tenant>/deletions.jsonl                     deletion requests, kept as the record of each erasure
//
// A deletion request (a student removed, a class deleted on the class server) removes the matching
// statements from the files at once and is logged. Nothing here can turn a pseudonym back into a
// student: the key for that stays on the class server.
//
// Run:
//
//	ROBOCITY_API_KEYS="school-a:<32+ random chars>,school-b:<…>" go run ./cloud -addr 127.0.0.1:8080 -data /var/lib/robocity
//
// and put it behind an HTTPS reverse proxy (Caddy / nginx) — the class servers only send to https://.
// Each tenant (school or contract) gets its own key; set the class server's cloud URL to
// https://<host>/v1/sync and its API key to that tenant's key. Deployment notes:
// docs/reports/system/23-accounts-hybrid.md.
package main

import (
	"bufio"
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"physical-ai-lab/desktop/classroom"
)

const maxBody = 4 << 20

var (
	reServer  = regexp.MustCompile(`^[0-9a-f]{16}$`)
	reTenant  = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
	rePseudo  = regexp.MustCompile(`^[0-9a-f]{16,20}$`)
	reBatch   = regexp.MustCompile(`^[A-Za-z0-9_-]{1,120}$`)
	safeShort = regexp.MustCompile(`^[A-Za-z0-9_.,:+-]{1,32}$`)
)

type receiver struct {
	mu      sync.Mutex
	dir     string
	keys    map[string]string // tenant → key
	batches map[string]map[string]bool
	now     func() time.Time
}

func newReceiver(dir string, keys map[string]string) (*receiver, error) {
	for t, k := range keys {
		if !reTenant.MatchString(t) || len(k) < 16 {
			return nil, fmt.Errorf("tenant %q: name a-z0-9- and a key of 16+ characters", t)
		}
	}
	return &receiver{dir: dir, keys: keys, batches: map[string]map[string]bool{}, now: time.Now}, nil
}

// parseKeys: "tenant:key,tenant:key".
func parseKeys(s string) map[string]string {
	out := map[string]string{}
	for _, part := range strings.Split(s, ",") {
		if t, k, ok := strings.Cut(strings.TrimSpace(part), ":"); ok {
			out[t] = k
		}
	}
	return out
}

// tenant: whose key the request carries ("" none). Every key is compared, in constant time.
func (rc *receiver) tenant(r *http.Request) string {
	a := r.Header.Get("Authorization")
	if !strings.HasPrefix(a, "Bearer ") {
		return ""
	}
	got := []byte(strings.TrimPrefix(a, "Bearer "))
	found := ""
	for t, k := range rc.keys {
		if subtle.ConstantTimeCompare(got, []byte(k)) == 1 {
			found = t
		}
	}
	return found
}

func (rc *receiver) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/healthz":
		_, _ = w.Write([]byte("ok"))
	case r.Method == http.MethodPost && r.URL.Path == "/v1/sync":
		rc.sync(w, r)
	default:
		http.NotFound(w, r)
	}
}

func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (rc *receiver) sync(w http.ResponseWriter, r *http.Request) {
	tenant := rc.tenant(r)
	if tenant == "" {
		reply(w, http.StatusUnauthorized, map[string]string{"error": "key"})
		return
	}
	var p classroom.SyncPayload
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&p); err != nil || p.Version != 1 || !reServer.MatchString(p.Server) || !reBatch.MatchString(p.Batch) {
		reply(w, http.StatusBadRequest, map[string]string{"error": "payload"})
		return
	}
	var err error
	var stored int
	switch p.Kind {
	case "robocity-sync":
		stored, err = rc.store(tenant, p)
	case "robocity-delete":
		stored, err = rc.erase(tenant, p)
	default:
		reply(w, http.StatusBadRequest, map[string]string{"error": "kind"})
		return
	}
	if errors.Is(err, errBad) {
		reply(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err != nil {
		log.Printf("tenant %s: %v", tenant, err)
		reply(w, http.StatusInternalServerError, map[string]string{"error": "store"})
		return
	}
	reply(w, http.StatusOK, map[string]any{"ok": true, "stored": stored})
}

var errBad = errors.New("statement")

// check: what a pseudonymised statement must look like; free text is dropped here too.
func check(s *classroom.Statement) error {
	if s.Actor == nil || !strings.HasPrefix(s.Actor.Account.HomePage, "urn:robocity:server:") || !rePseudo.MatchString(s.Actor.Account.Name) {
		return fmt.Errorf("%w: actor must be a pseudonym", errBad)
	}
	if s.Context == nil {
		return fmt.Errorf("%w: context", errBad)
	}
	if c, _ := s.Context.Extensions[classroom.ExtClass].(string); !rePseudo.MatchString(c) {
		return fmt.Errorf("%w: class must be a pseudonym", errBad)
	}
	if _, ok := s.Context.Extensions[classroom.ExtNo]; ok {
		return fmt.Errorf("%w: 번호 not allowed", errBad)
	}
	if s.Result != nil && s.Result.Response != nil && !safeShort.MatchString(*s.Result.Response) {
		s.Result.Response = nil
	}
	return nil
}

func (rc *receiver) seen(tenant string) (map[string]bool, error) {
	if m := rc.batches[tenant]; m != nil {
		return m, nil
	}
	m := map[string]bool{}
	f, err := os.Open(filepath.Join(rc.dir, tenant, "batches.log"))
	if err == nil {
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			m[strings.TrimSpace(sc.Text())] = true
		}
		f.Close()
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	rc.batches[tenant] = m
	return m, nil
}

func appendFile(p string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, werr := f.Write(data)
	serr := f.Sync()
	cerr := f.Close()
	return errors.Join(werr, serr, cerr)
}

func (rc *receiver) store(tenant string, p classroom.SyncPayload) (int, error) {
	if len(p.Statements) == 0 || len(p.Statements) > 1000 {
		return 0, fmt.Errorf("%w: 1~1000 statements", errBad)
	}
	var buf bytes.Buffer
	for i := range p.Statements {
		if err := check(&p.Statements[i]); err != nil {
			return 0, err
		}
		b, _ := json.Marshal(p.Statements[i])
		buf.Write(b)
		buf.WriteByte('\n')
	}
	rc.mu.Lock()
	defer rc.mu.Unlock()
	seen, err := rc.seen(tenant)
	if err != nil {
		return 0, err
	}
	if seen[p.Batch] {
		return 0, nil
	}
	file := filepath.Join(rc.dir, tenant, p.Server, "statements-"+rc.now().UTC().Format("2006-01")+".jsonl")
	if err := appendFile(file, buf.Bytes()); err != nil {
		return 0, err
	}
	if err := appendFile(filepath.Join(rc.dir, tenant, "batches.log"), []byte(p.Batch+"\n")); err != nil {
		return 0, err
	}
	seen[p.Batch] = true
	return len(p.Statements), nil
}

// erase removes the statements of the named classes / students of that server and logs the request.
func (rc *receiver) erase(tenant string, p classroom.SyncPayload) (int, error) {
	if len(p.Deletes) == 0 || len(p.Deletes) > 1000 {
		return 0, fmt.Errorf("%w: 1~1000 deletes", errBad)
	}
	classes, students := map[string]bool{}, map[string]bool{}
	for _, d := range p.Deletes {
		if !rePseudo.MatchString(d.Class) || (d.Student != "" && !rePseudo.MatchString(d.Student)) {
			return 0, fmt.Errorf("%w: delete ids", errBad)
		}
		if d.Student == "" {
			classes[d.Class] = true
		} else {
			students[d.Student] = true
		}
	}
	rc.mu.Lock()
	defer rc.mu.Unlock()
	files, _ := filepath.Glob(filepath.Join(rc.dir, tenant, p.Server, "statements-*.jsonl"))
	removed := 0
	for _, f := range files {
		n, err := filterFile(f, func(s classroom.Statement) bool {
			c, _ := s.Context.Extensions[classroom.ExtClass].(string)
			return classes[c] || students[s.Actor.Account.Name]
		})
		if err != nil {
			return removed, err
		}
		removed += n
	}
	rec, _ := json.Marshal(map[string]any{"at": rc.now().UTC().Format(time.RFC3339), "server": p.Server, "batch": p.Batch, "deletes": p.Deletes, "removed": removed})
	return removed, appendFile(filepath.Join(rc.dir, tenant, "deletions.jsonl"), append(rec, '\n'))
}

// filterFile rewrites a file without the statements drop matches (temp file + rename).
func filterFile(p string, drop func(classroom.Statement) bool) (int, error) {
	b, err := os.ReadFile(p)
	if err != nil {
		return 0, err
	}
	var out bytes.Buffer
	n := 0
	for _, line := range bytes.Split(b, []byte("\n")) {
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var s classroom.Statement
		if json.Unmarshal(line, &s) == nil && s.Actor != nil && s.Context != nil && drop(s) {
			n++
			continue
		}
		out.Write(line)
		out.WriteByte('\n')
	}
	if n == 0 {
		return 0, nil
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, out.Bytes(), 0o600); err != nil {
		return 0, err
	}
	return n, os.Rename(tmp, p)
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "listen address (put an HTTPS reverse proxy in front)")
	dir := flag.String("data", "cloud-data", "data folder")
	flag.Parse()
	keys := parseKeys(os.Getenv("ROBOCITY_API_KEYS"))
	if len(keys) == 0 {
		log.Fatal("set ROBOCITY_API_KEYS=\"tenant:key,…\"")
	}
	rc, err := newReceiver(*dir, keys)
	if err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{Addr: *addr, Handler: rc, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: time.Minute}
	log.Printf("robocity cloud receiver on %s, %d tenant(s), data in %s", *addr, len(keys), *dir)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
