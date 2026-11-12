'use client';

/**
 * 입문 과정 무대 (courseStage.ts) where there is no booth (1-2 · 1-3, the bare arm): the same desk
 * the booth stands on — its table and the robot's plate in the stage's colour, the soft contact
 * shadow under the plate — and the stage's plain background. Nothing new is modelled here: the
 * booth's own table (cell/cellG.tsx), its colour changed.
 */

import type { StageLook } from '@/engine/simulator/cell/courseStage';

import { BoothTable, Contact } from './cell/cellG';
import { Backdrop } from './cell/kit';

export default function CourseDesk({ look }: { look: StageLook }) {
  return (
    <>
      <Backdrop color={look.bg} />
      <BoothTable desk={look.desk} />
      <Contact at={[0, 0]} w={170} d={170} k={0.35} />
    </>
  );
}
