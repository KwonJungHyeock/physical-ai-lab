'use client';

/**
 * The 산업단지 in 3D: one slab with seven sites on it, joined by roads in route order. Each site is a
 * cut-away room (deck, two low back walls in a pale tint of its colour, a coloured band) dressed with
 * Kenney Factory Kit parts and our own robots; a locked site turns grey. Seen from a fixed isometric
 * angle with an orthographic camera that fits the park, and glides to a site when one is picked.
 *
 * Built z up (the layout's units, parkLayout.ts) inside one group turned to three's y up.
 */

import { Html, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Color, Group, Mesh, MeshStandardMaterial, NeutralToneMapping, Object3D, OrthographicCamera, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { SITES, type SiteId, type SiteState } from '@/engine/education/park';
import type { ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';

import { buildArm, type GlbNodes } from '../../simulator/stage/robotModel';
import StudioLight from '../../simulator/stage/StudioLight';
import { DECK, KIT_NAMES, PARK_PROPS, ROADS, SITE_AT, SITE_PROPS, SLAB, kitUrl, type Prop, type Xyz } from './parkLayout';
import css from './park.module.css';

const DRACO = '/draco/';
const ARM_URL = '/robot/rdkx5/rdkx5.glb';
const AGV_URL = '/robot/myagv/myagv2023.glb';
const AIKIT_URL = '/robot/rdkx5/aikit.glb';
const GREY = '#b3bbc7';
const SKY = '#e6ebf2';
/** The sun aims at the middle of the park (three coordinates), from the front right, high. */
const SUN_TARGET = new Object3D();
SUN_TARGET.position.set(9, 0, -9);
/** Camera direction from the target (three, y up): the iso view from the front right. */
const VIEW_DIR = new Vector3(1, 1.1, 1).normalize();
/** Room walls: height and thickness. */
const WALL_H = 1.3;
const WALL_T = 0.16;

/** Layout (z up) → three (y up). */
const toThree = (x: number, y: number, z: number) => new Vector3(x, z, -y);

const matCache = new Map<string, MeshStandardMaterial>();
function material(color: string, roughness = 0.6) {
  const key = `${color}/${roughness}`;
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness });
    matCache.set(key, m);
  }
  return m;
}
const tint = (hex: string, k: number) => '#' + new Color(hex).lerp(new Color('#ffffff'), k).getHexString();

function shadowAll(o: Object3D) {
  o.traverse((c) => {
    if ((c as Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

function RBox({ size, at, color, radius = 0.06, rough = 0.6 }: { size: Xyz; at: Xyz; color: string; radius?: number; rough?: number }) {
  const geo = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, Math.min(...size) / 2.01)), [size, radius]);
  return <mesh geometry={geo} material={material(color, rough)} position={at as unknown as [number, number, number]} castShadow receiveShadow />;
}

function KitProp({ name, at, rot = 0, s = 1 }: { name: string; at: Xyz; rot?: number; s?: number }) {
  const { scene } = useGLTF(kitUrl(name));
  const obj = useMemo(() => {
    const o = scene.clone(true);
    shadowAll(o);
    return o;
  }, [scene]);
  return (
    <group position={at as unknown as [number, number, number]} rotation={[0, 0, (rot * Math.PI) / 180]} scale={s}>
      {/* Kenney models are y up. */}
      <primitive object={obj} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

function ArmProp({ robot, chain, angles, at, rot, s, sway, phase }: { robot: UrdfRobot; chain: readonly ChainSegment[]; angles: readonly number[]; at: Xyz; rot: number; s: number; sway: boolean; phase: number }) {
  const { nodes } = useGLTF(ARM_URL, DRACO) as unknown as { nodes: GlbNodes };
  const arm = useMemo(() => {
    const a = buildArm(robot, chain, nodes);
    shadowAll(a.root);
    a.setAngles(angles);
    return a;
  }, [robot, chain, nodes, angles]);
  const q = useRef(angles.slice());
  useFrame(({ clock }) => {
    if (!sway) return;
    const t = clock.elapsedTime * 0.55 + phase;
    q.current[0] = angles[0] + 14 * Math.sin(t);
    q.current[1] = angles[1] + 6 * Math.sin(t * 1.3 + 1);
    q.current[2] = angles[2] + 8 * Math.sin(t * 0.9 + 2);
    arm.setAngles(q.current);
  });
  return (
    <group position={at as unknown as [number, number, number]} rotation={[0, 0, (rot * Math.PI) / 180]} scale={s}>
      <primitive object={arm.root} />
    </group>
  );
}

const DARK = '#2a3039';
const WHITE = '#f2f4f7';
const BINS: Record<string, string> = { bin_A: '#d23c3c', bin_B: '#2f5be7', bin_C: '#12935f', bin_D: '#e0a020' };

/** myAGV (z up as authored): dark base, white body. */
function AgvProp({ at, rot, s }: { at: Xyz; rot: number; s: number }) {
  const { scene } = useGLTF(AGV_URL, DRACO);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      let base = false;
      for (let p: Object3D | null = c; p; p = p.parent) if (p.name.startsWith('base')) base = true;
      m.material = material(base ? DARK : WHITE, 0.4);
      m.castShadow = m.receiveShadow = true;
    });
    return o;
  }, [scene]);
  return (
    <group position={at as unknown as [number, number, number]} rotation={[0, 0, (rot * Math.PI) / 180]} scale={s}>
      <primitive object={obj} />
    </group>
  );
}

