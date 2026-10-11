package classroom

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

// The class server's data, in one folder on the teacher's PC:
//
//	db.json            accounts (hashes only), classes, students (번호 + PIN hash — no names), sessions
//	                   (token hashes), cloud sync settings. Rewritten whole, atomically (temp file + rename).
//	secret.key         32 random bytes: the pepper for PIN/password hashes and the key for cloud pseudonyms.
//	                   Kept apart from db.json so a copy of db.json alone cannot be brute-forced or re-identified.
//	events/<class>.jsonl  the class's learning events, one statement per line, append-only.
//
// One mutex guards everything; slow work (PBKDF2) is done outside it.

type Role string

const (
	RoleOperator Role = "operator"
	RoleTeacher  Role = "teacher"
	RoleStudent  Role = "student"
)

type User struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Role      Role   `json:"role"`
	Hash      string `json:"hash"`
	Disabled  bool   `json:"disabled,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

type Student struct {
	No        int    `json:"no"`
	PinHash   string `json:"pinHash"`
	CreatedAt int64  `json:"createdAt"`
}

type Class struct {
	ID          string     `json:"id"`
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	OwnerID     string     `json:"ownerId"`
	CreatedAt   int64      `json:"createdAt"`
	Archived    bool       `json:"archived,omitempty"`
	OpenLessons []string   `json:"openLessons"`
	Students    []*Student `json:"students"`
	// SyncedSeq: events up to this sequence number are in the cloud.
	SyncedSeq int64 `json:"syncedSeq"`
}

type session struct {
	Hash      string `json:"hash"`
	Role      Role   `json:"role"`
	UserID    string `json:"userId,omitempty"`
	ClassID   string `json:"classId,omitempty"`
	No        int    `json:"no,omitempty"`
	ExpiresAt int64  `json:"expiresAt"`
}

type SyncConfig struct {
	Enabled     bool   `json:"enabled"`
	URL         string `json:"url"`
	APIKey      string `json:"apiKey"`
	IntervalSec int    `json:"intervalSec"`
}

type DeleteRequest struct {
	Class   string `json:"class"`
	Student string `json:"student,omitempty"`
}

type SyncStatus struct {
	LastOKAt       int64           `json:"lastOkAt"`
	LastError      string          `json:"lastError,omitempty"`
	LastErrorAt    int64           `json:"lastErrorAt,omitempty"`
	Sent           int64           `json:"sent"`
	PendingDeletes []DeleteRequest `json:"pendingDeletes,omitempty"`
}

type dbFile struct {
	Version  int        `json:"version"`
	ServerID string     `json:"serverId"`
	Users    []*User    `json:"users"`
	Classes  []*Class   `json:"classes"`
	Sessions []*session `json:"sessions"`
	Sync     SyncConfig `json:"sync"`
	SyncStat SyncStatus `json:"syncStatus"`
	// AllowedOrigins: extra web origins allowed to call the API (besides the page itself and the
	// simulator program on a student's PC, http://127.0.0.1:47280).
	AllowedOrigins []string `json:"allowedOrigins,omitempty"`
}

// classLog: what is kept in memory of a class's events.
type classLog struct {
	lastSeq int64
	ids     map[string]bool
	tail    []Statement
	live    map[int]*liveRec
}

const (
	tailMax        = 20_000
	StudentSession = 12 * time.Hour
	TeacherSession = 12 * time.Hour
	maxStudents    = 99
	maxIssue       = 60
)

type Store struct {
	mu        sync.Mutex
	dir       string
	db        dbFile
	pepper    []byte
	pseudoKey []byte
	logs      map[string]*classLog
	now       func() time.Time
}

var (
	ErrExists    = errors.New("exists")
	ErrNotFound  = errors.New("not found")
	ErrArchived  = errors.New("archived")
	ErrNotSetup  = errors.New("setup done")
	reUsername   = regexp.MustCompile(`^[\p{L}\p{N}._-]{3,32}$`)
	reLessonID   = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,40}$`)
	errBadName   = fmt.Errorf("%w: 이름은 1~40자", errBadInput)
	errBadUser   = fmt.Errorf("%w: 아이디는 3~32자의 글자 · 숫자 · . _ -", errBadInput)
	errBadPass   = fmt.Errorf("%w: 비밀번호는 8~128자", errBadInput)
	errBadCount  = fmt.Errorf("%w: 한 번에 1~%d명, 번호는 1~%d", errBadInput, maxIssue, maxStudents)
	errBadLesson = fmt.Errorf("%w: 차시 이름이 올바르지 않음", errBadInput)
)

