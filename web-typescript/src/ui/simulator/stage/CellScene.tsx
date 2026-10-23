'use client';

/**
 * A 실습 셀 drawn around the arm (engine/simulator/cell/cells.ts has its geometry and the solids the
 * arm and the physics know): an industrial cell at 1/5 of shop size — the robot on a pedestal over a
 * concrete floor, the equipment on aluminium-profile frames down to the floor.
 *
 *  A 공급 · 적재: a stack magazine (four profile posts, a clear tube) on the feed table, the blue feed
 *  cylinder whose pusher slides out under it, the belt conveyor with guide rails, its drive and end
 *  stop, the end sensor's light beam, the source plate and the pallet plate on their stands, and the
 *  control cabinet with its stack light and signal lamps.
 *
 * What moves is read from the world every frame (the pusher, the belt, the beam, the lamps).
 */

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type RefObject } from 'react';
import { CanvasTexture, SRGBColorSpace, type Group, type Mesh, type MeshStandardMaterial, type Texture } from 'three';

import { CELL_FLOOR_Z, cellLayout, gridPlace, type CellId } from '@/engine/simulator/cell/cells';
import type { WorldState } from '@/engine/simulator/sim';

import { RBox, Turned, belt, brushed, grain, pill } from './sceneKit';

const m = (mm: number) => mm / 1000;
const F = CELL_FLOOR_Z;

const Alu = ({ rep = [1, 1] as [number, number] }) => <meshStandardMaterial color="#c9cfd6" metalness={0.75} roughness={0.36} map={brushed(rep)} />;
const Paint = ({ color, rough = 0.45 }: { color: string; rough?: number }) => <meshPhysicalMaterial color={color} roughness={rough} clearcoat={0.3} clearcoatRoughness={0.5} bumpMap={grain([3, 3])} bumpScale={0.3} />;
const Steel = ({ color = '#5b636d' }: { color?: string }) => <meshStandardMaterial color={color} metalness={0.55} roughness={0.45} />;
const Rubber = () => <meshStandardMaterial color="#1d2025" roughness={0.9} />;

/** A drawn sheet (canvas texture, 4 px per mm) lying flat at z, mm. */
function useSheet(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * 4);
    c.height = Math.round(h * 4);
    draw(c.getContext('2d')!, c.width, c.height);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once per key
  }, [key, w, h]);
}

/** An aluminium profile post from the floor up to z, mm. */
function Post({ x, y, top, s = 8 }: { x: number; y: number; top: number; s?: number }) {
  return (
    <group>
      <RBox at={[x, y, (F + top) / 2]} size={[s, s, top - F]} radius={1}>
        <Alu rep={[1, 6]} />
      </RBox>
      <Turned at={[x, y, F]} profile={pill(s * 0.8, 3, 1)} segments={16}>
        <Rubber />
      </Turned>
    </group>
  );
}

/** A table top on four profile legs (its top at z), mm. */
function Stand({ x0, x1, y0, y1, top, thick = 6, plate }: { x0: number; x1: number; y0: number; y1: number; top: number; thick?: number; plate?: Texture }) {
  const legs: [number, number][] = [
    [x0 + 8, y0 + 8],
    [x1 - 8, y0 + 8],
    [x0 + 8, y1 - 8],
    [x1 - 8, y1 - 8],
  ];
  return (
    <group>
      {legs.map(([x, y]) => (
        <Post key={`${x},${y}`} x={x} y={y} top={top - thick} />
      ))}
      {/* Cross rails low and under the top. */}
      {[F + 20, top - thick - 6].map((z) => (
        <group key={z}>
          <RBox at={[(x0 + x1) / 2, y0 + 8, z]} size={[x1 - x0 - 16, 6, 6]} radius={0.8}>
            <Alu />
          </RBox>
          <RBox at={[(x0 + x1) / 2, y1 - 8, z]} size={[x1 - x0 - 16, 6, 6]} radius={0.8}>
            <Alu />
          </RBox>
        </group>
      ))}
      <RBox at={[(x0 + x1) / 2, (y0 + y1) / 2, top - thick / 2]} size={[x1 - x0, y1 - y0, thick]} radius={1.2}>
        {plate ? <meshStandardMaterial map={plate} metalness={0.35} roughness={0.5} /> : <Alu />}
      </RBox>
    </group>
  );
}

