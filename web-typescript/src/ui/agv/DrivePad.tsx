'use client';

/**
 * A drag pad: a round joystick (both axes) or a flat track (left-right only).
 * The knob follows the pointer inside the pad and springs back to the middle
 * when let go; `onMove` gets −1..1 per axis (screen directions: x right, y down).
 * `reset()` on the handle centres it from outside (the [멈춤] button, a crash).
 */

import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react';

import css from './agv.module.css';

export interface DrivePadHandle {
  reset(): void;
}

interface Props {
  axis: 'xy' | 'x';
  label: string;
  onMove(x: number, y: number): void;
  knob: ReactNode;
  children?: ReactNode;
}

const DrivePad = forwardRef<DrivePadHandle, Props>(function DrivePad({ axis, label, onMove, knob, children }, ref) {
  const pad = useRef<HTMLDivElement>(null);
  const knobEl = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);

  const radius = (b: DOMRect) => (axis === 'x' ? (b.width - b.height) / 2 : b.width / 2 - 32);
  const place = (fx: number, fy: number) => {
    const b = pad.current?.getBoundingClientRect();
    if (!b || !knobEl.current) return;
    const r = radius(b);
    knobEl.current.style.transform = fx || fy ? `translate(${fx * r}px, ${fy * r}px)` : '';
    pad.current?.toggleAttribute('data-active', !!(fx || fy));
  };
  const move = (clientX: number, clientY: number) => {
    const b = pad.current!.getBoundingClientRect();
    const r = radius(b);
    let dx = clientX - (b.left + b.width / 2);
    let dy = axis === 'x' ? 0 : clientY - (b.top + b.height / 2);
    const n = Math.hypot(dx, dy);
    if (n > r) {
      dx *= r / n;
      dy *= r / n;
    }
    const fx = dx / r;
    const fy = dy / r;
    place(fx, fy);
    onMove(fx, fy);
  };
  const release = () => {
    pointer.current = null;
    place(0, 0);
    onMove(0, 0);
  };
  useImperativeHandle(ref, () => ({
    reset() {
      pointer.current = null;
      place(0, 0);
    },
  }));

  return (
    <div
      ref={pad}
      className={axis === 'x' ? css.track : css.joy}
      role="slider"
      aria-label={label}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      tabIndex={-1}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointer.current) move(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
      onLostPointerCapture={(e) => e.pointerId === pointer.current && release()}
    >
      {children}
      <span ref={knobEl} className={css.knob}>
        {knob}
      </span>
    </div>
  );
});

export default DrivePad;
