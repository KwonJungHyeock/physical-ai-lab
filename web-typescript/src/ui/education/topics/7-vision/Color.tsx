'use client';

/** G2 색으로 찾기 (활동 1 · 2 · 3 = steps A · B · C): A hue/saturation thresholds → mask and centroid; B lighting with RGB vs HSV rules; C two red blocks, one partly hidden by the arm → two blobs, one off-centre. */

import { useEffect, useMemo, useState } from 'react';
import { Quaternion, Vector3 } from 'three';

import type { BlockPose } from '@/engine/physics/physics';

import { Sym } from '../../lesson/Rich';
import css from '../../learn.module.css';
import { Readout } from '../../widgets';
import { CamImage, Cross, IMG_H, IMG_W, Pair, armBoxes, blobsOf, cube, develop, frustumLines, lookAt, maskImage, project, shoot, threshold, type CamBox, type ColorRule, type MaskBlob } from '../gcam';
import { HOME_POSE, LEARN_COLORS, Verdict, fmt, reachFor, useGlide, usePose, type Mm } from '../kit';
import type { TopicProps } from '../types';

const CAM = lookAt([190, 0, 520], [190, 0, 0], [1, 0, 0], 400);
/** mm per pixel at the blocks' top faces (495 mm from the lens). */
const MM_PER_PX = 495 / 400;
const RED: [number, number, number] = [205, 35, 40];
type Named = CamBox & { name: string; hex: string };
const AB_BLOCKS: Named[] = [
  { ...cube(1, 205, 35, RED), name: '빨강 블록', hex: '#d42a2f' },
  { ...cube(2, 245, -60, [235, 130, 30]), name: '주황 물체', hex: '#eb821e' },
  { ...cube(3, 150, -55, [230, 110, 160]), name: '분홍 물체', hex: '#e66ea0' },
];
const C_BLOCKS: Named[] = [
  { ...cube(1, 215, 45, RED), name: '빨강 1', hex: '#d42a2f' },
  { ...cube(2, 165, -65, RED), name: '빨강 2 (가림)', hex: '#d42a2f' },
];
const COVER_AT: Mm = [160, -75, 80];
/** The HSV rule used in B and C. */
const HSV_RULE: ColorRule = { mode: 'hsv', hMin: -15, hMax: 15, sMin: 0.45, vMin: 0.1 };
const RGB_RULE: ColorRule = { ...HSV_RULE, mode: 'rgb' };
const DARKEST = 0.3;

const topPx = (b: CamBox) => project(CAM, [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.max[2]])!;
const asPoses = (bs: readonly Named[]): BlockPose[] =>
  bs.map((b) => ({ id: `g2-${b.id}-${b.min[0]}`, color: b.hex, size: 25, at: new Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, 12.5), q: new Quaternion(), held: false }));
const AB_POSES = asPoses(AB_BLOCKS);
const C_POSES = asPoses(C_BLOCKS);

interface Look {
  img: Uint8ClampedArray;
  mask: Uint8Array;
  maskRgba: Uint8ClampedArray;
  blobs: MaskBlob[];
}

function look(shot: ReturnType<typeof shoot>, light: number, rule: ColorRule): Look {
  const img = develop(shot, light, 8);
  const mask = threshold(img, rule);
  return { img, mask, maskRgba: maskImage(mask), blobs: blobsOf(mask, IMG_W, IMG_H) };
}

/** Did it find the red block alone? Result text and centroid error (px). */
function judge(blobs: readonly MaskBlob[]): { found: boolean; text: string; errPx: number | null } {
  const [tu, tv] = topPx(AB_BLOCKS[0]);
  if (!blobs.length) return { found: false, text: '못 찾음', errPx: null };
  const e = Math.hypot(blobs[0].u - tu, blobs[0].v - tv);
  if (e > 10) return { found: false, text: blobs.length > 1 ? `잘못 찾음 (${blobs.length}개 잡힘)` : '잘못 찾음 (다른 물체)', errPx: e };
  if (blobs.length > 1) return { found: false, text: `다른 것도 잡힘 (${blobs.length}개)`, errPx: e };
  return { found: true, text: '찾음', errPx: e };
}

