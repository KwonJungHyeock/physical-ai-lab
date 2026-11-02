// 로봇 USB 만들기: the teacher's USB stick for the robots, made from this program.
//
// The robot kit (robot-python/tools/make_usb_kit.py → eduino_usb.zip, signed) is embedded in the
// program by build.sh (kit/eduino_usb.zip). The console's ⚙ menu → [로봇 USB 만들기] asks this
// program to
//   - list the USB sticks on this PC (usbdrives_*.go) and what is on them (kit version, wifi.txt),
//   - write the kit's eduino/ folder onto one and fill its wifi.txt (Wi-Fi name, password, 사용자),
//   - read back the result-<robot>.txt files the robots write onto it (robot-python/server/usb_setup.py),
//   - eject it.
//
// The robot side is unchanged: it reads eduino/wifi.txt and updates itself from the signed kit.
//
// Only for the person at this PC: answered on 127.0.0.1 only, with this program's own Host, and only to requests carrying the X-Physical-AI header
// (a web page elsewhere cannot send it without asking first, and nothing here says yes).
package main

import (
	"archive/zip"
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

//go:embed all:kit
var kitFiles embed.FS

const (
	usbAPI    = hello + "/usb"
	kitZip    = "kit/eduino_usb.zip"
	kitFolder = "eduino"
	wifiFile  = "wifi.txt"
	// Moved aside when the stick is made again, so the results shown are the ones after it.
	oldResults = "지난 결과"
	pcProgram  = "Physical AI Tool.html"
	labelMax   = 24
)

// kitData: the embedded kit, nil when the program was built without one.
type kitData struct {
	zip     *zip.Reader
	version string
	size    int64 // what the eduino/ folder takes on a stick
}

var (
	kitOnce sync.Once
	kitNow  *kitData
)

func loadKit() *kitData {
	kitOnce.Do(func() {
		f, err := kitFiles.Open(kitZip)
		if err != nil {
			kitNow = kitBeside()
			return
		}
		st, err := f.Stat()
		if err != nil {
			return
		}
		var ra io.ReaderAt
		if r, ok := f.(io.ReaderAt); ok {
			ra = r
		} else if b, err := io.ReadAll(f); err == nil {
			ra = bytes.NewReader(b)
		} else {
			return
		}
		k, err := openKit(ra, st.Size())
		if err == nil {
			kitNow = k
		}
	})
	return kitNow
}

// kitBeside: a program built without the kit (so it fits in one download) takes eduino_usb.zip
// from the folder it runs in or the one above it (where the program's zip was unpacked).
func kitBeside() *kitData {
	exe, err := os.Executable()
	if err != nil {
		return nil
	}
	dir := filepath.Dir(exe)
	for _, p := range []string{filepath.Join(dir, "eduino_usb.zip"), filepath.Join(filepath.Dir(dir), "eduino_usb.zip")} {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		st, err := f.Stat()
		if err != nil {
			f.Close()
			continue
		}
		if k, err := openKit(f, st.Size()); err == nil {
			return k // f stays open: the kit is read from it whenever a stick is made
		}
		f.Close()
	}
	return nil
}

func openKit(ra io.ReaderAt, size int64) (*kitData, error) {
	zr, err := zip.NewReader(ra, size)
	if err != nil {
		return nil, err
	}
	k := &kitData{zip: zr}
	for _, f := range zr.File {
		name, ok := kitEntry(f.Name)
		if !ok {
			continue
		}
		k.size += int64(f.UncompressedSize64)
		if name == "robot_console.zip" {
			if rc, err := f.Open(); err == nil {
				b, _ := io.ReadAll(rc)
				rc.Close()
				k.version = consoleVersion(bytes.NewReader(b), int64(len(b)))
			}
		}
	}
	if k.size == 0 {
		return nil, errors.New("키트에 eduino 폴더가 없어요")
	}
	return k, nil
}

// kitEntry: a file of the kit's eduino/ folder, as its path inside that folder.
func kitEntry(name string) (string, bool) {
	name = path.Clean(strings.ReplaceAll(name, "\\", "/"))
	rest, ok := strings.CutPrefix(name, kitFolder+"/")
	if !ok || rest == "" || strings.HasSuffix(name, "/") || strings.HasPrefix(rest, "../") || path.IsAbs(rest) {
		return "", false
	}
	return rest, true
}

// consoleVersion: robot_console/VERSION in a robot_console.zip ("" when not there).
func consoleVersion(ra io.ReaderAt, size int64) string {
	zr, err := zip.NewReader(ra, size)
	if err != nil {
		return ""
	}
	for _, f := range zr.File {
		if path.Clean(f.Name) == "robot_console/VERSION" {
			rc, err := f.Open()
			if err != nil {
				return ""
			}
			b, _ := io.ReadAll(io.LimitReader(rc, 200))
			rc.Close()
			return strings.TrimSpace(string(b))
		}
	}
	return ""
}

/* ------------------------------------------------------------------------------------------------ */
/* What is on a stick                                                                               */
/* ------------------------------------------------------------------------------------------------ */

// Drive is one USB stick (or, flagged, another data drive) as the screen lists it.
type Drive struct {
	ID        string `json:"id"`    // "E:" (Windows) or the mount path
	Name      string `json:"name"`  // label as Windows shows it, else the folder name
	FS        string `json:"fs"`    // FAT32, exFAT, NTFS … ("" when not known)
	Free      int64  `json:"free"`  // bytes
	Total     int64  `json:"total"` // bytes
	Removable bool   `json:"removable"`
	root      string
	// What the stick has: its kit version, wifi.txt and how many robot results.
	KitVersion string    `json:"kitVersion,omitempty"`
	Wifi       *WifiForm `json:"wifi,omitempty"`
	Results    int       `json:"results"`
	Need       int64     `json:"need"` // bytes still to free before the kit fits (0: it fits)
}

// WifiForm: the lines of wifi.txt — the network, the robot's name, and more networks to remember.
type WifiForm struct {
	SSID     string `json:"ssid"`
	Password string `json:"password"`
	Label    string `json:"label"`
	// 와이파이2= … 와이파이4= (with 비밀번호N=): the robot joins whichever of them is there
	// (robot-python/server/usb_setup.py join_any). Empty ones are left out.
	More []WifiNet `json:"more,omitempty"`
}

// WifiNet is one more network of wifi.txt.
type WifiNet struct {
	SSID     string `json:"ssid"`
	Password string `json:"password"`
}

// moreWifi: networks 2 … moreWifi in wifi.txt (the robot reads the same, usb_setup.MORE_WIFI).
const moreWifi = 4

var (
	ssidKeys  = []string{"이름", "와이파이", "wifi", "ssid", "name"}
	passKeys  = []string{"비밀번호", "암호", "password", "pass", "psk"}
	labelKeys = []string{"사용자", "사용자이름", "사용자 이름", "로봇이름", "로봇 이름", "user", "label"}
)

// readWifi: wifi.txt as the robot reads it (usb_setup.read_fields): BOM or not, key = value, # comments.
func readWifi(b []byte) WifiForm {
	b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf"))
	var w WifiForm
	if !utf8.Valid(b) {
		return w
	}
	var more []WifiNet
	for _, line := range strings.Split(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}
		k, v, _ := strings.Cut(line, "=")
		k, v = strings.ToLower(strings.TrimSpace(k)), strings.TrimSpace(v)
		if n, base := numbered(k); n > 0 {
			for len(more) < n-1 {
				more = append(more, WifiNet{})
			}
			if has(ssidKeys, base) {
				more[n-2].SSID = v
			} else if has(passKeys, base) {
				more[n-2].Password = v
			}
			continue
		}
		switch {
		case has(ssidKeys, k):
			w.SSID = v
		case has(passKeys, k):
			w.Password = v
		case has(labelKeys, k):
			w.Label = v
		}
	}
	for _, m := range more {
		if m.SSID != "" {
			w.More = append(w.More, m)
		}
	}
	return w
}

