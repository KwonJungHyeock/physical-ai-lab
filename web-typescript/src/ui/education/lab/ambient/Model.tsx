'use client';

/**
 * Furniture and equipment from the model packs (public/models/<group>.glb, built by
 * tools/build/model-pack.mjs; CC0 / MIT-0, see public/models/ATTRIBUTION.md): each model is a named
 * node in metres, y up, centred, its foot at y = 0. <Model> places one in a site's robot frame (z up,
 * mm): at a floor point, turned by `yaw`, optionally fitted to a height or width.
 */

import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import { AnimationMixer, Box3, BufferGeometry, Float32BufferAttribute, MeshPhysicalMaterial, MeshStandardMaterial, NearestFilter, Vector3, type AnimationClip, type Mesh, type Object3D, type Texture } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { m } from '../CellKit';

/** One per JSON file in tools/build/model-packs/. */
export type ModelGroup = 'care' | 'cafe' | 'people' | 'bio' | 'factory' | 'logistics' | 'farm' | 'ai' | 'energy';

const url = (g: ModelGroup) => `/models/${g}.glb`;

/**
 * A copy of the geometry shaded round: each vertex's normal is the average of the normals of every
 * vertex at the same place (a faceted low-poly model has one per face there). Works on packed,
 * interleaved attributes too (read and written through getX · setXYZ).
 */
function smoothNormals(src: BufferGeometry): BufferGeometry {
  const g = src.clone();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  if (!pos || !nor) return g;
  const sum = new Map<string, [number, number, number]>();
  const keyOf = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i += 1) {
    const k = keyOf(i);
    const s = sum.get(k) ?? [0, 0, 0];
    s[0] += nor.getX(i);
    s[1] += nor.getY(i);
    s[2] += nor.getZ(i);
    sum.set(k, s);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const [x, y, z] = sum.get(keyOf(i))!;
    const l = Math.hypot(x, y, z) || 1;
    out.set([x / l, y / l, z / l], i * 3);
  }
  g.setAttribute('normal', new Float32BufferAttribute(out, 3));
  return g;
}

/** A fresh copy of the named model, casting and taking shadows; palette textures sampled without blur. */
function useModelCopy(group: ModelGroup, name: string, pose?: string, at = 0.5, color?: string, smooth = false, live = false): { obj: Object3D; size: Vector3; mixer: AnimationMixer | null } {
  const { scene, animations } = useGLTF(url(group));
  return useMemo(() => {
    const src = scene.getObjectByName(name);
    if (!src) throw new Error(`model ${group}/${name} is not in the pack`);
    const obj = cloneSkinned(src);
    obj.position.set(0, 0, 0);
    obj.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      // `smooth`: a low-poly model's faceted faces shaded round (its own copy of the geometry, so the
      // pack's other users keep theirs), and its materials given the arm's satin finish.
      if (smooth) {
        mesh.geometry = smoothNormals(mesh.geometry);
        mesh.material = ([] as MeshStandardMaterial[]).concat(mesh.material as MeshStandardMaterial).map((mt) => {
          const p = new MeshPhysicalMaterial({ color: mt.color, map: mt.map, roughness: 0.62, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.6, sheen: 0.4, sheenRoughness: 0.8 });
          return p;
        }) as unknown as Mesh['material'];
        if (Array.isArray(mesh.material) && mesh.material.length === 1) mesh.material = mesh.material[0];
      }
      // One colour over the whole model (its own colours lost on export, or a site's colour).
      if (color) mesh.material = new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
      for (const mt of ([] as unknown[]).concat(mesh.material)) {
        const t = (mt as { map?: Texture | null }).map;
        const img = t?.image as { width?: number; height?: number } | undefined;
        // A colour palette (a few texels per colour) would blur into one grey with mipmaps.
        if (t && img?.width && img.width <= 256) {
          t.generateMipmaps = false;
          t.minFilter = t.magFilter = NearestFilter;
          t.needsUpdate = true;
        }
      }
    });
    // A rigged model holds one moment of one of its clips (a person standing, reaching, sitting).
    const clip = pose ? (animations as AnimationClip[]).find((c) => c.name === `${name}:${pose}`) : undefined;
    let mixer: AnimationMixer | null = null;
    if (clip) {
      mixer = new AnimationMixer(obj);
      mixer.clipAction(clip).play();
      mixer.setTime(at * clip.duration);
    }
    obj.updateMatrixWorld(true);
    const size = new Box3().setFromObject(obj).getSize(new Vector3());
    // `live`: the clip plays on (a person breathing, shifting a little), held otherwise.
    return { obj, size, mixer: live ? mixer : null };
  }, [scene, animations, group, name, pose, at, color, smooth, live]);
}

interface Props {
  group: ModelGroup;
  name: string;
  /** Where its foot stands, mm (robot frame). */
  at?: readonly [number, number];
  /** Height of the floor it stands on, mm. */
  z?: number;
  /** Turn about z, rad (0: the model's front, +z in the pack, faces −y). */
  yaw?: number;
  /** Uniform scale, or fit: the height (`h`) or width along its x (`w`) it should have, mm. */
  scale?: number;
  h?: number;
  w?: number;
  /** A rigged model's clip to hold (e.g. 'Idle'), and where in it (0 … 1). */
  pose?: string;
  poseAt?: number;
  /** Paint the whole model one colour. */
  color?: string;
  /** Shade a low-poly model round, in a satin finish (the 생활 로봇 places, beside the arm). */
  smooth?: boolean;
  /** Play the pose's clip on instead of holding one moment. */
  live?: boolean;
}

export default function Model({ group, name, at = [0, 0], z = 0, yaw = 0, scale, h, w, pose, poseAt, color, smooth, live }: Props) {
  const { obj, size, mixer } = useModelCopy(group, name, pose, poseAt, color, smooth, live);
  useFrame((_, dt) => mixer?.update(Math.min(dt, 0.1)));
  const k = scale ?? (h ? m(h) / size.y : w ? m(w) / size.x : 1);
  return (
    <group position={[m(at[0]), m(at[1]), m(z)]} rotation={[0, 0, yaw]}>
      <group rotation={[Math.PI / 2, 0, 0]} scale={k}>
        <primitive object={obj} />
      </group>
    </group>
  );
}

/** Starts loading a group's pack before its scene needs it. */
export const preloadModels = (g: ModelGroup) => useGLTF.preload(url(g));
