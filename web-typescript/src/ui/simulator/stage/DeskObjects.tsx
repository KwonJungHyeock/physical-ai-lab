'use client';

/**
 * The objects on the desk (작업대 꾸미기), in the robot base frame (the parent group is z up, metres):
 * drawn from the world each frame (physics moves them), picked with a click, dragged over the desk
 * and deleted (its × or the Delete key) whenever nothing runs. With physics on, a rigid-body world (Rapier) runs beside the
 * simulator: the arm's links push the objects, they fall and topple, and the pump or a closing
 * gripper picks the one at the tool tip.
 */

import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Quaternion, Vector3, type Group } from 'three';

import { EFFECTOR_BY_ID, type EffectorId } from '@/engine/simulator/effectors';
import { OBJECT_KINDS, type DeskObject } from '@/engine/simulator/desk';
import type { WorldState } from '@/engine/simulator/sim';
import type { ChainSegment } from '@/engine/robot/kinematics';
import { createPhysics, type BlockSpec, type PhysicsWorld } from '@/engine/physics/physics';

import css from '../console.module.css';
import { RBox, Turned, brushed, cardboard, grain, pill, stripes, vessel } from './sceneKit';

const m = (mm: number) => mm / 1000;
const Z_UP = new Vector3(0, 0, 1);

const FRUIT = new Set(['#e5484d', '#f5b400', '#7cc242', '#1fae66']);

function Shape({ o, selected }: { o: DeskObject; selected: boolean }) {
  const [sx, sy, sz] = o.size;
  const kind = OBJECT_KINDS[o.kind];
  // The picked object glows a little (its × is above it).
  const hi = { emissive: selected ? '#3454d1' : '#000000', emissiveIntensity: selected ? 0.35 : 0 };
  const plastic = <meshPhysicalMaterial color={o.color} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} bumpMap={grain([2, 2])} bumpScale={0.4} {...hi} />;
  const foot = [0, 0, -sz / 2] as const;
  switch (o.kind) {
    case 'box':
      return (
        <RBox size={[sx, sy, sz]} radius={2.5}>
          <meshStandardMaterial color={o.color} map={cardboard()} roughness={0.88} {...hi} />
        </RBox>
      );
    case 'obstacle':
      return (
        <RBox size={[sx, sy, sz]} radius={4}>
          <meshStandardMaterial color={o.color} map={stripes([Math.max(1, Math.round(sy / 60)), Math.max(1, Math.round(sz / 60))])} roughness={0.55} {...hi} />
        </RBox>
      );
    case 'tray': {
      const lip = Math.max(4, sz);
      return (
        <group>
          <RBox at={[0, 0, -sz / 2 + 2]} size={[sx, sy, 4]} radius={1.6}>
            {plastic}
          </RBox>
          {(
            [
              [0, (sy - 4) / 2, sx, 4],
              [0, -(sy - 4) / 2, sx, 4],
              [(sx - 4) / 2, 0, 4, sy - 6],
              [-(sx - 4) / 2, 0, 4, sy - 6],
            ] as const
          ).map(([x, y, a, b], i) => (
            <RBox key={i} at={[x, y, -sz / 2 + lip / 2]} size={[a, b, lip]} radius={1.6}>
              {plastic}
            </RBox>
          ))}
        </group>
      );
    }
    case 'part':
      // A machined ring: chamfered edges, a bore through the middle.
      return (
        <Turned at={foot} profile={[[sx * 0.18, 0], [sx / 2 - 1.5, 0], [sx / 2, 1.5], [sx / 2, sz - 1.5], [sx / 2 - 1.5, sz], [sx * 0.18 + 1, sz], [sx * 0.18, sz - 1], [sx * 0.18, 0]]}>
          <meshStandardMaterial color={o.color} metalness={0.85} roughness={0.32} map={brushed()} {...hi} />
        </Turned>
      );
    case 'cup':
      return (
        <Turned at={foot} profile={vessel(sx * 0.38, sx / 2, sz)}>
          <meshPhysicalMaterial color={o.color} roughness={0.28} clearcoat={0.6} clearcoatRoughness={0.2} {...hi} />
        </Turned>
      );
    case 'bin': {
      const t = 4;
      const walls: [number, number, number, number][] = [
        [(sx - t) / 2, 0, t, sy],
        [-(sx - t) / 2, 0, t, sy],
        [0, (sy - t) / 2, sx - 2 * t + 1, t],
        [0, -(sy - t) / 2, sx - 2 * t + 1, t],
      ];
      return (
        <group>
          <RBox at={[0, 0, -sz / 2 + 2]} size={[sx, sy, 4]} radius={2}>
            {plastic}
          </RBox>
          {walls.map(([x, y, a, b], i) => (
            <RBox key={i} at={[x, y, 0]} size={[a, b, sz]} radius={1.8}>
              {plastic}
            </RBox>
          ))}
          {/* The rolled lip round the top. */}
          {walls.map(([x, y, a, b], i) => (
            <RBox key={`l${i}`} at={[x + Math.sign(x) * 1.5, y + Math.sign(y) * 1.5, sz / 2 - 2.5]} size={[a + (a > b ? 3 : 4), b + (b > a ? 3 : 4), 5]} radius={2.4}>
              {plastic}
            </RBox>
          ))}
        </group>
      );
    }
  }
  switch (kind.shape) {
    case 'ball':
      return (
        <group>
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[m(sx / 2), 40, 28]} />
            <meshPhysicalMaterial color={o.color} roughness={0.35} clearcoat={0.5} clearcoatRoughness={0.3} bumpMap={grain([3, 2])} bumpScale={0.6} {...hi} />
          </mesh>
          {/* In a fruit colour: a short stem on top. */}
          {FRUIT.has(o.color.toLowerCase()) && (
            <mesh position={[0, 0, m(sx / 2)]} rotation={[Math.PI / 2, 0, 0.3]} castShadow>
              <cylinderGeometry args={[m(1.2), m(1.6), m(Math.max(4, sx * 0.14)), 8]} />
              <meshStandardMaterial color="#6b4a2b" roughness={0.8} />
            </mesh>
          )}
        </group>
      );
    case 'cylinder':
      return (
        <Turned at={foot} profile={pill(sx / 2, sz)}>
          {plastic}
        </Turned>
      );
    default:
      return (
        <RBox size={[sx, sy, sz]} radius={Math.min(3, sx * 0.08)}>
          {plastic}
        </RBox>
      );
  }
}

