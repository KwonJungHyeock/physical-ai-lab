'use client';

/**
 * What moves in the 산업단지 besides the sites' robots (layout units, z up, as in ParkScene): delivery
 * trucks and vans running up and down the roads between the sites, people walking on the verges,
 * smoke from the warehouse chimney, and on the open sites a little of their work — cartons and
 * tomatoes riding the belts, steam over the café's cups. All on the ambient clock, so it stops when
 * the viewer turns motion off (the same switch as in the site labs).
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group, MeshStandardMaterial } from 'three';

import type { SiteId } from '@/engine/education/park';

import { loopPath, useAmbientClock } from '../lab/ambient/ambient';
import { DECK, ROADS, SITE_AT } from './parkLayout';

type P2 = readonly [number, number];

/** A racetrack along one road: out on the right-hand lane, round at the end, back on the other. */
function racetrack(a: P2, b: P2, lane: number, shorten: number): P2[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  // Right of the direction of travel (z up): (uy, -ux).
  const rx = uy;
  const ry = -ux;
  const s0: P2 = [a[0] + ux * shorten, a[1] + uy * shorten];
  const s1: P2 = [b[0] - ux * shorten, b[1] - uy * shorten];
  const pts: P2[] = [];
  const arc = (c: P2, from: number) => {
    for (let k = 1; k < 12; k += 1) {
      const t = from + (Math.PI * k) / 12;
      // Round the end: from one lane to the other through the road's ahead/behind direction.
      pts.push([c[0] + lane * (Math.cos(t) * rx + Math.sin(t) * ux), c[1] + lane * (Math.cos(t) * ry + Math.sin(t) * uy)]);
    }
  };
  pts.push([s0[0] + rx * lane, s0[1] + ry * lane], [s1[0] + rx * lane, s1[1] + ry * lane]);
  arc(s1, 0);
  pts.push([s1[0] - rx * lane, s1[1] - ry * lane], [s0[0] - rx * lane, s0[1] - ry * lane]);
  arc(s0, Math.PI);
  return pts;
}

const mats = new Map<string, MeshStandardMaterial>();
function mat(color: string, roughness = 0.5) {
  const k = `${color}/${roughness}`;
  let m = mats.get(k);
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness });
    mats.set(k, m);
  }
  return m;
}

/** A box-shaped part of a vehicle or a person. */
function Part({ size, at, color, rough }: { size: readonly [number, number, number]; at: readonly [number, number, number]; color: string; rough?: number }) {
  return (
    <mesh position={at as [number, number, number]} material={mat(color, rough)} castShadow>
      <boxGeometry args={size as [number, number, number]} />
    </mesh>
  );
}

/** A small delivery truck (cab and box) or a van, facing +x, wheels on z = 0. */
function Vehicle({ kind, color }: { kind: 'truck' | 'van'; color: string }) {
  const wheels: [number, number][] = kind === 'truck' ? [[-0.38, 0.22], [-0.38, -0.22], [0.34, 0.22], [0.34, -0.22]] : [[-0.26, 0.2], [-0.26, -0.2], [0.26, 0.2], [0.26, -0.2]];
  return (
    <group>
      {kind === 'truck' ? (
        <>
          <Part size={[0.72, 0.46, 0.5]} at={[-0.16, 0, 0.36]} color="#f2f4f7" />
          <Part size={[0.3, 0.44, 0.4]} at={[0.38, 0, 0.3]} color={color} />
          <Part size={[0.02, 0.36, 0.16]} at={[0.535, 0, 0.4]} color="#2a3442" rough={0.2} />
          <Part size={[0.74, 0.02, 0.12]} at={[-0.16, 0.235, 0.42]} color={color} />
          <Part size={[0.74, 0.02, 0.12]} at={[-0.16, -0.235, 0.42]} color={color} />
        </>
      ) : (
        <>
          <Part size={[0.74, 0.4, 0.34]} at={[0, 0, 0.27]} color={color} />
          <Part size={[0.3, 0.38, 0.14]} at={[0.12, 0, 0.5]} color={color} />
          <Part size={[0.02, 0.34, 0.12]} at={[0.275, 0, 0.5]} color="#2a3442" rough={0.2} />
        </>
      )}
      {wheels.map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.09]} rotation={[Math.PI / 2, 0, 0]} material={mat('#1f2328', 0.8)}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 14]} />
        </mesh>
      ))}
    </group>
  );
}

