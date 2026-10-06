'use client';

/**
 * The scenes of 작업대 꾸미기 (arm-only theme): the fixed furniture around the robot, in the robot
 * base frame (mm, z up, front = +x), built from rounded and turned parts with drawn surface textures
 * (stage/sceneKit.tsx). The loose things of each scene (blocks, parts, boxes, fruit …) are desk
 * objects (engine/simulator/desk.ts sceneObjects), and the furniture's collision boxes are SCENE_FIXED
 * there — keep the two in step with this drawing.
 *
 *  - lab: a Physical AI bench — a cutting mat with a grid and rulers under the blocks, cups and tray.
 *  - factory: a production cell — a cleated belt conveyor on aluminium profiles with a drive, an
 *    inspection gate with a camera and a light bar, a stack light, floor tape, light-curtain posts.
 *  - logistics: palletising — a wooden pallet, boxes, a roller conveyor, a label printer.
 *  - home: a service robot at a table — a wooden table top, a plate, a bowl, a serving tray.
 */

import { useMemo, type ReactNode } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

import { RBox, Turned, belt, brushed, grain, pill, stripes, wood } from './sceneKit';

export const SCENE_PRESETS = ['lab', 'factory', 'logistics', 'home'] as const;
export type ScenePresetId = (typeof SCENE_PRESETS)[number];

export const SCENE_PRESET_NAME: Record<ScenePresetId, string> = {
  lab: '피지컬 AI 실험실',
  factory: '제조 라인',
  logistics: '물류 · 팔레타이징',
  home: '서비스 · 생활',
};

const m = (mm: number) => mm / 1000;

/** Materials used over and over. */
const Alu = ({ rep = [1, 1] as [number, number] }) => <meshStandardMaterial color="#c9cfd6" metalness={0.75} roughness={0.38} map={brushed(rep)} />;
const Paint = ({ color, rough = 0.45 }: { color: string; rough?: number }) => <meshPhysicalMaterial color={color} roughness={rough} clearcoat={0.3} clearcoatRoughness={0.5} bumpMap={grain([3, 3])} bumpScale={0.3} />;
const Rubber = () => <meshStandardMaterial color="#1d2025" roughness={0.9} />;

/** Flat printed sheet lying on the desk (a texture drawn on a canvas, 2 px per mm). */
function Sheet({ at, size, draw, rot = 0, rough = 0.85, z = 0.3 }: { at: [number, number]; size: [number, number]; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; rot?: number; rough?: number; z?: number }) {
  const [w, h] = size;
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Math.round(w * 2);
    c.height = Math.round(h * 2);
    draw(c.getContext('2d')!, c.width, c.height);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [w, h, draw]);
  return (
    <mesh position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, rot]} receiveShadow>
      <planeGeometry args={[m(w), m(h)]} />
      <meshStandardMaterial map={tex} roughness={rough} />
    </mesh>
  );
}

const hazard = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = '#f2c200';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1b1b1b';
  for (let x = -h; x < w + h; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 14, 0);
    ctx.lineTo(x + 14 - h, h);
    ctx.lineTo(x - h, h);
    ctx.fill();
  }
  // Worn: scuffs where carts ran over it.
  for (let k = 0; k < 40; k += 1) {
    ctx.fillStyle = `rgba(90, 90, 90, ${0.05 + ((k * 37) % 10) / 100})`;
    ctx.fillRect((k * 97) % w, ((k * 13) % h) * 0.8, 6 + ((k * 7) % 14), 2);
  }
};

/** Yellow-black tape around a rectangle on the floor, mm. */
function Tape({ x0, x1, y0, y1, w = 30 }: { x0: number; x1: number; y0: number; y1: number; w?: number }) {
  return (
    <>
      <Sheet at={[(x0 + x1) / 2, y0]} size={[x1 - x0, w]} draw={hazard} rough={0.6} />
      <Sheet at={[(x0 + x1) / 2, y1]} size={[x1 - x0, w]} draw={hazard} rough={0.6} />
      <Sheet at={[x0, (y0 + y1) / 2]} size={[y1 - y0, w]} draw={hazard} rot={Math.PI / 2} rough={0.6} />
      <Sheet at={[x1, (y0 + y1) / 2]} size={[y1 - y0, w]} draw={hazard} rot={Math.PI / 2} rough={0.6} />
    </>
  );
}

