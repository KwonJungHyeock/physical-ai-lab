#!/bin/sh
# 입문 과정 교안용 3D 렌더 (파트 13): R01 ~ R17, 1920 × 1440, 화면 UI 없이. 서버(next start)를 먼저 띄워 둔다.
#   sh run.sh <out> [base url]   — PC의 그래픽카드로: WALK_GPU=1 sh run.sh <out> (창을 띄우려면 WALK_HEADED=1도). R15 · R16 · R17은 3D 그림(<이름>.raw.png)을 받으니 1920 × 1440으로 맞춘다. R15는 그래픽카드 1배속에서만 그 순간이 잡힌다(연속으로 받아 고름).
cd "$(dirname "$0")"
export R_OUT="$1" WALK_BASE="${2:-http://localhost:3123}"
node bare.cjs
node marks.cjs
node moments.cjs
