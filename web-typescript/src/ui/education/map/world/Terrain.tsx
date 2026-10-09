'use client';

/**
 * The ground of the world map: the island (a grass top with a soft painted texture, earth and rock
 * sides, a sand beach ring), the sea (deep blue fading to turquoise shallows at the shore) and a sky
 * dome (blue overhead to pale haze at the horizon). All procedural: no downloads.
 */

import { useMemo } from 'react';
import { BackSide, CanvasTexture, Color, ExtrudeGeometry, RepeatWrapping, Shape, ShaderMaterial, SRGBColorSpace } from 'three';

import { ISLAND } from './worldLayout';

/** The island outline, a rounded rectangle with a slightly wavy edge (x, -z in shape space). */
function outline(hx: number, hz: number, r: number, wobble: number, seed: number) {
  const pts: [number, number][] = [];
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (3 * Math.PI) / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= 12; i++) {
      const a = a0 + (i / 12) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  // Densify the straight sides and add a gentle wobble, so the coast is not ruler-straight.
  const dense: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  const shape = new Shape();
  dense.forEach(([x, z], i) => {
    const len = Math.hypot(x, z) || 1;
    const w = wobble * (Math.sin(i * 0.37 + seed) * 0.6 + Math.sin(i * 0.91 + seed * 2) * 0.4);
    const px = x + (x / len) * w;
    const pz = z + (z / len) * w;
    if (i === 0) shape.moveTo(px, pz);
    else shape.lineTo(px, pz);
  });
  shape.closePath();
  return shape;
}

/** A soft painted grass texture: a green base with darker and lighter blotches. */
function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#86c06a';
  g.fillRect(0, 0, 512, 512);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 4 + rnd() * 26;
    const light = rnd() < 0.5;
    g.fillStyle = light ? `rgba(170, 214, 120, ${0.08 + rnd() * 0.12})` : `rgba(70, 130, 60, ${0.06 + rnd() * 0.1})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(1 / 16, 1 / 16);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function Island() {
  const { top, beach, grass } = useMemo(() => {
    const top = new ExtrudeGeometry(outline(ISLAND.hx, ISLAND.hz, ISLAND.r, 0.45, 1), {
      depth: 4,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.5,
      bevelSegments: 3,
      curveSegments: 6,
    });
    const beach = new ExtrudeGeometry(outline(ISLAND.hx + 2.2, ISLAND.hz + 2.2, ISLAND.r + 2, 0.7, 3), {
      depth: 3,
      bevelEnabled: true,
      bevelThickness: 0.4,
      bevelSize: 0.9,
      bevelSegments: 3,
      curveSegments: 6,
    });
    return { top, beach, grass: grassTexture() };
  }, []);
  return (
    <group>
      {/* Extruded along +z in shape space: turn so the shape lies flat and the top face is at y = 0. */}
      <mesh geometry={top} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow castShadow>
        <meshStandardMaterial attach="material-0" map={grass} roughness={0.95} />
        <meshStandardMaterial attach="material-1" color="#9c7650" roughness={1} />
      </mesh>
      <mesh geometry={beach} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.95, 0]} receiveShadow>
        <meshStandardMaterial attach="material-0" color="#ead9a6" roughness={1} />
        <meshStandardMaterial attach="material-1" color="#d9c48e" roughness={1} />
      </mesh>
    </group>
  );
}

const seaMaterial = () =>
  new ShaderMaterial({
    uniforms: {
      deep: { value: new Color('#2f86c4') },
      shallow: { value: new Color('#7fd6d9') },
      foam: { value: new Color('#e9fbf8') },
      size: { value: [ISLAND.hx + 3.2, ISLAND.hz + 3.2] },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vXZ = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 deep; uniform vec3 shallow; uniform vec3 foam; uniform vec2 size;
      varying vec2 vXZ;
      float boxDist(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        float d = boxDist(vXZ, size, 12.0);
        float t = smoothstep(0.0, 26.0, d);
        vec3 c = mix(shallow, deep, t);
        float f = 1.0 - smoothstep(0.0, 1.4, d);
        float ripple = 0.5 + 0.5 * sin(d * 2.4);
        c = mix(c, foam, f * (0.55 + 0.25 * ripple));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

export function Sea() {
  const mat = useMemo(() => seaMaterial(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]} material={mat}>
      <planeGeometry args={[900, 900]} />
    </mesh>
  );
}

export function Sky() {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new Color('#7fb6e6') },
          horizon: { value: new Color('#e9f2f7') },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            gl_FragColor = vec4(mix(horizon, top, pow(h, 0.55)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[500, 32, 16]} />
    </mesh>
  );
}
