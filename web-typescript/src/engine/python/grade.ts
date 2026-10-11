/**
 * Grade a student's Python function (산업단지 현장 실습 · 대학 과제, engine/education/lab/pyTasks.ts):
 * run the code once, then call the function with each case's arguments and hand back what it
 * returned (or the error it raised). Comparing with the expected values is pyTasks.ts's job.
 *
 * Runs wherever a Pyodide instance is: in the page's web worker (worker.ts, with the same time
 * limit as the simulator's programs), or in Node for the automated checks
 * (tests/education/pytask-check.mts). The driver below is plain Python 3, so the check also runs
 * it under CPython.
 */

import { explain, type PyodideLike } from './engine';
import type { PyError } from './types';

/** What a call returned, as plain data: a number, a string, None, a list of those, or something else (its repr). */
export type PyPlain = number | string | null | PyPlain[] | { repr: string };

export interface GradeCall {
  value?: PyPlain;
  error?: PyError & { last: string };
}

export interface GradeRaw {
  /** The code itself stopped (a syntax error, or an error outside the function). */
  error?: PyError & { last: string };
  /** No function of that name after running the code. */
  missing?: boolean;
  calls: GradeCall[];
  /** What the code printed. */
  output: string;
}

/**
 * The grader, in Python: `_pt_main(code, fn, cases_json)` runs the code as main.py in a namespace
 * of its own, calls `fn(*args)` for every case and returns the results as JSON. Errors carry the
 * main.py line and the traceback's last line.
 */
export const GRADE_PY = String.raw`
import json as _pt_json, math as _pt_math, numbers as _pt_numbers, traceback as _pt_tb


def _pt_line(e):
    line = 0
    tb = e.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == "main.py":
            line = tb.tb_lineno
        tb = tb.tb_next
    if isinstance(e, SyntaxError) and e.filename == "main.py" and e.lineno:
        line = e.lineno
    return line


def _pt_err(e):
    last = _pt_tb.format_exception_only(type(e), e)[-1].strip()
    return {"type": type(e).__name__, "message": str(e)[:300], "line": _pt_line(e), "last": last[:300]}


def _pt_plain(v, top=True):
    if v is None:
        return None
    if isinstance(v, str):
        return v[:200]
    if isinstance(v, _pt_numbers.Real):
        try:
            f = float(v)
        except OverflowError:
            return {"repr": "너무 큰 수"}
        return f if _pt_math.isfinite(f) else {"repr": repr(f)}
    if top and isinstance(v, (list, tuple)):
        return [_pt_plain(x, False) for x in list(v)[:20]]
    return {"repr": type(v).__name__ + " " + repr(v)[:80]}


def _pt_main(code, fn, cases):
    out = {"calls": []}
    ns = {"__name__": "__main__"}
    try:
        exec(compile(code, "main.py", "exec"), ns)
    except BaseException as e:
        out["error"] = _pt_err(e)
        return _pt_json.dumps(out, ensure_ascii=False)
    f = ns.get(fn)
    if not callable(f):
        out["missing"] = True
        return _pt_json.dumps(out, ensure_ascii=False)
    for args in _pt_json.loads(cases):
        try:
            out["calls"].append({"value": _pt_plain(f(*args))})
        except BaseException as e:
            out["calls"].append({"error": _pt_err(e)})
    return _pt_json.dumps(out, ensure_ascii=False)
`;

/** Printed output kept, characters (a print in a loop must not flood the page). */
const OUTPUT_MAX = 4000;

/** A Python error as the 오류 box shows it: the line, the type, a plain explanation (engine.ts's). */
function plainError(e: { type: string; message: string; line: number; last: string }): PyError & { last: string } {
  const pe = explain(`File "main.py", line ${e.line}\n${e.type}: ${e.message}`);
  // engine.ts's hint for a missing module lists the simulator's robot libraries; a task needs none.
  const hint = e.type === 'ModuleNotFoundError' ? '이 과제는 math 같은 기본 모듈만으로 풀 수 있어요. 다른 모듈은 쓸 수 없어요.' : pe.hint;
  return { ...pe, line: e.line, hint, last: e.last };
}

export function gradeScript(py: PyodideLike, code: string, fn: string, cases: readonly (readonly unknown[])[]): GradeRaw {
  let output = '';
  const say = (s: string) => {
    if (output.length < OUTPUT_MAX) output += `${s}\n`;
  };
  py.setStdout({ batched: say });
  py.setStderr({ batched: say });
  py.registerJsModule('_pytask', { code, fn, cases: JSON.stringify(cases) });
  // Defined again every time: a simulator program run in the same Python may have replaced the names.
  py.runPython(GRADE_PY, { filename: '<grader>' });
  const json = String(py.runPython('import sys\nsys.modules.pop("_pytask", None)\nimport _pytask\n_pt_main(_pytask.code, _pytask.fn, _pytask.cases)', { filename: '<grader>' }));
  const r = JSON.parse(json) as { error?: GradeCall['error']; missing?: boolean; calls: GradeCall[] };
  return {
    error: r.error && plainError(r.error),
    missing: r.missing,
    calls: r.calls.map((c) => (c.error ? { error: plainError(c.error) } : { value: c.value ?? null })),
    output: output.length >= OUTPUT_MAX ? `${output.slice(0, OUTPUT_MAX)}\n… (출력이 길어 줄였어요)` : output,
  };
}