// Open loads (or creates) the data folder.
func Open(dir string, now func() time.Time) (*Store, error) {
	if now == nil {
		now = time.Now
	}
	if err := os.MkdirAll(filepath.Join(dir, "events"), 0o700); err != nil {
		return nil, err
	}
	s := &Store{dir: dir, logs: map[string]*classLog{}, now: now}
	_, dbErr := os.Stat(filepath.Join(dir, "db.json"))
	secret, err := loadOrCreateSecret(filepath.Join(dir, "secret.key"), dbErr == nil)
	if err != nil {
		return nil, err
	}
	s.pepper = deriveKey(secret, "hash-pepper")
	s.pseudoKey = deriveKey(secret, "cloud-pseudonym")
	b, err := os.ReadFile(filepath.Join(dir, "db.json"))
	switch {
	case errors.Is(err, os.ErrNotExist):
		id := make([]byte, 8)
		if _, err := rand.Read(id); err != nil {
			return nil, err
		}
		s.db = dbFile{Version: 1, ServerID: hex.EncodeToString(id), Sync: SyncConfig{IntervalSec: 300}}
		if err := s.saveLocked(); err != nil {
			return nil, err
		}
	case err != nil:
		return nil, err
	default:
		if err := json.Unmarshal(b, &s.db); err != nil {
			return nil, fmt.Errorf("db.json: %w", err)
		}
	}
	for _, c := range s.db.Classes {
		if err := s.loadLog(c.ID); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// loadOrCreateSecret reads secret.key, or makes one for a new data folder. With accounts already in
// db.json a missing key is an error: a new key would silently make every PIN and password fail.
func loadOrCreateSecret(p string, haveDB bool) ([]byte, error) {
	b, err := os.ReadFile(p)
	if err == nil {
		k, err := hex.DecodeString(strings.TrimSpace(string(b)))
		if err != nil || len(k) < 32 {
			return nil, fmt.Errorf("%s: 올바르지 않음", p)
		}
		return k, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if haveDB {
		return nil, fmt.Errorf("%s 가 없어요: db.json 과 같은 폴더에 백업해 둔 secret.key 를 다시 넣어 주세요", p)
	}
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		return nil, err
	}
	if err := writeAtomic(p, []byte(hex.EncodeToString(k)+"\n")); err != nil {
		return nil, err
	}
	return k, nil
}

// writeAtomic: write to a temp file in the same folder, flush to disk, then rename over the target —
// a crash leaves either the old file or the new one, never half of one.
func writeAtomic(p string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(p), "."+filepath.Base(p)+".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name) // no-op after a successful rename
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	_ = os.Chmod(name, 0o600)
	return os.Rename(name, p)
}

func (s *Store) saveLocked() error {
	now := s.now().UnixMilli()
	keep := s.db.Sessions[:0]
	for _, x := range s.db.Sessions {
		if x.ExpiresAt > now {
			keep = append(keep, x)
		}
	}
	s.db.Sessions = keep
	b, err := json.MarshalIndent(&s.db, "", " ")
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(s.dir, "db.json"), b)
}

func (s *Store) eventsPath(classID string) string {
	return filepath.Join(s.dir, "events", classID+".jsonl")
}

// loadLog reads a class's event file into memory (sequence, ids for de-duplication, recent tail, live state).
func (s *Store) loadLog(classID string) error {
	lg := &classLog{ids: map[string]bool{}, live: map[int]*liveRec{}}
	s.logs[classID] = lg
	f, err := os.Open(s.eventsPath(classID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	return scanEvents(f, func(st Statement) {
		lg.add(st)
	})
}

// scanEvents reads JSON lines; a damaged line (e.g. cut by a power loss) is skipped.
func scanEvents(r io.Reader, fn func(Statement)) error {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		var st Statement
		if json.Unmarshal(line, &st) == nil && st.Seq > 0 {
			fn(st)
		}
	}
	return sc.Err()
}

func (lg *classLog) add(st Statement) {
	if st.Seq > lg.lastSeq {
		lg.lastSeq = st.Seq
	}
	lg.ids[st.ID] = true
	lg.tail = append(lg.tail, st)
	if len(lg.tail) > tailMax {
		lg.tail = append([]Statement(nil), lg.tail[len(lg.tail)-tailMax/2:]...)
	}
	no := st.studentNo()
	r := lg.live[no]
	if r == nil {
		r = &liveRec{}
		lg.live[no] = r
	}
	r.apply(&st)
}

/* --- accounts ------------------------------------------------------------------------------------ */

func (s *Store) NeedsSetup() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.db.Users) == 0
}

