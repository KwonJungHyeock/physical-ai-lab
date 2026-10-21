'use client';

/**
 * The monitor over the 3D view (상황 모니터): see-through panels with
 * - a dial per joint: the angle from 0° against the joint's range (red ends = within 15° of a
 *   limit), where a running move is heading (hollow dot), how fast it turns, and on an inner ring
 *   the motor's estimated load (gravity + acceleration torque ÷ the torque it is rated for,
 *   engine/physics/dynamics.ts; myCobot 280 only);
 * - the tool tip's position and orientation, and its speed with the last few seconds as a trace;
 * - every joint over the last 5 s.
 * Which panels show is chosen on the bar at the top and kept on this PC.
 *
 * Numbers change every frame, so they are written straight into the page (refs), not through React.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { WorldState } from '@/engine/simulator/sim';
import { forwardKinematics, type ChainSegment } from '@/engine/robot/kinematics';
import { jointMax, jointMin } from '@/engine/robot/limits';
import { tcpPositionMm } from '@/engine/robot/motion';
import { inverseDynamics, torqueLimits } from '@/engine/physics/dynamics';
import { activeArm } from '@/engine/robot/arms';

import { jointLabels } from '../control/jointInfo';

import css from './hud.module.css';

type Panel = 'joints' | 'tcp' | 'graph' | 'load';
const ICONS: Record<Panel | 'hide' | 'show', ReactNode> = {
  joints: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12l4-3" />
    </>
  ),
  tcp: (
    <>
      <path d="M12 3v18M3 12h18" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  graph: <path d="M3 17l5-6 4 4 5-8 4 5" />,
  load: <path d="M5 20V12M10 20V7M15 20v-5M20 20V4" />,
  hide: <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 3.1M6.6 6.6C4.2 8.2 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.4-1.2" />,
  show: (
    <>
      <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
};
const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg viewBox="0 0 24 24" aria-hidden className={css.ic}>
    {ICONS[name]}
  </svg>
);
const PANELS: readonly { id: Panel; name: string; title: string }[] = [
  { id: 'joints', name: '관절', title: '관절 각도 게이지' },
  { id: 'tcp', name: '손끝', title: '손끝 위치·자세·속도' },
  { id: 'graph', name: '그래프', title: '최근 5초 관절 각도' },
  { id: 'load', name: '부하', title: '게이지 안쪽 링에 모터 부하 표시' },
];
const DEFAULT_ON: Record<Panel, boolean> = { joints: true, tcp: true, graph: true, load: true };
const HUD_KEY = 'console-hud';

const COLORS = ['#ff6b6b', '#ffb547', '#4cd98a', '#6ea8ff', '#b48cff', '#5ee0e6'];
/** A joint this close to a limit is flagged, degrees. */
const NEAR_DEG = 15;
const HISTORY_S = 5;

