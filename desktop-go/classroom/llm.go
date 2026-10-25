package classroom

import (
	"bufio"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// 말로 만들기: a student says what the robot should do, Claude answers with block lines, and the student
// checks them, puts them into the block editor and runs them in the simulator first. The class server
// is the only place that holds the API key: a student's PC sends only the sentence and a short
// description of the scene; the instructions (llm_system.md) and the answer format live here, so the
// key cannot be used as a general chatbot. Each question counts against the student's daily limit and
// is written to a per-class log (llm/<class>.jsonl) the teacher reads after the lesson. Nothing of it
// goes to the cloud sync.

//go:embed llm_system.md
var llmSystem string

// LLMModels: the models a teacher can choose (Claude Haiku 5.5 the default: fast and cheap; Claude
// Opus 5.5 understands loose sentences better at about 15 times the price).
var LLMModels = []string{"claude-haiku-5-5", "claude-opus-5-5"}

const (
	llmDefaultModel = "claude-haiku-5-5"
	llmDefaultDaily = 30
	llmMaxDaily     = 200
	llmMaxText      = 200  // runes in the student's sentence
	llmMaxProgram   = 1500 // runes of the current program sent along
	llmMaxLines     = 40
	llmMaxLine      = 120
	llmMaxExplain   = 400
	llmMinGap       = 3 * time.Second // between two questions of one student
	llmInflight     = 8               // questions waiting for Claude at once, the whole server
	llmTimeout      = 45 * time.Second
)

// LLMConfig: saved in db.json (the key stays on the teacher's PC and is never sent back whole).
type LLMConfig struct {
	Enabled bool   `json:"enabled"`
	Model   string `json:"model"`
	APIKey  string `json:"apiKey"`
	// Daily: questions per student per day.
	Daily int `json:"daily"`
}

func (c LLMConfig) withDefaults() LLMConfig {
	if c.Model == "" {
		c.Model = llmDefaultModel
	}
	if c.Daily <= 0 {
		c.Daily = llmDefaultDaily
	}
	return c
}

func (s *Store) LLMConfig() LLMConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.db.LLM.withDefaults()
}

func (s *Store) SetLLMConfig(c LLMConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.db.LLM = c
	return s.saveLocked()
}

/* --- what is sent to Claude -------------------------------------------------------------------- */

// LLMContext: the scene as the student's simulator describes it. Every field is short and checked.
type LLMContext struct {
	Arm      string   `json:"arm"`      // "myCobot 280 RDK X5"
	Joints   int      `json:"joints"`   // 6, 5 or 4
	Ranges   string   `json:"ranges"`   // "J1 -168~168, J2 …"
	Tool     string   `json:"tool"`     // "어댑티브 그리퍼"
	ToolKind string   `json:"toolKind"` // grip | suction | pen | press | hold | none
	Places   []string `json:"places"`   // "빨강 블록", "자리 1", …
	Poses    []string `json:"poses"`    // the student's saved poses
	Program  string   `json:"program"`  // the block program now in the editor
	// Errors: the simulator's complaints about the last answer, for 다시 만들기.
	Errors string `json:"errors"`
}

func (c LLMContext) check() error {
	short := func(s string, n int) bool { return utf8.RuneCountInString(s) <= n }
	if !short(c.Arm, 60) || !short(c.Ranges, 200) || !short(c.Tool, 40) || !short(c.ToolKind, 10) || !short(c.Errors, 600) || !short(c.Program, llmMaxProgram) {
		return fmt.Errorf("%w: 장면 설명이 너무 길어요", errBadInput)
	}
	if c.Joints < 0 || c.Joints > 6 || len(c.Places) > 40 || len(c.Poses) > 20 {
		return fmt.Errorf("%w: 장면 설명이 올바르지 않아요", errBadInput)
	}
	for _, p := range append(append([]string(nil), c.Places...), c.Poses...) {
		if p == "" || !short(p, 24) || strings.ContainsAny(p, "\"\n") {
			return fmt.Errorf("%w: 장소 · 자세 이름이 올바르지 않아요", errBadInput)
		}
	}
	return nil
}

