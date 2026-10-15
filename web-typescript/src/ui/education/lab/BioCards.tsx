'use client';

/**
 * 바이오 문제 ① 의 작업 지시, 카드 네 장 (카드 모드 시범). Each card tells one thing with a picture,
 * and the 3D view (BioLab) turns to the same thing with the same number: ① 시료 랙 · ② 분석 랙 ·
 * ③ 시험관. Every number on the cards comes from the engine (bio.ts) or the lesson script (bioText).
 */

import type { CSSProperties } from 'react';

import { DST, HEADSPACE_MM, SRC, TUBE } from '@/engine/education/lab/bio';
import type { SiteText } from '@/engine/education/lab/siteText';

import { fmt, type DeckCard } from './SiteFlow';
import dk from './deck.module.css';

const site: CSSProperties = { fill: 'var(--site)' };
/** The sample's colour, as the first tube in the 3D bench (BioCell). */
const SAMPLE = '#b3262e';
const ink = '#101828';
const mute = '#667085';
const line = '#d0d5dd';

/** The copied place pose from the script's brief: "[150, −100, 125, −180, −35, −33.7]". */
function copiedPose(T: SiteText): string[] {
  const m = /\[([^\]]+)\]/.exec(T.brief);
  return m ? m[1].split(',').map((s) => s.trim()) : [];
}

