'use client';

/**
 * 실습 셀 B's camera window in the corner of the 3D view: what the camera over the belt sees now
 * (looked at from above, the belt running left to right towards its end), the part its last picture
 * chose marked with a cross, and that reading in words — colour, diameter, outline, how sure — with
 * where the rule table sends it.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

import { cellLayout, type CellId } from '@/engine/simulator/cell/cells';
import { decide, describe, outlineOf, type Shot } from '@/engine/simulator/cell/vision';
import type { WorldState } from '@/engine/simulator/sim';

import css from './cellHud.module.css';

const W = 248;

export default function CellCamera({ world, cell }: { world: RefObject<WorldState | null>; cell: CellId }) {
  const area = cellLayout(cell).line.camera;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shot, setShot] = useState<{ s: Shot; text: string; to: string | null; ago: number } | null>(null);
  const last = useRef<{ s: Shot; ago: number } | null>(null);
  const along = area ? area.max[1] - area.min[1] : 1;
  const across = area ? area.max[0] - area.min[0] : 1;
  const H = Math.round((W * across) / along);

  useEffect(() => {
    if (!area) return;
    const draw = () => {
      const w = world.current;
      const run = w?.cell;
      const c = canvas.current?.getContext('2d');
      if (!w || !run || !c) return;
      const k = W / along;
      // Canvas x along the belt (towards its end), y across it.
      const at = (x: number, y: number) => [(y - area.min[1]) * k, (area.max[0] - x) * k] as const;
      c.fillStyle = '#20252a';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      for (let x = (-(run.line.t * 50) % 10) * k; x < W; x += 10 * k) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, H);
        c.stroke();
      }
      const chosen = run.vision.shot?.chosen?.part;
      for (const o of w.objects) {
        if (o.id === w.carry?.id || o.x < area.min[0] - 15 || o.x > area.max[0] + 15 || o.y < area.min[1] - 15 || o.y > area.max[1] + 15) continue;
        if (Math.abs(o.z - (run.layout.line.belt?.topZ ?? 30)) > 6) continue;
        const [cx, cy] = at(o.x, o.y);
        const r = (o.size[0] / 2) * k;
        c.fillStyle = o.color;
        c.strokeStyle = 'rgba(255,255,255,0.55)';
        c.lineWidth = 1;
        c.beginPath();
        const shape = outlineOf(o);
        if (shape === '원') c.arc(cx, cy, r, 0, Math.PI * 2);
        else {
          const n = shape === '사각' ? 4 : 6;
          for (let i = 0; i <= n; i += 1) {
            const a = (i / n) * Math.PI * 2 + (n === 4 ? Math.PI / 4 : 0);
            const rr = n === 4 ? r * Math.SQRT2 : r;
            c[i ? 'lineTo' : 'moveTo'](cx + rr * Math.cos(a), cy + rr * Math.sin(a));
          }
        }
        c.fill();
        c.stroke();
        if (o.id === chosen) {
          c.strokeStyle = '#34d399';
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(cx - r - 6, cy);
          c.lineTo(cx + r + 6, cy);
          c.moveTo(cx, cy - r - 6);
          c.lineTo(cx, cy + r + 6);
          c.stroke();
          c.strokeRect(cx - r - 3, cy - r - 3, 2 * r + 6, 2 * r + 6);
        }
      }
      const s = run.vision.shot;
      if (!s) return;
      const ago = Math.max(0, Math.round(run.line.t - s.t));
      if (s !== last.current?.s) {
        const d = s.chosen;
        last.current = { s, ago };
        setShot({ s, text: d ? describe(run.vision, d) : '부품이 보이지 않아요', to: d && run.vision.rules.length ? decide(run.vision, d).to : null, ago });
      } else if (ago !== last.current.ago) {
        last.current = { s, ago };
        setShot((now) => (now ? { ...now, ago } : now));
      }
    };
    draw();
    const id = window.setInterval(draw, 200);
    return () => window.clearInterval(id);
  }, [world, area, H, along]);

  if (!area) return null;
  return (
    <section className={css.camera} aria-label="위 카메라">
      <header>
        <b>위 카메라</b>
        <span>{shot ? (shot.ago < 1 ? '방금 찍었어요' : `${shot.ago}초 전에 찍음`) : '아직 찍지 않았어요'}</span>
      </header>
      <canvas ref={canvas} width={W} height={H} />
      {shot && (
        <p>
          {shot.text}
          {shot.to && <em> → {shot.to}</em>}
        </p>
      )}
    </section>
  );
}