/** One object, posed from the world every frame (it may be moved by the physics). */
function Item({ o, world, selected, edit, onDown }: { o: DeskObject; world: RefObject<WorldState | null>; selected: boolean; edit?: DeskEdit; onDown?: (e: ThreeEvent<PointerEvent>) => void }) {
  const g = useRef<Group>(null);
  const q = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const now = world.current?.objects.find((k) => k.id === o.id) ?? o;
    if (!g.current) return;
    g.current.position.set(m(now.x), m(now.y), m(now.z + now.size[2] / 2));
    if (now.q) g.current.quaternion.set(now.q[0], now.q[1], now.q[2], now.q[3]);
    else g.current.quaternion.copy(q.setFromAxisAngle(Z_UP, (now.yawDeg * Math.PI) / 180));
  });
  const cursor = (c: string) => () => {
    if (edit) document.body.style.cursor = c;
  };
  return (
    <group ref={g} onPointerDown={onDown} onPointerOver={cursor('grab')} onPointerOut={cursor('')}>
      <Shape o={o} selected={selected} />
      {selected && edit && (
        // The selected object's own delete button, just above it (the Delete key does the same).
        <Html position={[0, 0, m(o.size[2] / 2) + 0.022]} center zIndexRange={[6, 5]}>
          <span className={css.objTag}>
            <b>{OBJECT_KINDS[o.kind].name}</b>
            <button
              type="button"
              className={css.objDelete}
              title="이 물건 지우기 (Delete 키)"
              aria-label={`${OBJECT_KINDS[o.kind].name} 지우기`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                edit.onRemove(o.id);
              }}
            >
              ×
            </button>
          </span>
        </Html>
      )}
    </group>
  );
}

export interface DeskEdit {
  selected: string | null;
  onSelect(id: string | null): void;
  /** While dragging: the object at (x, y) mm (the world only). */
  onMove(id: string, x: number, y: number): void;
  /** Let go at (x, y) mm: the desk keeps it there. */
  onDrop(id: string, x: number, y: number): void;
  onRemove(id: string): void;
}

/**
 * The desk's objects. With `edit` (arm-only theme, nothing running) any of them is picked with a
 * click and dragged over the desk in the plane it was grabbed at (the camera's orbit is held still
 * meanwhile); a click elsewhere drops the selection.
 */
