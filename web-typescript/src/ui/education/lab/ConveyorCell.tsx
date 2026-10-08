'use client';

/**
 * The 컨베이어 공정 cell in 3D (inside LearnStage's robot-frame group: metres, z up), modelled in
 * the simulator's own style (stage/sceneKit.tsx: rounded parts, drawn surface textures, nothing
 * downloaded, so it also works offline in the desktop program): a belt conveyor whose belt really
 * moves (its texture scrolls with the run's belt travel), aluminium side profiles, end drums, legs
 * and a gear motor; photoelectric sensors on posts with their beam across the belt; cardboard
 * boxes; the wooden pallet of the 물류 scene; a reject bin at the belt's end.
 *
 * Every frame it plays the run (engine/education/lab/run.ts frames, through ./playback): the
 * arm follows it (LearnStage reads `player.arm`), the boxes move and a box lights the beam it breaks. Overlays (miss line, 닿을 수 없음
 * markers, the reach arc, tool paths) are drawn from props.
 */

import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, Vector3, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Texture } from 'three';

import { BEAM_Z, BELT, BIN, PALLET, SENSOR_X, type BoxSpec, type Mm } from '@/engine/education/lab/cell';

import { Pallet, Roller } from '../../simulator/stage/ScenePreset';
import { RBox, Turned, belt, brushed, cardboard, grain, pill } from '../../simulator/stage/sceneKit';
import { LEARN_COLORS } from '../stage/learn3d';
import type { Playback } from './playback';

const m = (mm: number) => mm / 1000;
const v3 = (p: readonly number[]) => new Vector3(m(p[0]), m(p[1]), m(p[2]));

export interface CellMarker {
  key: string;
  mm: Mm;
  ok: boolean;
  text?: string;
}

export interface CellOverlay {
  /** Cup → box top centre, with its distance. */
  miss?: { from: Mm; to: Mm; text: string; ok: boolean } | null;
  markers?: CellMarker[];
  /** How far the arm reaches at height z (an arc over the belt), mm. */
  reach?: { r: number; z: number } | null;
  /** Tool tip path of this run and of the one before (ghost). */
  path?: Mm[] | null;
  ghostPath?: Mm[] | null;
  /** Sensor labels ("센서 1" …), one per sensor. */
  sensorNames?: string[];
}

interface Props {
  player: Playback;
  boxes: readonly BoxSpec[];
  /** Sensor beam positions along the belt, y mm. */
  sensors: readonly number[];
  overlay: CellOverlay;
}

