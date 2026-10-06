package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

// setupConsole: Korean text in the console window (UTF-8 code page).
func setupConsole() {
	k := syscall.NewLazyDLL("kernel32.dll")
	_, _, _ = k.NewProc("SetConsoleOutputCP").Call(65001)
	if title, err := syscall.UTF16PtrFromString("Physical AI 시뮬레이터"); err == nil {
		_, _, _ = k.NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(title)))
	}
}

// openApp opens the address as an app window (no address bar) in Edge or Chrome, or else
// in the default browser.
func openApp(url string) {
	var candidates []string
	for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LocalAppData"} {
		base := os.Getenv(env)
		if base == "" {
			continue
		}
		candidates = append(candidates,
			filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
		)
	}
	for _, exe := range candidates {
		if _, err := os.Stat(exe); err == nil {
			if exec.Command(exe, "--app="+url, "--start-maximized").Start() == nil {
				return
			}
		}
	}
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