/** A metal roller across x at (x, y, z), length len, radius r, with its axle ends, mm. */
function Roller({ x, y, z, len, r, color = '#b9c1ca' }: { x: number; y: number; z: number; len: number; r: number; color?: string }) {
  return (
    <group position={[m(x), m(y), m(z)]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[m(r), m(r), m(len), 28]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.28} map={brushed([1, 2])} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[m(r * 0.35), m(r * 0.35), m(len + 10), 12]} />
        <meshStandardMaterial color="#6d757e" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** Belt conveyor along y at x, top at z = h, mm: aluminium side profiles, a cleated belt, drums, legs with feet, a drive. */
function Conveyor({ x, y0, y1, w = 110, h = 70, children }: { x: number; y0: number; y1: number; w?: number; h?: number; children?: ReactNode }) {
  const len = y1 - y0;
  const legs = [y0 + 45, (y0 + y1) / 2, y1 - 45];
  return (
    <group>
      {/* Belt over the drums. */}
      <RBox at={[x, (y0 + y1) / 2, h - 4]} size={[w, len, 8]} radius={3.5}>
        <meshStandardMaterial map={belt([1, len / 40])} roughness={0.85} />
      </RBox>
      {[y0 + 2, y1 - 2].map((y) => (
        <Roller key={y} x={x} y={y} z={h - 6} len={w + 4} r={14} />
      ))}
      {/* Side profiles with a slot line, and their end caps. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox at={[x + (s * (w + 14)) / 2, (y0 + y1) / 2, h - 8]} size={[12, len + 24, 28]} radius={2}>
            <Alu rep={[1, len / 80]} />
          </RBox>
          <mesh position={[m(x + (s * (w + 14)) / 2 + s * 6.1), m((y0 + y1) / 2), m(h - 8)]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <planeGeometry args={[m(4), m(len + 20)]} />
            <meshStandardMaterial color="#59616b" roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}
      {/* Legs with cross braces and levelling feet. */}
      {legs.map((y) => (
        <group key={y}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <RBox at={[x + (s * (w - 4)) / 2, y, (h - 22) / 2 + 3]} size={[16, 16, h - 22]} radius={1.6}>
                <Alu />
              </RBox>
              <Turned at={[x + (s * (w - 4)) / 2, y, 0]} profile={pill(11, 4, 1.2)} segments={20}>
                <Rubber />
              </Turned>
            </group>
          ))}
          <RBox at={[x, y, 18]} size={[w - 10, 10, 10]} radius={1.2}>
            <Alu />
          </RBox>
        </group>
      ))}
      {/* Drive: gear motor at the far end, on the outside. */}
      <group position={[m(x - w / 2 - 34), m(y1 - 6), m(h - 8)]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(17), m(17), m(46), 28]} />
          <Paint color="#2f4fb8" rough={0.35} />
        </mesh>
        <RBox at={[18, 0, 0]} size={[22, 40, 40]} radius={4}>
          <Paint color="#3a4350" />
        </RBox>
      </group>
      {children}
    </group>
  );
}

