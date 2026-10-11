'use client';

/** On the 3D view: the view cube and view tools (as in modelling programs), and a small live camera picture. */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { CameraId } from '@/engine/simulator/program';

import { activeArm } from '@/engine/robot/arms';

import { AXIS_COLORS, type DisplayOpts } from './sceneHelpers';
import type { CameraFrame, StageApi, ViewName } from './Stage';
import css from '../console.module.css';

const DISPLAY_ITEMS: { key: keyof DisplayOpts; label: string; note: string; swatch: string[] }[] = [
  { key: 'baseAxes', label: '베이스 좌표축', note: 'X 앞 · Y 왼쪽 · Z 위', swatch: [AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z] },
  { key: 'toolAxes', label: '도구 좌표축', note: '도구 끝의 방향', swatch: [AXIS_COLORS.x, AXIS_COLORS.y, AXIS_COLORS.z] },
  { key: 'jointPoints', label: '관절 선택 점', note: '관절 조그: 점 ①~⑥ 으로 고르고 링으로 돌리기', swatch: ['#2f5bea'] },
  { key: 'jointAxes', label: '관절 회전축', note: 'J1~J6 이 도는 축', swatch: ['#f08c00'] },
  { key: 'path', label: '도구 궤적', note: '도구 끝이 지나간 길', swatch: ['#3e63dd'] },
  { key: 'reach', label: '작업 범위', note: '팔이 닿는 3D 공간', swatch: ['#3454d1'] },
  { key: 'grid', label: '바닥 격자', note: '1cm 칸 · 10cm 굵은 선', swatch: ['#c3ccd6'] },
  { key: 'ghost', label: '끝 자세 미리보기', note: '블록 코딩: 프로그램이 끝날 때의 자세를 투명한 팔로', swatch: ['#6f9bff'] },
  { key: 'autoFold', label: '실행할 때 패널 접기', note: '실행하는 동안 3D 를 크게, 끝나면 다시 펼침', swatch: ['#1d2636'] },
];

