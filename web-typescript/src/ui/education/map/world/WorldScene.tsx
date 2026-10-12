'use client';

/**
 * 교육 홈 · 로봇 시티 in 3D: the island with its nine places (worldLayout.ts), the CC0 pack models
 * drawn instanced, the procedural pieces (Features.tsx), and what moves (Life.tsx). Each place's block
 * is a button: hover lights its yard, a click picks it — the camera glides over and the page's card
 * opens on the right (the view is offset so the place sits in the middle of what the card leaves).
 * What a click picks is read from the point it lands on (placeAt), on whatever is drawn there, so a
 * tall tower picks its own place and never the block behind it; the pin picks the same place.
 * The next place to go pulses; a locked one keeps its robots still and shows a lock on its pin.
 * Drag to turn, wheel to zoom; the camera stays over the island.
 *
 * Lit by a warm sun with soft shadows, a sky dome and haze, with ambient occlusion and AgX tone
 * mapping. (No bloom: its mip chain left the whole view black at fractional pixel ratios such as
 * 1.5 — a 150 % Windows display.)
 */

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MeshStandardMaterial, PerspectiveCamera, Vector3, type Mesh } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { SITE_BY_ID, type SiteId, type SiteState } from '@/engine/education/park';

import css from '../park.module.css';
import Features from './Features';
import { PackPlaces } from './Instanced';
import Life from './Life';
import { Island, Sea, Sky } from './Terrain';
import { PACKS } from './worldAssets';
import { DISTRICTS, DISTRICT_BY_ID, SLAB_TOP, world } from './worldLayout';

export interface SiteView {
  state: SiteState;
  /** The place to go to next (a soft pulse round it). */
  next: boolean;
  /** The pin's tag: 이론 · 테마 · 데이터. */
  tag: string;
  /** The label's second line. */
  line: string;
}

/** The overview: where the camera looks from (relative to the island centre) and at. */
const HOME = { at: new Vector3(3, 0, 2), dir: new Vector3(57, 56, 64).normalize(), dist: 104 };
/** How close the camera comes to a picked place. */
const NEAR = 38;

const LOCK_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" />
  </svg>
);

const PASS_THROUGH: CSSProperties = { pointerEvents: 'none' };

/** Half a block's inner side: a block is 16 wide between road centrelines, the road 2. */
const BLOCK_HALF = 7;

/** The place whose block holds the ground point (x, z); null on a street, the beach or the sea. */
export function placeAt(x: number, z: number): SiteId | null {
  return DISTRICTS.find((d) => Math.abs(x - d.at[0]) < BLOCK_HALF && Math.abs(z - d.at[1]) < BLOCK_HALF)?.id ?? null;
}

/** One place: a glow on its yard and its pin. */
const Place = memo(function Place({ id, view, selected, hover, onHover, onSelect }: { id: SiteId; view: SiteView; selected: boolean; hover: boolean; onHover(id: SiteId | null): void; onSelect(id: SiteId): void }) {
  const site = SITE_BY_ID.get(id)!;
  const d = DISTRICT_BY_ID.get(id)!;
  const glow = useMemo(() => new MeshStandardMaterial({ color: site.color, transparent: true, opacity: 0, roughness: 1, depthWrite: false }), [site.color]);
  const ring = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const r = ring.current;
    if (!r) return;
    const m = r.material as MeshStandardMaterial;
    const target = selected ? 0.34 : hover ? 0.26 : view.next ? 0.12 + 0.12 * Math.sin(clock.elapsedTime * 3) : 0;
    m.opacity += (target - m.opacity) * 0.15;
    r.visible = m.opacity > 0.005;
  });
  const farm = id === 'farm';
  return (
    <group position={[d.at[0], 0, d.at[1]]}>
      <mesh ref={ring} material={glow} position={[0, (farm ? 0.08 : SLAB_TOP) + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13.6, 13.6]} />
      </mesh>
      {/* The wrapper lets clicks through to the map; only the pin itself takes them (.pin pointer-events). */}
      <Html position={[0, d.pinY, 0]} center zIndexRange={[10, 0]} style={PASS_THROUGH}>
        <button
          type="button"
          className={css.pin}
          data-state={view.state}
          data-next={view.next || undefined}
          data-on={selected || hover || undefined}
          style={{ '--c': site.color } as CSSProperties}
          onClick={() => onSelect(id)}
          onPointerEnter={() => onHover(id)}
          onPointerLeave={() => onHover(null)}
          aria-label={`${site.name}: ${view.line}`}
        >
          <i>{view.state === 'done' ? '✓' : view.state === 'locked' ? LOCK_ICON : view.tag}</i>
          <span>
            <b>{site.name}</b>
            <small>{view.line}</small>
          </span>
        </button>
      </Html>
    </group>
  );
});

/**
 * The camera: an orbit the user can turn and zoom, kept over the island; a pick glides it to the
 * place, seen from the home direction (and back out to the overview on none). The projection is offset by half the card's width
 * so the middle of the view is the middle of what the card leaves uncovered.
 */
