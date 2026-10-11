package classroom

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

// Learning events, shaped like xAPI statements (actor · verb · object · result · context), so they can
// later go to any LRS as they are. The client never decides who the actor is: the server writes the
// actor and the class from the session. Names are never part of a statement.
//
// Keep VERBS in step with web-typescript/src/engine/account/events.ts (its check reads this file).

// Verb: one kind of event, and the published reason it is recorded.
type VerbInfo struct {
	ID      string `json:"id"`
	Key     string `json:"key"`
	Ko      string `json:"ko"`
	Purpose string `json:"purpose"`
	// Cloud: also sent (pseudonymised) to the company's cloud when sync is on.
	Cloud bool `json:"cloud"`
}

const adl = "http://adlnet.gov/expapi/verbs/"
const ourVerb = "urn:robocity:verb:"

// VERBS: the only verbs the server accepts. The purpose texts are what /purposes publishes.
var VERBS = []VerbInfo{
	{adl + "experienced", "experienced", "봤다", "수업 페이지를 연 기록: 진도 표시, 교사 화면의 '지금 어디' 표시", true},
	{adl + "attempted", "attempted", "시작했다", "활동·현장 문제를 시작한 기록: 진도와 '지금 어디' 표시", true},
	{adl + "answered", "answered", "답했다", "예상·질문·평가 문항의 답: 교사 피드백, 자주 틀리는 생각 찾기 (클라우드에는 선택지 번호 같은 짧은 값만)", true},
	{adl + "completed", "completed", "마쳤다", "단계·차시를 마친 기록: 진도와 학급 결과", true},
	{adl + "passed", "passed", "통과했다", "문제를 통과한 기록: 성취 확인, 막힘 풀림 표시", true},
	{adl + "failed", "failed", "통과하지 못했다", "문제를 통과하지 못한 기록: 같은 문제에서 여러 번 막힌 학생을 교사에게 알림", true},
	{ourVerb + "hinted", "hinted", "힌트를 열었다", "힌트를 연 기록: 막힘 감지와 힌트 품질 개선", true},
	{ourVerb + "ran", "ran", "시뮬레이터에서 실행했다", "시뮬레이터 실행 기록: 활동량 확인", true},
	{ourVerb + "operated", "operated", "실물 로봇을 움직였다", "실물 로봇 실행 기록: 로봇 사용 현황과 안전 관리", true},
}

var verbByID = func() map[string]VerbInfo {
	m := map[string]VerbInfo{}
	for _, v := range VERBS {
		m[v.ID] = v
	}
	return m
}()

// Statement: the fields we accept (unknown fields are refused when decoding).
type Statement struct {
	ID        string   `json:"id"`
	Actor     *Actor   `json:"actor,omitempty"`
	Verb      Verb     `json:"verb"`
	Object    Object   `json:"object"`
	Result    *Result  `json:"result,omitempty"`
	Context   *Context `json:"context,omitempty"`
	Timestamp string   `json:"timestamp"`
	// Set by the server.
	Stored string `json:"stored,omitempty"`
	Seq    int64  `json:"seq,omitempty"`
}

type Actor struct {
	ObjectType string  `json:"objectType"`
	Account    Account `json:"account"`
}

type Account struct {
	HomePage string `json:"homePage"`
	Name     string `json:"name"`
}

type Verb struct {
	ID      string            `json:"id"`
	Display map[string]string `json:"display,omitempty"`
}

type Object struct {
	ObjectType string      `json:"objectType,omitempty"`
	ID         string      `json:"id"`
	Definition *Definition `json:"definition,omitempty"`
}

type Definition struct {
	Type string `json:"type,omitempty"`
}

type Result struct {
	Success    *bool          `json:"success,omitempty"`
	Completion *bool          `json:"completion,omitempty"`
	Score      *Score         `json:"score,omitempty"`
	Response   *string        `json:"response,omitempty"`
	Duration   string         `json:"duration,omitempty"`
	Extensions map[string]any `json:"extensions,omitempty"`
}

type Score struct {
	Scaled *float64 `json:"scaled,omitempty"`
	Raw    *float64 `json:"raw,omitempty"`
	Min    *float64 `json:"min,omitempty"`
	Max    *float64 `json:"max,omitempty"`
}

