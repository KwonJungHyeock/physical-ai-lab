'use client';

/**
 * The roadmap figure on the 교육 home: the three 대단원 as filled zones, a road that draws itself
 * through the 8 단원 (stations popping in one after another) to the gold capstone flag. A finished
 * 단원 gets a ✓, the current one a pulsing halo and "지금 여기", and a 단원 the owned equipment
 * gives no real practice in turns grey ("시뮬레이터로"). It plays when it scrolls into view, again
 * on [↻ 다시 보기] and whenever `replay` changes; a station click goes to its 단원 card.
 */

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { CATEGORIES, topicsOf, type CategoryId, type TopicId } from '@/engine/education/catalog';
import { PARTS, UNIT_STOP, partOf, subjectComplete, type Done, type StopIcon, type TopicCover } from '@/engine/education/roadmap';

import css from './roadmap.module.css';

/** Station centres in the 1120 × 268 picture, up and down so the road winds. */
const X = [64, 190, 316, 456, 588, 728, 852, 970];
const Y = [136, 166, 116, 166, 116, 166, 116, 156];
const CAP = [1064, 136] as const;
/** The zones' left edge and width, one per 대단원. */
const ZONES: readonly (readonly [number, number])[] = [
  [8, 375],
  [391, 262],
  [661, 451],
];
/** One smooth S-curve from stop to stop (control points level with each stop). */
const PATH = [...X.map((x, i) => [x, Y[i]] as const), CAP].reduce((d, [x, y], i, a) => {
  if (!i) return `M${x} ${y}`;
  const [px, py] = a[i - 1];
  const h = (x - px) / 2;
  return `${d} C ${px + h} ${py}, ${x - h} ${y}, ${x} ${y}`;
}, '');

/** White line icons, drawn around (0, 0) inside a station. */
const ICONS: Record<StopIcon, ReactNode> = {
  arm: (
    <>
      <path d="M-10 12 h20 M-6 12 v-3 h12 v3 M0 9 V0 L9 -9 M9 -9 l5 2 M9 -9 l2 -5" />
      <circle cx="0" cy="0" r="2.4" />
      <circle cx="9" cy="-9" r="2.4" />
    </>
  ),
  target: (
    <>
      <circle r="11" />
      <circle r="5.5" />
      <path d="M0 -15 V-8 M0 8 V15 M-15 0 H-8 M8 0 H15" />
    </>
  ),
  curve: (
    <>
      <path d="M-13 10 C -6 10, -4 -10, 4 -10 S 10 -2, 13 -2" />
      <path d="M8 -6 L13 -2 L8 2" />
    </>
  ),
  weight: (
    <>
      <path d="M-5 -8 a5 5 0 0 1 10 0" />
      <path d="M-9 -4 H9 L12 12 H-12 Z" />
    </>
  ),
  gauge: (
    <>
      <path d="M-12 6 A12 12 0 1 1 12 6" />
      <path d="M0 4 L7 -6" />
      <circle cx="0" cy="4" r="2" />
    </>
  ),
  route: (
    <>
      <circle cx="-11" cy="9" r="2.6" />
      <circle cx="11" cy="-9" r="2.6" />
      <path d="M-8 9 H2 a4 4 0 0 0 0 -8 H-2 a4 4 0 0 1 0 -8 H8" />
    </>
  ),
  eye: (
    <>
      <path d="M-14 0 C -8 -9, 8 -9, 14 0 C 8 9, -8 9, -14 0 Z" />
      <circle r="4" />
    </>
  ),
  spark: <path d="M0 -13 L3 -3 L13 0 L3 3 L0 13 L-3 3 L-13 0 L-3 -3 Z" />,
};

/** `hex` mixed with white (k = share of white): the light end of a station's gradient. */
function lighten(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `rgb(${c.join(',')})`;
}

interface Props {
  done: Done;
  cover: Record<TopicId, TopicCover>;
  /** The 단원 being studied now (null when every 단원 is done). */
  now: CategoryId | null;
  /** Play again when this changes (the equipment was changed). */
  replay: number;
  onStop(cat: CategoryId): void;
}