// numbered: "와이파이2" → 2 and "와이파이" (a network key numbered 2 … moreWifi), else 0.
func numbered(k string) (int, string) {
	r, size := utf8.DecodeLastRuneInString(k)
	if r < '2' || r > '0'+moreWifi {
		return 0, ""
	}
	base := strings.TrimSpace(k[:len(k)-size])
	if !has(ssidKeys, base) && !has(passKeys, base) {
		return 0, ""
	}
	return int(r - '0'), base
}

func has(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// checkWifi: what is wrong with the form, in words for the screen ("" when it is fine).
func checkWifi(w WifiForm) string {
	ssid := strings.TrimSpace(w.SSID)
	switch {
	case ssid == "":
		return "Wi-Fi 이름을 적어 주세요."
	case len(ssid) > 32:
		return "Wi-Fi 이름이 너무 길어요 (32바이트까지)."
	case ssid != w.SSID:
		return "Wi-Fi 이름 앞뒤에 빈칸이 있어요. 빈칸을 지워 주세요."
	case strings.HasPrefix(ssid, "#"):
		return "Wi-Fi 이름이 # 로 시작하면 로봇이 읽지 못해요."
	case strings.EqualFold(ssid, "핫스팟") || strings.EqualFold(ssid, "hotspot"):
		// the robot has no hotspot any more: one that came on held the Wi-Fi chip (wifi.py)
		return "로봇 핫스팟은 이제 쓰지 않아요. 교실 Wi-Fi 이름을 적거나, 랜선만 쓰면 '끔' 을 골라 주세요."
	}
	if p := w.Password; p != "" {
		if p != strings.TrimSpace(p) {
			return "비밀번호 앞뒤에 빈칸이 있어요. 빈칸을 지워 주세요."
		}
		if n := utf8.RuneCountInString(p); n < 8 || n > 63 {
			if !(len(p) == 64 && isHex(p)) {
				return "Wi-Fi 비밀번호는 8~63자예요. 비밀번호가 없는 Wi-Fi 면 비워 두세요."
			}
		}
	}
	if len(w.More) > moreWifi-1 {
		return fmt.Sprintf("Wi-Fi 는 %d개까지 적을 수 있어요.", moreWifi)
	}
	for i, m := range w.More {
		if m.SSID == "" && m.Password == "" {
			continue
		}
		if msg := checkWifi(WifiForm{SSID: m.SSID, Password: m.Password}); msg != "" {
			return fmt.Sprintf("%d번째 Wi-Fi: %s", i+2, msg)
		}
		if m.SSID == "끔" {
			return fmt.Sprintf("%d번째 Wi-Fi: 끔 은 첫 번째 칸에만 적어요.", i+2)
		}
	}
	if utf8.RuneCountInString(strings.TrimSpace(w.Label)) > labelMax {
		return fmt.Sprintf("사용자 이름은 %d자까지예요.", labelMax)
	}
	for _, s := range []string{w.SSID, w.Password, w.Label} {
		for _, r := range s {
			if unicode.IsControl(r) {
				return "줄바꿈 같은 보이지 않는 글자는 넣을 수 없어요."
			}
		}
	}
	return ""
}

func isHex(s string) bool {
	for _, r := range s {
		if !strings.ContainsRune("0123456789abcdefABCDEF", r) {
			return false
		}
	}
	return true
}

// fillWifi: the kit's wifi.txt (comments, BOM, CRLF kept) with the three values put in.
func fillWifi(template []byte, w WifiForm) []byte {
	bom := bytes.HasPrefix(template, []byte("\xef\xbb\xbf"))
	text := strings.ReplaceAll(string(bytes.TrimPrefix(template, []byte("\xef\xbb\xbf"))), "\r\n", "\n")
	lines := strings.Split(strings.TrimRight(text, "\n"), "\n")
	set := map[string]string{"와이파이": w.SSID, "비밀번호": w.Password, "사용자": strings.TrimSpace(w.Label)}
	order := []string{"와이파이", "비밀번호", "사용자"}
	// More networks: written when filled; the template's own (empty) lines for them are kept empty.
	for n := 2; n <= moreWifi; n++ {
		ssid, pass := "", ""
		if n-2 < len(w.More) {
			ssid, pass = w.More[n-2].SSID, w.More[n-2].Password
		}
		ks, kp := fmt.Sprintf("와이파이%d", n), fmt.Sprintf("비밀번호%d", n)
		set[ks], set[kp] = ssid, pass
		if ssid != "" {
			order = append(order, ks, kp)
		}
	}
	done := map[string]bool{}
	for i, line := range lines {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "#") || !strings.Contains(t, "=") {
			continue
		}
		k, _, _ := strings.Cut(t, "=")
		k = strings.TrimSpace(k)
		if v, ok := set[k]; ok && !done[k] {
			lines[i] = k + "=" + v
			done[k] = true
		}
	}
	for _, k := range order {
		if !done[k] {
			lines = append(lines, k+"="+set[k])
		}
	}
	out := strings.Join(lines, "\r\n") + "\r\n"
	if bom {
		out = "\xef\xbb\xbf" + out
	}
	return []byte(out)
}

