/**
 * 실습 셀 터미널 실습: in a cell, Python is done the way it is on the robot's own Linux board — in a
 * terminal, by commands. Each lab is one ladder step's reference program as a file in its own folder
 * (~/cell/e4/…): the student goes there, reads it (three lines are pointed out), predicts what one
 * changed value will do, changes it with nano and runs it with python3. The file is the same Python
 * the blocks write (`from edu import robot, cell`), run on the same cell and checked the same way.
 *
 * Two labs a cell, on the steps where one value shows the step's idea (a gap, a count, a set point,
 * a condition, a speed).
 */

import type { CellId } from '../cell/cells';
import { missionById } from '../cell/missions';

export interface Lab {
  /** Folder name under ~/cell (the step in small letters). */
  id: string;
  mission: string;
  cell: CellId;
  file: string;
  /** What the program does, one line (README.txt and the card). */
  about: string;
  /** Lines worth reading (found by their text) and what each does. */
  read: { find: string; note: string }[];
  /** The one value to change: the text as written and as changed, and what it is. */
  change: { from: string; to: string; what: string };
  /** Asked before the changed program runs; `answer` is what it does (the checks prove it). */
  predict: { q: string; options: string[]; answer: number; why: string };
  /** How the changed program ends: still passes, runs but misses the step's checks, or stops on an error. */
  expect: 'pass' | 'fail' | 'error';
}

export const HOME = '/home/student';
export const USER = 'student';
export const HOST = 'rdk-x5';