/** The AI kit (robot frame, z up): coloured bins, the rest dark. */
function AiKitProp({ at, rot, s }: { at: Xyz; rot: number; s: number }) {
  const { scene } = useGLTF(AIKIT_URL, DRACO);
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const m = c as Mesh;
      if (!m.isMesh) return;
      let bin: string | undefined;
      for (let p: Object3D | null = c; p && !bin; p = p.parent) bin = BINS[p.name.split('.')[0]];
      m.material = material(bin ?? DARK, 0.5);
      m.castShadow = m.receiveShadow = true;
    });
    return o;
  }, [scene]);
  return (
    <group position={at as unknown as [number, number, number]} rotation={[0, 0, (rot * Math.PI) / 180]} scale={s}>
      <primitive object={obj} />
    </group>
  );
}

function PropView({ p, robot, chain, live, phase }: { p: Prop; robot: UrdfRobot; chain: readonly ChainSegment[]; live: boolean; phase: number }) {
  switch (p.kind) {
    case 'kit':
      return <KitProp name={p.name} at={p.at} rot={p.rot} s={p.s} />;
    case 'box':
      return <RBox size={p.size} at={p.at} color={p.color} radius={0.05} />;
    case 'cyl':
      return (
        <mesh position={p.at as unknown as [number, number, number]} rotation={[Math.PI / 2, 0, 0]} material={material(p.color, 0.4)} castShadow receiveShadow>
          <cylinderGeometry args={[p.r, p.r, p.h, 24]} />
        </mesh>
      );
    case 'ball':
      return (
        <mesh position={p.at as unknown as [number, number, number]} material={material(p.color, 0.8)} castShadow>
          <icosahedronGeometry args={[p.r, 2]} />
        </mesh>
      );
    case 'arm':
      return <ArmProp robot={robot} chain={chain} angles={p.angles} at={p.at} rot={p.rot} s={p.s} sway={live && !!p.sway} phase={phase} />;
    case 'agv':
      return <AgvProp at={p.at} rot={p.rot} s={p.s} />;
    case 'aikit':
      return <AiKitProp at={p.at} rot={p.rot} s={p.s} />;
  }
}

export interface SiteView {
  state: SiteState;
  /** The site to go to next (a soft pulse around it). */
  next: boolean;
  /** 1 · 2 · … in route order. */
  no: number;
  /** The label's second line. */
  line: string;
}

interface SiteProps {
  id: SiteId;
  view: SiteView;
  selected: boolean;
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  onSelect(id: SiteId): void;
}

const LOCK_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" />
  </svg>
);

