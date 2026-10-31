'use client';

/**
 * 손 따라하기: the PC's camera finds one hand (MediaPipe Hand Landmarker, loaded from this site —
 * public/vision/, no internet), draws it over the picture and hands its pose to the console, which
 * moves the tool after it (engine: src/engine/vision/hand.ts). The steps: 카메라 켜기 → 따라 하기
 * (the hand now = the tool now) → 녹화 → 재생 or 공정으로. The picture stays on this PC: nothing is
 * saved or sent.
 */

import { useEffect, useRef, useState } from 'react';

import { handPose, type HandPose, type Landmark } from '@/engine/vision/hand';

import css from './hand.module.css';

/** The bones drawn between landmarks (MediaPipe's hand connections). */
const BONES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

interface Landmarker {
  detectForVideo(video: HTMLVideoElement, ms: number): { landmarks: Landmark[][] };
  close(): void;
}

async function loadLandmarker(): Promise<Landmarker> {
  const vision = await import('@mediapipe/tasks-vision');
  const files = await vision.FilesetResolver.forVisionTasks(new URL('/vision', location.origin).href);
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL('/vision/hand_landmarker.task', location.origin).href, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  // The GPU is faster; a PC without WebGL2 for it runs on the CPU.
  return (await make('GPU').catch(() => make('CPU'))) as unknown as Landmarker;
}

export type HandState = 'idle' | 'follow' | 'record';

