'use client';

/**
 * 8-2 캡스톤 — 보고 판단해서 집어 놓기: one program, five stages (보기 → 좌표 → 역기구학 → 경로 → 집기·놓기).
 * A fixed camera finds the blocks by colour, a 4-marker homography (with the block-height parallax
 * correction) gives table mm, IK gives the poses, RRT-Connect finds a way over a 60 mm divider, and the
 * pump carries the block (physics) to the square of its colour. A: 1 block in a fixed place; B: the same
 * program, 5 random places (fixed seed); C: 3 coloured blocks sorted into their squares.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ChainSegment } from '@/engine/robot/kinematics';
import { jointMoveDuration } from '@/engine/robot/motion';
import { tcpFor } from '@/engine/simulator/effectors';
import type { RobotAction } from '@/engine/simulator/sim';
import { moveContact, poseContact, type Box } from '@/engine/physics/collide';
import { createPhysics, type BlockPose, type BlockSpec, type PhysicsWorld } from '@/engine/physics/physics';
import { mulberry32, quinticProfile, quinticWithin, rrtConnect } from '@/engine/physics/planning';

import type { LearnScene } from '../../stage/LearnStage';
import css from '../../learn.module.css';
import { Bars, Graph, Readout } from '../../widgets';
import { CamImage, Cross, IMG_H, IMG_W, Pair, applyH, armBoxes, blobsOf, cube, develop, homography, lookAt, maskImage, project, shoot, threshold, type CamBox, type ColorRule, type Rgb } from '../gcam';
import { HOME_POSE, LEARN_COLORS, LEARN_SPEED, STEP_COLORS, Verdict, fmt, reachFor, tipOf, type Mm } from '../kit';
import type { TopicProps } from '../types';

type K = 'A' | 'B' | 'C';

/* -------------------------------------------------------------------------- */
/* The world (the same in A, B and C)                                          */
/* -------------------------------------------------------------------------- */

export const TCP = tcpFor('pump', false);
const DT = 1 / 60;
const SIZE = 25;
/** A held block hangs this far below the cup: the collision check lengthens the tool by it. */
const HELD = SIZE;
/** Tool point heights: over a block or a square (block bottom 43.5 mm, under the divider's 60 mm), on the block, and placing (block bottom 2 mm up). */
const ABOVE_Z = 70;
const GRASP_Z = SIZE + 1.5;
const PLACE_Z = SIZE + 2 + 1.5;
/** The pump only counts as holding when the cup is this close to the block's centre (horizontally). */
const GRAB_MM = 10;

/** The fixed camera of 7-1: 620 mm above the table, looking down (picture top = +x). */
export const FIXED = lookAt([165, 0, 620], [190, 0, 0], [1, 0, 0], 470);
export const MARKERS: [number, number][] = [
  [100, -120],
  [100, 120],
  [290, -120],
  [290, 120],
];
/** The table point straight under the lens, and the lens height: the parallax correction. */
const LENS_XY: [number, number] = [FIXED.pos[0], FIXED.pos[1]];
const LENS_Z = FIXED.pos[2];
/** Where blocks are put (and picked from), mm. */
export const ZONE = { x0: 150, x1: 270, y0: -130, y1: -10 };
export const DIVIDER: Box = { min: [120, 15, 0], max: [270, 30, 60], name: '칸막이' };
/** Planning keeps this much clear of the divider (the checks are every 2° of joint travel; a touch in between is still counted). */
const PLAN_DIVIDER: Box = { min: [DIVIDER.min[0] - 3, DIVIDER.min[1] - 3, 0], max: [DIVIDER.max[0] + 3, DIVIDER.max[1] + 3, DIVIDER.max[2] + 3], name: DIVIDER.name };
const DIVIDER_CAM: CamBox = { id: 50, min: DIVIDER.min as Mm, max: DIVIDER.max as Mm, rgb: [214, 150, 102] };

export type ColorName = 'red' | 'blue' | 'green';
const hsv = (hMin: number, hMax: number): ColorRule => ({ mode: 'hsv', hMin, hMax, sMin: 0.45, vMin: 0.1 });
export const COLORS: Record<ColorName, { name: string; hex: string; rgb: Rgb; rule: ColorRule; bin: [number, number] }> = {
  red: { name: '빨강', hex: '#e5484d', rgb: [205, 45, 45], rule: hsv(-15, 15), bin: [120, 120] },
  blue: { name: '파랑', hex: '#3454d1', rgb: [50, 90, 205], rule: hsv(-155, -115), bin: [175, 115] },
  green: { name: '초록', hex: '#1fae66', rgb: [45, 165, 80], rule: hsv(120, 155), bin: [225, 95] },
};
const COLOR_NAMES = Object.keys(COLORS) as ColorName[];
const BIN_HALF = 25;

export interface Placed {
  id: string;
  color: ColorName;
  x: number;
  y: number;
}
export type Layout = Placed[];

export const A_LAYOUT: Layout = [{ id: 'r', color: 'red', x: 220, y: -70 }];
const B_SEED = 82;
const C_SEED = 83;

const specOf = (b: Placed): BlockSpec => ({ id: b.id, color: COLORS[b.color].hex, at: [b.x, b.y, SIZE / 2], massG: 10 });

/** A spot the program can work at: grasp and over-the-block poses both solve. */
function reachable(chain: readonly ChainSegment[], x: number, y: number): boolean {
  const up = reachFor(chain, [x, y, ABOVE_Z], HOME_POSE, TCP);
  return !!up && !!reachFor(chain, [x, y, GRASP_Z], up, TCP);
}

/** `n` block centres inside the zone (the whole block inside), reachable, centres at least `gap` mm apart. */
function spotsIn(chain: readonly ChainSegment[], rng: () => number, n: number, gap: number): [number, number][] {
  const m = SIZE / 2;
  const out: [number, number][] = [];
  for (let tries = 0; out.length < n && tries < 500; tries += 1) {
    const x = Math.round(ZONE.x0 + m + rng() * (ZONE.x1 - ZONE.x0 - 2 * m));
    const y = Math.round(ZONE.y0 + m + rng() * (ZONE.y1 - ZONE.y0 - 2 * m));
    if (out.some((p) => Math.hypot(p[0] - x, p[1] - y) < gap)) continue;
    if (reachable(chain, x, y)) out.push([x, y]);
  }
  return out;
}

