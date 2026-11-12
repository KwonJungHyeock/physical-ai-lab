'use client';

/**
 * 입문 과정 무대 (courseStage.ts): the stage every 절 stands on, the same whether a booth is open
 * (1-1 · 4-3 · 5장) or the arm is bare (1-2 · 1-3 · 3-4 · 4-1) — the plain background, the desk
 * (900 × 600, the booth's own table drawn bigger and in the stage's colour), the robot's plate and
 * the soft contact shadow under it. Nothing new is modelled here.
 */

import { COURSE_DESK, type StageLook } from '@/engine/simulator/cell/courseStage';

import { BoothTable, Contact } from './cell/cellG';
import { Backdrop } from './cell/kit';

export default function CourseDesk({ look }: { look: StageLook }) {
  return (
    <>
      <Backdrop color={look.bg} />
      <BoothTable desk={look.desk} box={COURSE_DESK} />
      <Contact at={[0, 0]} w={170} d={170} k={0.35} />
    </>
  );
}
