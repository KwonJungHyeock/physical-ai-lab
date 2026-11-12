'use client';

/**
 * 입문 과정 절 (장별 가이드라인 v1) in the 3D view:
 *  - 1-2: a press spot on each joint of the arm (and the tool tip), riding on the joint: the ones
 *    found keep their name tag; a wrong press shows that part's name a moment.
 *  - Asset slots placed in the scene (robot mm): the asset's picture when its file is in
 *    /course/assets/, else a dashed 준비 중 box with the slot's name — the visual itself (a hand, the
 *    작업 범위 circle …) is never drawn in code.
 */

import { Html, Line } from '@react-three/drei';
import { createPortal, useThree } from '@react-three/fiber';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Vector3, type Group } from 'three';

import { m } from './cell/kit';
import css from './courseMarks.module.css';

export interface CourseSlot {
  /** The asset's file name in /course/assets/ (without the extension; a .png is looked for). */
  id: string;
  /** What it is, on the placeholder. */
  label: string;
  /** Where, robot frame mm. */
  at: readonly [number, number, number];
  w: number;
  h: number;
  /** Comes in from off to the side (screen px it travels, x · y) when `in`, and goes back out after. */
  enter?: { in: boolean; from: readonly [number, number] };
}

export interface CoursePick {
  names: readonly string[];
  /** Parts found (0-based: 0..5 the joints, 6 the tool tip). */
  found: readonly number[];
  /** A part's name shown a moment (a wrong press). */
  flash: number | null;
  onPick(part: number): void;
}

/** 2-1: the empty places on the desk (robot mm), put down in order: the ones not put down yet show their outline and can be pressed. */
export interface CoursePlaces {
  rects: readonly { name: string; x0: number; x1: number; y0: number; y1: number }[];
  placed: number;
  onPick(place: number): void;
}

export interface CourseStageMarks {
  pick?: CoursePick | null;
  slots?: readonly CourseSlot[];
  /** 3-2: the target angle shown beside a joint (0..5). */
  goal?: { joint: number; text: string } | null;
  places?: CoursePlaces | null;
}

/** 1-2: 베이스 (J1)'s spot sits down on the turning base, apart from 어깨 (J2) just above it (its frame, m). */
const J1_SPOT: [number, number, number] = [0, 0, -0.06];

export function AssetSlot({ slot }: { slot: CourseSlot }) {
  const [missing, setMissing] = useState(false);
  const away = slot.enter && !slot.enter.in;
  const move = slot.enter ? { transform: away ? `translate(${slot.enter.from[0]}px, ${slot.enter.from[1]}px)` : 'translate(0, 0)', opacity: away ? 0 : 1 } : undefined;
  return (
    <div className={css.slot} style={{ width: slot.w, height: slot.h, ...move }} data-moves={slot.enter ? true : undefined} data-missing={missing || undefined}>
      {!missing && (
        // eslint-disable-next-line @next/next/no-img-element -- an asset slot: the team's picture, also in the static export
        <img src={`/course/assets/${slot.id}.png`} alt={slot.label} onError={() => setMissing(true)} />
      )}
      {missing && (
        <span>
          에셋 슬롯 · {slot.label}
          <small>{slot.id}.png 준비 중</small>
        </span>
      )}
    </div>
  );
}

