package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

const tmplWifi = "\xef\xbb\xbf# 로봇이 붙을 Wi-Fi\r\n# 비밀번호: 비워 두면 열린 Wi-Fi\r\n\r\n와이파이=\r\n비밀번호=\r\n사용자=\r\n"

// testKit: a small kit like make_usb_kit.py's — eduino/ with wifi.txt, robot_console.zip (+VERSION), the PC program.
func testKit(t *testing.T, version string) *kitData {
	t.Helper()
	var inner bytes.Buffer
	iz := zip.NewWriter(&inner)
	f, _ := iz.Create("robot_console/VERSION")
	f.Write([]byte(version + "\n"))
	f, _ = iz.Create("robot_console/server.py")
	f.Write([]byte("print('hi')\n"))
	iz.Close()
	var outer bytes.Buffer
	oz := zip.NewWriter(&outer)
	for name, body := range map[string][]byte{
		"eduino/wifi.txt":              []byte(tmplWifi),
		"eduino/robot_console.zip":     inner.Bytes(),
		"eduino/robot_console.zip.sig": []byte("sig"),
		"eduino/Physical AI Tool.html": []byte("<script>var ROBOTS = /*ROBOTS*/[];</script>"),
		"eduino/checks/robot_check.py": []byte("# check"),
		"eduino/../evil.txt":           []byte("no"),
	} {
		w, _ := oz.Create(name)
		w.Write(body)
	}
	oz.Close()
	k, err := openKit(bytes.NewReader(outer.Bytes()), int64(outer.Len()))
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func TestWifiForm(t *testing.T) {
	w := WifiForm{SSID: "EDUINO-LAB", Password: "pass=word 1", Label: "3조 김민수"}
	b := fillWifi([]byte(tmplWifi), w)
	if !bytes.HasPrefix(b, []byte("\xef\xbb\xbf")) || !strings.Contains(string(b), "\r\n와이파이=EDUINO-LAB\r\n") {
		t.Fatalf("BOM/CRLF lost: %q", b)
	}
	if got := readWifi(b); !reflect.DeepEqual(got, w) {
		t.Fatalf("round trip: %+v", got)
	}
	if !strings.Contains(string(b), "# 비밀번호: 비워 두면") {
		t.Fatal("comments lost")
	}
	// A template without the lines still gets them.
	if got := readWifi(fillWifi([]byte("# x\r\n"), w)); !reflect.DeepEqual(got, w) {
		t.Fatalf("appended: %+v", got)
	}
	for _, c := range []struct {
		w    WifiForm
		want string
	}{
		{WifiForm{SSID: "a"}, ""},
		{WifiForm{SSID: "교실 Wi-Fi", Password: "12345678"}, ""},
		{WifiForm{}, "Wi-Fi 이름"},
		{WifiForm{SSID: " a"}, "빈칸"},
		{WifiForm{SSID: "#a"}, "#"},
		{WifiForm{SSID: strings.Repeat("가", 11)}, "너무 길어요"},
		{WifiForm{SSID: "a", Password: "1234567"}, "8~63"},
		{WifiForm{SSID: "a", Password: strings.Repeat("a", 64)}, ""},
		{WifiForm{SSID: "a", Password: strings.Repeat("z", 64)}, "8~63"},
		{WifiForm{SSID: "a", Label: strings.Repeat("가", 25)}, "24자"},
		{WifiForm{SSID: "a", Label: "x\ny"}, "보이지 않는"},
		{WifiForm{SSID: "핫스팟"}, "쓰지 않아요"},
		{WifiForm{SSID: "끔"}, ""},
	} {
		got := checkWifi(c.w)
		if (c.want == "") != (got == "") || !strings.Contains(got, c.want) {
			t.Errorf("%+v: %q, want %q", c.w, got, c.want)
		}
	}
}

func TestMakeStick(t *testing.T) {
	k := testKit(t, "20261014-051829-c782f72")
	if k.version != "20261014-051829-c782f72" {
		t.Fatalf("version %q", k.version)
	}
	root := t.TempDir()
	folder := filepath.Join(root, "eduino")
	os.MkdirAll(folder, 0o755)
	// A stick used before: two robots' results and a PC program that knows one robot.
	os.WriteFile(filepath.Join(folder, "result-ubuntu-3a7f.txt"), []byte("결과: 성공"), 0o644)
	os.WriteFile(filepath.Join(folder, "result-ubuntu-9c01.txt"), []byte("결과: 실패"), 0o644)
	os.WriteFile(filepath.Join(folder, "Physical AI Tool.html"), []byte(`var ROBOTS = /*ROBOTS*/[{"ip":"192.168.0.107"}];`), 0o644)
	var last int64
	moved, err := makeStick(root, k, WifiForm{SSID: "EDUINO-LAB", Password: "12345678"}, func(d int64) { last = d })
	if err != nil {
		t.Fatal(err)
	}
	if moved != 2 || last != k.size {
		t.Fatalf("moved %d, progress %d/%d", moved, last, k.size)
	}
	if n := len(resultFiles(folder)); n != 0 {
		t.Fatalf("%d results left", n)
	}
	if _, err := os.Stat(filepath.Join(folder, oldResults, "result-ubuntu-3a7f.txt")); err != nil {
		t.Fatal("old result not kept")
	}
	b, _ := os.ReadFile(filepath.Join(folder, "Physical AI Tool.html"))
	if !strings.Contains(string(b), `[{"ip":"192.168.0.107"}]`) {
		t.Fatalf("robots lost: %s", b)
	}
	if _, err := os.Stat(filepath.Join(root, "evil.txt")); err == nil {
		t.Fatal("wrote outside eduino/")
	}
	if _, err := os.Stat(filepath.Join(folder, "checks", "robot_check.py")); err != nil {
		t.Fatal("sub folder not written")
	}
	if m, _ := filepath.Glob(filepath.Join(folder, "*.part")); len(m) > 0 {
		t.Fatalf("left %v", m)
	}
	d := Drive{ID: root, root: root, Free: 1 << 30}
	describe(&d, k)
	if d.KitVersion != k.version || d.Wifi == nil || d.Wifi.SSID != "EDUINO-LAB" || d.Need != 0 {
		t.Fatalf("describe: %+v", d)
	}
	// A second time: the same results moved again under another name.
	os.WriteFile(filepath.Join(folder, "result-ubuntu-3a7f.txt"), []byte("결과: 성공"), 0o644)
	if moved, err := makeStick(root, k, WifiForm{SSID: "B"}, func(int64) {}); err != nil || moved != 1 {
		t.Fatalf("again: %d %v", moved, err)
	}
	if m, _ := filepath.Glob(filepath.Join(folder, oldResults, "result-ubuntu-3a7f*.txt")); len(m) != 2 {
		t.Fatalf("old results %v", m)
	}
	// Not enough room.
	d = Drive{ID: root, root: t.TempDir(), Free: 10}
	describe(&d, k)
	if d.Need != k.size-10 {
		t.Fatalf("need %d", d.Need)
	}
}

// The robot's own reader (robot-python/server/usb_setup.py) reads what this writes.
func TestRobotReadsWifi(t *testing.T) {
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("no python3")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "wifi.txt")
	os.WriteFile(p, fillWifi([]byte(tmplWifi), WifiForm{SSID: "교실 Wi-Fi", Password: "a=b c#d", Label: "3조", More: []WifiNet{{SSID: "robodyne2", Password: "pass-two2"}}}), 0o644)
	server, _ := filepath.Abs("../robot-python/server")
	out, err := exec.Command(py, "-c", "import sys,json; sys.path.insert(0, sys.argv[1]); import usb_setup as u; print(json.dumps(u.read_fields(sys.argv[2]), ensure_ascii=False))", server, p).CombinedOutput()
	if err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	var got struct {
		SSID, Password, Label string
		More                  [][2]string
	}
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatalf("%s", out)
	}
	if got.SSID != "교실 Wi-Fi" || got.Password != "a=b c#d" || got.Label != "3조" || len(got.More) != 1 || got.More[0] != [2]string{"robodyne2", "pass-two2"} {
		t.Fatalf("robot read %v", got)
	}
}

