package classroom

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

// Cloud sync: when an operator has set a cloud URL and API key, the server sends its classes' new
// events to the company's cloud every few minutes — pseudonymised (see pseudonymise): no names, no
// class names or codes, no 번호, no free-text answers, no IP addresses. Deletions (a student removed,
// a class deleted) are sent as deletion requests. Off unless configured.
//
// Wire format (POST <url>, Authorization: Bearer <api key>, Idempotency-Key: <batch>):
//
//	{"kind":"robocity-sync","version":1,"server":"<server id>","batch":"<id>","sentAt":"…","statements":[…]}
//	{"kind":"robocity-delete","version":1,"server":"<server id>","batch":"<id>","sentAt":"…","deletes":[{"class":"…","student":"…"}]}
//
// Any 2xx means stored; the same batch id may arrive twice (a lost reply) and is ignored the second time.

const (
	syncBatchMax    = 500
	syncMinInterval = 60 * time.Second
	syncMaxBackoff  = time.Hour
)

type SyncPayload struct {
	Kind       string          `json:"kind"`
	Version    int             `json:"version"`
	Server     string          `json:"server"`
	Batch      string          `json:"batch"`
	SentAt     string          `json:"sentAt"`
	Statements []Statement     `json:"statements,omitempty"`
	Deletes    []DeleteRequest `json:"deletes,omitempty"`
}

// ValidSyncURL: https, or http only to this computer (for testing).
func ValidSyncURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return fmt.Errorf("%w: 클라우드 주소가 올바르지 않음", errBadInput)
	}
	switch u.Scheme {
	case "https":
		return nil
	case "http":
		if ip := net.ParseIP(u.Hostname()); (ip != nil && ip.IsLoopback()) || u.Hostname() == "localhost" {
			return nil
		}
	}
	return fmt.Errorf("%w: 클라우드 주소는 https:// 여야 함", errBadInput)
}

// syncBatch: the next pseudonymised events of a class after its cloud cursor.
func (s *Store) syncBatch(classID string) (SyncPayload, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil {
		return SyncPayload{}, 0, ErrNotFound
	}
	events, err := s.eventsLocked(classID, c.SyncedSeq, syncBatchMax)
	if err != nil || len(events) == 0 {
		return SyncPayload{}, 0, err
	}
	p := SyncPayload{Kind: "robocity-sync", Version: 1, Server: s.db.ServerID, SentAt: s.now().UTC().Format(time.RFC3339)}
	for _, st := range events {
		p.Statements = append(p.Statements, pseudonymise(st, s.db.ServerID, s.pseudoKey))
	}
	last := events[len(events)-1].Seq
	p.Batch = fmt.Sprintf("%s-%s-%d-%d", s.db.ServerID, pseudonym(s.pseudoKey, "class", classID, 16), events[0].Seq, last)
	return p, last, nil
}

func (s *Store) markSynced(classID string, seq int64, n int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if c := s.classLocked(classID); c != nil && seq > c.SyncedSeq {
		c.SyncedSeq = seq
	}
	s.db.SyncStat.Sent += int64(n)
	s.db.SyncStat.LastOKAt = s.now().UnixMilli()
	s.db.SyncStat.LastError = ""
	return s.saveLocked()
}

func (s *Store) syncFailed(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.db.SyncStat.LastError = err.Error()
	s.db.SyncStat.LastErrorAt = s.now().UnixMilli()
	_ = s.saveLocked()
}

func (s *Store) dropDeletes(n int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if n > len(s.db.SyncStat.PendingDeletes) {
		n = len(s.db.SyncStat.PendingDeletes)
	}
	s.db.SyncStat.PendingDeletes = append([]DeleteRequest(nil), s.db.SyncStat.PendingDeletes[n:]...)
	return s.saveLocked()
}

func (s *Store) classIDs() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids := make([]string, 0, len(s.db.Classes))
	for _, c := range s.db.Classes {
		ids = append(ids, c.ID)
	}
	return ids
}

