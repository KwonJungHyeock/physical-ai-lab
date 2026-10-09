'use client';

/**
 * The world map's own pieces (procedural, not from the packs): block yards and plazas, farm soil
 * with furrows, greenhouses, the academy's eight 학문 pavilions, grassy hills, the data centre's
 * digital-twin hologram, and the myCobot 280 at each district on a pedestal in its colour.
 */

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type Object3D,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { DEFAULT_ARM } from '@/engine/robot/arms';
import { buildChain } from '@/engine/robot/kinematics';
import { parseUrdf, type UrdfRobot } from '@/engine/robot/urdf';

import { buildArm, type GlbNodes } from '../../../simulator/stage/robotModel';
import { DISTRICTS, SLAB_TOP, type Ground, type MapRobot, type WorldFeatures } from './worldLayout';

const DRACO = '/draco/';

const mats = new Map<string, MeshStandardMaterial>();
const mat = (color: string, rough = 0.85, metal = 0) => {
  const k = `${color}/${rough}/${metal}`;
  if (!mats.has(k)) mats.set(k, new MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return mats.get(k)!;
};

/** Furrowed soil: dark rows on brown, tiled along the plot. */
function soilTexture(color: string) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(40, 24, 10, 0.32)';
  for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 6);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function GroundPiece({ g }: { g: Ground }) {
  const geo = useMemo(
    () => (g.kind === 'disc' || g.kind === 'pond' ? new CylinderGeometry(g.w / 2, g.w / 2, 0.04, 48) : new RoundedBoxGeometry(g.w, 0.06, g.d, 2, 0.02)),
    [g],
  );
  const material = useMemo(() => {
    if (g.kind === 'pond')
      return new MeshStandardMaterial({
        color: g.color,
        roughness: 0.12,
        metalness: 0.1,
      });
    if (g.kind !== 'soil') return mat(g.color, 0.95);
    const t = soilTexture(g.color);
    t.repeat.set(1, g.d / 0.85);
    return new MeshStandardMaterial({ map: t, roughness: 1 });
  }, [g]);
  const y = g.kind === 'disc' ? SLAB_TOP + 0.06 : g.kind === 'soil' || g.kind === 'pond' ? 0.03 : SLAB_TOP + 0.01;
  return (
    <mesh
      geometry={geo}
      material={material}
      position={[g.x, y, g.z]}
      rotation={[0, ((g.rot ?? 0) * Math.PI) / 180, 0]}
      scale={g.kind === 'pond' ? [1, 1, g.d / g.w] : 1}
      receiveShadow
    />
  );
}

