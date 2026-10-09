/**
 * 대단원 마무리 평가 · 산업단지 종합 점검: one problem from each of the six site labs again, with
 * new numbers — the situation changed after the fix the students made (a sensor moved again, the
 * pallet moved again, another robot, the camera raised, a slower sensor, a shorter part), and the
 * program still has last time's fixed values. Remembering last time's answer fails; working the
 * principle out again with the new numbers passes. Each item runs the site's own engine with the
 * situation carried in its values (problems.ts P3Values.sensorY, pallet.ts RefValues.moved, …).
 *
 * Per item: 원인 (first try 4, second 2), 계산 (right at the first check 3, later 1), 고치기 (the
 * line passes 3), less 1 for each hint opened — 10 points; six items make 60, shown out of 100.
 * The lesson script is content-markdown/sites/final.md.
 */

import type { ChainSegment } from '../../robot/kinematics';
import type { CategoryId } from '../catalog';
import type { LabId } from '../park';
import { runAi, scoreAi, type AiRun, type PartValues } from './ai';
import { runBio, scoreBio, type BioRun, type CalibValues } from './bio';
import { runCafe, scoreCafe, protectiveDistance, type CafeRun, type GuardValues } from './cafe';
import { CAM, TRAY, runFarm, scoreFarm, type FarmRun, type RatioValues } from './farm';
import { PAL, markAt, runStack, scoreStack, setupFor, type PalletRun, type RefValues } from './pallet';
import { runP3, verdict, type P3Values } from './problems';
import type { LabRun } from './run';

export type FinalRun = LabRun | PalletRun | BioRun | FarmRun | CafeRun | AiRun;
export type FinalValues = Record<string, unknown>;

/** A value the student sets: a number on a knob, or one of a few choices. */
export type FinalField =
  | { key: string; label: string; kind: 'num'; unit: string; min: number; max: number; step: number }
  | { key: string; label: string; kind: 'choice'; options: readonly { value: string | boolean; label: string }[] };

export interface FinalCalc {
  label: string;
  answer: number;
  tol: number;
  unit: string;
}

export interface FinalItem {
  id: string;
  lab: LabId;
  /** The site lab problem it comes back to (1 · 2 · 3). */
  prob: 1 | 2 | 3;
  site: string;
  title: string;
  /** Who tells the story, and their line. */
  boss: string;
  line: string;
  brief: string;
  /** The standard the line must meet. */
  spec: readonly string[];
  /** What was measured (the numbers to work with). */
  data: readonly { k: string; v: string }[];
  causes: readonly { t: string; ok?: boolean }[];
  calc: { prompt: string; fields: readonly FinalCalc[] };
  fields: readonly FinalField[];
  /** The program as it is (last time's fix) with the new situation. */
  start: FinalValues;
  hints: readonly string[];
  /** The principle, said once it passes (or when the student moves on). */
  principle: string;
  /** A worked fix (the check uses it; the teacher's answer sheet prints it). */
  answer: string;
  units: readonly CategoryId[];
}

export interface FinalOutcome {
  pass: boolean;
  headline: string;
  run: FinalRun;
}

const MOVED = { x: PAL.x + 35, y: PAL.y + 45 };
const FARM_CAM_Z = 540;
const PART_H = 45;

