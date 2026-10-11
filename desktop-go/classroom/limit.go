package classroom

import (
	"sync"
	"time"
)

// limiter: failed logins per key (one student, one username, one IP address). After `max` failures in a
// row the key is locked for `lock`; each further lock doubles, up to `maxLock`. A success clears the key.
// A 4-digit PIN has 10 000 values: with 5 tries per lock and doubling locks, guessing one student's PIN
// takes days, and the per-IP key stops one PC from walking through the whole class.
type limiter struct {
	mu      sync.Mutex
	max     int
	lock    time.Duration
	maxLock time.Duration
	window  time.Duration // failures older than this are forgotten (when not locked)
	keys    map[string]*limitRec
	now     func() time.Time
}

type limitRec struct {
	fails       int
	first       time.Time
	lockedUntil time.Time
	locks       int
}

func newLimiter(max int, lock, maxLock, window time.Duration, now func() time.Time) *limiter {
	return &limiter{max: max, lock: lock, maxLock: maxLock, window: window, keys: map[string]*limitRec{}, now: now}
}

// blocked: how long the key is still locked (0: not locked).
func (l *limiter) blocked(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	r := l.keys[key]
	if r == nil {
		return 0
	}
	if d := r.lockedUntil.Sub(l.now()); d > 0 {
		return d
	}
	return 0
}

// fail records one failure; it returns the lock that starts now, if any.
func (l *limiter) fail(key string) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	r := l.keys[key]
	if r == nil {
		r = &limitRec{}
		l.keys[key] = r
	}
	if r.fails == 0 || now.Sub(r.first) > l.window {
		r.fails, r.first = 0, now
	}
	r.fails++
	if r.fails < l.max {
		return 0
	}
	d := l.lock << r.locks
	if d > l.maxLock || d <= 0 {
		d = l.maxLock
	}
	r.locks++
	r.fails = 0
	r.lockedUntil = now.Add(d)
	return d
}

func (l *limiter) success(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.keys, key)
}

// unlock: the teacher reset the student's PIN.
func (l *limiter) unlock(key string) { l.success(key) }

// sweep forgets keys that are neither locked nor recent (called from time to time).
func (l *limiter) sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	for k, r := range l.keys {
		if now.After(r.lockedUntil) && now.Sub(r.first) > l.window && now.Sub(r.lockedUntil) > l.maxLock {
			delete(l.keys, k)
		}
	}
}

// budget: at most max units per key in each window (events per student), so one runaway page cannot
// fill the teacher's disk. A real lesson sends a few hundred events an hour.
type budget struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	used   map[string]*spend
	now    func() time.Time
}

type spend struct {
	start time.Time
	n     int
}

// take spends n units; it returns how long to wait when the window is used up (0: allowed).
func (b *budget) take(key string, n int) time.Duration {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.now()
	sp := b.used[key]
	if sp == nil || now.Sub(sp.start) >= b.window {
		sp = &spend{start: now}
		b.used[key] = sp
	}
	if sp.n+n > b.max {
		return sp.start.Add(b.window).Sub(now)
	}
	sp.n += n
	return 0
}
