#!/bin/sh
# Build "Physical AI 시뮬레이터.exe": the web app (npm run build:robot) embedded in one Windows program.
#   sh desktop-go/build.sh            → desktop-go/dist/PhysicalAI-Simulator.zip
#   EDUINO_SIGNING_KEY=~/keys/eduino-kit-signing.pem sh desktop-go/build.sh
#                                     → the same, carrying the signed robot kit (⚙ → 로봇 USB 만들기, usbkit.go)
#   KIT=path/eduino_usb.zip sh desktop-go/build.sh   → carrying a kit made before
# Needs Go 1.24+ and the web app's npm packages. The program's icon needs go-winres: it is installed
# here when missing (go install github.com/tc-hib/go-winres@v0.3.3), and the build stops rather than
# make a program without its icon (NO_ICON=1 builds one anyway, for a quick test).
set -e
cd "$(dirname "$0")"
VERSION=$(date +%Y.%m.%d)

(cd ../web-typescript && npm run build:robot)
rm -rf site dist
mkdir -p dist
cp -R ../robot-python/server/static site

# The robot kit the program writes onto USB sticks: made now with the signing key, or given as KIT.
rm -f kit/eduino_usb.zip
if [ -n "$EDUINO_SIGNING_KEY" ]; then
  KITDIR=$(mktemp -d)
  python3 ../robot-python/tools/make_usb_kit.py -o "$KITDIR"
  cp "$KITDIR/eduino_usb.zip" kit/eduino_usb.zip
  rm -rf "$KITDIR"
elif [ -n "$KIT" ]; then
  cp "$KIT" kit/eduino_usb.zip
else
  echo "로봇 키트 없이 만듭니다 (EDUINO_SIGNING_KEY 또는 KIT): 로봇 USB 만들기는 '키트 없음' 으로 나와요."
fi

WINRES=$(command -v go-winres || echo "$(go env GOPATH)/bin/go-winres")
if [ ! -x "$WINRES" ] && [ -z "$NO_ICON" ]; then
  echo "go-winres 를 설치합니다 (프로그램 아이콘)."
  go install github.com/tc-hib/go-winres@v0.3.3 || true
fi
if [ -x "$WINRES" ]; then
  "$WINRES" simply --arch amd64 --icon ../web-typescript/public/icons/icon-512.png --manifest cli \
    --product-name "Physical AI 시뮬레이터" --file-description "ROBODYNE SYSTEMS Physical AI 로봇 학습 프로그램 시뮬레이터" \
    --product-version "$VERSION" --file-version "$VERSION" --copyright "ROBODYNE SYSTEMS" \
    --original-filename "Physical AI 시뮬레이터.exe"
elif [ -n "$NO_ICON" ]; then
  echo "go-winres 가 없어 아이콘 없이 만듭니다 (NO_ICON)."
else
  echo "go-winres 가 없어 멈춥니다: 아이콘 없는 프로그램을 내보내지 않아요 (시험용은 NO_ICON=1)." >&2
  exit 1
fi

GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "dist/Physical AI 시뮬레이터.exe" .
cp README.txt "dist/읽어보세요.txt"
# The teacher's launcher: the same program as the class server (-class). It runs the .exe next to it, so
# the batch file holds no Korean (cmd.exe reads batch files in the console code page).
printf '@echo off\r\nfor %%%%f in ("%%~dp0*.exe") do "%%%%f" -class\r\n' > "dist/교사용 학급 서버.cmd"
# The files at the zip's top: Windows' [압축 풀기] makes the one folder (PhysicalAI-Simulator\) itself,
# so there is no folder inside a folder. The release joins eduino_usb.zip to it (.github/bundle.yml on
# the release branch): the program finds the kit beside it (usbkit.go kitBeside).
(cd dist && python3 -c "
import zipfile
with zipfile.ZipFile('PhysicalAI-Simulator.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('Physical AI 시뮬레이터.exe', '읽어보세요.txt', '교사용 학급 서버.cmd'):
        z.write(name, name)
")
ls -la dist