// userTurn: the situation, then the student's words, each in its own tag so a sentence cannot pass
// itself off as part of the situation.
func userTurn(text string, c LLMContext) string {
	var b strings.Builder
	b.WriteString("<situation>\n")
	fmt.Fprintf(&b, "arm: %s, %d joints\n", c.Arm, c.Joints)
	if c.Ranges != "" {
		fmt.Fprintf(&b, "joint ranges (degrees): %s\n", c.Ranges)
	}
	fmt.Fprintf(&b, "tool: %s (%s)\n", c.Tool, c.ToolKind)
	fmt.Fprintf(&b, "places: %s\n", strings.Join(c.Places, ", "))
	if len(c.Poses) > 0 {
		fmt.Fprintf(&b, "saved poses: %s\n", strings.Join(c.Poses, ", "))
	}
	if strings.TrimSpace(c.Program) != "" {
		fmt.Fprintf(&b, "current program:\n%s\n", c.Program)
	}
	if c.Errors != "" {
		fmt.Fprintf(&b, "errors in your last answer:\n%s\n", c.Errors)
	}
	b.WriteString("</situation>\n<student>\n")
	b.WriteString(text)
	b.WriteString("\n</student>")
	return b.String()
}

// llmSchema: the only shape Claude may answer in (structured outputs).
var llmSchema = map[string]any{
	"type":                 "object",
	"additionalProperties": false,
	"required":             []string{"ok", "lines", "explain"},
	"properties": map[string]any{
		"ok":      map[string]any{"type": "boolean"},
		"lines":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"explain": map[string]any{"type": "string"},
	},
}

// LLMAnswer: Claude's answer, checked.
type LLMAnswer struct {
	OK      bool     `json:"ok"`
	Lines   []string `json:"lines"`
	Explain string   `json:"explain"`
}

type llmUsage struct{ In, Out, CacheRead int64 }

// SetLLMCaller replaces how Claude is asked (tests, or the Anthropic API at another address).
func (srv *Server) SetLLMCaller(c LLMCaller) { srv.llm.call = c }

// LLMCaller asks Claude. The server's own uses the Anthropic SDK; tests put a fake in its place.
type LLMCaller func(ctx context.Context, cfg LLMConfig, user string) (LLMAnswer, llmUsage, error)

// errRefused: Claude declined (stop reason "refusal"); told to the student as a request it cannot make.
var errRefused = errors.New("refused")

// ClaudeCaller: the Messages API through the official SDK. baseURL "" = Anthropic's (another address:
// a test stand-in, PAI_LLM_BASE_URL in classmode.go).
func ClaudeCaller(baseURL string) LLMCaller {
	return func(ctx context.Context, cfg LLMConfig, user string) (LLMAnswer, llmUsage, error) {
		opts := []option.RequestOption{option.WithAPIKey(cfg.APIKey), option.WithMaxRetries(2), option.WithRequestTimeout(llmTimeout)}
		if baseURL != "" {
			opts = append(opts, option.WithBaseURL(baseURL))
		}
		client := anthropic.NewClient(opts...)
		msg, err := client.Messages.New(ctx, anthropic.MessageNewParams{
			Model:     anthropic.Model(cfg.Model),
			MaxTokens: 4000,
			// The instructions are the same for every question: cached, they cost a tenth after the first.
			System:       []anthropic.TextBlockParam{{Text: llmSystem, CacheControl: anthropic.NewCacheControlEphemeralParam()}},
			Messages:     []anthropic.MessageParam{anthropic.NewUserMessage(anthropic.NewTextBlock(user))},
			OutputConfig: anthropic.OutputConfigParam{Effort: anthropic.OutputConfigEffortLow, Format: anthropic.JSONOutputFormatParam{Schema: llmSchema}},
		})
		if err != nil {
			return LLMAnswer{}, llmUsage{}, err
		}
		u := llmUsage{In: msg.Usage.InputTokens + msg.Usage.CacheCreationInputTokens + msg.Usage.CacheReadInputTokens, Out: msg.Usage.OutputTokens, CacheRead: msg.Usage.CacheReadInputTokens}
		if msg.StopReason == anthropic.StopReasonRefusal {
			return LLMAnswer{}, u, errRefused
		}
		var text strings.Builder
		for _, block := range msg.Content {
			if t, ok := block.AsAny().(anthropic.TextBlock); ok {
				text.WriteString(t.Text)
			}
		}
		if msg.StopReason == anthropic.StopReasonMaxTokens {
			return LLMAnswer{}, u, errors.New("answer cut off (max_tokens)")
		}
		var a LLMAnswer
		if err := json.Unmarshal([]byte(text.String()), &a); err != nil {
			return LLMAnswer{}, u, fmt.Errorf("answer is not the agreed JSON: %w", err)
		}
		return a, u, nil
	}
}