/** A tunnel greenhouse: white arched ribs, a misty glass skin, plants inside. */
function Greenhouse({ x, z, len, rot }: { x: number; z: number; len: number; rot: number }) {
  const r = 0.95;
  const ribs = Math.round(len / 0.8);
  return (
    <group position={[x, 0.05, z]} rotation={[0, (rot * Math.PI) / 180, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[r, r, len, 24, 1, true, 0, Math.PI]} />
        <meshStandardMaterial color="#e8f5f2" transparent opacity={0.42} roughness={0.15} side={DoubleSide} />
      </mesh>
      {Array.from({ length: ribs + 1 }, (_, i) => (
        <mesh key={i} position={[-len / 2 + (i * len) / ribs, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[r, 0.035, 6, 24, Math.PI]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
      ))}
      {[-0.45, 0, 0.45].map((dz) => (
        <mesh key={dz} position={[0, 0.12, dz]} castShadow>
          <boxGeometry args={[len - 0.4, 0.22, 0.26]} />
          <meshStandardMaterial color={dz === 0 ? '#5fae4a' : '#4c9a3c'} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A 학문 pavilion: a white round kiosk with a cone roof in the 학문's colour. */
function Pavilion({ x, z, y = 0, color }: { x: number; z: number; y?: number; color: string }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow material={mat('#f6f4ef', 0.7)}>
        <cylinderGeometry args={[0.62, 0.68, 0.8, 20]} />
      </mesh>
      <mesh position={[0, 1.04, 0]} castShadow material={mat(color, 0.55)}>
        <coneGeometry args={[0.9, 0.56, 20]} />
      </mesh>
      <mesh position={[0, 0.26, 0.62]} material={mat('#3b4656', 0.4)}>
        <boxGeometry args={[0.3, 0.5, 0.06]} />
      </mesh>
    </group>
  );
}

/** A low grassy hill (a squashed hemisphere). */
function Hill({ x, z, rx, rz, h }: { x: number; z: number; rx: number; rz: number; h: number }) {
  const geo = useMemo(() => new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), []);
  return <mesh geometry={geo} position={[x, -0.05, z]} scale={[rx, h, rz]} material={mat('#7fb862', 1)} receiveShadow castShadow />;
}

/** The digital twin: a turning wire globe and rings of light over the plaza. */
function Hologram({ x, z }: { x: number; z: number }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += dt * 0.35;
  });
  const glow = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#4fe3f0',
        emissive: new Color('#36d6ea'),
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.75,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  return (
    <group position={[x, SLAB_TOP + 0.08, z]}>
      <mesh material={mat('#2a3340', 0.4, 0.3)} position={[0, 0.1, 0]}>
        <cylinderGeometry args={[1.2, 1.35, 0.2, 40]} />
      </mesh>
      <group ref={g} position={[0, 2.0, 0]}>
        <mesh material={glow}>
          <icosahedronGeometry args={[1.05, 2]} />
          <meshStandardMaterial color="#6ff0ff" emissive="#3fdcf0" emissiveIntensity={2.4} wireframe transparent opacity={0.9} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={glow}>
          <torusGeometry args={[1.5, 0.03, 8, 64]} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0.4, 0]} material={glow}>
          <torusGeometry args={[1.75, 0.025, 8, 64]} />
        </mesh>
      </group>
      <mesh position={[0, 1.0, 0]} material={glow}>
        <cylinderGeometry args={[0.05, 0.3, 1.8, 16, 1, true]} />
      </mesh>
    </group>
  );
}

function shadowAll(o: Object3D) {
  o.traverse((c) => {
    if ((c as Mesh).isMesh) c.castShadow = c.receiveShadow = true;
  });
}

/** One myCobot 280 (URDF z up → y up), idling slowly, on a pedestal ringed in its district's colour. */
function MapArm({ robot, nodes, r, phase }: { robot: UrdfRobot; nodes: GlbNodes; r: MapRobot; phase: number }) {
  const arm = useMemo(() => {
    const a = buildArm(robot, buildChain(robot), nodes, {
      dark: DEFAULT_ARM.dark,
      flange: DEFAULT_ARM.flange,
      textures: DEFAULT_ARM.textures,
      flangeLink: DEFAULT_ARM.flangeLink,
    });
    shadowAll(a.root);
    a.setAngles(r.angles);
    return a;
  }, [robot, nodes, r]);
  const q = useRef(r.angles.slice());
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.6 + phase;
    q.current[0] = r.angles[0] + 18 * Math.sin(t);
    q.current[1] = r.angles[1] + 8 * Math.sin(t * 1.3 + 1);
    q.current[2] = r.angles[2] + 10 * Math.sin(t * 0.9 + 2);
    arm.setAngles(q.current);
  });
  const color = DISTRICTS.find((d) => d.id === r.district)?.color ?? '#888';
  const ped = r.pedestal ?? 0.7;
  const h = r.district === 'academy' ? 0.7 : 0.18;
  return (
    <group position={[r.x, r.y ?? 0, r.z]}>
      <mesh position={[0, h / 2, 0]} material={mat('#f4f5f7', 0.6)} castShadow receiveShadow>
        <cylinderGeometry args={[ped, ped * 1.08, h, 40]} />
      </mesh>
      <mesh position={[0, h + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat(color, 0.5)}>
        <ringGeometry args={[ped * 0.82, ped * 0.97, 48]} />
      </mesh>
      <group position={[0, h, 0]} rotation={[-Math.PI / 2, 0, (r.rot * Math.PI) / 180]} scale={r.s}>
        <primitive object={arm.root} />
      </group>
    </group>
  );
}

function Robots({ robots }: { robots: readonly MapRobot[] }) {
  const [robot, setRobot] = useState<UrdfRobot | null>(null);
  useEffect(() => {
    void fetch(DEFAULT_ARM.urdf)
      .then((res) => res.text())
      .then((t) => setRobot(parseUrdf(t)));
  }, []);
  const gltfs = useGLTF(DEFAULT_ARM.glbs as string[], DRACO) as unknown as {
    nodes: GlbNodes;
  }[];
  const nodes = useMemo(() => Object.assign({}, ...gltfs.map((g) => g.nodes)) as GlbNodes, [gltfs]);
  if (!robot) return null;
  return (
    <>
      {robots.map((r, i) => (
        <MapArm key={i} robot={robot} nodes={nodes} r={r} phase={i * 1.7} />
      ))}
    </>
  );
}

/** A thin band in the district's colour just inside the kerb, so each block reads as one place. */
function Outline({ x, z, color }: { x: number; z: number; color: string }) {
  const geo = useMemo(() => {
    const o = 5.05;
    const i = 4.85;
    const sh = new Shape();
    sh.moveTo(-o, -o).lineTo(o, -o).lineTo(o, o).lineTo(-o, o).closePath();
    const hole = new Path();
    hole.moveTo(-i, -i).lineTo(-i, i).lineTo(i, i).lineTo(i, -i).closePath();
    sh.holes.push(hole);
    return new ShapeGeometry(sh);
  }, []);
  return <mesh geometry={geo} position={[x, SLAB_TOP + 0.045, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat(color, 0.5)} />;
}

/** A block's slab: a light pavement raised a kerb's height, its edge rounded. */
function Slab({ x, z }: { x: number; z: number }) {
  const geo = useMemo(() => new RoundedBoxGeometry(13.8, SLAB_TOP + 0.1, 13.8, 2, 0.06), []);
  return <mesh geometry={geo} position={[x, (SLAB_TOP - 0.1) / 2, z]} material={mat('#dedad2', 0.9)} receiveShadow />;
}

/** The harbour: a concrete quay out into the sea, a container crane over it, a cargo ship alongside. */
function Harbour({ x, z }: { x: number; z: number }) {
  const hull = useMemo(() => {
    const sh = new Shape();
    const L = 7.2;
    const W = 1.5;
    sh.moveTo(-W, -L)
      .lineTo(W, -L)
      .lineTo(W, L - 2)
      .quadraticCurveTo(W, L, 0, L + 1.2)
      .quadraticCurveTo(-W, L, -W, L - 2)
      .closePath();
    return new ExtrudeGeometry(sh, {
      depth: 1.5,
      bevelEnabled: true,
      bevelSize: 0.12,
      bevelThickness: 0.12,
      bevelSegments: 2,
    });
  }, []);
  const orange = mat('#e8742e', 0.55);
  const leg = (lx: number, lz: number) => (
    <mesh position={[lx, 2.0, lz]} material={orange} castShadow>
      <boxGeometry args={[0.22, 4.0, 0.22]} />
    </mesh>
  );
  return (
    <group>
      <mesh position={[x + 3.0, -0.55, z]} material={mat('#cfccc4', 0.95)} receiveShadow castShadow>
        <boxGeometry args={[8.0, 1.8, 11.5]} />
      </mesh>
      <mesh position={[x + 6.85, 0.36, z]} material={mat('#e3b23c', 0.6)}>
        <boxGeometry args={[0.12, 0.02, 11.4]} />
      </mesh>
      {[-5, -2.5, 0, 2.5, 5].map((dz) => (
        <mesh key={dz} position={[x + 6.95, 0.42, z + dz]} material={mat('#3a3f47', 0.6)}>
          <cylinderGeometry args={[0.12, 0.12, 0.25, 10]} />
        </mesh>
      ))}
      <group position={[x + 6.0, 0.35, z + 1.0]}>
        {leg(-0.9, -1.4)}
        {leg(0.9, -1.4)}
        {leg(-0.9, 1.4)}
        {leg(0.9, 1.4)}
        <mesh position={[2.6, 4.1, -1.4]} material={orange} castShadow>
          <boxGeometry args={[9.0, 0.3, 0.3]} />
        </mesh>
        <mesh position={[2.6, 4.1, 1.4]} material={orange} castShadow>
          <boxGeometry args={[9.0, 0.3, 0.3]} />
        </mesh>
        <mesh position={[-0.9, 4.6, 0]} material={mat('#f2f2f2', 0.5)} castShadow>
          <boxGeometry args={[1.0, 0.7, 2.6]} />
        </mesh>
        <mesh position={[4.0, 3.4, 0]} material={mat('#555b66', 0.5)}>
          <boxGeometry args={[0.04, 1.4, 0.04]} />
        </mesh>
      </group>
      <group position={[x + 10.3, -0.95, z]}>
        <mesh geometry={hull} rotation={[-Math.PI / 2, 0, 0]} material={mat('#24395c', 0.6)} castShadow receiveShadow />
        <mesh position={[0, 0.55, 0]} material={mat('#b8342c', 0.7)}>
          <boxGeometry args={[3.1, 0.25, 14.2]} />
        </mesh>
        <mesh position={[0, 2.1, 5.6]} material={mat('#f4f4f2', 0.6)} castShadow>
          <boxGeometry args={[2.6, 2.0, 1.6]} />
        </mesh>
        <mesh position={[0, 3.2, 5.6]} material={mat('#2b3442', 0.5)}>
          <boxGeometry args={[2.8, 0.25, 1.8]} />
        </mesh>
      </group>
    </group>
  );
}

export default function Features({ f }: { f: WorldFeatures }) {
  return (
    <>
      {f.slabs.map((b, i) => (
        <Slab key={i} {...b} />
      ))}
      <Harbour {...f.harbour} />
      {DISTRICTS.filter((d) => d.id !== 'farm').map((d) => (
        <Outline key={d.id} x={d.at[0]} z={d.at[1]} color={d.color} />
      ))}
      {f.grounds.map((g, i) => (
        <GroundPiece key={i} g={g} />
      ))}
      {f.greenhouses.map((g, i) => (
        <Greenhouse key={i} {...g} />
      ))}
      {f.pavilions.map((p, i) => (
        <Pavilion key={i} {...p} />
      ))}
      {f.hills.map((h, i) => (
        <Hill key={i} {...h} />
      ))}
      <Hologram {...f.holo} />
      <Robots robots={f.robots} />
    </>
  );
}
