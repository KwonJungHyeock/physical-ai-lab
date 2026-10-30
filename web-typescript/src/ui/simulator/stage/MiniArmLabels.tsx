'use client';

/**
 * The angle chips around the mini arm (MiniArm.tsx) and one line under it with what a process
 * point holds: the tool tip's position X · Y · Z (mm) and rotation RX · RY · RZ (°). No box behind:
 * the chips float by their joints. A joint in caution or danger turns its chip amber or red with the
 * reason ("부하 82%", "한계까지 3°"), the same moment its housing turns colour on both arms.
 * Updated every frame from refs (no React render per frame).
 */

import { useEffect, useRef, type RefObject } from 'react';

import type { Live } from '../liveStore';
import type { ToolNow } from '../control/ControlPanel';
import { jointLabels } from '../control/jointInfo';
import type { MonitorOut } from './MiniArm';
import css from './mini.module.css';

/** Which side of its joint each chip sits on: J1 beside the base, J2 · J3 to the left, the wrist to the right. */
const SIDE = ['base', 'left', 'left', 'right', 'right', 'right'] as const;
/** Chips on one side are kept at least this far apart, px. */
const GAP = 26;

/** Where each chip's anchor goes: beside its joint, one column per side, pushed apart top to bottom. */
function layout(points: readonly { x: number; y: number }[]): ({ x: number; y: number } | null)[] {
  const out: ({ x: number; y: number } | null)[] = points.map(() => null);
  if (!points.length) return out;
  const base = points[0];
  out[0] = { x: base.x + 40, y: base.y + 34 };
  for (const side of ['left', 'right'] as const) {
    const ids = points.map((_, i) => i).filter((i) => SIDE[i] === side);
    if (!ids.length) continue;
    const xs = ids.map((i) => points[i].x);
    const x = side === 'left' ? Math.min(...xs) - 22 : Math.max(...xs) + 22;
    const order = ids.slice().sort((a, b) => points[a].y - points[b].y);
    let last = -Infinity;
    for (const i of order) {
      const y = Math.max(points[i].y, last + GAP);
      out[i] = { x, y };
      last = y;
    }
  }
  // J1's chip beside the base goes under the right column when the wrist hangs low over it.
  const j1 = out[0];
  if (j1) {
    const right = points.map((_, i) => out[i]).filter((c, i): c is { x: number; y: number } => !!c && SIDE[i] === 'right');
    for (const c of right.sort((a, b) => a.y - b.y)) if (Math.abs(c.y - j1.y) < GAP && Math.abs(c.x - j1.x) < 110) j1.y = c.y + GAP;
  }
  return out;
}

export default function MiniArmLabels({ monitor, live, tipOf, side }: { monitor: RefObject<MonitorOut>; live: Live; tipOf(a: readonly number[]): ToolNow | null; side: 'left' | 'right' }) {
  const root = useRef<HTMLDivElement>(null);
  const dof = jointLabels().length;
  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const box = root.current;
      const m = monitor.current;
      if (!box || !m) return;
      const q = m.angles.length ? m.angles : live.getAngles();
      const chips = box.querySelectorAll<HTMLElement>('[data-j]');
      const dots = box.querySelectorAll<SVGCircleElement>('[data-dot]');
      const lines = box.querySelectorAll<SVGLineElement>('[data-line]');
      // Chips beside their joints, the wrist's three (close together) stacked so none hides another.
      const at = layout(m.points);
      chips.forEach((el, i) => {
        const pt = m.points[i];
        const c = at[i];
        const shown = !!pt && !!c;
        el.style.display = shown ? '' : 'none';
        dots[i]?.style.setProperty('display', shown ? '' : 'none');
        lines[i]?.style.setProperty('display', shown ? '' : 'none');
        if (!shown) return;
        el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
        dots[i].setAttribute('cx', pt.x.toFixed(1));
        dots[i].setAttribute('cy', pt.y.toFixed(1));
        lines[i].setAttribute('x1', pt.x.toFixed(1));
        lines[i].setAttribute('y1', pt.y.toFixed(1));
        lines[i].setAttribute('x2', c.x.toFixed(1));
        lines[i].setAttribute('y2', c.y.toFixed(1));
        const a = m.alerts[i];
        const lv = String(a?.level ?? 0);
        el.dataset.level = lv;
        dots[i].dataset.level = lv;
        if (frame % 4 === 0) {
          const v = q[i] ?? 0;
          el.querySelector('b')!.textContent = `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`;
          el.querySelector('em')!.textContent = a?.why ?? '';
        }
      });
      if (frame % 6 === 0) {
        const t = tipOf(q);
        if (t) {
          const vals = [t.x, t.y, t.z, t.rx ?? 0, t.ry ?? 0, t.rz ?? 0];
          box.querySelectorAll<HTMLElement>('[data-c]').forEach((el, i) => (el.textContent = vals[i].toFixed(1)));
          // With a tool: the flange too, what the robot's get_coords reports (the line above is the tool tip).
          const f = box.querySelector<HTMLElement>('[data-flange]');
          if (f) {
            f.hidden = !t.flange;
            if (t.flange) f.querySelector('b')!.textContent = `${t.flange.x.toFixed(0)}, ${t.flange.y.toFixed(0)}, ${t.flange.z.toFixed(0)}`;
          }
        }
      }
      frame += 1;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [monitor, live, tipOf]);
  return (
    <div ref={root} className={css.layer} data-side={side} aria-label="관절 각도와 손끝 위치">
      <svg className={css.leads} aria-hidden="true">
        {Array.from({ length: dof }, (_, i) => (
          <g key={i}>
            <line data-line style={{ display: 'none' }} />
            <circle data-dot r={3.5} style={{ display: 'none' }} />
          </g>
        ))}
      </svg>
      {Array.from({ length: dof }, (_, i) => (
        <span key={i} className={css.chip} data-j={i} data-at={SIDE[i] ?? 'right'} style={{ display: 'none' }}>
          <span>
            <i>J{i + 1}</i>
            <b>—</b>
            <em />
          </span>
        </span>
      ))}
      <div className={css.tcp}>
        {(['X', 'Y', 'Z', 'RX', 'RY', 'RZ'] as const).map((n) => (
          <span key={n}>
            <i>{n}</i>
            <b data-c>—</b>
          </span>
        ))}
        <span className={css.flange} data-flange hidden title="위의 X · Y · Z 는 도구 끝(TCP)이에요. 로봇의 get_coords 는 도구를 다는 플랜지 위치를 알려 줘요">
          <i>FLANGE</i>
          <b>—</b>
        </span>
      </div>
    </div>
  );
}
