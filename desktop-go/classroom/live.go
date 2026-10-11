package classroom

import (
	"sort"
	"time"
)

// The teacher's live grid, kept up to date as events arrive: per student where they are (the object
// of their latest event), when they last did something, when the server last heard from them, and the
// problems they keep failing. The same rules are in web-typescript/src/engine/account/live.ts, which
// the dashboard can also run on the event feed.

type liveRec struct {
	LastSeen     int64
	LastActivity int64
	Place        *Place
	// FailsSincePass: failed events per object since its last pass.
	FailsSincePass map[string]int
	Completed      int
}

// Place: the object of the student's latest event.
type Place struct {
	Object string `json:"object"`
	Verb   string `json:"verb"`
	At     int64  `json:"at"`
}

func storedMs(st *Statement) int64 {
	if t, err := time.Parse(time.RFC3339Nano, st.Stored); err == nil {
		return t.UnixMilli()
	}
	return 0
}

func (r *liveRec) apply(st *Statement) {
	at := storedMs(st)
	if at > r.LastActivity {
		r.LastActivity = at
	}
	key := verbKey(st.Verb.ID)
	if r.Place == nil || at >= r.Place.At {
		r.Place = &Place{Object: st.Object.ID, Verb: key, At: at}
	}
	switch key {
	case "failed":
		if r.FailsSincePass == nil {
			r.FailsSincePass = map[string]int{}
		}
		r.FailsSincePass[st.Object.ID]++
	case "passed":
		delete(r.FailsSincePass, st.Object.ID)
	case "completed":
		r.Completed++
	}
}

// LiveOptions: when a student is flagged.
type LiveOptions struct {
	StuckFails     int           // same object failed this many times since its last pass → "stuck"
	Idle           time.Duration // online but no event for this long → "idle"
	OfflineAfter   time.Duration // not heard from for this long → "offline"
	LockedStudents map[int]bool  // PIN locked out after wrong tries → "locked"
}

func DefaultLiveOptions() LiveOptions {
	return LiveOptions{StuckFails: 3, Idle: 5 * time.Minute, OfflineAfter: 2 * time.Minute}
}

type Stuck struct {
	Object string `json:"object"`
	Fails  int    `json:"fails"`
}

// LiveRow: one student in the grid. Times are ms since 1970 (0: never).
type LiveRow struct {
	No           int      `json:"no"`
	LastSeen     int64    `json:"lastSeen"`
	LastActivity int64    `json:"lastActivity"`
	Place        *Place   `json:"place"`
	Flags        []string `json:"flags"`
	StuckOn      []Stuck  `json:"stuckOn"`
	Completed    int      `json:"completed"`
}

// rowFor applies the rules to one record (nil: nothing heard).
func rowFor(no int, r *liveRec, now time.Time, o LiveOptions) LiveRow {
	row := LiveRow{No: no, Flags: []string{}, StuckOn: []Stuck{}}
	if r != nil {
		row.LastSeen, row.LastActivity, row.Place, row.Completed = r.LastSeen, r.LastActivity, r.Place, r.Completed
		for obj, n := range r.FailsSincePass {
			if n >= o.StuckFails {
				row.StuckOn = append(row.StuckOn, Stuck{obj, n})
			}
		}
		sort.Slice(row.StuckOn, func(i, j int) bool { return row.StuckOn[i].Object < row.StuckOn[j].Object })
	}
	ms := now.UnixMilli()
	heard := row.LastSeen
	if row.LastActivity > heard {
		heard = row.LastActivity
	}
	switch {
	case heard == 0:
		row.Flags = append(row.Flags, "never")
	case ms-heard >= o.OfflineAfter.Milliseconds():
		row.Flags = append(row.Flags, "offline")
	case row.LastActivity == 0 || ms-row.LastActivity >= o.Idle.Milliseconds():
		row.Flags = append(row.Flags, "idle")
	}
	if len(row.StuckOn) > 0 {
		row.Flags = append(row.Flags, "stuck")
	}
	if o.LockedStudents[no] {
		row.Flags = append(row.Flags, "locked")
	}
	return row
}

// Live: the grid for a class, one row per student in 번호 order.
func (s *Store) Live(classID, owner string, o LiveOptions) ([]LiveRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return nil, ErrNotFound
	}
	lg := s.logs[classID]
	now := s.now()
	rows := make([]LiveRow, 0, len(c.Students))
	for _, st := range c.Students {
		rows = append(rows, rowFor(st.No, lg.live[st.No], now, o))
	}
	return rows, nil
}
