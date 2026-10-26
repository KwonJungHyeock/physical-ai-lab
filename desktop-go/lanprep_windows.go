//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// prepareLAN gives the PC's cabled port the robot-side address with one elevated PowerShell (the
// "allow" window), which sets it back to automatic (DHCP) when release is called, or after 20 minutes
// if this program is gone by then. Only a port with no address from a network is changed (lanCandidate),
// and such a port was on automatic, so going back to automatic restores it.
func prepareLANWindows() (func(), error) {
	if hasPCLAN() {
		return func() {}, nil
	}
	idx, _ := lanCandidate(thisPCPorts())
	if idx == 0 {
		return nil, errNoLANPort
	}
	dir := os.TempDir()
	flag := filepath.Join(dir, fmt.Sprintf("eduino-lan-%d.done", time.Now().UnixNano()))
	script := filepath.Join(dir, "eduino-lan.ps1")
	q := func(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }
	body := fmt.Sprintf("$ErrorActionPreference = 'SilentlyContinue'\r\n"+
		"netsh interface ipv4 set address name=%[1]d source=static address=%[2]s mask=255.255.255.0 gateway=none\r\n"+
		"$end = (Get-Date).AddMinutes(20)\r\n"+
		"while (-not (Test-Path -LiteralPath %[3]s) -and (Get-Date) -lt $end) { Start-Sleep -Seconds 2 }\r\n"+
		"netsh interface ipv4 set address name=%[1]d source=dhcp\r\n"+
		"Remove-Item -LiteralPath %[3]s\r\n", idx, pcLAN, q(flag))
	// With a BOM: Windows PowerShell reads a file without one in the ANSI code page (a Korean user name in the path).
	if err := os.WriteFile(script, append([]byte("\xef\xbb\xbf"), body...), 0o644); err != nil {
		return nil, err
	}
	// Start-Process joins ArgumentList with spaces: the path goes in double quotes.
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command",
		"Start-Process -FilePath powershell -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"+q(`"`+script+`"`)+")")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Run(); err != nil {
		return nil, errLANDenied
	}
	release := func() { _ = os.WriteFile(flag, []byte("done"), 0o644) }
	for i := 0; i < 40; i++ {
		if hasPCLAN() {
			time.Sleep(2 * time.Second) // Windows checks the address is free before using it
			return release, nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	release()
	return nil, errors.New("PC 랜 포트의 주소를 바꾸지 못했어요. 랜선을 다시 꽂고 한 번 더 해 보세요.")
}

func init() { prepareLAN = prepareLANWindows }
