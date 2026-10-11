package classroom

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"strconv"
	"strings"
)

// Export: a class's records for the teacher (Excel CSV or JSON). Students appear by 번호 only — the
// teacher's own 번호↔이름 list (kept in the teacher's browser, never on this server) puts names back.

// ExportJSON: the class (no PIN hashes), the 번호 list and every event.
func (s *Store) ExportJSON(classID, owner string) ([]byte, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return nil, "", ErrNotFound
	}
	events, err := s.eventsLocked(classID, 0, 0)
	if err != nil {
		return nil, "", err
	}
	v := s.viewLocked(c)
	b, err := json.MarshalIndent(map[string]any{
		"kind":       "robocity-class-export",
		"version":    1,
		"exportedAt": s.now().UTC().Format("2006-01-02T15:04:05Z"),
		"class":      v,
		"statements": events,
	}, "", " ")
	return b, c.Code, err
}

// ExportCSV: one row per event, Korean headers, UTF-8 BOM (Excel reads Korean right), and a cell that
// starts with = + - @ (or a tab / CR) prefixed with ' so Excel never runs it as a formula.
func (s *Store) ExportCSV(classID, owner string) ([]byte, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := s.classLocked(classID)
	if c == nil || (owner != "" && c.OwnerID != owner) {
		return nil, "", ErrNotFound
	}
	events, err := s.eventsLocked(classID, 0, 0)
	if err != nil {
		return nil, "", err
	}
	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF") // UTF-8 BOM
	w := csv.NewWriter(&buf)
	w.UseCRLF = true
	_ = w.Write([]string{"번호", "시각", "받은 시각", "동사", "대상", "성공", "점수", "답", "순번"})
	for _, st := range events {
		success, score, resp := "", "", ""
		if r := st.Result; r != nil {
			if r.Success != nil {
				success = map[bool]string{true: "O", false: "X"}[*r.Success]
			}
			if r.Score != nil {
				switch {
				case r.Score.Raw != nil:
					score = strconv.FormatFloat(*r.Score.Raw, 'f', -1, 64)
				case r.Score.Scaled != nil:
					score = strconv.FormatFloat(*r.Score.Scaled, 'f', -1, 64)
				}
			}
			if r.Response != nil {
				resp = *r.Response
			}
		}
		_ = w.Write([]string{
			strconv.Itoa(st.studentNo()), st.Timestamp, st.Stored, verbKey(st.Verb.ID),
			defuse(st.Object.ID), success, score, defuse(resp), strconv.FormatInt(st.Seq, 10),
		})
	}
	w.Flush()
	return buf.Bytes(), c.Code, w.Error()
}

func defuse(cell string) string {
	if cell != "" && strings.ContainsRune("=+-@\t\r", rune(cell[0])) {
		return "'" + cell
	}
	return cell
}