export default function HandPanel(p: {
  state: HandState;
  /** Seconds and kept points of the demonstration being made or last made. */
  demo: { seconds: number; points: number } | null;
  /** The gripper as the hand holds it (null: no gripper fitted). */
  closed: boolean | null;
  /** What stops the arm following now (out of reach, a touch), if anything. */
  warn: string | null;
  busy: boolean;
  robotMode: boolean;
  /** Every picture's hand (null: none in sight). */
  onPose(pose: HandPose | null): void;
  onFollow(on: boolean): void;
  onRecord(on: boolean): void;
  onReplay(): void;
  onToProcess(): void;
  onTools(): void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [cam, setCam] = useState<'off' | 'loading' | 'on' | 'error'>('off');
  const [error, setError] = useState('');
  const [seen, setSeen] = useState(false);
  const onPose = useRef(p.onPose);
  const closed = useRef(p.closed);
  useEffect(() => {
    onPose.current = p.onPose;
    closed.current = p.closed;
  });
  const stopRef = useRef<() => void>(() => {});

  const start = async () => {
    setCam('loading');
    setError('');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      const lm = await loadLandmarker();
      setCam('on');
      let raf = 0;
      let last = -1;
      let had = false;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (v.readyState < 2 || v.currentTime === last) return;
        last = v.currentTime;
        const hand = lm.detectForVideo(v, performance.now()).landmarks[0] ?? null;
        const pose = hand ? handPose(hand) : null;
        onPose.current(pose);
        if (!!pose !== had) {
          had = !!pose;
          setSeen(had);
        }
        draw(hand);
      };
      raf = requestAnimationFrame(tick);
      stopRef.current = () => {
        cancelAnimationFrame(raf);
        lm.close();
        stream?.getTracks().forEach((t) => t.stop());
        onPose.current(null);
      };
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      setCam('error');
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'NotAllowedError' ? '카메라 사용을 허락하지 않았어요. 주소창의 카메라 표시에서 허용해 주세요.' : name === 'NotFoundError' ? '이 PC 에 카메라가 없어요.' : `손 인식을 시작하지 못했어요 (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
  };
  useEffect(() => () => stopRef.current(), []);
  const stopCam = () => {
    stopRef.current();
    stopRef.current = () => {};
    setCam('off');
    setSeen(false);
  };

  /** The hand over the picture, mirrored like the picture (as in a mirror). */
  const draw = (hand: Landmark[] | null) => {
    const c = canvas.current;
    const v = video.current;
    if (!c || !v) return;
    if (c.width !== v.videoWidth) {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    if (!hand) return;
    const at = (l: Landmark) => [(1 - l.x) * c.width, l.y * c.height] as const;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(244, 246, 249, 0.9)';
    for (const [a, b] of BONES) {
      g.beginPath();
      g.moveTo(...at(hand[a]));
      g.lineTo(...at(hand[b]));
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    for (const l of hand) {
      g.beginPath();
      g.arc(...at(l), 4, 0, Math.PI * 2);
      g.fill();
    }
    // The pinch: thumb tip to index tip.
    g.strokeStyle = closed.current ? '#ffffff' : 'rgba(255, 255, 255, 0.45)';
    g.setLineDash([6, 5]);
    g.beginPath();
    g.moveTo(...at(hand[4]));
    g.lineTo(...at(hand[8]));
    g.stroke();
    g.setLineDash([]);
  };

  const following = p.state !== 'idle';
  const now = p.robotMode
    ? '실물 로봇 연결은 다음 단계예요. 지금은 시뮬레이터에서만 해요.'
    : cam !== 'on'
      ? '카메라를 켜고 손바닥을 카메라에 보여 주세요.'
      : !seen
        ? '손이 안 보여요. 손바닥을 카메라 쪽으로 펴 주세요.'
        : !following
          ? '손을 편하게 두고 [따라 하기]를 누르면, 그 자리가 지금 손끝 위치가 돼요.'
          : p.state === 'record'
            ? '녹화 중이에요. 손으로 옮길 길을 보여 주고 [녹화 끝]을 눌러요.'
            : '손을 움직이면 로봇 손끝이 따라와요. [녹화]로 길을 남겨 보세요.';

  return (
    <section className={css.hand} aria-label="손 따라하기">
      <p className={css.now}>{now}</p>
      <div className={css.view} data-cam={cam}>
        <video ref={video} playsInline muted />
        <canvas ref={canvas} />
        {cam !== 'on' && (
          <div className={css.off}>
            {cam === 'loading' ? (
              <span>손 인식 준비 중…</span>
            ) : (
              <button type="button" className={css.key} data-main onClick={() => void start()} disabled={p.robotMode}>
                카메라 켜기
              </button>
            )}
            {cam === 'error' && <small>{error}</small>}
            <small>카메라 영상은 이 PC 안에서만 써요. 저장하거나 보내지 않아요.</small>
          </div>
        )}
        {cam === 'on' && (
          <span className={css.chip} data-seen={seen || undefined}>
            {seen ? (p.closed === null ? '손 찾음' : p.closed ? '손 찾음 · 그리퍼 닫힘' : '손 찾음 · 그리퍼 열림') : '손 없음'}
          </span>
        )}
      </div>
      {p.warn && <p className={css.warn}>{p.warn}</p>}
      <div className={css.keys}>
        <button type="button" className={css.key} data-main={!following || undefined} disabled={cam !== 'on' || (!following && (!seen || p.busy))} onClick={() => p.onFollow(!following)}>
          {following ? '■ 멈추기' : '따라 하기'}
        </button>
        <button type="button" className={css.key} data-rec={p.state === 'record' || undefined} disabled={!following} onClick={() => p.onRecord(p.state !== 'record')}>
          {p.state === 'record' ? '■ 녹화 끝' : '● 녹화'}
        </button>
        <button type="button" className={css.key} disabled={following || p.busy || !p.demo?.points} onClick={p.onReplay}>
          ▶ 재생
        </button>
        <button type="button" className={css.key} disabled={following || p.busy || !p.demo?.points} onClick={p.onToProcess}>
          공정으로
        </button>
      </div>
      {p.demo && (
        <p className={css.demo}>
          {p.state === 'record' ? '녹화 중' : '마지막 시연'} · <b>{p.demo.seconds.toFixed(1)}초</b>
          {p.state !== 'record' && (
            <>
              {' '}
              · 점 <b>{p.demo.points}개</b>로 줄였어요
            </>
          )}
        </p>
      )}
      <dl className={css.how}>
        <dt>좌우 · 위아래</dt>
        <dd>손을 옮긴 만큼 손끝이 좌우(Y) · 위아래(Z)로</dd>
        <dt>앞뒤</dt>
        <dd>손을 카메라에 가까이 = 앞(X+), 멀리 = 뒤</dd>
        <dt>집기</dt>
        <dd>{p.closed === null ? '그리퍼를 달면 엄지와 검지를 맞대어 집어요' : '엄지와 검지를 맞대면 닫히고, 떼면 열려요'}</dd>
      </dl>
      {p.closed === null && (
        <button type="button" className={css.link} onClick={p.onTools}>
          그리퍼 달기 ›
        </button>
      )}
      {cam === 'on' && !following && (
        <button type="button" className={css.link} onClick={stopCam}>
          카메라 끄기
        </button>
      )}
    </section>
  );
}