/** B: five random places for the red block (the same five every time). */
export function randomPlaces(chain: readonly ChainSegment[], n = 5): Layout[] {
  const rng = mulberry32(B_SEED);
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = spotsIn(chain, rng, 1, 0)[0];
    return [{ id: `r${i}`, color: 'red', x, y }];
  });
}

/** C: red, blue and green at random places, centres ≥ 45 mm apart (arrangement `k` of a fixed sequence). */
export function threeBlocks(chain: readonly ChainSegment[], k: number): Layout {
  const spots = spotsIn(chain, mulberry32(C_SEED + k * 101), 3, 45);
  return COLOR_NAMES.map((color, i) => ({ id: color[0], color, x: spots[i][0], y: spots[i][1] }));
}

/* -------------------------------------------------------------------------- */
/* Stages 1–2: see and map                                                     */
/* -------------------------------------------------------------------------- */

/** Calibration as in 7-1: the four markers' pixels (rounded) ↔ their table mm → homography. */
export function calibrate(): { px: [number, number][]; H: number[] } {
  const px = MARKERS.map((m) => {
    const p = project(FIXED, [m[0], m[1], 0])!;
    return [Math.round(p[0]), Math.round(p[1])] as [number, number];
  });
  return { px, H: homography(px, MARKERS)! };
}
const CAL = calibrate();

export interface Found {
  color: ColorName;
  /** Blob centroid, px. */
  u: number;
  v: number;
  area: number;
  /** Homography only (where the ray meets the table), and corrected to the block's top face, mm. */
  pH: [number, number];
  p: [number, number];
}

export interface Photo {
  rgba: Uint8ClampedArray;
  mask: Uint8Array;
  found: Found[];
}

/** Homography, then pull towards the point under the lens: p = c + (p_H − c)·(h_c − h)/h_c. */
export function locate(H: readonly number[], u: number, v: number): { pH: [number, number]; p: [number, number] } {
  const pH = applyH(H, u, v);
  const k = (LENS_Z - SIZE) / LENS_Z;
  return { pH, p: [LENS_XY[0] + (pH[0] - LENS_XY[0]) * k, LENS_XY[1] + (pH[1] - LENS_XY[1]) * k] };
}

/** Take a photo of the blocks (and the divider and arm), find each colour's blobs, map them to mm. */
export function look(blocks: readonly { x: number; y: number; color: ColorName }[], chain: readonly ChainSegment[] | null, q: readonly number[] | null): Photo {
  const boxes: CamBox[] = [DIVIDER_CAM, ...blocks.map((b, i) => cube(i + 1, b.x, b.y, COLORS[b.color].rgb))];
  if (chain && q) boxes.push(...armBoxes(chain, q));
  const rgba = develop(shoot(FIXED, { boxes, markers: MARKERS.map((at) => ({ at, size: 28 })) }), 1, 6);
  const mask = new Uint8Array(IMG_W * IMG_H);
  const found: Found[] = [];
  for (const color of COLOR_NAMES) {
    const m = threshold(rgba, COLORS[color].rule);
    m.forEach((on, i) => {
      if (on) mask[i] = 1;
    });
    for (const b of blobsOf(m, IMG_W, IMG_H, 25)) found.push({ color, u: b.u, v: b.v, area: b.area, ...locate(CAL.H, b.u, b.v) });
  }
  return { rgba, mask, found };
}

const inZone = (p: readonly number[], margin = 10) => p[0] >= ZONE.x0 - margin && p[0] <= ZONE.x1 + margin && p[1] >= ZONE.y0 - margin && p[1] <= ZONE.y1 + margin;

/* -------------------------------------------------------------------------- */
/* Stages 3–5: IK, path, pick and place (one physics step per yield)           */
/* -------------------------------------------------------------------------- */

export const STAGES = ['보기', '좌표', '역기구학', '경로', '집기·놓기'] as const;
export type StageState = 'wait' | 'run' | 'done' | 'fail';
export interface StageView {
  state: StageState;
  text: string[];
}
const freshStages = (): StageView[] => STAGES.map(() => ({ state: 'wait', text: [] }));

export interface Ctl {
  cmd: number[];
  pump: boolean;
  phase: string;
  stages: StageView[];
  photo: Photo | null;
  /** Index (in photo.found) of the blob being handled; −1 none. */
  focus: number;
  /** Tool track of this run, and the planned carry (tool track) for the block in hand. */
  track: Mm[];
  carry: Mm[] | null;
  /** B: which try (0-based) of how many. */
  tryIx: number;
  tries: number;
}
export const freshCtl = (): Ctl => ({ cmd: HOME_POSE.slice(), pump: false, phase: '', stages: freshStages(), photo: null, focus: -1, track: [], carry: null, tryIx: 0, tries: 1 });

export interface BlockOutcome {
  /** Colour the camera saw (null: nothing found). */
  color: ColorName | null;
  px: [number, number] | null;
  truth: [number, number] | null;
  found: [number, number] | null;
  /** Found-position error before / after the height correction, mm. */
  rawErr: number | null;
  foundErr: number | null;
  /** The carry: what the straight move hits, and the planned path's points (raw → after shortcut). */
  straightHit: string | null;
  rrt: { raw: number; path: number } | null;
  placeErr: number | null;
  tiltDeg: number | null;
  ok: boolean;
  /** Stage it stopped at (0..4), null when it went through. */
  stop: number | null;
  reason: string;
  cycleS: number;
}

export interface RunResult {
  layout: Layout;
  blocks: BlockOutcome[];
  /** Arm or held block touching the divider (separate touches). */
  hits: number;
  timeS: number;
  track: Mm[];
  /** The motion as robot commands (A goes to the real arm), and the grasp / place poses of the first block. */
  actions: RobotAction[];
  keys: { grasp: number[]; place: number[] } | null;
}

type NoLine<T> = T extends unknown ? Omit<T, 'line'> : never;

/** Angle between the block's nearest face axis and the vertical, degrees. */
function tiltOf(b: BlockPose): number {
  const { x, y, z, w } = b.q;
  const zs = [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  return (Math.acos(Math.min(1, Math.max(...zs.map(Math.abs)))) * 180) / Math.PI;
}

const segLen = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((v, i) => Math.abs(b[i] - v)));

/** Tool track along a joint path (a point every 2° of joint travel). */
export function trackOf(chain: readonly ChainSegment[], path: readonly (readonly number[])[]): Mm[] {
  const pts: Mm[] = [tipOf(chain, path[0], TCP)];
  for (let i = 1; i < path.length; i += 1) {
    const n = Math.max(2, Math.ceil(segLen(path[i - 1], path[i]) / 2));
    for (let k = 1; k <= n; k += 1) pts.push(tipOf(chain, path[i - 1].map((v, j) => v + ((path[i][j] - v) * k) / n), TCP));
  }
  return pts;
}