export function DeskObjects({ world, objects, edit }: { world: RefObject<WorldState | null>; objects: readonly DeskObject[]; edit?: DeskEdit }) {
  const get = useThree((s) => s.get);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; z: number; x: number; y: number } | null>(null);
  const local = useMemo(() => new Vector3(), []);
  const dragRef = useRef(drag);
  const editRef = useRef(edit);
  useEffect(() => {
    editRef.current = edit;
  });
  // The camera's orbit is held still while an object is dragged.
  const orbit = useCallback(
    (on: boolean) => {
      const c = get().controls as { enabled: boolean } | null;
      if (c) c.enabled = on;
    },
    [get],
  );
  const end = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    orbit(true);
    document.body.style.cursor = '';
    editRef.current?.onDrop(d.id, d.x, d.y);
  }, [orbit]);
  // A release anywhere (off the canvas too) ends the drag.
  useEffect(() => {
    if (!drag) return;
    // A touch the browser takes back (pointercancel) ends it too, so the camera is never left frozen.
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [drag, end]);
  // Editing switched off mid-drag (a run started): the camera gets its orbit back.
  useEffect(() => {
    if (!edit) end();
  }, [edit, end]);
  return (
    <group onPointerMissed={edit && !drag ? () => edit.selected && edit.onSelect(null) : undefined}>
      {objects.map((o) => (
        <Item
          key={o.id}
          o={o}
          world={world}
          selected={edit?.selected === o.id}
          edit={edit}
          onDown={
            edit
              ? (e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  edit.onSelect(o.id);
                  const root = e.eventObject.parent;
                  const p = local.copy(e.point);
                  if (root) root.worldToLocal(p);
                  const now = world.current?.objects.find((k) => k.id === o.id) ?? o;
                  // Grab offset in the plane at the grab height, so the object does not jump to the pointer.
                  const d = { id: o.id, dx: p.x * 1000 - now.x, dy: p.y * 1000 - now.y, z: p.z, x: now.x, y: now.y };
                  dragRef.current = d;
                  setDrag(d);
                  orbit(false);
                  document.body.style.cursor = 'grabbing';
                }
              : undefined
          }
        />
      ))}
      {edit && drag && (
        // An invisible sheet at the grab height catches the pointer while dragging.
        <mesh
          position={[0.2, 0, drag.z]}
          onPointerMove={(e) => {
            e.stopPropagation();
            const p = e.eventObject.parent!.worldToLocal(local.copy(e.point));
            const x = Math.round(Math.max(-450, Math.min(450, p.x * 1000 - drag.dx)));
            const y = Math.round(Math.max(-450, Math.min(450, p.y * 1000 - drag.dy)));
            if (dragRef.current) Object.assign(dragRef.current, { x, y });
            edit.onMove(drag.id, x, y);
          }}
          onPointerUp={end}
        >
          <planeGeometry args={[3, 3]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

const toSpec = (o: DeskObject): BlockSpec => {
  const shape = OBJECT_KINDS[o.kind].shape;
  return {
    id: o.id,
    color: o.color,
    at: [o.x, o.y, o.z + o.size[2] / 2],
    massG: o.massG,
    shape: shape === 'ball' ? 'ball' : shape === 'cylinder' || shape === 'cup' ? 'cylinder' : 'box',
    dims: o.size,
    yawDeg: o.yawDeg,
    q: o.q,
    friction: o.kind === 'ball' ? 0.4 : 0.7,
  };
};

/**
 * Physics on: the rigid-body world follows the arm and moves the world's objects. Rebuilt when the
 * world is reset or the objects are edited (the console then gives the world a new objects list).
 */
export function DeskPhysics({ world, chain, tcpMm, effector }: { world: RefObject<WorldState | null>; chain: readonly ChainSegment[]; tcpMm: number; effector: EffectorId }) {
  const phys = useRef<PhysicsWorld | null>(null);
  const built = useRef<{ list: DeskObject[] | null; on: boolean; loading: boolean }>({ list: null, on: false, loading: false });
  const gripping = useRef(false);
  useEffect(
    () => () => {
      phys.current?.dispose();
      phys.current = null;
    },
    [],
  );
  useFrame((_, dt) => {
    const w = world.current;
    if (!w) return;
    const on = w.physics && w.objects.length > 0;
    const b = built.current;
    if (!on) {
      b.on = false;
      return;
    }
    if (b.loading) return;
    if (!phys.current || b.list !== w.objects || !b.on) {
      const list = w.objects;
      const specs = list.map(toSpec);
      const fixed = w.fixed.map((f) => ({ min: f.min, max: f.max }));
      b.list = list;
      b.on = true;
      gripping.current = false;
      if (phys.current) phys.current.reset(specs, fixed, w.angles);
      else {
        b.loading = true;
        void createPhysics(chain, tcpMm, specs, fixed, w.angles).then((p) => {
          phys.current = p;
          b.loading = false;
        });
        return;
      }
    }
    const p = phys.current;
    p.stepTo(w.angles, Math.min(dt, 1 / 30));
    // The pump on, or a gripper closed: hold what is at the tool tip; off / open: let go.
    const kind = EFFECTOR_BY_ID[effector].kind;
    const open = EFFECTOR_BY_ID[effector].gapMm?.open ?? 0;
    const grip = !w.held && (kind === 'suction' ? w.pump : kind === 'grip' ? w.gapMm < open - 8 : false);
    if (grip && !gripping.current) p.grab(kind === 'suction' ? 12 : 22);
    if (!grip && gripping.current) p.release();
    gripping.current = grip;
    for (const pose of p.blocks()) {
      const o = w.objects.find((k) => k.id === pose.id);
      if (!o) continue;
      o.x = pose.at.x;
      o.y = pose.at.y;
      o.z = pose.at.z - o.size[2] / 2;
      o.q = [pose.q.x, pose.q.y, pose.q.z, pose.q.w];
    }
  });
  return null;
}
