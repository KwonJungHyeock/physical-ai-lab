/// <reference lib="webworker" />
/**
 * Web worker that runs student Python programs (engine.ts) in Pyodide.
 * A worker, so a program that never ends can be stopped by ending the worker,
 * and the page stays responsive while Python loads and runs.
 *
 * Pyodide is served from this site (/pyodide/, copied there by
 * tools/build/copy-pyodide.mjs), so it also works on the robot with no internet.
 */

import { runScript, type PyodideLike } from './engine';
import type { PyInit } from './types';

let pyodide: Promise<PyodideLike> | null = null;

function load(): Promise<PyodideLike> {
  if (!pyodide) {
    pyodide = (async () => {
      const base = new URL('/pyodide/', self.location.origin).href;
      // Turbopack starts every worker as a classic worker (its bootstrap uses
      // importScripts), and Pyodide refuses classic workers: it tests for a
      // working importScripts. Hide it while Pyodide loads — Pyodide then loads
      // its files with import(), which classic workers support too — and put
      // it back for Turbopack.
      const scope = self as unknown as { importScripts?: unknown };
      const importScripts = scope.importScripts;
      scope.importScripts = undefined;
      try {
        const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${base}pyodide.mjs`)) as {
          loadPyodide(options: { indexURL: string }): Promise<PyodideLike>;
        };
        return await mod.loadPyodide({ indexURL: base });
      } finally {
        scope.importScripts = importScripts;
      }
    })();
    // A failed load (network) can be tried again with the next run.
    pyodide.catch(() => (pyodide = null));
  }
  return pyodide;
}

self.onmessage = async (e: MessageEvent<{ id: number; warm?: boolean; code?: string; init?: PyInit }>) => {
  const { id, warm, code, init } = e.data;
  try {
    const py = await load();
    if (warm) {
      self.postMessage({ id, ready: true });
      return;
    }
    self.postMessage({ id, started: true });
    const result = runScript(py, code ?? '', init!);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, failed: err instanceof Error ? err.message : String(err) });
  }
};
