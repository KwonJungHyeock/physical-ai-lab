'use client';

/**
 * Furniture and equipment from the model packs (public/models/<group>.glb, built by
 * tools/build/model-pack.mjs; CC0 / MIT-0, see public/models/ATTRIBUTION.md): each model is a named
 * node in metres, y up, centred, its foot at y = 0. <Model> places one in a site's robot frame (z up,
 * mm): at a floor point, turned by `yaw`, optionally fitted to a height or width.
 */

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { AnimationMixer, Box3, NearestFilter, Vector3, type AnimationClip, type Mesh, type Object3D, type Texture } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { m } from '../CellKit';

export type ModelGroup = 'care' | 'cafe' | 'people';

const url = (g: ModelGroup) => `/models/${g}.glb`;

/** A fresh copy of the named model, casting and taking shadows; palette textures sampled without blur. */
function useModelCopy(group: ModelGroup, name: string, pose?: string, at = 0.5): { obj: Object3D; size: Vector3 } {
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
    if (clip) {
      const mixer = new AnimationMixer(obj);
      mixer.clipAction(clip).play();
      mixer.setTime(at * clip.duration);
    }
    obj.updateMatrixWorld(true);
    const size = new Box3().setFromObject(obj).getSize(new Vector3());
    return { obj, size };
  }, [scene, animations, group, name, pose, at]);
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
}

export default function Model({ group, name, at = [0, 0], z = 0, yaw = 0, scale, h, w, pose, poseAt }: Props) {
  const { obj, size } = useModelCopy(group, name, pose, poseAt);
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