/** An empty place: its dashed outline on the desk and an invisible face to press (the later ones lie higher: the card's place is on the mat's). */
function Place({ r, z, onPress }: { r: CoursePlaces['rects'][number]; z: number; onPress(at: Vector3): void }) {
  const pts = useMemo(
    () =>
      [
        [r.x0, r.y0],
        [r.x1, r.y0],
        [r.x1, r.y1],
        [r.x0, r.y1],
        [r.x0, r.y0],
      ].map(([x, y]) => [m(x), m(y), m(z)] as [number, number, number]),
    [r, z],
  );
  return (
    <group>
      <Line points={pts} color="#fff7e8" lineWidth={2.5} dashed dashSize={m(10)} gapSize={m(6)} />
      <mesh
        position={[m((r.x0 + r.x1) / 2), m((r.y0 + r.y1) / 2), m(z)]}
        onClick={(e) => {
          e.stopPropagation();
          onPress(e.point.clone());
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[m(r.x1 - r.x0), m(r.y1 - r.y0)]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * The place a press is for. The card's place lies inside the mat's: a press where both are means the
 * one that comes next if it is one of them (the mat before the card), else the smaller one (so a press
 * there before the robot is down says "먼저 로봇을 놓아요", as anywhere).
 */
function placeAt(places: CoursePlaces, root: Group | null, world: Vector3): number {
  const p = root ? root.worldToLocal(world) : world;
  const x = p.x * 1000;
  const y = p.y * 1000;
  const hits = places.rects.map((r, i) => ({ r, i })).filter(({ r, i }) => i >= places.placed && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const next = hits.find((h) => h.i === places.placed);
  if (next) return next.i;
  const area = (r: CoursePlaces['rects'][number]) => (r.x1 - r.x0) * (r.y1 - r.y0);
  return hits.sort((a, b) => area(a.r) - area(b.r))[0]?.i ?? places.placed;
}

/** For the behaviour checks (as Console's __cell* hooks): where on screen each 2-1 place's middle is, px. */
function PlacesHook({ places, root }: { places: CoursePlaces; root: Group | null }) {
  const camera = useThree((t) => t.camera);
  const size = useThree((t) => t.size);
  useEffect(() => {
    const w = window as unknown as { __placeAt?: () => [number, number][] };
    w.__placeAt = () =>
      places.rects.map((r) => {
        const v = new Vector3(m((r.x0 + r.x1) / 2), m((r.y0 + r.y1) / 2), 0);
        root?.localToWorld(v);
        v.project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      });
    return () => {
      delete w.__placeAt;
    };
  }, [places, root, camera, size]);
  return null;
}

export default function CourseMarks({ marks, joints, flange, tcpMm }: { marks: CourseStageMarks; joints: readonly { group: Group }[]; flange: Group; tcpMm: number }) {
  const pick = marks.pick;
  const places = marks.places;
  const [root, setRoot] = useState<Group | null>(null);
  const goalAt = marks.goal ? joints[marks.goal.joint]?.group : undefined;
  return (
    <>
      {marks.goal &&
        goalAt &&
        createPortal(
          <Html center zIndexRange={[22, 0]} style={{ pointerEvents: 'none' }}>
            <span className={css.goal}>{marks.goal.text}</span>
          </Html>,
          goalAt,
        )}
      {places && (
        <group ref={setRoot}>
          {places.rects.map((r, i) => (i < places.placed ? null : <Place key={r.name} r={r} z={1 + i * 0.6} onPress={(at) => places.onPick(placeAt(places, root, at))} />))}
          <PlacesHook places={places} root={root} />
        </group>
      )}
      {marks.slots?.map((s) => (
        <group key={s.id} position={[m(s.at[0]), m(s.at[1]), m(s.at[2])]}>
          <Html center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
            <AssetSlot slot={s} />
          </Html>
        </group>
      ))}
      {pick &&
        pick.names.map((name, i) => {
          const parent = i < 6 ? joints[i]?.group : flange;
          if (!parent) return null;
          const shown = pick.found.includes(i) || pick.flash === i;
          return (
            <Fragment key={i}>
              {createPortal(
                <group position={i === 0 ? J1_SPOT : i < 6 ? [0, 0, 0] : [0, 0, tcpMm / 1000]}>
                  <Html center zIndexRange={[22, 0]}>
                    {/* Name tags left and right in turn, a line to the joint (seven never on top of one another). */}
                    <button type="button" className={css.spot} data-side={i % 2 ? 'left' : 'right'} data-found={pick.found.includes(i) || undefined} aria-label={name} onClick={() => pick.onPick(i)}>
                      {shown && <b data-wrong={(!pick.found.includes(i) && pick.flash === i) || undefined}>{name}</b>}
                    </button>
                  </Html>
                </group>,
                parent,
              )}
            </Fragment>
          );
        })}
    </>
  );
}
