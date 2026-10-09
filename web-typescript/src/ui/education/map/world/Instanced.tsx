'use client';

/**
 * Many copies of the pack models, drawn as one instanced mesh per model part (a city of a few
 * thousand placed models stays a few hundred draw calls). Every copy casts and takes shadows.
 */

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { Euler, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';

import { packUrl, type PackId, type Place } from './worldAssets';

interface Part {
  geometry: BufferGeometry;
  material: Material | Material[];
  rel: Matrix4;
}

/** The parts of one model: meshes with their transform relative to the pack's scene root. */
function modelParts(root: Object3D, model: string): Part[] {
  const holder = root.children.find((c) => c.name === model);
  if (!holder) return [];
  root.updateMatrixWorld(true);
  const parts: Part[] = [];
  holder.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh)
      parts.push({
        geometry: m.geometry,
        material: m.material,
        rel: m.matrixWorld.clone(),
      });
  });
  return parts;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

function placeMatrix(p: Place, out: Matrix4) {
  _q.setFromEuler(_e.set(0, ((p.rot ?? 0) * Math.PI) / 180, 0));
  const s = p.s ?? 1;
  return out.compose(_p.set(p.x, p.y ?? 0, p.z), _q, _s.set(s, s, s));
}

function ModelInstances({ root, model, items, shadows }: { root: Object3D; model: string; items: readonly Place[]; shadows: boolean }) {
  const meshes = useMemo(
    () =>
      modelParts(root, model).map((part) => {
        const im = new InstancedMesh(part.geometry, part.material, items.length);
        im.castShadow = shadows;
        im.receiveShadow = true;
        items.forEach((p, i) => im.setMatrixAt(i, placeMatrix(p, _m).multiply(part.rel)));
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        return { im };
      }),
    [root, model, items, shadows],
  );
  useEffect(() => () => meshes.forEach(({ im }) => im.dispose()), [meshes]);
  return (
    <>
      {meshes.map(({ im }, i) => (
        <primitive key={i} object={im} />
      ))}
    </>
  );
}

/** Everything placed from one pack. */
export function PackPlaces({ pack, places, shadows = true }: { pack: PackId; places: readonly Place[]; shadows?: boolean }) {
  const { scene } = useGLTF(packUrl(pack));
  const byModel = useMemo(() => {
    const m = new Map<string, Place[]>();
    for (const p of places) if (p.pack === pack) m.set(p.model, [...(m.get(p.model) ?? []), p]);
    return [...m.entries()];
  }, [places, pack]);
  return (
    <>
      {byModel.map(([model, items]) => (
        <ModelInstances key={model} root={scene} model={model} items={items} shadows={shadows} />
      ))}
    </>
  );
}

/** The names of every model in a pack (the contact sheet). */
export function usePackModels(pack: PackId): string[] {
  const { scene } = useGLTF(packUrl(pack));
  return useMemo(() => scene.children.map((c) => c.name), [scene]);
}