const SiteModel = memo(function SiteModel({ id, view, selected, robot, chain, onSelect }: SiteProps) {
  const site = SITES.find((s) => s.id === id)!;
  const [cx, cy] = SITE_AT[id];
  const locked = view.state === 'locked';
  const col = locked ? GREY : site.color;
  const e = DECK / 2;
  const lift = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const [hover, setHover] = useState(false);
  useFrame(({ clock }, dt) => {
    const g = lift.current;
    if (g) g.position.z += ((hover || selected ? 0.18 : 0) - g.position.z) * (1 - Math.exp(-dt * 10));
    const r = ring.current;
    if (r) (r.material as MeshStandardMaterial).opacity = view.next && !selected ? 0.16 + 0.14 * Math.sin(clock.elapsedTime * 3) : selected ? 0.3 : 0;
  });
  const over = (ev: ThreeEvent<PointerEvent>) => {
    ev.stopPropagation();
    setHover(true);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    setHover(false);
    document.body.style.cursor = '';
  };
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  const ringMat = useMemo(() => new MeshStandardMaterial({ color: site.color, transparent: true, opacity: 0, roughness: 1, depthWrite: false }), [site.color]);
  return (
    <group position={[cx, cy, 0]}>
      {/* A glow on the yard around the site: the next site pulses, the picked one stays lit. */}
      <mesh ref={ring} position={[0, 0, -0.085]} material={ringMat}>
        <planeGeometry args={[DECK + 1.0, DECK + 1.0]} />
      </mesh>
      <group
        ref={lift}
        onPointerOver={over}
        onPointerOut={out}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelect(id);
        }}
      >
        <RBox size={[DECK + 0.4, DECK + 0.4, 0.16]} at={[0, 0, -0.1]} color={col} radius={0.08} />
        <RBox size={[DECK, DECK, 0.12]} at={[0, 0, -0.06]} color="#f7f8fb" radius={0.04} rough={0.85} />
        <RBox size={[WALL_T, DECK, WALL_H]} at={[-e + WALL_T / 2, 0, WALL_H / 2]} color={tint(col, 0.82)} radius={0.03} rough={0.8} />
        <RBox size={[DECK, WALL_T, WALL_H]} at={[0, e - WALL_T / 2, WALL_H / 2]} color={tint(col, 0.82)} radius={0.03} rough={0.8} />
        <RBox size={[0.18, DECK, 0.14]} at={[-e + WALL_T / 2, 0, WALL_H]} color={col} radius={0.04} rough={0.5} />
        <RBox size={[DECK, 0.18, 0.14]} at={[0, e - WALL_T / 2, WALL_H]} color={col} radius={0.04} rough={0.5} />
        {SITE_PROPS[id].map((p, i) => (
          <PropView key={i} p={p} robot={robot} chain={chain} live={!locked} phase={view.no * 1.7 + i} />
        ))}
        <Html position={[0, 0, 3.9]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <button
            type="button"
            className={css.pin}
            data-state={view.state}
            data-next={view.next || undefined}
            data-on={selected || undefined}
            style={{ '--c': site.color } as CSSProperties}
            onClick={() => onSelect(id)}
            aria-label={`${view.no}. ${site.name} — ${view.line}`}
          >
            <i>{view.state === 'done' ? '✓' : view.state === 'locked' ? LOCK_ICON : view.no}</i>
            <span>
              <b>{site.name}</b>
              <small>{view.line}</small>
            </span>
          </button>
        </Html>
      </group>
    </group>
  );
});

