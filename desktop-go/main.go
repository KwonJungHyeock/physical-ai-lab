// Physical AI 시뮬레이터: the classroom console's simulator as one program.
//
// The whole web app (the same static export the robot serves, built by
// `npm run build:robot`) is embedded in this file; double-clicking it serves
// the app on this PC only (127.0.0.1) and opens it in Edge or Chrome as an
// app window. No installation, no internet, no robot: blocks, Python and
// ROS 2 all run in the simulator. With `?from=sim` the console starts with
// 로봇 찾기 on this PC's own networks (/__physical-ai-simulator/lan): robots on
// the same Wi-Fi are listed with their names and addresses, one click opens one.
//
// Started with -class it is the teacher's class server instead (classmode.go, classroom/): the app on
// the local network, class accounts and learning records on this PC.
//
// Build with build.sh (it copies the app into site/ first).
package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"sort"
	"strings"
	"time"
)

//go:embed all:site
var site embed.FS

// A fixed port keeps the same address every time, so what the browser saved for this
// page (chosen model, progress, saved poses) is there again on the next start.
const port = 47280

const hello = "/__physical-ai-simulator"

func main() {
	setupConsole()
	root, err := fs.Sub(site, "site")
	if err != nil {
		fail(err)
	}
	for ext, typ := range map[string]string{
		".glb":         "model/gltf-binary",
		".wasm":        "application/wasm",
		".mjs":         "text/javascript; charset=utf-8",
		".webmanifest": "application/manifest+json",
		".txt":         "text/plain; charset=utf-8",
		".mp4":         "video/mp4",
	} {
		_ = mime.AddExtensionType(ext, typ)
	}
	if classModeWanted(os.Args[1:]) {
		runClassServer(root, classDataDir(os.Args[1:]), classDevOrigins(os.Args[1:]))
		return
	}

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	url := fmt.Sprintf("http://%s/console?from=sim", addr)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Already running (double-clicked twice): just open another window.
		if running(addr) {
			openApp(url)
			fmt.Println("시뮬레이터가 이미 켜져 있어 창만 새로 열었어요.")
			time.Sleep(3 * time.Second)
			return
		}
		// The port is taken by something else: any free port (saved settings start empty).
		ln, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			fail(err)
		}
		url = fmt.Sprintf("http://%s/console?from=sim", ln.Addr())
	}

	fmt.Println("============================================================")
	fmt.Println("  ROBODYNE SYSTEMS · Physical AI 로봇 학습 프로그램 — 시뮬레이터")
	fmt.Println("============================================================")
	fmt.Println()
	fmt.Println("  화면을 여는 중이에요 (크롬 또는 엣지 앱 창).")
	fmt.Println("  창이 안 열리면 이 주소를 크롬·엣지 주소창에 넣으세요:")
	fmt.Println("    " + url)
	fmt.Println()
	fmt.Println("  이 검은 창을 닫으면 시뮬레이터가 꺼져요.")
	fmt.Println("  로봇과 같은 Wi-Fi 에 연결돼 있으면 처음 화면에서 로봇을 찾아 보여 줘요.")
	if nets := lanPrefixes(); len(nets) > 0 {
		fmt.Println("  이 PC 의 네트워크: " + strings.Join(nets, ", "))
	} else {
		fmt.Println("  (Wi-Fi 에 연결돼 있지 않아요 — 로봇 없이 시뮬레이션만 돼요)")
	}

	go func() {
		time.Sleep(300 * time.Millisecond)
		openApp(url)
	}()
	// The USB maker (usbkit.go) only here, on 127.0.0.1: not in the class server on the LAN.
	srv := &http.Server{Handler: setupHandler(usbHandler(aiHandler(handler(root)))), ReadHeaderTimeout: 10 * time.Second}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fail(err)
	}
}