// tidy: an answer the app can show — a bounded number of short lines, code only in `lines`.
func (a LLMAnswer) tidy() (LLMAnswer, error) {
	if len(a.Lines) > llmMaxLines {
		return a, errors.New("too many lines")
	}
	lines := make([]string, 0, len(a.Lines))
	for _, l := range a.Lines {
		l = strings.TrimRight(strings.ReplaceAll(l, "\t", "    "), " \r")
		if strings.Contains(l, "\n") || utf8.RuneCountInString(l) > llmMaxLine {
			return a, errors.New("a line is not one short line")
		}
		if strings.TrimSpace(l) != "" {
			lines = append(lines, l)
		}
	}
	if !a.OK {
		lines = nil
	} else if len(lines) == 0 {
		return a, errors.New("ok without lines")
	}
	a.Lines = lines
	a.Explain = strings.TrimSpace(a.Explain)
	if r := []rune(a.Explain); len(r) > llmMaxExplain {
		a.Explain = string(r[:llmMaxExplain]) + "…"
	}
	return a, nil
}

/* --- the service: limits, log ------------------------------------------------------------------ */

type llmService struct {
	call  LLMCaller
	slots chan struct{}
	mu    sync.Mutex
	day   string
	used  map[string]int       // "<class>/<no>" (or "u/<user>") → questions today
	last  map[string]time.Time // last question per asker
	usage struct{ asks, in, out, cacheRead int64 }
}

func newLLMService(call LLMCaller) *llmService {
	return &llmService{call: call, slots: make(chan struct{}, llmInflight), used: map[string]int{}, last: map[string]time.Time{}}
}

// take: one question for this asker now, or why not (and how long to wait).
func (l *llmService) take(key string, daily int, now time.Time) (remaining int, wait time.Duration, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if d := now.Format("2006-01-02"); d != l.day {
		l.day, l.used, l.usage = d, map[string]int{}, struct{ asks, in, out, cacheRead int64 }{}
	}
	if t, seen := l.last[key]; seen && now.Sub(t) < llmMinGap {
		return daily - l.used[key], llmMinGap - now.Sub(t), false
	}
	if l.used[key] >= daily {
		return 0, 0, false
	}
	l.used[key]++
	l.last[key] = now
	return daily - l.used[key], 0, true
}

// give back a question that never reached Claude (busy, network).
func (l *llmService) refund(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.used[key] > 0 {
		l.used[key]--
	}
}

func (l *llmService) remaining(key string, daily int, now time.Time) int {
	l.mu.Lock()
	defer l.mu.Unlock()
	if now.Format("2006-01-02") != l.day {
		return daily
	}
	return max(0, daily-l.used[key])
}

func (l *llmService) count(u llmUsage) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.usage.asks++
	l.usage.in += u.In
	l.usage.out += u.Out
	l.usage.cacheRead += u.CacheRead
}

// LLMLogEntry: one question in the class's log (llm/<class>.jsonl). A later line with the same ID and
// Inserted set records that the student put the answer into the block editor.
type LLMLogEntry struct {
	ID       string   `json:"id"`
	Time     string   `json:"t"`
	No       int      `json:"no,omitempty"`
	User     string   `json:"user,omitempty"`
	Text     string   `json:"text,omitempty"`
	OK       bool     `json:"ok"`
	Lines    []string `json:"lines,omitempty"`
	Explain  string   `json:"explain,omitempty"`
	Model    string   `json:"model,omitempty"`
	In       int64    `json:"in,omitempty"`
	Out      int64    `json:"out,omitempty"`
	Error    string   `json:"error,omitempty"`
	Inserted bool     `json:"inserted,omitempty"`
}

var (
	llmLogMu  sync.Mutex
	reClassID = regexp.MustCompile(`^c_[A-Za-z0-9_-]{6,20}$`)
	reLLMID   = regexp.MustCompile(`^q_[A-Za-z0-9_-]{8,20}$`)
)

func newLLMID() string { return "q_" + randomToken(9) }

func (s *Store) llmLogPath(classID string) string {
	return filepath.Join(s.dir, "llm", classID+".jsonl")
}