/** A rack seen from the front, with a tube in hole k (or an empty dashed hole). */
function Rack({ x, label, n, tube, at }: { x: number; label: string; n: string; tube: boolean; at: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x={0} y={92} width={92} height={26} rx={6} fill="#fff" stroke={line} />
      {[16, 36, 56, 76].map((cx) => (
        <ellipse key={cx} cx={cx} cy={92} rx={6.5} ry={2.2} fill="#eef0f4" stroke={line} />
      ))}
      {tube ? (
        <g>
          <rect x={30} y={38} width={12} height={62} rx={6} fill="#fff" stroke={ink} strokeWidth={1.2} />
          <rect x={31.5} y={42} width={9} height={56} rx={4.5} fill={SAMPLE} />
        </g>
      ) : (
        <rect x={30} y={38} width={12} height={62} rx={6} fill="none" stroke={mute} strokeDasharray="3 3" />
      )}
      <g transform="translate(-4 -2)">
        <circle cx={12} cy={14} r={11} style={site} />
        <text x={12} y={18.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
          {n}
        </text>
        <text x={28} y={18.5} fontSize={13.5} fontWeight={800} fill={ink}>
          {label}
        </text>
      </g>
      <text x={46} y={136} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={mute}>
        {at}
      </text>
    </g>
  );
}

function MoveFigure() {
  return (
    <svg viewBox="0 0 330 146" role="img" aria-label="① 시료 랙의 ③ 시험관을 ② 분석 랙으로 옮겨요">
      <defs>
        <marker id="bioArrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" style={site} />
        </marker>
      </defs>
      {/* as the 3D view shows them: ② on the left, ① on the right */}
      <Rack x={10} n="②" label="분석 랙" tube={false} at={`x ${DST[0]} · y ${fmt(DST[1])}`} />
      <Rack x={228} n="①" label="시료 랙" tube at={`x ${SRC[0]} · y ${fmt(SRC[1])}`} />
      <path d="M264 32 C 214 -8, 96 -8, 46 32" fill="none" stroke="var(--site)" strokeWidth={2.5} strokeDasharray="6 5" markerEnd="url(#bioArrow)" />
      <g transform="translate(147 42)">
        <circle cx={9} cy={9} r={10} fill="#fff" stroke="var(--site)" strokeWidth={2} />
        <text x={9} y={13.5} textAnchor="middle" fontSize={12} fontWeight={800} style={site}>
          ③
        </text>
        <text x={9} y={36} textAnchor="middle" fontSize={12.5} fontWeight={800} fill={ink}>
          시험관 1개
        </text>
      </g>
    </svg>
  );
}

/** The tube lying down, full to HEADSPACE_MM below the rim, with its size. */
function TubeFigure() {
  // Drawn 3.4 px per mm: 75 mm long, 12 mm across.
  const k = 3.4;
  const L = TUBE.len * k;
  const D = TUBE.d * k;
  const x0 = 28;
  const y0 = 34;
  const gap = HEADSPACE_MM * k;
  return (
    <svg viewBox="0 0 330 128" role="img" aria-label={`시험관 ${TUBE.d} × ${TUBE.len} mm, 입구에서 ${HEADSPACE_MM} mm 아래까지 시료`}>
      {/* the sample (bottom on the left, rim on the right) */}
      <path d={`M${x0 + D / 2} ${y0 + 3} H${x0 + L - gap} V${y0 + D - 3} H${x0 + D / 2} A${D / 2 - 3} ${D / 2 - 3} 0 0 1 ${x0 + D / 2} ${y0 + 3}z`} fill={SAMPLE} />
      <path d={`M${x0 + L} ${y0} H${x0 + D / 2} A${D / 2} ${D / 2} 0 0 0 ${x0 + D / 2} ${y0 + D} H${x0 + L}`} fill="none" stroke={ink} strokeWidth={1.6} />
      <line x1={x0 + L} y1={y0 - 3} x2={x0 + L} y2={y0 + D + 3} stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
      {/* the headspace */}
      <rect x={x0 + L - gap} y={y0 + 2} width={gap} height={D - 4} fill="#fff" />
      <path d={`M${x0 + L - gap} ${y0 - 10} v6 M${x0 + L} ${y0 - 10} v6 M${x0 + L - gap} ${y0 - 7} H${x0 + L}`} stroke="#e5484d" strokeWidth={1.6} fill="none" />
      <text x={x0 + L - gap / 2} y={y0 - 15} textAnchor="end" fontSize={13} fontWeight={800} fill="#e5484d">
        입구까지 {HEADSPACE_MM} mm
      </text>
      {/* length and diameter */}
      <path d={`M${x0} ${y0 + D + 16} H${x0 + L} M${x0} ${y0 + D + 11} v10 M${x0 + L} ${y0 + D + 11} v10`} stroke={mute} strokeWidth={1} fill="none" />
      <text x={x0 + L / 2} y={y0 + D + 34} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={mute}>
        길이 {TUBE.len} mm
      </text>
      <path d={`M${x0 - 12} ${y0} V${y0 + D} M${x0 - 17} ${y0} h10 M${x0 - 17} ${y0 + D} h10`} stroke={mute} strokeWidth={1} fill="none" />
      <text x={x0 - 20} y={y0 + D / 2 + 4} textAnchor="end" fontSize={12} fontWeight={700} fill={mute} transform={`rotate(-90 ${x0 - 20} ${y0 + D / 2})`}>
        {TUBE.d} mm
      </text>
      <text x={x0 + D / 2 + 8} y={y0 + D / 2 + 5} fontSize={13} fontWeight={800} fill="#fff">
        시료
      </text>
      <text x={x0 + L + 8} y={y0 + D / 2 + 5} fontSize={12} fontWeight={700} fill={mute}>
        입구
      </text>
    </svg>
  );
}

function PoseFigure({ T }: { T: SiteText }) {
  const v = copiedPose(T);
  const names = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
  const group = (label: string, from: number) => (
    <div className={dk.coordGroup}>
      <span>{label}</span>
      <div>
        {names.slice(from, from + 3).map((n, i) => (
          <span key={n} className={dk.chip}>
            <small>{n}</small>
            <b>{v[from + i] ?? '?'}</b>
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <div className={dk.coords}>
        {group('어디에 · 위치', 0)}
        {group('어떤 방향으로 · 방향', 3)}
      </div>
      <p className={dk.from}>시약 붓기 프로그램의 놓는 좌표를 그대로 복사</p>
    </>
  );
}

function RunFigure() {
  const steps = ['라인 가동', '장면 보기', '원인 찾기'];
  return (
    <svg viewBox="0 0 330 92" role="img" aria-label="라인 가동, 장면 보기, 원인 찾기 순서">
      {steps.map((s, i) => {
        const cx = 50 + i * 115;
        const on = i === 0;
        return (
          <g key={s}>
            {i > 0 && <path d={`M${cx - 85} 34 H${cx - 32}`} stroke={line} strokeWidth={2} strokeDasharray="4 4" />}
            <circle cx={cx} cy={34} r={24} fill={on ? 'var(--site)' : '#fff'} stroke={on ? 'none' : line} strokeWidth={1.5} />
            {i === 0 && <path d={`M${cx - 6} ${34 - 10} L${cx + 11} 34 L${cx - 6} ${34 + 10}z`} fill="#fff" />}
            {i === 1 && (
              <g fill="none" stroke={mute} strokeWidth={2}>
                <path d={`M${cx - 13} 34 Q${cx} 21 ${cx + 13} 34 Q${cx} 47 ${cx - 13} 34z`} />
                <circle cx={cx} cy={34} r={4} />
              </g>
            )}
            {i === 2 && (
              <g fill="none" stroke={mute} strokeWidth={2.2} strokeLinecap="round">
                <circle cx={cx - 3} cy={31} r={8} />
                <path d={`M${cx + 3} 37 l7 7`} />
              </g>
            )}
            <text x={cx} y={80} textAnchor="middle" fontSize={13} fontWeight={800} fill={on ? ink : mute}>
              {i + 1}. {s}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** The four brief cards of 바이오 ①: the job, the tube, the copied pose, and the first run. */
export function bioBriefCards(T: SiteText, boss: string): DeckCard[] {
  return [
    {
      kicker: '오늘 할 일',
      title: '시험관 1개를 분석 랙으로 옮겨요',
      visual: <MoveFigure />,
      body: (
        <>
          <p>
            <b>① 시료 랙</b>에서 <b>③ 시험관</b>을 집어 <b>② 분석 랙</b>에 꽂아요. 오른쪽 3D에도 같은 번호가 있어요.
          </p>
          <span className={dk.rule}>
            <small>작업 기준</small>시료를 쏟지 않기
          </span>
          <details className={dk.goals}>
            <summary>이번 실습에서 배울 것 {T.goals.length}가지</summary>
            <ol>
              {T.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ol>
          </details>
        </>
      ),
    },
    {
      kicker: '③ 시험관',
      title: '오늘 시료는 가득 차 있어요',
      visual: <TubeFigure />,
      body: (
        <p>
          유리 시험관이에요. 시료가 입구에서 <b>{HEADSPACE_MM} mm</b> 아래까지 차 있어요.
        </p>
      ),
    },
    {
      kicker: '② 분석 랙 · 놓는 좌표',
      title: '어제 복사해 온 좌표예요',
      visual: <PoseFigure T={T} />,
      body: (
        <>
          <p>붓기는 병을 기울이는 작업이에요. 숫자 여섯 개로 놓는 자세를 정해요.</p>
          <p className={dk.say}>
            <small>{boss}</small>
            {T.boss.replace(/^"|"$/g, '')}
          </p>
        </>
      ),
    },
    {
      kicker: '라인 가동',
      title: '지금 프로그램 그대로 한 번 돌려 봐요',
      visual: <RunFigure />,
      body: (
        <p>
          값은 아직 바꾸지 않아요. 아래 <b>[▶ 라인 가동]</b>을 누르고, 오른쪽 화면을 지켜봐요.
        </p>
      ),
    },
  ];
}
