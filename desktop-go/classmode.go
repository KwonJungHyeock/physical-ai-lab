package main

// 교사용 학급 서버 mode: the same program, started with -class (or from the "교사용 학급 서버.cmd" next to
// it, or renamed so its name has "교사" or "class-server" in it), serves the app to the whole
// classroom on the local network and keeps the class's accounts and learning records on this PC
// (desktop-go/classroom). Students open the address it prints, or point the simulator program on their
// own PC at it. Only requests from this PC and the local network are answered.

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"physical-ai-lab/desktop/classroom"
)

// classPath: the page the teacher's window and the students' address open (the app shows the class
// login / teacher dashboard there).
const classPath = "/console?from=class"

func classModeWanted(args []string) bool {
	for _, a := range args {
		if a == "-class" || a == "--class" {
			return true
		}
	}
	exe := strings.ToLower(filepath.Base(os.Args[0]))
	return strings.Contains(exe, "교사") || strings.Contains(exe, "class-server")
}

// classDataDir: -data <folder>, else the user's settings folder (Windows: %AppData%\PhysicalAI\class-server).
func classDataDir(args []string) string {
	for i, a := range args {
		if (a == "-data" || a == "--data") && i+1 < len(args) {
			return args[i+1]
		}
	}
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	return filepath.Join(base, "PhysicalAI", "class-server")
}

func runClassServer(root fs.FS, dataDir string) {
	store, err := classroom.Open(dataDir, nil)
	if err != nil {
		fail(err)
	}
	ctx := context.Background()
	syncer := classroom.NewSyncer(store, nil)
	go syncer.Run(ctx)
	api := classroom.NewServer(store, syncer)

	mux := http.NewServeMux()
	mux.Handle(classroom.APIPrefix+"/", api.Handler())
	mux.Handle("/", handler(root))

	addr := fmt.Sprintf(":%d", classroom.Port)
	local := fmt.Sprintf("http://127.0.0.1:%d%s&role=teacher", classroom.Port, classPath)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		if running(fmt.Sprintf("127.0.0.1:%d", classroom.Port)) {
			openApp(local)
			fmt.Println("학급 서버가 이미 켜져 있어 창만 새로 열었어요.")
			time.Sleep(3 * time.Second)
			return
		}
		fail(fmt.Errorf("포트 %d 를 쓸 수 없어요: %w", classroom.Port, err))
	}

	fmt.Println("============================================================")
	fmt.Println("  ROBODYNE SYSTEMS · Physical AI 로봇 학습 프로그램 — 교사용 학급 서버")
	fmt.Println("============================================================")
	fmt.Println()
	if addrs := lanAddresses(); len(addrs) > 0 {
		fmt.Println("  학생들은 같은 네트워크에서 이 주소를 크롬 · 엣지에 넣으세요:")
		for _, a := range addrs {
			fmt.Printf("    http://%s:%d%s\n", a, classroom.Port, classPath)
		}
		fmt.Println("  (학생 PC 의 시뮬레이터 프로그램에서는 [학급 서버 주소] 에 위 IP 를 넣어도 돼요)")
	} else {
		fmt.Println("  네트워크에 연결돼 있지 않아요 — 학생 PC 가 이 PC 에 접속할 수 없어요.")
	}
	fmt.Println()
	if store.NeedsSetup() {
		fmt.Println("  처음 켰어요: 열린 창에서 관리자 계정을 만드세요 (이 PC 에서만 할 수 있어요).")
	}
	fmt.Println("  기록 저장 폴더: " + dataDir)
	fmt.Println("  Windows 방화벽이 물으면 [개인 네트워크] 만 허용하세요.")
	fmt.Println("  이 검은 창을 닫으면 학급 서버가 꺼져요 (학생 기록은 저장돼 있어요).")
	fmt.Println()

	go func() {
		time.Sleep(300 * time.Millisecond)
		openApp(local)
	}()
	srv := &http.Server{
		Handler:           classroom.LANOnly(mux),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fail(err)
	}
}

// lanAddresses: this PC's private IPv4 addresses, Wi-Fi first, virtual adapters left out.
func lanAddresses() []string {
	type found struct {
		ip   string
		rank int
	}
	var list []found
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(ifc.Name)
		virtual := false
		for _, v := range []string{"vethernet", "virtualbox", "vmware", "hyper-v", "wsl", "docker", "vpn", "tap", "tun", "zerotier", "tailscale"} {
			virtual = virtual || strings.Contains(name, v)
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
			if ipn, ok := a.(*net.IPNet); ok {
				if ip := ipn.IP.To4(); ip != nil && ip.IsPrivate() {
					list = append(list, found{ip.String(), rank})
				}
			}
		}
	}
	sort.SliceStable(list, func(i, j int) bool { return list[i].rank < list[j].rank })
	out := []string{}
	for _, f := range list {
		if len(out) < 4 {
			out = append(out, f.ip)
		}
	}
	return out
}
