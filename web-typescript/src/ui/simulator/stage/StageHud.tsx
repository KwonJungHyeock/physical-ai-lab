'use client';

/**
 * The simulator's corners, Metal Mission HUD: top left the mode (SIMULATION, or LIVE with a robot),
 * the arm's name, the open screen, and the ROBOT LINK button (the 로봇 연결 window; it also says when
 * the link is lost); bottom right two small 270° gauges — the jog speed, and the joint working
 * hardest (its load, or how far it has to its limit when that is the warning). The gauges read the
 * joint alerts the 3D view writes every frame (no React render per frame).
 */

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

import type { MonitorOut } from './MiniArm';
import css from './stageHud.module.css';

export type LinkState = 'sim' | 'real' | 'lost';

const LINK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);

export function StageTitle({
  link,
  robotId,
  ip,
  demo,
  offline,
  arm,
  screen,
  onLink,
  children,
}: {
  link: LinkState;
  robotId?: string;
  ip?: string;
  demo?: boolean;
  offline?: boolean;
  /** The arm's name, e.g. "myCobot 280". */
  arm: string;
  /** The open screen: [English, Korean], e.g. ['CONTROL', '제어']. */
  screen: [string, string];
  onLink(): void;
  /** Under the link button (the 처음 시작 guide). */
  children?: ReactNode;
}) {
  const id = robotId ?? '';
  return (
    <div className={css.title} data-link={link}>
      <span className={css.mode}>
        <i />
        {link === 'sim' ? 'SIMULATION' : link === 'real' ? 'LIVE' : 'LINK LOST'}
        <small>{link === 'sim' ? '시뮬레이션' : link === 'real' ? `${demo ? '데모 ' : ''}실물 로봇` : '연결 끊김'}</small>
      </span>
      <b className={css.arm}>{arm}</b>
      <span className={css.screen}>
        {screen[0]} · {screen[1]}
      </span>
      <button type="button" className={css.connPill} data-state={link} onClick={onLink} title={link === 'sim' ? '같은 Wi-Fi 의 로봇을 찾아 연결해요' : '다른 로봇으로 바꾸기 · 로봇 Wi-Fi 설정'}>
        {LINK_ICON}
        <span>
          <b>ROBOT LINK</b>
          <small>{link === 'sim' ? `로봇 연결 · 지금은 시뮬레이션${offline ? ' (오프라인 가능)' : ''}` : link === 'real' ? `로봇 ${id} 연결됨${ip ? ` · ${ip}` : ''}` : `로봇 ${id} 연결 끊김 · 다시 연결`}</small>
        </span>
        <svg className={css.chev} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {children}
    </div>
  );
}

/** 270° of arc, starting at the lower left. */
const A0 = 135;
const SPAN = 270;
const R = 46;
function arc(frac: number) {
  const f = Math.max(0.001, Math.min(1, frac));
  const a1 = (A0 * Math.PI) / 180;
  const a2 = ((A0 + SPAN * f) * Math.PI) / 180;
  return `M ${(Math.cos(a1) * R).toFixed(2)} ${(Math.sin(a1) * R).toFixed(2)} A ${R} ${R} 0 ${SPAN * f > 180 ? 1 : 0} 1 ${(Math.cos(a2) * R).toFixed(2)} ${(Math.sin(a2) * R).toFixed(2)}`;
}
const TICKS = Array.from({ length: 28 }, (_, i) => {
  const a = ((A0 + i * 10) * Math.PI) / 180;
  const r1 = i % 9 ? 52 : 50;
  return { x1: Math.cos(a) * r1, y1: Math.sin(a) * r1, x2: Math.cos(a) * 55, y2: Math.sin(a) * 55, major: i % 9 === 0 };
});

function Gauge({
  label,
  frac = 0,
  value = '—',
  unit = '',
  rootRef,
  arcRef,
  valueRef,
  unitRef,
  labelRef,
}: {
  label: string;
  frac?: number;
  value?: string;
  unit?: string;
  rootRef?: RefObject<HTMLDivElement | null>;
  arcRef?: RefObject<SVGPathElement | null>;
  valueRef?: RefObject<HTMLElement | null>;
  unitRef?: RefObject<HTMLElement | null>;
  labelRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <div className={css.gauge} ref={rootRef}>
      <svg viewBox="-60 -60 120 120" aria-hidden="true">
        <path d={arc(1)} className={css.trackArc} />
        <path ref={arcRef} d={arc(frac)} className={css.valueArc} />
        {TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} data-major={t.major || undefined} />
        ))}
      </svg>
      <span className={css.value}>
        <b ref={valueRef}>{value}</b>
        <small ref={unitRef}>{unit}</small>
      </span>
      <span className={css.gaugeLabel} ref={labelRef}>
        {label}
      </span>
    </div>
  );
}

export function HudGauges({ speed, monitor, dock, ko }: { speed: number; monitor: RefObject<MonitorOut>; dock: 'open' | 'closed'; ko?: boolean }) {
  const loadRoot = useRef<HTMLDivElement>(null);
  const loadArc = useRef<SVGPathElement>(null);
  const loadValue = useRef<HTMLElement>(null);
  const loadUnit = useRef<HTMLElement>(null);
  const loadLabel = useRef<HTMLElement>(null);
  // The joint working hardest, a few times a second: its load (%), or its room to the limit (°) when that warns.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let shown = '';
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 200) return;
      last = t;
      const alerts = monitor.current?.alerts ?? [];
      if (!alerts.length) return;
      let at = 0;
      let score = -1;
      alerts.forEach((a, i) => {
        const s = a.level * 1000 + (a.loadPct ?? 0) + (a.roomDeg < 30 ? 30 - a.roomDeg : 0);
        if (s > score) {
          score = s;
          at = i;
        }
      });
      const a = alerts[at];
      const byRoom = a.level > 0 && !a.why.startsWith('부하');
      const value = byRoom ? Math.max(0, Math.round(a.roomDeg)) : Math.round(a.loadPct ?? 0);
      const key = `${at}:${byRoom}:${value}:${a.level}`;
      if (key === shown) return;
      shown = key;
      loadArc.current?.setAttribute('d', arc(byRoom ? 1 - Math.min(1, value / 30) : value / 100));
      if (loadValue.current) loadValue.current.textContent = String(value);
      if (loadUnit.current) loadUnit.current.textContent = byRoom ? '°' : '%';
      if (loadLabel.current) loadLabel.current.textContent = `${byRoom ? (ko ? '여유' : 'ROOM') : ko ? '부하' : 'LOAD'} · J${at + 1}`;
      loadRoot.current?.setAttribute('data-level', String(a.level));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [monitor, ko]);
  return (
    <div className={css.gauges} data-dock={dock} aria-hidden="true">
      <Gauge label={ko ? '속도' : 'SPEED'} frac={(speed - 10) / 90} value={String(speed)} unit="%" />
      <Gauge label={ko ? '부하' : 'LOAD'} rootRef={loadRoot} arcRef={loadArc} valueRef={loadValue} unitRef={loadUnit} labelRef={loadLabel} />
    </div>
  );
}
