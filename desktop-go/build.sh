#!/bin/sh
# Build "Physical AI 시뮬레이터.exe": the web app (npm run build:robot) embedded in one Windows program.
#   sh desktop-go/build.sh            → desktop-go/dist/PhysicalAI-Simulator.zip
# Needs Go 1.24+ and the web app's npm packages. The program's icon needs go-winres
# (go install github.com/tc-hib/go-winres@latest); without it the program has no icon.
set -e
cd "$(dirname "$0")"
VERSION=$(date +%Y.%m.%d)

(cd ../web-typescript && npm run build:robot)
rm -rf site dist
mkdir -p dist
cp -R ../robot-python/server/static site

WINRES=$(command -v go-winres || echo "$(go env GOPATH)/bin/go-winres")
if [ -x "$WINRES" ]; then
  "$WINRES" simply --arch amd64 --icon ../web-typescript/public/icons/icon-512.png --manifest cli \
    --product-name "Physical AI 시뮬레이터" --file-description "ROBODYNE SYSTEMS Physical AI 로봇 학습 프로그램 시뮬레이터" \
    --product-version "$VERSION" --file-version "$VERSION" --copyright "ROBODYNE SYSTEMS" \
    --original-filename "Physical AI 시뮬레이터.exe"
else
  echo "go-winres 가 없어 아이콘 없이 만듭니다."
fi

GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o "dist/Physical AI 시뮬레이터.exe" .
cp README.txt "dist/읽어보세요.txt"
# The teacher's launcher: the same program as the class server (-class). It runs the .exe next to it, so
# the batch file holds no Korean (cmd.exe reads batch files in the console code page).
printf '@echo off\r\nfor %%%%f in ("%%~dp0*.exe") do "%%%%f" -class\r\n' > "dist/교사용 학급 서버.cmd"
(cd dist && python3 -c "
import zipfile
with zipfile.ZipFile('PhysicalAI-Simulator.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for name in ('Physical AI 시뮬레이터.exe', '읽어보세요.txt', '교사용 학급 서버.cmd'):
        z.write(name, 'Physical AI 시뮬레이터/' + name)
")
ls -la dist
