package classroom

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// The class server's JSON API, under APIPrefix. Authentication: "Authorization: Bearer <token>" from a
// login (no cookies, so another web page cannot make the browser call it). Every answer is JSON;
// an error is {"error": "<code>", "message": "<한국어>"} with an HTTP status.
//
// Roles: operator (everything, every class, accounts, cloud sync), teacher (own classes), student
// (own events and own class's open lessons). The route table in Handler says who may call what.

const APIPrefix = "/class-api/v1"

// Port: the class server's port on the LAN (the simulator program itself uses 47280 on 127.0.0.1).
const Port = 47290

// SimulatorOrigins: the simulator program on a student's PC, which calls the teacher's server across
// the LAN (CORS).
var SimulatorOrigins = []string{"http://127.0.0.1:47280", "http://localhost:47280"}

type Server struct {
	store   *Store
	syncer  *Syncer
	student *limiter // per class code + 번호
	user    *limiter // per username
	ip      *limiter // per client address
	flood   *budget  // statements per student per window
	now     func() time.Time
	Logf    func(format string, args ...any)
	// devOrigins: loopback web origins allowed by AllowDevOrigin (off unless the program is started
	// with -dev-origin, for working on the app with `npm run dev` on the class server PC).
	devOrigins []string
	// Addresses: the addresses students open (http://<LAN IP>:47290), shown on the teacher's screen and
	// the login cards; set by the program (classmode.go). nil: none known.
	Addresses func() []string
}

func NewServer(store *Store, syncer *Syncer) *Server {
	now := store.now
	return &Server{
		store:   store,
		syncer:  syncer,
		student: newLimiter(5, time.Minute, time.Hour, 15*time.Minute, now),
		user:    newLimiter(5, time.Minute, time.Hour, 15*time.Minute, now),
		ip:      newLimiter(30, 5*time.Minute, time.Hour, 10*time.Minute, now),
		flood:   &budget{max: 1500, window: 5 * time.Minute, used: map[string]*spend{}, now: now},
		now:     now,
		Logf:    log.Printf,
	}
}

type handlerFunc func(w http.ResponseWriter, r *http.Request, s session)

// Handler: the API routes (mount at APIPrefix + "/").
func (srv *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	p := APIPrefix
	all := []Role{RoleOperator, RoleTeacher, RoleStudent}
	staff := []Role{RoleOperator, RoleTeacher}
	op := []Role{RoleOperator}
	st := []Role{RoleStudent}

	mux.HandleFunc("GET "+p+"/status", srv.status)
	mux.HandleFunc("GET "+p+"/purposes", srv.purposes)
	mux.HandleFunc("POST "+p+"/setup", srv.setup)
	mux.HandleFunc("POST "+p+"/login/teacher", srv.loginTeacher)
	mux.HandleFunc("POST "+p+"/login/student", srv.loginStudent)
	mux.Handle("POST "+p+"/logout", srv.need(all, srv.logout))
	mux.Handle("GET "+p+"/me", srv.need(all, srv.me))

	mux.Handle("GET "+p+"/class", srv.need(st, srv.myClass))
	mux.Handle("POST "+p+"/events", srv.need(st, srv.postEvents))

	mux.Handle("GET "+p+"/teachers", srv.need(op, srv.listTeachers))
	mux.Handle("POST "+p+"/teachers", srv.need(op, srv.createTeacher))
	mux.Handle("POST "+p+"/teachers/{id}", srv.need(op, srv.updateTeacher))
	mux.Handle("GET "+p+"/sync", srv.need(op, srv.getSync))
	mux.Handle("PUT "+p+"/sync", srv.need(op, srv.putSync))
	mux.Handle("POST "+p+"/sync/now", srv.need(op, srv.syncNow))

	mux.Handle("GET "+p+"/classes", srv.need(staff, srv.listClasses))
	mux.Handle("POST "+p+"/classes", srv.need(staff, srv.createClass))
	mux.Handle("GET "+p+"/classes/{id}", srv.need(staff, srv.getClass))
	mux.Handle("DELETE "+p+"/classes/{id}", srv.need(staff, srv.deleteClass))
	mux.Handle("POST "+p+"/classes/{id}/students", srv.need(staff, srv.issueStudents))
	mux.Handle("POST "+p+"/classes/{id}/students/{no}/pin", srv.need(staff, srv.resetPIN))
	mux.Handle("DELETE "+p+"/classes/{id}/students/{no}", srv.need(staff, srv.removeStudent))
	mux.Handle("PUT "+p+"/classes/{id}/lessons", srv.need(staff, srv.setLessons))
	mux.Handle("POST "+p+"/classes/{id}/archive", srv.need(staff, srv.archive))
	mux.Handle("POST "+p+"/classes/{id}/logout-all", srv.need(staff, srv.logoutAll))
	mux.Handle("GET "+p+"/classes/{id}/events", srv.need(staff, srv.events))
	mux.Handle("GET "+p+"/classes/{id}/live", srv.need(staff, srv.live))
	mux.Handle("GET "+p+"/classes/{id}/export", srv.need(staff, srv.export))

	return srv.wrap(mux)
}

