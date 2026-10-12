'use client';

/**
 * 로봇 실습 7: the seven acceptance checks as seven easy practices (engine/education/practice7.ts).
 * One screen: the unit tabs on top, a plain white panel on the left and the 3D arm, as large as it can be,
 * on the right. The panel shows one part at a time (알아보기 · 따라 하기 · 문제 · 실물로 · 결과, picked
 * from a row of tabs; the part to do now opens by itself). Colour only marks the parts apart and what
 * matters now: the step to press, the main button, right or wrong. Every 따라 하기 plays in 3D; 실물로
 * does the same on the connected robot and writes what was measured into the 검수 기록 (the console's
 * result sheet).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Quaternion, Vector3 } from 'three';

import {
  PARTS,
  PHOTO_DEG,
  READY_DEG,
  REPEAT_POINT,
  REPEAT_TIMES,
  TOOL_MOVES,
  UNITS,
  UNIT_BY_ID,
  WAVE,
  emptyProgress,
  findColours,
  pickPlace,
  quizRight,
  repeatPoses,
  sortPlan,
  spreadMm,
  stars,
  swingPoses,
  toActions,
  unitDone,
  type Found,
  type Move,
  type Part,
  type Unit,
  type UnitId,
  type UnitProgress,
} from '@/engine/education/practice7';
import type { ChainSegment } from '@/engine/robot/kinematics';
import { jointMoveDuration } from '@/engine/robot/motion';
import type { UrdfRobot } from '@/engine/robot/urdf';
import type { BlockPose } from '@/engine/physics/physics';
import { BINS, BLOCK_MM, BLOCK_START, COLOR_HEX, COLORS, HOME_DEG, TOP_CAMERA, type ColorName } from '@/engine/simulator/board';
import { tcpFor, type EffectorId } from '@/engine/simulator/effectors';
import { loadEvidence, saveEvidence } from '@/engine/simulator/evidence';
import { aiOnRobot, cameraFrameUrl, fetchRobotState, handVisionOnRobot, type RobotAi } from '@/engine/simulator/robotLink';

import Icon from '../../simulator/Icon';
import type { RealArm } from '../lessons';
import LearnStage, { type LearnScene, type ViewPose } from '../stage/LearnStage';
import { LEARN_SPEED, ease, lerpQ, tipOf, type Mm } from '../topics/kit';
import css from './practice7.module.css';

/** The console's accent (--accent): the 3D view's labels in the screen's one colour. */
const ACCENT = '#3454d1';

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  real: RealArm;
  hidden?: boolean;
  /** Teachers see one line of advice per unit. */
  teacher: boolean;
  onBack(): void;
}

const KEY = 'practice7-progress';
const UNIT_KEY = 'practice7-unit';

type Progress = Record<UnitId, UnitProgress>;

function readProgress(): Progress {
  const base = Object.fromEntries(UNITS.map((u) => [u.id, emptyProgress()])) as Progress;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Progress>;
    for (const u of UNITS) if (v[u.id]) base[u.id] = { ...emptyProgress(), ...v[u.id] };
  } catch {
    /* fresh */
  }
  return base;
}

function readUnit(): UnitId {
  try {
    const u = Number(localStorage.getItem(UNIT_KEY));
    return UNIT_BY_ID.has(u as UnitId) ? (u as UnitId) : 1;
  } catch {
    return 1;
  }
}

function writeProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private window: this visit only */
  }
}