export const FINAL_ITEMS: readonly FinalItem[] = [
  {
    id: 'factory',
    lab: 'factory',
    prob: 3,
    site: '스마트 공장',
    title: '센서를 또 옮겼다',
    boss: '김 주임',
    line: '지난번에 고친 타이밍 그대로예요. 센서를 30 mm 옮긴 것뿐인데 괜찮겠죠?',
    brief: '라인 정비로 트리거 센서를 y 250 → 280 mm로 옮겼어요(입구 쪽으로 30 mm). 로봇 프로그램은 지난번에 고친 값 그대로예요 — 대기 y 40 mm, 관절 이동, 속도 80, 지연 1690 ms.',
    spec: ['상자 3개를 모두 잡아 팔레트로', '벨트는 멈추지 않음 (120 mm/s)', '흡착 컵은 상자 윗면 가운데 ±10 mm'],
    data: [
      { k: '벨트 속도', v: '120 mm/s' },
      { k: '센서 자리', v: 'y 280 mm (전에는 250)' },
      { k: '대기 자리', v: 'y 40 mm' },
      { k: '센서가 보는 곳', v: '상자 앞 끝 — 가운데까지 30 mm 더' },
      { k: '대기 → 잡기 내려가는 시간', v: '0.31 s (관절 · 속도 80)' },
    ],
    causes: [
      { t: '벨트가 느려져서 상자가 늦게 온다' },
      { t: '대기 자리가 손이 닿지 않는 곳이다' },
      { t: '센서가 멀어져 상자가 대기 자리까지 오는 시간이 늘었는데, 지연은 그대로라 로봇이 너무 일찍 내려온다', ok: true },
      { t: '흡착 컵이 상자 무게를 버티지 못한다' },
    ],
    calc: {
      prompt: '도착 시간 = (센서 y + 30 − 대기 y) ÷ 벨트 속도, 지연 = 도착 시간 − 내려가는 시간.',
      fields: [
        { label: '센서가 본 뒤 상자 가운데가 대기 자리에 오는 시간', answer: 2.25, tol: 0.02, unit: 's' },
        { label: '새 지연', answer: 1940, tol: 20, unit: 'ms' },
      ],
    },
    fields: [
      { key: 'delayMs', label: '지연', kind: 'num', unit: 'ms', min: 0, max: 4000, step: 10 },
      { key: 'waitY', label: '대기 자리 y', kind: 'num', unit: 'mm', min: -90, max: 160, step: 5 },
      { key: 'speed', label: '로봇 속도', kind: 'num', unit: '%', min: 10, max: 100, step: 5 },
      {
        key: 'move',
        label: '내려가는 방법',
        kind: 'choice',
        options: [
          { value: 'joint', label: '관절 이동' },
          { value: 'linear', label: '직선 이동' },
        ],
      },
    ],
    start: { belt: 120, waitY: 40, move: 'joint', speed: 80, delayMs: 1690, sensorY: 280 },
    hints: ['센서에서 대기 자리까지 상자 가운데가 가는 거리는 280 + 30 − 40 = 270 mm예요.', '지연 = 270 ÷ 120 − 0.31 s. ms로 바꿔 넣어요.'],
    principle: '움직이는 물건을 잡을 때는 "센서에서 잡는 곳까지의 거리 ÷ 속도"가 시간을 정해요. 센서 자리가 바뀌면 지연도 다시 계산해요.',
    answer: '지연 1940 ms (대기 y 40 · 관절 · 속도 80). 1840 ~ 2000 ms면 통과.',
    units: ['3'],
  },
  {
    id: 'logistics',
    lab: 'logistics',
    prob: 3,
    site: '물류 센터',
    title: '팔레트를 또 옮겼다',
    boss: '박 반장',
    line: '지난번에 기준점 다시 맞췄잖아요. 그 값 그대로 쓰면 되죠?',
    brief: '지게차 통로를 넓히느라 팔레트를 다시 옮겼어요 — 처음 자리에서 x +35 mm, y +45 mm. 프로그램의 기준점은 지난번에 고친 (160, −171) 그대로예요. 기준점은 팔레트 먼 모서리의 표시예요.',
    spec: ['상자 12개를 3층으로', '상자마다 제자리에서 5 mm 안', '떨어지거나 기울지 않기'],
    data: [
      { k: '처음 자리의 표시', v: '(135, −211) mm' },
      { k: '지난번 이동', v: '+25, +40 → 기준점 (160, −171)' },
      { k: '이번 이동 (처음 자리에서)', v: '+35, +45 mm' },
      { k: '자리 기준', v: '제자리에서 5 mm 안' },
    ],
    causes: [
      { t: '상자가 무거워져서 옮기는 동안 미끄러진다' },
      { t: '프로그램의 기준점이 지난번 팔레트 자리 그대로라, 상자가 실제 팔레트에서 x 10 mm · y 5 mm 어긋나게 놓인다', ok: true },
      { t: '층 간격이 상자 높이와 다르다' },
      { t: '컨베이어가 빨라져 상자가 제자리에 서지 않는다' },
    ],
    calc: {
      prompt: '새 기준점 = 처음 자리의 표시 + 이번에 옮긴 양.',
      fields: [
        { label: '새 기준점 x', answer: 170, tol: 0.5, unit: 'mm' },
        { label: '새 기준점 y', answer: -166, tol: 0.5, unit: 'mm' },
      ],
    },
    fields: [
      { key: 'x', label: '기준점 x', kind: 'num', unit: 'mm', min: 100, max: 200, step: 1 },
      { key: 'y', label: '기준점 y', kind: 'num', unit: 'mm', min: -240, max: -130, step: 1 },
    ],
    start: { x: 160, y: -171, moved: MOVED },
    hints: ['옮긴 양은 "지난번 자리"가 아니라 "처음 자리"에서 잰 값이에요.', 'x = 135 + 35, y = −211 + 45.'],
    principle: '작업 좌표계(기준점)를 쓰면 팔레트가 움직여도 기준점 하나만 다시 가르치면 돼요 — 단, 지금 자리에서 다시 재야 해요.',
    answer: '기준점 (170, −166).',
    units: ['1'],
  },
  {
    id: 'bio',
    lab: 'bio',
    prob: 2,
    site: '바이오 실험실',
    title: '로봇을 바꿨더니 또 어긋난다',
    boss: '이 연구원',
    line: '영점 보정 1° 넣는 거 지난번에 배웠어요. 새 로봇에도 그대로 넣었어요.',
    brief: '분석 랙 로봇을 정비를 마친 다른 로봇으로 바꿨어요. 프로그램에는 지난번 로봇의 J1 영점 보정 1.0°가 그대로 들어 있어요. 보정 없이 꽂아 보니 바깥 칸일수록 더 어긋났어요.',
    spec: ['시험관 6개를 분석 랙에', '칸마다 가운데에서 1 mm 안'],
    data: [
      { k: '보정 없이 꽂았을 때', v: 'r 150 mm 칸에서 1.57 mm 어긋남 (원 방향)' },
      { k: '어긋남의 모양', v: 'J1에서 멀수록 커짐 (반지름에 비례)' },
      { k: '칸의 반지름', v: '110 ~ 210 mm' },
    ],
    causes: [
      { t: '그리퍼가 시험관을 비스듬히 잡는다' },
      { t: '분석 랙이 옆으로 밀렸다' },
      { t: '시료가 너무 많이 차 있다' },
      { t: '새 로봇의 J1은 0.6°쯤만 더 도는데 1.0°를 빼서, 이번엔 반대쪽으로 0.4° 어긋난다', ok: true },
    ],
    calc: {
      prompt: '각도(rad) = 원호 길이 ÷ 반지름, 각도(°) = rad × 180 ÷ π.',
      fields: [
        { label: 'J1이 더 도는 각도', answer: 0.0105, tol: 0.0005, unit: 'rad' },
        { label: '같은 각도를 도(°)로', answer: 0.6, tol: 0.05, unit: '°' },
      ],
    },
    fields: [{ key: 'zero', label: 'J1 영점 보정', kind: 'num', unit: '°', min: -2, max: 2, step: 0.1 }],
    start: { zero: 1, err: 0.6 },
    hints: ['반지름 150 mm에서 1.57 mm면, 각도는 1.57 ÷ 150 rad이에요.', '0.0105 rad × 57.3 ≈ 0.6°. 이 값을 보정에 넣어요.'],
    principle: '영점 오차는 로봇마다 달라요. 같은 각도 오차라도 멀리서 크게 보이니(원호 = r × θ), 로봇을 바꾸면 다시 재서 보정해요.',
    answer: 'J1 영점 보정 0.6° (0.4 ~ 0.8°면 통과).',
    units: ['1', '2'],
  },
  {
    id: 'farm',
    lab: 'farm',
    prob: 2,
    site: '스마트팜',
    title: '카메라를 또 올렸다',
    boss: '최 팀장',
    line: '비율 0.83으로 고친 거 기억나죠? 카메라만 조금 올렸어요.',
    brief: '트레이를 더 넓게 보려고 카메라를 트레이 위 480 → 540 mm로 올렸어요. 프로그램의 픽셀 → mm 비율은 지난번에 고친 0.83 그대로예요.',
    spec: ['익은 토마토 6개를 포장 용기에', '손가락이 토마토 위를 누르지 않기 (가운데로 잡기)'],
    data: [
      { k: '카메라 높이', v: '540 mm (트레이 윗면 20 mm)' },
      { k: '초점 거리', v: '554 px' },
      { k: '마커 두 개', v: '실제 220 mm · 사진에서 234 px' },
    ],
    causes: [
      { t: '카메라가 높아져 1 px가 더 넓은 거리를 보는데 비율이 옛 값이라, 가운데에서 먼 토마토일수록 손끝이 안쪽으로 어긋난다', ok: true },
      { t: '토마토 색이 바뀌어 덜 익은 것을 고른다' },
      { t: '그리퍼가 너무 세게 쥔다' },
      { t: '카메라가 옆으로 기울었다' },
    ],
    calc: {
      prompt: '비율(mm/px) = 실제 거리 ÷ 사진 속 거리 = (카메라 높이 − 트레이 높이) ÷ 초점 거리.',
      fields: [{ label: '새 비율', answer: 0.94, tol: 0.006, unit: 'mm/px' }],
    },
    fields: [{ key: 'ratio', label: '픽셀 → mm 비율', kind: 'num', unit: 'mm/px', min: 0.6, max: 1, step: 0.005 }],
    start: { ratio: 0.83, camZ: FARM_CAM_Z },
    hints: ['마커 220 mm가 사진에서 234 px — 1 px가 몇 mm인지 나눠 봐요.', '220 ÷ 234 ≈ 0.94 (또는 520 ÷ 554).'],
    principle: '카메라 높이가 바뀌면 픽셀 하나가 보는 거리도 바뀌어요. 카메라를 옮기면 보정(마커로 비율 재기)을 다시 해요.',
    answer: '비율 0.94 (0.92 ~ 0.96이면 통과).',
    units: ['8'],
  },
  {
    id: 'cafe',
    lab: 'cafe',
    prob: 2,
    site: '서비스 카페',
    title: '센서를 바꿨더니 손에 닿을 뻔했다',
    boss: '정 점장',
    line: '보호 거리 계산해서 90 mm로 맞췄잖아요. 센서만 새 걸로 바꿨어요.',
    brief: '카운터 거리 센서를 새 제품으로 바꿨는데, 반응 시간이 0.1 s → 0.2 s예요. 프로그램은 지난번에 고친 값 그대로 — 픽업대 근처 속도 100 mm/s, 감지 거리 90 mm.',
    spec: ['손님 손 앞에서 멈춰 건네기', '멈춘 뒤 컵과 손 사이 20 mm 넘게', '감지 거리 − 보호 거리 30 mm 넘게 (지난번 기준)'],
    data: [
      { k: '손 속도', v: '250 mm/s' },
      { k: '센서 반응 시간', v: '0.2 s (전에는 0.1 s)' },
      { k: '로봇 감속', v: '2 m/s² = 2000 mm/s² (커피가 넘치지 않는 값)' },
      { k: '픽업대 근처 로봇 속도', v: '100 mm/s' },
    ],
    causes: [
      { t: '로봇의 감속이 약해졌다' },
      { t: '손님 손이 더 빨라졌다' },
      { t: '반응이 느려져 감지 뒤 멈출 때까지 좁혀지는 거리(보호 거리)가 늘었는데, 감지 거리는 그대로다', ok: true },
      { t: '컵이 무거워져 늦게 선다' },
    ],
    calc: {
      prompt: 'S = (손 속도 + 로봇 속도) × 반응 시간 + 로봇 속도² ÷ (2 × 감속도) + 손 속도 × (로봇 속도 ÷ 감속도).',
      fields: [
        { label: '로봇 100 mm/s일 때 보호 거리 S', answer: 85, tol: 1, unit: 'mm' },
        { label: '필요한 감지 거리 (S + 30)', answer: 115, tol: 1, unit: 'mm' },
      ],
    },
    fields: [
      { key: 'zoneSpeed', label: '픽업대 근처 속도', kind: 'num', unit: 'mm/s', min: 50, max: 250, step: 10 },
      { key: 'detect', label: '감지 거리', kind: 'num', unit: 'mm', min: 30, max: 150, step: 5 },
    ],
    start: { zoneSpeed: 100, detect: 90, react: 0.2 },
    hints: ['반응하는 동안: (250 + 100) × 0.2 = 70 mm. 서는 거리와 서는 동안 손이 오는 거리를 더해요.', 'S = 70 + 2.5 + 12.5 = 85 mm. 감지 거리는 115 mm 넘게.'],
    principle: '보호 거리는 반응 시간에 비례해 늘어요. 센서를 바꾸면 반응 시간을 확인하고 감지 거리(또는 속도)를 다시 정해요.',
    answer: `구역 100 mm/s · 감지 거리 115 ~ 150 mm (보호 거리 ${protectiveDistance({ zoneSpeed: 100, detect: 0, react: 0.2 }).total.toFixed(0)} mm).`,
    units: ['5'],
  },
  {
    id: 'ai',
    lab: 'ai',
    prob: 3,
    site: 'AI 연구소',
    title: '또 처음 보는 부품',
    boss: '한 박사',
    line: '지난번엔 60 mm 부품이었죠. 높이 60, 시차 보정 그대로 두면 되겠죠?',
    brief: '이번 부품은 지름 30 mm, 높이 45 mm 원기둥이에요. 프로그램은 지난번에 고친 값 그대로예요 — 물건 높이 60 mm, 시차 보정 켬.',
    spec: ['부품 4개를 색깔별 분류함에', '흡착 컵이 윗면 가운데 6 mm 안에, 누르지 않고'],
    data: [
      { k: '위 카메라 높이', v: '368 mm' },
      { k: '부품 높이', v: '45 mm' },
      { k: '빨강 부품', v: '사진 가운데에서 r 67.8 mm로 보임 (바닥 기준 환산)' },
    ],
    causes: [
      { t: '부품 색이 공식 색 범위 밖이다' },
      { t: '프로그램이 부품 높이를 60 mm로 알아, 시차 보정을 틀린 높이로 계산해 위치가 어긋나고 컵도 윗면에 제대로 닿지 않는다', ok: true },
      { t: '보정판 마커가 틀어졌다' },
      { t: '흡착 펌프 힘이 약하다' },
    ],
    calc: {
      prompt: '시차 = r × h ÷ (Z − h), 보정 계수 = (Z − h) ÷ Z. Z는 카메라 높이, h는 부품 높이.',
      fields: [
        { label: '빨강 부품의 시차', answer: 9.45, tol: 0.15, unit: 'mm' },
        { label: '보정 계수', answer: 0.878, tol: 0.003, unit: '' },
      ],
    },
    fields: [
      { key: 'height', label: '물건 높이', kind: 'num', unit: 'mm', min: 20, max: 80, step: 5 },
      {
        key: 'parallax',
        label: '시차 보정',
        kind: 'choice',
        options: [
          { value: true, label: '켬' },
          { value: false, label: '끔' },
        ],
      },
    ],
    start: { height: 60, parallax: true, partH: PART_H },
    hints: ['높이가 바뀌면 시차도, 컵이 내려갈 높이도 바뀌어요.', '물건 높이 45 mm, 시차 보정 켬.'],
    principle: '위에서 보는 카메라는 키 큰 물건일수록 바깥으로 보이게 해요(시차). 물건 높이를 바르게 알려 주면 위치와 내려갈 높이가 함께 맞아요.',
    answer: '물건 높이 45 mm, 시차 보정 켬.',
    units: ['8'],
  },
];