const pxText = (e: number | null) => (e == null ? '—' : `${fmt(e)} px (≈ ${fmt(e * MM_PER_PX)} mm)`);

export default function G2Color({ chain, show, step, record }: TopicProps) {
  const [q, setQ, qRef] = usePose(HOME_POSE);
  const { glide, running } = useGlide(setQ, qRef);
  const [armQ, setArmQ] = useState<number[]>(HOME_POSE.slice());
  const [hMin, setHMin] = useState(-40);
  const [hMax, setHMax] = useState(40);
  const [sMin, setSMin] = useState(0.2);
  const [light, setLight] = useState(1);
  const [mode, setMode] = useState<'rgb' | 'hsv'>('rgb');
  const [covered, setCovered] = useState(false);

  const isC = step === 'C';
  const blocks = isC ? C_BLOCKS : AB_BLOCKS;
  const shotAB = useMemo(() => shoot(CAM, { boxes: [...AB_BLOCKS, ...armBoxes(chain, HOME_POSE)] }), [chain]);
  const shotC = useMemo(() => shoot(CAM, { boxes: [...C_BLOCKS, ...armBoxes(chain, armQ)] }), [chain, armQ]);
  const ruleA: ColorRule = useMemo(() => ({ mode: 'hsv', hMin, hMax, sMin, vMin: 0.1 }), [hMin, hMax, sMin]);
  const rule = step === 'A' ? ruleA : step === 'B' ? (mode === 'rgb' ? RGB_RULE : HSV_RULE) : HSV_RULE;
  const view = useMemo(() => (step === 'cmp' ? null : look(isC ? shotC : shotAB, step === 'B' ? light : 1, rule)), [step, isC, shotC, shotAB, light, rule]);
  const verdict = view && !isC ? judge(view.blobs) : null;

  // C: which blob belongs to which block, and how far its centre is from the block's.
  const cMatch = useMemo(() => {
    if (!view || !isC) return [];
    return C_BLOCKS.map((b) => {
      const [tu, tv] = topPx(b);
      const near = view.blobs.map((k) => ({ k, e: Math.hypot(k.u - tu, k.v - tv) })).sort((x, y) => x.e - y.e)[0];
      return { name: b.name, err: near && near.e < 15 ? near.e : null };
    });
  }, [view, isC]);

  const setA = (h0: number, h1: number, s: number) => {
    setHMin(h0);
    setHMax(h1);
    setSMin(s);
    const j = judge(look(shotAB, 1, { mode: 'hsv', hMin: h0, hMax: h1, sMin: s, vMin: 0.1 }).blobs);
    record('A', { 조건: `보통 밝기, 색상 ${h0}°~${h1}°`, 결과: j.text, '위치 오차': pxText(j.errPx) });
  };

  const setL = (l: number) => {
    setLight(l);
    if (l > DARKEST + 0.01) return;
    const r = judge(look(shotAB, l, RGB_RULE).blobs);
    const h = judge(look(shotAB, l, HSV_RULE).blobs);
    record('B', { 조건: `가장 어둡게 (×${fmt(l, 2)})`, 결과: `RGB ${r.text} · HSV ${h.text}`, '위치 오차': `HSV ${pxText(h.errPx)}` });
  };

  const toggleCover = () => {
    const next = !covered;
    setCovered(next);
    const a = next ? reachFor(chain, COVER_AT, qRef.current) : HOME_POSE.slice();
    if (!a) return;
    glide(a, 1.1, () => {
      setArmQ(a);
      if (!next) return;
      const shot = shoot(CAM, { boxes: [...C_BLOCKS, ...armBoxes(chain, a)] });
      const l = look(shot, 1, HSV_RULE);
      const [tu, tv] = topPx(C_BLOCKS[1]);
      const hid = l.blobs.map((k) => Math.hypot(k.u - tu, k.v - tv)).sort((x, y) => x - y)[0];
      record('C', { 조건: '블록 2개, 1개는 팔이 가림', 결과: `덩어리 ${l.blobs.length}개 찾음`, '위치 오차': `가린 블록 ${pxText(hid != null && hid < 15 ? hid : null)}` });
    });
  };

  // Comparison thumbnails.
  const thumbs = useMemo(() => {
    if (step !== 'cmp') return null;
    const shotCov = shoot(CAM, { boxes: [...C_BLOCKS, ...armBoxes(chain, reachFor(chain, COVER_AT, HOME_POSE) ?? HOME_POSE)] });
    return [
      { key: 'A', title: `활동 1 보통 밝기 (색상 ${hMin}°~${hMax}°)`, l: look(shotAB, 1, ruleA) },
      { key: 'B1', title: `활동 2 어둡게 ×${DARKEST} · RGB 기준`, l: look(shotAB, DARKEST, RGB_RULE) },
      { key: 'B2', title: `활동 2 어둡게 ×${DARKEST} · HSV 기준`, l: look(shotAB, DARKEST, HSV_RULE) },
      { key: 'C', title: '활동 3 두 개 · 하나 가림', l: look(shotCov, 1, HSV_RULE) },
    ];
  }, [step, chain, shotAB, ruleA, hMin, hMax]);

  const stageQ = isC ? q : HOME_POSE;
  useEffect(() => {
    show({
      angles: stageQ,
      blocks: isC ? C_POSES : AB_POSES,
      lines: frustumLines(CAM, LEARN_COLORS.path),
      labels: [
        { key: 'cam', mm: [CAM.pos[0], CAM.pos[1], CAM.pos[2] + 14], text: step === 'B' ? `카메라 · 조명 ×${fmt(light, 2)}` : '위 카메라', color: LEARN_COLORS.path },
        ...(isC && covered ? [{ key: 'cover', mm: [C_BLOCKS[1].max[0], C_BLOCKS[1].max[1], 60] as Mm, text: '팔이 가림', color: LEARN_COLORS.bad }] : []),
      ],
    });
  }, [show, stageQ, isC, step, light, covered]);

  if (step === 'cmp')
    return (
      <section className={css.card}>
        <h3>세 조건의 마스크</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {thumbs?.map((t) => (
            <CamImage key={t.key} rgba={t.l.maskRgba} caption={`${t.title} — 덩어리 ${t.l.blobs.length}개`}>
              {t.l.blobs.map((b, i) => (
                <Cross key={i} u={b.u} v={b.v} color={LEARN_COLORS.bad} />
              ))}
            </CamImage>
          ))}
        </div>
        <p className={css.note}>범위가 맞으면 블록 하나만 하얗게 남아요(활동 1). 어두우면 RGB 기준은 놓치거나 주황을 잡고, HSV 기준은 버텨요(활동 2). 가리면 보이는 부분만 잡혀 가운데가 어긋나요(활동 3).</p>
      </section>
    );

  const marks = view?.blobs.map((b, i) => <Cross key={i} u={b.u} v={b.v} color={i === 0 && !isC ? LEARN_COLORS.ok : LEARN_COLORS.bad} />);
  const truth = blocks.filter((b) => b.rgb === RED).map((b) => topPx(b));

  return (
    <section className={css.card}>
      <h3>{step === 'A' ? '임계값: 빨강만 남기기' : step === 'B' ? '조명이 바뀌면' : '여러 개 · 가림'}</h3>
      {step === 'A' && (
        <>
          <label className={css.slider}>
            <b>
              <Sym s="H" /> 최소
            </b>
            <input type="range" min={-90} max={90} step={1} value={hMin} onChange={(e) => setA(Math.min(Number(e.target.value), hMax), hMax, sMin)} aria-label="H 최소" />
            <span className={css.num}>{hMin}°</span>
          </label>
          <label className={css.slider}>
            <b>
              <Sym s="H" /> 최대
            </b>
            <input type="range" min={-90} max={90} step={1} value={hMax} onChange={(e) => setA(hMin, Math.max(Number(e.target.value), hMin), sMin)} aria-label="H 최대" />
            <span className={css.num}>{hMax}°</span>
          </label>
          <label className={css.slider}>
            <b>
              <Sym s="S" /> 최소
            </b>
            <input type="range" min={0} max={1} step={0.05} value={sMin} onChange={(e) => setA(hMin, hMax, Number(e.target.value))} aria-label="S 최소" />
            <span className={css.num}>{fmt(sMin, 2)}</span>
          </label>
        </>
      )}
      {step === 'B' && (
        <>
          <label className={css.slider}>
            <b>조명</b>
            <input type="range" min={DARKEST} max={1.6} step={0.05} value={light} onChange={(e) => setL(Number(e.target.value))} aria-label="조명" />
            <span className={css.num}>×{fmt(light, 2)}</span>
          </label>
          <div className={css.seg} role="group" aria-label="기준">
            <button type="button" aria-pressed={mode === 'rgb'} onClick={() => setMode('rgb')}>
              RGB기준
            </button>
            <button type="button" aria-pressed={mode === 'hsv'} onClick={() => setMode('hsv')}>
              HSV기준
            </button>
          </div>
        </>
      )}
      {step === 'C' && (
        <div className={css.btnRow}>
          <button type="button" className={css.primary} disabled={running} onClick={toggleCover}>
            {covered ? '팔 치우기' : '팔로 가리기'}
          </button>
        </div>
      )}
      {view && (
        <Pair>
          <CamImage rgba={view.img} caption="카메라 화면">
            {truth.map((t, i) => (
              <circle key={i} cx={t[0]} cy={t[1]} r={3} fill="none" stroke="#fff" strokeWidth={1.5} />
            ))}
            {marks}
          </CamImage>
          <CamImage rgba={view.maskRgba} caption="마스크 (하양 = 빨강으로 본 곳)">
            {marks}
          </CamImage>
        </Pair>
      )}
      {!isC && verdict && (
        <div className={css.row3}>
          <Readout label="덩어리 수" value={String(view!.blobs.length)} unit="개" />
          <Readout label="결과" value={verdict.text} tone={verdict.found ? 'ok' : 'bad'} />
          <Readout label="위치 오차" value={verdict.errPx == null ? '—' : fmt(verdict.errPx)} unit={verdict.errPx == null ? undefined : 'px'} />
        </div>
      )}
      {isC && view && (
        <div className={css.row3}>
          <Readout label="덩어리 수" value={String(view.blobs.length)} unit="개" />
          {cMatch.map((m) => (
            <Readout key={m.name} label={`${m.name} 가운데 오차`} value={m.err == null ? '못 찾음' : fmt(m.err)} unit={m.err == null ? undefined : 'px'} tone={m.err == null ? 'bad' : m.err < 2 ? 'ok' : 'warn'} />
          ))}
        </div>
      )}
      {step === 'B' && light <= DARKEST + 0.01 && verdict && (
        <Verdict tone={verdict.found ? 'ok' : 'bad'}>
          가장 어두울 때 {mode === 'rgb' ? 'RGB' : 'HSV'} 기준: {verdict.text}. {mode === 'rgb' ? 'HSV기준도 눌러 보세요.' : 'RGB기준도 눌러 보세요.'}
        </Verdict>
      )}
      <p className={css.note}>
        {step === 'A'
          ? '처음엔 범위가 넓어서 주황·분홍도 잡혀요. 색상(H) 범위를 0° 근처로 좁히고 채도(S)를 올려 빨강 블록만 남겨 보세요. + 는 덩어리의 가운데(무게중심), ○ 는 진짜 블록 가운데.'
          : step === 'B'
            ? `RGB기준 = 빨강 값 R ≥ 140, 초록 값 G ≤ 90, 파랑 값 B ≤ 90. HSV기준 = 색상 H ${HSV_RULE.hMin}°~${HSV_RULE.hMax}°, 채도 S ≥ ${HSV_RULE.sMin}. 조명을 가장 어둡게(×${DARKEST})까지 내려 두 기준을 비교해 보세요.`
            : '[팔로 가리기] 를 누르면 팔이 오른쪽 블록 위로 와서 일부를 가려요. 보이는 부분만 하얗게 남아 그 덩어리의 가운데(+)가 진짜 가운데(○)에서 어긋나요.'}
      </p>
    </section>
  );
}