function Floor() {
  const tex = useSheet('cell-floor', 400, 400, (ctx, w, h) => {
    ctx.fillStyle = '#b9bcbd';
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k += 1) {
      const v = 150 + ((k * 97) % 70);
      ctx.fillStyle = `rgba(${v}, ${v}, ${v + 2}, 0.18)`;
      ctx.fillRect((k * 131) % w, (k * 71) % h, 2 + (k % 3), 2 + (k % 2));
    }
    // Saw cuts every 1 m of shop floor (here 200 mm): a faint grid.
    ctx.strokeStyle = 'rgba(80, 84, 88, 0.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += h / 2) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
  const hazard = useSheet('cell-hazard', 200, 8, (ctx, w, h) => {
    ctx.fillStyle = '#f2c200';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1b1b';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 - h, h);
      ctx.lineTo(x - h, h);
      ctx.fill();
    }
  });
  const tiles: [number, number][] = [];
  for (let x = -600; x <= 900; x += 400) for (let y = -800; y <= 800; y += 400) tiles.push([x, y]);
  // The cell's floor marking: a hazard line round the robot's working area.
  const box = { x0: -150, x1: 300, y0: -440, y1: 230 };
  const tape: [number, number, number, number][] = [
    [(box.x0 + box.x1) / 2, box.y0, box.x1 - box.x0, 0],
    [(box.x0 + box.x1) / 2, box.y1, box.x1 - box.x0, 0],
    [box.x0, (box.y0 + box.y1) / 2, box.y1 - box.y0, Math.PI / 2],
    [box.x1, (box.y0 + box.y1) / 2, box.y1 - box.y0, Math.PI / 2],
  ];
  return (
    <group>
      {tiles.map(([x, y]) => (
        <mesh key={`${x},${y}`} position={[m(x), m(y), m(F)]} receiveShadow>
          <planeGeometry args={[m(400), m(400)]} />
          <meshStandardMaterial map={tex} roughness={0.92} />
        </mesh>
      ))}
      {tape.map(([x, y, len, rot], i) => (
        <mesh key={i} position={[m(x), m(y), m(F + 0.4)]} rotation={[0, 0, rot]} receiveShadow>
          <planeGeometry args={[m(len), m(8)]} />
          <meshStandardMaterial map={hazard} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** The robot's pedestal: a steel column on a base plate with anchor bolts, its top at z 0. */
function Pedestal() {
  return (
    <group>
      <RBox at={[-20, 0, F + 3]} size={[170, 160, 6]} radius={1.5}>
        <Steel color="#4b525b" />
      </RBox>
      {[
        [-95, -70],
        [55, -70],
        [-95, 70],
        [55, 70],
      ].map(([x, y]) => (
        <Turned key={`${x},${y}`} at={[x, y, F + 6]} profile={pill(4, 5, 1)} segments={12}>
          <Steel color="#8a929b" />
        </Turned>
      ))}
      <RBox at={[-20, 0, (F + 6 - 6) / 2]} size={[120, 110, -F - 12]} radius={4}>
        <Paint color="#d8dbe0" rough={0.4} />
      </RBox>
      <RBox at={[-20, 0, -3]} size={[150, 140, 6]} radius={1.5}>
        <Steel color="#4b525b" />
      </RBox>
    </group>
  );
}

/** Belt conveyor of cell A, with what moves on it read from the world. */
function Conveyor({ world }: { world: RefObject<WorldState | null> }) {
  const l = cellLayout('feed');
  const b = l.line.belt!;
  const [x0, y0] = b.min;
  const [x1, y1] = b.max;
  const w = x1 - x0;
  const len = y1 - y0;
  const tex = useMemo(() => {
    const t = belt([1, len / 40]).clone();
    t.needsUpdate = true;
    return t;
  }, [len]);
  const beam = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const run = world.current?.cell;
    if (!run) return;
    if (run.line.out[l.line.beltOutput!] && !run.line.halted) tex.offset.y -= (b.speed * Math.min(dt, 0.1)) / 40;
    const mat = beam.current?.material as MeshStandardMaterial | undefined;
    if (mat) {
      const cut = !!run.line.in['끝 센서'];
      mat.emissiveIntensity = cut ? 0.25 : 1.6;
      mat.opacity = cut ? 0.25 : 0.85;
    }
  });
  const cx = (x0 + x1) / 2;
  const legs = [y0 + 20, (y0 + y1) / 2, y1 - 20];
  return (
    <group>
      {/* Belt over its bed. */}
      <RBox at={[cx, (y0 + y1) / 2, b.topZ - 4]} size={[w, len, 8]} radius={3}>
        <meshStandardMaterial map={tex} roughness={0.85} />
      </RBox>
      {/* Side profiles and drums. */}
      {[-1, 1].map((s) => (
        <RBox key={s} at={[cx + (s * (w + 8)) / 2, (y0 + y1) / 2, b.topZ - 10]} size={[8, len + 16, 22]} radius={1.5}>
          <Alu rep={[1, len / 60]} />
        </RBox>
      ))}
      {[y0 + 4, y1 - 4].map((y) => (
        <mesh key={y} position={[m(cx), m(y), m(b.topZ - 6)]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(6), m(6), m(w + 2), 24]} />
          <meshStandardMaterial color="#b9c1ca" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {/* Legs down to the floor, with a brace. */}
      {legs.map((y) => (
        <group key={y}>
          {[-1, 1].map((s) => (
            <Post key={s} x={cx + (s * (w - 4)) / 2} y={y} top={b.topZ - 20} />
          ))}
          <RBox at={[cx, y, F + 24]} size={[w - 6, 6, 6]} radius={0.8}>
            <Alu />
          </RBox>
        </group>
      ))}
      {/* Guide rails (the cell's fixed boxes) and the end stop. */}
      {l.fixed
        .filter((f) => f.name === '컨베이어 가이드')
        .map((f, i) => (
          <RBox key={i} at={[(f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2, (f.min[2] + f.max[2]) / 2]} size={[f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]]} radius={0.6}>
            <Alu rep={[1, 4]} />
          </RBox>
        ))}
      {l.fixed
        .filter((f) => f.name === '끝 멈춤판')
        .map((f, i) => (
          <RBox key={i} at={[(f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2, (f.min[2] + f.max[2]) / 2]} size={[f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]]} radius={0.8}>
            <Paint color="#f2c200" />
          </RBox>
        ))}
      {/* Drive: a gear motor beside the far drum. */}
      <group position={[m(x1 + 18), m(y1 - 10), m(b.topZ - 10)]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(9), m(9), m(26), 24]} />
          <Paint color="#2f4fb8" rough={0.35} />
        </mesh>
        <RBox at={[-14, 0, 0]} size={[10, 22, 22]} radius={2}>
          <Paint color="#3a4350" />
        </RBox>
      </group>
      {/* End sensor: emitter and reflector on brackets, the beam between them. */}
      {(['a', 'b'] as const).map((k) => {
        const s = l.line.sensors.find((x) => x.kind === 'beam')!;
        const p = s.kind === 'beam' ? s[k] : [0, 0, 0];
        return (
          <group key={k}>
            <RBox at={[p[0] + (k === 'a' ? -5 : 5), p[1], p[2]]} size={[8, 10, 14]} radius={1.5}>
              <Paint color={k === 'a' ? '#1f2a36' : '#e8e2d0'} rough={0.35} />
            </RBox>
            <RBox at={[p[0] + (k === 'a' ? -5 : 5), p[1], (b.topZ + p[2]) / 2 - 6]} size={[3, 6, p[2] - b.topZ]} radius={0.5}>
              <Steel />
            </RBox>
          </group>
        );
      })}
      {(() => {
        const s = l.line.sensors.find((x) => x.kind === 'beam')!;
        if (s.kind !== 'beam') return null;
        return (
          <mesh ref={beam} position={[m((s.a[0] + s.b[0]) / 2), m(s.a[1]), m(s.a[2])]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[m(0.6), m(0.6), m(s.b[0] - s.a[0]), 8]} />
            <meshStandardMaterial color="#ff3b30" emissive="#ff2a1f" emissiveIntensity={1.6} transparent opacity={0.85} toneMapped={false} />
          </mesh>
        );
      })()}
    </group>
  );
}

/** Feed table, magazine and feed cylinder; the pusher follows the line's cylinder travel. */
function Feeder({ world }: { world: RefObject<WorldState | null> }) {
  const l = cellLayout('feed');
  const pu = l.line.pusher!;
  const mag = l.line.magazine!;
  const pusher = useRef<Group>(null);
  const rod = useRef<Mesh>(null);
  const len = pu.retracted[1] - pu.retracted[0];
  useFrame(() => {
    const ext = world.current?.cell?.line.ext ?? 0;
    const x0 = pu.retracted[0] + (pu.extended[0] - pu.retracted[0]) * ext;
    if (pusher.current) pusher.current.position.x = m(x0 + len / 2);
    if (rod.current) {
      // The rod runs from the cylinder's head to the pusher's back.
      const back = x0 + len;
      const head = 418;
      rod.current.position.x = m((back + head) / 2);
      rod.current.scale.y = Math.max(0.01, head - back);
    }
  });
  const cy = (pu.y[0] + pu.y[1]) / 2;
  const cz = (pu.z[0] + pu.z[1]) / 2;
  const inner = 27;
  const tube = { x0: mag.x - inner / 2, x1: mag.x + inner / 2, y0: mag.y - inner / 2, y1: mag.y + inner / 2 };
  return (
    <group>
      <Stand x0={259} x1={340} y0={-392} y1={-348} top={mag.floorZ} />
      {/* Magazine: four profile posts round a clear tube. */}
      {[
        [tube.x0 - 4, tube.y0 - 4],
        [tube.x1 + 4, tube.y0 - 4],
        [tube.x0 - 4, tube.y1 + 4],
        [tube.x1 + 4, tube.y1 + 4],
      ].map(([x, y]) => (
        <RBox key={`${x},${y}`} at={[x, y, (mag.floorZ + 250) / 2]} size={[6, 6, 250 - mag.floorZ]} radius={0.8}>
          <Alu rep={[1, 5]} />
        </RBox>
      ))}
      <mesh position={[m(mag.x), m(mag.y), m((51 + 250) / 2)]}>
        <boxGeometry args={[m(inner + 4), m(inner + 4), m(250 - 51)]} />
        <meshPhysicalMaterial color="#dfeef8" transparent opacity={0.22} roughness={0.08} metalness={0} transmission={0.6} depthWrite={false} />
      </mesh>
      <RBox at={[mag.x, mag.y, 252]} size={[inner + 14, inner + 14, 5]} radius={1}>
        <Alu />
      </RBox>
      {/* Cylinder body (blue) with its end caps, on a bracket. */}
      <group position={[m(450), m(cy), m(cz + 4)]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(10), m(10), m(56), 28]} />
          <Paint color="#2a68d8" rough={0.3} />
        </mesh>
        {[-30, 30].map((dx) => (
          <RBox key={dx} at={[dx, 0, 0]} size={[8, 24, 24]} radius={1.5}>
            <Alu />
          </RBox>
        ))}
        {/* Air fittings. */}
        {[-22, 22].map((dx) => (
          <mesh key={dx} position={[m(dx), 0, m(12)]}>
            <cylinderGeometry args={[m(2), m(2), m(6), 10]} />
            <meshStandardMaterial color="#b8bec6" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </group>
      <RBox at={[450, cy, (F + cz) / 2]} size={[10, 10, cz - F]} radius={1}>
        <Alu rep={[1, 4]} />
      </RBox>
      <mesh ref={rod} position={[0, m(cy), m(cz + 4)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(3), m(3), m(1), 16]} />
        <meshStandardMaterial color="#e8ecf0" metalness={0.95} roughness={0.12} />
      </mesh>
      <group ref={pusher} position={[0, m(cy), m(cz)]}>
        <RBox size={[len, pu.y[1] - pu.y[0], pu.z[1] - pu.z[0]]} radius={1.2}>
          <Alu rep={[3, 1]} />
        </RBox>
      </group>
    </group>
  );
}

/** A plate on a stand with its marked places (the source plate's 1 ~ 9, the pallet's pattern). */
function MarkedPlate({ grid, label, origin }: { grid: 'source' | 'pallet'; label: string; origin: boolean }) {
  const l = cellLayout('feed');
  const g = l.grids[grid === 'source' ? '소재 판' : '적재 판'];
  const box = l.fixed.find((f) => f.name === (grid === 'source' ? '소재 판' : '적재 판'))!;
  const [x0, y0] = [box.min[0], box.min[1]];
  const [x1, y1] = [box.max[0], box.max[1]];
  const W = x1 - x0;
  const H = y1 - y0;
  const plate = useSheet(`plate-${grid}`, W, H, (ctx, w, h) => {
    const s = w / W;
    ctx.fillStyle = '#c3c9cf';
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 2600; k += 1) {
      const v = 175 + ((k * 37) % 60);
      ctx.strokeStyle = `rgba(${v}, ${v}, ${v + 3}, 0.35)`;
      ctx.beginPath();
      const y = (k * 53) % h;
      const x = (k * 97) % w;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40, y);
      ctx.stroke();
    }
    // The canvas's x is the plate's y (the robot's left-right), its y the plate's x, flipped.
    const at = (px: number, py: number) => [(py - y0) * s, (x1 - px) * s] as const;
    for (let k = 0; k < g.rows * g.cols; k += 1) {
      const p = gridPlace(g, k);
      const [cx, cy] = at(p.x, p.y);
      ctx.strokeStyle = 'rgba(40, 46, 54, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12.5 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(40, 46, 54, 0.85)';
      ctx.font = `bold ${6 * s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (grid === 'source') ctx.fillText(String(k + 1), cx, cy);
    }
    if (origin) {
      const [cx, cy] = at(g.origin.x, g.origin.y);
      ctx.strokeStyle = '#e5322d';
      ctx.lineWidth = 3 * (s / 4);
      ctx.strokeRect(cx - 14 * s, cy - 14 * s, 28 * s, 28 * s);
      ctx.fillStyle = '#e5322d';
      ctx.font = `bold ${5 * s}px sans-serif`;
      ctx.fillText('기준', cx, cy - 17 * s);
    }
    ctx.fillStyle = 'rgba(30, 36, 44, 0.8)';
    ctx.font = `bold ${7 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, w / 2, h - 5 * s);
  });
  plate.rotation = Math.PI / 2;
  plate.center.set(0.5, 0.5);
  return <Stand x0={x0} x1={x1} y0={y0} y1={y1} top={box.max[2]} plate={plate} />;
}

/** Control cabinet with a stack light (green: running, amber: a 주의, red: stopped or broken) and signal lamps. */
function Cabinet({ world, cell }: { world: RefObject<WorldState | null>; cell: CellId }) {
  const l = cellLayout(cell);
  const lights = useRef<(MeshStandardMaterial | null)[]>([]);
  const lamps = useRef<(MeshStandardMaterial | null)[]>([]);
  const signals = [...l.inputs, ...l.outputs];
  useFrame(() => {
    const run = world.current?.cell;
    if (!run) return;
    const recent = run.alerts.length ? run.alerts[run.alerts.length - 1] : null;
    const red = !!run.halt || !!run.health.fault;
    const amber = !red && !!recent && recent.level === 'warn' && run.line.t - recent.t < 4;
    const green = !red && !amber;
    [green, amber, red].forEach((on, i) => {
      const mat = lights.current[i];
      if (mat) mat.emissiveIntensity = on ? (i === 2 && Math.floor(run.line.t * 3) % 2 ? 0.3 : 2) : 0.08;
    });
    signals.forEach((name, i) => {
      const mat = lamps.current[i];
      const on = i < l.inputs.length ? run.line.in[name] : run.line.out[name];
      if (mat) mat.emissiveIntensity = on ? 1.8 : 0.05;
    });
  });
  const at = { x: -60, y: -330 };
  return (
    <group>
      <RBox at={[at.x, at.y, F + 95]} size={[44, 70, 190]} radius={2}>
        <Paint color="#e4e6e8" rough={0.5} />
      </RBox>
      <RBox at={[at.x, at.y, F + 3]} size={[48, 74, 6]} radius={1}>
        <Steel color="#3a3f46" />
      </RBox>
      {/* Lamp panel on the front (facing +x). */}
      <RBox at={[at.x + 22.5, at.y, F + 150]} size={[1.5, 56, 40]} radius={0.5}>
        <meshStandardMaterial color="#2a3038" roughness={0.6} />
      </RBox>
      {signals.map((name, i) => {
        const col = i < l.inputs.length ? '#3ddc84' : '#ffb020';
        const row = i < l.inputs.length ? 0 : 1;
        const k = i < l.inputs.length ? i : i - l.inputs.length;
        return (
          <mesh key={name} position={[m(at.x + 23.6), m(at.y - 18 + k * 12), m(F + 160 - row * 18)]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[m(3.2), m(3.2), m(1.5), 18]} />
            <meshStandardMaterial
              ref={(r) => {
                lamps.current[i] = r;
              }}
              color={col}
              emissive={col}
              emissiveIntensity={0.05}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      {/* Stack light on top. */}
      <group position={[m(at.x), m(at.y + 20), m(F + 190)]}>
        <Turned profile={pill(5, 10, 1)} segments={20}>
          <Paint color="#2a2f36" />
        </Turned>
        {['#29c46a', '#f5a524', '#ff4a3d'].map((c, i) => (
          <Turned key={c} at={[0, 0, 10 + i * 12]} profile={pill(6.5, 11, 1.4)} segments={24}>
            <meshStandardMaterial
              ref={(r) => {
                lights.current[i] = r;
              }}
              color={c}
              emissive={c}
              emissiveIntensity={0.08}
              roughness={0.3}
              toneMapped={false}
            />
          </Turned>
        ))}
      </group>
    </group>
  );
}

/** Fence panels behind the cell (mesh, on posts). */
function Fence() {
  const mesh = useSheet('cell-fence', 100, 100, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60, 66, 74, 0.85)';
    ctx.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 10) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += h / 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
  const panels: { x: number; y: number; len: number; rot: number }[] = [];
  for (let y = -460; y < 280; y += 120) panels.push({ x: -200, y: y + 60, len: 120, rot: Math.PI / 2 });
  const H = 360;
  return (
    <group>
      {panels.map((p, i) => (
        <group key={i}>
          <mesh position={[m(p.x), m(p.y), m(F + H / 2 + 20)]} rotation={[Math.PI / 2, p.rot, 0]}>
            <planeGeometry args={[m(p.len - 6), m(H)]} />
            <meshStandardMaterial map={mesh} transparent alphaTest={0.2} side={2} color="#5d6570" roughness={0.6} />
          </mesh>
          <Post x={p.x} y={p.y - p.len / 2} top={F + H + 30} s={7} />
        </group>
      ))}
      <Post x={-200} y={280 - 60 + 60} top={F + H + 30} s={7} />
    </group>
  );
}

export default function CellScene({ world, cell }: { world: RefObject<WorldState | null>; cell: CellId }) {
  return (
    <group>
      <Floor />
      <Fence />
      <Pedestal />
      {cell === 'feed' && (
        <>
          <Conveyor world={world} />
          <Feeder world={world} />
          <MarkedPlate grid="source" label="소재 판" origin={false} />
          <MarkedPlate grid="pallet" label="적재 판" origin />
        </>
      )}
      <Cabinet world={world} cell={cell} />
    </group>
  );
}