export const FINAL_ITEM = new Map(FINAL_ITEMS.map((x) => [x.id, x]));

/** Runs an item's line with these values (the situation is in them) and judges it. */
export async function runFinal(chain: readonly ChainSegment[], item: FinalItem, values: FinalValues): Promise<FinalOutcome> {
  switch (item.id) {
    case 'factory': {
      const run = runP3(chain, values as unknown as P3Values);
      const v = verdict(3, run);
      return { pass: v.pass, headline: v.headline, run };
    }
    case 'logistics': {
      const run = await runStack(chain, setupFor(3, values as unknown as RefValues));
      const s = scoreStack(run);
      const headline = s.stopped ?? (s.pass ? '12개를 모두 제자리에 쌓았어요' : `${s.placed}개를 쌓았지만 제자리(5 mm 안)는 ${s.ok}개뿐이에요`);
      return { pass: s.pass, headline, run };
    }
    case 'bio': {
      const run = runBio(chain, 2, values as unknown as CalibValues);
      const s = scoreBio(2, run);
      return { pass: s.pass, headline: s.headline, run };
    }
    case 'farm': {
      const run = runFarm(chain, 2, values as unknown as RatioValues);
      const s = scoreFarm(2, run);
      return { pass: s.pass, headline: s.headline, run };
    }
    case 'cafe': {
      const run = runCafe(chain, 2, values as unknown as GuardValues);
      const s = scoreCafe(2, run);
      return { pass: s.pass, headline: s.headline, run };
    }
    default: {
      const run = runAi(chain, 3, values as unknown as PartValues);
      const s = scoreAi(3, run);
      return { pass: s.pass, headline: s.headline, run };
    }
  }
}