/** Timing of a move of `deg` (largest joint change): F3's slow quintic (90°/s, 300°/s²), and never faster than the simulator. */
export const moveTime = (deg: number) => Math.max(quinticWithin(deg, 90, 300).durationS, jointMoveDuration([0], [deg], LEARN_SPEED));

/** A free joint path a → b: the straight move when it is clear, else RRT-Connect (fixed seed) + shortcut. */
export function planMove(chain: readonly ChainSegment[], a: number[], b: number[], boxes: readonly Box[], tcpMm: number, seed: number) {
  const hit = moveContact(chain, a, b, boxes, tcpMm, 2);
  if (!hit) return { ok: true, path: [a, b], hit: null, raw: 2 };
  const r = rrtConnect(a, b, (q) => !poseContact(chain, q, boxes, tcpMm), { rng: mulberry32(seed), checkDeg: 2 });
  return { ok: r.ok, path: r.path, hit: hit.contact.what, raw: r.raw.length };
}

const dividerTouch = (chain: readonly ChainSegment[], q: readonly number[], held: boolean) => !!poseContact(chain, q, [DIVIDER], held ? TCP + HELD : TCP, -1e4);
const blockBox = (p: readonly number[]): Box => ({ min: [p[0] - SIZE / 2, p[1] - SIZE / 2, 0], max: [p[0] + SIZE / 2, p[1] + SIZE / 2, SIZE], name: '다른 블록' });

/**
 * The program, for every block it can see in the zone: 보기 → 좌표 → 역기구학 → 경로 → 집기·놓기.
 * One physics step per yield; the caller steps the world to `ctl.cmd`.
 */
