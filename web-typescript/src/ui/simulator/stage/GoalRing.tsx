'use client';

/**
 * A glowing ring in the 3D view for the tool tip to go into (robot frame, mm), with a short tag over
 * it: a 해 보기 step's target (CellScene) and the 입문 맛보기's rings (lifeTutorials.ts).
 */

import { Html } from '@react-three/drei';

import { m } from './cell/kit';

export default function GoalRing({ at, label }: { at: readonly [number, number, number]; label: string }) {
  return (
    <group position={[m(at[0]), m(at[1]), m(at[2])]}>
      <mesh>
        <torusGeometry args={[m(15), m(1.6), 12, 48]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.9} transparent opacity={0.9} />
      </mesh>
      <Html center zIndexRange={[21, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ transform: 'translateY(-34px)', background: '#fff', color: '#15181c', borderRadius: 8, padding: '4px 9px', font: '800 12.5px Pretendard, sans-serif', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {label}
        </div>
      </Html>
    </group>
  );
}
