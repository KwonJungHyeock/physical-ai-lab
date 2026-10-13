package classroom

import (
	"fmt"
	"net/http"
	"regexp"
	"sync"
	"time"
	"unicode/utf8"
)

// A lesson the teacher leads (로봇 실습 7 "선생님과 함께"): the teacher's screen says which lesson and
// step the class is on, whether robots may move, whether the answer is shown, and when every robot must
// stop; each student's screen follows it and reports a mark (done, needs help, an answer, group and
// robot role, what the robot did). Kept in memory only: it is the state of the lesson going on now, not
// a record (the record is the learning events). Both sides poll about every 1.5 s. A student following on
// screen also gets "mate": the group's robot PC's mark, so the screen can show what the group's robot did. The same shapes are
// in web-typescript/src/engine/account/lead.ts.

// Lead: what the teacher's screen shows now. Stop is a counter: each increase means "stop all robots".
type Lead struct {
	Lesson string `json:"lesson"`
	Step   int    `json:"step"`
	Gate   bool   `json:"gate"`
	Reveal bool   `json:"reveal"`
	Stop   int    `json:"stop"`
	Rev    int64  `json:"rev"`
	At     int64  `json:"at"`    // ms: the lead started
	Since  int64  `json:"since"` // ms: this step started
}

// Mark: one student's state in the led lesson. Group and Role stay across lessons; the rest belongs to
// Lesson/Step (the screens only count marks of the step on show).
type Mark struct {
	No     int    `json:"no"`
	Group  int    `json:"group"`
	Role   string `json:"role"` // "robot": the group's robot PC · "screen": follows on screen
	Lesson string `json:"lesson"`
	Step   int    `json:"step"`
	Done   bool   `json:"done"`
	Help   bool   `json:"help"`
	Answer string `json:"answer"`
	Robot  string `json:"robot"` // "" · prep · ready · run · done · fail
	Result string `json:"result"`
	At     int64  `json:"at"`
}

const (
	leadMaxStep  = 20
	leadMaxGroup = 12
	// leadIdle: a lead the teacher's screen has not touched for this long is over (the teacher closed the
	// screen without [수업 끝내기]).
	leadIdle = 30 * time.Minute
)

var leadLessonRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,39}$`)

type leadClass struct {
	lead    Lead
	touched time.Time // the teacher's screen last read or changed it
	marks   map[int]*Mark
}

type leadBook struct {
	mu      sync.Mutex
	classes map[string]*leadClass
}

func newLeadBook() *leadBook { return &leadBook{classes: map[string]*leadClass{}} }

// live: the class's lead, nil when none or expired.
func (b *leadBook) live(id string, now time.Time) *leadClass {
	lc := b.classes[id]
	if lc != nil && now.Sub(lc.touched) > leadIdle {
		delete(b.classes, id)
		return nil
	}
	return lc
}

func (b *leadBook) marks(lc *leadClass) []Mark {
	out := []Mark{}
	if lc == nil {
		return out
	}
	for no := 1; no <= 999; no++ { // 번호 order without a sort
		if m := lc.marks[no]; m != nil {
			out = append(out, *m)
		}
	}
	return out
}

func (srv *Server) leadClassOf(w http.ResponseWriter, r *http.Request, s session) (string, bool) {
	id := r.PathValue("id")
	if _, err := srv.store.Class(id, owner(s)); err != nil {
		srv.fail(w, err)
		return "", false
	}
	return id, true
}

func (srv *Server) getLead(w http.ResponseWriter, r *http.Request, s session) {
	id, ok := srv.leadClassOf(w, r, s)
	if !ok {
		return
	}
	b := srv.lead
	b.mu.Lock()
	defer b.mu.Unlock()
	lc := b.live(id, srv.now())
	if lc == nil {
		writeJSON(w, http.StatusOK, map[string]any{"lead": nil, "marks": []Mark{}})
		return
	}
	lc.touched = srv.now()
	writeJSON(w, http.StatusOK, map[string]any{"lead": lc.lead, "marks": b.marks(lc)})
}

func (srv *Server) putLead(w http.ResponseWriter, r *http.Request, s session) {
	id, ok := srv.leadClassOf(w, r, s)
	if !ok {
		return
	}
	var in struct {
		Lesson string `json:"lesson"`
		Step   int    `json:"step"`
		Gate   bool   `json:"gate"`
		Reveal bool   `json:"reveal"`
		Stop   int    `json:"stop"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if !leadLessonRe.MatchString(in.Lesson) || in.Step < 0 || in.Step > leadMaxStep || in.Stop < 0 {
		writeErr(w, http.StatusBadRequest, "bad_input", "수업 단계 값이 올바르지 않아요.")
		return
	}
	now := srv.now()
	ms := now.UnixMilli()
	b := srv.lead
	b.mu.Lock()
	defer b.mu.Unlock()
	lc := b.live(id, now)
	if lc == nil {
		lc = &leadClass{lead: Lead{At: ms, Since: ms}, marks: map[int]*Mark{}}
		b.classes[id] = lc
	}
	l := &lc.lead
	if l.Lesson != in.Lesson || l.Step != in.Step {
		l.Since = ms
	}
	if in.Stop < l.Stop { // a stop already sent cannot be taken back (another tab with an old count)
		in.Stop = l.Stop
	}
	l.Lesson, l.Step, l.Gate, l.Reveal, l.Stop = in.Lesson, in.Step, in.Gate, in.Reveal, in.Stop
	l.Rev++
	lc.touched = now
	writeJSON(w, http.StatusOK, map[string]any{"lead": lc.lead, "marks": b.marks(lc)})
}