export const LABS: readonly Lab[] = [
  {
    id: 'a2',
    mission: 'A2',
    cell: 'feed',
    file: 'side_by_side.py',
    about: '소재 두 개를 기준 자리에 나란히 놓아요. 두 번째는 y 로 150 mm 옆에.',
    read: [
      { find: 'robot.place("기준 자리")', note: '첫 부품을 기준 자리에 놓아요.' },
      { find: 'y=150', note: '두 번째는 기준 자리에서 y 로 150 mm 옆에 놓아요 (부품 지름 125 mm + 틈).' },
      { find: 'robot.home()', note: '끝나면 기본 자세로 돌아가요.' },
    ],
    change: { from: 'y=150', to: 'y=60', what: '옆으로 비켜 놓는 거리 (mm)' },
    predict: { q: '150 을 60 으로 줄이면?', options: ['그대로 나란히 놓여요', '앞 부품에 부딪혀요', '더 멀리 떨어져 놓여요'], answer: 1, why: '부품 지름이 125 mm 라서 60 mm 옆이면 두 부품이 겹쳐요. 간격은 지름보다 커야 해요.' },
    expect: 'error',
  },
  {
    id: 'a8',
    mission: 'A8',
    cell: 'feed',
    file: 'stack_nine.py',
    about: '공급 → 끝 센서 기다리기 → 집기 → 적재 판 다음 칸, 9번 되풀이해요.',
    read: [
      { find: 'for _ in range(9):', note: '아래 들여 쓴 4줄을 9번 되풀이해요.' },
      { find: 'cell.wait("끝 센서")', note: '부품이 컨베이어 끝에 올 때까지 기다려요.' },
      { find: 'robot.place("적재 판 다음 칸")', note: '적재 판의 다음 빈 칸에 놓아요 (칸은 9개).' },
    ],
    change: { from: 'range(9)', to: 'range(5)', what: '되풀이하는 횟수' },
    predict: { q: '9 를 5 로 줄이면?', options: ['9개를 모두 쌓아요', '5개만 쌓고 끝나서 목표를 못 채워요', '처음부터 움직이지 않아요'], answer: 1, why: '반복 횟수가 곧 만드는 개수예요. 목표 수(9개)와 반복 수가 맞아야 해요.' },
    expect: 'fail',
  },
  {
    id: 'b4',
    mission: 'B4',
    cell: 'vision',
    file: 'size_sort.py',
    about: '카메라로 지름을 재서 큰 부품은 함 1, 작은 부품은 함 2 로 나눠요.',
    read: [
      { find: 'cell.limit("지름", 110)', note: '지름 110 mm 이상을 "큰" 으로 판정해요 (기준값).' },
      { find: 'part = camera.look()', note: '카메라로 찍어서 판정 결과를 part 에 담아요.' },
      { find: 'robot.place_by_rule(part)', note: '규칙표대로 판정에 맞는 함에 놓아요.' },
    ],
    change: { from: 'cell.limit("지름", 110)', to: 'cell.limit("지름", 130)', what: '"큰" 으로 보는 지름 기준값 (mm)' },
    predict: { q: '기준값을 110 에서 130 으로 올리면?', options: ['그대로 잘 나눠요', '큰 부품도 함 2 로 가요', '카메라가 찍지 못해요'], answer: 1, why: '큰 부품 지름이 125 mm 라서 130 보다 작아요. 기준값은 두 크기 사이에 있어야 해요.' },
    expect: 'fail',
  },
  {
    id: 'b7',
    mission: 'B7',
    cell: 'vision',
    file: 'reject_unsure.py',
    about: '색으로 나누되, 확신도가 80 % 보다 낮은 부품은 불량 슈트로 보내요.',
    read: [
      { find: 'cell.limit("확신도", 80)', note: '판정 확신도가 80 % 보다 낮으면 "모름" 으로 보고 불량 슈트로 보내요.' },
      { find: 'cell.rule("빨강", "함 1")', note: '규칙표: 빨강은 함 1 (파랑 · 노랑도 아래 줄에).' },
      { find: 'robot.place_by_rule(part)', note: '판정과 규칙표대로 놓아요.' },
    ],
    change: { from: 'cell.limit("확신도", 80)', to: 'cell.limit("확신도", 20)', what: '확신도 기준 (%)' },
    predict: { q: '80 을 20 으로 낮추면?', options: ['그대로 잘 나눠요', '색이 바랜 부품도 색 함에 들어가요', '모두 불량 슈트로 가요'], answer: 1, why: '기준이 낮으면 애매한 판정도 믿고 써요. 바랜 부품이 엉뚱한 함에 섞여요.' },
    expect: 'fail',
  },
  {
    id: 'c3',
    mission: 'C3',
    cell: 'inspect',
    file: 'height_check.py',
    about: '높이 센서가 정상이면 스토퍼로 보내 양품 트레이에, 아니면 밀어내요.',
    read: [
      { find: 'cell.feed()', note: '부품 하나를 투입해 검사 위치까지 보내요.' },
      { find: 'if cell.is_on("높이 정상"):', note: '높이 센서가 켜져 있으면 아래 3줄, 아니면 else 아래를 해요.' },
      { find: 'cell.eject()', note: '불량을 배출 실린더로 밀어내요.' },
    ],
    change: { from: 'cell.is_on("높이 정상")', to: 'cell.is_on("금속")', what: '조건에 쓰는 센서 이름' },
    predict: { q: '"높이 정상" 대신 "금속" 을 보면?', options: ['그대로 잘 골라요', '낮은 금속 부품이 양품으로 가요', '아무것도 밀어내지 않아요'], answer: 1, why: '조건이 무엇을 보느냐가 판정을 정해요. 금속인지는 높이와 상관없어요.' },
    expect: 'fail',
  },
  {
    id: 'c6',
    mission: 'C6',
    cell: 'inspect',
    file: 'stop_on_three.py',
    about: '불량이 3번 연속이면 경광등을 켜고 라인을 멈춰요.',
    read: [
      { find: 'bad = 0', note: '연속 불량 수를 담는 숫자 상자예요.' },
      { find: 'bad += 1', note: '불량이면 1 더해요 (양품이면 다시 0).' },
      { find: 'if bad >= 3:', note: '3번 연속이면 경광등을 켜고 반복을 멈춰요.' },
    ],
    change: { from: 'bad >= 3', to: 'bad >= 2', what: '멈추는 연속 불량 수' },
    predict: { q: '3 을 2 로 바꾸면?', options: ['그대로 3번째에 멈춰요', '불량 2번 연속에 너무 일찍 멈춰요', '멈추지 않아요'], answer: 1, why: '멈춤 기준이 낮으면 아직 괜찮은 라인도 세워요. 현장에서는 이 수를 품질 기준으로 정해요.' },
    expect: 'fail',
  },
  {
    id: 'd4',
    mission: 'D4',
    cell: 'tend',
    file: 'interlock.py',
    about: '기계가 가공 중이면 끝날 때까지 기다렸다가 꺼내고, 새 소재를 가공해요.',
    read: [
      { find: 'if cell.is_on("가공 중"):', note: '시작할 때 기계가 가공 중이면' },
      { find: 'cell.wait("가공 끝")', note: '가공 끝 신호가 올 때까지 기다려요 (인터록).' },
      { find: 'cell.wait("문 열림")', note: '문이 다 열린 뒤에 팔이 들어가요.' },
    ],
    change: { from: 'cell.is_on("가공 중")', to: 'cell.is_on("가공 끝")', what: '기다릴지 정하는 신호' },
    predict: { q: '"가공 중" 대신 "가공 끝" 을 보면?', options: ['그대로 기다렸다 꺼내요', '가공 중에 문을 열어 불량이 나요', '문이 열리지 않아요'], answer: 1, why: '시작할 때는 아직 가공 끝이 꺼져 있어서 기다리지 않아요. 인터록은 지금 상태를 보는 신호로 해야 해요.' },
    expect: 'fail',
  },
  {
    id: 'd6',
    mission: 'D6',
    cell: 'tend',
    file: 'prepare_next.py',
    about: '가공하는 동안 다음 소재를 문 앞 대기 자리에 갖다 둬서 4개를 185초 안에 끝내요.',
    read: [
      { find: 'robot.set_speed(50)', note: '로봇 속도 (최대 50).' },
      { find: 'robot.place("대기 자리")', note: '가공하는 동안 다음 소재를 문 앞에 갖다 둬요.' },
      { find: 'robot.pick("대기 자리")', note: '꺼낸 뒤 가까운 대기 자리에서 바로 집어 넣어요.' },
    ],
    change: { from: 'robot.set_speed(50)', to: 'robot.set_speed(25)', what: '로봇 속도' },
    predict: { q: '속도를 50 에서 25 로 낮추면?', options: ['시간 안에 끝나요', '185초를 넘겨요', '부품을 떨어뜨려요'], answer: 1, why: '사이클 타임은 기계 시간 + 로봇 시간이에요. 로봇이 느려지면 전체가 늦어져요.' },
    expect: 'fail',
  },
  {
    id: 'e3',
    mission: 'E3',
    cell: 'assembly',
    file: 'four_pins.py',
    about: '클램프로 하우징을 잡고, 핀 4개를 구멍 1~4에 차례로 꽂아요.',
    read: [
      { find: 'cell.wait("클램프 닫힘")', note: '클램프가 하우징을 잡은 뒤에 꽂아요.' },
      { find: 'for _ in range(4):', note: '핀 하나 꽂기를 4번 되풀이해요.' },
      { find: 'robot.place("구멍 다음 칸")', note: '비어 있는 다음 구멍에 꽂아요.' },
    ],
    change: { from: 'range(4)', to: 'range(5)', what: '되풀이하는 횟수' },
    predict: { q: '4 를 5 로 늘리면?', options: ['핀 5개를 꽂아요', '5번째에 구멍이 다 찼다고 멈춰요', '하나도 꽂지 못해요'], answer: 1, why: '하우징 구멍은 4개예요. 프로그램이 장비보다 많이 하라고 하면 멈춰요.' },
    expect: 'error',
  },
  {
    id: 'e4',
    mission: 'E4',
    cell: 'assembly',
    file: 'precise_insert.py',
    about: '여유 0.5 mm 인 구멍에, 꽂기 직전만 속도 10 으로 느리게 꽂아요.',
    read: [
      { find: 'robot.set_speed(50)', note: '오갈 때는 빠르게 (50).' },
      { find: 'robot.set_speed(10)', note: '꽂기 직전에만 느리게: 손끝 오차 = 속도 × 0.04 mm → 0.4 mm.' },
      { find: 'robot.place("구멍 다음 칸")', note: '구멍에 꽂아요 (오차가 여유 0.5 mm 보다 크면 걸려요).' },
    ],
    change: { from: 'robot.set_speed(10)', to: 'robot.set_speed(25)', what: '꽂을 때 속도' },
    predict: { q: '꽂을 때 속도를 10 에서 25 로 올리면?', options: ['더 빨리 끝나요', '핀이 걸려요', '그대로예요'], answer: 1, why: '25 × 0.04 = 1.0 mm 라서 여유 0.5 mm 보다 커요. 정밀할수록 천천히 꽂아요.' },
    expect: 'error',
  },
];