func (s *Store) ServerID() string { return s.db.ServerID }

func checkUserPass(username, password string) error {
	if !reUsername.MatchString(username) {
		return errBadUser
	}
	if n := utf8.RuneCountInString(password); n < 8 || n > 128 {
		return errBadPass
	}
	return nil
}

// Setup: the first account on a new server (an operator), only while there is none.
func (s *Store) Setup(username, password string) (*User, error) {
	if err := checkUserPass(username, password); err != nil {
		return nil, err
	}
	h, err := HashSecret(password, s.pepper, PasswordIterations)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.db.Users) > 0 {
		return nil, ErrNotSetup
	}
	return s.addUserLocked(username, h, RoleOperator)
}

// CreateUser: a teacher (or another operator) account, made by an operator.
func (s *Store) CreateUser(username, password string, role Role) (*User, error) {
	if role != RoleTeacher && role != RoleOperator {
		return nil, fmt.Errorf("%w: role", errBadInput)
	}
	if err := checkUserPass(username, password); err != nil {
		return nil, err
	}
	h, err := HashSecret(password, s.pepper, PasswordIterations)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addUserLocked(username, h, role)
}

func (s *Store) addUserLocked(username, hash string, role Role) (*User, error) {
	for _, u := range s.db.Users {
		if strings.EqualFold(u.Username, username) {
			return nil, ErrExists
		}
	}
	u := &User{ID: "u_" + randomToken(9), Username: username, Role: role, Hash: hash, CreatedAt: s.now().UnixMilli()}
	s.db.Users = append(s.db.Users, u)
	if err := s.saveLocked(); err != nil {
		s.db.Users = s.db.Users[:len(s.db.Users)-1]
		return nil, err
	}
	cp := *u
	return &cp, nil
}

// UpdateUser: a new password and/or disabled. Disabling also ends the user's sessions.
func (s *Store) UpdateUser(id string, password *string, disabled *bool) (*User, error) {
	var h string
	if password != nil {
		if n := utf8.RuneCountInString(*password); n < 8 || n > 128 {
			return nil, errBadPass
		}
		var err error
		if h, err = HashSecret(*password, s.pepper, PasswordIterations); err != nil {
			return nil, err
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	u := s.userLocked(id)
	if u == nil {
		return nil, ErrNotFound
	}
	if h != "" {
		u.Hash = h
	}
	if disabled != nil {
		u.Disabled = *disabled
	}
	if h != "" || u.Disabled {
		s.dropSessionsLocked(func(x *session) bool { return x.UserID == id })
	}
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	cp := *u
	return &cp, nil
}

func (s *Store) userLocked(id string) *User {
	for _, u := range s.db.Users {
		if u.ID == id {
			return u
		}
	}
	return nil
}

func (s *Store) Users() []User {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]User, 0, len(s.db.Users))
	for _, u := range s.db.Users {
		out = append(out, *u)
	}
	return out
}

// CheckPassword: the user when username and password match an enabled account. The hash is checked
// outside the lock, and against a dummy hash for an unknown name (same time either way).
func (s *Store) CheckPassword(username, password string) (*User, bool) {
	s.mu.Lock()
	var found *User
	for _, u := range s.db.Users {
		if strings.EqualFold(u.Username, username) {
			cp := *u
			found = &cp
		}
	}
	s.mu.Unlock()
	if found == nil {
		VerifySecret(dummyHash, password, s.pepper)
		return nil, false
	}
	if !VerifySecret(found.Hash, password, s.pepper) || found.Disabled {
		return nil, false
	}
	return found, true
}

