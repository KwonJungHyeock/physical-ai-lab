'use client';

/**
 * Two screens side by side: what the camera sees, and what the official AI Kit
 * pipeline makes of it — ArUco markers, the board crop, the HSV mask, the chosen
 * block per colour and its robot coordinates. The Stage pushes frames in
 * through `push`; drawing goes straight to the canvases so a live camera never
 * re-renders the rest of the page.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { BLOCK_MM, COLOR_HEX, type ColorName } from '@/engine/simulator/board';
import type { CameraId } from '@/engine/simulator/program';
import { cameraFrameUrl, robotFetch } from '@/engine/simulator/robotLink';
import { OFFICIAL_HSV, classify, detectKit, findBlobs, pixelToPlane, type BoardCalibration, type ImageLike, type Marker } from '@/engine/vision/color';

import type { CameraFrame } from './Stage';
import css from '../console.module.css';

/** Which picture the panel shows: a simulated camera, or the real kit camera (robot mode). */
/** Real camera: shortest time between two frames asked for, and between two runs of the colour pipeline. */
const REAL_FRAME_MS = 80;
const REAL_ANALYSE_MS = 500;

export type CameraView = CameraId | 'real';

export interface CameraViewsHandle {
  push(camera: CameraId, frame: CameraFrame, force?: boolean): void;
  /** Highlight the block a program just picked. */
  mark(color: string | null): void;
  /** 색 따라가기: draw the picture's centre and the way to this colour (null: off). */
  aim(color: string | null): void;
}

export interface Detection {
  color: ColorName;
  official: string;
  u: number;
  v: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  robot: { x: number; y: number } | null;
}

export interface Analysis {
  labels: Uint8Array;
  detections: Detection[];
  markers: Marker[];
  calibration: BoardCalibration | null;
}

/**
 * Overhead camera: the official two-marker method. Hand camera: no markers in
 * view, so each block centre is projected onto the plane of the block tops.
 */
export function analyse(camera: CameraId, frame: { image: ImageLike; pinhole?: CameraFrame['pinhole'] }): Analysis {
  if (camera === 'top' || !frame.pinhole) {
    const k = detectKit(frame.image);
    return {
      labels: k.labels,
      markers: k.markers,
      calibration: k.calibration,
      detections: k.blobs.map((b) => ({
        color: b.color,
        official: b.official,
        u: b.cx,
        v: b.cy,
        box: b,
        robot: b.robot,
      })),
    };
  }
  const labels = classify(frame.image);
  const blobs = findBlobs(labels, frame.image.width, frame.image.height);
  return {
    labels,
    markers: [],
    calibration: null,
    detections: blobs.map((b) => ({
      color: b.color,
      official: b.official,
      u: b.cx,
      v: b.cy,
      box: b,
      robot: pixelToPlane(frame.pinhole!, b.cx, b.cy, BLOCK_MM),
    })),
  };
}

const MASK_RGB = OFFICIAL_HSV.map((r) => {
  const hex = COLOR_HEX[r.color];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
});

interface Props {
  view: CameraView;
  onView(view: CameraView): void;
  /** Kit camera exists (AI 키트 theme). */
  topAvailable: boolean;
  handAvailable: boolean;
  /** The robot serves a real camera. */
  realAvailable: boolean;
  /** Real cameras on the robot (kit camera, hand camera), which one is shown, and what it is. */
  realCams?: number;
  realCam?: number;
  onRealCam?(n: number): void;
  realRole?: CameraId;
  onRealRole?(role: CameraId): void;
  /** Real hand camera: ask the robot where the blocks are (official hand-eye calibration). */
  onImportHand?(): void;
  /** A picture was saved with [사진 찍기]. */
  onPhoto(camera: CameraId): void;
  /** Real view: put the simulated blocks where the real camera sees the real ones. */
  onImport?(found: Detection[]): void;
  /** 색 따라가기 controls (shown when a hand camera is fitted). */
  track?: {
    color: ColorName;
    onColor(color: ColorName): void;
    /** Following now: what it is doing. */
    note: string | null;
    disabled: boolean;
    onStart(): void;
    onStop(): void;
    /** Go to the hand camera's photo pose (looking down at the table). */
    onPose(): void;
  };
}