/* --- middleware ---------------------------------------------------------------------------------- */

type recorder struct {
	http.ResponseWriter
	status int
}

func (r *recorder) WriteHeader(s int) { r.status = s; r.ResponseWriter.WriteHeader(s) }

// wrap: CORS, security headers, a log line per request (method, path, status — never bodies, so never
// a PIN or password).
func (srv *Server) wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		if origin := r.Header.Get("Origin"); origin != "" {
			if !srv.originAllowed(origin, r.Host, isLoopback(r)) {
				writeErr(w, http.StatusForbidden, "origin", "허용되지 않은 출처에서 온 요청이에요.")
				return
			}
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "600")
				if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
					h.Set("Access-Control-Allow-Private-Network", "true")
				}
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		rec := &recorder{w, http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)
		if srv.Logf != nil {
			srv.Logf("%s %s %d %dms", r.Method, r.URL.Path, rec.status, time.Since(start).Milliseconds())
		}
	})
}

// AllowDevOrigin lets a development copy of the app on this PC (e.g. http://localhost:3000, the Next
// dev server) call the API. Only http loopback origins with a port are taken, and they are honoured
// only for requests that come from this PC itself (originAllowed). Off by default.
func (srv *Server) AllowDevOrigin(origin string) error {
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Port() == "" || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("%w: 개발용 출처는 http://localhost:<포트> 또는 http://127.0.0.1:<포트> 만 돼요", errBadInput)
	}
	host := u.Hostname()
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		return fmt.Errorf("%w: 개발용 출처는 이 PC(루프백) 주소만 돼요", errBadInput)
	}
	srv.devOrigins = append(srv.devOrigins, u.Scheme+"://"+u.Host)
	return nil
}

func (srv *Server) originAllowed(origin, host string, fromHere bool) bool {
	if origin == "http://"+host || origin == "https://"+host {
		return true
	}
	if fromHere {
		for _, o := range srv.devOrigins {
			if origin == o {
				return true
			}
		}
	}
	for _, o := range SimulatorOrigins {
		if origin == o {
			return true
		}
	}
	for _, o := range srv.store.AllowedOrigins() {
		if origin == o {
			return true
		}
	}
	return false
}

// LANOnly lets through only requests from this PC or the local network (private, link-local or
// loopback addresses), and only to an IP address, localhost or a *.local name (a web page cannot
// reach the server through a DNS name it controls — "DNS rebinding").
func LANOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := remoteIP(r)
		if ip == nil || !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()) {
			http.Error(w, "local network only", http.StatusForbidden)
			return
		}
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		host = strings.Trim(strings.ToLower(host), "[]")
		if net.ParseIP(host) == nil && host != "localhost" && !strings.HasSuffix(host, ".local") {
			http.Error(w, "use the address shown on the teacher's screen", http.StatusMisdirectedRequest)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func remoteIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return net.ParseIP(host)
}

func isLoopback(r *http.Request) bool {
	ip := remoteIP(r)
	return ip != nil && ip.IsLoopback()
}

func bearer(r *http.Request) string {
	a := r.Header.Get("Authorization")
	if len(a) > 7 && strings.EqualFold(a[:7], "bearer ") {
		return strings.TrimSpace(a[7:])
	}
	return ""
}

func (srv *Server) need(roles []Role, fn handlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s, ok := srv.store.Session(bearer(r))
		if !ok {
			writeErr(w, http.StatusUnauthorized, "login", "다시 로그인해 주세요.")
			return
		}
		allowed := false
		for _, role := range roles {
			allowed = allowed || s.Role == role
		}
		if !allowed {
			writeErr(w, http.StatusForbidden, "role", "이 기능을 쓸 권한이 없어요.")
			return
		}
		if s.Role == RoleStudent {
			srv.store.Touch(s.ClassID, s.No)
		}
		fn(w, r, s)
	})
}