func (srv *Server) endLead(w http.ResponseWriter, r *http.Request, s session) {
	id, ok := srv.leadClassOf(w, r, s)
	if !ok {
		return
	}
	b := srv.lead
	b.mu.Lock()
	delete(b.classes, id)
	b.mu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (srv *Server) myLead(w http.ResponseWriter, _ *http.Request, s session) {
	if _, err := srv.store.StudentClass(s.ClassID); err != nil {
		srv.fail(w, err)
		return
	}
	b := srv.lead
	b.mu.Lock()
	defer b.mu.Unlock()
	lc := b.live(s.ClassID, srv.now())
	if lc == nil {
		writeJSON(w, http.StatusOK, map[string]any{"lead": nil, "me": nil, "mate": nil})
		return
	}
	var me, mate any
	if m := lc.marks[s.No]; m != nil {
		me = *m
		if m.Group > 0 && m.Role != "robot" {
			mate = robotOf(lc, m.Group)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"lead": lc.lead, "me": me, "mate": mate})
}

// robotOf: the group's robot PC (the lowest 번호 with the robot role), for its members' screens; nil: none.
func robotOf(lc *leadClass, group int) any {
	var best *Mark
	for _, m := range lc.marks {
		if m.Group == group && m.Role == "robot" && (best == nil || m.No < best.No) {
			best = m
		}
	}
	if best == nil {
		return nil
	}
	return map[string]any{"no": best.No, "lesson": best.Lesson, "step": best.Step, "robot": best.Robot, "result": best.Result}
}

func (srv *Server) putMark(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Group  int    `json:"group"`
		Role   string `json:"role"`
		Lesson string `json:"lesson"`
		Step   int    `json:"step"`
		Done   bool   `json:"done"`
		Help   bool   `json:"help"`
		Answer string `json:"answer"`
		Robot  string `json:"robot"`
		Result string `json:"result"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	switch {
	case in.Group < 0 || in.Group > leadMaxGroup:
		writeErr(w, http.StatusBadRequest, "bad_input", fmt.Sprintf("조 번호는 1~%d 이에요.", leadMaxGroup))
		return
	case in.Role != "" && in.Role != "robot" && in.Role != "screen",
		in.Robot != "" && in.Robot != "prep" && in.Robot != "ready" && in.Robot != "run" && in.Robot != "done" && in.Robot != "fail",
		in.Lesson != "" && !leadLessonRe.MatchString(in.Lesson), in.Step < 0 || in.Step > leadMaxStep:
		writeErr(w, http.StatusBadRequest, "bad_input", "보낸 값이 올바르지 않아요.")
		return
	case utf8.RuneCountInString(in.Answer) > 40 || utf8.RuneCountInString(in.Result) > 80:
		writeErr(w, http.StatusBadRequest, "bad_input", "답이 너무 길어요.")
		return
	}
	b := srv.lead
	b.mu.Lock()
	defer b.mu.Unlock()
	lc := b.live(s.ClassID, srv.now())
	if lc == nil {
		writeErr(w, http.StatusConflict, "no_lead", "선생님이 수업을 끝냈어요.")
		return
	}
	if len(lc.marks) >= 200 && lc.marks[s.No] == nil {
		writeErr(w, http.StatusConflict, "full", "이 수업에 더 들어올 수 없어요.")
		return
	}
	m := &Mark{No: s.No, Group: in.Group, Role: in.Role, Lesson: in.Lesson, Step: in.Step, Done: in.Done,
		Help: in.Help, Answer: in.Answer, Robot: in.Robot, Result: in.Result, At: srv.now().UnixMilli()}
	lc.marks[s.No] = m
	writeJSON(w, http.StatusOK, map[string]any{"lead": lc.lead, "me": *m})
}