// PendingSync: events not yet in the cloud (for the operator's status line).
func (s *Store) PendingSync() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	var n int64
	for _, c := range s.db.Classes {
		if lg := s.logs[c.ID]; lg != nil && lg.lastSeq > c.SyncedSeq {
			n += lg.lastSeq - c.SyncedSeq
		}
	}
	return n
}

// Syncer runs the sync in the background.
type Syncer struct {
	store  *Store
	client *http.Client
	kick   chan struct{}
}

func NewSyncer(s *Store, client *http.Client) *Syncer {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &Syncer{store: s, client: client, kick: make(chan struct{}, 1)}
}

// Now asks for a sync as soon as possible.
func (y *Syncer) Now() {
	select {
	case y.kick <- struct{}{}:
	default:
	}
}

var errSyncOff = errors.New("sync off")

// Run syncs every interval (backing off after failures) until ctx ends.
func (y *Syncer) Run(ctx context.Context) {
	failures := 0
	for {
		cfg, _ := y.store.SyncConfig()
		wait := time.Duration(cfg.IntervalSec) * time.Second
		if wait < syncMinInterval {
			wait = syncMinInterval
		}
		err := y.RunOnce(ctx)
		switch {
		case err == nil || errors.Is(err, errSyncOff):
			failures = 0
		default:
			failures++
			y.store.syncFailed(err)
			for i := 1; i < failures && wait < syncMaxBackoff; i++ {
				wait *= 2
			}
			if wait > syncMaxBackoff {
				wait = syncMaxBackoff
			}
		}
		t := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-y.kick:
			t.Stop()
		case <-t.C:
		}
	}
}

// RunOnce sends pending deletions, then every class's new events, until all are sent or one fails.
func (y *Syncer) RunOnce(ctx context.Context) error {
	cfg, st := y.store.SyncConfig()
	if !cfg.Enabled || cfg.URL == "" || cfg.APIKey == "" {
		return errSyncOff
	}
	if err := ValidSyncURL(cfg.URL); err != nil {
		return err
	}
	if n := len(st.PendingDeletes); n > 0 {
		p := SyncPayload{Kind: "robocity-delete", Version: 1, Server: y.store.ServerID(), SentAt: time.Now().UTC().Format(time.RFC3339),
			Batch: fmt.Sprintf("%s-del-%d-%s", y.store.ServerID(), n, randomToken(6)), Deletes: st.PendingDeletes}
		if err := y.post(ctx, cfg, p); err != nil {
			return err
		}
		if err := y.store.dropDeletes(n); err != nil {
			return err
		}
	}
	for _, id := range y.store.classIDs() {
		for round := 0; round < 40; round++ {
			p, last, err := y.store.syncBatch(id)
			if err != nil {
				if errors.Is(err, ErrNotFound) {
					break // deleted meanwhile
				}
				return err
			}
			if len(p.Statements) == 0 {
				break
			}
			if err := y.post(ctx, cfg, p); err != nil {
				return err
			}
			if err := y.store.markSynced(id, last, len(p.Statements)); err != nil {
				return err
			}
		}
	}
	return nil
}

func (y *Syncer) post(ctx context.Context, cfg SyncConfig, p SyncPayload) error {
	body, err := json.Marshal(p)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Idempotency-Key", p.Batch)
	res, err := y.client.Do(req)
	if err != nil {
		// The error text may hold the URL but never the key (it is in a header).
		return fmt.Errorf("클라우드 연결 실패: %v", err)
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64*1024))
	if res.StatusCode/100 != 2 {
		return fmt.Errorf("클라우드 응답 %d", res.StatusCode)
	}
	return nil
}

// redactKey: the API key as shown back to the operator ("…ab12").
func redactKey(k string) string {
	if k == "" {
		return ""
	}
	if len(k) <= 4 {
		return "…"
	}
	return "…" + k[len(k)-4:]
}
