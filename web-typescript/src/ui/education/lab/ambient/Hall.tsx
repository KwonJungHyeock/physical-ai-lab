'use client';

/** The site rooms' back walls (shared by every site's surroundings). */

import { RBox } from '../../../simulator/stage/sceneKit';
import { m } from '../CellKit';
import { useTiled } from './Ground';

/**
 * The building's two back walls (along y at x = `x`, along x at y = `y`), seen when the view is drawn
 * back: a wall with a coloured band, tall windows full of daylight (or glass panes for a greenhouse),
 * and pillars between them. The walls stand far enough out that the fog softens them. The wall's face
 * is painted plaster (a CC0 texture, tinted the site's wall colour).
 */
export function Hall({ x = -2600, y = 2600, h = 1500, wall = '#e6e9ed', band = '#2f5be7', glass = false }: { x?: number; y?: number; h?: number; wall?: string; band?: string; glass?: boolean }) {
  const span = 6000;
  const pitch = 1000;
  const runs = [
    { along: 'y' as const, at: x, from: -2400 },
    { along: 'x' as const, at: y, from: x },
  ];
  return (
    <group>
      {runs.map((r) => {
        const n = Math.floor(span / pitch);
        const pos = (u: number, z: number, out = 0): [number, number, number] => (r.along === 'y' ? [r.at + out, u, z] : [u, r.at - out, z]);
        const size = (lu: number, lz: number, t: number): [number, number, number] => (r.along === 'y' ? [t, lu, lz] : [lu, t, lz]);
        return (
          <group key={r.along}>
            {!glass && (
              <>
                <RBox at={pos(r.from + span / 2, h / 2, -40)} size={size(span, h, 80)} radius={4} shadow={false}>
                  <meshStandardMaterial color={wall} roughness={0.9} />
                </RBox>
                <PlasterFace at={pos(r.from + span / 2, h / 2, 1)} alongY={r.along === 'y'} w={span} h={h} color={wall} />
              </>
            )}
            <RBox at={pos(r.from + span / 2, 60, 2)} size={size(span, 120, glass ? 60 : 12)} radius={2} shadow={false}>
              <meshStandardMaterial color={glass ? '#f2f4f1' : '#59616b'} roughness={0.7} />
            </RBox>
            {!glass && (
              <RBox at={pos(r.from + span / 2, h - 160, 2)} size={size(span, 50, 10)} radius={2} shadow={false}>
                <meshStandardMaterial color={band} roughness={0.5} />
              </RBox>
            )}
            {Array.from({ length: n }, (_, i) => r.from + pitch / 2 + i * pitch).map((u) => (
              <group key={u}>
                {/* A window (or a glass pane) between two pillars. */}
                <RBox at={pos(u, 120 + (h - 420) / 2 + 60, glass ? 0 : 3)} size={size(pitch - 220, h - 420, 6)} radius={2} shadow={false}>
                  {glass ? (
                    <meshPhysicalMaterial color="#e8f3ea" transparent opacity={0.25} roughness={0.05} clearcoat={1} />
                  ) : (
                    <meshStandardMaterial color="#dceefe" emissive="#cfe6ff" emissiveIntensity={0.55} roughness={0.2} />
                  )}
                </RBox>
                {!glass && (
                  <RBox at={pos(u, 120 + (h - 420) / 2 + 60, 7)} size={size(12, h - 420, 6)} radius={1} shadow={false}>
                    <meshStandardMaterial color="#c9cfd6" roughness={0.5} />
                  </RBox>
                )}
                <RBox at={pos(u + pitch / 2, h / 2, 30)} size={size(90, h, 90)} radius={4} shadow={false}>
                  <meshStandardMaterial color={glass ? '#f5f7f4' : '#d3d8de'} roughness={0.6} metalness={glass ? 0.3 : 0} />
                </RBox>
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

/** The wall's inner face: a `w` × `h` mm plane of painted plaster facing into the room (+x for the wall along y, −y for the other). */
function PlasterFace({ at, alongY, w, h, color }: { at: [number, number, number]; alongY: boolean; w: number; h: number; color: string }) {
  const maps = useTiled('wall-plaster', 1200, w, h);
  return (
    <group position={[m(at[0]), m(at[1]), m(at[2])]} rotation={[0, 0, alongY ? Math.PI / 2 : 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[m(w), m(h)]} />
        <meshStandardMaterial {...maps} color={color} normalScale={[0.8, 0.8]} envMapIntensity={0.5} />
      </mesh>
    </group>
  );
}