function Lab() {
  const mat = useMemo(
    () => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      // A self-healing cutting mat: green, a 1 cm grid, heavier every 5 cm, rulers on two edges.
      ctx.fillStyle = '#2f6f57';
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 1800; k += 1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${((k * 53) % 10) / 400})`;
        ctx.fillRect((k * 131) % w, (k * 71) % h, 2, 2);
      }
      for (let x = 20; x < w; x += 20) {
        ctx.fillStyle = x % 100 === 0 ? 'rgba(220, 245, 230, 0.55)' : 'rgba(220, 245, 230, 0.22)';
        ctx.fillRect(x, 0, x % 100 === 0 ? 1.6 : 1, h);
      }
      for (let y = 20; y < h; y += 20) {
        ctx.fillStyle = y % 100 === 0 ? 'rgba(220, 245, 230, 0.55)' : 'rgba(220, 245, 230, 0.22)';
        ctx.fillRect(0, y, w, y % 100 === 0 ? 1.6 : 1);
      }
      ctx.fillStyle = 'rgba(240, 250, 244, 0.85)';
      for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, x % 20 === 0 ? 14 : 7);
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, y % 20 === 0 ? 14 : 7, 1);
      ctx.font = 'bold 16px sans-serif';
      for (let x = 100; x < w; x += 100) ctx.fillText(String(x / 20), x + 3, 30);
      ctx.strokeStyle = 'rgba(240, 250, 244, 0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, w - 8, h - 8);
    },
    [],
  );
  return (
    <group>
      {/* The mat has a little thickness and a rounded edge. */}
      <RBox at={[200, 0, 0.3]} size={[264, 344, 1]} radius={0.5} shadow={false}>
        <meshStandardMaterial color="#24584a" roughness={0.9} />
      </RBox>
      <Sheet at={[200, 0]} size={[260, 340]} draw={mat} rough={0.78} z={0.85} />
    </group>
  );
}

function Factory() {
  return (
    <group>
      <Tape x0={-260} x1={460} y0={-420} y1={420} />
      <Conveyor x={240} y0={-400} y1={400}>
        {/* Inspection gate over the belt: posts, a beam with a camera and a light bar under it. */}
        {[-1, 1].map((s) => (
          <RBox key={s} at={[240 + s * 77, 300, 80]} size={[16, 20, 160]} radius={2}>
            <Alu />
          </RBox>
        ))}
        <RBox at={[240, 300, 150]} size={[170, 22, 20]} radius={3}>
          <Paint color="#2f4fb8" rough={0.35} />
        </RBox>
        <mesh position={[m(240), m(300), m(138)]}>
          <boxGeometry args={[m(124), m(10), m(4)]} />
          <meshStandardMaterial color="#cfe8ff" emissive="#8cc8ff" emissiveIntensity={1.6} toneMapped={false} />
        </mesh>
        <RBox at={[240, 300, 168]} size={[34, 30, 18]} radius={3}>
          <Paint color="#1f242b" rough={0.3} />
        </RBox>
        <mesh position={[m(240), m(300), m(158)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[m(7), m(8), m(6), 20]} />
          <meshPhysicalMaterial color="#0b0d10" roughness={0.05} clearcoat={1} />
        </mesh>
        {/* Stack light on the gate post: green, amber, red. */}
        <group position={[m(323), m(300), m(160)]}>
          <Turned profile={pill(6, 8, 1)} segments={20}>
            <Paint color="#2a2f36" />
          </Turned>
          {['#29c46a', '#f5a524', '#ff4a3d'].map((c, i) => (
            <Turned key={c} at={[0, 0, 8 + i * 13]} profile={pill(7, 12, 1.5)} segments={24}>
              <meshPhysicalMaterial color={c} emissive={c} emissiveIntensity={i === 0 ? 1.4 : 0.15} transmission={0.2} roughness={0.25} toneMapped={i !== 0} />
            </Turned>
          ))}
        </group>
      </Conveyor>
      {/* Light-curtain posts at the cell's open side: yellow housings, a dark lens strip. */}
      {[-380, 380].map((y) => (
        <group key={y}>
          <RBox at={[440, y, 150]} size={[20, 20, 300]} radius={3}>
            <Paint color="#f2c200" rough={0.4} />
          </RBox>
          <mesh position={[m(440 - 10.2), m(y), m(160)]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[m(10), m(250)]} />
            <meshPhysicalMaterial color="#14171c" roughness={0.1} clearcoat={1} />
          </mesh>
          <RBox at={[440, y, 312]} size={[22, 22, 24]} radius={4}>
            <meshStandardMaterial color="#ff5a4e" emissive="#ff3b30" emissiveIntensity={0.8} />
          </RBox>
          <RBox at={[440, y, 2]} size={[34, 34, 4]} radius={1.5}>
            <Alu />
          </RBox>
        </group>
      ))}
    </group>
  );
}

/** A wooden pallet: three bottom boards, nine blocks, five deck boards (fits SCENE_FIXED's 240 × 200 × 30). */
function Pallet({ x, y }: { x: number; y: number }) {
  const W = <meshStandardMaterial color="#c8925a" map={wood([1, 1])} roughness={0.85} />;
  return (
    <group position={[m(x), m(y), 0]}>
      {[-80, 0, 80].map((yy) => (
        <RBox key={yy} at={[0, yy, 3]} size={[240, 36, 6]} radius={1.2}>
          {W}
        </RBox>
      ))}
      {[-100, 0, 100].flatMap((xx) =>
        [-80, 0, 80].map((yy) => (
          <RBox key={`${xx}${yy}`} at={[xx, yy, 14]} size={[34, 34, 16]} radius={1.5}>
            <meshStandardMaterial color="#b98451" map={wood([1, 1])} roughness={0.9} />
          </RBox>
        )),
      )}
      {[-80, 0, 80].map((yy) => (
        <RBox key={`s${yy}`} at={[0, yy, 23.5]} size={[240, 34, 3]} radius={1}>
          {W}
        </RBox>
      ))}
      {[-104, -52, 0, 52, 104].map((xx) => (
        <RBox key={`d${xx}`} at={[xx, 0, 27.5]} size={[30, 200, 5]} radius={1.2}>
          <meshStandardMaterial color="#d29d66" map={wood([1, 1])} roughness={0.82} />
        </RBox>
      ))}
    </group>
  );
}

function Logistics() {
  return (
    <group>
      <Pallet x={180} y={-210} />
      {/* Roller conveyor bringing boxes in: blue frames, rollers, legs with feet, an end stop. */}
      <group>
        {Array.from({ length: 14 }, (_, i) => (
          <Roller key={i} x={230} y={60 + i * 26} z={69} len={146} r={11} />
        ))}
        {[-1, 1].map((s) => (
          <RBox key={s} at={[230 + s * 80, 232, 68]} size={[10, 380, 26]} radius={2}>
            <Paint color="#2f4fb8" rough={0.35} />
          </RBox>
        ))}
        {[70, 395].flatMap((y) =>
          [-1, 1].map((s) => (
            <group key={`${y}${s}`}>
              <RBox at={[230 + s * 74, y, 30]} size={[14, 14, 56]} radius={1.6}>
                <Alu />
              </RBox>
              <Turned at={[230 + s * 74, y, 0]} profile={pill(10, 4, 1.2)} segments={20}>
                <Rubber />
              </Turned>
            </group>
          )),
        )}
        <RBox at={[230, 414, 86]} size={[160, 6, 12]} radius={2}>
          <meshStandardMaterial color="#f2c200" map={stripes([4, 1], 'stripes-stop')} roughness={0.5} />
        </RBox>
      </group>
      {/* Label printer: a rounded body, dark lid, a lit display, a label coming out. */}
      <group>
        <RBox at={[-60, -260, 40]} size={[120, 90, 80]} radius={8}>
          <Paint color="#e7ebf0" rough={0.5} />
        </RBox>
        <RBox at={[-60, -260, 86]} size={[112, 82, 12]} radius={6}>
          <Paint color="#2a3038" rough={0.35} />
        </RBox>
        <mesh position={[m(-6), m(-262), m(52)]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[m(24), m(38)]} />
          <meshStandardMaterial color="#0d1a2a" emissive="#4aa3ff" emissiveIntensity={0.7} />
        </mesh>
        <RBox at={[-2, -245, 70]} size={[8, 40, 1.2]} radius={0.4} shadow={false}>
          <meshStandardMaterial color="#ffffff" roughness={0.7} />
        </RBox>
      </group>
    </group>
  );
}

function Home() {
  return (
    <group>
      {/* Round wooden table top under the work area, with a soft edge. */}
      <mesh position={[m(190), 0, m(-1.5)]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[m(232), m(230), m(3.6), 96]} />
        <meshPhysicalMaterial color="#9c7048" map={wood([2, 1])} roughness={0.5} clearcoat={0.45} clearcoatRoughness={0.35} />
      </mesh>
      {/* Plate: a rim and a shallow well, glazed. */}
      <Turned at={[200, -40, 0]} profile={[[0, 0], [60, 0], [64, 1.5], [70, 4], [95, 7.2], [96, 8], [94, 8.4], [70, 5.6], [62, 3.2], [0, 3.2]]} segments={72}>
        <meshPhysicalMaterial color="#ffffff" roughness={0.18} clearcoat={1} clearcoatRoughness={0.08} />
      </Turned>
      {/* Bowl: thick ceramic, a foot ring. */}
      <Turned at={[300, -170, 0]} profile={[[0, 2], [26, 2], [28, 0], [32, 0], [34, 3], [52, 22], [68, 52], [70, 55], [66, 55.5], [63, 52], [48, 24], [30, 7], [0, 7]]} segments={64}>
        <meshPhysicalMaterial color="#f4efe6" roughness={0.22} clearcoat={0.9} clearcoatRoughness={0.12} />
      </Turned>
      {/* Serving tray the robot serves on: a dark base with a raised rim and handles. */}
      <group>
        <RBox at={[60, -220, 2]} size={[220, 140, 4]} radius={3}>
          <Paint color="#3b4350" rough={0.4} />
        </RBox>
        {(
          [
            [60, -153, 220, 6],
            [60, -287, 220, 6],
            [-47, -220, 6, 128],
            [167, -220, 6, 128],
          ] as const
        ).map(([x, y, a, b], i) => (
          <RBox key={i} at={[x, y, 5]} size={[a, b, 10]} radius={2.6}>
            <Paint color="#333a46" rough={0.4} />
          </RBox>
        ))}
      </group>
    </group>
  );
}

export function ScenePreset({ id }: { id: ScenePresetId }) {
  switch (id) {
    case 'lab':
      return <Lab />;
    case 'factory':
      return <Factory />;
    case 'logistics':
      return <Logistics />;
    case 'home':
      return <Home />;
  }
}