function Park() {
  const roads = useMemo(
    () =>
      ROADS.map(([a, b]) => {
        const [x1, y1] = SITE_AT[a];
        const [x2, y2] = SITE_AT[b];
        const h = y1 === y2;
        const len = Math.hypot(x2 - x1, y2 - y1);
        return { key: a + b, mid: [(x1 + x2) / 2, (y1 + y2) / 2] as const, h, len };
      }),
    [],
  );
  return (
    <group>
      <RBox size={[SLAB.size, SLAB.size, 0.5]} at={[SLAB.centre[0], SLAB.centre[1], -0.4]} color="#9aa6ba" radius={0.25} rough={0.7} />
      <RBox size={[SLAB.size - 0.4, SLAB.size - 0.4, 0.06]} at={[SLAB.centre[0], SLAB.centre[1], -0.15]} color="#e4e9f0" radius={0.03} rough={0.9} />
      {roads.map((r) => (
        <group key={r.key} position={[r.mid[0], r.mid[1], -0.115]} rotation={[0, 0, r.h ? 0 : Math.PI / 2]}>
          <mesh material={material('#b9c3d1', 0.9)} receiveShadow>
            <boxGeometry args={[r.len, 1.5, 0.02]} />
          </mesh>
          {Array.from({ length: Math.floor(r.len) }, (_, k) => (
            <mesh key={k} position={[-r.len / 2 + 0.5 + k, 0, 0.012]} material={material('#ffffff', 0.6)}>
              <boxGeometry args={[0.45, 0.08, 0.005]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** The fixed isometric camera: fits the park in the space left of the card, glides to a picked site. */
function CameraRig({ focus, cardPx }: { focus: SiteId | null; cardPx: number }) {
  const size = useThree((s) => s.size);
  const fit = useMemo(() => {
    // The view's right and up directions, from a camera looking along the iso direction.
    const camera = new OrthographicCamera();
    camera.position.copy(VIEW_DIR).multiplyScalar(80);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const pts: Vector3[] = [];
    const [sx, sy] = SLAB.centre;
    const h = SLAB.size / 2;
    for (const x of [sx - h, sx + h]) for (const y of [sy - h, sy + h]) for (const z of [-0.65, 2.2]) pts.push(toThree(x, y, z));
    for (const [x, y] of Object.values(SITE_AT)) pts.push(toThree(x, y, 4.6));
    const xs = pts.map((p) => p.dot(right));
    const ys = pts.map((p) => p.dot(up));
    const mid = right.clone().multiplyScalar((Math.min(...xs) + Math.max(...xs)) / 2).addScaledVector(up, (Math.min(...ys) + Math.max(...ys)) / 2);
    return { right, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), mid };
  }, []);
  const cur = useRef<{ t: Vector3; z: number } | null>(null);
  useFrame(({ camera }, dt) => {
    const W = Math.max(200, size.width - cardPx);
    const base = Math.min((W - 40) / fit.w, (size.height - 40) / fit.h);
    const zoom = focus ? base * 1.7 : base;
    const goal = focus ? toThree(SITE_AT[focus][0], SITE_AT[focus][1], 1) : fit.mid.clone();
    // The card covers the right: aim a little right of the goal so it sits in the middle of what's left.
    goal.addScaledVector(fit.right, cardPx / 2 / zoom);
    if (!cur.current) cur.current = { t: goal.clone(), z: zoom };
    const k = 1 - Math.exp(-dt * 5);
    cur.current.t.lerp(goal, k);
    cur.current.z += (zoom - cur.current.z) * k;
    camera.position.copy(cur.current.t).addScaledVector(VIEW_DIR, 80);
    camera.lookAt(cur.current.t);
    const cam = camera as OrthographicCamera;
    cam.zoom = cur.current.z;
    cam.updateProjectionMatrix();
  });
  return null;
}

/** Mounted once everything in the Suspense above it has loaded. */
function Ready({ onReady }: { onReady(): void }) {
  useEffect(onReady, [onReady]);
  return null;
}

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  /** The models have loaded (the page drops its loading note). */
  onReady(): void;
  views: Record<SiteId, SiteView>;
  selected: SiteId | null;
  onSelect(id: SiteId | null): void;
  paused: boolean;
  cardPx: number;
}

export default function ParkScene({ robot, chain, onReady, views, selected, onSelect, paused, cardPx }: Props) {
  return (
    <Canvas
      orthographic
      shadows="percentage"
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [80, 88, 80], zoom: 30, near: 1, far: 400 }}
      onCreated={({ gl }) => {
        gl.toneMapping = NeutralToneMapping;
      }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[SKY]} />
      <StudioLight intensity={0.35} />
      <hemisphereLight args={['#ffffff', '#c9d2de', 0.9]} />
      <primitive object={SUN_TARGET} />
      <directionalLight
        target={SUN_TARGET}
        position={[9 + 13.5, 28.5, -9 + 18]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <Park />
        <Suspense fallback={null}>
          <group position={[0, 0, -0.1]}>
            {PARK_PROPS.map((p, i) => (
              <PropView key={i} p={p} robot={robot} chain={chain} live={false} phase={0} />
            ))}
          </group>
          {SITES.map((s) => (
            <SiteModel key={s.id} id={s.id} view={views[s.id]} selected={selected === s.id} robot={robot} chain={chain} onSelect={onSelect} />
          ))}
          <Ready onReady={onReady} />
        </Suspense>
      </group>
      <CameraRig focus={selected} cardPx={cardPx} />
    </Canvas>
  );
}

for (const n of KIT_NAMES) useGLTF.preload(kitUrl(n));