// stickFolder: the stick's eduino/ folder — at the top, or (unzipped by hand) one or two folders down.
func stickFolder(root string) string {
	top := filepath.Join(root, kitFolder)
	if st, err := os.Stat(top); err == nil && st.IsDir() {
		return top
	}
	for _, pat := range []string{"*", filepath.Join("*", "*")} {
		m, _ := filepath.Glob(filepath.Join(root, pat, kitFolder))
		sort.Strings(m)
		for _, f := range m {
			if st, err := os.Lstat(f); err == nil && st.IsDir() {
				return f
			}
		}
	}
	return top
}

// describe fills in what is on the stick.
func describe(d *Drive, k *kitData) {
	folder := stickFolder(d.root)
	if b, err := os.ReadFile(filepath.Join(folder, wifiFile)); err == nil {
		w := readWifi(b)
		d.Wifi = &w
	}
	if f, err := os.Open(filepath.Join(folder, "robot_console.zip")); err == nil {
		if st, err := f.Stat(); err == nil {
			d.KitVersion = consoleVersion(f, st.Size())
		}
		f.Close()
	}
	d.Results = len(resultFiles(folder))
	if k != nil {
		d.Need = max(0, k.size-alreadyThere(folder, k)-d.Free)
	}
}

// alreadyThere: bytes of the kit's files already on the stick (written over, so they free up again).
func alreadyThere(folder string, k *kitData) int64 {
	var n int64
	for _, f := range k.zip.File {
		if name, ok := kitEntry(f.Name); ok {
			if st, err := os.Stat(filepath.Join(folder, filepath.FromSlash(name))); err == nil && !st.IsDir() {
				n += st.Size()
			}
		}
	}
	return n
}

