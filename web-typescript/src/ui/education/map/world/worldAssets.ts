/**
 * The world map's models: CC0 packs merged into one GLB each (public/education/world, see its
 * ATTRIBUTION.md), every model a named node under the scene root, already scaled to world units
 * (1 unit ≈ 4 m; a KayKit road tile is 2 × 2). y up, as authored.
 */

export type PackId = 'city' | 'space' | 'industry' | 'commercial' | 'suburb' | 'street' | 'cars' | 'nature' | 'farm';

export const PACKS: readonly PackId[] = ['city', 'space', 'industry', 'commercial', 'suburb', 'street', 'cars', 'nature', 'farm'];

export const packUrl = (p: PackId) => `/education/world/${p}.glb`;

/** One model placed on the map: ground position (x, z), height y, turn about y (deg), scale. */
export interface Place {
  pack: PackId;
  model: string;
  x: number;
  z: number;
  y?: number;
  rot?: number;
  s?: number;
}