// owner: the class owner a session is limited to ("" = all classes, for an operator).
func owner(s session) string {
	if s.Role == RoleOperator {
		return ""
	}
	return s.UserID
}

/* --- JSON helpers -------------------------------------------------------------------------------- */

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": code, "message": msg})
}

const maxBody = 1 << 20

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeErr(w, http.StatusRequestEntityTooLarge, "too_big", "보낸 내용이 너무 커요.")
		} else {
			writeErr(w, http.StatusBadRequest, "bad_json", "요청 형식이 올바르지 않아요.")
		}
		return false
	}
	return true
}

// fail maps a store error to an answer.
func (srv *Server) fail(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errBadInput):
		writeErr(w, http.StatusBadRequest, "bad_input", strings.TrimPrefix(err.Error(), errBadInput.Error()+": "))
	case errors.Is(err, ErrNotFound):
		writeErr(w, http.StatusNotFound, "not_found", "찾을 수 없어요.")
	case errors.Is(err, ErrExists):
		writeErr(w, http.StatusConflict, "exists", "이미 있어요. "+strings.TrimPrefix(err.Error(), ErrExists.Error()))
	case errors.Is(err, ErrArchived):
		writeErr(w, http.StatusConflict, "archived", "보관된 학급이에요.")
	case errors.Is(err, ErrNotSetup):
		writeErr(w, http.StatusConflict, "setup_done", "이미 처음 설정을 마쳤어요.")
	default:
		if srv.Logf != nil {
			srv.Logf("error: %v", err)
		}
		writeErr(w, http.StatusInternalServerError, "server", "서버에서 문제가 생겼어요.")
	}
}

func tooMany(w http.ResponseWriter, d time.Duration) {
	secs := int(d.Seconds() + 0.999)
	w.Header().Set("Retry-After", strconv.Itoa(secs))
	writeJSON(w, http.StatusTooManyRequests, map[string]any{
		"error": "locked", "message": fmt.Sprintf("너무 여러 번 틀렸어요. %d분 뒤에 다시 하거나 선생님께 말해 주세요.", (secs+59)/60), "retryAfter": secs,
	})
}

/* --- public -------------------------------------------------------------------------------------- */

func (srv *Server) status(w http.ResponseWriter, r *http.Request) {
	addrs := []string{}
	if srv.Addresses != nil {
		addrs = append(addrs, srv.Addresses()...)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"kind": "robocity-class-server", "version": 1, "needsSetup": srv.store.NeedsSetup(),
		"server": srv.store.ServerID(), "time": srv.now().UnixMilli(), "setupHere": isLoopback(r),
		"addresses": addrs,
	})
}

func (srv *Server) purposes(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"verbs":     VERBS,
		"stored":    "학급 서버(교사 PC)에 번호와 함께 저장합니다. 이름은 저장하지 않습니다.",
		"retention": "학년말 보관 · 삭제 전까지(교사가 학급을 삭제하면 바로 지워집니다).",
		"cloud":     "클라우드 동기화를 켠 경우에만, 이름 · 번호 · 학급 이름 · 서술형 답 없이 가명 ID 로 보냅니다.",
	})
}

type userOut struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	Role      Role   `json:"role"`
	Disabled  bool   `json:"disabled"`
	CreatedAt int64  `json:"createdAt"`
}

func userView(u User) userOut { return userOut{u.ID, u.Username, u.Role, u.Disabled, u.CreatedAt} }

func (srv *Server) setup(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		writeErr(w, http.StatusForbidden, "setup_here", "처음 설정은 학급 서버를 켠 PC 에서만 할 수 있어요.")
		return
	}
	var in struct{ Username, Password string }
	if !readJSON(w, r, &in) {
		return
	}
	u, err := srv.store.Setup(strings.TrimSpace(in.Username), in.Password)
	if err != nil {
		srv.fail(w, err)
		return
	}
	srv.issueUserSession(w, *u)
}

func (srv *Server) issueUserSession(w http.ResponseWriter, u User) {
	token, exp, err := srv.store.NewSession(session{Role: u.Role, UserID: u.ID}, TeacherSession)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "expiresAt": exp, "role": u.Role, "user": userView(u)})
}