export default function ConveyorCell({ player, boxes, sensors, overlay }: Props) {
  const beltTex = useMemo(() => {
    const t = belt([1, 1]).clone();
    t.repeat.set(1, (BELT.yIn - BELT.yOut) / 40);
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => beltTex.dispose(), [beltTex]);
  const boxRefs = useRef<(Group | null)[]>([]);
  const beamRefs = useRef<(Mesh | null)[]>([]);
  const ledRefs = useRef<(Mesh | null)[]>([]);

  useFrame((_, dt) => {
    const f = player.advance(dt);
    const list = f?.boxes ?? player.still ?? [];
    boxRefs.current.forEach((g, i) => {
      if (!g) return;
      const b = list[i];
      g.visible = !!b && b.mode !== 'wait';
      if (b) g.position.set(m(b.x), m(b.y), m(b.z));
    });
    scroll(beltTex, (f?.travel ?? 0) / 40);
    beamRefs.current.forEach((beam, k) => {
      if (!beam) return;
      const cut = !!f?.beams[k];
      (beam.material as MeshBasicMaterial).opacity = cut ? 0.95 : 0.45;
      const led = ledRefs.current[k];
      if (led) (led.material as MeshStandardMaterial).emissive.set(cut ? '#ffb020' : '#28c76f');
    });
  });

  return (
    <group>
      <BeltConveyor tex={beltTex} />
      <Pallet x={PALLET.x} y={PALLET.y} />
      <RejectBin />
      {sensors.map((y, k) => (
        <PhotoSensor
          key={k}
          y={y}
          name={overlay.sensorNames?.[k]}
          beamRef={(el) => {
            beamRefs.current[k] = el;
          }}
          ledRef={(el) => {
            ledRefs.current[k] = el;
          }}
        />
      ))}
      {boxes.map((b, i) => (
        <group
          key={b.id}
          ref={(el) => {
            boxRefs.current[i] = el;
          }}
          visible={false}
        >
          <CardBox size={b.size} color={b.color} />
        </group>
      ))}
      <Overlays overlay={overlay} />
    </group>
  );
}

/** The belt texture moves on by one cleat pitch (40 mm) per texture unit; boxes ride towards −y. */
export function scroll(t: Texture, units: number) {
  t.offset.y = units;
}

/* --- models ------------------------------------------------------------------ */

const Alu = ({ rep = [1, 1] as [number, number] }) => <meshStandardMaterial color="#c9cfd6" metalness={0.75} roughness={0.38} map={brushed(rep)} />;
const Paint = ({ color, rough = 0.45 }: { color: string; rough?: number }) => (
  <meshPhysicalMaterial color={color} roughness={rough} clearcoat={0.3} clearcoatRoughness={0.5} bumpMap={grain([3, 3])} bumpScale={0.3} />
);
const Rubber = () => <meshStandardMaterial color="#1d2025" roughness={0.9} />;

/** A belt conveyor along y: centre x, belt width and top, and where boxes come on and go off (mm). */
export interface BeltGeometry {
  x: number;
  width: number;
  top: number;
  yIn: number;
  yOut: number;
}

/** The belt conveyor along y (its frame runs 30 mm past where boxes come on and fall off); the compact cell's by default. */
export function BeltConveyor({ tex, belt: B = BELT }: { tex: Texture; belt?: BeltGeometry }) {
  const { x, width: w, top: h } = B;
  const frameHalf = w / 2 + 12;
  const y0 = B.yOut - 30;
  const y1 = B.yIn + 30;
  const len = y1 - y0;
  const yc = (y0 + y1) / 2;
  const legs = [y0 + 50, yc, y1 - 50];
  return (
    <group>
      {/* Belt: a rubber body over the drums, and its top face, whose texture scrolls as the belt runs. */}
      <RBox at={[x, yc, h - 7]} size={[w - 4, len - 4, 13]} radius={6}>
        <meshStandardMaterial color="#2a2e34" roughness={0.88} />
      </RBox>
      <mesh position={[m(x), m(yc), m(h + 0.25)]} receiveShadow>
        <planeGeometry args={[m(w - 6), m(len - 16)]} />
        <meshStandardMaterial map={tex} roughness={0.82} />
      </mesh>
      {[y0 + 8, y1 - 8].map((y) => (
        <Roller key={y} x={x} y={y} z={h - 8} len={w + 8} r={7.5} color="#9aa3ad" />
      ))}
      {/* Side profiles: aluminium extrusions with a dark slot, end caps. */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <RBox at={[x + s * (w / 2 + 6), yc, h - 8]} size={[12, len + 6, 28]} radius={2}>
            <Alu rep={[1, len / 80]} />
          </RBox>
          <mesh position={[m(x + s * (w / 2 + 12.1)), m(yc), m(h - 8)]} rotation={[0, (s * Math.PI) / 2, 0]}>
            <planeGeometry args={[m(4), m(len - 4)]} />
            <meshStandardMaterial color="#59616b" roughness={0.6} metalness={0.4} side={DoubleSide} />
          </mesh>
          {[y0 - 3, y1 + 3].map((y) => (
            <RBox key={y} at={[x + s * (w / 2 + 6), y, h - 8]} size={[14, 3, 30]} radius={1}>
              <meshStandardMaterial color="#2f343b" roughness={0.6} />
            </RBox>
          ))}
        </group>
      ))}
      {/* Legs with a cross brace and levelling feet. */}
      {legs.map((y) => (
        <group key={y}>
          {[-1, 1].map((s) => (
            <group key={s}>
              <RBox at={[x + s * (w / 2 + 6), y, (h - 22) / 2 + 3]} size={[16, 16, h - 22]} radius={1.6}>
                <Alu />
              </RBox>
              <Turned at={[x + s * (w / 2 + 6), y, 0]} profile={pill(11, 4, 1.2)} segments={20}>
                <Rubber />
              </Turned>
            </group>
          ))}
          <RBox at={[x, y, 18]} size={[w, 10, 10]} radius={1.2}>
            <Alu />
          </RBox>
        </group>
      ))}
      {/* Drive at the in-feed end, far side: a blue gear motor on a gearbox, a terminal box. */}
      <group position={[m(x + frameHalf + 30), m(B.yIn - 2), m(h - 22)]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[m(17), m(17), m(44), 32]} />
          <Paint color="#2f4fb8" rough={0.35} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[m(s * 23), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[m(15), m(15), m(3), 32]} />
            <meshStandardMaterial color="#1f2a52" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        <RBox at={[-30, 0, 0]} size={[18, 40, 40]} radius={4}>
          <Paint color="#3a4350" />
        </RBox>
        <RBox at={[4, 0, 20]} size={[22, 18, 9]} radius={2}>
          <Paint color="#2a3038" />
        </RBox>
      </group>
    </group>
  );
}