export function* capstoneRun(w: PhysicsWorld, chain: readonly ChainSegment[], layout: Layout, ctl: Ctl, seed = 7): Generator<void, RunResult, void> {
  w.reset(layout.map(specOf), [DIVIDER], HOME_POSE);
  Object.assign(ctl, { cmd: HOME_POSE.slice(), pump: false, phase: '', stages: freshStages(), focus: -1, track: [], carry: null });
  for (let i = 0; i < 20; i += 1) yield;
  const colorOf = new Map(layout.map((b) => [b.id, b.color]));
  const blocks: BlockOutcome[] = [];
  const actions: RobotAction[] = [{ type: 'angles', angles: HOME_POSE.slice(), speed: 25, line: 1 }];
  const act = (a: NoLine<RobotAction>) => actions.push({ ...a, line: actions.length + 1 } as RobotAction);
  let keys: RunResult['keys'] = null;
  let frames = 0;
  let hits = 0;
  let touching = false;
  let held = false;

  const stage = (i: number, state: StageState, ...text: string[]) => {
    ctl.stages = ctl.stages.map((s, k) => (k === i ? { state, text } : s));
  };
  /** A short pause so each stage can be seen lighting up (not counted as motion). */
  function* pause(s = 0.25): Generator<void, void, void> {
    for (let i = 0; i < Math.round(s / DT); i += 1) yield;
  }
  function* tick(): Generator<void, void, void> {
    frames += 1;
    const t = dividerTouch(chain, ctl.cmd, held);
    if (t && !touching) hits += 1;
    touching = t;
    if (frames % 3 === 0) ctl.track.push(tipOf(chain, ctl.cmd, TCP));
    yield;
  }
  /** Along a joint path at the lesson's speed. */
  function* glide(path: number[][], phase: string): Generator<void, void, void> {
    ctl.phase = phase;
    const seg = path.slice(1).map((p, i) => segLen(path[i], p));
    const len = seg.reduce((a, b) => a + b, 0);
    const prof = quinticProfile(len, moveTime(len));
    const n = Math.max(1, Math.ceil(prof.durationS / DT));
    for (let f = 1; f <= n; f += 1) {
      let left = prof.sample(Math.min(prof.durationS, f * DT)).p;
      let i = 1;
      while (i < path.length - 1 && left > seg[i - 1]) {
        left -= seg[i - 1];
        i += 1;
      }
      const u = seg[i - 1] ? Math.min(1, left / seg[i - 1]) : 1;
      ctl.cmd = path[i - 1].map((v, j) => v + (path[i][j] - v) * u);
      yield* tick();
    }
    ctl.cmd = path[path.length - 1].slice();
    path.slice(1).forEach((angles, i) => act({ type: 'angles', angles, speed: 25, via: i < path.length - 2 }));
  }
  function* wait(s: number, phase: string): Generator<void, void, void> {
    ctl.phase = phase;
    for (let i = 0; i < Math.round(s / DT); i += 1) yield* tick();
  }
  const finish = (): RunResult => ({ layout, blocks, hits, timeS: frames * DT, track: ctl.track.slice(), actions, keys });
  const fail = (o: Partial<BlockOutcome>, at: number, reason: string, ...text: string[]) => {
    stage(at, 'fail', ...(text.length ? text : [reason]));
    ctl.phase = '';
    blocks.push({ color: null, px: null, truth: null, found: null, rawErr: null, foundErr: null, straightHit: null, rrt: null, placeErr: null, tiltDeg: null, cycleS: 0, ...o, ok: false, stop: at, reason });
  };

  for (let n = 0; n < layout.length; n += 1) {
    ctl.stages = freshStages();
    ctl.carry = null;
    ctl.focus = -1;

    /* 1 보기 */
    stage(0, 'run', '사진 찍는 중…');
    yield* pause();
    const resting = w.blocks().filter((b) => !b.held);
    const photo = look(
      resting.map((b) => ({ x: b.at.x, y: b.at.y, color: colorOf.get(b.id) ?? 'red' })),
      chain,
      ctl.cmd,
    );
    ctl.photo = photo;
    const cands = photo.found.filter((f) => inZone(f.p)).sort((a, b) => Math.hypot(...a.p) - Math.hypot(...b.p));
    if (!cands.length) {
      if (n === 0) fail({}, 0, '집는 구역에서 블록을 못 찾았어요.', '못 찾음');
      else stage(0, 'done', '남은 블록 없음');
      break;
    }
    const f = cands[0];
    ctl.focus = photo.found.indexOf(f);
    const px: [number, number] = [Math.round(f.u), Math.round(f.v)];
    stage(0, 'done', `${COLORS[f.color].name} (u, v) = (${px[0]}, ${px[1]}) px`);

    /* 2 좌표 */
    stage(1, 'run', '픽셀 → mm');
    yield* pause();
    const same = resting.filter((b) => colorOf.get(b.id) === f.color);
    const tb = same.sort((a, b) => Math.hypot(a.at.x - f.p[0], a.at.y - f.p[1]) - Math.hypot(b.at.x - f.p[0], b.at.y - f.p[1]))[0];
    const truth: [number, number] | null = tb ? [tb.at.x, tb.at.y] : null;
    const foundErr = truth ? Math.hypot(f.p[0] - truth[0], f.p[1] - truth[1]) : null;
    const rawErr = truth ? Math.hypot(f.pH[0] - truth[0], f.pH[1] - truth[1]) : null;
    const base = { color: f.color, px, truth, found: f.p, rawErr, foundErr };
    stage(1, 'done', `H: (${fmt(f.pH[0], 0)}, ${fmt(f.pH[1], 0)}) → 높이 고침: (${fmt(f.p[0], 0)}, ${fmt(f.p[1], 0)}) mm`, `찾은 위치 오차 ${foundErr === null ? '—' : fmt(foundErr, 1)} mm`);

    /* 3 역기구학 */
    stage(2, 'run', '자세 구하는 중…');
    yield* pause();
    const bin = COLORS[f.color].bin;
    const qAbove = reachFor(chain, [f.p[0], f.p[1], ABOVE_Z], ctl.cmd, TCP);
    const qGrasp = qAbove && reachFor(chain, [f.p[0], f.p[1], GRASP_Z], qAbove, TCP);
    const qOver = qAbove && reachFor(chain, [bin[0], bin[1], ABOVE_Z], qAbove, TCP);
    const qPlace = qOver && reachFor(chain, [bin[0], bin[1], PLACE_Z], qOver, TCP);
    if (!qAbove || !qGrasp || !qOver || !qPlace) {
      fail(base, 2, '팔이 닿지 않는 자리예요.', '닿지 않음');
      break;
    }
    stage(2, 'done', '4자세 OK', `집기 J1~J3 ${qGrasp.slice(0, 3).map((a) => fmt(a, 0)).join(' · ')}°`);

    /* 4 경로 (the carry, block in hand; the other blocks the camera saw are obstacles too) */
    stage(3, 'run', '길 찾는 중…');
    yield* pause();
    const others = photo.found.filter((g) => g !== f).map((g) => blockBox(g.p));
    const carry = planMove(chain, qAbove, qOver, [PLAN_DIVIDER, ...others], TCP + HELD, seed + n);
    if (!carry.ok) {
      fail({ ...base, straightHit: carry.hit }, 3, '칸막이를 넘는 길을 못 찾았어요.', '길 없음');
      break;
    }
    ctl.carry = trackOf(chain, carry.path);
    const rrt = carry.hit ? { raw: carry.raw, path: carry.path.length } : null;
    stage(3, 'done', rrt ? `곧장: ${carry.hit}에 닿음 → RRT 경로 점 ${rrt.raw}개(다듬은 뒤 ${rrt.path}개)` : '곧장 OK');

    /* 5 집기·놓기 */
    stage(4, 'run', '움직이는 중…');
    const start = frames;
    const to = planMove(chain, ctl.cmd.slice(), qAbove, [PLAN_DIVIDER, ...others], TCP, seed + 50 + n);
    if (!to.ok) {
      fail({ ...base, straightHit: carry.hit, rrt }, 4, '블록 위로 가는 길을 못 찾았어요.', '길 없음');
      break;
    }
    yield* glide(to.path, `${COLORS[f.color].name} 블록 위`);
    yield* glide([qAbove, qGrasp], '내려가기');
    ctl.pump = true;
    act({ type: 'pump', on: true });
    act({ type: 'wait', sec: 0.5 });
    yield* wait(0.3, '흡착 켜기');
    const cup = tipOf(chain, qGrasp, TCP);
    const now = w.blocks().find((b) => b.id === tb?.id);
    const off = now ? Math.hypot(cup[0] - now.at.x, cup[1] - now.at.y) : Infinity;
    const got = off <= GRAB_MM ? w.grab(8) : null;
    if (!got) {
      ctl.pump = false;
      fail({ ...base, straightHit: carry.hit, rrt, cycleS: (frames - start) * DT }, 4, `컵이 블록 가운데에서 ${fmt(off, 0)} mm 벗어나 못 집었어요.`, `못 집음 (${fmt(off, 0)} mm 빗나감)`);
      break;
    }
    held = true;
    if (n === 0) keys = { grasp: qGrasp, place: qPlace };
    yield* glide([qGrasp, qAbove], '들어 올리기');
    yield* glide(carry.path, rrt ? '칸막이 넘기 (계획한 길)' : '칸으로');
    yield* glide([qOver, qPlace], '내려놓기');
    w.release();
    held = false;
    ctl.pump = false;
    act({ type: 'pump', on: false });
    act({ type: 'wait', sec: 0.5 });
    yield* wait(0.3, '흡착 끄기');
    yield* glide([qPlace, qOver], '위로 빠지기');
    const cycleS = (frames - start) * DT;
    const fb = w.blocks().find((b) => b.id === got)!;
    const placeErr = Math.hypot(fb.at.x - bin[0], fb.at.y - bin[1]);
    const tiltDeg = tiltOf(fb);
    const inBin = Math.abs(fb.at.x - bin[0]) <= BIN_HALF && Math.abs(fb.at.y - bin[1]) <= BIN_HALF && fb.at.z < SIZE;
    const rightColor = colorOf.get(got) === f.color;
    const ok = inBin && rightColor && tiltDeg < 10;
    const o: BlockOutcome = { ...base, straightHit: carry.hit, rrt, placeErr, tiltDeg, ok, stop: ok ? null : 4, reason: ok ? '' : !rightColor ? '다른 색 칸에 놓았어요.' : !inBin ? '칸 밖에 놓였어요.' : '블록이 넘어졌어요.', cycleS };
    stage(4, ok ? 'done' : 'fail', `놓은 위치 오차 ${fmt(placeErr, 1)} mm`, ok ? `${COLORS[f.color].name} 칸 안 · 바로 섬` : o.reason);
    blocks.push(o);
    if (!ok) break;
  }
  ctl.phase = '';
  const home = planMove(chain, ctl.cmd.slice(), HOME_POSE.slice(), [PLAN_DIVIDER], TCP, seed + 99);
  if (home.ok) yield* glide(home.path, '처음 자세로');
  ctl.phase = '';
  ctl.focus = -1;
  return finish();
}