function CameraRig({ focus, cardPx }: { focus: SiteId | null; cardPx: number }) {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const goal = useRef<{ at: Vector3; dist: number } | null>(null);
  useEffect(() => {
    const d = focus ? DISTRICT_BY_ID.get(focus)! : null;
    goal.current = d ? { at: new Vector3(d.at[0], 0.8, d.at[1]), dist: NEAR } : { at: HOME.at.clone(), dist: HOME.dist };
  }, [focus]);
  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  useEffect(() => {
    if (cardPx > 0 && size.width > cardPx) camera.setViewOffset(size.width + cardPx, size.height, cardPx, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size, cardPx]);
  useFrame((state, dt) => {
    const controls = state.controls as unknown as OrbitControlsImpl | null;
    const camera = state.camera;
    if (!controls) return;
    const g = goal.current;
    const t = controls.target;
    if (g) {
      const k = 1 - Math.exp(-dt * 3.2);
      t.lerp(g.at, k);
      const off = camera.position.clone().sub(t);
      const dist = off.length();
      // Every glide also swings to the home direction, so a place always comes into view the same way
      // however it was picked (on the map, its pin, the 키워드 dock or the 로드맵) and wherever the view was.
      off.normalize().lerp(HOME.dir, k).normalize();
      camera.position.copy(t).addScaledVector(off, dist + (g.dist - dist) * k);
      if (t.distanceTo(g.at) < 0.05 && Math.abs(dist - g.dist) < 0.1 && off.angleTo(HOME.dir) < 0.005) goal.current = null;
    }
    // Keep the view over the island.
    t.x = Math.max(-34, Math.min(36, t.x));
    t.z = Math.max(-32, Math.min(34, t.z));
    t.y = Math.max(0, Math.min(3, t.y));
    controls.update();
  });
  return null;
}

function Ready({ onReady }: { onReady(): void }) {
  useEffect(onReady, [onReady]);
  return null;
}

interface Props {
  /** The models have loaded (the page drops its loading note). */
  onReady(): void;
  views: Record<SiteId, SiteView>;
  selected: SiteId | null;
  onSelect(id: SiteId | null): void;
  paused: boolean;
  /** The card's width over the right of the view, px. */
  cardPx: number;
  /** Ambient occlusion, tone mapping, vignette and SMAA (off: a plainer, cheaper picture). */
  effects?: boolean;
}

export default function WorldScene({ onReady, views, selected, onSelect, paused, cardPx, effects = true }: Props) {
  const { places, features } = world();
  const still = useMemo(() => new Set(DISTRICTS.filter((d) => views[d.id].state === 'locked').map((d) => d.id)), [views]);
  const start = HOME.at.clone().addScaledVector(HOME.dir, HOME.dist);
  const [hover, setHover] = useState<SiteId | null>(null);
  useEffect(() => void (document.body.style.cursor = hover ? 'pointer' : ''), [hover]);
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  // Only the canvas itself: a click on a pin (HTML over the canvas) is the pin's own (see onPointerMissed).
  const onCanvas = (ev: ThreeEvent<MouseEvent>) => ev.nativeEvent.target instanceof HTMLCanvasElement;
  const pick = (ev: ThreeEvent<MouseEvent>) => {
    // A drag that turned the view ends in a click too: that is not a pick.
    if (!onCanvas(ev) || ev.delta > 4) return;
    ev.stopPropagation();
    onSelect(placeAt(ev.point.x, ev.point.z));
  };
  const point = (ev: ThreeEvent<PointerEvent>) => {
    if (!onCanvas(ev)) return;
    ev.stopPropagation();
    const id = placeAt(ev.point.x, ev.point.z);
    setHover((h) => (h === id ? h : id));
  };
  return (
    <Canvas
      shadows="soft"
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 1.75]}
      camera={{ position: [start.x, start.y, start.z], fov: 30, near: 1, far: 700 }}
      gl={{ antialias: false, preserveDrawingBuffer: true }}
      // Only a click on the canvas itself: a pin's own React root (drei Html) handles its click first, and
      // R3F then sees the same click with the pin's offsets, hits nothing and would close what the pin opened.
      onPointerMissed={(ev) => ev.target instanceof HTMLCanvasElement && onSelect(null)}
    >
      <Sky />
      <fog attach="fog" args={['#cfe3f2', 140, 300]} />
      <hemisphereLight args={['#dff0ff', '#9a8a6a', 1.15]} />
      <directionalLight
        position={[-40, 70, 30]}
        intensity={2.6}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-58}
        shadow-camera-right={58}
        shadow-camera-top={58}
        shadow-camera-bottom={-58}
        shadow-camera-near={10}
        shadow-camera-far={200}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
      <Suspense fallback={null}>
        {/* What is drawn here is what a click lands on (Life's movers are left out: they cross the streets). */}
        <group onClick={pick} onPointerMove={point} onPointerOut={(ev) => onCanvas(ev) && setHover(null)}>
          <Island />
          <Features f={features} still={still} />
          {PACKS.map((p) => (
            <PackPlaces key={p} pack={p} places={places} />
          ))}
        </group>
        <Sea />
        <Life f={features} still={still} />
        {DISTRICTS.map((d) => (
          <Place key={d.id} id={d.id} view={views[d.id]} selected={selected === d.id} hover={hover === d.id} onHover={setHover} onSelect={onSelect} />
        ))}
        <Ready onReady={onReady} />
      </Suspense>
      <OrbitControls makeDefault target={HOME.at} enableDamping dampingFactor={0.08} minDistance={16} maxDistance={140} maxPolarAngle={1.32} minPolarAngle={0.3} screenSpacePanning={false} />
      <CameraRig focus={selected} cardPx={cardPx} />
      {effects && (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={1.2} intensity={2.0} distanceFalloff={0.6} quality="medium" halfRes />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.32} darkness={0.38} />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  );
}
