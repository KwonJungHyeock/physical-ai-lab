package main

import (
	"archive/zip"
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// fakeRobot: an SSH server like a new robot's — password login, commands run by sh on this machine in
// a sandbox, with a sudo that takes the password from stdin like the real one (sudo -S -p ”).
type fakeRobot struct {
	addr, port string
	cmds       []string
	ln         net.Listener
}

func startFakeRobot(t *testing.T, user, pass, bin string) *fakeRobot {
	t.Helper()
	_, key, _ := ed25519.GenerateKey(rand.Reader)
	signer, err := ssh.NewSignerFromKey(key)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{PasswordCallback: func(c ssh.ConnMetadata, p []byte) (*ssh.Permissions, error) {
		if c.User() == user && string(p) == pass {
			return nil, nil
		}
		return nil, io.EOF
	}}
	cfg.AddHostKey(signer)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	r := &fakeRobot{ln: ln}
	r.addr, r.port, _ = net.SplitHostPort(ln.Addr().String())
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go r.serve(c, cfg, bin)
		}
	}()
	return r
}

func (r *fakeRobot) serve(c net.Conn, cfg *ssh.ServerConfig, bin string) {
	_, chans, reqs, err := ssh.NewServerConn(c, cfg)
	if err != nil {
		return
	}
	go ssh.DiscardRequests(reqs)
	for nc := range chans {
		ch, in, err := nc.Accept()
		if err != nil {
			continue
		}
		go func() {
			defer ch.Close()
			for req := range in {
				if req.Type != "exec" {
					req.Reply(false, nil)
					continue
				}
				n := binary.BigEndian.Uint32(req.Payload)
				line := string(req.Payload[4 : 4+n])
				r.cmds = append(r.cmds, line)
				req.Reply(true, nil)
				cmd := exec.Command("sh", "-c", line)
				cmd.Env = append(os.Environ(), "PATH="+bin+":"+os.Getenv("PATH"))
				cmd.Stdin, cmd.Stdout, cmd.Stderr = ch, ch, ch.Stderr()
				code := 0
				if err := cmd.Run(); err != nil {
					code = 1
					if e, ok := err.(*exec.ExitError); ok {
						code = e.ExitCode()
					}
				}
				ch.SendRequest("exit-status", false, binary.BigEndian.AppendUint32(nil, uint32(code)))
				return
			}
		}()
	}
}

// setupKit: a kit whose install.py says what the real one says and writes a result beside itself.
func setupKit(t *testing.T, install string) *kitData {
	t.Helper()
	var outer bytes.Buffer
	oz := zip.NewWriter(&outer)
	for name, body := range map[string]string{
		"eduino/wifi.txt":          tmplWifi,
		"eduino/robot_console.zip": strings.Repeat("x", 600<<10),
		"eduino/install.py":        install,
	} {
		w, _ := oz.Create(name)
		w.Write([]byte(body))
	}
	oz.Close()
	k, err := openKit(bytes.NewReader(outer.Bytes()), int64(outer.Len()))
	if err != nil {
		t.Fatal(err)
	}
	return k
}

const okInstall = `import os, sys
print("[1/4] 콘솔 파일 풀기", flush=True)
w = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "wifi.txt"), encoding="utf-8-sig").read()
assert "와이파이=EDUINO-LAB" in w and "사용자=3조" in w, w
print("[4/4] 교실 Wi-Fi 연결", flush=True)
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "result-rdk.txt"), "w", encoding="utf-8").write("2026-10-26 10:00\n로봇: rdk   사용자: 3조\n결과: 성공 — 'EDUINO-LAB' 에 연결했어요.\n로봇 ID: 52   주소: 무선 192.168.0.52\n")
print("\n끝났어요.")
`