// CheckPIN: the class and 번호 when the PIN matches (class not archived).
func (s *Store) CheckPIN(code string, no int, pin string) (*Class, bool) {
	s.mu.Lock()
	var hash string
	var cls *Class
	if c := s.classByCodeLocked(code); c != nil && !c.Archived {
		if st := c.student(no); st != nil {
			hash = st.PinHash
			cp := *c
			cls = &cp
		}
	}
	s.mu.Unlock()
	if hash == "" {
		VerifySecret(dummyHash, pin, nil)
		return nil, false
	}
	if !ValidPIN(pin) || !VerifySecret(hash, pin, s.pepper) {
		return nil, false
	}
	return cls, true
}

/* --- sessions ------------------------------------------------------------------------------------ */

// NewSession: a random token (only its hash is kept) valid for ttl.
func (s *Store) NewSession(x session, ttl time.Duration) (string, int64, error) {
	token := randomToken(32)
	x.Hash = tokenHash(token)
	x.ExpiresAt = s.now().Add(ttl).UnixMilli()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.db.Sessions = append(s.db.Sessions, &x)
	if err := s.saveLocked(); err != nil {
		return "", 0, err
	}
	return token, x.ExpiresAt, nil
}

// Session: the live session for a token; also checks that its user or class still allows it.
func (s *Store) Session(token string) (session, bool) {
	if token == "" {
		return session{}, false
	}
	h := tokenHash(token)
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now().UnixMilli()
	for _, x := range s.db.Sessions {
		if x.Hash != h || x.ExpiresAt <= now {
			continue
		}
		switch x.Role {
		case RoleStudent:
			c := s.classLocked(x.ClassID)
			if c == nil || c.Archived || c.student(x.No) == nil {
				return session{}, false
			}
		default:
			u := s.userLocked(x.UserID)
			if u == nil || u.Disabled || u.Role != x.Role {
				return session{}, false
			}
		}
		return *x, true
	}
	return session{}, false
}

func (s *Store) EndSession(token string) {
	h := tokenHash(token)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.dropSessionsLocked(func(x *session) bool { return x.Hash == h }) > 0 {
		_ = s.saveLocked()
	}
}

func (s *Store) dropSessionsLocked(match func(*session) bool) int {
	keep := s.db.Sessions[:0]
	n := 0
	for _, x := range s.db.Sessions {
		if match(x) {
			n++
			continue
		}
		keep = append(keep, x)
	}
	s.db.Sessions = keep
	return n
}

// EndClassSessions: log every student of the class out (shared PCs at the end of a lesson).
func (s *Store) EndClassSessions(classID string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	n := s.dropSessionsLocked(func(x *session) bool { return x.Role == RoleStudent && x.ClassID == classID })
	if n > 0 {
		_ = s.saveLocked()
	}
	return n
}

/* --- classes and students ------------------------------------------------------------------------ */

func (c *Class) student(no int) *Student {
	for _, st := range c.Students {
		if st.No == no {
			return st
		}
	}
	return nil
}

func (s *Store) classLocked(id string) *Class {
	for _, c := range s.db.Classes {
		if c.ID == id {
			return c
		}
	}
	return nil
}

func (s *Store) classByCodeLocked(code string) *Class {
	code = strings.ToUpper(strings.TrimSpace(code))
	for _, c := range s.db.Classes {
		if c.Code == code {
			return c
		}
	}
	return nil
}

// ClassView: a class as the API shows it (no PIN hashes).
type ClassView struct {
	ID          string   `json:"id"`
	Code        string   `json:"code"`
	Name        string   `json:"name"`
	OwnerID     string   `json:"ownerId"`
	CreatedAt   int64    `json:"createdAt"`
	Archived    bool     `json:"archived"`
	OpenLessons []string `json:"openLessons"`
	Students    []int    `json:"students"`
	Events      int64    `json:"events"`
}

func (s *Store) viewLocked(c *Class) ClassView {
	nos := make([]int, 0, len(c.Students))
	for _, st := range c.Students {
		nos = append(nos, st.No)
	}
	sort.Ints(nos)
	var n int64
	if lg := s.logs[c.ID]; lg != nil {
		n = lg.lastSeq
	}
	open := c.OpenLessons
	if open == nil {
		open = []string{}
	}
	return ClassView{c.ID, c.Code, c.Name, c.OwnerID, c.CreatedAt, c.Archived, append([]string(nil), open...), nos, n}
}