func (s *Store) appendLLMLog(classID string, e LLMLogEntry) error {
	if classID == "" || !reClassID.MatchString(classID) {
		return nil
	}
	llmLogMu.Lock()
	defer llmLogMu.Unlock()
	if err := os.MkdirAll(filepath.Join(s.dir, "llm"), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(s.llmLogPath(classID), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	b, _ := json.Marshal(e)
	_, err = f.Write(append(b, '\n'))
	return err
}

// LLMLog: the class's questions, newest last, with the insert marks folded in.
func (s *Store) LLMLog(classID string, limit int) ([]LLMLogEntry, error) {
	llmLogMu.Lock()
	defer llmLogMu.Unlock()
	f, err := os.Open(s.llmLogPath(classID))
	if errors.Is(err, os.ErrNotExist) {
		return []LLMLogEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []LLMLogEntry
	at := map[string]int{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64<<10), 1<<20)
	for sc.Scan() {
		var e LLMLogEntry
		if json.Unmarshal(sc.Bytes(), &e) != nil {
			continue
		}
		if i, seen := at[e.ID]; seen {
			out[i].Inserted = out[i].Inserted || e.Inserted
			continue
		}
		at[e.ID] = len(out)
		out = append(out, e)
	}
	if limit > 0 && len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out, sc.Err()
}

/* --- handlers ------------------------------------------------------------------------------------ */

func llmKeyHint(k string) string {
	if len(k) < 8 {
		return ""
	}
	return k[:7] + "…" + k[len(k)-4:]
}

func (srv *Server) llmView() map[string]any {
	c := srv.store.LLMConfig()
	l := srv.llm
	l.mu.Lock()
	u := l.usage
	l.mu.Unlock()
	return map[string]any{
		"enabled": c.Enabled, "model": c.Model, "models": LLMModels, "daily": c.Daily,
		"keySet": c.APIKey != "", "keyHint": llmKeyHint(c.APIKey),
		"today": map[string]int64{"asks": u.asks, "inputTokens": u.in, "outputTokens": u.out, "cacheReadTokens": u.cacheRead},
	}
}

func (srv *Server) getLLM(w http.ResponseWriter, _ *http.Request, _ session) {
	writeJSON(w, http.StatusOK, srv.llmView())
}

// putLLM: a teacher turns 말로 만들기 on or off and sets the daily limit; the operator also sets the
// API key and the model.
func (srv *Server) putLLM(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Enabled *bool   `json:"enabled"`
		Daily   *int    `json:"daily"`
		Model   *string `json:"model"`
		APIKey  *string `json:"apiKey"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if (in.Model != nil || in.APIKey != nil) && s.Role != RoleOperator {
		writeErr(w, http.StatusForbidden, "role", "API 키와 모델은 운영자(관리자) 계정만 바꿀 수 있어요.")
		return
	}
	c := srv.store.LLMConfig()
	if in.Daily != nil {
		if *in.Daily < 1 || *in.Daily > llmMaxDaily {
			writeErr(w, http.StatusBadRequest, "bad_input", fmt.Sprintf("하루 횟수는 1~%d번이에요.", llmMaxDaily))
			return
		}
		c.Daily = *in.Daily
	}
	if in.Model != nil {
		known := false
		for _, m := range LLMModels {
			known = known || m == *in.Model
		}
		if !known {
			writeErr(w, http.StatusBadRequest, "bad_input", "고를 수 있는 모델이 아니에요.")
			return
		}
		c.Model = *in.Model
	}
	if in.APIKey != nil {
		k := strings.TrimSpace(*in.APIKey)
		if k != "" && (!strings.HasPrefix(k, "sk-ant-") || len(k) > 200 || strings.ContainsAny(k, " \n\t")) {
			writeErr(w, http.StatusBadRequest, "bad_input", "Anthropic API 키(sk-ant-…)가 아니에요.")
			return
		}
		c.APIKey = k
	}
	if in.Enabled != nil {
		c.Enabled = *in.Enabled
	}
	if c.Enabled && c.APIKey == "" {
		writeErr(w, http.StatusBadRequest, "no_key", "먼저 API 키를 넣어 주세요.")
		return
	}
	if err := srv.store.SetLLMConfig(c); err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, srv.llmView())
}

func askerKey(s session) string {
	if s.Role == RoleStudent {
		return s.ClassID + "/" + strconv.Itoa(s.No)
	}
	return "u/" + s.UserID
}

// myLLM: whether 말로 만들기 is open for me, and how many questions are left today.
func (srv *Server) myLLM(w http.ResponseWriter, _ *http.Request, s session) {
	c := srv.store.LLMConfig()
	open := c.Enabled && c.APIKey != ""
	out := map[string]any{"available": open, "daily": c.Daily, "remaining": srv.llm.remaining(askerKey(s), c.Daily, srv.now())}
	if !open {
		out["reason"] = "선생님이 말로 만들기를 켜지 않았어요."
	}
	writeJSON(w, http.StatusOK, out)
}

func (srv *Server) askLLM(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Text    string     `json:"text"`
		Context LLMContext `json:"context"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Text = strings.TrimSpace(in.Text)
	if in.Text == "" || utf8.RuneCountInString(in.Text) > llmMaxText {
		writeErr(w, http.StatusBadRequest, "bad_input", fmt.Sprintf("말은 1~%d자로 적어 주세요.", llmMaxText))
		return
	}
	if err := in.Context.check(); err != nil {
		srv.fail(w, err)
		return
	}
	c := srv.store.LLMConfig()
	if !c.Enabled || c.APIKey == "" {
		writeErr(w, http.StatusServiceUnavailable, "off", "선생님이 말로 만들기를 켜지 않았어요.")
		return
	}
	key := askerKey(s)
	remaining, wait, ok := srv.llm.take(key, c.Daily, srv.now())
	if !ok {
		if wait > 0 {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "slow", "message": "조금 있다가 다시 물어봐 주세요.", "retryAfter": int(wait.Seconds()) + 1})
		} else {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "daily", "message": fmt.Sprintf("오늘 물어볼 수 있는 %d번을 다 썼어요. 블록을 직접 고쳐 보세요.", c.Daily)})
		}
		return
	}
	select {
	case srv.llm.slots <- struct{}{}:
		defer func() { <-srv.llm.slots }()
	default:
		srv.llm.refund(key)
		writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "busy", "message": "지금 묻는 친구가 많아요. 잠시 뒤에 다시 물어봐 주세요.", "retryAfter": 5})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), llmTimeout+5*time.Second)
	defer cancel()
	ans, usage, err := srv.llm.call(ctx, c, userTurn(in.Text, in.Context))
	srv.llm.count(usage)
	if err == nil {
		ans, err = ans.tidy()
	}
	entry := LLMLogEntry{ID: newLLMID(), Time: srv.now().UTC().Format(time.RFC3339), Text: in.Text, Model: c.Model, In: usage.In, Out: usage.Out}
	if s.Role == RoleStudent {
		entry.No = s.No
	} else {
		entry.User = s.UserID
	}
	switch {
	case errors.Is(err, errRefused):
		ans, err = LLMAnswer{OK: false, Explain: "이 말로는 로봇 프로그램을 만들 수 없어요. 로봇이 할 동작을 다시 말해 주세요."}, nil
	case err != nil:
		entry.Error = shortErr(err)
		if srv.Logf != nil {
			srv.Logf("llm: %s", entry.Error)
		}
		if usage.In == 0 {
			srv.llm.refund(key)
		}
		_ = srv.store.appendLLMLog(s.ClassID, entry)
		writeErr(w, http.StatusBadGateway, "llm", "AI 에게 답을 받지 못했어요. 잠시 뒤에 다시 물어봐 주세요.")
		return
	}
	entry.OK, entry.Lines, entry.Explain = ans.OK, ans.Lines, ans.Explain
	if err := srv.store.appendLLMLog(s.ClassID, entry); err != nil && srv.Logf != nil {
		srv.Logf("llm log: %v", err)
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": entry.ID, "ok": ans.OK, "lines": ans.Lines, "explain": ans.Explain, "remaining": remaining})
}

// shortErr: the API's status and type, never the key or the request.
func shortErr(err error) string {
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) {
		return fmt.Sprintf("API %d %s", apiErr.StatusCode, apiErr.Type())
	}
	msg := err.Error()
	if len(msg) > 160 {
		msg = msg[:160]
	}
	return msg
}

// insertedLLM: the student put an answer into the block editor.
func (srv *Server) insertedLLM(w http.ResponseWriter, r *http.Request, s session) {
	id := r.PathValue("id")
	if !reLLMID.MatchString(id) {
		writeErr(w, http.StatusBadRequest, "bad_input", "올바르지 않은 번호예요.")
		return
	}
	e := LLMLogEntry{ID: id, Time: srv.now().UTC().Format(time.RFC3339), No: s.No, OK: true, Inserted: true}
	if err := srv.store.appendLLMLog(s.ClassID, e); err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// classLLM: the class's 말로 만들기 log for its teacher.
func (srv *Server) classLLM(w http.ResponseWriter, r *http.Request, s session) {
	id := r.PathValue("id")
	if _, err := srv.store.Class(id, owner(s)); err != nil {
		srv.fail(w, err)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 2000 {
		limit = 500
	}
	out, err := srv.store.LLMLog(id, limit)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": out})
}
