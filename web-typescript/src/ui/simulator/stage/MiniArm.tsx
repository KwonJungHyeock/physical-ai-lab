'use client';

/**
 * The mini arm (bottom left of the 3D view): the same arm model, see-through, seen from the side
 * so its joints read like a drawing — the view turns with J1 so the arm always shows its profile.
 * It is drawn into a corner of the 3D canvas after the main picture (one renderer, no second
 * WebGL context), and where each joint lands in that corner is written to `out` for the angle
 * chips (MiniArmLabels). Joints judged in caution or danger (engine/robot/jointAlert.ts) take the
 * same colour here as on the big arm.
 */

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, type RefObject } from 'react';
import { Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, OrthographicCamera, Scene, Vector3 } from 'three';

import type { ChainSegment } from '@/engine/robot/kinematics';
import type { JointAlert } from '@/engine/robot/jointAlert';
import type { UrdfRobot } from '@/engine/robot/urdf';
import type { WorldState } from '@/engine/simulator/sim';

import { buildArm, type GlbNodes } from './robotModel';

/** Where the corner is, CSS pixels from the canvas's left and bottom edges. */
export interface MiniRect {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

/** What the chips read every frame (written by the 3D view). */
export interface MonitorOut {
  /** Joint positions in the corner, CSS px from the canvas's top-left; empty while the mini arm is off. */
  points: { x: number; y: number }[];
  /** The joint angles the mini arm was drawn with (the chips show these, so both always agree). */
  angles: number[];
  alerts: JointAlert[];
  setPoints(p: { x: number; y: number }[], angles: number[]): void;
  setAlerts(a: JointAlert[]): void;
}

export function createMonitor(): MonitorOut {
  const m: MonitorOut = {
    points: [],
    angles: [],
    alerts: [],
    setPoints: (p, a) => {
      m.points = p;
      m.angles = a;
    },
    setAlerts: (a) => void (m.alerts = a),
  };
  return m;
}

/** Metres of arm shown top to bottom, and the height looked at (the 280 stands about 0.45 m tall). */
const SPAN_M = 0.5;
const MID_Z = 0.19;
const DEG = Math.PI / 180;

export const ALERT_COLOR = ['', '#ff9f1c', '#ff3b3b'] as const;

export function MiniArm({
  robot,
  chain,
  nodes,
  look,
  world,
  place,
  out,
  composer,
}: {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  nodes: GlbNodes;
  look: Parameters<typeof buildArm>[3];
  world: RefObject<WorldState>;
  /** Where the corner is now (it moves with the side panel). */
  place(): MiniRect;
  out: RefObject<MonitorOut>;
  /** The post-processing composer draws the main picture; without it this frame step must. */
  composer: boolean;
}) {
  const { scene, cam, arm, tints } = useMemo(() => {
    const scene = new Scene();
    scene.add(new HemisphereLight('#ffffff', '#8090a8', 1.6));
    const key = new DirectionalLight('#ffffff', 1.4);
    key.position.set(0.4, -0.6, 1);
    scene.add(key);
    const arm = buildArm(robot, chain, nodes, look);
    const base = new MeshStandardMaterial({ color: '#f2f6ff', transparent: true, opacity: 0.62, roughness: 0.55, metalness: 0 });
    arm.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.material = base;
        m.castShadow = false;
        m.receiveShadow = false;
      }
    });
    // Each joint's housing gets its own material, so it can take the warning colour alone.
    const tints = arm.joints.map((j) => {
      const mat = base.clone();
      j.housing?.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.material = mat;
      });
      return mat;
    });
    scene.add(arm.root);
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0.01, 5);
    cam.up.set(0, 0, 1);
    return { scene, cam, arm, tints };
  }, [robot, chain, nodes, look]);
  useEffect(
    () => () => {
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      tints.forEach((t) => t.dispose());
    },
    [scene, tints],
  );

  const p = useMemo(() => new Vector3(), []);
  const plain = useMemo(() => new Color('#f2f6ff'), []);
  useFrame((state) => {
    if (!composer) state.gl.render(state.scene, state.camera);
    const q = world.current?.angles;
    if (!q) return;
    arm.setAngles(q);
    const rect = place();
    // Side on to the arm's plane, the arm reaching to the right.
    const j1 = (q[0] ?? 0) * DEG;
    cam.position.set(Math.sin(j1) * 1.5, -Math.cos(j1) * 1.5, MID_Z);
    cam.lookAt(0, 0, MID_Z);
    const aspect = rect.width / rect.height;
    Object.assign(cam, { top: SPAN_M / 2, bottom: -SPAN_M / 2, left: (-SPAN_M / 2) * aspect, right: (SPAN_M / 2) * aspect });
    cam.updateProjectionMatrix();
    const alerts = out.current?.alerts ?? [];
    tints.forEach((t, i) => {
      const lv = alerts[i]?.level ?? 0;
      t.color.set(lv ? ALERT_COLOR[lv] : plain);
      t.opacity = lv ? 0.9 : 0.62;
    });
    arm.root.updateMatrixWorld(true);

    const { width: W, height: H } = state.size;
    const gl = state.gl;
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setScissorTest(true);
    gl.setScissor(rect.left, rect.bottom, rect.width, rect.height);
    gl.setViewport(rect.left, rect.bottom, rect.width, rect.height);
    gl.clearDepth();
    gl.render(scene, cam);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, W, H);
    gl.autoClear = autoClear;

    out.current?.setPoints(
      arm.joints.map((j) => {
        j.group.getWorldPosition(p).project(cam);
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: H - rect.bottom - ((p.y + 1) / 2) * rect.height };
      }),
      q.slice(),
    );
  }, 2);
  return null;
}