func (srv *Server) loginTeacher(w http.ResponseWriter, r *http.Request) {
	var in struct{ Username, Password string }
	if !readJSON(w, r, &in) {
		return
	}
	name := strings.ToLower(strings.TrimSpace(in.Username))
	ku, ki := "u:"+name, "ip:"+remoteIP(r).String()
	if d := max(srv.user.blocked(ku), srv.ip.blocked(ki)); d > 0 {
		tooMany(w, d)
		return
	}
	u, ok := srv.store.CheckPassword(name, in.Password)
	if !ok {
		srv.user.fail(ku)
		srv.ip.fail(ki)
		writeErr(w, http.StatusUnauthorized, "wrong", "아이디나 비밀번호가 맞지 않아요.")
		return
	}
	srv.user.success(ku)
	srv.issueUserSession(w, *u)
}

func studentKey(code string, no int) string {
	return fmt.Sprintf("s:%s/%d", strings.ToUpper(strings.TrimSpace(code)), no)
}

func (srv *Server) loginStudent(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ClassCode string `json:"classCode"`
		No        int    `json:"no"`
		PIN       string `json:"pin"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	ks, ki := studentKey(in.ClassCode, in.No), "ip:"+remoteIP(r).String()
	if d := max(srv.student.blocked(ks), srv.ip.blocked(ki)); d > 0 {
		tooMany(w, d)
		return
	}
	c, ok := srv.store.CheckPIN(in.ClassCode, in.No, in.PIN)
	if !ok {
		srv.student.fail(ks)
		srv.ip.fail(ki)
		writeErr(w, http.StatusUnauthorized, "wrong", "학급 코드, 번호, PIN 을 다시 확인해 주세요.")
		return
	}
	srv.student.success(ks)
	token, exp, err := srv.store.NewSession(session{Role: RoleStudent, ClassID: c.ID, No: in.No}, StudentSession)
	if err != nil {
		srv.fail(w, err)
		return
	}
	srv.store.Touch(c.ID, in.No)
	cls, _ := srv.store.StudentClass(c.ID)
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token, "expiresAt": exp, "role": RoleStudent,
		"student": srv.studentView(c.ID, c.Code, in.No), "class": cls,
	})
}

func (srv *Server) studentView(classID, code string, no int) map[string]any {
	return map[string]any{
		"classId": classID, "classCode": code, "no": no,
		"actor": Actor{ObjectType: "Agent", Account: Account{HomePage: "urn:robocity:class-server:" + srv.store.ServerID(), Name: fmt.Sprintf("%s-%d", code, no)}},
	}
}

func (srv *Server) logout(w http.ResponseWriter, r *http.Request, _ session) {
	srv.store.EndSession(bearer(r))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (srv *Server) me(w http.ResponseWriter, _ *http.Request, s session) {
	out := map[string]any{"role": s.Role, "expiresAt": s.ExpiresAt}
	if s.Role == RoleStudent {
		cls, err := srv.store.StudentClass(s.ClassID)
		if err != nil {
			srv.fail(w, err)
			return
		}
		out["student"] = srv.studentView(s.ClassID, cls["code"].(string), s.No)
		out["class"] = cls
	} else {
		for _, u := range srv.store.Users() {
			if u.ID == s.UserID {
				out["user"] = userView(u)
			}
		}
	}
	writeJSON(w, http.StatusOK, out)
}

/* --- student ------------------------------------------------------------------------------------- */

func (srv *Server) myClass(w http.ResponseWriter, _ *http.Request, s session) {
	cls, err := srv.store.StudentClass(s.ClassID)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, cls)
}

func (srv *Server) postEvents(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Statements []json.RawMessage `json:"statements"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if len(in.Statements) == 0 || len(in.Statements) > maxBatch {
		writeErr(w, http.StatusBadRequest, "batch", fmt.Sprintf("한 번에 1~%d개까지 보낼 수 있어요.", maxBatch))
		return
	}
	if wait := srv.flood.take(fmt.Sprintf("%s/%d", s.ClassID, s.No), len(in.Statements)); wait > 0 {
		tooMany(w, wait) // a runaway page or script: the queue retries later
		return
	}
	batch := make([]Statement, 0, len(in.Statements))
	var pre []Rejected
	idx := []int{}
	for i, raw := range in.Statements {
		var st Statement
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&st); err != nil {
			pre = append(pre, Rejected{Index: i, Reason: "형식이 올바르지 않음"})
			continue
		}
		st.Actor, st.Stored, st.Seq = nil, "", 0 // the server decides these
		batch = append(batch, st)
		idx = append(idx, i)
	}
	accepted, dup, rejected, err := srv.store.Ingest(s.ClassID, s.No, batch)
	if err != nil {
		srv.fail(w, err)
		return
	}
	for i := range rejected {
		rejected[i].Index = idx[rejected[i].Index]
	}
	all := append(append([]Rejected{}, pre...), rejected...) // [] not null when nothing was refused
	sort.Slice(all, func(i, j int) bool { return all[i].Index < all[j].Index })
	writeJSON(w, http.StatusOK, map[string]any{"accepted": accepted, "duplicate": dup, "rejected": all})
}

