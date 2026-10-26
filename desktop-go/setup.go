// 새 로봇 처음 설치: the first install of a robot from this PC, with no monitor or keyboard on the robot.
//
// A new myCobot 280 RDK X5 has the factory address 192.168.127.10 on its LAN port and lets SSH in with
// the factory account sunrise/sunrise (Elephant Robotics' RDK X5 manual, 5.2). The teacher joins the
// robot and this PC with one LAN cable and presses one button; this program then
//   - finds the robot (port 22 on that address, on our own direct-cable one, on a robot hotspot's),
//     and if it is out of reach gives this PC's cabled port an address beside it (lanprep*.go),
//   - logs in (the account typed, else the factory ones: sunrise/sunrise, root/root, er/Elephant),
//   - copies the kit it carries (the same eduino/ folder a USB stick gets, wifi.txt filled in) to
//     /tmp/eduino-setup/eduino on the robot,
//   - starts eduino/install.py there with sudo, detached, so it goes on even if this connection drops
//     (over a hotspot the robot's move to the classroom Wi-Fi cuts it), and
//   - reads its log until it ends or the robot moves to the other Wi-Fi.
//
// The robot's host key is not checked: a new robot's key is not known anywhere yet. What goes to the
// robot is its own password and the signed kit; install.py and the robot's kit check are unchanged.
//
// Only for the person at this PC, like the USB maker (localRequest):
//
//	GET  /__physical-ai-simulator/setup        → {kit, pcSsid, job}
//	POST /__physical-ai-simulator/setup/start  {host, user, password, wifi} → {job}
package main

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

const setupAPI = hello + "/setup"

var (
	// Where a new robot is: its LAN port's factory address, our own direct-cable address (a robot set up
	// before), a robot hotspot (when the robot has one: not in the RDK X5 manual).
	setupHosts = []string{robotLAN, "169.254.127.10", "10.42.0.1"}
	// Looked for again once this PC's port has an address beside the robot's.
	setupLANHost = robotLAN
	setupPort    = "22"
	// The factory accounts, tried in turn when none is typed.
	setupLogins = [][2]string{{"sunrise", "sunrise"}, {"root", "root"}, {"er", "Elephant"}}
	// On the robot: the kit goes to <setupDir>/eduino (install.py writes its result beside itself).
	setupDir = "/tmp/eduino-setup"
	// How long install.py may take (unpacking ~90 MB on the robot, the services, the Wi-Fi).
	setupWait = 10 * time.Minute
	setupPoll = time.Second
)

// PAI_SETUP_PORT stands in for the robot's SSH port in tests and screenshots (a fake robot on this PC).
func init() {
	if p := os.Getenv("PAI_SETUP_PORT"); p != "" {
		setupPort = p
	}
}

// SetupJob is the one robot being set up now (the screen asks how far it is).
type SetupJob struct {
	// find · lan (this PC's port gets an address beside the robot's) · login · upload · install ·
	// done · moved (the robot left for the other Wi-Fi) · error
	State string `json:"state"`
	Host  string `json:"host,omitempty"`
	User  string `json:"user,omitempty"`
	Board string `json:"board,omitempty"`
	Done  int64  `json:"done"`
	Total int64  `json:"total"`
	// install.py's last lines, and the robot's result file when it wrote one.
	Log    []string `json:"log"`
	Result string   `json:"result,omitempty"`
	Error  string   `json:"error,omitempty"`
	SSID   string   `json:"ssid"`
}

var (
	setupMu  sync.Mutex
	setupNow *SetupJob
)

func setupSnapshot() *SetupJob {
	setupMu.Lock()
	defer setupMu.Unlock()
	if setupNow == nil {
		return nil
	}
	j := *setupNow
	j.Log = append([]string{}, setupNow.Log...) // [] not null for the screen
	return &j
}

func setupUpdate(f func(j *SetupJob)) {
	setupMu.Lock()
	defer setupMu.Unlock()
	if setupNow != nil {
		f(setupNow)
	}
}

func setupHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		if p != setupAPI && !strings.HasPrefix(p, setupAPI+"/") {
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
		case p == setupAPI && r.Method == http.MethodGet:
			out := map[string]any{"kit": nil, "pcSsid": pcWifi().SSID, "job": setupSnapshot()}
			if k := loadKit(); k != nil {
				out["kit"] = map[string]any{"version": k.version, "size": k.size}
			}
			reply(w, out)
		case p == setupAPI+"/start" && r.Method == http.MethodPost:
			startSetup(w, r)
		default:
			replyError(w, http.StatusNotFound, "없는 요청이에요.")
		}
	})
}

func startSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Host     string   `json:"host"`
		User     string   `json:"user"`
		Password string   `json:"password"`
		Wifi     WifiForm `json:"wifi"`
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
	host := strings.TrimSpace(body.Host)
	if host != "" && net.ParseIP(host) == nil {
		replyError(w, http.StatusBadRequest, "로봇 주소는 숫자 주소로 적어 주세요 (예: 10.42.0.1).")
		return
	}
	setupMu.Lock()
	if setupNow != nil && !setupEnded(setupNow.State) {
		setupMu.Unlock()
		replyError(w, http.StatusConflict, "다른 로봇을 설치하는 중이에요.")
		return
	}
	setupNow = &SetupJob{State: "find", Total: k.size, SSID: body.Wifi.SSID, Log: []string{}}
	setupMu.Unlock()
	logins := setupLogins
	if u := strings.TrimSpace(body.User); u != "" {
		logins = [][2]string{{u, body.Password}}
	}
	go func() {
		err := runSetup(host, logins, k, body.Wifi)
		setupUpdate(func(j *SetupJob) {
			if err != nil {
				j.State, j.Error = "error", err.Error()
			}
		})
	}()
	reply(w, map[string]any{"job": setupSnapshot()})
}

func setupEnded(state string) bool {
	return state == "done" || state == "moved" || state == "error"
}

// runSetup: find, log in, copy, start, follow. Errors are for the screen, in words.
func runSetup(host string, logins [][2]string, k *kitData, wifi WifiForm) error {
	hosts := setupHosts
	if host != "" {
		hosts = []string{host}
	}
	addr := findRobot(hosts)
	if addr == "" && host == "" {
		// A new robot on a LAN cable: its factory address is out of this PC's reach until the PC's
		// port has one beside it (one "allow" window on Windows), given back when this ends.
		setupUpdate(func(j *SetupJob) { j.State = "lan" })
		release, err := prepareLAN()
		if err != nil {
			return err
		}
		defer release()
		setupUpdate(func(j *SetupJob) { j.State = "find" })
		for i := 0; i < 6 && addr == ""; i++ {
			addr = findRobot([]string{setupLANHost})
		}
	}
	if addr == "" {
		return errors.New("로봇을 찾지 못했어요. 로봇과 PC 를 랜선으로 이었는지, 로봇 전원을 켜고 1분 지났는지 봐 주세요.")
	}
	setupUpdate(func(j *SetupJob) { j.State, j.Host, j.Total = "login", addr, k.size })

	client, login, err := sshLogin(addr, logins)
	if err != nil {
		return err
	}
	defer client.Close()
	board, _ := sshRun(client, "", "cat /proc/device-tree/model 2>/dev/null | tr -d '\\0'; echo; id -u")
	lines := strings.Split(strings.TrimSpace(board), "\n")
	root := strings.TrimSpace(lines[len(lines)-1]) == "0"
	setupUpdate(func(j *SetupJob) {
		j.State, j.User = "upload", login[0]
		if len(lines) > 1 {
			j.Board = strings.TrimSpace(lines[0])
		}
	})

	if err := sshUpload(client, k, wifi, func(done int64) { setupUpdate(func(j *SetupJob) { j.Done = done }) }); err != nil {
		return err
	}
	setupUpdate(func(j *SetupJob) { j.State, j.Done = "install", j.Total })

	// Detached (setsid, its own log), so a Wi-Fi switch that cuts this connection does not stop it.
	start := fmt.Sprintf("setsid nohup sh %[1]s/run.sh </dev/null >%[1]s/install.log 2>&1 & echo started", setupDir)
	cmd, stdin := "sh -c '"+start+"'", ""
	if !root {
		cmd, stdin = "sudo -S -p '' "+cmd, login[1]+"\n"
	}
	out, err := sshRun(client, stdin, cmd)
	if err != nil || !strings.Contains(out, "started") {
		if strings.Contains(out, "incorrect password") || strings.Contains(out, "Sorry") || strings.Contains(out, "not in the sudoers") {
			return fmt.Errorf("로봇 관리자 권한(sudo)을 받지 못했어요 (%s 계정). 다른 계정 · 비밀번호를 적어 다시 해 주세요.", login[0])
		}
		return fmt.Errorf("설치를 시작하지 못했어요: %s", firstLine(out, err))
	}
	return followSetup(client, addr, login)
}