/** One line in the 검수 기록 the console's result sheet is made from. */
function note(check: number, text: string, robot: boolean) {
  saveEvidence([...loadEvidence(), { check, at: new Date().toISOString(), text: `로봇 실습 7 · ${text}`, robot }]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** The kit's bins as open boxes (four walls each), for the 3D view. */
const BIN_WALLS = Object.values(BINS).flatMap((b) => {
  const { x, y, sx, sy } = b.outer;
  const t = 3;
  const h = b.rimZ;
  const wall = (x0: number, y0: number, x1: number, y1: number) => ({ min: [x0, y0, 0] as Mm, max: [x1, y1, h] as Mm, color: '#94a3b8' });
  return [
    wall(x - sx / 2, y - sy / 2, x + sx / 2, y - sy / 2 + t),
    wall(x - sx / 2, y + sy / 2 - t, x + sx / 2, y + sy / 2),
    wall(x - sx / 2, y - sy / 2, x - sx / 2 + t, y + sy / 2),
    wall(x + sx / 2 - t, y - sy / 2, x + sx / 2, y + sy / 2),
  ];
});
const BIN_LABELS = Object.values(BINS).map((b) => ({ key: `bin${b.name}`, mm: [b.outer.x, b.outer.y, b.rimZ + 18] as Mm, text: `상자 ${b.name}`, color: '#475569' }));

type Blocks = Record<ColorName, Mm>;
const startBlocks = (): Blocks => Object.fromEntries(COLORS.map((c) => [c.name, [BLOCK_START[c.name].x, BLOCK_START[c.name].y, BLOCK_MM / 2]])) as Blocks;

/** Robot frame (mm, z up) → the 3D view's camera pose (metres, y up). */
const three = (p: Mm): [number, number, number] => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
const KIT_CAM: ViewPose = [TOP_CAMERA.x / 1000, 0.72, -TOP_CAMERA.y / 1000 + 0.004, TOP_CAMERA.x / 1000, 0, -TOP_CAMERA.y / 1000];

const UNIT_HOME: Record<UnitId, { pose: number[]; tool: EffectorId; kit: boolean }> = {
  1: { pose: READY_DEG, tool: 'none', kit: false },
  2: { pose: HOME_DEG, tool: 'pump', kit: false },
  3: { pose: HOME_DEG, tool: 'pump', kit: true },
  4: { pose: HOME_DEG, tool: 'pump', kit: true },
  5: { pose: HOME_DEG, tool: 'adaptive', kit: true },
  6: { pose: HOME_DEG, tool: 'pump', kit: true },
  7: { pose: [0, 0, 0, 0, 0, 0], tool: 'none', kit: false },
};

/** The first view of each kind of unit: the arm alone, or the arm over the kit's board. */
const VIEW_ARM: ViewPose = [0.62, 0.48, 0.62, 0.02, 0.16, 0];
const VIEW_KIT: ViewPose = [0.68, 0.62, 0.42, 0.13, 0.04, 0];
/** Unit 7 waves with the arm upright (about 45 cm tall): drawn back to take it all in. */
const VIEW_TALL: ViewPose = [0.8, 0.5, 0.8, 0, 0.22, 0];

export default function Practice7({ robot, chain, gripperRobot, real, hidden, teacher, onBack }: Props) {
  const [unitId, setUnitIdRaw] = useState<UnitId>(readUnit);
  const [progress, setProgress] = useState<Progress>(readProgress);
  const setUnitId = (id: UnitId) => {
    setUnitIdRaw(id);
    try {
      localStorage.setItem(UNIT_KEY, String(id));
    } catch {
      /* not remembered */
    }
  };
  const update = (id: UnitId, f: (p: UnitProgress) => UnitProgress) =>
    setProgress((old) => {
      const before = old[id];
      const after = f(before);
      if (after === before) return old;
      const u = UNIT_BY_ID.get(id)!;
      if (unitDone(u, after) && !unitDone(u, before)) note(u.check, `${u.title}: 시뮬레이션 따라 하기 · 문제 완료`, false);
      const next = { ...old, [id]: after };
      writeProgress(next);
      return next;
    });

  return (
    <div className={css.p7} hidden={hidden}>
      <header className={css.bar}>
        <button type="button" className={css.back} onClick={onBack}>
          ← 교육 홈
        </button>
        <div className={css.title}>
          <b>로봇 실습 7</b>
          <small>검수 7가지를 하나씩, 시뮬레이션으로 해 보고 실물 로봇으로</small>
        </div>
        <nav className={css.tabs} aria-label="실습 고르기">
          {UNITS.map((u) => {
            const st = stars(u, progress[u.id]);
            return (
              <button key={u.id} type="button" aria-current={u.id === unitId || undefined} data-done={unitDone(u, progress[u.id]) || undefined} onClick={() => setUnitId(u.id)} title={`${u.id}. ${u.title}`}>
                <i>{unitDone(u, progress[u.id]) ? '✓' : u.id}</i>
                <span>
                  <b>{u.title}</b>
                  <small aria-label={`별 ${st}개`}>
                    {'★'.repeat(st)}
                    {'☆'.repeat(3 - st)}
                  </small>
                </span>
              </button>
            );
          })}
        </nav>
      </header>
      <UnitView
        key={unitId}
        unit={UNIT_BY_ID.get(unitId)!}
        prog={progress[unitId]}
        update={(f) => update(unitId, f)}
        onNext={setUnitId}
        robot={robot}
        chain={chain}
        gripperRobot={gripperRobot}
        real={real}
        hidden={hidden}
        teacher={teacher}
      />
    </div>
  );
}

interface UnitProps {
  unit: Unit;
  prog: UnitProgress;
  update(f: (p: UnitProgress) => UnitProgress): void;
  onNext(id: UnitId): void;
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  real: RealArm;
  hidden?: boolean;
  teacher: boolean;
}

/** One unit: its own 3D scene, panel and robot state (remounted on every unit change, so all of it starts fresh). */
function UnitView({ unit, prog, update, onNext, robot, chain, gripperRobot, real, hidden, teacher }: UnitProps) {
  const unitId = unit.id;
  const markStep = (step: string) => update((p) => (p.steps.includes(step) ? p : { ...p, steps: [...p.steps, step] }));
  const answer = (qi: number, choice: number) =>
    update((p) => {
      if (p.quiz[qi] === unit.quiz[qi].answer) return p;
      const quiz = p.quiz.slice();
      quiz[qi] = choice;
      return { ...p, quiz };
    });
  const realDone = (text: string) => {
    note(unit.check, `${unit.title}: ${text}`, true);
    update((p) => ({ ...p, real: { at: new Date().toISOString(), text } }));
  };

  /* --- the 3D scene ----------------------------------------------------------------------------- */
  const home = UNIT_HOME[unitId];
  const [pose, setPoseState] = useState<number[]>(() => home.pose.slice());
  const poseRef = useRef<number[]>(home.pose.slice());
  const setPose = useCallback((q: number[]) => {
    poseRef.current = q;
    setPoseState(q);
  }, []);
  const [tool, setTool] = useState<EffectorId>(home.tool);
  const [pumpOn, setPumpOn] = useState(false);
  const [blocks, setBlocks] = useState<Blocks>(startBlocks);
  const [carry, setCarry] = useState<{ color: ColorName; tool: 'pump' | 'adaptive' } | null>(null);
  const carryRef = useRef(carry);
  useEffect(() => {
    carryRef.current = carry;
  }, [carry]);
  const [extra, setExtra] = useState<Pick<LearnScene, 'target' | 'lines' | 'labels'>>({});
  const [focus, setFocus] = useState<ViewPose | null>(null);
  const [busy, setBusy] = useState(false);
  const [say, setSay] = useState('');
  /** Bumped on every unit change: a running animation sees it and stops. */
  const token = useRef(0);

  // Leaving the unit (or the screen) stops a running animation.
  useEffect(
    () => () => {
      token.current += 1;
    },
    [],
  );

  /** Glide the arm to `to` at the simulator's speed (never faster), the carried block along; false when interrupted. */
  const glide = useCallback(
    (to: readonly number[], minS = 0.5): Promise<boolean> => {
      const my = token.current;
      const from = poseRef.current.slice();
      const T = Math.max(minS, jointMoveDuration(from, to, LEARN_SPEED));
      return new Promise((resolve) => {
        let t0 = -1;
        const tick = (now: number) => {
          if (my !== token.current) return resolve(false);
          if (t0 < 0) t0 = now;
          const u = Math.min(1, (now - t0) / 1000 / T);
          const q = lerpQ(from, to, ease(u));
          setPose(q);
          const c = carryRef.current;
          if (c) {
            const tip = tipOf(chain, q, tcpFor(c.tool, false));
            const z = c.tool === 'pump' ? tip[2] - BLOCK_MM / 2 : tip[2];
            setBlocks((b) => ({ ...b, [c.color]: [tip[0], tip[1], z] }));
          }
          if (u < 1) requestAnimationFrame(tick);
          else resolve(true);
        };
        requestAnimationFrame(tick);
      });
    },
    [chain, setPose],
  );

  /** Play a pick-and-place list: glide to each pose, switch the tool there, carry and drop the block. */
  const playMoves = useCallback(
    async (moves: readonly Move[], toolKind: 'pump' | 'adaptive', onDrop?: (c: ColorName) => void) => {
      const my = token.current;
      for (const m of moves) {
        setSay(m.say);
        if (!(await glide(m.angles))) return false;
        if (m.tool === 'on') {
          const held = m.carry ?? null;
          if (toolKind === 'pump') setPumpOn(true);
          if (held) {
            const c = { color: held, tool: toolKind };
            carryRef.current = c;
            setCarry(c);
          }
          await sleep(250);
        } else if (m.tool === 'off') {
          const c = carryRef.current;
          if (toolKind === 'pump') setPumpOn(false);
          carryRef.current = null;
          setCarry(null);
          if (c) {
            // Let it settle on what is under it: a bin's floor, or the board.
            const tip = tipOf(chain, poseRef.current, tcpFor(toolKind, false));
            setBlocks((b) => ({ ...b, [c.color]: [tip[0], tip[1], BLOCK_MM / 2] }));
            onDrop?.(c.color);
          }
          await sleep(250);
        }
        if (my !== token.current) return false;
      }
      setSay('');
      return true;
    },
    [glide, chain],
  );

  const scene = useMemo<LearnScene>(() => {
    const kit = UNIT_HOME[unitId].kit;
    const q = new Quaternion();
    const blockPoses: BlockPose[] = kit
      ? COLORS.map((c) => ({ id: c.name, color: c.hex, size: BLOCK_MM, at: new Vector3(...blocks[c.name]), q, held: carry?.color === c.name }))
      : [];
    return {
      angles: pose,
      tool,
      pumpOn,
      blocks: blockPoses,
      boxes: kit ? BIN_WALLS : [],
      labels: [...(kit ? BIN_LABELS : []), ...(extra.labels ?? []), ...(say ? [{ key: 'say', mm: [...tipOf(chain, pose, tcpFor(tool === 'none' ? 'pump' : tool, false)).slice(0, 2), tipOf(chain, pose, 0)[2] + 60] as Mm, text: say, color: ACCENT }] : [])],
      target: extra.target ?? null,
      lines: extra.lines ?? [],
    };
  }, [unitId, pose, tool, pumpOn, blocks, carry, extra, say, chain]);

  /** The 3D view as a picture (the view must be drawn from where the camera is first). */
  const stageRef = useRef<HTMLDivElement>(null);
  const snapshot = async (view: ViewPose): Promise<string | null> => {
    setFocus(view);
    await sleep(1300);
    const c = stageRef.current?.querySelector('canvas');
    let url: string | null = null;
    if (c) {
      // A 4:3 picture from the middle of the view, like a camera's.
      const w = c.width;
      const h = c.height;
      const cw = Math.min(w, (h * 4) / 3);
      const out = document.createElement('canvas');
      out.width = 640;
      out.height = 480;
      out.getContext('2d')?.drawImage(c, (w - cw) / 2, 0, cw, h, 0, 0, 640, 480);
      url = out.toDataURL('image/jpeg', 0.85);
    }
    setFocus(null);
    return url;
  };

  /* --- unit state for the panel --------------------------------------------------------------- */
  const [arrivals, setArrivals] = useState<Mm[]>([]);
  const [photos, setPhotos] = useState<{ top?: string; hand?: string }>({});
  const [found, setFound] = useState<Found[] | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [line, setLine] = useState(-1);
  const run = async (f: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };

  /** 따라 하기: what each step's button does in the simulator. */
  const doStep = (id: string) =>
    run(async () => {
      const my = token.current;
      const ok = () => my === token.current;
      if (unitId === 1) {
        const j = Number(id.slice(1)) - 1;
        for (const q of swingPoses(j).slice(1)) if (!(await glide(q, 0.7))) return;
      } else if (unitId === 2) {
        const r = repeatPoses(chain);
        if (!r) return;
        if (id === 'show') {
          setExtra({ target: { mm: REPEAT_POINT, ok: true, label: '목표 점' } });
          await glide(r.home);
        } else {
          let pts: Mm[] = [];
          setExtra((e) => ({ ...e, target: { mm: REPEAT_POINT, ok: true, label: '목표 점' } }));
          for (let k = 0; k < REPEAT_TIMES; k++) {
            setSay(`${k + 1} / ${REPEAT_TIMES}`);
            if (!(await glide(r.at))) return;
            pts = [...pts, tipOf(chain, poseRef.current, tcpFor('pump', false))];
            setArrivals(pts);
            if (!(await glide(r.home))) return;
          }
          setSay('');
        }
      } else if (unitId === 3) {
        if (id === 'top') {
          if (!(await glide(HOME_DEG))) return;
          const url = await snapshot(KIT_CAM);
          if (url) setPhotos((p) => ({ ...p, top: url }));
        } else {
          if (!(await glide(PHOTO_DEG))) return;
          const tip = tipOf(chain, PHOTO_DEG, tcpFor('pump', false));
          // The hand camera sits beside the tool and looks where the tool points: just under its tip, straight down.
          const cam: Mm = [tip[0], tip[1], tip[2] - 15];
          const url = await snapshot([...three(cam), ...three([cam[0] + 1, cam[1], 0])] as unknown as ViewPose);
          if (url) setPhotos((p) => ({ ...p, hand: url }));
        }
      } else if (unitId === 4) {
        if (id === 'find') {
          setExtra({
            labels: COLORS.map((c) => ({ key: `f${c.name}`, mm: [blocks[c.name][0], blocks[c.name][1], BLOCK_MM + 22] as Mm, text: `${c.name} (${Math.round(blocks[c.name][0])}, ${Math.round(blocks[c.name][1])})`, color: c.hex })),
          });
        } else {
          setExtra({});
          const where = Object.fromEntries(COLORS.map((c) => [c.name, { x: blocks[c.name][0], y: blocks[c.name][1] }])) as Record<ColorName, { x: number; y: number }>;
          const plan = sortPlan(chain, where);
          if (!plan) return setSay('로봇이 닿지 않는 블록이 있어요');
          if (!(await playMoves(plan, 'pump'))) return;
        }
      } else if (unitId === 5) {
        const pick = async (k: 0 | 1) => {
          const t = TOOL_MOVES[k];
          const plan = pickPlace(chain, t.tool, t.color, { x: blocks[t.color][0], y: blocks[t.color][1] }, { bin: false, ...t.to });
          if (!plan) return false;
          return (await playMoves(plan, t.tool)) && (await glide(HOME_DEG));
        };
        if (id === 'grip') {
          setTool('adaptive');
          if (!(await pick(0))) return;
        } else if (id === 'swap') {
          if (!(await glide(HOME_DEG))) return;
          setSay('도구를 빼고…');
          setTool('none');
          await sleep(900);
          if (!ok()) return;
          setSay('흡착 펌프 끼우기!');
          setTool('pump');
          await sleep(900);
          setSay('');
        } else {
          setTool('pump');
          if (!(await pick(1))) return;
        }
      } else if (unitId === 6) {
        if (id === 'shot') {
          if (!(await glide(HOME_DEG))) return;
          const url = await snapshot(KIT_CAM);
          if (url) {
            setShot(url);
            setFound(null);
          }
        } else {
          const url = shot ?? (await snapshot(KIT_CAM));
          if (!url) return;
          setShot(url);
          setFound(await detect(url));
        }
      } else if (unitId === 7) {
        if (id === 'line') {
          for (let k = 0; k < WAVE.length; k++) {
            setLine(k);
            if (!(await glide(WAVE[k].angles, 0.8))) return;
            await sleep(250);
          }
          setLine(-1);
        }
      }
      if (ok()) markStep(id);
    });

  // Steps that need the one before: shown greyed until then.
  const stepOpen = (i: number) => i === 0 || unitId === 1 || prog.steps.includes(unit.steps[i - 1].id);

  /* --- 실물로 ------------------------------------------------------------------------------------ */
  const [realMsg, setRealMsg] = useState('');
  const [realBusy, setRealBusy] = useState(false);
  const [cams, setCams] = useState(0);
  const [handCam, setHandCam] = useState(0);
  const [realShots, setRealShots] = useState<string[]>([]);
  const [realAi, setRealAi] = useState<RobotAi | null>(null);
  const [realFound, setRealFound] = useState<Partial<Record<ColorName, { x: number; y: number }>> | null>(null);
  const [realPlanOk, setRealPlanOk] = useState(false);
  const [swapped, setSwapped] = useState(false);
  useEffect(() => {
    if (!real.online || hidden) return;
    let alive = true;
    void fetchRobotState().then((s) => {
      if (!alive || !s) return;
      const n = s.camera ? Math.max(1, s.cameras ?? 1) : 0;
      setCams(n);
      setHandCam(n >= 2 ? 1 : 0);
    });
    return () => {
      alive = false;
    };
  }, [real.online, hidden, unitId]);

  /** Send one pose and wait until the arm is there (or 12 s): the angles it stopped at. */
  const moveAndWait = useCallback(
    async (to: readonly number[], speed = 25): Promise<number[] | null> => {
      const r = await real.move(to.slice(), speed);
      if (!r.ok) throw new Error(r.error ?? '로봇이 받지 않았어요.');
      const t0 = Date.now();
      let last: number[] | null = null;
      while (Date.now() - t0 < 12000) {
        await sleep(150);
        last = real.now();
        if (last && Math.max(...last.map((a, i) => Math.abs(a - to[i]))) < 1.0) break;
      }
      await sleep(300);
      return real.now() ?? last;
    },
    [real],
  );

  const realRun = (f: () => Promise<void>) => async () => {
    if (realBusy || !real.online) return;
    setRealBusy(true);
    setRealMsg('로봇이 움직여요…');
    try {
      await f();
    } catch (e) {
      setRealMsg(`멈췄어요: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRealBusy(false);
    }
  };

  const real1 = realRun(async () => {
    await moveAndWait(READY_DEG);
    const errs: number[] = [];
    for (let j = 0; j < 6; j++) {
      setRealMsg(`J${j + 1} 움직이는 중 (${j + 1} / 6)`);
      let worst = 0;
      for (const q of swingPoses(j).slice(1)) {
        const got = await moveAndWait(q);
        if (got) worst = Math.max(worst, Math.abs(got[j] - q[j]));
      }
      errs.push(worst);
    }
    const k = errs.indexOf(Math.max(...errs));
    const text = `관절 6개 모두 ±30° 움직임 · 명령과 잰 각도 차이 최대 J${k + 1} ${r1(errs[k])}°`;
    setRealMsg(text);
    realDone(text);
  });

  const real2 = realRun(async () => {
    const r = repeatPoses(chain);
    if (!r) throw new Error('목표 점 자세를 계산하지 못했어요.');
    await moveAndWait(r.home);
    let pts: Mm[] = [];
    for (let k = 0; k < REPEAT_TIMES; k++) {
      setRealMsg(`${k + 1} / ${REPEAT_TIMES} 번째 도착`);
      const got = await moveAndWait(r.at);
      if (got) pts = [...pts, tipOf(chain, got, tcpFor('pump', false))];
      const marks = pts.flatMap((p) => [[p[0] - 3, p[1], p[2]], [p[0] + 3, p[1], p[2]]] as Mm[]);
      setExtra((e) => ({ ...e, lines: [{ key: 'real', points: marks, color: '#7c3aed', width: 3, segments: true }] }));
      await moveAndWait(r.home);
    }
    const s = spreadMm(pts);
    const text = `같은 점에 ${pts.length}번 도착 · 흩어진 폭 ${r1(s)} mm (잰 각도로 계산)`;
    setRealMsg(text);
    realDone(text);
  });

  const real3 = realRun(async () => {
    const n = Math.max(1, cams);
    const urls = Array.from({ length: Math.min(2, n) }, (_, i) => cameraFrameUrl(i));
    const sizes = await Promise.all(
      urls.map(
        (u) =>
          new Promise<string | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(`${img.naturalWidth}×${img.naturalHeight}`);
            img.onerror = () => resolve(null);
            img.src = u;
          }),
      ),
    );
    setRealShots(urls.filter((_, i) => sizes[i]));
    const got = sizes.filter(Boolean);
    if (!got.length) throw new Error('카메라 사진을 받지 못했어요. 카메라 USB 를 확인해 주세요.');
    const text = `실제 카메라 ${got.length}대로 사진 (${got.join(', ')})`;
    setRealMsg(got.length < 2 ? `${text}. 검수에는 2대가 필요해요: 두 번째 카메라를 꽂아 주세요.` : text);
    realDone(text);
  });

  const real4find = realRun(async () => {
    setRealMsg('손 카메라 자세로 가요…');
    await moveAndWait(PHOTO_DEG);
    setRealMsg('로봇이 손 카메라 사진으로 블록 자리를 계산해요…');
    const r = await handVisionOnRobot(handCam, BLOCK_MM);
    if (!r.ok) throw new Error(r.error ?? '찾지 못했어요.');
    const where: Partial<Record<ColorName, { x: number; y: number }>> = {};
    for (const d of r.detections) if (d.x !== undefined && d.y !== undefined && d.color in COLOR_HEX) where[d.color as ColorName] = { x: d.x, y: d.y };
    const list = Object.entries(where) as [ColorName, { x: number; y: number }][];
    if (!list.length) throw new Error('블록을 찾지 못했어요. 블록이 손 카메라 화면에 보이게 놓고 다시 눌러 주세요.');
    setRealFound(where);
    setRealPlanOk(false);
    // The 3D board shows the real blocks where the robot found them.
    setBlocks((b) => {
      const next = { ...b };
      for (const [c, p] of list) next[c] = [p.x, p.y, BLOCK_MM / 2];
      return next;
    });
    setExtra({ labels: list.map(([c, p]) => ({ key: `r${c}`, mm: [p.x, p.y, BLOCK_MM + 22] as Mm, text: `${c} (${Math.round(p.x)}, ${Math.round(p.y)})`, color: COLOR_HEX[c] })) });
    setRealMsg(`블록 ${list.length}개를 찾았어요 (${r.ms} ms). 먼저 [시뮬레이션으로 확인] 을 눌러요.`);
    note(4, `${unit.title}: 실제 손 카메라로 블록 ${list.length}개 찾음 ${list.map(([c, p]) => `${c}(${Math.round(p.x)}, ${Math.round(p.y)})`).join(' ')}`, true);
  });

  const real4check = () =>
    run(async () => {
      if (!realFound) return;
      const plan = sortPlan(chain, realFound);
      if (!plan) return setRealMsg('로봇이 닿지 않는 블록이 있어요. 블록을 작업판 가운데로 옮겨 다시 찾아 주세요.');
      setExtra({});
      if (await playMoves(plan, 'pump')) {
        setRealPlanOk(true);
        setRealMsg('시뮬레이션에서 문제없어요. 이제 [실물로 옮기기] 를 눌러요.');
      }
    });

  const real4move = realRun(async () => {
    if (!realFound || !realPlanOk) return;
    const plan = sortPlan(chain, realFound);
    if (!plan) throw new Error('자세를 계산하지 못했어요.');
    await moveAndWait(HOME_DEG);
    const r = await real.run(toActions(plan, 'pump'));
    if (!r.ok) throw new Error(r.error ?? '로봇이 받지 않았어요.');
    const n = Object.keys(realFound).length;
    const text = `실제 블록 ${n}개를 찾아 색깔별 상자로 옮기기 실행 (시뮬레이션 확인 뒤)`;
    setRealMsg(`${text}. 로봇이 다 옮길 때까지 지켜봐요.`);
    realDone(text);
  });

  const real5grip = realRun(async () => {
    const a = await real.grip(true);
    if (!a.ok) throw new Error(a.error ?? '그리퍼가 답하지 않아요.');
    await sleep(1500);
    const b = await real.grip(false);
    if (!b.ok) throw new Error(b.error ?? '그리퍼가 답하지 않아요.');
    await sleep(800);
    setRealMsg('그리퍼 열기 · 닫기 ✓ 이제 흡착 펌프로 바꿔 끼워요.');
  });

  const real5pump = realRun(async () => {
    const a = await real.pump(true);
    if (!a.ok) throw new Error(a.error ?? '펌프가 답하지 않아요.');
    await sleep(2000);
    const b = await real.pump(false);
    if (!b.ok) throw new Error(b.error ?? '펌프가 답하지 않아요.');
    const text = '그리퍼 열기 · 닫기, 흡착 펌프로 바꿔 끼운 뒤 켜기 · 끄기';
    setRealMsg(`${text} ✓`);
    realDone(text);
  });

  const real6 = realRun(async () => {
    setRealMsg('로봇 안에서 AI 모델을 돌려요… 처음 한 번은 몇 초 걸려요.');
    const r = await aiOnRobot(0);
    if (!r.ok) throw new Error(r.error ?? 'AI 샘플을 실행하지 못했어요.');
    setRealAi(r);
    const names = r.detections.map((d) => `${d.label} ${Math.round(d.score * 100)}%`).join(', ') || '찾은 물체 없음';
    const text = `로봇 안 AI(YOLOv5s) ${r.ms} ms · ${names}`;
    setRealMsg(text);
    realDone(text);
  });

  const real7 = realRun(async () => {
    await moveAndWait(WAVE[0].angles, 30);
    const r = await real.run(WAVE.map((w, i) => ({ type: 'angles' as const, angles: w.angles.slice(), speed: 30, line: i + 1 })));
    if (!r.ok) throw new Error(r.error ?? '로봇이 받지 않았어요.');
    const text = `파이썬 API 명령 ${WAVE.length}줄을 로봇에서 실행`;
    setRealMsg(text);
    realDone(text);
  });

  const stopReal = () => {
    token.current += 1;
    void real.stop();
    setRealMsg('멈췄어요.');
  };

  /* --- the panel ------------------------------------------------------------------------------ */
  const allSteps = unit.steps.every((s) => prog.steps.includes(s.id));
  const quizOk = quizRight(unit, prog) === unit.quiz.length;
  const nowPart: Part = !allSteps ? 'do' : !quizOk ? 'quiz' : !prog.real ? 'real' : 'done';
  // The unit opens at the part to do now; after that the student moves on (the tabs, or the
  // 다음 button a finished part shows), so a result just made never vanishes under them.
  const [shown, setShown] = useState<Part>(nowPart);
  // The one step to press next (the others stay plain): the first open one not done yet.
  const nextStep = unit.steps.findIndex((s, i) => stepOpen(i) && !prog.steps.includes(s.id));
  const partDone: Record<Part, boolean> = { look: true, do: allSteps, quiz: quizOk, real: !!prog.real, done: false };
  const next = UNITS.find((u) => u.id === unitId + 1);
  const code = useMemo(() => ['from pymycobot import MyCobot280RDKX5', '', 'mc = MyCobot280RDKX5("/dev/ttyS1", 1000000)', ...WAVE.map((w) => w.line)], []);

  return (
    <>
      <div className={css.body}>
        <aside className={css.panel} aria-label={`${unit.id}. ${unit.title}`}>
          <div className={css.unitHead}>
            <small>
              실습 {unit.id} · 검수 {unit.check}
            </small>
            <h2>{unit.title}</h2>
            <span className={css.unitStars} aria-label={`별 ${stars(unit, prog)}개`}>
              {'★'.repeat(stars(unit, prog))}
              {'☆'.repeat(3 - stars(unit, prog))}
            </span>
          </div>
          <p className={css.about}>{unit.about}</p>
          <div className={css.path} role="tablist" aria-label="순서">
            {PARTS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === shown}
                data-now={p.id === nowPart || undefined}
                style={{ '--k': p.color } as CSSProperties}
                onClick={() => setShown(p.id)}
                title={p.id === nowPart ? '지금 할 차례' : undefined}
              >
                <i>{i + 1}</i>
                {p.name}
              </button>
            ))}
          </div>

          <Section part="look" shown={shown} finished={partDone.look} onNext={setShown}>
            <p className={css.like}>
              <em>이렇게 생각해요</em>
              {unit.like}
            </p>
            <p className={css.site}>
              <em>실제 현장</em>
              {unit.site}
            </p>
          </Section>

          <Section part="do" shown={shown} now={nowPart === 'do'} finished={partDone.do} onNext={setShown}>
            <div className={css.steps} data-grid={unit.steps.length > 3 || undefined}>
              {unit.steps.map((s, i) => {
                const done = prog.steps.includes(s.id);
                return (
                  <button key={s.id} type="button" className={css.step} data-done={done || undefined} data-next={i === nextStep || undefined} disabled={busy || !stepOpen(i)} onClick={() => void doStep(s.id)}>
                    <i>{done ? '✓' : i + 1}</i>
                    <span>
                      <b>{s.label}</b>
                      <small>{s.hint}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <DoExtra unitId={unitId} arrivals={arrivals} photos={photos} shot={shot} found={found} line={line} code={code} />
          </Section>

          <Section part="quiz" shown={shown} now={nowPart === 'quiz'} finished={partDone.quiz} onNext={setShown}>
            {unit.quiz.map((q, qi) => {
              const got = prog.quiz[qi];
              const right = got === q.answer;
              return (
                <div key={qi} className={css.q}>
                  <p>
                    <b>Q{qi + 1}.</b> {q.q}
                  </p>
                  <div className={css.opts} data-ox={q.options.length === 2 || undefined}>
                    {q.options.map((o, oi) => (
                      <button
                        key={oi}
                        type="button"
                        data-pick={got === oi || undefined}
                        data-right={(got === oi && right) || undefined}
                        data-wrong={(got === oi && !right) || undefined}
                        disabled={right}
                        onClick={() => answer(qi, oi)}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                  {got !== null && (
                    <p className={css.why} data-ok={right || undefined}>
                      {right ? '맞아요! ' : '다시 골라 봐요. '}
                      {right ? q.why : '힌트: 위의 "알아보기" 를 다시 읽어 봐요.'}
                    </p>
                  )}
                </div>
              );
            })}
          </Section>

          <Section part="real" shown={shown} now={nowPart === 'real'} finished={partDone.real} onNext={setShown}>
            <p className={css.realDoes}>{unit.real.does}</p>
            <p className={css.ready}>
              <b>준비</b> {unit.real.ready}
            </p>
            {!real.online ? (
              <p className={css.offline}>
                지금은 시뮬레이션이에요. 위쪽 <b>[로봇 연결]</b> 로 로봇을 연결하면 여기서 바로 실물로 해 볼 수 있어요.
              </p>
            ) : (
              <div className={css.realBtns}>
                {unitId === 1 && <RealBtn onClick={real1} busy={realBusy} label="실물로 6축 움직이기" />}
                {unitId === 2 && <RealBtn onClick={real2} busy={realBusy} label="실물로 5번 다녀오기" />}
                {unitId === 3 && <RealBtn onClick={real3} busy={realBusy} label={`실제 카메라 ${Math.max(1, Math.min(2, cams))}대로 찍기`} />}
                {unitId === 4 && (
                  <>
                    {cams >= 2 && (
                      <span className={css.camPick}>
                        손 카메라:
                        {[0, 1].map((i) => (
                          <button key={i} type="button" aria-pressed={handCam === i} onClick={() => setHandCam(i)}>
                            {i + 1}번
                          </button>
                        ))}
                      </span>
                    )}
                    <RealBtn onClick={real4find} busy={realBusy} label="① 실제 블록 찾기" />
                    <button type="button" className={css.simBtn} disabled={!realFound || busy || realBusy} onClick={() => void real4check()}>
                      ② 시뮬레이션으로 확인
                    </button>
                    <RealBtn onClick={real4move} busy={realBusy} disabled={!realPlanOk} label="③ 실물로 옮기기" />
                  </>
                )}
                {unitId === 5 && (
                  <>
                    <RealBtn onClick={real5grip} busy={realBusy} label="① 그리퍼 열기 · 닫기" />
                    <label className={css.swap}>
                      <input type="checkbox" checked={swapped} onChange={(e) => setSwapped(e.target.checked)} /> 흡착 펌프로 바꿔 끼웠어요
                    </label>
                    <RealBtn onClick={real5pump} busy={realBusy} disabled={!swapped} label="② 펌프 켜기 · 끄기" />
                  </>
                )}
                {unitId === 6 && <RealBtn onClick={real6} busy={realBusy} label="로봇 안에서 AI 실행" />}
                {unitId === 7 && <RealBtn onClick={real7} busy={realBusy} label="같은 코드를 실물로 실행" />}
                {realBusy && (
                  <button type="button" className={css.stop} onClick={stopReal}>
                    ■ 멈추기
                  </button>
                )}
              </div>
            )}
            {realMsg && <p className={css.realMsg}>{realMsg}</p>}
            {realShots.length > 0 && (
              <div className={css.pics}>
                {realShots.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt={`실제 카메라 ${i + 1} 사진`} />
                ))}
              </div>
            )}
            {realAi?.image && (
              <div className={css.pics}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={realAi.image} alt="로봇 AI 가 찾은 물체" />
              </div>
            )}
            <p className={css.records}>
              <em>기록하는 것</em> {unit.real.records}
            </p>
          </Section>

          <Section part="done" shown={shown} now={nowPart === 'done'} finished={partDone.done} onNext={setShown}>
            <ul className={css.result}>
              <li data-ok={allSteps || undefined}>{allSteps ? '✓' : '○'} 따라 하기 ({prog.steps.length} / {unit.steps.length})</li>
              <li data-ok={quizOk || undefined}>{quizOk ? '✓' : '○'} 문제 ({quizRight(unit, prog)} / {unit.quiz.length})</li>
              <li data-ok={!!prog.real || undefined}>{prog.real ? '✓' : '○'} 실물로 {prog.real ? `: ${prog.real.text}` : '(로봇을 연결하면)'}</li>
            </ul>
            {next && (
              <button type="button" className={css.next} onClick={() => onNext(next.id)}>
                다음: {next.id}. {next.title} →
              </button>
            )}
          </Section>

          {teacher && (
            <p className={css.teacher}>
              <em>선생님께</em> {unit.teacher}
            </p>
          )}
        </aside>

        <section className={css.stage} ref={stageRef} aria-label="3D 실습 화면">
          <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={hidden} home={UNIT_HOME[unitId].kit ? VIEW_KIT : unitId === 7 ? VIEW_TALL : VIEW_ARM} focus={focus} />
          <span className={css.badge}>
            {unit.id}. {unit.title}
            <small data-real={real.online || undefined}>{real.online ? '● 실물 로봇 연결됨' : '시뮬레이션'}</small>
          </span>
        </section>
      </div>
    </>
  );
}

/** One part's page: only the shown one is in the panel (the others keep their state above). */
function Section({ part, shown, now, finished, onNext, children }: { part: Part; shown: Part; now?: boolean; finished: boolean; onNext(p: Part): void; children: ReactNode }) {
  const i = PARTS.findIndex((x) => x.id === part);
  const p = PARTS[i];
  const after = PARTS[i + 1];
  if (part !== shown) return null;
  return (
    <section className={css.sec} role="tabpanel" style={{ '--k': p.color } as CSSProperties}>
      <h3>
        {p.name}
        {now && <em>지금 할 일</em>}
        {finished && part !== 'look' && <em data-ok>✓ 했어요</em>}
      </h3>
      <div className={css.secBody}>{children}</div>
      {finished && after && (
        <button type="button" className={css.onward} onClick={() => onNext(after.id)}>
          다음: {after.name} →
        </button>
      )}
    </section>
  );
}

function RealBtn({ onClick, busy, disabled, label }: { onClick: () => void; busy: boolean; disabled?: boolean; label: string }) {
  return (
    <button type="button" className={css.realBtn} disabled={busy || disabled} onClick={() => void onClick()}>
      <Icon name="robot" size={16} /> {label}
    </button>
  );
}

/** Under the 따라 하기 buttons: what the unit shows as it goes (arrivals, pictures, found blocks, code). */
function DoExtra({ unitId, arrivals, photos, shot, found, line, code }: { unitId: UnitId; arrivals: Mm[]; photos: { top?: string; hand?: string }; shot: string | null; found: Found[] | null; line: number; code: string[] }) {
  if (unitId === 2 && arrivals.length > 0)
    return (
      <p className={css.measure}>
        도착 {arrivals.length} / {REPEAT_TIMES} · 흩어진 폭 <b>{r1(spreadMm(arrivals))} mm</b>
        {arrivals.length === REPEAT_TIMES && <small>시뮬레이션은 언제나 같은 곳에 가요. 실물은 얼마일까요?</small>}
      </p>
    );
  if (unitId === 3 && (photos.top || photos.hand))
    return (
      <div className={css.pics}>
        {photos.top && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.top} alt="키트 카메라 사진 (시뮬레이션)" />
            <figcaption>키트 카메라</figcaption>
          </figure>
        )}
        {photos.hand && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.hand} alt="손 카메라 사진 (시뮬레이션)" />
            <figcaption>손 카메라</figcaption>
          </figure>
        )}
      </div>
    );
  if (unitId === 4)
    return (
      <ul className={css.found}>
        {COLORS.map((c) => (
          <li key={c.name} style={{ '--b': c.hex } as CSSProperties}>
            <i /> {c.name} → 상자 {c.name === '빨강' ? 'D' : c.name === '초록' ? 'C' : c.name === '파랑' ? 'A' : 'B'}
          </li>
        ))}
      </ul>
    );
  if (unitId === 6 && shot)
    return (
      <div className={css.aiShot}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot} alt="작업판 사진 (시뮬레이션)" />
        {found?.map((f) => (
          <span
            key={f.color}
            className={css.box}
            style={{ '--b': COLOR_HEX[f.color], left: `${(f.box.x0 / 160) * 100}%`, top: `${(f.box.y0 / 120) * 100}%`, width: `${((f.box.x1 - f.box.x0 + 1) / 160) * 100}%`, height: `${((f.box.y1 - f.box.y0 + 1) / 120) * 100}%` } as CSSProperties}
          >
            <b>
              {f.color} 블록 {Math.round(f.score * 100)}%
            </b>
          </span>
        ))}
        {found && <small>{found.length ? `찾은 것 ${found.length}개 (이 컴퓨터에서 색으로 찾기)` : '찾은 것이 없어요'}</small>}
      </div>
    );
  if (unitId === 7)
    return (
      <pre className={css.code} aria-label="파이썬 코드">
        {code.map((l, i) => (
          <code key={i} data-now={(line >= 0 && i - (code.length - WAVE.length) === line) || undefined}>
            {l || ' '}
          </code>
        ))}
      </pre>
    );
  return null;
}

/** The simulator's colour finder on a 160 × 120 copy of the picture. */
async function detect(url: string): Promise<Found[]> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 120;
  const g = c.getContext('2d');
  if (!g) return [];
  g.drawImage(img, 0, 0, 160, 120);
  const d = g.getImageData(0, 0, 160, 120);
  return findColours(d.data, 160, 120, 6);
}