/* --- operator ------------------------------------------------------------------------------------ */

func (srv *Server) listTeachers(w http.ResponseWriter, _ *http.Request, _ session) {
	out := []userOut{}
	for _, u := range srv.store.Users() {
		out = append(out, userView(u))
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": out})
}

func (srv *Server) createTeacher(w http.ResponseWriter, r *http.Request, _ session) {
	var in struct {
		Username, Password string
		Role               Role `json:"role"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Role == "" {
		in.Role = RoleTeacher
	}
	u, err := srv.store.CreateUser(strings.TrimSpace(in.Username), in.Password, in.Role)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, userView(*u))
}

func (srv *Server) updateTeacher(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Password *string `json:"password"`
		Disabled *bool   `json:"disabled"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	if id == s.UserID && in.Disabled != nil && *in.Disabled {
		writeErr(w, http.StatusBadRequest, "bad_input", "자기 계정은 끌 수 없어요.")
		return
	}
	u, err := srv.store.UpdateUser(id, in.Password, in.Disabled)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userView(*u))
}

func (srv *Server) syncView() map[string]any {
	cfg, st := srv.store.SyncConfig()
	return map[string]any{
		"config": map[string]any{"enabled": cfg.Enabled, "url": cfg.URL, "intervalSec": cfg.IntervalSec, "apiKey": redactKey(cfg.APIKey)},
		"status": map[string]any{"lastOkAt": st.LastOKAt, "lastError": st.LastError, "lastErrorAt": st.LastErrorAt, "sent": st.Sent,
			"pendingEvents": srv.store.PendingSync(), "pendingDeletes": len(st.PendingDeletes)},
	}
}

func (srv *Server) getSync(w http.ResponseWriter, _ *http.Request, _ session) {
	writeJSON(w, http.StatusOK, srv.syncView())
}

func (srv *Server) putSync(w http.ResponseWriter, r *http.Request, _ session) {
	var in struct {
		Enabled     bool    `json:"enabled"`
		URL         string  `json:"url"`
		APIKey      *string `json:"apiKey"`
		IntervalSec int     `json:"intervalSec"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	cfg, _ := srv.store.SyncConfig()
	cfg.Enabled, cfg.URL = in.Enabled, strings.TrimSpace(in.URL)
	if in.APIKey != nil {
		cfg.APIKey = strings.TrimSpace(*in.APIKey)
	}
	if in.IntervalSec != 0 {
		cfg.IntervalSec = in.IntervalSec
	}
	if cfg.IntervalSec < 60 || cfg.IntervalSec > 86400 {
		cfg.IntervalSec = 300
	}
	if cfg.Enabled {
		if err := ValidSyncURL(cfg.URL); err != nil {
			srv.fail(w, err)
			return
		}
		if len(cfg.APIKey) < 16 {
			writeErr(w, http.StatusBadRequest, "bad_input", "API 키가 너무 짧아요.")
			return
		}
	}
	if err := srv.store.SetSyncConfig(cfg); err != nil {
		srv.fail(w, err)
		return
	}
	if srv.syncer != nil {
		srv.syncer.Now()
	}
	writeJSON(w, http.StatusOK, srv.syncView())
}

func (srv *Server) syncNow(w http.ResponseWriter, _ *http.Request, _ session) {
	if srv.syncer != nil {
		srv.syncer.Now()
	}
	writeJSON(w, http.StatusAccepted, srv.syncView())
}

/* --- teacher ------------------------------------------------------------------------------------- */

func (srv *Server) listClasses(w http.ResponseWriter, _ *http.Request, s session) {
	writeJSON(w, http.StatusOK, map[string]any{"classes": srv.store.Classes(owner(s))})
}

func (srv *Server) createClass(w http.ResponseWriter, r *http.Request, s session) {
	var in struct{ Name string }
	if !readJSON(w, r, &in) {
		return
	}
	c, err := srv.store.CreateClass(s.UserID, in.Name)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (srv *Server) getClass(w http.ResponseWriter, r *http.Request, s session) {
	c, err := srv.store.Class(r.PathValue("id"), owner(s))
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (srv *Server) deleteClass(w http.ResponseWriter, r *http.Request, s session) {
	if err := srv.store.DeleteClass(r.PathValue("id"), owner(s), r.URL.Query().Get("confirm")); err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (srv *Server) issueStudents(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Count int `json:"count"`
		From  int `json:"from"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	out, err := srv.store.IssueStudents(r.PathValue("id"), owner(s), in.Count, in.From)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"issued": out})
}

