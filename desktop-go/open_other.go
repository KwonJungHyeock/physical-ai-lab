//go:build !windows

package main

import (
	"os/exec"
	"runtime"
)

func setupConsole() {}

// openApp opens the address as an app window in Chrome when there is one, else in the default browser.
func openApp(url string) {
	if runtime.GOOS == "darwin" {
		if exec.Command("open", "-na", "Google Chrome", "--args", "--app="+url).Run() == nil {
			return
		}
		_ = exec.Command("open", url).Start()
		return
	}
	for _, b := range []string{"google-chrome", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(b); err == nil && exec.Command(p, "--app="+url).Start() == nil {
			return
		}
	}
	_ = exec.Command("xdg-open", url).Start()
}
