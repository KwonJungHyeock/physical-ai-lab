'use client';

/**
 * The world map prototype (/spike/world): the island, the sea and sky, the nine districts from
 * worldLayout.ts, a pin over each. ?cam=x,y,z&at=x,y,z sets the view (screenshots).
 */

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useMemo, useState, useEffect } from 'react';

import { PackPlaces } from './Instanced';
import { Island, Sea, Sky } from './Terrain';
import Features from './Features';
import { DISTRICTS, world } from './worldLayout';
import { PACKS, type Place } from './worldAssets';

function Pins() {
  return (
    <>
      {DISTRICTS.map((d) => (
        <Html key={d.id} position={[d.at[0], d.pinY, d.at[1]]} center zIndexRange={[10, 0]}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px 5px 6px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.94)',
              boxShadow: '0 4px 14px rgba(20,30,50,0.22)',
              font: '600 13px Pretendard, sans-serif',
              color: '#1b2230',
              whiteSpace: 'nowrap',
              transform: 'translateY(-50%)',
            }}
          >
            <span
              style={{
                minWidth: 34,
                height: 22,
                padding: '0 7px',
                borderRadius: 999,
                background: d.color,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                font: '700 11px Pretendard, sans-serif',
              }}
            >
              {d.id === 'academy' ? '이론' : d.id === 'data' ? '데이터' : '테마'}
            </span>
            <span>
              {d.name}
              <small
                style={{
                  display: 'block',
                  font: '500 10.5px Pretendard, sans-serif',
                  color: '#5d6878',
                }}
              >
                {d.field}
              </small>
            </span>
          </div>
        </Html>
      ))}
    </>
  );
}

function parseVec(s: string | null, d: [number, number, number]): [number, number, number] {
  const v = s?.split(',').map(Number);
  return v && v.length === 3 && v.every(Number.isFinite) ? (v as [number, number, number]) : d;
}

export default function WorldPreview() {
  const { places, features } = useMemo(() => {
    const w = world();
    // Turbines stand on the hills: lift each to the hill's surface under it.
    const ground = (x: number, z: number) =>
      Math.max(0, ...w.features.hills.map((h) => h.h * Math.sqrt(Math.max(0, 1 - ((x - h.x) / h.rx) ** 2 - ((z - h.z) / h.rz) ** 2))));
    const turbines: Place[] = w.features.turbines.map((t) => ({
      pack: 'space',
      model: 'windturbine_tall',
      x: t.x,
      z: t.z,
      y: ground(t.x, t.z) - 0.1,
      rot: t.rot,
      s: t.s,
    }));
    return { places: [...w.places, ...turbines], features: w.features };
  }, []);
  const [view, setView] = useState<{
    cam: [number, number, number];
    at: [number, number, number];
    pins: boolean;
    fx: string;
  } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address after hydration
    setView({
      cam: parseVec(q.get('cam'), [44, 48, 52]),
      at: parseVec(q.get('at'), [0, 0, 2]),
      pins: q.get('pins') !== '0',
      fx: q.get('fx') ?? 'all',
    });
  }, []);
  if (!view) return null;
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: view.cam, fov: 30, near: 1, far: 600 }}
      gl={{ antialias: false, preserveDrawingBuffer: true }}
      style={{ width: '100vw', height: '100vh' }}
    >
      <Sky />
      <fog attach="fog" args={['#cfe3f2', 120, 260]} />
      <hemisphereLight args={['#dff0ff', '#9a8a6a', 1.15]} />
      <directionalLight
        position={[-40, 70, 30]}
        intensity={2.6}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={10}
        shadow-camera-far={200}
        shadow-bias={-0.0003}
        shadow-normalBias={0.04}
      />
      <Suspense fallback={null}>
        <Island />
        <Sea />
        <Features f={features} />
        {PACKS.map((p) => (
          <PackPlaces key={p} pack={p} places={places} />
        ))}
        {view.pins && <Pins />}
      </Suspense>
      <OrbitControls target={view.at} makeDefault maxPolarAngle={1.35} />
      {view.fx !== 'none' && (
        <EffectComposer multisampling={0}>
          {view.fx === 'all' ? <N8AO aoRadius={1.2} intensity={2.0} distanceFalloff={0.6} quality="medium" halfRes /> : <></>}
          <Bloom luminanceThreshold={0.92} intensity={0.35} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.32} darkness={0.42} />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  );
}