/** The 표시 menu: which drawing aids the 3D view shows. */
function DisplayMenu({ display, onDisplay }: { display: DisplayOpts; onDisplay(d: DisplayOpts): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const on = DISPLAY_ITEMS.filter((i) => display[i.key]).length;
  return (
    <span className={css.displayWrap} ref={box}>
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-label="표시 옵션" title={`표시 옵션: 좌표축·관절축·궤적 등 (${on}개 켜짐)`} onClick={() => setOpen((o) => !o)}>
        <ToolGlyph d={GLYPH.layers} />
        <i className={css.displayCount}>{on}</i>
      </button>
      {open && (
        <div className={css.displayMenu} role="group" aria-label="3D 표시">
          {DISPLAY_ITEMS.map((it) => (
            <label key={it.key} className={css.displayItem}>
              <input type="checkbox" checked={display[it.key]} onChange={(e) => onDisplay({ ...display, [it.key]: e.target.checked })} />
              <span className={css.displaySwatch} aria-hidden="true">
                {it.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span>
                <b>{it.label}</b>
                <small>{it.key === 'reach' ? `${it.note} (반지름 약 ${activeArm().reachMm}mm)` : it.note}</small>
              </span>
            </label>
          ))}
        </div>
      )}
    </span>
  );
}

/** Line icons of the view tools, 24 × 24. */
export const GLYPH = {
  home: 'M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 9h6v6H9z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rotate: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  pan: 'M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5',
  persp: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  flat: 'M5 5h14v14H5zM5 12h14M12 5v14',
  layers: 'M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5',
  shot: 'M4 8h3l2-2.5h6L17 8h3v11H4zM12 10.5a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4',
  video: 'M4 7h11v10H4zM15 10.5l5-3v9l-5-3',
};

export function ToolGlyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** The cube's faces: where each sits (the robot's frame on screen) and the view a click on it opens. */
const FACES: { name: string; view?: ViewName; transform: string }[] = [
  { name: '윗면', view: 'top', transform: 'rotateX(90deg)' },
  { name: '아랫면', transform: 'rotateX(-90deg)' },
  { name: '정면', view: 'front', transform: 'rotateY(90deg)' },
  { name: '뒷면', view: 'back', transform: 'rotateY(-90deg)' },
  { name: '우측면', view: 'side', transform: 'rotateY(0deg)' },
  { name: '좌측면', view: 'left', transform: 'rotateY(180deg)' },
];

/**
 * The view cube: turns with the 3D view so its faces show which side of the robot is in front;
 * a click on a face looks from that side.
 */
export function ViewCube({ orient, onView }: { orient(): { azimuth: number; polar: number } | null; onView(v: ViewName): void }) {
  const cube = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = 0;
    let last = '';
    const tick = () => {
      const o = orient();
      if (o && cube.current) {
        const t = `rotateX(${(((o.polar - Math.PI / 2) * 180) / Math.PI).toFixed(1)}deg) rotateY(${((-o.azimuth * 180) / Math.PI).toFixed(1)}deg)`;
        if (t !== last) {
          cube.current.style.transform = t;
          last = t;
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [orient]);
  return (
    <div className={css.viewCube} role="group" aria-label="보는 방향 (면을 누르면 그 방향에서 봐요)">
      <div className={css.cubeBody} ref={cube}>
        {FACES.map((f) =>
          f.view ? (
            <button key={f.name} type="button" className={css.cubeFace} style={{ transform: `${f.transform} translateZ(var(--half))` }} onClick={() => onView(f.view!)} title={`${f.name}에서 보기`}>
              {f.name}
            </button>
          ) : (
            <span key={f.name} className={css.cubeFace} style={{ transform: `${f.transform} translateZ(var(--half))` }}>
              {f.name}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * The view tools at the right of the 3D view, as in modelling programs: the view cube, then one
 * column of buttons — first view, fit all, zoom in and out, turn or move, perspective or flat,
 * what to show, save the picture (and the camera panel, when a camera is fitted).
 */
export function ViewTools({
  api,
  display,
  onDisplay,
  camera,
  onSnapshot,
}: {
  /** The 3D view's controls (null until it is ready). */
  api(): StageApi | null;
  display: DisplayOpts;
  onDisplay(d: DisplayOpts): void;
  /** The camera panel toggle, when a camera is fitted. */
  camera?: { open: boolean; toggle(): void };
  /** The picture was saved (or could not be). */
  onSnapshot(ok: boolean): void;
}) {
  const [pan, setPan] = useState(false);
  const [flat, setFlat] = useState(false);
  const orient = useCallback(() => api()?.orient() ?? null, [api]);
  const save = () => {
    const url = api()?.snapshot();
    if (!url) return onSnapshot(false);
    const a = document.createElement('a');
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    a.download = `시뮬레이션-${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}${p(t.getSeconds())}.png`;
    a.href = url;
    a.click();
    onSnapshot(true);
  };
  return (
    <div className={css.viewTools} data-panel="viewtools">
      <ViewCube orient={orient} onView={(v) => api()?.view(v)} />
      <div className={css.viewRail} role="toolbar" aria-label="3D 보기 도구" aria-orientation="vertical">
        <button type="button" title="처음 시점" aria-label="처음 시점" onClick={() => api()?.view('home')}>
          <ToolGlyph d={GLYPH.home} />
        </button>
        <button type="button" title="전체 맞춤: 지금 방향에서 로봇과 작업 공간이 꽉 차게" aria-label="전체 맞춤" onClick={() => api()?.fit()}>
          <ToolGlyph d={GLYPH.fit} />
        </button>
        <i className={css.railSep} />
        <button type="button" title="확대 (+ 키, 마우스 휠)" aria-label="확대" onClick={() => api()?.zoom(1)}>
          <ToolGlyph d={GLYPH.plus} />
        </button>
        <button type="button" title="축소 (− 키, 마우스 휠)" aria-label="축소" onClick={() => api()?.zoom(-1)}>
          <ToolGlyph d={GLYPH.minus} />
        </button>
        <i className={css.railSep} />
        <button
          type="button"
          aria-pressed={pan}
          aria-label={pan ? '끌면 이동 (누르면 회전으로)' : '끌면 회전 (누르면 이동으로)'}
          title={pan ? '지금: 끌면 화면 이동 · 누르면 회전으로 (오른쪽 버튼 끌기는 늘 이동)' : '지금: 끌면 회전 · 누르면 화면 이동으로 (오른쪽 버튼 끌기는 늘 이동)'}
          onClick={() => {
            api()?.setPan(!pan);
            setPan(!pan);
          }}
        >
          <ToolGlyph d={pan ? GLYPH.pan : GLYPH.rotate} />
        </button>
        <button
          type="button"
          aria-pressed={flat}
          aria-label={flat ? '평면 투영 (누르면 원근)' : '원근 투영 (누르면 평면)'}
          title={flat ? '지금은 평면 투영이에요. 멀어도 크기가 같아요 (도면처럼) · 누르면 원근으로' : '지금은 원근 투영이에요. 눈으로 보듯 멀면 작게 · 누르면 평면으로'}
          onClick={() => {
            api()?.setFlat(!flat);
            setFlat(!flat);
          }}
        >
          <ToolGlyph d={flat ? GLYPH.flat : GLYPH.persp} />
        </button>
        <i className={css.railSep} />
        <DisplayMenu display={display} onDisplay={onDisplay} />
        <button type="button" title="화면 저장: 지금 3D 화면을 그림 파일(PNG)로" aria-label="화면 저장" onClick={save}>
          <ToolGlyph d={GLYPH.shot} />
        </button>
        {camera && (
          <button type="button" aria-pressed={camera.open} title="카메라 화면과 영상 처리" aria-label="카메라" onClick={camera.toggle}>
            <ToolGlyph d={GLYPH.video} />
          </button>
        )}
      </div>
    </div>
  );
}

export interface CameraPipHandle {
  draw(camera: CameraId, frame: CameraFrame): void;
}

/** Small live picture of the simulated camera in use; click to open the camera panel. */
export const CameraPip = forwardRef<CameraPipHandle, { camera: CameraId; onOpen(): void }>(function CameraPip({ camera, onOpen }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => ({
    draw(cam, frame) {
      const c = canvas.current;
      if (!c || cam !== camera) return;
      const { width, height, data } = frame.image;
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
      c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    },
  }));
  return (
    <button type="button" className={css.pip} onClick={onOpen} title="카메라 화면과 영상 처리 크게 보기">
      <canvas ref={canvas} aria-label="카메라 작은 화면" />
      <span>{camera === 'top' ? '키트 카메라' : '손 카메라'}</span>
    </button>
  );
});
