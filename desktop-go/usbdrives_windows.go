//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"
	"unsafe"
)

var (
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procLogicalDrives   = kernel32.NewProc("GetLogicalDrives")
	procDriveType       = kernel32.NewProc("GetDriveTypeW")
	procVolumeInfo      = kernel32.NewProc("GetVolumeInformationW")
	procDiskFreeSpaceEx = kernel32.NewProc("GetDiskFreeSpaceExW")
	procSetErrorMode    = kernel32.NewProc("SetErrorMode")
)

const (
	driveRemovable = 2
	driveFixed     = 3
	// No "insert a disk" box for an empty card reader.
	semFailCriticalErrors = 0x0001
)

// listDrives: the USB sticks (removable drives) and, flagged, the other data drives (not Windows' own).
func listDrives() []Drive {
	procSetErrorMode.Call(semFailCriticalErrors)
	mask, _, _ := procLogicalDrives.Call()
	system := strings.ToUpper(strings.TrimSuffix(os.Getenv("SystemDrive"), `\`))
	if system == "" {
		system = "C:"
	}
	out := []Drive{}
	for i := 0; i < 26; i++ {
		if mask&(1<<i) == 0 {
			continue
		}
		id := string(rune('A'+i)) + ":"
		root := id + `\`
		rp, _ := syscall.UTF16PtrFromString(root)
		typ, _, _ := procDriveType.Call(uintptr(unsafe.Pointer(rp)))
		if typ != driveRemovable && (typ != driveFixed || id == system) {
			continue
		}
		var label, fsName [261]uint16
		ok, _, _ := procVolumeInfo.Call(uintptr(unsafe.Pointer(rp)), uintptr(unsafe.Pointer(&label[0])), 261, 0, 0, 0,
			uintptr(unsafe.Pointer(&fsName[0])), 261)
		if ok == 0 {
			continue // no medium in it
		}
		var free, total, totalFree uint64
		procDiskFreeSpaceEx.Call(uintptr(unsafe.Pointer(rp)), uintptr(unsafe.Pointer(&free)), uintptr(unsafe.Pointer(&total)), uintptr(unsafe.Pointer(&totalFree)))
		name := syscall.UTF16ToString(label[:])
		if name == "" {
			name = "USB 드라이브"
		}
		out = append(out, Drive{ID: id, Name: name, FS: syscall.UTF16ToString(fsName[:]), Free: int64(free), Total: int64(total),
			Removable: typ == driveRemovable, root: root})
	}
	return out
}

// ejectDrive: Windows' own "꺼내기" for the drive, then wait until it is gone.
func ejectDrive(d Drive) error {
	if len(d.ID) != 2 || d.ID[1] != ':' {
		return errors.New("이 USB 는 직접 꺼내 주세요.")
	}
	script := "(New-Object -ComObject Shell.Application).Namespace(17).ParseName('" + d.ID + `\').InvokeVerb('Eject')`
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Run()
	for i := 0; i < 20; i++ {
		if _, ok := findDrive(d.ID); !ok {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return errors.New("꺼내지 못했어요. USB 의 파일을 연 창이 있으면 닫고 다시 눌러 주세요.")
}

var (
	ssidLine = regexp.MustCompile(`(?m)^\s*SSID\s*:\s*(.+?)\s*$`)
	keyLine  = regexp.MustCompile(`(?m)^\s*(?:Key Content|키 콘텐츠|키 내용)\s*:\s*(.+?)\s*$`)
)

// pcWifi: the Wi-Fi this PC is on now, and its password when Windows gives it (netsh, no admin needed
// for the profiles of this user). Both left empty when not known.
func pcWifi() WifiForm {
	w := WifiForm{SSID: pcSSID()}
	if w.SSID == "" {
		return w
	}
	if prof, err := netsh(`netsh wlan show profile name="` + w.SSID + `" key=clear`); err == nil {
		if k := keyLine.FindStringSubmatch(prof); k != nil {
			w.Password = k[1]
		}
	}
	return w
}

// pcSSID: the name of the Wi-Fi this PC is on now ("" when none or not known).
func pcSSID() string {
	out, err := netsh("netsh wlan show interfaces")
	if err != nil {
		return ""
	}
	m := ssidLine.FindStringSubmatch(out)
	if m == nil || strings.ContainsAny(m[1], `"`) {
		return ""
	}
	return m[1]
}

// netsh: one netsh command's output as text. netsh writes in the console's code page (cp949 on a
// Korean Windows) when its output is not a console: turned into UTF-8 with Windows' own conversion.
func netsh(line string) (string, error) {
	cmd := exec.Command("netsh")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CmdLine: line}
	b, err := cmd.Output()
	if err != nil {
		return "", err
	}
	if utf8.Valid(b) {
		return string(b), nil
	}
	return fromCodePage(b), nil
}

var procMultiByteToWideChar = kernel32.NewProc("MultiByteToWideChar")

const cpOEM = 1 // CP_OEMCP: what a console program writes

func fromCodePage(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	n, _, _ := procMultiByteToWideChar.Call(cpOEM, 0, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), 0, 0)
	if n == 0 {
		return ""
	}
	u := make([]uint16, n)
	procMultiByteToWideChar.Call(cpOEM, 0, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)), uintptr(unsafe.Pointer(&u[0])), n)
	return syscall.UTF16ToString(u)
}