type Context struct {
	Registration string         `json:"registration,omitempty"`
	Extensions   map[string]any `json:"extensions,omitempty"`
}

// Extension keys the server writes (a client's values for these are replaced).
const (
	ExtClass = "urn:robocity:ctx:class"
	ExtNo    = "urn:robocity:ctx:no"
)

const (
	maxStatementBytes = 4096
	maxResponseChars  = 500
	maxExtensions     = 16
	maxExtString      = 200
	maxBatch          = 100
)

var (
	reUUID     = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	reObjectID = regexp.MustCompile(`^urn:robocity:(lesson|site|quiz|robot)(:[A-Za-z0-9._-]{1,40}){1,6}$`)
	reExtKey   = regexp.MustCompile(`^urn:robocity:[a-z]+:[A-Za-z0-9._-]{1,40}$`)
	reDuration = regexp.MustCompile(`^P(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$`)
	reActType  = regexp.MustCompile(`^http://adlnet\.gov/expapi/activities/[a-z.-]{2,40}$`)
	// safeResponse: what of a typed answer may go to the cloud — a choice id, a number, a short code.
	safeResponse = regexp.MustCompile(`^[A-Za-z0-9_.,:+-]{1,32}$`)
)

// validate checks a statement from a client and returns a reason when it is refused. now is the
// server's time (timestamps far from it are refused).
func (s *Statement) validate(now time.Time) string {
	if !reUUID.MatchString(s.ID) {
		return "id: UUID(소문자) 필요"
	}
	if _, ok := verbByID[s.Verb.ID]; !ok {
		return "verb: 허용되지 않은 동사"
	}
	if len(s.Verb.Display) > 4 {
		return "verb.display: 너무 많음"
	}
	for k, v := range s.Verb.Display {
		if len(k) > 10 || len(v) > 80 {
			return "verb.display: 너무 김"
		}
	}
	if s.Object.ObjectType != "" && s.Object.ObjectType != "Activity" {
		return "object.objectType: Activity 만"
	}
	if !reObjectID.MatchString(s.Object.ID) || len(s.Object.ID) > 160 {
		return "object.id: urn:robocity:… 형식이 아님"
	}
	if d := s.Object.Definition; d != nil && d.Type != "" && !reActType.MatchString(d.Type) {
		return "object.definition.type: ADL 활동 유형이 아님"
	}
	ts, err := time.Parse(time.RFC3339Nano, s.Timestamp)
	if err != nil {
		return "timestamp: RFC 3339 시각이 아님"
	}
	if ts.After(now.Add(24*time.Hour)) || ts.Before(now.Add(-90*24*time.Hour)) {
		return "timestamp: 지금과 너무 다름"
	}
	if r := s.Result; r != nil {
		if r.Response != nil && len([]rune(*r.Response)) > maxResponseChars {
			return "result.response: 너무 김"
		}
		if r.Duration != "" && (len(r.Duration) > 32 || !reDuration.MatchString(r.Duration)) {
			return "result.duration: ISO 8601 기간이 아님"
		}
		if sc := r.Score; sc != nil {
			for _, f := range []*float64{sc.Scaled, sc.Raw, sc.Min, sc.Max} {
				if f != nil && (math.IsNaN(*f) || math.IsInf(*f, 0) || math.Abs(*f) > 1e6) {
					return "result.score: 숫자가 아님"
				}
			}
			if sc.Scaled != nil && (*sc.Scaled < -1 || *sc.Scaled > 1) {
				return "result.score.scaled: -1~1"
			}
		}
		if why := checkExtensions(r.Extensions); why != "" {
			return "result." + why
		}
	}
	if c := s.Context; c != nil {
		if c.Registration != "" && !reUUID.MatchString(c.Registration) {
			return "context.registration: UUID 필요"
		}
		if why := checkExtensions(c.Extensions); why != "" {
			return "context." + why
		}
	}
	if b, _ := json.Marshal(s); len(b) > maxStatementBytes {
		return "문장이 너무 큼"
	}
	return ""
}

