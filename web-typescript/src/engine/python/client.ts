/**
 * Page side of the Python runner: one worker, loaded in the background, reused
 * for every run, replaced when a run has to be cut off.
 */

import type { PyInit, PyResult } from './types';

/** A program that runs longer than this (real time) is stopped — usually an endless loop. */
export const RUN_TIMEOUT_MS = 15000;

let worker: Worker | null = null;
let nextId = 1;
let readyPromise: Promise<void> | null = null;
const pending = new Map<number, (msg: WorkerReply) => void>();

interface WorkerReply {
  id: number;
  ready?: boolean;
  started?: boolean;
  result?: PyResult;
  failed?: string;
}

function spawn(): Worker {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<WorkerReply>) => pending.get(e.data.id)?.(e.data);
  return w;
}

function get(): Worker {
  if (!worker) worker = spawn();
  return worker;
}

/** Start loading Python now (about 13 MB the first time; cached after). */
export function warmPython(): Promise<void> {
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, (m) => {
        pending.delete(id);
        if (m.failed) {
          readyPromise = null;
          reject(new Error(m.failed));
        } else resolve();
      });
      get().postMessage({ id, warm: true });
    });
  }
  return readyPromise;
}

export async function runPython(code: string, init: PyInit): Promise<PyResult> {
  await warmPython();
  return new Promise<PyResult>((resolve, reject) => {
    const id = nextId++;
    let timer = 0;
    pending.set(id, (m) => {
      if (m.started) {
        timer = window.setTimeout(() => {
          pending.delete(id);
          // The only way to stop Python mid-run: end the worker and start a new one.
          worker?.terminate();
          worker = null;
          readyPromise = null;
          reject(new Error(`프로그램이 ${RUN_TIMEOUT_MS / 1000}초 안에 끝나지 않아 멈췄어요. time.sleep 없이 끝없이 도는 반복이 있는지 확인해 주세요.`));
        }, RUN_TIMEOUT_MS);
        return;
      }
      window.clearTimeout(timer);
      pending.delete(id);
      if (m.failed) reject(new Error(m.failed));
      else resolve(m.result!);
    });
    get().postMessage({ id, code, init });
  });
}