var resultName = regexp.MustCompile(`^result-.+\.txt$`)

func resultFiles(folder string) []string {
	ents, err := os.ReadDir(folder)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range ents {
		if e.Type().IsRegular() && resultName.MatchString(e.Name()) {
			out = append(out, e.Name())
		}
	}
	sort.Strings(out)
	return out
}

// Result is one robot's result file, as written by the robot (the screen reads the lines).
type Result struct {
	File string `json:"file"`
	Text string `json:"text"`
	Time int64  `json:"time"` // when the file was written (ms)
}

func readResults(folder string) []Result {
	out := []Result{}
	for _, name := range resultFiles(folder) {
		p := filepath.Join(folder, name)
		st, err := os.Stat(p)
		if err != nil || st.Size() > 64*1024 {
			continue
		}
		b, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		b = bytes.TrimPrefix(b, []byte("\xef\xbb\xbf"))
		if !utf8.Valid(b) {
			continue
		}
		out = append(out, Result{File: name, Text: string(b), Time: st.ModTime().UnixMilli()})
	}
	return out
}

/* ------------------------------------------------------------------------------------------------ */
/* Making a stick                                                                                   */
/* ------------------------------------------------------------------------------------------------ */

// Job is the one stick being written now (the screen asks how far it is).
type Job struct {
	Drive string `json:"drive"`
	State string `json:"state"` // copying · done · error
	Done  int64  `json:"done"`
	Total int64  `json:"total"`
	Error string `json:"error,omitempty"`
	// Results moved into 지난 결과/ before writing.
	Moved int `json:"moved"`
}

var (
	jobMu  sync.Mutex
	jobNow *Job
)

func jobSnapshot() *Job {
	jobMu.Lock()
	defer jobMu.Unlock()
	if jobNow == nil {
		return nil
	}
	j := *jobNow
	return &j
}

func jobUpdate(f func(j *Job)) {
	jobMu.Lock()
	defer jobMu.Unlock()
	if jobNow != nil {
		f(jobNow)
	}
}

