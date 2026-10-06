'use client';

import { Environment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BackSide, BoxGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PMREMGenerator, Scene } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * A photo studio instead of a room (`softbox`): a dim grey box lit by a large overhead softbox and two
 * tall strip lights, so glossy parts carry long clean highlights along their length, as in product
 * photographs.
 */
function softboxStudio(): Scene {
  const scene = new Scene();
  const room = new Mesh(new BoxGeometry(10, 6, 10), new MeshStandardMaterial({ color: '#5a5f66', side: BackSide, roughness: 1 }));
  room.position.y = 2;
  scene.add(room);
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, k: number) => {
    const m = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial());
    m.material.color.setScalar(k);
    m.position.set(x, y, z);
    scene.add(m);
  };
  panel(3.6, 0.1, 2.6, 0.4, 4.6, 0.3, 6); // overhead softbox
  panel(0.6, 3.2, 0.1, -3.4, 2.2, -1.6, 4.5); // strip, back left
  panel(0.1, 3.2, 0.6, 4.4, 2.0, 1.4, 3.5); // strip, right
  panel(2.4, 1.4, 0.1, 0.5, 1.6, 4.8, 1.6); // soft front fill
  return scene;
}

/**
 * Studio light for reflections and soft fill, prefiltered once (no download): three's procedural room,
 * or with `softbox` the photo studio above (the robot arm's screen).
 */
export default function StudioLight({ intensity = 0.42, softbox = false }: { intensity?: number; softbox?: boolean }) {
  const gl = useThree((st) => st.gl);
  const env = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = softbox ? softboxStudio() : new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    });
    pmrem.dispose();
    return texture;
  }, [gl, softbox]);
  useEffect(() => () => env.dispose(), [env]);
  return <Environment map={env} environmentIntensity={intensity} />;
}