// fakeSudo: sudo -S -p ” CMD… with the password on stdin, like the robot's (wrong password: Sorry).
func fakeSudo(t *testing.T, pass string) string {
	t.Helper()
	bin := t.TempDir()
	script := "#!/bin/sh\nshift; shift; shift\nread -r p\nif [ \"$p\" != \"" + pass + "\" ]; then echo 'Sorry, try again.' >&2; exit 1; fi\nexec \"$@\"\n"
	if err := os.WriteFile(filepath.Join(bin, "sudo"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return bin
}

func useFake(t *testing.T, r *fakeRobot) {
	oldHosts, oldPort, oldDir, oldPoll := setupHosts, setupPort, setupDir, setupPoll
	setupHosts, setupPort, setupDir, setupPoll = []string{"127.0.0.2", r.addr}, r.port, t.TempDir(), 100*time.Millisecond
	t.Cleanup(func() { setupHosts, setupPort, setupDir, setupPoll = oldHosts, oldPort, oldDir, oldPoll })
	setupNow = &SetupJob{State: "find"}
}

func TestSetupFactoryLogin(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("python3")
	}
	r := startFakeRobot(t, "sunrise", "sunrise", fakeSudo(t, "sunrise"))
	useFake(t, r)
	wifi := WifiForm{SSID: "EDUINO-LAB", Password: "12345678", Label: "3조"}
	if err := runSetup("", setupLogins, setupKit(t, okInstall), wifi); err != nil {
		t.Fatal(err)
	}
	j := setupSnapshot()
	if j.State != "done" || j.User != "sunrise" || j.Host != r.addr {
		t.Fatalf("job: %+v", j)
	}
	if !strings.Contains(j.Result, "로봇 ID: 52") || !strings.Contains(strings.Join(j.Log, "\n"), "<<EXIT 0>>") {
		t.Fatalf("result/log: %q %q", j.Result, j.Log)
	}
	if j.Done != j.Total || j.Total == 0 {
		t.Fatalf("upload %d/%d", j.Done, j.Total)
	}
	// The password went to sudo on stdin, never on a command line.
	for _, c := range r.cmds {
		if strings.Contains(c, "sunrise") {
			t.Fatalf("password in a command: %q", c)
		}
	}
}

func TestSetupWrongLogins(t *testing.T) {
	r := startFakeRobot(t, "sunrise", "other-pass", t.TempDir())
	useFake(t, r)
	err := runSetup("", setupLogins, setupKit(t, okInstall), WifiForm{SSID: "EDUINO-LAB"})
	if err == nil || !strings.Contains(err.Error(), "공장 계정") {
		t.Fatalf("want 공장 계정 error, got %v", err)
	}
	// The account typed on the screen works.
	useFake(t, r)
	if _, err := os.Stat("/bin/sh"); err != nil {
		t.Skip()
	}
	err = runSetup(r.addr, [][2]string{{"sunrise", "nope"}}, setupKit(t, okInstall), WifiForm{SSID: "EDUINO-LAB"})
	if err == nil || !strings.Contains(err.Error(), "비밀번호가 맞지 않아요") {
		t.Fatalf("got %v", err)
	}
}

func TestSetupInstallFails(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("python3")
	}
	r := startFakeRobot(t, "sunrise", "sunrise", fakeSudo(t, "sunrise"))
	useFake(t, r)
	bad := "print('[1/4] 콘솔 파일 풀기')\nraise SystemExit('robot_console.zip 이 이 키트의 것이 아니에요. 키트를 다시 받아 주세요.')\n"
	err := runSetup("", setupLogins, setupKit(t, bad), WifiForm{SSID: "EDUINO-LAB"})
	if err == nil || !strings.Contains(err.Error(), "이 키트의 것이 아니에요") {
		t.Fatalf("got %v", err)
	}
}

func TestSetupNoRobot(t *testing.T) {
	old, oldPort, oldLAN, oldPrep := setupHosts, setupPort, setupLANHost, prepareLAN
	setupHosts, setupPort, setupLANHost = []string{"127.0.0.2"}, "1", "127.0.0.3"
	prepareLAN = func() (func(), error) { return func() {}, nil }
	t.Cleanup(func() { setupHosts, setupPort, setupLANHost, prepareLAN = old, oldPort, oldLAN, oldPrep })
	err := runSetup("", setupLogins, setupKit(t, okInstall), WifiForm{SSID: "X"})
	if err == nil || !strings.Contains(err.Error(), "로봇을 찾지 못했어요") {
		t.Fatalf("got %v", err)
	}
}

func TestLANCandidate(t *testing.T) {
	ip := func(s string) []net.IP { return []net.IP{net.ParseIP(s).To4()} }
	ports := []lanPort{
		{Index: 3, Name: "Wi-Fi", Up: true, IPv4: ip("192.168.0.20")},
		{Index: 5, Name: "vEthernet (WSL)", Up: true, IPv4: ip("172.20.0.1")},
		{Index: 7, Name: "이더넷 2", Up: false},
		{Index: 9, Name: "이더넷", Up: true, IPv4: ip("169.254.33.7")},
	}
	if i, n := lanCandidate(ports); i != 9 || n != "이더넷" {
		t.Fatalf("got %d %q", i, n)
	}
	// A wired port on a real network is never taken.
	ports[3].IPv4 = append(ports[3].IPv4, net.ParseIP("10.1.2.3").To4())
	if i, _ := lanCandidate(ports); i != 0 {
		t.Fatalf("took a port on a network: %d", i)
	}
}

// A new robot on a LAN cable: not found at first, found once the PC's port has its address; the
// address is given back when the setup ends, whatever happened.
func TestSetupLANCable(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Skip("python3")
	}
	r := startFakeRobot(t, "sunrise", "sunrise", fakeSudo(t, "sunrise"))
	useFake(t, r)
	oldHosts, oldLAN, oldPrep := setupHosts, setupLANHost, prepareLAN
	t.Cleanup(func() { setupHosts, setupLANHost, prepareLAN = oldHosts, oldLAN, oldPrep })
	setupHosts, setupLANHost = []string{"127.0.0.2"}, r.addr
	asked, released := 0, 0
	prepareLAN = func() (func(), error) {
		asked++
		return func() { released++ }, nil
	}
	if err := runSetup("", setupLogins, setupKit(t, okInstall), WifiForm{SSID: "EDUINO-LAB", Label: "3조"}); err != nil {
		t.Fatal(err)
	}
	if asked != 1 || released != 1 || setupSnapshot().State != "done" {
		t.Fatalf("asked %d released %d state %s", asked, released, setupSnapshot().State)
	}
	// Refused (the allow window answered no): the reason, nothing else tried.
	useFake(t, r)
	setupHosts = []string{"127.0.0.2"}
	prepareLAN = func() (func(), error) { return nil, errLANDenied }
	if err := runSetup("", setupLogins, setupKit(t, okInstall), WifiForm{SSID: "X"}); err != errLANDenied {
		t.Fatalf("got %v", err)
	}
}

// The screen reads job.log as a list from the first answer on (an empty log is [], not null).
func TestSetupSnapshotLog(t *testing.T) {
	setupNow = &SetupJob{State: "find"}
	b, _ := json.Marshal(setupSnapshot())
	if !strings.Contains(string(b), `"log":[]`) {
		t.Fatalf("got %s", b)
	}
}
