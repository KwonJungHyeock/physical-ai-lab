package main

// The LAN cable straight from this PC to a new robot: the robot's LAN port has the factory address
// 192.168.127.10 (no DHCP), the PC's port has only a self-made 169.254.x.x one, so the two cannot talk.
// For the first install this program gives the PC's port 192.168.127.2 for a while (lanprep_windows.go:
// one "allow" window, then back to automatic when the install ends) — nothing to set by hand.

import (
	"errors"
	"fmt"
	"net"
	"strings"
)

// prepareLAN: give this PC the robot-side address on the cabled port; release puts it back.
// Set per platform (lanprep_windows.go, lanprep_other.go); a variable so tests can stand in.
var prepareLAN func() (release func(), err error)

var (
	errNoLANPort = errors.New("로봇과 이은 PC 랜 포트를 찾지 못했어요. 로봇과 PC 를 랜선으로 잇고, 로봇 전원을 켠 뒤 1분 기다려 다시 해 주세요 (랜 포트가 없는 노트북은 USB 랜 어댑터).")
	errLANDenied = errors.New("PC 랜 포트 주소를 맞추려면 '이 앱이 디바이스를 변경하도록 허용' 창에서 [예] 를 눌러야 해요. 다시 해 주세요.")
)

const (
	robotLAN = "192.168.127.10" // the factory address of the robot's LAN port (Elephant / D-Robotics manuals)
	pcLAN    = "192.168.127.2"
)

// lanPort is one of this PC's network ports, as lanCandidate looks at it.
type lanPort struct {
	Index int
	Name  string
	Up    bool
	IPv4  []net.IP
}

// lanCandidate: the port the robot's cable is in — up, a wired one, with no address from a network
// (none, or only 169.254.x.x). A port on a real network is never touched. 0 when there is none.
func lanCandidate(ports []lanPort) (int, string) {
	for _, p := range ports {
		if !p.Up || virtualPort(p.Name) {
			continue
		}
		onNetwork := false
		for _, ip := range p.IPv4 {
			if ip.IsLoopback() || !ip.IsLinkLocalUnicast() {
				onNetwork = true
			}
		}
		if !onNetwork {
			return p.Index, p.Name
		}
	}
	return 0, ""
}

// lanReport: what this PC's wired ports look like, for the "no port" message (which one has no cable,
// which one is on another network), so the person sees what to fix.
func lanReport(ports []lanPort) string {
	var parts []string
	for _, p := range ports {
		if virtualPort(p.Name) || strings.Contains(strings.ToLower(p.Name), "loopback") {
			continue
		}
		var other []string
		for _, ip := range p.IPv4 {
			if !ip.IsLoopback() && !ip.IsLinkLocalUnicast() {
				other = append(other, ip.String())
			}
		}
		switch {
		case !p.Up:
			parts = append(parts, fmt.Sprintf("'%s' 랜선 신호 없음", p.Name))
		case len(other) > 0:
			parts = append(parts, fmt.Sprintf("'%s' 이미 다른 망 주소 %s", p.Name, strings.Join(other, ", ")))
		}
	}
	if len(parts) == 0 {
		return "이 PC 에서 유선 랜 포트가 보이지 않아요 (장치 관리자에서 꺼져 있지 않은지 확인)."
	}
	return "이 PC: " + strings.Join(parts, " · ") + "."
}

// onRobotSide: an address on the robot's LAN side (192.168.127.x) the PC already has, set by hand or left
// from before: the robot is reached through it without changing anything.
func onRobotSide(ip net.IP) bool {
	_, side, _ := net.ParseCIDR(robotLAN + "/24")
	return ip.String() != robotLAN && side.Contains(ip)
}

func virtualPort(name string) bool {
	n := strings.ToLower(name)
	for _, w := range []string{"wi-fi", "wifi", "wlan", "wireless", "무선", "bluetooth", "loopback", "vethernet", "virtualbox", "vmware", "hyper-v", "docker", "wsl", "tailscale", "zerotier", "vpn", "tap", "tun"} {
		if strings.Contains(n, w) {
			return true
		}
	}
	return false
}

// thisPCPorts: the ports as Go sees them (on Windows Index is the interface index netsh takes).
func thisPCPorts() []lanPort {
	ifs, err := net.Interfaces()
	if err != nil {
		return nil
	}
	var out []lanPort
	for _, i := range ifs {
		p := lanPort{Index: i.Index, Name: i.Name, Up: i.Flags&net.FlagUp != 0 && i.Flags&net.FlagLoopback == 0}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil {
				p.IPv4 = append(p.IPv4, n.IP.To4())
			}
		}
		out = append(out, p)
	}
	return out
}

// hasPCLAN: this PC already has the address on the robot's side.
func hasPCLAN() bool {
	for _, p := range thisPCPorts() {
		for _, ip := range p.IPv4 {
			if ip.String() == pcLAN || onRobotSide(ip) {
				return true
			}
		}
	}
	return false
}