export default function Roadmap({ done, cover, now, replay, onStop }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);
  // A new key re-mounts the picture, which starts its CSS animations over.
  const [run, setRun] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setGo(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // A change of equipment (`replay`) plays it again too.
  const playing = go || replay > 0;
  const key = (e: KeyboardEvent, c: CategoryId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onStop(c);
    }
  };
  return (
    <section className={css.road} aria-label="학습 로드맵">
      <header>
        <b>학습 로드맵</b>
        <small>
          왼쪽에서 오른쪽으로 · 앞 단원이 다음 단원의 바탕이 돼요
          <button
            type="button"
            className={css.replay}
            onClick={() => {
              setRun((r) => r + 1);
              setGo(true);
            }}
          >
            ↻ 다시 보기
          </button>
        </small>
      </header>
      <div className={css.sv} ref={box}>
        <svg key={`${run}-${replay}`} className={css.svg} data-go={playing || undefined} viewBox="0 0 1120 268" role="img" aria-label="학습 로드맵: 1 기초 로봇공학부터 8 로봇 학습, 마지막 캡스톤까지">
          <defs>
            {PARTS.map((p) => (
              <linearGradient key={p.id} id={`rm-${p.id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={lighten(p.color, 0.45)} />
                <stop offset="1" stopColor={p.color} />
              </linearGradient>
            ))}
            <linearGradient id="rm-road" x1="0" x2="1">
              <stop offset="0" stopColor={PARTS[0].color} />
              <stop offset="0.36" stopColor={PARTS[0].color} />
              <stop offset="0.42" stopColor={PARTS[1].color} />
              <stop offset="0.6" stopColor={PARTS[1].color} />
              <stop offset="0.66" stopColor={PARTS[2].color} />
              <stop offset="1" stopColor={PARTS[2].color} />
            </linearGradient>
            <radialGradient id="rm-gold" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#ffe7a3" />
              <stop offset="1" stopColor="#e09a12" />
            </radialGradient>
            <filter id="rm-sh" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#101828" floodOpacity="0.22" />
            </filter>
          </defs>
          {PARTS.map((p, i) => (
            <g key={p.id} className={css.zone} style={{ animationDelay: `${i * 0.12}s` }}>
              <rect x={ZONES[i][0]} y="8" width={ZONES[i][1]} height="252" rx="22" fill={p.soft} />
              <text x={ZONES[i][0] + 18} y="34" className={css.zTitle} fill={p.color}>
                {p.no} {p.title}
              </text>
              <text x={ZONES[i][0] + 18} y="52" className={css.zSub} fill={p.color}>
                단원 {p.subjects.join(' · ')}
              </text>
            </g>
          ))}
          <path className={css.roadline} d={PATH} pathLength={1} fill="none" stroke="url(#rm-road)" strokeWidth="16" strokeLinecap="round" opacity="0.9" />
          <path className={css.flow} d={PATH} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
          {CATEGORIES.map((c, i) => {
            const part = partOf(c.id);
            const stop = UNIT_STOP[c.id];
            const low = Y[i] > 140;
            const real = topicsOf(c.id).some((t) => cover[t.id]);
            const fin = subjectComplete(c.id, done);
            const here = now === c.id;
            return (
              <g key={c.id} transform={`translate(${X[i]} ${Y[i]})`}>
                <g
                  className={css.st}
                  data-sim={real ? undefined : true}
                  tabIndex={0}
                  role="button"
                  aria-label={`${c.id}단원 ${c.title}${fin ? ' (마침)' : here ? ' (지금 여기)' : ''}${real ? '' : ' · 시뮬레이터로'}: 단원 카드로 가기`}
                  onClick={() => onStop(c.id)}
                  onKeyDown={(e) => key(e, c.id)}
                >
                  <g className={css.pop} style={{ animationDelay: `${0.5 + i * 0.13}s` }}>
                    {here && <circle className={css.halo} r="30" fill="none" stroke={part.color} strokeWidth="3" />}
                    <circle className={css.disc} r="30" fill={`url(#rm-${part.id})`} stroke="#fff" strokeWidth="4" filter="url(#rm-sh)" />
                    <g className={css.disc} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      {ICONS[stop.icon]}
                    </g>
                    <circle cx="22" cy="-22" r="11" fill={fin ? '#12935f' : '#fff'} stroke={fin ? '#12935f' : part.color} strokeWidth="2" />
                    <text x="22" y="-18" textAnchor="middle" className={css.badge} fill={fin ? '#fff' : part.color}>
                      {fin ? '✓' : c.id}
                    </text>
                    <text y={low ? -64 : here ? 80 : 54} textAnchor="middle" className={css.tBig}>
                      {stop.name}
                    </text>
                    <text y={low ? -46 : here ? 98 : 72} textAnchor="middle" className={css.tSub}>
                      {real ? stop.sub : '시뮬레이터로'}
                    </text>
                  </g>
                </g>
                {here && (
                  <g className={css.here}>
                    <rect x="-38" y="38" width="76" height="22" rx="11" fill="#2f5be7" />
                    <text y="53" textAnchor="middle" className={css.hereText}>
                      지금 여기
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          <g transform={`translate(${CAP[0]} ${CAP[1]})`}>
            <g className={css.st} tabIndex={0} role="button" aria-label="캡스톤 8-2 보고 판단해 집어 놓기: 8단원 카드로 가기" onClick={() => onStop('8')} onKeyDown={(e) => key(e, '8')}>
              <g className={css.pop} style={{ animationDelay: `${0.5 + 8 * 0.13}s` }}>
                <g className={css.shine}>
                  <path d="M0 -50 L4 -40 L0 -30 L-4 -40 Z M50 0 L40 4 L30 0 L40 -4 Z M0 50 L-4 40 L0 30 L4 40 Z M-50 0 L-40 -4 L-30 0 L-40 4 Z" fill="#f5b82e" opacity="0.7" />
                </g>
                <circle r="32" fill="url(#rm-gold)" stroke="#fff" strokeWidth="4" filter="url(#rm-sh)" />
                <path d="M-8 14 V-14 M-8 -14 H11 L6 -7 L11 0 H-8" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                <text y="58" textAnchor="middle" className={css.tBig}>
                  캡스톤
                </text>
                <text y="76" textAnchor="middle" className={css.tSub}>
                  보고 판단해
                </text>
                <text y="92" textAnchor="middle" className={css.tSub}>
                  집어 놓기
                </text>
              </g>
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
}
