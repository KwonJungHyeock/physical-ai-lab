//go:build !windows

package main

import (
	"errors"
	"os"
	"os/user"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
)

// listDrives: mounted sticks on Linux (/media/<user>/…, /run/media/<user>/…) and macOS (/Volumes/…).
// PAI_USB_ROOTS (folders, comma separated) stands in for them in tests and screenshots.
func listDrives() []Drive {
	var roots []string
	if env := os.Getenv("PAI_USB_ROOTS"); env != "" {
		for _, r := range strings.Split(env, ",") {
			if r = strings.TrimSpace(r); r != "" {
				roots = append(roots, r)
			}
		}
	} else {
		name := ""
		if u, err := user.Current(); err == nil {
			name = u.Username
		}
		for _, pat := range []string{filepath.Join("/media", name, "*"), filepath.Join("/run/media", name, "*"), "/Volumes/*"} {
			m, _ := filepath.Glob(pat)
			for _, r := range m {
				if filepath.Base(r) != "Macintosh HD" {
					roots = append(roots, r)
				}
			}
		}
		sort.Strings(roots)
	}
	out := []Drive{}
	for _, r := range roots {
		st, err := os.Stat(r)
		if err != nil || !st.IsDir() {
			continue
		}
		var fs syscall.Statfs_t
		var free, total int64
		if syscall.Statfs(r, &fs) == nil {
			free, total = int64(fs.Bavail)*int64(fs.Bsize), int64(fs.Blocks)*int64(fs.Bsize)
		}
		out = append(out, Drive{ID: r, Name: filepath.Base(r), Free: free, Total: total, Removable: true, root: r})
	}
	return out
}

func ejectDrive(d Drive) error {
	return errors.New("이 컴퓨터에서는 USB 를 직접 꺼내 주세요.")
}

// pcWifi: not looked up outside Windows (PAI_PC_WIFI="name" for the screenshots).
func pcWifi() WifiForm {
	return WifiForm{SSID: pcSSID()}
}

func pcSSID() string { return os.Getenv("PAI_PC_WIFI") }