/** Several layouts one after another (B's five tries). */
export function* capstoneBatch(w: PhysicsWorld, chain: readonly ChainSegment[], layouts: readonly Layout[], ctl: Ctl): Generator<void, RunResult[], void> {
  const out: RunResult[] = [];
  ctl.tries = layouts.length;
  for (let i = 0; i < layouts.length; i += 1) {
    ctl.tryIx = i;
    out.push(yield* capstoneRun(w, chain, layouts[i], ctl, 7 + 10 * i));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Summaries and rows                                                          */
/* -------------------------------------------------------------------------- */

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const errText = (xs: number[], many: boolean) => (!xs.length ? '—' : many ? `${fmt(mean(xs), 1)} mm (최대 ${fmt(Math.max(...xs), 1)})` : `${fmt(xs[0], 1)} mm`);

export interface Summary {
  ok: number;
  of: number;
  found: number[];
  placed: number[];
  cycles: number[];
  hits: number;
}

export function summarize(runs: readonly RunResult[], k: K): Summary {
  const blocks = runs.flatMap((r) => r.blocks);
  const of = k === 'C' ? runs.reduce((s, r) => s + r.layout.length, 0) : runs.length;
  return {
    ok: blocks.filter((b) => b.ok).length,
    of,
    found: blocks.flatMap((b) => (b.foundErr === null ? [] : [b.foundErr])),
    placed: blocks.flatMap((b) => (b.placeErr === null ? [] : [b.placeErr])),
    cycles: blocks.filter((b) => b.ok).map((b) => b.cycleS),
    hits: runs.reduce((s, r) => s + r.hits, 0),
  };
}

export function rowOf(k: K, s: Summary) {
  const many = k !== 'A';
  return {
    블록: k === 'A' ? '1개 · 정해진 자리' : k === 'B' ? '1개 · 무작위 자리' : '3개 · 무작위',
    성공: k === 'C' ? `${s.ok} / ${s.of} (색 맞음)` : `${s.ok} / ${s.of}`,
    '찾은 위치 오차': errText(s.found, many),
    '놓은 위치 오차': errText(s.placed, many),
    '칸막이 충돌': String(s.hits),
    '사이클 시간': !s.cycles.length
      ? '—'
      : k === 'C'
        ? `합 ${fmt(s.cycles.reduce((a, b) => a + b, 0), 1)} s (1개당 ${fmt(mean(s.cycles), 1)} s)`
        : k === 'B'
          ? `${fmt(mean(s.cycles), 1)} s (평균)`
          : `${fmt(s.cycles[0], 1)} s`,
  };
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                   */
/* -------------------------------------------------------------------------- */

const NUM: Record<K, string> = { A: '활동 1', B: '활동 2', C: '활동 3' };
const TITLES: Record<K, string> = { A: '블록 1개 · 정해진 자리', B: '블록 1개 · 무작위 자리', C: '블록 3개 · 색 분류' };
const STATE_TEXT: Record<StageState, string> = { wait: '대기', run: '진행', done: '완료', fail: '실패' };

const square = (c: readonly number[], half: number, z = 0.6): Mm[] => [
  [c[0] - half, c[1] - half, z],
  [c[0] + half, c[1] - half, z],
  [c[0] + half, c[1] + half, z],
  [c[0] - half, c[1] + half, z],
  [c[0] - half, c[1] - half, z],
];

/** What never changes in the 3D view: the divider, the pick zone, the three colour squares and their names. */
const FIXED_SCENE: Pick<LearnScene, 'boxes' | 'lines' | 'labels'> = {
  boxes: [{ ...DIVIDER, color: '#f0a06d' }],
  lines: [
    { key: 'zone', points: square([(ZONE.x0 + ZONE.x1) / 2, (ZONE.y0 + ZONE.y1) / 2], (ZONE.x1 - ZONE.x0) / 2), color: '#98a2b3', width: 1.5, dashed: true },
    ...COLOR_NAMES.map((c) => ({ key: `bin-${c}`, points: square(COLORS[c].bin, BIN_HALF), color: COLORS[c].hex, width: 3 })),
  ],
  labels: [
    { key: 'zone', mm: [ZONE.x1 - 10, ZONE.y0 + 8, 4] as Mm, text: '집는 구역', color: '#98a2b3' },
    { key: 'div', mm: [(DIVIDER.min[0] + DIVIDER.max[0]) / 2, 22, 75] as Mm, text: '칸막이 60 mm', color: '#f0a06d' },
    ...COLOR_NAMES.map((c) => ({ key: `bin-${c}`, mm: [COLORS[c].bin[0], COLORS[c].bin[1] + BIN_HALF + 8, 4] as Mm, text: `${COLORS[c].name} 칸`, color: COLORS[c].hex })),
  ],
};

interface View {
  q: number[];
  blocks: BlockPose[];
  pump: boolean;
  phase: string;
  stages: StageView[];
  photo: Photo | null;
  focus: number;
  carry: Mm[] | null;
  track: Mm[];
  tryIx: number;
  tries: number;
}

const restingBlocks = (layout: Layout) => layout.map((b) => ({ x: b.x, y: b.y, color: b.color }));

/** Commanded vs read on the real arm at one pose: largest joint difference (°) and tool point distance (mm). */
interface Gap {
  deg: number;
  mm: number;
}

export default function Capstone({ chain, show, real, step, record, results }: TopicProps) {
  const k: K = step === 'cmp' ? 'A' : step;
  const places = useMemo(() => randomPlaces(chain), [chain]);
  const [cIx, setCIx] = useState(0);
  const layout = useMemo<Layout>(() => (k === 'A' ? A_LAYOUT : k === 'B' ? places[0] : threeBlocks(chain, cIx)), [k, places, cIx, chain]);
  const firstPhoto = useMemo(() => look(restingBlocks(layout), chain, HOME_POSE), [layout, chain]);
  const [view, setView] = useState<View | null>(null);
  const [runs, setRuns] = useState<Partial<Record<K, RunResult[]>>>({});
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [showMask, setShowMask] = useState(false);
  const sim = useRef<{
    w: PhysicsWorld | null;
    prog: Generator<void, RunResult[], void> | null;
    ctl: Ctl;
    done: ((r: RunResult[]) => void) | null;
    reset: Layout | null;
  }>({ w: null, prog: null, ctl: freshCtl(), done: null, reset: null });

  // A new step or a new arrangement starts over: those blocks on the table, the arm at home.
  useEffect(() => {
    sim.current.reset = layout;
  }, [layout, step]);

  useEffect(() => {
    let alive = true;
    let raf = 0;
    const s = sim.current;
    void createPhysics(chain, TCP, [], [DIVIDER], HOME_POSE).then((w) => {
      if (!alive) {
        w.dispose();
        return;
      }
      s.w = w;
      setReady(true);
      let last = -1;
      let acc = 0;
      const tick = (now: number) => {
        if (last < 0) last = now;
        // While a program runs, catch up at most 0.25 s per frame so a slow machine still finishes (same fixed steps, same results).
        acc = Math.min(acc + (now - last) / 1000, (s.prog ? 15 : 4) * DT);
        last = now;
        while (acc >= DT) {
          acc -= DT;
          if (s.reset) {
            w.reset(s.reset.map(specOf), [DIVIDER], HOME_POSE);
            s.reset = null;
            s.ctl = freshCtl();
            if (s.prog) {
              s.prog = null;
              s.done = null;
              setBusy(false);
            }
          }
          if (s.prog) {
            const r = s.prog.next();
            if (r.done) {
              s.prog = null;
              s.done?.(r.value);
            }
          }
          w.stepTo(s.ctl.cmd, DT);
        }
        const c = s.ctl;
        setView({ q: c.cmd.slice(), blocks: w.blocks(), pump: c.pump, phase: c.phase, stages: c.stages, photo: c.photo, focus: c.focus, carry: c.carry, track: c.track.slice(), tryIx: c.tryIx, tries: c.tries });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      s.w?.dispose();
      s.w = null;
      s.prog = null;
    };
  }, [chain]);

  const start = (key: K, layouts: Layout[], recordIt: boolean) => {
    const s = sim.current;
    if (!s.w) return;
    // A new arrangement not yet put on the table (the next frame would do it, and cancel this run): put it there now.
    if (s.reset) {
      s.w.reset(s.reset.map(specOf), [DIVIDER], HOME_POSE);
      s.reset = null;
    }
    s.ctl = freshCtl();
    s.prog = capstoneBatch(s.w, chain, layouts, s.ctl);
    s.done = (r) => {
      setBusy(false);
      setRuns((old) => ({ ...old, [key]: r }));
      if (recordIt) record(key, rowOf(key, summarize(r, key)));
    };
    setBusy(true);
  };
  const runOnce = () => start(k, [layout], k !== 'B');
  const runFive = () => start('B', places, true);
  const reset = () => {
    sim.current.reset = layout;
  };

  /* Real arm (comparison page): the A program, at speed 25, and how far the read angles land from the commanded ones. */
  const [realMsg, setRealMsg] = useState('');
  const [watch, setWatch] = useState(false);
  const [gap, setGap] = useState<{ grasp: Gap | null; place: Gap | null }>({ grasp: null, place: null });
  const [ruler, setRuler] = useState('');
  const aRun = runs.A?.[0];
  const aKeys = aRun?.blocks[0]?.ok ? aRun.keys : null;
  const sendReal = async () => {
    if (!aRun || !aKeys) return;
    const bad = aRun.actions.find((a) => a.type === 'angles' && poseContact(chain, a.angles, [], TCP));
    if (bad && bad.type === 'angles') {
      const hit = poseContact(chain, bad.angles, [], TCP)!;
      setRealMsg(`보내지 않았어요: J${hit.joint} 가 ${hit.what}에 닿는 자세가 있어요.`);
      return;
    }
    setRealMsg('보내는 중…');
    setGap({ grasp: null, place: null });
    const r = await real.run(aRun.actions);
    setRealMsg(r.ok ? '실물 로봇이 활동 1 의 프로그램을 해요 (속도 25, 흡착 펌프 필요). 집기·놓기 자세에서 읽은 각도를 비교해요.' : (r.error ?? '로봇이 받지 않았어요.'));
    setWatch(r.ok);
  };
  // While the real arm runs the A program, keep the closest it came to the grasp and place poses (tool point, mm):
  // the gap between what was commanded and what the servos report there.
  useEffect(() => {
    if (!watch || !aKeys || !real.angles) return;
    const angles = real.angles;
    const read = tipOf(chain, angles, TCP);
    const d = (q: number[]): Gap => {
      const c = tipOf(chain, q, TCP);
      return { mm: Math.hypot(read[0] - c[0], read[1] - c[1], read[2] - c[2]), deg: Math.max(...q.map((v, i) => Math.abs(angles[i] - v))) };
    };
    const closer = (old: Gap | null, now: Gap) => (old && old.mm <= now.mm ? old : now);
    const g = d(aKeys.grasp);
    const p = d(aKeys.place);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accumulates a minimum over the live angle stream from the robot
    setGap((old) => ({ grasp: closer(old.grasp, g), place: closer(old.place, p) }));
  }, [watch, aKeys, real.angles, chain]);

  const photo = view?.photo ?? firstPhoto;
  const maskRgba = useMemo(() => maskImage(photo.mask), [photo]);

  const sums = useMemo(() => {
    const out: Partial<Record<K, Summary>> = {};
    (['A', 'B', 'C'] as K[]).forEach((key) => {
      if (runs[key]) out[key] = summarize(runs[key]!, key);
    });
    return out;
  }, [runs]);

  /* 3D view */
  useEffect(() => {
    if (step === 'cmp') {
      const lines: NonNullable<LearnScene['lines']> = [...FIXED_SCENE.lines!];
      (['A', 'B', 'C'] as K[]).forEach((key) => runs[key]?.forEach((r, i) => lines.push({ key: `${key}${i}`, points: r.track, color: STEP_COLORS[key], width: key === 'B' ? 1.5 : 3 })));
      show({ angles: HOME_POSE, tool: 'pump', frames: 'none', boxes: FIXED_SCENE.boxes, lines, labels: FIXED_SCENE.labels });
      return;
    }
    if (!view) return;
    const tip = tipOf(chain, view.q, TCP);
    const f = view.photo && view.focus >= 0 ? view.photo.found[view.focus] : null;
    const lines: NonNullable<LearnScene['lines']> = [...FIXED_SCENE.lines!];
    if (view.carry) lines.push({ key: 'carry', points: view.carry, color: LEARN_COLORS.path, width: 1.5, dashed: true });
    if (view.track.length > 1) lines.push({ key: 'track', points: view.track, color: STEP_COLORS[k], width: 2.5 });
    show({
      angles: view.q,
      tool: 'pump',
      pumpOn: view.pump,
      frames: 'none',
      blocks: view.blocks,
      boxes: FIXED_SCENE.boxes,
      lines,
      target: f ? { mm: [f.p[0], f.p[1], SIZE] as Mm, ok: true, label: `찾은 자리 (${fmt(f.p[0], 0)}, ${fmt(f.p[1], 0)})` } : null,
      labels: [
        ...FIXED_SCENE.labels!,
        { key: 'cam', mm: [FIXED.pos[0], FIXED.pos[1], FIXED.pos[2] + 14] as Mm, text: '고정 카메라', color: LEARN_COLORS.accent },
        ...(view.phase ? [{ key: 'phase', mm: [tip[0], tip[1], tip[2] + 45] as Mm, text: view.phase, color: view.pump ? LEARN_COLORS.ok : LEARN_COLORS.accent }] : []),
      ],
    });
  }, [view, step, k, runs, chain, show]);

  /* Comparison */
  if (step === 'cmp') {
    const keys = (['A', 'B', 'C'] as K[]).filter((key) => results[key]);
    const cols = ['블록', '성공', '찾은 위치 오차', '놓은 위치 오차', '칸막이 충돌', '사이클 시간', ...(results.A?.['실물 놓은 위치 오차'] ? ['실물 놓은 위치 오차'] : [])];
    const measured = Number(ruler);
    const realOk = ruler.trim() !== '' && Number.isFinite(measured) && measured >= 0;
    const simA = sums.A?.placed[0];
    const bars = [
      ...(['A', 'B', 'C'] as K[]).filter((key) => sums[key]?.placed.length).map((key) => ({ label: `${NUM[key]} 시뮬`, v: mean(sums[key]!.placed) })),
      ...(realOk ? [{ label: `${NUM.A} 실물`, v: measured }] : []),
    ];
    return (
      <section className={css.card}>
        <h3>같은 프로그램, 세 가지 세상</h3>
        {keys.length ? (
          <table className={css.compare}>
            <thead>
              <tr>
                <th />
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key}>
                  <th style={{ color: STEP_COLORS[key] }}>{NUM[key]}</th>
                  {cols.map((c) => (
                    <td key={c}>{results[key]![c] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={css.live}>활동 1 · 2 · 3 을 해 보면 여기에 표로 모여요.</p>
        )}
        {bars.length > 0 && <Bars values={bars.map((b) => b.v)} limits={bars.map(() => 5)} unit="mm" digits={1} labels={bars.map((b) => b.label)} />}
        <p className={css.note}>막대 = 놓은 위치 오차(활동 2 · 3 은 평균), 막대 위 선 = 5 mm. 3D: 세 번 손끝이 지나간 길(활동 1 주황 · 활동 2 하늘 · 활동 3 초록).</p>
        <div className={css.real}>
          <button type="button" className={css.realBtn} disabled={!real.online || !aKeys} onClick={() => void sendReal()}>
            실물 로봇으로 같은 프로그램
          </button>
          <small>
            {!real.online
              ? '로봇에 연결된 콘솔에서 쓸 수 있어요 (지금: 시뮬레이션).'
              : !aKeys
                ? '먼저 활동 1 에서 [실행] 을 눌러 프로그램을 만드세요.'
                : realMsg || `흡착 펌프를 달고, 빨강 블록을 (${A_LAYOUT[0].x}, ${A_LAYOUT[0].y}) mm 에 손으로 두세요. 좌표는 시뮬 카메라 값 그대로예요(같은 프로그램). 칸막이는 화면에만 있어요.`}
          </small>
        </div>
        {(gap.grasp || gap.place) && (
          <div className={css.row3}>
            <Readout label="집기 자세: 명령 ↔ 읽은 각" value={gap.grasp ? `${fmt(gap.grasp.deg, 1)}° · ${fmt(gap.grasp.mm, 1)}` : '—'} unit="mm" />
            <Readout label="놓기 자세: 명령 ↔ 읽은 각" value={gap.place ? `${fmt(gap.place.deg, 1)}° · ${fmt(gap.place.mm, 1)}` : '—'} unit="mm" />
          </div>
        )}
        <label className={css.slider}>
          <b>자로 잰</b>
          <input
            type="number"
            min={0}
            step={0.5}
            value={ruler}
            placeholder="놓은 위치 오차 (mm)"
            aria-label="자로 잰 놓은 위치 오차 (mm)"
            onChange={(e) => {
              setRuler(e.target.value);
              const v = Number(e.target.value);
              if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= 0 && results.A) record('A', { ...results.A, '실물 놓은 위치 오차': `${fmt(v, 1)} mm` });
            }}
          />
          <span className={css.num}>{realOk && simA !== undefined ? `Δ ${fmt(measured - simA, 1)} mm` : 'mm'}</span>
        </label>
        <p className={css.note}>실물 칸 중심에서 블록 중심까지 자로 재어 넣으면 시뮬(활동 1)과 나란히 막대로 보여요. Δ = 실물 − 시뮬.</p>
      </section>
    );
  }

  /* A · B · C */
  const mine = runs[k];
  const sum = sums[k];
  const live = view;
  const stages = live?.stages ?? freshStages();
  const failAt = stages.findIndex((s) => s.state === 'fail');
  const lastBlocks = mine?.flatMap((r) => r.blocks) ?? [];
  const lastOne = lastBlocks[lastBlocks.length - 1];
  const focus = live && live.focus >= 0 ? live.focus : -1;
  const crosses = photo.found.map((f, i) => (
    <Cross key={i} u={f.u} v={f.v} color={COLORS[f.color].hex} size={i === focus ? 9 : 6} label={i === focus ? `(${Math.round(f.u)}, ${Math.round(f.v)})` : undefined} />
  ));
  return (
    <section className={css.card}>
      <h3>{TITLES[k]}</h3>
      <div className={css.pipe}>
        {STAGES.map((name, i) => (
          <div key={name} data-state={stages[i].state}>
            <b>
              {i + 1} {name}
            </b>
            <small>{STATE_TEXT[stages[i].state]}</small>
            {stages[i].text.map((t, j) => (
              <span key={j}>{t}</span>
            ))}
          </div>
        ))}
      </div>
      <div className={css.btnRow}>
        {k === 'B' && (
          <button type="button" className={css.primary} disabled={busy || !ready} onClick={runFive}>
            무작위 자리로 5번
          </button>
        )}
        {k === 'C' && (
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => {
              setCIx(cIx + 1);
            }}
          >
            블록 3개 무작위 배치
          </button>
        )}
        <button type="button" className={k === 'B' ? undefined : css.primary} disabled={busy || !ready} onClick={runOnce}>
          실행
        </button>
        <button type="button" disabled={busy || !ready} onClick={reset}>
          처음으로
        </button>
        <span className={css.seg}>
          <button type="button" aria-pressed={showMask} onClick={() => setShowMask(!showMask)}>
            마스크 보기
          </button>
        </span>
      </div>
      {showMask ? (
        <Pair>
          <CamImage rgba={photo.rgba} caption="사진">
            {crosses}
          </CamImage>
          <CamImage rgba={maskRgba} caption="마스크 (빨강 · 파랑 · 초록 기준)" />
        </Pair>
      ) : (
        <CamImage rgba={photo.rgba} caption={`고정 카메라 사진 (위 = 로봇 앞쪽) · 덩어리 ${photo.found.length}개`}>
          {crosses}
        </CamImage>
      )}
      <div className={css.row3}>
        <Readout label="찾은 위치 오차" value={lastOne?.foundErr != null ? fmt(lastOne.foundErr, 1) : '—'} unit="mm" tone={lastOne?.foundErr != null ? (lastOne.foundErr < 3 ? 'ok' : 'warn') : undefined} />
        <Readout label="놓은 위치 오차" value={lastOne?.placeErr != null ? fmt(lastOne.placeErr, 1) : '—'} unit="mm" tone={lastOne?.placeErr != null ? (lastOne.ok ? 'ok' : 'bad') : undefined} />
        <Readout label="사이클 시간" value={lastOne?.cycleS ? fmt(lastOne.cycleS, 1) : '—'} unit="s" />
      </div>
      {busy && k === 'B' && live && live.tries > 1 && <p className={css.live}>시도 {live.tryIx + 1} / {live.tries}</p>}
      {!busy && failAt >= 0 && lastOne && !lastOne.ok && (
        <Verdict tone="bad">
          {STAGES[failAt]} 칸에서 멈춤: {lastOne.reason}
        </Verdict>
      )}
      {!busy && sum && failAt < 0 && (
        <Verdict tone={sum.ok === sum.of ? 'ok' : 'warn'}>
          {k === 'C' ? '분류' : '성공'} {sum.ok} / {sum.of}
          {sum.found.length > 0 && ` · 찾은 위치 오차 ${k === 'A' ? fmt(sum.found[0], 1) : `평균 ${fmt(mean(sum.found), 1)}`} mm`}
          {sum.placed.length > 0 && ` · 놓은 위치 오차 ${k === 'A' ? fmt(sum.placed[0], 1) : `평균 ${fmt(mean(sum.placed), 1)}`} mm`}
          {` · 칸막이 충돌 ${sum.hits}`}
        </Verdict>
      )}
      {k === 'B' && mine && mine.length > 1 && (
        <>
          <table className={css.matrix}>
            <caption>시도별 결과</caption>
            <tbody>
              <tr>
                <td>시도</td>
                <td>블록 자리 (mm)</td>
                <td>찾은 위치 오차</td>
                <td>놓은 위치 오차</td>
                <td>성공</td>
              </tr>
              {mine.map((r, i) => {
                const b = r.blocks[0];
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      ({r.layout[0].x}, {r.layout[0].y})
                    </td>
                    <td>{b?.foundErr != null ? `${fmt(b.foundErr, 1)} mm` : '—'}</td>
                    <td>{b?.placeErr != null ? `${fmt(b.placeErr, 1)} mm` : '—'}</td>
                    <td>{b?.ok ? 'O' : 'X'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Graph
            title="찾은 위치 오차 (시도마다)"
            x={mine.map((_, i) => i + 1)}
            xUnit="회"
            series={[{ label: '찾은 위치 오차', color: STEP_COLORS.B, values: mine.map((r) => r.blocks[0]?.foundErr ?? 0) }]}
            unit="mm"
            height={80}
          />
        </>
      )}
      {k === 'C' && lastBlocks.length > 0 && (
        <table className={css.matrix}>
          <caption>블록마다 (로봇에 가까운 것부터)</caption>
          <tbody>
            <tr>
              <td>색</td>
              <td>찾은 자리 (mm)</td>
              <td>찾은 위치 오차</td>
              <td>놓은 위치 오차</td>
              <td>사이클</td>
            </tr>
            {lastBlocks.map((b, i) => (
              <tr key={i}>
                <td style={{ color: b.color ? COLORS[b.color].hex : undefined }}>{b.color ? COLORS[b.color].name : '—'}</td>
                <td>{b.found ? `(${fmt(b.found[0], 0)}, ${fmt(b.found[1], 0)})` : '—'}</td>
                <td>{b.foundErr != null ? `${fmt(b.foundErr, 1)} mm` : '—'}</td>
                <td>{b.placeErr != null ? `${fmt(b.placeErr, 1)} mm` : '—'}</td>
                <td>{b.ok ? `${fmt(b.cycleS, 1)} s` : 'X'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className={css.note}>
        {k === 'A'
          ? '같은 프로그램이 다섯 칸을 차례로 지나요: 사진 → 색 덩어리의 가운데 (u, v) → 호모그래피로 mm, 블록 윗면이 25 mm 높으니 카메라 바로 아래 점 쪽으로 (620 − 25)/620 만큼 당김 → 역기구학 → 칸막이를 넘는 길(들고 있는 블록까지 검사) → 흡착 컵으로 집어 칸 위 2 mm 에서 놓기.'
          : k === 'B'
            ? '프로그램은 활동 1 과 똑같아요. 블록 자리만 집는 구역 안에서 무작위로 바뀌어요(난수 고정이라 늘 같은 다섯 자리). 매번 사진을 보고 위치를 새로 계산해요.'
            : '사진의 덩어리마다 어느 색 기준에서 잡혔는지가 놓을 칸을 정해요. 로봇에 가까운 블록부터 하나씩, 블록마다 사진을 새로 찍어요. 다른 블록도 경로 계획의 장애물로 넣어요.'}{' '}
        사이클 시간 = 블록 위로 가서 집고, 칸에 놓고, 들어 올릴 때까지 움직인 시간.
      </p>
    </section>
  );
}