/** A cardboard box standing on z = −h/2 … h/2 of its group: tinted cardboard with the packing tape on top. */
export function CardBox({ size, color }: { size: Mm; color: string }) {
  const [sx, sy, sz] = size;
  return (
    <group>
      <RBox size={[sx, sy, sz]} radius={2.5}>
        <meshStandardMaterial color={color} map={cardboard()} roughness={0.88} />
      </RBox>
      {/* The flaps' seam and the tape over it, across the top. */}
      <mesh position={[0, 0, m(sz / 2 + 0.25)]}>
        <planeGeometry args={[m(sx * 0.3), m(sy - 1)]} />
        <meshStandardMaterial color="#e9dcc4" roughness={0.35} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0, m(sz / 2 + 0.3)]}>
        <planeGeometry args={[m(0.8), m(sy - 2)]} />
        <meshBasicMaterial color="#6f5435" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

/** Retro-reflective photoelectric sensor: emitter on the far side, reflector on the near side, the beam between. */
function PhotoSensor({ y, name, beamRef, ledRef }: { y: number; name?: string; beamRef(el: Mesh | null): void; ledRef(el: Mesh | null): void }) {
  const ex = SENSOR_X.emitter;
  const rx = SENSOR_X.reflector;
  return (
    <group>
      {/* Emitter: a post, the housing with its lens towards the belt, a status LED on top. */}
      <RBox at={[ex, y, (BEAM_Z - 8) / 2]} size={[12, 12, BEAM_Z - 8]} radius={1.5}>
        <Alu />
      </RBox>
      <RBox at={[ex, y, BEAM_Z]} size={[18, 18, 24]} radius={3}>
        <Paint color="#2b3038" rough={0.3} />
      </RBox>
      <mesh position={[m(ex - 9.1), m(y), m(BEAM_Z)]} rotation={[0, -Math.PI / 2, 0]}>
        <circleGeometry args={[m(5), 24]} />
        <meshStandardMaterial color="#ff8a5c" emissive="#ff5a3c" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh ref={ledRef} position={[m(ex), m(y), m(BEAM_Z + 12.4)]}>
        <cylinderGeometry args={[m(2.6), m(2.6), m(1.4), 16]} />
        <meshStandardMaterial color="#1b1f24" emissive="#28c76f" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {/* Reflector: a short post with a red prism plate facing the emitter. */}
      <RBox at={[rx, y, (BEAM_Z + 10) / 2]} size={[10, 14, BEAM_Z + 10]} radius={1.5}>
        <Alu />
      </RBox>
      <mesh position={[m(rx + 5.1), m(y), m(BEAM_Z)]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[m(13), m(13)]} />
        <meshPhysicalMaterial color="#d8262b" roughness={0.15} clearcoat={1} emissive="#7a0d10" emissiveIntensity={0.4} />
      </mesh>
      {/* The beam across the belt (bright while a box breaks it). */}
      <mesh ref={beamRef} position={[m((ex + rx) / 2), m(y), m(BEAM_Z)]} rotation={[0, 0, Math.PI / 2]} renderOrder={5}>
        <cylinderGeometry args={[m(0.9), m(0.9), m(ex - rx - 18), 8]} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0.45} depthWrite={false} toneMapped={false} />
      </mesh>
      {name && (
        <Html zIndexRange={[11, 0]} center position={[m(ex + 4), m(y), m(BEAM_Z + 30)]} style={{ pointerEvents: 'none' }}>
          <span style={{ font: '700 11px var(--font-ui, system-ui)', color: '#fff', background: 'rgba(16,24,40,.72)', padding: '1px 6px', borderRadius: 6, whiteSpace: 'nowrap' }}>{name}</span>
        </Html>
      )}
    </group>
  );
}