// Classes: every class (owner "" ) or one teacher's.
func (s *Store) Classes(owner string) []ClassView {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []ClassView{}
	for _, c := range s.db.Classes {
		if owner == "" || c.OwnerID == owner {
			out = append(out, s.viewLocked(c))
		}
	}
	return out
}

// Class: one class, and whether owner may see it ("" = operator, all).
func (s *Store) Class(id, owner string) (ClassView, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(id)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return ClassView{}, ErrNotFound
	}
	return s.viewLocked(c), nil
}

func cleanName(name string) (string, error) {
	name = strings.Join(strings.FieldsFunc(name, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }), " ")
	if n := utf8.RuneCountInString(name); n < 1 || n > 40 {
		return "", errBadName
	}
	return name, nil
}

func (s *Store) CreateClass(owner, name string) (ClassView, error) {
	name, err := cleanName(name)
	if err != nil {
		return ClassView{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	code := newClassCode()
	for s.classByCodeLocked(code) != nil {
		code = newClassCode()
	}
	c := &Class{ID: "c_" + randomToken(9), Code: code, Name: name, OwnerID: owner, CreatedAt: s.now().UnixMilli(), OpenLessons: []string{"*"}, Students: []*Student{}}
	s.db.Classes = append(s.db.Classes, c)
	if err := s.saveLocked(); err != nil {
		s.db.Classes = s.db.Classes[:len(s.db.Classes)-1]
		return ClassView{}, err
	}
	s.logs[c.ID] = &classLog{ids: map[string]bool{}, live: map[int]*liveRec{}}
	return s.viewLocked(c), nil
}

// Issued: a new student's 번호 and PIN — returned once, never stored in the clear.
type Issued struct {
	No  int    `json:"no"`
	PIN string `json:"pin"`
}

// IssueStudents adds count students numbered from `from` (0: after the highest 번호 so far).
func (s *Store) IssueStudents(classID, owner string, count, from int) ([]Issued, error) {
	if count < 1 || count > maxIssue || from < 0 || from > maxStudents {
		return nil, errBadCount
	}
	s.mu.Lock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		s.mu.Unlock()
		return nil, ErrNotFound
	}
	if c.Archived {
		s.mu.Unlock()
		return nil, ErrArchived
	}
	if from == 0 {
		from = 1
		for _, st := range c.Students {
			if st.No >= from {
				from = st.No + 1
			}
		}
	}
	if from+count-1 > maxStudents {
		s.mu.Unlock()
		return nil, errBadCount
	}
	for no := from; no < from+count; no++ {
		if c.student(no) != nil {
			s.mu.Unlock()
			return nil, fmt.Errorf("%w: %d번은 이미 있음", ErrExists, no)
		}
	}
	s.mu.Unlock()

	// PINs and their hashes, outside the lock (PBKDF2 is slow on purpose).
	out := make([]Issued, 0, count)
	hashes := make([]string, 0, count)
	for no := from; no < from+count; no++ {
		pin, err := NewPIN()
		if err != nil {
			return nil, err
		}
		h, err := HashSecret(pin, s.pepper, PinIterations)
		if err != nil {
			return nil, err
		}
		out = append(out, Issued{no, pin})
		hashes = append(hashes, h)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	c = s.classLocked(classID)
	if c == nil {
		return nil, ErrNotFound
	}
	for _, is := range out {
		if c.student(is.No) != nil {
			return nil, fmt.Errorf("%w: %d번은 이미 있음", ErrExists, is.No)
		}
	}
	now := s.now().UnixMilli()
	for i, is := range out {
		c.Students = append(c.Students, &Student{No: is.No, PinHash: hashes[i], CreatedAt: now})
	}
	sort.Slice(c.Students, func(i, j int) bool { return c.Students[i].No < c.Students[j].No })
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return out, nil
}

// ResetPIN gives a student a new PIN (and ends the student's sessions).
func (s *Store) ResetPIN(classID, owner string, no int) (Issued, error) {
	pin, err := NewPIN()
	if err != nil {
		return Issued{}, err
	}
	h, err := HashSecret(pin, s.pepper, PinIterations)
	if err != nil {
		return Issued{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return Issued{}, ErrNotFound
	}
	st := c.student(no)
	if st == nil {
		return Issued{}, ErrNotFound
	}
	st.PinHash = h
	s.dropSessionsLocked(func(x *session) bool { return x.Role == RoleStudent && x.ClassID == classID && x.No == no })
	if err := s.saveLocked(); err != nil {
		return Issued{}, err
	}
	return Issued{no, pin}, nil
}

// RemoveStudent deletes a student, the student's sessions and every event of the student (here, and —
// when sync is on — a deletion request to the cloud).
func (s *Store) RemoveStudent(classID, owner string, no int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) || c.student(no) == nil {
		return ErrNotFound
	}
	keep := c.Students[:0]
	for _, st := range c.Students {
		if st.No != no {
			keep = append(keep, st)
		}
	}
	c.Students = keep
	s.dropSessionsLocked(func(x *session) bool { return x.Role == RoleStudent && x.ClassID == classID && x.No == no })
	if err := s.rewriteEventsLocked(classID, func(st Statement) bool { return st.studentNo() != no }); err != nil {
		return err
	}
	if s.db.Sync.Enabled {
		s.db.SyncStat.PendingDeletes = append(s.db.SyncStat.PendingDeletes, DeleteRequest{
			Class:   pseudonym(s.pseudoKey, "class", classID, 16),
			Student: pseudonym(s.pseudoKey, "student", fmt.Sprintf("%s/%d", classID, no), 20),
		})
	}
	return s.saveLocked()
}

// rewriteEventsLocked keeps the events for which keep is true (atomic rewrite), then reloads the log.
func (s *Store) rewriteEventsLocked(classID string, keep func(Statement) bool) error {
	p := s.eventsPath(classID)
	f, err := os.Open(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	err = scanEvents(f, func(st Statement) {
		if keep(st) {
			b, _ := json.Marshal(st)
			buf.Write(b)
			buf.WriteByte('\n')
		}
	})
	f.Close()
	if err != nil {
		return err
	}
	if err := writeAtomic(p, buf.Bytes()); err != nil {
		return err
	}
	last := s.logs[classID]
	if err := s.loadLog(classID); err != nil {
		return err
	}
	// Sequence numbers never go back (the cloud cursor relies on it).
	if last != nil && s.logs[classID].lastSeq < last.lastSeq {
		s.logs[classID].lastSeq = last.lastSeq
	}
	return nil
}

// SetOpenLessons: the lessons (차시 · 현장) students may open; ["*"] = all (a new class starts so), [] = none.
func (s *Store) SetOpenLessons(classID, owner string, open []string) (ClassView, error) {
	if len(open) > 200 {
		return ClassView{}, errBadLesson
	}
	clean := []string{}
	seen := map[string]bool{}
	for _, l := range open {
		if l != "*" && !reLessonID.MatchString(l) {
			return ClassView{}, errBadLesson
		}
		if !seen[l] {
			seen[l] = true
			clean = append(clean, l)
		}
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return ClassView{}, ErrNotFound
	}
	c.OpenLessons = clean
	if err := s.saveLocked(); err != nil {
		return ClassView{}, err
	}
	return s.viewLocked(c), nil
}

// SetArchived: an archived class keeps its data for viewing and export; students can no longer log in.
func (s *Store) SetArchived(classID, owner string, archived bool) (ClassView, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return ClassView{}, ErrNotFound
	}
	c.Archived = archived
	if archived {
		s.dropSessionsLocked(func(x *session) bool { return x.Role == RoleStudent && x.ClassID == classID })
	}
	if err := s.saveLocked(); err != nil {
		return ClassView{}, err
	}
	return s.viewLocked(c), nil
}

// DeleteClass removes an archived class with all its students and events (year-end). confirm must be
// the class code, so it is never done by one stray click.
func (s *Store) DeleteClass(classID, owner, confirm string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return ErrNotFound
	}
	if !c.Archived {
		return fmt.Errorf("%w: 먼저 보관하세요", errBadInput)
	}
	if !strings.EqualFold(strings.TrimSpace(confirm), c.Code) {
		return fmt.Errorf("%w: 확인 코드가 학급 코드와 다름", errBadInput)
	}
	if err := os.Remove(s.eventsPath(classID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	keep := s.db.Classes[:0]
	for _, x := range s.db.Classes {
		if x.ID != classID {
			keep = append(keep, x)
		}
	}
	s.db.Classes = keep
	delete(s.logs, classID)
	s.dropSessionsLocked(func(x *session) bool { return x.ClassID == classID })
	if s.db.Sync.Enabled {
		s.db.SyncStat.PendingDeletes = append(s.db.SyncStat.PendingDeletes, DeleteRequest{Class: pseudonym(s.pseudoKey, "class", classID, 16)})
	}
	return s.saveLocked()
}

// StudentClass: what a logged-in student may know of the class.
func (s *Store) StudentClass(classID string) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil {
		return nil, ErrNotFound
	}
	return map[string]any{"code": c.Code, "name": c.Name, "openLessons": append([]string{}, c.OpenLessons...)}, nil
}

/* --- events -------------------------------------------------------------------------------------- */

// Rejected: one statement of a batch that was not kept, and why.
type Rejected struct {
	Index  int    `json:"i"`
	ID     string `json:"id,omitempty"`
	Reason string `json:"reason"`
}

// Ingest validates and appends a student's batch. A statement id seen before is counted as a
// duplicate and not stored again (the client's queue may resend after a lost reply).
func (s *Store) Ingest(classID string, no int, batch []Statement) (accepted, duplicate int, rejected []Rejected, err error) {
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil {
		return 0, 0, nil, ErrNotFound
	}
	if c.Archived {
		return 0, 0, nil, ErrArchived
	}
	lg := s.logs[classID]
	var buf bytes.Buffer
	var fresh []Statement
	inBatch := map[string]bool{}
	seq := lg.lastSeq
	rejected = []Rejected{}
	for i := range batch {
		st := batch[i]
		if why := st.validate(now); why != "" {
			rejected = append(rejected, Rejected{i, st.ID, why})
			continue
		}
		if lg.ids[st.ID] || inBatch[st.ID] {
			duplicate++
			continue
		}
		inBatch[st.ID] = true
		seq++
		st.stamp(s.db.ServerID, c, no, seq, now)
		b, _ := json.Marshal(st)
		buf.Write(b)
		buf.WriteByte('\n')
		fresh = append(fresh, st)
	}
	if len(fresh) > 0 {
		f, err := os.OpenFile(s.eventsPath(classID), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return 0, 0, nil, err
		}
		_, werr := f.Write(buf.Bytes())
		serr := f.Sync()
		cerr := f.Close()
		if werr != nil || serr != nil || cerr != nil {
			return 0, 0, nil, errors.Join(werr, serr, cerr)
		}
		for _, st := range fresh {
			lg.add(st)
		}
	}
	return len(fresh), duplicate, rejected, nil
}

// Events: a class's events after sequence number `after`, at most limit, and the last sequence number.
func (s *Store) Events(classID, owner string, after int64, limit int) ([]Statement, int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return nil, 0, ErrNotFound
	}
	out, err := s.eventsLocked(classID, after, limit)
	return out, s.logs[classID].lastSeq, err
}

func (s *Store) eventsLocked(classID string, after int64, limit int) ([]Statement, error) {
	lg := s.logs[classID]
	out := []Statement{}
	if limit <= 0 {
		limit = 1 << 30
	}
	if len(lg.tail) > 0 && lg.tail[0].Seq <= after+1 {
		for _, st := range lg.tail {
			if st.Seq > after && len(out) < limit {
				out = append(out, st)
			}
		}
		return out, nil
	}
	f, err := os.Open(s.eventsPath(classID))
	if errors.Is(err, os.ErrNotExist) {
		return out, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	err = scanEvents(f, func(st Statement) {
		if st.Seq > after && len(out) < limit {
			out = append(out, st)
		}
	})
	return out, err
}

// Touch: the student was just heard from (for "online" in the live grid).
func (s *Store) Touch(classID string, no int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if lg := s.logs[classID]; lg != nil {
		r := lg.live[no]
		if r == nil {
			r = &liveRec{}
			lg.live[no] = r
		}
		r.LastSeen = s.now().UnixMilli()
	}
}

/* --- cloud sync settings ------------------------------------------------------------------------- */

func (s *Store) SyncConfig() (SyncConfig, SyncStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.db.SyncStat
	st.PendingDeletes = append([]DeleteRequest(nil), st.PendingDeletes...)
	return s.db.Sync, st
}

func (s *Store) SetSyncConfig(c SyncConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.db.Sync = c
	return s.saveLocked()
}

func (s *Store) AllowedOrigins() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.db.AllowedOrigins...)
}