// findRobot: the first address with SSH open (all tried at once, a few seconds).
func findRobot(hosts []string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	found := make(chan string, len(hosts))
	for _, h := range hosts {
		go func(h string) {
			var d net.Dialer
			c, err := d.DialContext(ctx, "tcp", net.JoinHostPort(h, setupPort))
			if err != nil {
				found <- ""
				return
			}
			c.Close()
			found <- h
		}(h)
	}
	// In the order given when several answer.
	got := map[string]bool{}
	for range hosts {
		if h := <-found; h != "" {
			got[h] = true
		}
	}
	for _, h := range hosts {
		if got[h] {
			return h
		}
	}
	return ""
}

func sshConfig(user, pass string) *ssh.ClientConfig {
	return &ssh.ClientConfig{
		User: user,
		Auth: []ssh.AuthMethod{
			ssh.Password(pass),
			ssh.KeyboardInteractive(func(_, _ string, qs []string, _ []bool) ([]string, error) {
				a := make([]string, len(qs))
				for i := range a {
					a[i] = pass
				}
				return a, nil
			}),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // a new robot: its key is not known yet (see the top)
		Timeout:         8 * time.Second,
	}
}

func sshLogin(host string, logins [][2]string) (*ssh.Client, [2]string, error) {
	var last error
	for _, l := range logins {
		c, err := ssh.Dial("tcp", net.JoinHostPort(host, setupPort), sshConfig(l[0], l[1]))
		if err == nil {
			return c, l, nil
		}
		last = err
		if !strings.Contains(err.Error(), "unable to authenticate") {
			break // not a wrong password: the same for every account
		}
	}
	if last != nil && strings.Contains(last.Error(), "unable to authenticate") {
		if len(logins) == 1 {
			return nil, [2]string{}, fmt.Errorf("로봇에 로그인하지 못했어요: 계정 %s 의 비밀번호가 맞지 않아요.", logins[0][0])
		}
		return nil, [2]string{}, errors.New("로봇에 로그인하지 못했어요: 공장 계정(sunrise · root · er)이 모두 맞지 않아요. 로봇 설명서의 계정과 비밀번호를 적어 다시 해 주세요.")
	}
	return nil, [2]string{}, fmt.Errorf("로봇에 접속하지 못했어요: %s", firstLine("", last))
}

// sshRun: one command's output (stdout and stderr together).
func sshRun(c *ssh.Client, stdin, cmd string) (string, error) {
	s, err := c.NewSession()
	if err != nil {
		return "", err
	}
	defer s.Close()
	if stdin != "" {
		s.Stdin = strings.NewReader(stdin)
	}
	out, err := s.CombinedOutput(cmd)
	return string(out), err
}

// sshUpload: the kit's eduino/ folder (wifi.txt filled in) as a tar stream into <setupDir> on the robot.
func sshUpload(c *ssh.Client, k *kitData, wifi WifiForm, progress func(int64)) error {
	s, err := c.NewSession()
	if err != nil {
		return err
	}
	defer s.Close()
	in, err := s.StdinPipe()
	if err != nil {
		return err
	}
	var errOut bytes.Buffer
	s.Stderr = &errOut
	if err := s.Start(fmt.Sprintf("rm -rf %[1]s/eduino && mkdir -p %[1]s && tar -x -m -C %[1]s", setupDir)); err != nil {
		return err
	}
	tw := tar.NewWriter(in)
	var done int64
	werr := func() error {
		if err := tw.WriteHeader(&tar.Header{Name: "run.sh", Mode: 0o755, Size: int64(len(runScript)), ModTime: time.Now(), Typeflag: tar.TypeReg}); err != nil {
			return err
		}
		if _, err := tw.Write([]byte(runScript)); err != nil {
			return err
		}
		for _, f := range k.zip.File {
			name, ok := kitEntry(f.Name)
			if !ok {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				return err
			}
			b, err := io.ReadAll(rc)
			rc.Close()
			if err != nil {
				return err
			}
			if name == wifiFile {
				b = fillWifi(b, wifi)
			}
			if err := tw.WriteHeader(&tar.Header{Name: kitFolder + "/" + name, Mode: 0o644, Size: int64(len(b)), ModTime: time.Now(), Typeflag: tar.TypeReg}); err != nil {
				return err
			}
			// In pieces, so the bar moves while a big file goes.
			for off := 0; off < len(b); off += 256 << 10 {
				end := min(off+256<<10, len(b))
				if _, err := tw.Write(b[off:end]); err != nil {
					return err
				}
				done += int64(end - off)
				progress(done)
			}
		}
		return tw.Close()
	}()
	in.Close()
	if err := s.Wait(); err != nil || werr != nil {
		return fmt.Errorf("로봇에 키트를 보내다가 멈췄어요: %s", firstLine(errOut.String(), errors.Join(werr, err)))
	}
	return nil
}

// runScript starts install.py from the kit beside it and marks the end of the log with its exit code.
const runScript = "#!/bin/sh\ncd \"$(dirname \"$0\")/eduino\" || exit 1\npython3 install.py\necho \"<<EXIT $?>>\"\n"

var exitMark = regexp.MustCompile(`<<EXIT (\d+)>>`)

// followSetup: install.py's log until it ends. When the robot joins the other Wi-Fi this connection
// drops: after the Wi-Fi step that is the expected end ("moved"), before it, a short reconnect.
func followSetup(c *ssh.Client, host string, login [2]string) error {
	deadline := time.Now().Add(setupWait)
	read := fmt.Sprintf("tail -n 40 %[1]s/install.log; echo '<<RESULT>>'; cat %[1]s/eduino/result-*.txt 2>/dev/null; true", setupDir)
	for time.Now().Before(deadline) {
		time.Sleep(setupPoll)
		out, err := sshRun(c, "", read)
		var exit *ssh.ExitError
		if err != nil && !errors.As(err, &exit) {
			if wifiStep(setupSnapshot()) {
				setupUpdate(func(j *SetupJob) { j.State = "moved" })
				return nil
			}
			// Lost before the Wi-Fi step: try to come back for a while.
			c.Close()
			var again *ssh.Client
			for i := 0; i < 10 && again == nil; i++ {
				time.Sleep(3 * time.Second)
				again, _ = ssh.Dial("tcp", net.JoinHostPort(host, setupPort), sshConfig(login[0], login[1]))
			}
			if again == nil {
				return errors.New("설치 중에 로봇과 연결이 끊겼어요. 로봇은 혼자 설치를 이어 가요. 2분 뒤 [로봇 찾기] 로 찾아보고, 없으면 다시 설치해 주세요.")
			}
			c = again
			defer again.Close()
			continue
		}
		logPart, result, _ := strings.Cut(out, "<<RESULT>>")
		lines := strings.Split(strings.TrimRight(logPart, "\n"), "\n")
		setupUpdate(func(j *SetupJob) {
			j.Log = lines
			j.Result = strings.TrimSpace(result)
		})
		if m := exitMark.FindStringSubmatch(logPart); m != nil {
			// 0: all done; 1 after 설치는 끝났지만: installed, only the Wi-Fi failed (the result says why).
			if m[1] == "0" || strings.Contains(logPart, "설치는 끝났지만") {
				setupUpdate(func(j *SetupJob) { j.State = "done" })
				return nil
			}
			return fmt.Errorf("로봇에서 설치가 멈췄어요: %s", lastLines(lines[:len(lines)-1], 2))
		}
	}
	return errors.New("설치가 10분 안에 끝나지 않았어요. 로봇을 다시 켜고 처음부터 해 주세요.")
}

// wifiStep: install.py has reached its Wi-Fi step (the one that may move the robot off the hotspot).
func wifiStep(j *SetupJob) bool {
	if j == nil {
		return false
	}
	for _, l := range j.Log {
		if strings.Contains(l, "[4/4]") {
			return true
		}
	}
	return false
}

func firstLine(out string, err error) string {
	if s := strings.TrimSpace(out); s != "" {
		return strings.SplitN(s, "\n", 2)[0]
	}
	if err != nil {
		return err.Error()
	}
	return "알 수 없는 이유"
}

func lastLines(lines []string, n int) string {
	var keep []string
	for i := len(lines) - 1; i >= 0 && len(keep) < n; i-- {
		if s := strings.TrimSpace(lines[i]); s != "" {
			keep = append([]string{s}, keep...)
		}
	}
	return strings.Join(keep, " / ")
}
