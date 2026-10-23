'use client';

/**
 * Entry-style block editor. It never holds its own copy of the program: it
 * parses the Python text, draws those blocks, and every edit re-serialises the
 * whole program back to text. So blocks and Python can never disagree.
 *
 * Made for a first lesson: numbers are chips that open a small panel with a
 * slider and step buttons (and the robot's present angle); a block is picked
 * by clicking it, and palette blocks go in right after the picked one; every
 * block has move up / down, copy and delete keys, so nothing needs dragging
 * (dragging still works).
 */

import { useEffect, useEffectEvent, useRef, useState, type DragEvent, type ReactNode } from 'react';

import { BIN_NAMES, COLORS, SPOT_NAMES, type BinName, type ColorName, type SpotName, type Theme } from '@/engine/simulator/board';
import { EFFECTOR_BY_ID, type EffectorId } from '@/engine/simulator/effectors';
import { jointMax, jointMin } from '@/engine/robot/limits';
import {
  DEFAULT_VARIABLE,
  MOVE_TIME_MAX,
  MOVE_TIME_MIN,
  SHAPE_CM,
  SHAPE_NAMES,
  SPEEDS,
  parse,
  serialize,
  targetLabel,
  type ShapeName,
  type Step,
  type Target,
} from '@/engine/simulator/program';
import { cellLayout, type CellId } from '@/engine/simulator/cell/cells';

import { useLive, type Live } from '../liveStore';
import css from '../console.module.css';

type Proto =
  | { type: Exclude<Step['type'], 'grip' | 'pump' | 'pen'> }
  /** "N초 동안 관절을 …" (a joint move that takes a set time). */
  | { type: 'joint'; timed: true }
  | { type: 'grip'; open: boolean }
  | { type: 'pump'; on: boolean }
  | { type: 'pen'; down: boolean };

type Path = number[];
type Drag = { kind: 'new'; proto: Proto } | { kind: 'move'; path: Path };
type DropTarget = { where: 'end' } | { where: 'delete' } | { where: 'before'; path: Path } | { where: 'into'; i: number };

interface Props {
  code: string;
  onCode(code: string): void;
  effector: EffectorId;
  cameraFlange: boolean;
  /** AI 키트: kit camera and bins A–D; 로봇팔 단독: the hand camera and the mat's 자리 1–4. */
  theme: Theme;
  poseNames: string[];
  /** Live joint angles (the robot's present pose), read when a block needs it. */
  live: Live;
  runningLine: number;
  /** 실습 셀 open: its commands (places, signals) instead of the desk's camera and carry blocks. */
  cell?: CellId | null;
  onError(msg: string, fix?: string): void;
  /** 고칠 곳 (tutorial): the blocks on these lines blink yellow. */
  hotLines?: readonly number[];
}

const COLOR_CLASS: Record<Step['type'], string> = {
  home: css.c_move,
  pose: css.c_move,
  joint: css.c_move,
  speed: css.c_move,
  above: css.c_move,
  down: css.c_move,
  find: css.c_eye,
  grip: css.c_grip,
  pump: css.c_grip,
  pen: css.c_grip,
  push: css.c_grip,
  wait: css.c_flow,
  repeat: css.c_flow,
  move: css.c_adv,
  moveTo: css.c_adv,
  carry: css.c_macro,
  shape: css.c_macro,
  sort: css.c_macro,
  cellPick: css.c_macro,
  cellPlace: css.c_macro,
  cellFeed: css.c_flow,
  cellWait: css.c_flow,
  cellSet: css.c_flow,
};

function toolProtos(effector: EffectorId): Proto[] {
  switch (EFFECTOR_BY_ID[effector].kind) {
    case 'grip':
      return [{ type: 'grip', open: true }, { type: 'grip', open: false }];
    case 'suction':
      return [{ type: 'pump', on: true }, { type: 'pump', on: false }];
    case 'pen':
      return [{ type: 'pen', down: true }, { type: 'pen', down: false }];
    case 'press':
      return [{ type: 'push' }];
    case 'hold':
    case 'none':
      return [];
  }
}

