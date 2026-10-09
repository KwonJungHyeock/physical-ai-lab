'use client';

/**
 * Developer contact sheet (/spike/world?sheet=city): every model of one pack in a row-by-row grid,
 * named, with a 2-unit grid under them (a road tile) and a red arrow along +z, to read each model's
 * size and which way it faces.
 */

import { Html, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';

import { PackPlaces, usePackModels } from './Instanced';
import type { PackId, Place } from './worldAssets';

function Sheet({ pack }: { pack: PackId }) {
  const models = usePackModels(pack);
  const cols = Math.ceil(Math.sqrt(models.length));
  const gap = pack === 'commercial' || pack === 'industry' ? 5 : 4;
  const places = useMemo<Place[]>(
    () =>
      models.map((m, i) => ({
        pack,
        model: m,
        x: (i % cols) * gap,
        z: Math.floor(i / cols) * gap,
      })),
    [models, cols, gap, pack],
  );
  return (
    <>
      <PackPlaces pack={pack} places={places} />
      {places.map((p) => (
        <Html
          key={p.model}
          position={[p.x, -0.05, p.z + gap * 0.42]}
          center
          style={{
            font: '11px sans-serif',
            color: '#111',
            background: '#fffc',
            padding: '1px 4px',
            whiteSpace: 'nowrap',
          }}
        >
          {p.model}
        </Html>
      ))}
      <gridHelper args={[cols * gap + gap, (cols * gap + gap) / 2, '#888', '#bbb']} position={[((cols - 1) * gap) / 2, 0.001, ((cols - 1) * gap) / 2]} />
      <arrowHelper args={[undefined, undefined, 3, '#e33']} position={[-3, 0.1, 0]} />
    </>
  );
}

export default function WorldSheet({ pack }: { pack: PackId }) {
  return (
    <Canvas
      shadows
      camera={{ position: [30, 40, 50], fov: 35 }}
      gl={{ preserveDrawingBuffer: true }}
      style={{ width: '100vw', height: '100vh', background: '#dfe6ee' }}
    >
      <hemisphereLight args={['#ffffff', '#8a8f99', 1.4]} />
      <directionalLight
        position={[-20, 40, 25]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <Suspense fallback={null}>
        <Sheet pack={pack} />
      </Suspense>
      <OrbitControls target={[12, 0, 12]} makeDefault />
    </Canvas>
  );
}