func pathNo(r *http.Request) int {
	n, err := strconv.Atoi(r.PathValue("no"))
	if err != nil {
		return -1
	}
	return n
}

func (srv *Server) resetPIN(w http.ResponseWriter, r *http.Request, s session) {
	id := r.PathValue("id")
	is, err := srv.store.ResetPIN(id, owner(s), pathNo(r))
	if err != nil {
		srv.fail(w, err)
		return
	}
	if c, err := srv.store.Class(id, ""); err == nil {
		srv.student.unlock(studentKey(c.Code, is.No))
	}
	writeJSON(w, http.StatusOK, is)
}

func (srv *Server) removeStudent(w http.ResponseWriter, r *http.Request, s session) {
	if err := srv.store.RemoveStudent(r.PathValue("id"), owner(s), pathNo(r)); err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (srv *Server) setLessons(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Open []string `json:"open"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	c, err := srv.store.SetOpenLessons(r.PathValue("id"), owner(s), in.Open)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (srv *Server) archive(w http.ResponseWriter, r *http.Request, s session) {
	var in struct {
		Archived bool `json:"archived"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	c, err := srv.store.SetArchived(r.PathValue("id"), owner(s), in.Archived)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (srv *Server) logoutAll(w http.ResponseWriter, r *http.Request, s session) {
	id := r.PathValue("id")
	if _, err := srv.store.Class(id, owner(s)); err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"ended": srv.store.EndClassSessions(id)})
}

func (srv *Server) events(w http.ResponseWriter, r *http.Request, s session) {
	q := r.URL.Query()
	after, _ := strconv.ParseInt(q.Get("after"), 10, 64)
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 5000 {
		limit = 5000
	}
	out, last, err := srv.store.Events(r.PathValue("id"), owner(s), after, limit)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"statements": out, "last": last})
}

func (srv *Server) live(w http.ResponseWriter, r *http.Request, s session) {
	id := r.PathValue("id")
	c, err := srv.store.Class(id, owner(s))
	if err != nil {
		srv.fail(w, err)
		return
	}
	o := DefaultLiveOptions()
	q := r.URL.Query()
	if n, err := strconv.Atoi(q.Get("stuck")); err == nil && n >= 1 && n <= 50 {
		o.StuckFails = n
	}
	if n, err := strconv.Atoi(q.Get("idle")); err == nil && n >= 1 && n <= 120 {
		o.Idle = time.Duration(n) * time.Minute
	}
	o.LockedStudents = map[int]bool{}
	for _, no := range c.Students {
		if srv.student.blocked(studentKey(c.Code, no)) > 0 {
			o.LockedStudents[no] = true
		}
	}
	rows, err := srv.store.Live(id, owner(s), o)
	if err != nil {
		srv.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"now": srv.now().UnixMilli(), "students": rows})
}

func (srv *Server) export(w http.ResponseWriter, r *http.Request, s session) {
	id := r.PathValue("id")
	var (
		b    []byte
		code string
		err  error
		ext  = "json"
		typ  = "application/json; charset=utf-8"
	)
	if r.URL.Query().Get("format") == "csv" {
		b, code, err = srv.store.ExportCSV(id, owner(s))
		ext, typ = "csv", "text/csv; charset=utf-8"
	} else {
		b, code, err = srv.store.ExportJSON(id, owner(s))
	}
	if err != nil {
		srv.fail(w, err)
		return
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="class-%s-%s.%s"`, code, srv.now().Format("20060102"), ext))
	_, _ = io.Copy(w, bytes.NewReader(b))
}