export default function BlockEditor({ code, onCode, effector, cameraFlange, theme, poseNames, live, runningLine, onError, hotLines, cell }: Props) {
  const drag = useRef<Drag | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [trash, setTrash] = useState(false);
  /** The picked block (its path), where palette blocks are added after. */
  const [picked, setPicked] = useState<string | null>(null);

  // 되돌리기 · 다시 하기: the programs before (and after) each change made here. A change from
  // outside (another practice, the example put back) starts a new history.
  const [hist, setHist] = useState<{ past: string[]; future: string[]; mine: string }>({ past: [], future: [], mine: code });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the program was replaced from outside
    if (code !== hist.mine) setHist({ past: [], future: [], mine: code });
  }, [code, hist.mine]);
  const edit = (next: string) => {
    if (next === code) return;
    setHist((h) => ({ past: [...h.past, code].slice(-60), future: [], mine: next }));
    onCode(next);
  };
  const undo = () => {
    const prev = hist.past.at(-1);
    if (prev === undefined) return;
    setHist({ past: hist.past.slice(0, -1), future: [...hist.future, code], mine: prev });
    onCode(prev);
  };
  const redo = () => {
    const next = hist.future.at(-1);
    if (next === undefined) return;
    setHist({ past: [...hist.past, code], future: hist.future.slice(0, -1), mine: next });
    onCode(next);
  };
  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) while the blocks are open, but not while typing in a number.
  const onHistoryKey = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onHistoryKey(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { steps, errors } = parse(code);
  const variables = collectVariables(steps);

  const kindNow = EFFECTOR_BY_ID[effector].kind;
  const picks = kindNow === 'grip' || kindNow === 'suction';
  // 한 번에 하는 동작: one block that does a whole job, for the fitted tool (first, for beginners).
  const macros: Proto[] = [...(picks ? [{ type: 'carry' } as Proto, ...(theme === 'arm' ? [{ type: 'sort' } as Proto] : [])] : []), ...(kindNow === 'pen' ? [{ type: 'shape' } as Proto] : [])];
  const palette: [string, Proto[]][] = cell
    ? [
        ['셀 · 로봇', [{ type: 'cellPick' }, { type: 'cellPlace' }, { type: 'home' }, { type: 'speed' }]],
        ['셀 · 장비', [...(cellLayout(cell).line.pusher ? [{ type: 'cellFeed' } as Proto] : []), { type: 'cellWait' }, { type: 'cellSet' }]],
        ['흐름', [{ type: 'wait' }, { type: 'repeat' }]],
        [EFFECTOR_BY_ID[effector].name, toolProtos(effector)],
        ['고급', [{ type: 'joint' }, { type: 'moveTo' }, { type: 'move' }]],
      ]
    : [
    ...(macros.length ? [['한 번에 하는 동작', macros] as [string, Proto[]]] : []),
    ['움직이기', [{ type: 'home' }, ...(poseNames.length ? [{ type: 'pose' } as Proto] : []), { type: 'joint' }, { type: 'joint', timed: true }, { type: 'speed' }]],
    ['카메라', [{ type: 'find' }]],
    ['옮기기', [{ type: 'above' }, { type: 'down' }]],
    [EFFECTOR_BY_ID[effector].name, toolProtos(effector)],
    ['흐름', [{ type: 'wait' }, { type: 'repeat' }]],
    ['고급', [{ type: 'moveTo' }, { type: 'move' }]],
      ];
  // A cell's places and signals for its blocks.
  const lay = cell ? cellLayout(cell) : null;
  // Cell A keeps its sides apart (picks from the source plate and the belt, places on the pallet); the others list every place.
  const anyPlace = lay ? [...Object.keys(lay.places), ...Object.keys(lay.grids).map((g) => `${g} 다음 칸`)] : [];
  const pickPlaces = lay ? (cell === 'feed' ? [...Object.keys(lay.places).filter((n) => n !== '기준 자리'), ...Object.keys(lay.grids).filter((g) => g !== '적재 판').map((g) => `${g} 다음 칸`)] : anyPlace) : [];
  const placePlaces = lay ? (cell === 'feed' ? ['기준 자리', ...Object.keys(lay.grids).filter((g) => g !== '소재 판').map((g) => `${g} 다음 칸`)] : anyPlace) : [];
  const opts = (list: readonly string[], now: string): [string, string][] => [...new Set([now, ...list])].map((n) => [n, n]);

  const makeStep = (proto: Proto): Step => {
    const line = 0;
    switch (proto.type) {
      case 'home':
        return { type: 'home', line };
      case 'pose':
        return { type: 'pose', name: poseNames[0] ?? '', line };
      case 'joint':
        return { type: 'joint', j: 1, deg: 30, sec: 'timed' in proto ? 2 : null, line };
      case 'speed':
        return { type: 'speed', value: 35, line };
      case 'grip':
        return { type: 'grip', open: proto.open, line };
      case 'pump':
        return { type: 'pump', on: proto.on, line };
      case 'pen':
        return { type: 'pen', down: proto.down, line };
      case 'push':
        return { type: 'push', line };
      case 'wait':
        return { type: 'wait', sec: 1, line };
      case 'repeat':
        return { type: 'repeat', times: 2, body: [], line };
      case 'move':
        return { type: 'move', joints: live.getAngles().map((a) => Math.round(a)), speed: null, line };
      case 'moveTo':
        return { type: 'moveTo', x: 200, y: 0, z: 80, line };
      case 'carry':
        return theme === 'arm'
          ? { type: 'carry', from: { kind: 'block', color: '빨강' }, to: { kind: 'spot', spot: SPOT_NAMES[0] }, line }
          : { type: 'carry', from: variables.length ? { kind: 'var', name: variables[0] } : { kind: 'var', name: DEFAULT_VARIABLE }, to: { kind: 'bin', bin: 'A' }, line };
      case 'shape':
        return { type: 'shape', shape: '네모', cm: 6, line };
      case 'sort':
        return { type: 'sort', line };
      case 'cellPick':
        return { type: 'cellPick', place: pickPlaces[0] ?? '소재 1', line };
      case 'cellPlace':
        return { type: 'cellPlace', place: placePlaces[0] ?? '기준 자리', dx: 0, dy: 0, dz: 0, line };
      case 'cellFeed':
        return { type: 'cellFeed', line };
      case 'cellWait':
        return { type: 'cellWait', signal: lay?.inputs[0] ?? '끝 센서', on: true, line };
      case 'cellSet':
        return { type: 'cellSet', signal: lay?.outputs[0] ?? '컨베이어', on: true, line };
      case 'find':
        return { type: 'find', variable: DEFAULT_VARIABLE, camera: theme === 'arm' ? 'hand' : 'top', color: '빨강', line };
      case 'above':
      case 'down':
        return { type: proto.type, target: variables.length ? { kind: 'var', name: variables[0] } : theme === 'arm' ? { kind: 'spot', spot: SPOT_NAMES[0] } : { kind: 'bin', bin: 'D' }, line };
    }
  };

  const applyDrop = (target: DropTarget, d: Drag) => {
    const parsed = parse(code);
    if (parsed.errors.length) {
      onError('블록 프로그램을 읽지 못해서 블록을 바꿀 수 없어요.', '위의 [예제 코드 처음으로]를 눌러 다시 시작해 주세요.');
      return;
    }
    const list0 = parsed.steps;
    const at = (p: Path): Step => (p.length === 1 ? list0[p[0]] : (list0[p[0]] as Extract<Step, { type: 'repeat' }>).body[p[1]]);
    // Decide whether the drop is allowed BEFORE taking the block out, so a
    // refused drop never loses the block.
    const intoLoop = target.where === 'into' || (target.where === 'before' && target.path.length === 2);
    const movingType = d.kind === 'new' ? d.proto.type : at(d.path).type;
    if (intoLoop && movingType === 'repeat') {
      onError('반복 안에 반복은 넣을 수 없어요.');
      return;
    }
    let item: Step;
    let src: Path | null = null;
    if (d.kind === 'new') item = makeStep(d.proto);
    else {
      src = d.path;
      if (target.where === 'before' && target.path.join() === src.join()) return;
      if (src.length === 1 && at(src).type === 'repeat') {
        if (target.where === 'into' && target.i === src[0]) return;
        if (target.where === 'before' && target.path.length === 2 && target.path[0] === src[0]) return;
      }
      const list = src.length === 1 ? list0 : (list0[src[0]] as Extract<Step, { type: 'repeat' }>).body;
      item = list.splice(src[src.length - 1], 1)[0];
    }
    if (target.where === 'delete') {
      edit(serialize(list0));
      return;
    }
    const path: Path =
      target.where === 'end' ? [list0.length] : target.where === 'into' ? [target.i, Number.MAX_SAFE_INTEGER] : target.path.slice();
    if (src) {
      if (src.length === 1 && path[0] > src[0]) path[0] -= 1;
      else if (src.length === 2 && path.length === 2 && path[0] === src[0] && path[1] > src[1]) path[1] -= 1;
    }
    const list = path.length === 1 ? list0 : (list0[path[0]] as Extract<Step, { type: 'repeat' }>).body;
    list.splice(Math.min(path[path.length - 1], list.length), 0, item);
    edit(serialize(list0));
  };

  const endDrag = () => {
    drag.current = null;
    setDropKey(null);
    setDraggingKey(null);
    setTrash(false);
  };

  const commit = () => edit(serialize(steps));

  /* --- block content --------------------------------------------------- */

  const sel = ({ value, options, onChange, label }: { value: string; options: [string, string][]; onChange(v: string): void; label: string }) => (
    <select className={css.field} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} onMouseDown={(e) => e.stopPropagation()}>
      {options.map(([t, v]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
  const num = (
    { value, onChange, label, min, max, step = 1, unit = '', joint }: { value: number; onChange(v: number): void; label: string; min: number; max: number; step?: number; unit?: string; joint?: number; small?: boolean },
    key?: string | number,
  ) => <NumChip key={key} value={value} onChange={onChange} label={label} min={min} max={max} step={step} unit={unit} joint={joint} live={live} />;

  const colorOptions: [string, string][] = COLORS.map((c) => [c.name, c.name]);
  const targetOptions = (): [string, string][] => [
    ...variables.map((v): [string, string] => [targetLabel({ kind: 'var', name: v }), `var:${v}`]),
    ...(theme === 'arm' ? SPOT_NAMES.map((n): [string, string] => [n, `spot:${n}`]) : BIN_NAMES.map((b): [string, string] => [`분류함 ${b}`, `bin:${b}`])),
    ...(EFFECTOR_BY_ID[effector].kind === 'press' ? ([['버튼', 'button']] as [string, string][]) : []),
  ];
  const targetValue = (t: Target) => (t.kind === 'var' ? `var:${t.name}` : t.kind === 'bin' ? `bin:${t.bin}` : t.kind === 'spot' ? `spot:${t.spot}` : t.kind === 'block' ? `block:${t.color}` : 'button');
  const parseTargetValue = (v: string): Target =>
    v === 'button'
      ? { kind: 'button' }
      : v.startsWith('var:')
        ? { kind: 'var', name: v.slice(4) }
        : v.startsWith('spot:')
          ? { kind: 'spot', spot: v.slice(5) as SpotName }
          : v.startsWith('block:')
            ? { kind: 'block', color: v.slice(6) as ColorName }
            : { kind: 'bin', bin: v.slice(4) as BinName };

  /** Editable content for a placed block; `preview` = palette look. */
  const content = (s: Step, preview: boolean): ReactNode => {
    switch (s.type) {
      case 'home':
        return <span>기본 자세로 가기</span>;
      case 'pose':
        return (
          <>
            {preview ? <span>{poseNames[0]} ▾</span> : sel({ label: "자세", value: s.name, options: [...new Set([s.name, ...poseNames])].map((n) => [n, n]), onChange: (v) => ((s.name = v), commit()) })}
            <span>자세로 가기</span>
          </>
        );
      case 'joint':
        return (
          <>
            {s.sec != null &&
              (preview ? (
                <span>2초 동안</span>
              ) : (
                <>
                  {num({ label: '움직이는 시간', value: s.sec, unit: '초', min: MOVE_TIME_MIN, max: MOVE_TIME_MAX, step: 0.5, onChange: (v) => ((s.sec = v), commit()) })}
                  <span>동안</span>
                </>
              ))}
            {preview ? <span>1번 ▾</span> : sel({ label: "관절 번호", value: String(s.j), options: jointMin().map((_, i) => [`${i + 1}번`, String(i + 1)]), onChange: (v) => ((s.j = Number(v)), commit()) })}
            <span>관절을</span>
            {preview ? (
              <span>30°로</span>
            ) : (
              <>
                {num({ label: `${s.j}번 관절 각도`, value: s.deg, unit: '°', min: jointMin()[s.j - 1], max: jointMax()[s.j - 1], joint: s.j - 1, onChange: (v) => ((s.deg = v), commit()) })}
                <span>로</span>
              </>
            )}
          </>
        );
      case 'speed': {
        const opts: [string, string][] = SPEEDS.map(([t, n]) => [t, String(n)]);
        if (!SPEEDS.some(([, n]) => n === s.value)) opts.push([String(s.value), String(s.value)]);
        return (
          <>
            <span>속도를</span>
            {preview ? <span>보통 ▾</span> : sel({ label: "속도", value: String(s.value), options: opts, onChange: (v) => ((s.value = Number(v)), commit()) })}
            <span>으로</span>
          </>
        );
      }
      case 'find':
        return (
          <>
            {preview ? <span>{theme === 'arm' ? '손 카메라로' : '키트 카메라로'}</span> : (
              <>
                {sel({
                  label: '카메라',
                  value: s.camera,
                  options: [
                    ...(theme === 'kit' || s.camera === 'top' ? ([['키트 카메라', 'top']] as [string, string][]) : []),
                    ...(theme === 'arm' || cameraFlange || s.camera === 'hand' ? ([['손 카메라', 'hand']] as [string, string][]) : []),
                  ],
                  onChange: (v) => ((s.camera = v as 'top' | 'hand'), commit()),
                })}
                <span>로</span>
              </>
            )}
            {preview ? <span>빨강 ▾</span> : sel({ label: "색", value: s.color, options: colorOptions, onChange: (v) => ((s.color = v as ColorName), commit()) })}
            <span>블록 찾기</span>
          </>
        );
      case 'above':
      case 'down':
        return (
          <>
            {preview ? (
              <span>{variables.length ? '찾은 블록' : theme === 'arm' ? SPOT_NAMES[0] : '분류함 D'} ▾</span>
            ) : (
              sel({ label: '어디로', value: targetValue(s.target), options: withCurrent(targetOptions(), s.target), onChange: (v) => ((s.target = parseTargetValue(v)), commit()) })
            )}
            <span>{s.type === 'above' ? '위로 가기' : '까지 내려가기'}</span>
          </>
        );
      case 'grip':
        return <span>그리퍼 {s.open ? '열기' : '닫기'}</span>;
      case 'pump':
        return <span>흡착 {s.on ? '켜기' : '끄기'}</span>;
      case 'pen':
        return <span>펜 {s.down ? '내리기' : '올리기'}</span>;
      case 'push':
        return <span>실린더 누르기</span>;
      case 'wait':
        return (
          <>
            <span>⏸</span>
            {preview ? <span>1초</span> : num({ label: '멈춰 있을 시간', value: s.sec, unit: '초', min: 0, max: 10, step: 0.5, onChange: (v) => ((s.sec = v), commit()) })}
            <span>동안 멈추기</span>
          </>
        );
      case 'moveTo':
        return (
          <>
            <span>좌표로 가기</span>
            {!preview && (
              <span className={css.advJoints}>
                x {num({ label: 'x (앞뒤, mm)', value: s.x, min: -280, max: 280, step: 5, onChange: (v) => ((s.x = v), commit()) })}
                y {num({ label: 'y (좌우, mm)', value: s.y, min: -280, max: 280, step: 5, onChange: (v) => ((s.y = v), commit()) })}
                z {num({ label: 'z (높이, mm)', value: s.z, min: 0, max: 400, step: 5, onChange: (v) => ((s.z = v), commit()) })}
              </span>
            )}
          </>
        );
      case 'move':
        return (
          <>
            <span>{s.joints.length}개 관절 한번에</span>
            {!preview && (
              <span className={css.advJoints}>
                {s.joints.map((v, i) =>
                  num({ label: `${i + 1}번 관절 각도`, value: v, unit: '°', min: jointMin()[i], max: jointMax()[i], joint: i, onChange: (nv) => ((s.joints[i] = nv), commit()) }, i),
                )}
                <button
                  type="button"
                  className={css.fillNow}
                  title={`로봇의 지금 자세로 ${s.joints.length}개 각도를 채워요`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    s.joints = live.getAngles().map((a) => Math.round(a));
                    commit();
                  }}
                >
                  지금 자세
                </button>
              </span>
            )}
          </>
        );
      case 'repeat':
        return <span>{preview ? '2번 반복하기' : ''}</span>;
      case 'carry': {
        const fromOpts: [string, string][] = theme === 'arm' ? COLORS.map((c): [string, string] => [`${c.name} 블록`, `block:${c.name}`]) : variables.map((v): [string, string] => [targetLabel({ kind: 'var', name: v }), `var:${v}`]);
        return (
          <>
            <span className={css.macroIcon} aria-hidden="true">✋</span>
            {preview ? <span>빨강 블록 ▾</span> : sel({ label: '옮길 블록', value: targetValue(s.from), options: withCurrent(fromOpts, s.from), onChange: (v) => ((s.from = parseTargetValue(v)), commit()) })}
            <span>을</span>
            {preview ? <span>{theme === 'arm' ? SPOT_NAMES[0] : '분류함 A'} ▾</span> : sel({ label: '놓을 곳', value: targetValue(s.to), options: withCurrent(targetOptions().filter(([, v]) => !v.startsWith('var:')), s.to), onChange: (v) => ((s.to = parseTargetValue(v)), commit()) })}
            <span>로 옮기기</span>
          </>
        );
      }
      case 'shape':
        return (
          <>
            <span className={css.macroIcon} aria-hidden="true">✎</span>
            {preview ? <span>네모 ▾</span> : sel({ label: '모양', value: s.shape, options: SHAPE_NAMES.map((n) => [n, n]), onChange: (v) => ((s.shape = v as ShapeName), commit()) })}
            <span>크기</span>
            {preview ? <span>6cm</span> : num({ label: '도형 크기', value: s.cm, unit: 'cm', min: SHAPE_CM.min, max: SHAPE_CM.max, step: 1, onChange: (v) => ((s.cm = v), commit()) })}
            <span>그리기</span>
          </>
        );
      case 'sort':
        return (
          <>
            <span className={css.macroIcon} aria-hidden="true">◧</span>
            <span>블록을 색깔별로 자리 1~4 에 정리하기</span>
          </>
        );
      case 'cellPick':
        return (
          <>
            <span className={css.macroIcon} aria-hidden="true">✋</span>
            {preview ? <span>{s.place} ▾</span> : sel({ label: '집을 곳', value: s.place, options: opts(pickPlaces, s.place), onChange: (v) => ((s.place = v), commit()) })}
            <span>에서 집기</span>
          </>
        );
      case 'cellPlace':
        return (
          <>
            <span className={css.macroIcon} aria-hidden="true">⤓</span>
            {preview ? <span>{s.place} ▾</span> : sel({ label: '놓을 곳', value: s.place, options: opts(placePlaces, s.place), onChange: (v) => ((s.place = v), commit()) })}
            <span>에 놓기</span>
            {preview ? (
              <span>· 비켜 x 0 y 0 z 0</span>
            ) : (
              <>
                <span>· 비켜 x</span>
                {num({ label: '비켜 놓기 x (앞뒤, mm)', value: s.dx, min: -1000, max: 1000, step: 5, unit: 'mm', onChange: (v) => ((s.dx = v), commit()) })}
                <span>y</span>
                {num({ label: '비켜 놓기 y (좌우, mm)', value: s.dy, min: -1000, max: 1000, step: 5, unit: 'mm', onChange: (v) => ((s.dy = v), commit()) })}
                <span>z</span>
                {num({ label: '비켜 놓기 z (높이, mm)', value: s.dz, min: -1000, max: 1000, step: 5, unit: 'mm', onChange: (v) => ((s.dz = v), commit()) })}
              </>
            )}
          </>
        );
      case 'cellFeed':
        return <span>공급 요청하기 (부품 1개)</span>;
      case 'cellWait':
        return (
          <>
            {preview ? <span>{s.signal} ▾</span> : sel({ label: '기다릴 신호', value: s.signal, options: opts(lay?.inputs ?? [], s.signal), onChange: (v) => ((s.signal = v), commit()) })}
            <span>이</span>
            {preview ? <span>켜질 ▾</span> : sel({ label: '켜질 때 · 꺼질 때', value: s.on ? 'on' : 'off', options: [['켜질', 'on'], ['꺼질', 'off']], onChange: (v) => ((s.on = v === 'on'), commit()) })}
            <span>때까지 기다리기</span>
          </>
        );
      case 'cellSet':
        return (
          <>
            {preview ? <span>{s.signal} ▾</span> : sel({ label: '장비', value: s.signal, options: opts(lay?.outputs ?? [], s.signal), onChange: (v) => ((s.signal = v), commit()) })}
            {preview ? <span>켜기 ▾</span> : sel({ label: '켜기 · 끄기', value: s.on ? 'on' : 'off', options: [['켜기', 'on'], ['끄기', 'off']], onChange: (v) => ((s.on = v === 'on'), commit()) })}
          </>
        );
    }
  };

  const withCurrent = (opts: [string, string][], t: Target): [string, string][] => {
    const v = targetValue(t);
    return opts.some(([, o]) => o === v) ? opts : [[targetLabel(t), v], ...opts];
  };

  /* --- rendering --------------------------------------------------------- */

  const dragProps = (path: Path) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      drag.current = { kind: 'move', path };
      setDraggingKey(path.join());
      e.dataTransfer.setData('text/plain', 'block');
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: endDrag,
    onDragOver: (e: DragEvent) => {
      if (!drag.current) return;
      e.preventDefault();
      e.stopPropagation();
      setDropKey(`before:${path.join()}`);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (drag.current) applyDrop({ where: 'before', path }, drag.current);
      endDrag();
    },
  });

  const removeAt = (path: Path) => {
    const list = path.length === 1 ? steps : (steps[path[0]] as Extract<Step, { type: 'repeat' }>).body;
    list.splice(path[path.length - 1], 1);
    commit();
  };

  const listOf = (path: Path) => (path.length === 1 ? steps : (steps[path[0]] as Extract<Step, { type: 'repeat' }>).body);
  /**
   * ↑ ↓ also go in and out of a loop (tablets cannot drag a block into one): the first block of a
   * loop going up, or its last going down, leaves it; a block next to a loop going towards it goes in.
   */
  const moveBy = (path: Path, dir: -1 | 1) => {
    const list = listOf(path);
    const k = path[path.length - 1];
    const to = k + dir;
    if (path.length === 2 && (to < 0 || to >= list.length)) {
      const i = path[0];
      const [item] = list.splice(k, 1);
      steps.splice(dir < 0 ? i : i + 1, 0, item);
      setPicked(String(dir < 0 ? i : i + 1));
      commit();
      return;
    }
    if (to < 0 || to >= list.length) return;
    const next = list[to];
    if (path.length === 1 && next.type === 'repeat' && list[k].type !== 'repeat') {
      const [item] = list.splice(k, 1);
      const loop = dir < 0 ? k - 1 : k;
      const body = (steps[loop] as Extract<Step, { type: 'repeat' }>).body;
      if (dir < 0) body.push(item);
      else body.unshift(item);
      setPicked(`${loop},${dir < 0 ? body.length - 1 : 0}`);
      commit();
      return;
    }
    [list[k], list[to]] = [list[to], list[k]];
    setPicked([...path.slice(0, -1), to].join());
    commit();
  };
  const copyAt = (path: Path) => {
    const list = listOf(path);
    const k = path[path.length - 1];
    list.splice(k + 1, 0, JSON.parse(JSON.stringify(list[k])) as Step);
    setPicked([...path.slice(0, -1), k + 1].join());
    commit();
  };
  const key = (label: string, text: string, fn: () => void) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        fn();
      }}
    >
      {text}
    </button>
  );
  const del = (path: Path) => (
    <span className={css.blockKeys}>
      {key('위로', '↑', () => moveBy(path, -1))}
      {key('아래로', '↓', () => moveBy(path, 1))}
      {key('복사', '⧉', () => copyAt(path))}
      {key('지우기', '×', () => {
        setPicked(null);
        removeAt(path);
      })}
    </span>
  );

  const classes = (s: Step, path: Path, extra = '') =>
    [
      css.block,
      extra || COLOR_CLASS[s.type],
      s.line === runningLine ? css.running : '',
      dropKey === `before:${path.join()}` ? css.dropBefore : '',
      draggingKey === path.join() ? css.dragging : '',
      picked === path.join() ? css.picked : '',
    ].join(' ');
  const pick = (path: Path) => ({
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setPicked((p) => (p === path.join() ? null : path.join()));
    },
  });

  const build = (s: Step, path: Path): ReactNode => {
    if (s.type === 'repeat') {
      return (
        <div key={path.join()} className={classes(s, path, css.repeat)} {...dragProps(path)} {...pick(path)}>
          <div className={css.cHead}>
            {num({ label: '반복 횟수', value: s.times, unit: '번', min: 1, max: 20, onChange: (v) => ((s.times = Math.max(1, Math.round(v))), commit()) })}
            <span>반복하기</span>
            {del(path)}
          </div>
          <div
            className={`${css.cBody} ${dropKey === `into:${path[0]}` ? css.dropInto : ''}`}
            onDragOver={(e) => {
              if (!drag.current || e.target !== e.currentTarget) return;
              e.preventDefault();
              e.stopPropagation();
              setDropKey(`into:${path[0]}`);
            }}
            onDrop={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              e.stopPropagation();
              if (drag.current) applyDrop({ where: 'into', i: path[0] }, drag.current);
              endDrag();
            }}
          >
            {s.body.map((c, j) => build(c, [path[0], j]))}
            {/* Tap here, then a block in the palette: it goes inside the loop (no dragging needed). */}
            <button
              type="button"
              className={`${css.loopSlot} ${picked === `in:${path[0]}` ? css.loopSlotOn : ''}`}
              aria-pressed={picked === `in:${path[0]}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPicked((p) => (p === `in:${path[0]}` ? null : `in:${path[0]}`));
              }}
            >
              ＋ {s.body.length ? '반복 안에 더 넣기' : '반복 안에 넣을 블록 고르기'}
            </button>
          </div>
          <div className={css.cFoot} />
        </div>
      );
    }
    return (
      <div key={path.join()} className={classes(s, path)} data-hot={hotLines?.includes(s.line) || undefined} {...dragProps(path)} {...pick(path)}>
        {content(s, false)}
        {del(path)}
      </div>
    );
  };

  return (
    <div className={css.blocks}>
      <div
        className={`${css.palette} ${trash ? css.paletteTrash : ''}`}
        aria-label="블록 꾸러미"
        onDragOver={(e) => {
          if (drag.current?.kind === 'move') {
            e.preventDefault();
            setTrash(true);
          }
        }}
        onDragLeave={() => setTrash(false)}
        onDrop={(e) => {
          e.preventDefault();
          if (drag.current?.kind === 'move') applyDrop({ where: 'delete' }, drag.current);
          endDrag();
        }}
      >
        <p className={css.paletteTip}>{picked?.startsWith('in:') ? '누르면 반복 안에 들어가요' : picked ? '누르면 고른 블록 다음에 들어가요' : '누르면 맨 끝에 들어가요'}</p>
        {palette.map(([name, items]) => (
          <PaletteGroup key={name} name={name} empty={items.length === 0}>
            {items.map((proto, k) => {
              const preview = makeStep(proto);
              const add = () => {
                // Into a loop when its slot is picked (the end of its body).
                if (picked?.startsWith('in:')) {
                  const i = Number(picked.slice(3));
                  const loop = steps[i];
                  if (loop?.type === 'repeat') {
                    // The slot stays picked, so several blocks go in one after another.
                    applyDrop({ where: 'into', i }, { kind: 'new', proto });
                    return;
                  }
                }
                // After the picked block (inside a loop when it is in one), else at the end.
                const at = picked ? picked.split(',').map(Number) : null;
                const valid = at && (at.length === 1 ? at[0] < steps.length : at[0] < steps.length && steps[at[0]].type === 'repeat');
                if (valid && at) {
                  const next = [...at.slice(0, -1), at[at.length - 1] + 1];
                  applyDrop(next.length === 1 && next[0] >= steps.length ? { where: 'end' } : { where: 'before', path: next }, { kind: 'new', proto });
                  setPicked(next.join());
                } else {
                  applyDrop({ where: 'end' }, { kind: 'new', proto });
                  setPicked(String(steps.length));
                }
              };
              return (
                <div
                  key={`${name}-${k}`}
                  className={`${css.block} ${COLOR_CLASS[proto.type]}`}
                  draggable
                  role="button"
                  tabIndex={0}
                  onDragStart={(e) => {
                    drag.current = { kind: 'new', proto };
                    e.dataTransfer.setData('text/plain', 'block');
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  onDragEnd={endDrag}
                  onClick={add}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      add();
                    }
                  }}
                >
                  {content(preview, true)}
                </div>
              );
            })}
          </PaletteGroup>
        ))}
      </div>
      <div
        className={css.workspace}
        onClick={() => setPicked(null)}
        onDragOver={(e) => {
          if (drag.current) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (drag.current) applyDrop({ where: 'end' }, drag.current);
          endDrag();
        }}
      >
        <div className={css.undoBar} onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={undo} disabled={!hist.past.length} title="되돌리기 (Ctrl+Z)" aria-label="되돌리기">
            ↶
          </button>
          <button type="button" onClick={redo} disabled={!hist.future.length} title="다시 하기 (Ctrl+Y)" aria-label="다시 하기">
            ↷
          </button>
        </div>
        <div className={css.script}>
          <div className={`${css.block} ${css.start}`}>
            <span>▶ 시뮬레이션을 누르면</span>
          </div>
          {errors.length ? (
            <p className={css.empty}>블록 프로그램을 읽지 못했어요 ({errors[0].line}번째 줄). 위의 [예제 코드 처음으로]를 눌러 다시 시작해 주세요.</p>
          ) : (
            steps.map((s, i) => build(s, [i]))
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteGroup({ name, empty, children }: { name: string; empty: boolean; children: ReactNode }) {
  return (
    <>
      <div className={css.grp}>{name}</div>
      {empty ? <p className={css.hint}>이 도구는 따로 쓰는 블록이 없어요.</p> : children}
    </>
  );
}

function collectVariables(steps: readonly Step[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly Step[]) =>
    list.forEach((s) => {
      if (s.type === 'find' && !out.includes(s.variable)) out.push(s.variable);
      if (s.type === 'repeat') walk(s.body);
    });
  walk(steps);
  return out;
}

/**
 * A number in a block, shown whole ("46°"). Clicking it opens a small panel:
 * slider, step buttons, a number field and — for joint angles — the robot's
 * present angle. Every change applies at once.
 */
/** "지금 로봇 N°": the joint's present angle, kept up to date while the chip's panel is open. */
function NowButton({ live, joint, unit, onSet }: { live: Live; joint: number; unit: string; onSet(v: number): void }) {
  const now = useLive(live, (v) => Math.round(v.angles[joint] ?? 0));
  return (
    <button type="button" className={css.fillNow} onClick={() => onSet(now)}>
      지금 로봇 {now}
      {unit}
    </button>
  );
}

function NumChip({
  value,
  onChange,
  label,
  min,
  max,
  step,
  unit,
  joint,
  live,
}: {
  value: number;
  onChange(v: number): void;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** For a joint angle: which joint (0..5), to offer the robot's present angle. */
  joint?: number;
  live: Live;
}) {
  const [open, setOpen] = useState<{ left: number; top: number } | null>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' || e.key === 'Enter' : !box.current?.contains(e.target as Node) && !chip.current?.contains(e.target as Node)) setOpen(null);
    };
    // A window resize moves the chip (close), but not the on-screen keyboard opening for its own field.
    const away = () => {
      if (!box.current?.contains(document.activeElement)) setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', away);
    };
  }, [open]);
  const set = (v: number) => {
    const r = Math.round(Math.min(max, Math.max(min, v)) / step) * step;
    const clean = Number(r.toFixed(2));
    if (clean !== value) onChange(clean);
  };
  const big = step < 1 ? 1 : (max - min) > 100 ? 10 : 5;
  const small = step;
  return (
    <>
      <button
        ref={chip}
        type="button"
        className={css.numChip}
        aria-label={`${label}: ${value}${unit}`}
        aria-expanded={!!open}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (open) return setOpen(null);
          const r = chip.current!.getBoundingClientRect();
          setOpen({ left: Math.min(window.innerWidth - 250, Math.max(8, r.left - 20)), top: Math.min(window.innerHeight - 190, r.bottom + 6) });
        }}
      >
        {value}
        {unit}
      </button>
      {open && (
        <div
          ref={box}
          className={css.numPop}
          style={{ left: open.left, top: open.top }}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={label}
        >
          <div className={css.numPopHead}>
            <span>{label}</span>
            <b>
              {value}
              {unit}
            </b>
          </div>
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} aria-label={label} />
          <div className={css.numPopKeys}>
            <button type="button" onClick={() => set(value - big)}>−{big}</button>
            <button type="button" onClick={() => set(value - small)}>−{small}</button>
            <input
              type="number"
              step="any"
              value={value}
              aria-label={`${label} 직접 입력`}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (e.target.value !== '' && Number.isFinite(v)) set(v);
              }}
            />
            <button type="button" onClick={() => set(value + small)}>+{small}</button>
            <button type="button" onClick={() => set(value + big)}>+{big}</button>
          </div>
          <div className={css.numPopFoot}>
            <span>
              {min}
              {unit} ~ {max}
              {unit}
            </span>
            {joint !== undefined && <NowButton live={live} joint={joint} unit={unit} onSet={set} />}
          </div>
        </div>
      )}
    </>
  );
}