export const labOf = (mission: string | null) => (mission ? (LABS.find((l) => l.mission === mission) ?? null) : null);
export const labsOf = (cell: CellId) => LABS.filter((l) => l.cell === cell);
export const labDir = (l: Lab) => `${HOME}/cell/${l.id}`;
export const labPath = (l: Lab) => `${labDir(l)}/${l.file}`;
/** The lab a file belongs to (by its path). */
export const labAt = (path: string) => LABS.find((l) => labPath(l) === path) ?? null;

/** The lab's program file: a heading, the step's reference program, the value to change marked. */
export function labSource(l: Lab): string {
  const m = missionById(l.mission)!;
  const body = m.solution!;
  const lines = body.split('\n');
  const k = lines.findIndex((s) => s.includes(l.change.from));
  if (k >= 0) lines[k] = `${lines[k]}  # ← 바꿔 볼 값: ${l.change.what}`;
  return [`# 실습 셀 ${l.mission} ${m.title}`, `# ${l.about}`, ...lines].join('\n');
}

/** The program with the value changed (what the student's nano edit makes). */
export const labChanged = (l: Lab) => labSource(l).replace(l.change.from, l.change.to);

/** Every lab's folder: its program and a README. */
export function labFiles(): Record<string, string> {
  const out: Record<string, string> = {
    [`${HOME}/README.txt`]: '실습 셀 터미널 실습\n\n  cd ~/cell        실습 폴더로\n  ls               폴더 안 보기\n  help             쓸 수 있는 명령\n',
  };
  for (const l of LABS) {
    out[labPath(l)] = labSource(l);
    out[`${labDir(l)}/README.txt`] = `${l.mission} ${missionById(l.mission)!.title}\n${l.about}\n\n바꿔 볼 값: ${l.change.what} (${l.change.from} → ${l.change.to})\n실행: python3 ${l.file}\n`;
  }
  return out;
}

/** The 1-based line of a file where `find` is. */
export const lineOf = (src: string, find: string) => src.split('\n').findIndex((s) => s.includes(find)) + 1;