/* Dial geometry (SVG user units): a 270° arc, gap at the bottom, 0 at the top for symmetric ranges. */
const SW = 270;
const R = 35;
const CX = 49;
const CY = 62;
const W = 98;
const H = 100;
const RING = R - 8.5;
const pol = (deg: number, r: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const arc = (a0: number, a1: number, r: number): string => {
  if (a1 < a0) [a0, a1] = [a1, a0];
  if (a1 - a0 < 0.01) a1 = a0 + 0.01;
  const [x0, y0] = pol(a0, r);
  const [x1, y1] = pol(a1, r);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
/** Angle on the dial for a joint angle within [lo, hi]. */
const dialAt = (deg: number, lo: number, hi: number) => -SW / 2 + (SW * (Math.min(hi, Math.max(lo, deg)) - lo)) / (hi - lo);

function Dial({ i, name, lo, hi }: { i: number; name: string; lo: number; hi: number }) {
  const lim = (NEAR_DEG * SW) / (hi - lo);
  const ticks: ReactNode[] = [];
  for (let d = Math.ceil(lo / 15) * 15; d <= hi; d += 15) {
    const major = d % 45 === 0;
    const [x0, y0] = pol(dialAt(d, lo, hi), R + 5);
    const [x1, y1] = pol(dialAt(d, lo, hi), R + (d === 0 ? 11 : major ? 8.5 : 6.5));
    ticks.push(<line key={d} x1={x0} y1={y0} x2={x1} y2={y1} className={d === 0 ? css.t0 : major ? css.tMajor : css.tMinor} />);
  }
  return (
    <div className={css.dial} data-j={i}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
        <path d={arc(-SW / 2, SW / 2, R)} className={css.track} />
        <path d={arc(-SW / 2, -SW / 2 + lim, R)} className={css.limit} />
        <path d={arc(SW / 2 - lim, SW / 2, R)} className={css.limit} />
        {ticks}
        <g data-loadring>
          <path d={arc(-SW / 2, SW / 2, RING)} className={css.ringTrack} />
          <path d="" className={css.ring} data-ring />
        </g>
        <path d="" className={css.glow} data-arcglow />
        <path d="" className={css.fill} data-arc />
        <circle r="4.2" className={css.goal} data-goal />
        <circle r="4.6" className={css.knob} data-knob />
        <text x={pol(-SW / 2, R + 2)[0] - 2} y={H - 3} className={css.minmax}>
          {lo}
        </text>
        <text x={pol(SW / 2, R + 2)[0] + 2} y={H - 3} className={css.minmax}>
          {hi}
        </text>
        <text x={CX} y={CY + 21} className={css.loadPct} data-loadpct />
      </svg>
      <div className={css.lab}>
        J{i + 1}
        <span>{name}</span>
      </div>
      <b className={css.val} data-a>
        0°
      </b>
      <small className={css.spd} data-s />
    </div>
  );
}

export type HudStatus = { text: string; tone: 'ok' | 'run' | 'real' | 'stop' };

interface Props {
  world: React.RefObject<WorldState>;
  chain: readonly ChainSegment[];
  tcpMm: number;
  mountMm: number;
  /** The load estimate uses myCobot 280's link masses: other arms get a note instead. */
  loadModel: boolean;
  status: HudStatus;
  /** Opened from the left menu bar: always shown, its close button closes the window. */
  onClose?(): void;
}

export default function Hud({ world, chain, tcpMm, mountMm, loadModel, status, onClose }: Props) {
  // The open arm's joints (a 4-axis arm has four).
  const NAMES = jointLabels().map((j) => j.name);
  const dof = activeArm().dof;
  const [on, setOn] = useState<Record<Panel, boolean>>(DEFAULT_ON);
  const [hiddenSaved, setHidden] = useState(false);
  const hidden = hiddenSaved && !onClose;
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(HUD_KEY) ?? 'null') as { on?: Partial<Record<Panel, boolean>>; hidden?: boolean } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
      if (s?.on) setOn({ ...DEFAULT_ON, ...s.on });
      if (s?.hidden) setHidden(true);
    } catch {
      /* private window */
    }
  }, []);
  const save = (next: Record<Panel, boolean>, h: boolean) => {
    setOn(next);
    setHidden(h);
    try {
      localStorage.setItem(HUD_KEY, JSON.stringify({ on: next, hidden: h }));
    } catch {
      /* private window */
    }
  };
  const showLoad = on.load && loadModel;

  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const trace = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (hidden) return;
    const box = root.current;
    if (!box) return;
    const $ = <T extends Element>(sel: string) => box.querySelector<T>(sel);
    // The torque limits come from myCobot 280's link masses: only when the load is estimated.
    const limits = showLoad ? torqueLimits(chain, tcpMm) : [];
    const hist: { t: number; q: number[] }[] = [];
    const speeds: { t: number; v: number }[] = [];
    let qd = [0, 0, 0, 0, 0, 0];
    let qdd = [0, 0, 0, 0, 0, 0];
    let tipSpeed = 0;
    let last: { t: number; q: number[]; tip: { x: number; y: number; z: number } } | null = null;
    let frame = 0;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const w = world.current;
      if (!w) return;
      const t = now / 1000;
      const q = w.angles.slice();
      const tip = tcpPositionMm(chain, q, tcpMm);
      if (last && t - last.t > 0.03) {
        const dt = t - last.t;
        const v = q.map((a, i) => (a - last!.q[i]) / dt);
        // Smoothed: the readouts should not flicker between frames.
        const k = Math.min(1, dt / 0.12);
        const acc = v.map((x, i) => (x - qd[i]) / dt);
        qd = qd.map((x, i) => x + (v[i] - x) * k);
        qdd = qdd.map((x, i) => x + (acc[i] - x) * k * 0.5);
        tipSpeed += (Math.hypot(tip.x - last.tip.x, tip.y - last.tip.y, tip.z - last.tip.z) / dt - tipSpeed) * k;
        last = { t, q, tip };
        hist.push({ t, q });
        speeds.push({ t, v: tipSpeed });
        while (hist.length && hist[0].t < t - HISTORY_S) hist.shift();
        while (speeds.length && speeds[0].t < t - HISTORY_S) speeds.shift();
      } else if (!last) last = { t, q, tip };
      // The numbers at ~15 Hz, the dials and graphs every other frame.
      frame += 1;
      if (frame % 2 === 0) {
        const lo = jointMin();
        const hi = jointMax();
        const moving = qd.some((x) => Math.abs(x) > 1);
        const tau = showLoad ? inverseDynamics(chain, q, qd, qdd, { payloadKg: w.held ? 0.015 : 0, tcpMm }) : null;
        q.slice(0, dof).forEach((a, i) => {
          const dial = $<HTMLElement>(`[data-j="${i}"]`);
          if (!dial) return;
          const room = Math.min(a - lo[i], hi[i] - a);
          const warn = room < NEAR_DEG;
          const z = dialAt(0, lo[i], hi[i]);
          const at = dialAt(a, lo[i], hi[i]);
          const d = arc(z, at, R);
          dial.querySelector('[data-arc]')!.setAttribute('d', d);
          dial.querySelector('[data-arcglow]')!.setAttribute('d', d);
          const [kx, ky] = pol(at, R);
          const knob = dial.querySelector('[data-knob]')!;
          knob.setAttribute('cx', kx.toFixed(2));
          knob.setAttribute('cy', ky.toFixed(2));
          const goal = dial.querySelector<SVGCircleElement>('[data-goal]')!;
          const g = w.goal?.[i];
          if (g !== undefined && moving && Math.abs(g - a) > 0.5) {
            const [gx, gy] = pol(dialAt(g, lo[i], hi[i]), R);
            goal.setAttribute('cx', gx.toFixed(2));
            goal.setAttribute('cy', gy.toFixed(2));
            goal.style.display = '';
          } else goal.style.display = 'none';
          if (tau) {
            const p = Math.min(100, (Math.abs(tau[i]) / limits[i]) * 100);
            const ring = dial.querySelector('[data-ring]')!;
            ring.setAttribute('d', arc(-SW / 2, -SW / 2 + (SW * Math.max(p, 1.5)) / 100, RING));
            const level = p >= 80 ? 'high' : p >= 50 ? 'mid' : 'low';
            dial.setAttribute('data-load', level);
            if (frame % 8 === 0) dial.querySelector('[data-loadpct]')!.textContent = `${p.toFixed(0)}%`;
          }
          if (frame % 8 === 0) {
            dial.querySelector('[data-a]')!.textContent = `${a >= 0 ? '+' : '−'}${Math.abs(a).toFixed(1)}°`;
            dial.querySelector('[data-s]')!.textContent = warn ? `한계까지 ${Math.max(0, room).toFixed(0)}°` : `${Math.abs(qd[i]).toFixed(0)} °/s`;
          }
          if (warn) dial.setAttribute('data-warn', '');
          else dial.removeAttribute('data-warn');
        });
        const tcp = $('[data-tcp]');
        if (tcp && frame % 8 === 0) {
          const r = forwardKinematics(chain, q).rpyDeg;
          const vals = [tip.x, tip.y, tip.z - mountMm, r.x, r.y, r.z];
          tcp.querySelectorAll<HTMLElement>('[data-c]').forEach((el, i) => (el.textContent = vals[i].toFixed(1)));
          $('[data-speed]')!.textContent = tipSpeed.toFixed(0);
          $('[data-held]')!.textContent = w.held ? `${w.held.color} 블록을 들고 있어요` : w.pump ? '흡착 펌프 켜짐' : '';
        }
        // Tool tip speed, the last 5 s as a filled trace.
        const tc = trace.current;
        if (tc && speeds.length > 1) {
          const ctx = tc.getContext('2d')!;
          const cw = tc.width;
          const ch = tc.height;
          const top = Math.max(60, ...speeds.map((s) => s.v)) * 1.15;
          ctx.clearRect(0, 0, cw, ch);
          ctx.beginPath();
          speeds.forEach((s, k) => {
            const x = cw - ((t - s.t) / HISTORY_S) * cw;
            const y = ch - 2 - (s.v / top) * (ch - 4);
            if (k) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.strokeStyle = '#9ff0c4';
          ctx.lineWidth = 1.6 * (cw / tc.clientWidth || 1);
          ctx.stroke();
          ctx.lineTo(cw, ch);
          ctx.lineTo(cw - ((t - speeds[0].t) / HISTORY_S) * cw, ch);
          ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, 0, ch);
          grad.addColorStop(0, 'rgba(159,240,196,.32)');
          grad.addColorStop(1, 'rgba(159,240,196,0)');
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }
      const cv = canvas.current;
      if (cv && hist.length > 1) {
        const ctx = cv.getContext('2d')!;
        const cw = cv.width;
        const ch = cv.height;
        const px = cw / cv.clientWidth || 1;
        ctx.clearRect(0, 0, cw, ch);
        for (const g of [-90, 0, 90]) {
          const y = ch / 2 - (g / 180) * (ch / 2 - 6);
          ctx.strokeStyle = g === 0 ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)';
          ctx.setLineDash(g === 0 ? [3 * px, 3 * px] : []);
          ctx.lineWidth = px;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(cw, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        const yOf = (deg: number) => ch / 2 - (deg / 180) * (ch / 2 - 6);
        for (let j = 0; j < dof; j += 1) {
          const path = new Path2D();
          hist.forEach((h, k) => {
            const x = cw - ((t - h.t) / HISTORY_S) * cw - 4 * px;
            if (k) path.lineTo(x, yOf(h.q[j]));
            else path.moveTo(x, yOf(h.q[j]));
          });
          // A soft glow under a thin line, and a dot at the newest value.
          ctx.strokeStyle = COLORS[j];
          ctx.globalAlpha = 0.18;
          ctx.lineWidth = 5 * px;
          ctx.stroke(path);
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1.7 * px;
          ctx.stroke(path);
          ctx.fillStyle = COLORS[j];
          ctx.beginPath();
          ctx.arc(cw - 4 * px, yOf(hist[hist.length - 1].q[j]), 2.6 * px, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hidden, on, showLoad, world, chain, tcpMm, mountMm, dof]);

  if (hidden)
    return (
      <div className={css.hud}>
        <button type="button" className={`${css.glass} ${css.showBtn}`} onClick={() => save(on, false)} title="모니터 보이기">
          <Icon name="show" />
          모니터 보이기
        </button>
      </div>
    );

  const lo = jointMin();
  const hi = jointMax();
  return (
    <div className={css.hud} ref={root} data-panel="hud" data-docked={onClose ? true : undefined}>
      <div className={`${css.glass} ${css.bar}`} role="group" aria-label="모니터에 보일 것">
        {PANELS.map((p) => (
          <button key={p.id} type="button" aria-pressed={on[p.id]} title={p.title} onClick={() => save({ ...on, [p.id]: !on[p.id] }, false)}>
            <Icon name={p.id} />
            {p.name}
          </button>
        ))}
        <button type="button" className={css.hideBtn} onClick={() => (onClose ? onClose() : save(on, true))} title="모니터 닫기" aria-label="모니터 닫기">
          <Icon name="hide" />
        </button>
      </div>
      {on.joints && (
        <section className={css.glass} aria-label="관절 각도">
          <h5>
            <span className={css.ht}>
              <Icon name="joints" />
              관절 각도
            </span>
            <span className={css.status} data-tone={status.tone}>
              <i />
              {status.text}
            </span>
          </h5>
          <div className={css.dials} data-four={dof === 4 || undefined} data-noload={!showLoad || undefined}>
            {NAMES.map((n, i) => (
              <Dial key={n} i={i} name={n} lo={lo[i]} hi={hi[i]} />
            ))}
          </div>
          <div className={css.legend}>
            <span>
              <i className={css.lgNow} />
              지금 각도
            </span>
            <span>
              <i className={css.lgGoal} />
              가는 곳
            </span>
            {showLoad && (
              <span>
                <i className={css.lgLoad} />
                안쪽 링 = 모터 부하
              </span>
            )}
          </div>
          {on.load && !loadModel && <p className={css.hint}>이 모델은 링크 질량 자료가 없어 부하를 아직 추정하지 않아요 (myCobot 280 만).</p>}
        </section>
      )}
      {on.tcp && (
        <section className={css.glass} data-tcp aria-label="손끝">
          <h5>
            <span className={css.ht}>
              <Icon name="tcp" />
              손끝 (TCP)
            </span>
            <em>로봇 바닥 기준</em>
          </h5>
          <div className={css.grid3}>
            {(['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'] as const).map((a, i) => (
              <div key={a} className={css.cell} data-rot={i >= 3 || undefined}>
                <small data-ax={a}>{a}</small>
                <b>
                  <span data-c>0</span>
                  <i>{i < 3 ? 'mm' : '°'}</i>
                </b>
              </div>
            ))}
          </div>
          <div className={css.speed}>
            <div>
              <b data-speed>0</b>
              <span>mm/s</span>
            </div>
            <canvas ref={trace} className={css.trace} width={420} height={56} />
          </div>
          <em className={css.held} data-held />
        </section>
      )}
      {on.graph && (
        <section className={css.glass} aria-label="최근 5초 관절 각도">
          <h5>
            <span className={css.ht}>
              <Icon name="graph" />
              관절 각도 · 최근 5초
            </span>
            <em>−180° ~ +180°</em>
          </h5>
          <canvas ref={canvas} className={css.chart} width={592} height={150} />
          <div className={css.chips}>
            {COLORS.slice(0, dof).map((c, i) => (
              <span key={c}>
                <i style={{ background: c }} />J{i + 1}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