const TRACK_COLORS: ColorName[] = ['빨강', '초록', '파랑', '노랑'];

const CameraViews = forwardRef<CameraViewsHandle, Props>(function CameraViews(
  { view, onView, topAvailable, handAvailable, realAvailable, realCams = 1, realCam = 0, onRealCam, realRole = 'top', onRealRole, onImportHand, onPhoto, onImport, track },
  ref,
) {
  const raw = useRef<HTMLCanvasElement>(null);
  const processed = useRef<HTMLCanvasElement>(null);
  const marked = useRef<string | null>(null);
  const aimed = useRef<string | null>(null);
  const [list, setList] = useState<Detection[]>([]);
  const [calText, setCalText] = useState('');
  const [realError, setRealError] = useState('');
  /** Narrow screens show one picture at a time: the camera's, or the processed one. */
  const [shown, setShown] = useState<'raw' | 'processed'>('raw');
  const lastKey = useRef('');
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const draw = (cam: CameraId, frame: { image: ImageLike; pinhole?: CameraFrame['pinhole'] }, real: boolean) => {
      const { image } = frame;
      const { width, height } = image;
      const rc = raw.current;
      const pc = processed.current;
      if (!rc || !pc) return;
      for (const c of [rc, pc]) {
        if (c.width !== width) c.width = width;
        if (c.height !== height) c.height = height;
      }
      // Same options as the real camera's reads: a canvas keeps the options of its first getContext, and
      // without willReadFrequently every analysis of a real frame is a slow read back from the GPU.
      if (!real) rc.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(new Uint8ClampedArray(image.data), width, height), 0, 0);

      const a = analyse(cam, frame);
      // Processed view: dimmed grey picture, HSV mask painted on top.
      const out = new ImageData(width, height);
      for (let i = 0; i < width * height; i += 1) {
        const l = a.labels[i];
        if (l) {
          const [r, g, b] = MASK_RGB[l - 1];
          out.data[i * 4] = r;
          out.data[i * 4 + 1] = g;
          out.data[i * 4 + 2] = b;
        } else {
          const y = 0.3 * image.data[i * 4] + 0.59 * image.data[i * 4 + 1] + 0.11 * image.data[i * 4 + 2];
          const v = 25 + y * 0.35;
          out.data[i * 4] = v;
          out.data[i * 4 + 1] = v;
          out.data[i * 4 + 2] = v;
        }
        out.data[i * 4 + 3] = 255;
      }
      const g = pc.getContext('2d')!;
      g.putImageData(out, 0, 0);
      g.font = '600 15px system-ui, sans-serif';
      g.lineWidth = 2;

      // Markers and the crop they define.
      for (const m of a.markers) {
        g.strokeStyle = '#22d36b';
        g.strokeRect(m.x0 - 2, m.y0 - 2, m.x1 - m.x0 + 4, m.y1 - m.y0 + 4);
        g.fillStyle = '#22d36b';
        g.fillText(`id ${m.id}`, m.x0, m.y0 - 6);
      }
      if (a.calibration) {
        const { roi, cu, cv } = a.calibration;
        g.setLineDash([6, 5]);
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.strokeRect(roi.x0, roi.y0, roi.x1 - roi.x0, roi.y1 - roi.y0);
        g.setLineDash([]);
        g.strokeStyle = '#22d36b';
        g.beginPath();
        g.moveTo(cu - 9, cv);
        g.lineTo(cu + 9, cv);
        g.moveTo(cu, cv - 9);
        g.lineTo(cu, cv + 9);
        g.stroke();
      }
      a.detections.forEach((d, k) => {
        g.strokeStyle = '#ffffff';
        g.setLineDash(marked.current === d.color ? [] : [5, 4]);
        g.strokeRect(d.box.x0 - 3, d.box.y0 - 3, d.box.x1 - d.box.x0 + 6, d.box.y1 - d.box.y0 + 6);
        g.setLineDash([]);
        g.beginPath();
        g.moveTo(d.u - 5, d.v);
        g.lineTo(d.u + 5, d.v);
        g.moveTo(d.u, d.v - 5);
        g.lineTo(d.u, d.v + 5);
        g.stroke();
        const label = String(k + 1);
        const ly = d.box.y0 - 8 < 16 ? d.box.y1 + 20 : d.box.y0 - 8;
        g.fillStyle = 'rgba(15,23,42,0.85)';
        g.beginPath();
        g.arc(d.u, ly - 5, 10, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.fillText(label, d.u - g.measureText(label).width / 2, ly);
      });

      // 색 따라가기: the picture's centre, and a line from it to the colour followed.
      if (aimed.current) {
        const cx = width / 2;
        const cy = height / 2;
        const r = Math.max(10, width / 32);
        g.strokeStyle = '#ffd43b';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.moveTo(cx - r * 1.8, cy);
        g.lineTo(cx - r * 0.5, cy);
        g.moveTo(cx + r * 0.5, cy);
        g.lineTo(cx + r * 1.8, cy);
        g.moveTo(cx, cy - r * 1.8);
        g.lineTo(cx, cy - r * 0.5);
        g.moveTo(cx, cy + r * 0.5);
        g.lineTo(cx, cy + r * 1.8);
        g.stroke();
        const hit = a.detections.find((d) => d.color === aimed.current);
        if (hit) {
          g.setLineDash([6, 4]);
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(hit.u, hit.v);
          g.stroke();
          g.setLineDash([]);
        }
      }

      const cal = a.calibration;
      const text =
        cam === 'hand'
          ? '손 카메라: 카메라 위치로 광선을 쏴서 블록 윗면 높이에서 좌표 계산'
          : cal
            ? `마커 id ${cal.markers[0].id}·${cal.markers[1].id} → 중심 (${Math.round(cal.cu)}, ${Math.round(cal.cv)})px, 1px = ${cal.ratio.toFixed(3)}mm (220 ÷ ${(220 / cal.ratio).toFixed(0)}px)`
            : '마커 2개가 보이지 않아요. 보정을 할 수 없어요';
      const key = `${text}|${a.detections.map((d) => `${d.color}${Math.round(d.u)}${Math.round(d.v)}`).join('|')}`;
      if (key !== lastKey.current) {
        lastKey.current = key;
        setList(a.detections);
        setCalText(text);
      }
  };

  useImperativeHandle(ref, () => ({
    mark(color) {
      marked.current = color;
    },
    aim(color) {
      aimed.current = color;
      marked.current = color;
    },
    push(cam, frame, force = false) {
      // Simulated frames only show while their camera is picked (not the real one);
      // a program looking through a camera shows its frame anyway.
      if (viewRef.current !== cam && !force) return;
      draw(cam, frame, false);
    },
  }));

  // Real camera: the next frame is asked for as soon as one has arrived (at most ~12 a second), so
  // the picture keeps up with the robot; the colour pipeline, the costly part, runs twice a second.
  useEffect(() => {
    if (view !== 'real') return;
    const cam = realCam;
    let alive = true;
    let timer = 0;
    let analysed = 0;
    const next = () => {
      const asked = performance.now();
      const img = new Image();
      // From the PC program the robot is another address: without this the canvas is tainted and
      // reading its pixels throws on the first frame.
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (!alive) return;
        const rc = raw.current;
        if (rc) {
          if (rc.width !== img.naturalWidth) rc.width = img.naturalWidth;
          if (rc.height !== img.naturalHeight) rc.height = img.naturalHeight;
          const g = rc.getContext('2d', { willReadFrequently: true })!;
          g.drawImage(img, 0, 0);
          const now = performance.now();
          if (now - analysed > REAL_ANALYSE_MS) {
            analysed = now;
            const data = g.getImageData(0, 0, rc.width, rc.height);
            draw('top', { image: { data: data.data, width: data.width, height: data.height } }, true);
          }
        }
        setRealError('');
        timer = window.setTimeout(next, Math.max(0, REAL_FRAME_MS - (performance.now() - asked)));
      };
      img.onerror = async () => {
        if (!alive) return;
        try {
          const r = await robotFetch(cameraFrameUrl(cam));
          const j = (await r.json()) as { error?: string };
          setRealError(j.error ?? '카메라 영상을 받지 못했어요.');
        } catch {
          setRealError('로봇 서버에 연결할 수 없어요.');
        }
        timer = window.setTimeout(next, 2000);
      };
      img.src = cameraFrameUrl(cam);
    };
    next();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [view, realCam]);

  const photo = () => {
    const c = raw.current;
    if (!c) return;
    const a = document.createElement('a');
    const role: CameraId = view === 'real' ? realRole : view;
    const name = `${view === 'real' ? '실제' : ''}${role === 'top' ? '키트카메라' : '손카메라'}`;
    const t = new Date();
    a.download = `${name}_${t.getHours()}${String(t.getMinutes()).padStart(2, '0')}${String(t.getSeconds()).padStart(2, '0')}.png`;
    a.href = c.toDataURL('image/png');
    a.click();
    onPhoto(role);
  };

  const none = view === 'top' ? !topAvailable : view === 'hand' ? !handAvailable : !realAvailable;

  return (
    <div className={`${css.card} ${css.cams}`}>
      <div className={css.camHead}>
        <h2>카메라</h2>
        <span className={css.seg} role="group" aria-label="카메라 선택">
          <button
            type="button"
            aria-pressed={view === 'top'}
            disabled={!topAvailable}
            title={topAvailable ? undefined : '실습 환경이 AI 키트일 때 있어요'}
            onClick={() => onView('top')}
          >
            키트 카메라
          </button>
          <button
            type="button"
            aria-pressed={view === 'hand'}
            disabled={!handAvailable}
            title={handAvailable ? undefined : '카메라 플랜지를 달면 쓸 수 있어요'}
            onClick={() => onView('hand')}
          >
            손 카메라
          </button>
          {realAvailable &&
            Array.from({ length: Math.max(1, realCams) }, (_, n) => (
              <button
                key={n}
                type="button"
                aria-pressed={view === 'real' && realCam === n}
                onClick={() => {
                  onRealCam?.(n);
                  onView('real');
                }}
              >
                {realCams > 1 ? `실제 ${n + 1}` : '실제 카메라'}
              </button>
            ))}
        </span>
        <span className={css.spacer} />
        {view === 'real' && onRealRole && (
          <span className={css.seg} role="group" aria-label="이 실제 카메라는">
            <button type="button" aria-pressed={realRole === 'top'} onClick={() => onRealRole('top')} title="거치대에 고정된 키트 카메라 (마커 2개로 보정)">
              키트
            </button>
            <button type="button" aria-pressed={realRole === 'hand'} onClick={() => onRealRole('hand')} title="카메라 플랜지의 손 카메라 (공식 손-눈 보정)">
              손
            </button>
          </span>
        )}
        {view === 'real' && realRole === 'top' && onImport && (
          <button
            type="button"
            className={css.ghost}
            disabled={!list.some((d) => d.robot)}
            title="실제 키트 카메라가 찾은 블록 위치로 시뮬레이터의 블록을 옮겨요"
            onClick={() => onImport(list.filter((d) => d.robot))}
          >
            실제 블록 위치 가져오기
          </button>
        )}
        {view === 'real' && realRole === 'hand' && onImportHand && (
          <button
            type="button"
            className={css.ghost}
            title="로봇이 손 카메라 영상과 지금 팔 자세로 블록 위치를 계산해 시뮬레이터의 블록을 옮겨요 (공식 RDK X5 비전 키트 보정). 팔을 멈춘 채 눌러요"
            onClick={onImportHand}
          >
            실제 블록 위치 가져오기
          </button>
        )}
        <button type="button" className={css.ghost} disabled={none} onClick={photo}>
          사진 찍기
        </button>
        <span className={`${css.seg} ${css.camShowSeg}`} role="group" aria-label="보여 줄 화면">
          <button type="button" aria-pressed={shown === 'raw'} onClick={() => setShown('raw')}>
            원본
          </button>
          <button type="button" aria-pressed={shown === 'processed'} onClick={() => setShown('processed')}>
            영상 처리
          </button>
        </span>
      </div>
      {track && (
        <div className={css.trackBar} role="group" aria-label="색 따라가기">
          <b>색 따라가기</b>
          <span className={css.trackColors} role="radiogroup" aria-label="따라갈 색">
            {TRACK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={track.color === c}
                disabled={!!track.note}
                onClick={() => track.onColor(c)}
                title={`${c} 따라가기`}
              >
                <span className={css.sw} style={{ background: COLOR_HEX[c] }} />
                {c}
              </button>
            ))}
          </span>
          {track.note ? (
            <button type="button" className={css.trackStop} onClick={track.onStop}>
              ■ 멈추기
            </button>
          ) : (
            <button
              type="button"
              className={css.trackGo}
              disabled={track.disabled}
              onClick={track.onStart}
              title="손 카메라가 고른 색을 화면 가운데에 두도록 팔이 따라 움직여요. 처음 몇 초는 팔이 조금씩 움직이며 방향을 맞춰요."
            >
              ▶ 따라가기
            </button>
          )}
          {!track.note && (
            <button type="button" className={css.ghost} disabled={track.disabled} onClick={track.onPose} title="손 카메라가 로봇 앞 책상을 내려다보는 자세로 가요 (공식 RDK X5 비전 키트의 촬영 자세)">
              카메라 자세
            </button>
          )}
          <span className={css.trackNote} aria-live="polite">
            {track.note ?? '[카메라 자세]로 책상을 내려다본 뒤, 물체를 화면에 두고 시작해요'}
          </span>
        </div>
      )}
      {none && (
        <p className={css.camNone}>
          {view === 'top'
            ? '로봇팔 단독 실습 환경에는 키트 카메라가 없어요. 카메라 플랜지를 달면 손 카메라를 볼 수 있어요.'
            : view === 'hand'
              ? '카메라 플랜지를 달면 손 카메라를 볼 수 있어요.'
              : '로봇에 카메라가 연결되지 않았어요.'}
        </p>
      )}
      {view === 'real' && realError && <p className={css.camNone}>{realError}</p>}
      <div className={css.camGrid} hidden={none} data-show={shown}>
        <figure className={css.camView} style={{ margin: 0 }}>
          <canvas ref={raw} width={640} height={480} aria-label="카메라 화면" />
          <figcaption className={css.camCaption}>
            <b>카메라 화면</b>
            <span>
              {view === 'real'
                ? `실제 ${realRole === 'top' ? '키트' : '손'} 카메라${realCams > 1 ? ` ${realCam + 1}` : ''} (로봇에서)`
                : view === 'top'
                  ? '키트 카메라 (Eye-to-Hand)'
                  : '손 카메라 (Eye-in-Hand)'}
            </span>
          </figcaption>
        </figure>
        <figure className={css.camView} style={{ margin: 0 }}>
          <canvas ref={processed} width={640} height={480} aria-label="영상 처리 화면" />
          <figcaption className={css.camCaption}>
            <b>영상 처리</b>
            <span>{view === 'hand' ? 'HSV → 좌표' : 'ArUco 보정 → HSV → 좌표 (공식 키트 방식)'}</span>
          </figcaption>
        </figure>
      </div>
      <p className={css.camCal} hidden={none}>
        {calText}
      </p>
      <ul className={css.detections} aria-live="polite" hidden={none}>
        {list.length === 0 ? (
          <li>찾은 블록 없음</li>
        ) : (
          list.map((d, k) => (
            <li key={`${d.color}-${Math.round(d.u)}`}>
              <span className={css.sw} style={{ background: COLOR_HEX[d.color] }} />
              {k + 1} {d.color}({d.official}) ({Math.round(d.u)}, {Math.round(d.v)})px
              {d.robot ? ` → x ${Math.round(d.robot.x)}, y ${Math.round(d.robot.y)} mm` : ''}
            </li>
          ))
        )}
      </ul>
    </div>
  );
});

export default CameraViews;
