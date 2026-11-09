/**
 * ⚡ 결과 바로 (입문 퀘스트): the step's program run to its end without drawing — a fresh world of the
 * step, the physics stepped 1/60 s at a time in lockstep with the program (as the cell checks do,
 * tests/simulator/cell-*-check.mts), then the step's checks. The 운영 day (about 14 minutes of cell
 * time) comes out in seconds; a class sees the result at once and watches the run only to see why.
 *
 * It yields to the page every few hundred steps (`onProgress`), and stops when `signal` is aborted.
 * No React, no DOM.
 */

import type { ChainSegment } from '../../robot/kinematics';
import { createPhysics } from '../../physics/physics';
import { objectSpec } from '../deskPhysics';
import { EFFECTOR_BY_ID, tcpFor, type EffectorId } from '../effectors';
import * as G from '../program';
import { createCellWorld, runProgram } from '../sim';
import { CELL_BY_ID, type CellId } from './cells';
import { CELL_ENV, cellChecks, cellSolids, stepCell } from './run';

export interface QuickResult {
  /** Every check met and the program ran to its end. */
  passed: boolean;
  checks: { label: string; ok: boolean; detail?: string }[];
  /** Why the program stopped early (a collision, a refusal), or null. */
  error: string | null;
  /** Cell seconds the run took. */
  cellS: number;
  /** The run's warnings and stops, in order, with their cell time (s): where to look when watching it. */
  moments: { t: number; text: string }[];
}

const DT = 1 / 60;
/** Steps between yields to the page (about 10 cell seconds). */
const CHUNK = 600;

export async function quickRun(o: { chain: readonly ChainSegment[]; cell: CellId; mission: string; code: string; effector: EffectorId; onProgress?: (cellS: number) => void; signal?: AbortSignal }): Promise<QuickResult | null> {
  const eff = CELL_BY_ID[o.cell].effector ?? o.effector;
  const tcp = tcpFor(eff, false);
  const w = createCellWorld(o.cell, o.mission, eff);
  const reach = EFFECTOR_BY_ID[eff].kind === 'grip' ? Math.max(0, tcp - 40) : tcp;
  const phys = await createPhysics(o.chain, reach, w.objects.map(objectSpec), cellSolids(w.cell!), w.angles, CELL_ENV);
  let n = 0;
  const frame = async () => {
    stepCell(w, phys, DT, o.chain, tcp);
    n += 1;
    if (n % CHUNK === 0) {
      if (o.signal?.aborted) throw new DOMException('stopped', 'AbortError');
      o.onProgress?.(w.cell!.line.t);
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  for (let k = 0; k < 30; k += 1) await frame();
  const { steps, errors } = G.parse(o.code);
  if (errors.length) return { passed: false, checks: [], error: `${errors[0].line}번째 줄: ${errors[0].msg}`, cellS: 0, moments: [] };
  let error: string | null = null;
  try {
    await runProgram(steps, {
      chain: o.chain,
      world: w,
      poses: {},
      animate: async (d, f) => {
        const m = Math.max(1, Math.round(d / DT));
        for (let k = 1; k <= m; k += 1) {
          f((d * k) / m);
          await frame();
        }
      },
      see: async () => null,
      log: () => {},
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    error = (e as Error).message;
  }
  const run = w.cell!;
  run.endT = run.line.t;
  // The last part comes to rest (as on screen, before the checks).
  for (let k = 0; k < 90; k += 1) await frame();
  const res = cellChecks(w);
  const checks = res?.items ?? [];
  const seen = new Set<string>();
  const moments = run.alerts
    .filter((a) => {
      const k = `${a.level}|${a.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((a) => ({ t: Math.round(a.t), text: a.title }));
  return { passed: !error && checks.length > 0 && checks.every((c) => c.ok), checks, error, cellS: Math.round(run.endT - (run.startT ?? 0)), moments };
}
