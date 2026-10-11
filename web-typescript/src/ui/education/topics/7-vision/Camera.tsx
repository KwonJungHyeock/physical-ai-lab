'use client';

/** G1 카메라와 좌표 (활동 1 · 2 · 3 = steps A · B · C): A click a block in the camera picture → pixel (u, v); B calibrate with 4 markers (homography) → table mm, the arm goes above it; C the camera on the hand — the pixel changes, the table mm stays (hand–eye transform). */

import { useEffect, useMemo, useState } from 'react';
import { Quaternion, Vector3 } from 'three';

import type { BlockPose } from '@/engine/physics/physics';

import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { CamImage, Cross, HAND_EYE, IMG_H, IMG_W, applyH, cube, develop, frustumLines, handCam, homography, lookAt, project, shoot, toPlane, topCentrePx, type CamBox } from '../gcam';
import { HOME_POSE, LEARN_COLORS, RealButton, Verdict, fmt, reachFor, useGlide, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

/** The fixed camera: 62 cm above the table, looking down (picture top = +x, away from the robot). */
const FIXED = lookAt([165, 0, 620], [190, 0, 0], [1, 0, 0], 470);
const MARKERS: [number, number][] = [
  [100, -120],
  [100, 120],
  [290, -120],
  [290, 120],
];
const BLOCK_TOP = 25;
const BLOCKS: (CamBox & { name: string; hex: string })[] = [
  { ...cube(1, 235, 55, [205, 45, 45]), name: '빨강', hex: '#e5484d' },
  { ...cube(2, 150, -75, [50, 90, 205]), name: '파랑', hex: '#3454d1' },
  { ...cube(3, 265, -45, [45, 165, 80]), name: '초록', hex: '#1fae66' },
];
const SCENE = { boxes: BLOCKS, markers: MARKERS.map((at) => ({ at, size: 28 })) };
const HAND_POSES: Mm[] = [
  [180, 20, 190],
  [160, 40, 210],
  [200, 70, 160],
];
const centreOf = (b: CamBox): [number, number] => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
const BLOCK_POSES: BlockPose[] = BLOCKS.map((b) => ({ id: `b${b.id}`, color: b.hex, size: 25, at: new Vector3(...centreOf(b), 12.5), q: new Quaternion(), held: false }));
/** A guess without calibration: "1 px = 1 mm, the picture's middle is 200 mm in front of the robot". */
const naiveMm = (u: number, v: number): [number, number] => [200 - (v - IMG_H / 2), -(u - IMG_W / 2)];

interface Pick {
  step: 'A' | 'B' | 'C';
  id: number;
  u: number;
  v: number;
  /** Table position worked out (mm), when the step can. */
  mm: [number, number] | null;
  err: number | null;
}

interface HandRow {
  pose: number;
  u: number;
  v: number;
  mm: [number, number];
  err: number;
}

export default function G1Camera({ chain, show, real, step, record }: TopicProps) {
  const [q, setQ, qRef] = usePose(HOME_POSE);
  const { glide, running } = useGlide(setQ, qRef);
  const [pick, setPick] = useState<Pick | null>(null);
  const [cal, setCal] = useState<{ px: [number, number][]; H: number[] } | null>(null);
  const [rows, setRows] = useState<HandRow[]>([]);
  const [handPose, setHandPose] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const onHand = step === 'C';
  const cam = useMemo(() => (onHand ? handCam(chain, q) : FIXED), [onHand, chain, q]);
  const shot = useMemo(() => shoot(cam, SCENE), [cam]);
  const rgba = useMemo(() => develop(shot, 1, 6), [shot]);
  const cur = pick && pick.step === step ? pick : null;

  const calibrate = () => {
    const px = MARKERS.map((m) => {
      const p = project(FIXED, [m[0], m[1], 0])!;
      return [Math.round(p[0]), Math.round(p[1])] as [number, number];
    });
    const H = homography(px, MARKERS);
    if (H) setCal({ px, H });
  };

  const measureRed = (pose: number, qq: readonly number[]) => {
    const c = handCam(chain, qq);
    const p = topCentrePx(c, BLOCKS[0]);
    if (!p || p[0] < 0 || p[0] >= IMG_W || p[1] < 0 || p[1] >= IMG_H) return;
    const m = toPlane(c, p[0], p[1], BLOCK_TOP);
    if (!m) return;
    const t = centreOf(BLOCKS[0]);
    const row: HandRow = { pose, u: p[0], v: p[1], mm: [m[0], m[1]], err: Math.hypot(m[0] - t[0], m[1] - t[1]) };
    const next = [...rows.filter((r) => r.pose !== pose), row].sort((a, b) => a.pose - b.pose);
    setRows(next);
    if (next.length >= 2) record('C', { '위치 단위': 'mm', '블록 위치 오차': `${fmt(Math.max(...next.map((r) => r.err)))} mm`, 카메라: `손 (자세 ${next.length}개)` });
  };

  const goPose = (i: number) => {
    const a = reachFor(chain, HAND_POSES[i], qRef.current);
    if (!a) return;
    setHandPose(i);
    glide(a, 1.2, () => measureRed(i, a));
  };

  const clickImage = (u: number, v: number) => {
    if (step === 'cmp' || running) return;
    const id = shot.id[Math.floor(v) * IMG_W + Math.floor(u)];
    const b = BLOCKS.find((k) => k.id === id);
    if (!b) {
      setMsg('블록(색 상자)을 눌러 보세요.');
      return;
    }
    pickBlock(b);
  };

  /** A block picked in the picture (or with its button): its pixel, and what each step can make of it. */
  const pickBlock = (b: (typeof BLOCKS)[number]) => {
    if (step === 'cmp' || running) return;
    const px0 = topCentrePx(cam, b);
    if (!px0 || px0[0] < 0 || px0[0] >= IMG_W || px0[1] < 0 || px0[1] >= IMG_H) {
      setMsg(`${b.name} 블록이 사진에 보이지 않아요.`);
      return;
    }
    setMsg('');
    const px = px0;
    const [tx, ty] = centreOf(b);
    if (step === 'A') {
      const g = naiveMm(px[0], px[1]);
      const err = Math.hypot(g[0] - tx, g[1] - ty);
      setPick({ step, id: b.id, u: px[0], v: px[1], mm: g, err });
      record('A', { '위치 단위': 'px (픽셀)', '블록 위치 오차': `알 수 없음 (어림 ${fmt(err, 0)} mm)`, 카메라: '고정' });
      return;
    }
    if (step === 'B') {
      if (!cal) {
        setPick({ step, id: b.id, u: px[0], v: px[1], mm: null, err: null });
        setMsg('먼저 [보정] 을 눌러 픽셀 → mm 변환을 구하세요.');
        return;
      }
      const [x, y] = applyH(cal.H, px[0], px[1]);
      const err = Math.hypot(x - tx, y - ty);
      setPick({ step, id: b.id, u: px[0], v: px[1], mm: [x, y], err });
      const a = reachFor(chain, [x, y, BLOCK_TOP + 40], qRef.current);
      if (a) glide(a, 1.2);
      record('B', { '위치 단위': 'mm', '블록 위치 오차': `${fmt(err)} mm`, 카메라: '고정' });
      return;
    }
    const m = toPlane(cam, px[0], px[1], BLOCK_TOP);
    setPick({ step: 'C', id: b.id, u: px[0], v: px[1], mm: m ? [m[0], m[1]] : null, err: m ? Math.hypot(m[0] - tx, m[1] - ty) : null });
  };

  const est = cur?.mm && step !== 'A' ? cur.mm : null;
  const curBlock = cur ? BLOCKS.find((b) => b.id === cur.id)! : null;
  const shownCam = step === 'cmp' ? null : cam;

  const scene = useMemo(() => {
    const truth = curBlock ? centreOf(curBlock) : null;
    return {
      angles: q,
      blocks: BLOCK_POSES,
      spots: MARKERS.map((m, i) => ({ key: `m${i}`, mm: [m[0], m[1], 0] as Mm, color: '#101828', label: `M${i + 1}` })),
      lines: [
        ...(step === 'cmp' ? [...frustumLines(FIXED, LEARN_COLORS.accent, 'fix'), ...frustumLines(handCam(chain, q), LEARN_COLORS.warn, 'hand')] : shownCam ? frustumLines(shownCam, onHand ? LEARN_COLORS.warn : LEARN_COLORS.accent) : []),
        ...(est && truth ? [{ key: 'err', points: [[est[0], est[1], BLOCK_TOP + 1], [truth[0], truth[1], BLOCK_TOP + 1]] as Mm[], color: LEARN_COLORS.bad, width: 3 }] : []),
      ],
      target: est ? { mm: [est[0], est[1], BLOCK_TOP] as Mm, ok: (cur?.err ?? 99) < 6, label: `(${fmt(est[0], 0)}, ${fmt(est[1], 0)}) mm` } : null,
      labels: [
        { key: 'cam', mm: [FIXED.pos[0], FIXED.pos[1], FIXED.pos[2] + 14] as Mm, text: '고정 카메라', color: LEARN_COLORS.accent },
        ...(onHand || step === 'cmp' ? [{ key: 'hcam', mm: handCam(chain, q).pos.map((c, i) => (i === 2 ? c + 30 : c)) as Mm, text: '손 카메라', color: LEARN_COLORS.warn }] : []),
      ],
    };
  }, [q, step, chain, shownCam, onHand, est, curBlock, cur]);

  useEffect(() => {
    show(scene);
  }, [show, scene]);

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>보정 없이 · 보정 후 · 손 카메라</h3>
        <p className={css.note}>파랑 = 고정 카메라가 보는 곳, 주황 = 손 카메라가 보는 곳. 픽셀만으로는 mm 를 모르고(활동 1), 마커로 보정하면 mm 가 나오며(활동 2), 손 카메라는 손-눈 변환을 더하면 어디서 봐도 같은 mm 가 나와요(활동 3).</p>
      </section>
    );

  const overlay = (
    <>
      {step === 'A' && (
        <text x={4} y={12} fontSize={10} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={2.5} paintOrder="stroke">
          (0, 0) → u
        </text>
      )}
      {step === 'A' && (
        <text x={4} y={26} fontSize={10} fontWeight={700} fill="#fff" stroke="#000" strokeWidth={2.5} paintOrder="stroke">
          ↓ v
        </text>
      )}
      {step === 'B' && cal && cal.px.map((p, i) => <Cross key={i} u={p[0]} v={p[1]} color="#f59a1b" size={6} label={`M${i + 1}`} />)}
      {cur && <Cross u={cur.u} v={cur.v} color="#7a5cf5" label={`(${cur.u}, ${cur.v})`} />}
    </>
  );

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '사진 속 위치: 픽셀' : step === 'B' ? '마커로 보정해 mm 로 바꾸기' : '손에 단 카메라로 보기'}</h3>
      {step === 'B' && (
        <div className={css.btnRow}>
          <button type="button" className={css.primary} onClick={calibrate}>
            보정
          </button>
          {cal && <small className={css.note}>마커 4개로 호모그래피 H 를 구했어요. 이제 블록을 눌러 보세요.</small>}
        </div>
      )}
      {(step === 'A' || step === 'B') && (
        <div className={css.seg} role="group" aria-label="블록 고르기">
          {BLOCKS.map((b) => (
            <button key={b.id} type="button" aria-pressed={cur?.id === b.id} disabled={running} onClick={() => pickBlock(b)}>
              {b.name}
            </button>
          ))}
        </div>
      )}
      {step === 'C' && (
        <div className={css.seg} role="group" aria-label="팔 자세">
          {HAND_POSES.map((_, i) => (
            <button key={i} type="button" aria-pressed={handPose === i} disabled={running} onClick={() => goPose(i)}>
              자세 {i + 1}
            </button>
          ))}
        </div>
      )}
      <CamImage
        rgba={rgba}
        onPick={clickImage}
        caption={step === 'C' ? '손 카메라 화면 (위 = 로봇 바깥쪽). 블록을 눌러 보세요.' : '고정 카메라 화면 (위 = 로봇 앞쪽). 블록을 눌러 보세요.'}
      >
        {overlay}
      </CamImage>
      {msg && <p className={css.warnNote}>{msg}</p>}

      {step === 'B' && cal && (
        <table className={css.matrix}>
          <caption>마커 4개: 픽셀 ↔ 책상 mm</caption>
          <tbody>
            {cal.px.map((p, i) => (
              <tr key={i}>
                <td>M{i + 1}</td>
                <td>
                  ({p[0]}, {p[1]}) px
                </td>
                <td>
                  ({MARKERS[i][0]}, {MARKERS[i][1]}) mm
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className={css.row3}>
        <Readout label="픽셀 (u, v)" value={cur ? `${cur.u}, ${cur.v}` : '—'} unit="px" />
        <Readout label={step === 'A' ? '책상 위치 (어림)' : '책상 위치 (x, y)'} value={cur?.mm ? `${fmt(cur.mm[0], 0)}, ${fmt(cur.mm[1], 0)}` : '—'} unit="mm" />
        <Readout
          label="실제와 오차"
          value={cur?.err != null ? (step === 'A' ? '알 수 없음' : fmt(cur.err)) : '—'}
          unit={cur?.err != null && step !== 'A' ? 'mm' : undefined}
          tone={cur?.err == null ? undefined : step === 'A' ? 'bad' : cur.err < 6 ? 'ok' : 'warn'}
        />
      </div>

      {step === 'A' && cur && cur.err != null && (
        <Verdict tone="warn">
          픽셀만으로는 mm 를 몰라요. &quot;1 px = 1 mm, 가운데 = 앞 200 mm&quot; 로 어림하면 ({fmt(cur.mm![0], 0)}, {fmt(cur.mm![1], 0)}) 이고, 실제와 {fmt(cur.err, 0)} mm 차이가 나요.
        </Verdict>
      )}
      {step === 'B' && cur?.err != null && (
        <Verdict tone={cur.err < 6 ? 'ok' : 'warn'}>
          {curBlock?.name} 블록: 실제와 {fmt(cur.err)} mm. 팔이 그 위 40 mm 로 가요.
        </Verdict>
      )}
      {step === 'C' && rows.length > 0 && (
        <table className={css.matrix}>
          <caption>같은 빨강 블록을 여러 자세에서 보기</caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pose}>
                <td>자세 {r.pose + 1}</td>
                <td>
                  ({r.u}, {r.v}) px
                </td>
                <td>
                  ({fmt(r.mm[0], 1)}, {fmt(r.mm[1], 1)}) mm
                </td>
                <td>오차 {fmt(r.err)} mm</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {step === 'B' && <RealButton real={real} chain={chain} angles={q} label="실물 로봇으로 블록 위에 가기" />}
      <p className={css.note}>
        {step === 'A'
          ? '사진 왼쪽 위가 (0, 0), 오른쪽으로 u, 아래로 v 가 커져요. 픽셀은 사진 속 칸 번호일 뿐, 책상에서 몇 mm 인지는 몰라요.'
          : step === 'B'
            ? '책상 위 위치를 아는 마커 4개(M1~M4)의 픽셀을 찾아 픽셀 → mm 변환(호모그래피)을 구해요. 남은 몇 mm 는 블록 윗면이 마커(책상 면)보다 25 mm 높아서 생기는 시차예요.'
            : `팔 자세를 바꾸면 블록의 픽셀은 바뀌어요. 손끝 포즈 × 손-눈 변환(카메라는 플랜지 축에서 ${fmt(HAND_EYE.offset[0], 0)} mm 옆, 플랜지 면에서 ${fmt(HAND_EYE.offset[2], 0)} mm 아래, 손끝과 같은 쪽을 봄)으로 카메라 광선을 책상 위 블록 높이(25 mm)까지 그으면 책상 좌표는 같아요.`}
      </p>
    </section>
  );
}