// handler serves the static export the way the robot's server does: /console → console.html.
func handler(root fs.FS) http.Handler {
	files := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		switch {
		case p == hello:
			_, _ = w.Write([]byte("ok"))
			return
		case p == hello+"/lan":
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Cache-Control", "no-store")
			// ssid: the PC's Wi-Fi, for 로봇 찾기 to say when a robot was last seen on another one
			_ = json.NewEncoder(w).Encode(map[string]any{"prefixes": lanPrefixes(), "ssid": pcSSID()})
			return
		case strings.HasPrefix(p, "/api/"):
			// No robot here: the console stays a simulator.
			http.Error(w, `{"error":"no robot"}`, http.StatusNotFound)
			return
		}
		name := strings.TrimPrefix(p, "/")
		if name == "" {
			name = "index.html"
		}
		for _, try := range []string{name, name + ".html", path.Join(name, "index.html")} {
			if st, err := fs.Stat(root, try); err == nil && !st.IsDir() {
				if strings.HasSuffix(try, ".html") || try == "sw.js" {
					w.Header().Set("Cache-Control", "no-cache")
				}
				r2 := r.Clone(r.Context())
				r2.URL.Path = "/" + try
				// FileServer turns /index.html into a redirect to ./; serve that one directly.
				if path.Base(try) == "index.html" {
					serveFile(w, r2, root, try)
					return
				}
				files.ServeHTTP(w, r2)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		if b, err := fs.ReadFile(root, "404.html"); err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(b)
		}
	})
}

// lanPrefixes: the first three numbers of this PC's private IPv4 networks ("192.168.0."; a /22 or /23 gives each of its /24s),
// Wi-Fi adapters first, virtual adapters (VPN, Hyper-V, VirtualBox, VMware, WSL) left out.
func lanPrefixes() []string {
	type found struct {
		prefix string
		rank   int
	}
	var list []found
	seen := map[string]bool{}
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(ifc.Name)
		virtual := false
		for _, v := range []string{"vethernet", "virtualbox", "vmware", "hyper-v", "wsl", "docker", "vpn", "tap", "tun", "zerotier", "tailscale"} {
			if strings.Contains(name, v) {
				virtual = true
			}
		}
		if virtual {
			continue
		}
		rank := 1
		for _, v := range []string{"wi-fi", "wifi", "wlan", "wireless", "무선"} {
			if strings.Contains(name, v) {
				rank = 0
			}
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipn.IP.To4()
			if ip == nil || !ip.IsPrivate() {
				continue
			}
			// The PC's own /24 first; on a school network of /23 or /22 also the other /24s of it
			// (a robot on 192.168.1.x is not found from 192.168.0.x otherwise). Bigger: only its own.
			own := fmt.Sprintf("%d.%d.%d.", ip[0], ip[1], ip[2])
			prefixes := []string{own}
			if ones, _ := ipn.Mask.Size(); ones >= 22 && ones < 24 {
				base := ip.Mask(ipn.Mask)
				for k := 0; k < 1<<(24-ones); k++ {
					if p := fmt.Sprintf("%d.%d.%d.", base[0], base[1], int(base[2])+k); p != own {
						prefixes = append(prefixes, p)
					}
				}
			}
			for _, p := range prefixes {
				if !seen[p] {
					seen[p] = true
					list = append(list, found{p, rank})
				}
			}
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].rank < list[j].rank })
	out := []string{}
	for _, f := range list {
		if len(out) < 6 {
			out = append(out, f.prefix)
		}
	}
	return out
}

func serveFile(w http.ResponseWriter, r *http.Request, root fs.FS, name string) {
	b, err := fs.ReadFile(root, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(b)
}

// running: is this program already serving on addr?
func running(addr string) bool {
	c := http.Client{Timeout: time.Second}
	res, err := c.Get("http://" + addr + hello)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	return res.StatusCode == http.StatusOK
}

func fail(err error) {
	fmt.Println()
	fmt.Println("  시뮬레이터를 켜지 못했어요:", err)
	fmt.Println("  이 창은 30초 뒤에 닫혀요.")
	time.Sleep(30 * time.Second)
	os.Exit(1)
}