/** Grey plastic bin under the belt's end, for the boxes that ride off. */
function RejectBin() {
  const { x, y, sx, sy, h } = BIN;
  const t = 4;
  return (
    <group>
      <RBox at={[x, y, 3]} size={[sx, sy, 6]} radius={2}>
        <Paint color="#59636f" rough={0.6} />
      </RBox>
      {(
        [
          [0, sy / 2 - t / 2, sx, t],
          [0, -sy / 2 + t / 2, sx, t],
          [sx / 2 - t / 2, 0, t, sy],
          [-sx / 2 + t / 2, 0, t, sy],
        ] as const
      ).map(([dx, dy, a, b], i) => (
        <RBox key={i} at={[x + dx, y + dy, h / 2]} size={[a, b, h]} radius={1.6}>
          <Paint color="#6b7683" rough={0.55} />
        </RBox>
      ))}
    </group>
  );
}

/* --- overlays ------------------------------------------------------------------ */

const tag = (color: string, bg = 'rgba(255,255,255,.92)') => ({
  font: '800 12px var(--font-ui, system-ui)',
  color,
  background: bg,
  padding: '2px 7px',
  borderRadius: 7,
  whiteSpace: 'nowrap' as const,
  boxShadow: '0 1px 4px rgba(0,0,0,.25)',
});

function Overlays({ overlay }: { overlay: CellOverlay }) {
  const { miss, markers, reach, path, ghostPath } = overlay;
  const arc = useMemo(() => {
    if (!reach) return null;
    const pts: Vector3[] = [];
    for (let a = -40; a <= 72; a += 2) pts.push(v3([reach.r * Math.cos((a * Math.PI) / 180), reach.r * Math.sin((a * Math.PI) / 180), reach.z]));
    return pts;
  }, [reach]);
  return (
    <group>
      {arc && (
        <>
          <Line points={arc} color={LEARN_COLORS.accent} lineWidth={2} dashed dashSize={0.008} gapSize={0.005} transparent depthTest={false} renderOrder={6} />
          <Html zIndexRange={[11, 0]} center position={arc[arc.length - 6].toArray()} style={{ pointerEvents: 'none' }}>
            <span style={tag('#3454d1')}>손이 닿는 끝 · 높이 {reach!.z.toFixed(0)} mm</span>
          </Html>
        </>
      )}
      {ghostPath && ghostPath.length > 1 && (
        <Line points={ghostPath.map(v3)} color="#9fb0c8" lineWidth={1.5} dashed dashSize={0.006} gapSize={0.005} transparent opacity={0.8} depthTest={false} renderOrder={6} />
      )}
      {path && path.length > 1 && <Line points={path.map(v3)} color={LEARN_COLORS.path} lineWidth={2} transparent depthTest={false} renderOrder={7} />}
      {miss && (
        <>
          <Line points={[v3(miss.from), v3(miss.to)]} color={miss.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad} lineWidth={2.5} depthTest={false} renderOrder={8} />
          <mesh position={v3(miss.to)} renderOrder={8}>
            <sphereGeometry args={[m(3.5), 16, 12]} />
            <meshBasicMaterial color={miss.ok ? LEARN_COLORS.ok : '#ffffff'} depthTest={false} toneMapped={false} />
          </mesh>
          <Html
            zIndexRange={[12, 0]}
            center
            position={v3([(miss.from[0] + miss.to[0]) / 2, (miss.from[1] + miss.to[1]) / 2, Math.max(miss.from[2], miss.to[2]) + 26]).toArray()}
            style={{ pointerEvents: 'none' }}
          >
            <span style={tag('#fff', miss.ok ? '#1f9d55' : '#e5484d')}>{miss.text}</span>
          </Html>
        </>
      )}
      {markers?.map((k) => (
        <group key={k.key} position={v3(k.mm)}>
          <mesh renderOrder={8}>
            <sphereGeometry args={[m(5), 20, 14]} />
            <meshBasicMaterial color={k.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad} transparent opacity={0.9} depthTest={false} toneMapped={false} />
          </mesh>
          <mesh rotation={[0, 0, 0]} renderOrder={8}>
            <ringGeometry args={[m(9), m(11), 32]} />
            <meshBasicMaterial color={k.ok ? LEARN_COLORS.ok : LEARN_COLORS.bad} transparent opacity={0.8} side={DoubleSide} depthTest={false} toneMapped={false} />
          </mesh>
          {k.text && (
            <Html zIndexRange={[12, 0]} center position={[0, 0, m(28)]} style={{ pointerEvents: 'none' }}>
              <span style={tag(k.ok ? '#1f7a45' : '#fff', k.ok ? 'rgba(255,255,255,.92)' : '#e5484d')}>{k.text}</span>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}