/** A vehicle going round its road's racetrack. */
function Driver({ path, speed, phase, kind, color }: { path: P2[]; speed: number; phase: number; kind: 'truck' | 'van'; color: string }) {
  const loop = useMemo(() => loopPath(path), [path]);
  const g = useRef<Group>(null);
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null || !g.current) return;
    const p = loop.at(t * speed);
    const q = loop.at(t * speed + 0.15);
    g.current.position.set(p.x, p.y, -0.1);
    g.current.rotation.z = Math.atan2(q.y - p.y, q.x - p.x);
  });
  return (
    <group ref={g}>
      <group scale={1.3}>
        <Vehicle kind={kind} color={color} />
      </group>
    </group>
  );
}

/** A person (about 0.75 tall) walking to and fro on a verge, legs and arms swinging. */
function Walker({ a, b, speed, phase, shirt, hat }: { a: P2; b: P2; speed: number; phase: number; shirt: string; hat?: string }) {
  const g = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);
  const arms = useRef<(Group | null)[]>([]);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const clock = useAmbientClock(phase);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null || !g.current) return;
    // There and back with a short pause at each end.
    const leg = len / speed;
    const cyc = t % (2 * leg + 3);
    let k: number;
    let dir: number;
    let walking = true;
    if (cyc < leg) [k, dir] = [cyc / leg, 0];
    else if (cyc < leg + 1.5) [k, dir, walking] = [1, Math.PI, false];
    else if (cyc < 2 * leg + 1.5) [k, dir] = [1 - (cyc - leg - 1.5) / leg, Math.PI];
    else [k, dir, walking] = [0, 0, false];
    g.current.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, -0.1 + (walking ? Math.abs(Math.sin(t * 9)) * 0.015 : 0));
    g.current.rotation.z = yaw + dir;
    const swing = walking ? Math.sin(t * 9) * 0.55 : 0;
    legs.current.forEach((l, i) => {
      if (l) l.rotation.y = i ? swing : -swing;
    });
    arms.current.forEach((l, i) => {
      if (l) l.rotation.y = i ? -swing * 0.8 : swing * 0.8;
    });
  });
  return (
    <group ref={g}>
      {[-1, 1].map((s, i) => (
        <group
          key={s}
          position={[0, s * 0.055, 0.36]}
          ref={(el) => {
            legs.current[i] = el;
          }}
        >
          <Part size={[0.08, 0.08, 0.34]} at={[0, 0, -0.17]} color="#2f3a4a" />
        </group>
      ))}
      <Part size={[0.14, 0.22, 0.26]} at={[0, 0, 0.5]} color={shirt} />
      {[-1, 1].map((s, i) => (
        <group
          key={s}
          position={[0, s * 0.14, 0.6]}
          ref={(el) => {
            arms.current[i] = el;
          }}
        >
          <Part size={[0.06, 0.06, 0.24]} at={[0, 0, -0.12]} color={shirt} />
        </group>
      ))}
      <mesh position={[0, 0, 0.71]} material={mat('#e7c3a1', 0.7)} castShadow>
        <sphereGeometry args={[0.075, 14, 10]} />
      </mesh>
      {hat && (
        <mesh position={[0, 0, 0.76]} material={mat(hat, 0.4)}>
          <sphereGeometry args={[0.082, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      )}
    </group>
  );
}

/** Puffs of smoke or steam rising from `at` (layout units), growing and fading. */
function Puffs({ at, n = 6, rise = 1.6, r = 0.14, rate = 0.25, color = '#f5f7fa' }: { at: readonly [number, number, number]; n?: number; rise?: number; r?: number; rate?: number; color?: string }) {
  const set = useMemo(() => {
    const list = Array.from({ length: n }, () => new MeshStandardMaterial({ color, transparent: true, opacity: 0, depthWrite: false, roughness: 1 }));
    return {
      list,
      fade(i: number, o: number) {
        list[i].opacity = o;
      },
    };
  }, [n, color]);
  useEffect(() => () => set.list.forEach((x) => x.dispose()), [set]);
  const refs = useRef<(Group | null)[]>([]);
  const clock = useAmbientClock();
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null) return;
    refs.current.forEach((o, i) => {
      if (!o) return;
      const k = (((t * rate + i / n) % 1) + 1) % 1;
      o.position.set(at[0] + k * rise * 0.35, at[1] + Math.sin(t + i) * 0.05, at[2] + k * rise);
      o.scale.setScalar(0.6 + k * 1.8);
      set.fade(i, 0.55 * Math.sin(Math.PI * k));
    });
  });
  return (
    <group>
      {set.list.map((m, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <mesh material={m}>
            <icosahedronGeometry args={[r, 1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const TRAFFIC: { kind: 'truck' | 'van'; color: string; speed: number }[] = [
  { kind: 'truck', color: '#2f5be7', speed: 0.55 },
  { kind: 'van', color: '#f2f4f7', speed: 0.7 },
  { kind: 'truck', color: '#d9622b', speed: 0.5 },
  { kind: 'van', color: '#12935f', speed: 0.65 },
  { kind: 'truck', color: '#7a3fd1', speed: 0.6 },
  { kind: 'van', color: '#e0a020', speed: 0.7 },
];

const PEOPLE: { shirt: string; hat?: string }[] = [
  { shirt: '#2f5be7', hat: '#f2c230' },
  { shirt: '#e5484d' },
  { shirt: '#12935f', hat: '#ffffff' },
  { shirt: '#f08a24', hat: '#f2c230' },
  { shirt: '#7a3fd1' },
  { shirt: '#344054' },
];

/** The park's traffic and people, on the roads between the sites (absolute layout positions). */
export function ParkTraffic() {
  const roads = useMemo(
    () =>
      ROADS.map(([a, b]) => {
        const pa = SITE_AT[a];
        const pb = SITE_AT[b];
        const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
        const u: P2 = [(pb[0] - pa[0]) / len, (pb[1] - pa[1]) / len];
        const side: P2 = [u[1], -u[0]];
        const e = DECK / 2 + 0.55;
        return { track: racetrack(pa, pb, 0.36, e), verge: [[pa[0] + u[0] * e + side[0] * 0.98, pa[1] + u[1] * e + side[1] * 0.98] as P2, [pb[0] - u[0] * e + side[0] * 0.98, pb[1] - u[1] * e + side[1] * 0.98] as P2] as const };
      }),
    [],
  );
  return (
    <group>
      {roads.map((r, i) => (
        <Driver key={`v${i}`} path={r.track} speed={TRAFFIC[i % TRAFFIC.length].speed} phase={i * 2.3} kind={TRAFFIC[i % TRAFFIC.length].kind} color={TRAFFIC[i % TRAFFIC.length].color} />
      ))}
      {roads.map((r, i) => (
        <Walker key={`w${i}`} a={r.verge[0]} b={r.verge[1]} speed={0.32 + (i % 3) * 0.05} phase={i * 1.7} shirt={PEOPLE[i % PEOPLE.length].shirt} hat={PEOPLE[i % PEOPLE.length].hat} />
      ))}
      {/* The warehouse in the corner: a chimney with smoke. */}
      <mesh position={[19.4, 19.5, 2.7]} rotation={[Math.PI / 2, 0, 0]} material={mat('#9aa6ba', 0.6)} castShadow>
        <cylinderGeometry args={[0.18, 0.22, 1.3, 16]} />
      </mesh>
      <Puffs at={[19.4, 19.5, 3.4]} />
    </group>
  );
}

/** A little of a site's work, in its deck's frame (inside the site's lifting group). */
export function SiteLife({ id }: { id: SiteId }) {
  const refs = useRef<(Group | null)[]>([]);
  const flow = FLOW[id];
  const clock = useAmbientClock(id.length);
  useFrame((_, dt) => {
    const t = clock.tick(dt);
    if (t === null || !flow) return;
    refs.current.forEach((o, i) => {
      if (!o) return;
      const k = (((t * flow.speed) / flow.len + i / flow.n) % 1 + 1) % 1;
      o.position.set(flow.a[0] + (flow.b[0] - flow.a[0]) * k, flow.a[1] + (flow.b[1] - flow.a[1]) * k, flow.z);
      o.visible = k > 0.03 && k < 0.97;
    });
  });
  return (
    <group>
      {flow &&
        Array.from({ length: flow.n }, (_, i) => (
          <group
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
          >
            {flow.item === 'box' ? (
              <Part size={[0.26, 0.26, 0.22]} at={[0, 0, 0.11]} color={i % 2 ? '#c8925a' : '#b9824d'} rough={0.8} />
            ) : (
              <mesh position={[0, 0, 0.11]} material={mat('#d8331f', 0.35)} castShadow>
                <sphereGeometry args={[0.11, 14, 10]} />
              </mesh>
            )}
          </group>
        ))}
      {id === 'cafe' && [0, 1, 2].map((i) => <Puffs key={i} at={[-1 + i * 0.5, -0.6, 1.2]} n={4} rise={0.7} r={0.06} rate={0.35} />)}
    </group>
  );
}

/** Belts that carry something on each site: from a to b (deck units), at height z. */
const FLOW: Partial<Record<SiteId, { a: P2; b: P2; z: number; n: number; speed: number; len: number; item: 'box' | 'ball' }>> = {
  factory: { a: [-2.0, -1.2], b: [1.9, -1.2], z: 0.38, n: 4, speed: 0.45, len: 3.9, item: 'box' },
  logistics: { a: [0.0, 1.4], b: [2.0, 1.4], z: 0.34, n: 3, speed: 0.35, len: 2.0, item: 'box' },
  farm: { a: [0.6, -2.2], b: [0.6, -0.4], z: 0.34, n: 3, speed: 0.3, len: 1.8, item: 'ball' },
};