func checkExtensions(m map[string]any) string {
	if len(m) > maxExtensions {
		return "extensions: 너무 많음"
	}
	for k, v := range m {
		if !reExtKey.MatchString(k) {
			return "extensions: 키는 urn:robocity:<종류>:<이름>"
		}
		switch x := v.(type) {
		case string:
			if len([]rune(x)) > maxExtString {
				return "extensions: 값이 너무 김"
			}
		case float64:
			if math.IsNaN(x) || math.IsInf(x, 0) {
				return "extensions: 숫자가 아님"
			}
		case bool, nil:
		default:
			return "extensions: 값은 글자 · 숫자 · 참/거짓만"
		}
	}
	return ""
}

// stamp: the server's part — actor and class from the session, stored time and sequence number.
func (s *Statement) stamp(serverID string, c *Class, no int, seq int64, now time.Time) {
	s.Actor = &Actor{ObjectType: "Agent", Account: Account{HomePage: "urn:robocity:class-server:" + serverID, Name: fmt.Sprintf("%s-%d", c.Code, no)}}
	if s.Context == nil {
		s.Context = &Context{}
	}
	if s.Context.Extensions == nil {
		s.Context.Extensions = map[string]any{}
	}
	s.Context.Extensions[ExtClass] = c.ID
	s.Context.Extensions[ExtNo] = float64(no)
	if v, ok := verbByID[s.Verb.ID]; ok {
		s.Verb.Display = map[string]string{"ko": v.Ko}
	}
	if s.Object.ObjectType == "" {
		s.Object.ObjectType = "Activity"
	}
	s.Stored = now.UTC().Format(time.RFC3339Nano)
	s.Seq = seq
}

// studentNo: the 번호 the server wrote into a stored statement.
func (s *Statement) studentNo() int {
	if s.Context == nil {
		return 0
	}
	if f, ok := s.Context.Extensions[ExtNo].(float64); ok {
		return int(f)
	}
	return 0
}

// Pseudonymise a stored statement for the cloud: the actor becomes an HMAC of (class id, 번호) under
// a key only this server has, the class an HMAC of its id; typed answers and free-text extension
// values are dropped unless they are short codes; the class name, class code, 번호, IP addresses and
// anything else that could point at a student are not in the output.
func pseudonymise(s Statement, serverID string, key []byte) Statement {
	in := s.Context
	if in == nil {
		in = &Context{}
	}
	classID, _ := in.Extensions[ExtClass].(string)
	no := s.studentNo()
	out := Statement{
		ID:        s.ID,
		Actor:     &Actor{ObjectType: "Agent", Account: Account{HomePage: "urn:robocity:server:" + serverID, Name: pseudonym(key, "student", fmt.Sprintf("%s/%d", classID, no), 20)}},
		Verb:      Verb{ID: s.Verb.ID},
		Object:    Object{ObjectType: "Activity", ID: s.Object.ID, Definition: s.Object.Definition},
		Timestamp: s.Timestamp,
		Stored:    s.Stored,
	}
	if r := s.Result; r != nil {
		rr := &Result{Success: r.Success, Completion: r.Completion, Score: r.Score, Duration: r.Duration}
		if r.Response != nil && safeResponse.MatchString(*r.Response) {
			v := *r.Response
			rr.Response = &v
		}
		rr.Extensions = safeExtensions(r.Extensions)
		out.Result = rr
	}
	ctx := &Context{Extensions: map[string]any{ExtClass: pseudonym(key, "class", classID, 16)}}
	if in.Registration != "" {
		ctx.Registration = in.Registration
	}
	for k, v := range safeExtensions(in.Extensions) {
		if k != ExtClass && k != ExtNo {
			ctx.Extensions[k] = v
		}
	}
	out.Context = ctx
	return out
}

func safeExtensions(m map[string]any) map[string]any {
	if len(m) == 0 {
		return nil
	}
	out := map[string]any{}
	for k, v := range m {
		switch x := v.(type) {
		case string:
			if safeResponse.MatchString(x) {
				out[k] = x
			}
		case float64, bool:
			out[k] = x
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// verbKey: "failed" for the ADL failed verb, and so on.
func verbKey(id string) string {
	if v, ok := verbByID[id]; ok {
		return v.Key
	}
	return strings.TrimPrefix(id, adl)
}