/** What a student did on one item. */
export interface FinalRecord {
  /** Causes picked, in order (indices). */
  picks: number[];
  /** Calculation checks: whether each was right. */
  calcChecks: boolean[];
  hints: number;
  runs: number;
  pass: boolean;
  /** The values of the last run, in words. */
  last: string;
  done: boolean;
}

export const freshRecord = (): FinalRecord => ({ picks: [], calcChecks: [], hints: 0, runs: 0, pass: false, last: '', done: false });

export interface ItemScore {
  cause: number;
  calc: number;
  fix: number;
  hints: number;
  total: number;
}

/** 원인 4 / 2 / 0 · 계산 3 / 1 / 0 · 고치기 3 · less 1 a hint; 0 … 10. */
export function scoreItem(item: FinalItem, r: FinalRecord): ItemScore {
  const right = item.causes.findIndex((c) => c.ok);
  const at = r.picks.indexOf(right);
  const cause = at === 0 ? 4 : at === 1 ? 2 : 0;
  const ok = r.calcChecks.indexOf(true);
  const calc = ok === 0 ? 3 : ok > 0 ? 1 : 0;
  const fix = r.pass ? 3 : 0;
  const total = Math.max(0, cause + calc + fix - r.hints);
  return { cause, calc, fix, hints: r.hints, total };
}

export const ITEM_MAX = 10;

/** The whole sheet: points out of 60, shown out of 100, and the grade. */
export function scoreFinal(records: Record<string, FinalRecord>): { points: number; of: number; score: number; grade: string } {
  const of = FINAL_ITEMS.length * ITEM_MAX;
  const points = FINAL_ITEMS.reduce((s, it) => s + (records[it.id] ? scoreItem(it, records[it.id]).total : 0), 0);
  const score = Math.round((points * 100) / of);
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'E';
  return { points, of, score, grade };
}

/** Numbers the lesson script quotes, worked from the item data (the check compares them). */
export const FINAL_NUMBERS = {
  factoryArrivalS: (280 + 30 - 40) / 120,
  logisticsRef: markAt(MOVED),
  bioRad: (150 * (0.6 * Math.PI)) / 180 / 150,
  farmRatio: (FARM_CAM_Z - TRAY.top) / CAM.f,
  cafeS: protectiveDistance({ zoneSpeed: 100, detect: 0, react: 0.2 }).total,
  aiParallax: (67.8 * PART_H) / (368 - PART_H),
  aiK: (368 - PART_H) / 368,
};