func TestUSBAPI(t *testing.T) {
	k := testKit(t, "v1")
	kitOnce.Do(func() {})
	kitNow = k
	t.Cleanup(func() { kitNow = nil })
	root := t.TempDir()
	t.Setenv("PAI_USB_ROOTS", root)
	h := usbHandler(http.NotFoundHandler())
	call := func(method, url, body string, local bool) (int, map[string]any) {
		r := httptest.NewRequest(method, url, strings.NewReader(body))
		r.Host = "127.0.0.1:47280"
		r.RemoteAddr = "127.0.0.1:50000"
		if local {
			r.Header.Set("X-Physical-AI", "1")
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		var out map[string]any
		json.Unmarshal(w.Body.Bytes(), &out)
		return w.Code, out
	}
	if code, _ := call("GET", usbAPI, "", false); code != http.StatusForbidden {
		t.Fatalf("no header: %d", code)
	}
	r := httptest.NewRequest("GET", usbAPI, nil)
	r.Header.Set("X-Physical-AI", "1")
	r.Host = "evil.example:47280"
	r.RemoteAddr = "127.0.0.1:1"
	if w := httptest.NewRecorder(); func() int { h.ServeHTTP(w, r); return w.Code }() != http.StatusForbidden {
		t.Fatal("other host answered")
	}
	code, st := call("GET", usbAPI, "", true)
	if code != 200 || len(st["drives"].([]any)) != 1 || st["kit"].(map[string]any)["version"] != "v1" {
		t.Fatalf("state %d %v", code, st)
	}
	if code, out := call("POST", usbAPI+"/make", `{"drive":"`+root+`","wifi":{"ssid":""}}`, true); code != 400 || !strings.Contains(out["error"].(string), "Wi-Fi 이름") {
		t.Fatalf("empty ssid: %d %v", code, out)
	}
	if code, _ := call("POST", usbAPI+"/make", `{"drive":"/nowhere","wifi":{"ssid":"a"}}`, true); code != 404 {
		t.Fatalf("unknown drive: %d", code)
	}
	if code, _ := call("POST", usbAPI+"/make", `{"drive":"`+root+`","wifi":{"ssid":"EDUINO-LAB","password":"12345678","label":"1조"}}`, true); code != 200 {
		t.Fatalf("make: %d", code)
	}
	deadline := time.Now().Add(5 * time.Second)
	for {
		_, j := call("GET", usbAPI+"/job", "", true)
		job := j["job"].(map[string]any)
		if job["state"] == "done" {
			break
		}
		if job["state"] == "error" || time.Now().After(deadline) {
			t.Fatalf("job %v", job)
		}
		time.Sleep(20 * time.Millisecond)
	}
	os.WriteFile(filepath.Join(root, "eduino", "result-ubuntu-3a7f.txt"), []byte("\xef\xbb\xbf2026-10-14 09:12\r\n결과: 성공 — 'EDUINO-LAB' 에 연결했어요.\r\n"), 0o644)
	code, res := call("GET", usbAPI+"/results?drive="+root, "", true)
	list := res["results"].([]any)
	if code != 200 || len(list) != 1 || !strings.HasPrefix(list[0].(map[string]any)["text"].(string), "2026-10-14") {
		t.Fatalf("results %d %v", code, res)
	}
	_, st = call("GET", usbAPI, "", true)
	d := st["drives"].([]any)[0].(map[string]any)
	if d["kitVersion"] != "v1" || d["results"].(float64) != 1 || d["wifi"].(map[string]any)["label"] != "1조" {
		t.Fatalf("drive %v", d)
	}
}

// More networks: written as 와이파이2= / 비밀번호2= …, read back in order, empty ones left out, checked like the first.
func TestWifiMore(t *testing.T) {
	w := WifiForm{SSID: "robodyne", Password: "pass-one1", Label: "3조", More: []WifiNet{{SSID: "robodyne2", Password: "pass-two2"}, {}, {SSID: "lab3"}}}
	b := fillWifi([]byte(tmplWifi), w)
	s := string(b)
	for _, line := range []string{"와이파이=robodyne\r\n", "와이파이2=robodyne2\r\n비밀번호2=pass-two2\r\n", "와이파이4=lab3\r\n"} {
		if !strings.Contains(s, line) {
			t.Fatalf("missing %q in %q", line, s)
		}
	}
	if strings.Contains(s, "와이파이3=") {
		t.Fatalf("an empty network written: %q", s)
	}
	got := readWifi(b)
	want := []WifiNet{{SSID: "robodyne2", Password: "pass-two2"}, {SSID: "lab3"}}
	if got.SSID != "robodyne" || !reflect.DeepEqual(got.More, want) {
		t.Fatalf("read back: %+v", got)
	}
	if msg := checkWifi(WifiForm{SSID: "a", More: []WifiNet{{SSID: "b", Password: "short"}}}); !strings.Contains(msg, "2번째 Wi-Fi") {
		t.Fatalf("checkWifi: %q", msg)
	}
	if msg := checkWifi(w); msg != "" {
		t.Fatalf("checkWifi ok form: %q", msg)
	}
}
