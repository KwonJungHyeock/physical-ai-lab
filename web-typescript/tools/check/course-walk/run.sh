#!/bin/sh
# 입문 과정 모든 화면을 한 크기로 걷는다: sh run.sh <W> <H> <out> [shots 0|1] [base url]
#   WALK_MEASURE=1 로 화면마다 가독성 기준을 재고(measure.cjs), shots=1 이면 교안 캡처도 남긴다.
#   먼저 개발 서버(또는 next start)를 띄워 둔다. 결과 표: node report.cjs <out> ...
cd "$(dirname "$0")"
export WALK_W="$1" WALK_H="$2" WALK_OUT="$3" WALK_SHOTS="${4:-0}" WALK_MEASURE=1 WALK_BASE="${5:-http://localhost:3123}"
node walk1.cjs all
node walk2-6.cjs 2-2,2-3,2-3f,3-1,3-2,3-3,3-4,3-4f,3-5,4-1,4-2,4-2s,4-3,4-3f,4-3s,4-4,4-4f,4-4g,5-1,5-1s,5-2,5-2s,5-3,5-3s,5-4f,5-456,6
node walk-extra.cjs all