// makeStick writes the kit onto the stick at root and fills its wifi.txt.
func makeStick(root string, k *kitData, w WifiForm, progress func(done int64)) (moved int, err error) {
	folder := filepath.Join(root, kitFolder)
	if err := os.MkdirAll(folder, 0o755); err != nil {
		return 0, fmt.Errorf("USB 에 폴더를 만들지 못했어요: %w", err)
	}
	// Earlier robots' results: aside, so what shows after this is from this stick.
	if names := resultFiles(folder); len(names) > 0 {
		old := filepath.Join(folder, oldResults)
		if err := os.MkdirAll(old, 0o755); err == nil {
			stamp := time.Now().Format("20060102-1504")
			for _, n := range names {
				to := filepath.Join(old, n)
				if _, err := os.Stat(to); err == nil {
					to = filepath.Join(old, strings.TrimSuffix(n, ".txt")+"-"+stamp+".txt")
				}
				if os.Rename(filepath.Join(folder, n), to) == nil {
					moved++
				}
			}
		}
	}
	// The PC program on the stick keeps the robots the robots wrote into it.
	robots := ""
	if b, err := os.ReadFile(filepath.Join(folder, pcProgram)); err == nil {
		if m := robotsList.FindSubmatch(b); m != nil {
			robots = string(m[1])
		}
	}
	var done int64
	var template []byte
	for _, f := range k.zip.File {
		name, ok := kitEntry(f.Name)
		if !ok {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return moved, err
		}
		b, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return moved, err
		}
		switch name {
		case wifiFile:
			template = b
			b = fillWifi(b, w)
		case pcProgram:
			if robots != "" && robots != "[]" {
				b = robotsList.ReplaceAll(b, []byte("var ROBOTS = /*ROBOTS*/"+strings.ReplaceAll(robots, "$", "$$")+";"))
			}
		}
		if err := writeFile(filepath.Join(folder, filepath.FromSlash(name)), b); err != nil {
			return moved, err
		}
		done += int64(f.UncompressedSize64)
		progress(done)
	}
	if template == nil {
		// A kit without a wifi.txt (should not happen): write one plainly.
		if err := writeFile(filepath.Join(folder, wifiFile), fillWifi([]byte("\xef\xbb\xbf"), w)); err != nil {
			return moved, err
		}
	}
	// Read the robot's console back off the stick, every file through its checksum: a stick that
	// stores bytes wrongly is caught here, not on the robot halfway through install.py.
	if err := checkZip(filepath.Join(folder, "robot_console.zip")); err != nil {
		return moved, fmt.Errorf("USB 에 쓴 robot_console.zip 을 다시 읽어 보니 깨져 있어요. 다른 USB 로 다시 만들어 주세요 (%v)", err)
	}
	return moved, nil
}

// checkZip reads every file of a zip on disk to its end, so its CRC-32 is checked.
func checkZip(p string) error {
	z, err := zip.OpenReader(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	defer z.Close()
	for _, f := range z.File {
		rc, err := f.Open()
		if err != nil {
			return err
		}
		_, err = io.Copy(io.Discard, rc)
		rc.Close()
		if err != nil {
			return fmt.Errorf("%s: %w", f.Name, err)
		}
	}
	return nil
}

var robotsList = regexp.MustCompile(`var ROBOTS = /\*ROBOTS\*/(\[.*?\]);`)

// writeFile: beside, synced, then into place — a stick pulled out half way never leaves half a file.
func writeFile(p string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return fmt.Errorf("USB 에 폴더를 만들지 못했어요: %w", err)
	}
	if st, err := os.Lstat(p); err == nil && st.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s: 링크에는 쓰지 않아요", filepath.Base(p))
	}
	tmp := p + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return fmt.Errorf("USB 에 쓰지 못했어요 (%s): %w", filepath.Base(p), err)
	}
	_, err = f.Write(b)
	if err == nil {
		err = f.Sync()
	}
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp)
		return fmt.Errorf("USB 에 쓰다가 멈췄어요 (%s): %w", filepath.Base(p), err)
	}
	if err := os.Rename(tmp, p); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("USB 에 쓰지 못했어요 (%s): %w", filepath.Base(p), err)
	}
	return nil
}

/* ------------------------------------------------------------------------------------------------ */
/* The API                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

// usbHandler answers the screen's USB requests; everything else goes to next.
func usbHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		if p != usbAPI && !strings.HasPrefix(p, usbAPI+"/") {
			next.ServeHTTP(w, r)
			return
		}
		if !localRequest(r) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		switch {
		case p == usbAPI && r.Method == http.MethodGet:
			reply(w, usbState())
		case p == usbAPI+"/pcwifi" && r.Method == http.MethodGet:
			reply(w, pcWifi())
		case p == usbAPI+"/results" && r.Method == http.MethodGet:
			d, ok := findDrive(r.URL.Query().Get("drive"))
			if !ok {
				replyError(w, http.StatusNotFound, "그 USB 가 보이지 않아요. 다시 꽂아 주세요.")
				return
			}
			reply(w, map[string]any{"drive": d.ID, "results": readResults(stickFolder(d.root))})
		case p == usbAPI+"/make" && r.Method == http.MethodPost:
			startMake(w, r)
		case p == usbAPI+"/job" && r.Method == http.MethodGet:
			reply(w, map[string]any{"job": jobSnapshot()})
		case p == usbAPI+"/eject" && r.Method == http.MethodPost:
			var body struct{ Drive string }
			_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
			d, ok := findDrive(body.Drive)
			if !ok {
				replyError(w, http.StatusNotFound, "그 USB 가 보이지 않아요.")
				return
			}
			if j := jobSnapshot(); j != nil && j.State == "copying" {
				replyError(w, http.StatusConflict, "아직 USB 에 쓰는 중이에요.")
				return
			}
			if err := ejectDrive(d); err != nil {
				replyError(w, http.StatusInternalServerError, err.Error())
				return
			}
			reply(w, map[string]any{"ok": true})
		default:
			replyError(w, http.StatusNotFound, "없는 요청이에요.")
		}
	})
}

// localRequest: from this PC, to this program's own address, from its own screen.
func localRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil || !net.ParseIP(host).IsLoopback() {
		return false
	}
	h, _, err := net.SplitHostPort(r.Host)
	if err != nil || (h != "127.0.0.1" && h != "localhost") {
		return false
	}
	return r.Header.Get("X-Physical-AI") == "1"
}

func usbState() map[string]any {
	k := loadKit()
	drives := listDrives()
	for i := range drives {
		describe(&drives[i], k)
	}
	out := map[string]any{"drives": drives, "job": jobSnapshot(), "kit": nil}
	if k != nil {
		out["kit"] = map[string]any{"version": k.version, "size": k.size}
	}
	return out
}

func findDrive(id string) (Drive, bool) {
	if id == "" {
		return Drive{}, false
	}
	for _, d := range listDrives() {
		if d.ID == id {
			return d, true
		}
	}
	return Drive{}, false
}

func startMake(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Drive string   `json:"drive"`
		Wifi  WifiForm `json:"wifi"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&body); err != nil {
		replyError(w, http.StatusBadRequest, "요청을 읽지 못했어요.")
		return
	}
	k := loadKit()
	if k == nil {
		replyError(w, http.StatusConflict, "이 프로그램에는 로봇 키트가 들어 있지 않아요. 새 프로그램을 받아 주세요.")
		return
	}
	if msg := checkWifi(body.Wifi); msg != "" {
		replyError(w, http.StatusBadRequest, msg)
		return
	}
	d, ok := findDrive(body.Drive)
	if !ok {
		replyError(w, http.StatusNotFound, "그 USB 가 보이지 않아요. 다시 꽂아 주세요.")
		return
	}
	describe(&d, k)
	if d.Need > 0 {
		replyError(w, http.StatusConflict, fmt.Sprintf("USB 에 빈 곳이 모자라요. %d MB 를 더 비워 주세요.", (d.Need+(1<<20)-1)>>20))
		return
	}
	jobMu.Lock()
	if jobNow != nil && jobNow.State == "copying" {
		jobMu.Unlock()
		replyError(w, http.StatusConflict, "다른 USB 를 만드는 중이에요.")
		return
	}
	jobNow = &Job{Drive: d.ID, State: "copying", Total: k.size}
	jobMu.Unlock()
	go func() {
		moved, err := makeStick(d.root, k, body.Wifi, func(done int64) { jobUpdate(func(j *Job) { j.Done = done }) })
		jobUpdate(func(j *Job) {
			j.Moved = moved
			if err != nil {
				j.State, j.Error = "error", err.Error()
			} else {
				j.State, j.Done = "done", j.Total
			}
		})
	}()
	reply(w, map[string]any{"job": jobSnapshot()})
}

func reply(w http.ResponseWriter, v any) {
	_ = json.NewEncoder(w).Encode(v)
}

func replyError(w http.ResponseWriter, code int, msg string) {
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
