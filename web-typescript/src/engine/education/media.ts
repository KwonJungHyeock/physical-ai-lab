/**
 * Pictures for each topic and 단원, made by the tools from the app itself:
 *   figure GIF  /education/fig/<id>.gif           tools/build/figure-gifs.mjs (the figure's animation)
 *   figure PNG  /education/fig/<id>.png           the same, its last frame (still, for the 교육 home)
 *   try GIF     /education/clips/<id>-<A|B|C>.gif tools/check/learn-sim.mjs --clips (the lesson rail and the
 *                                                3D view while the scenario does the try as the 원고 says)
 *   단원 picture /education/unit/u<n>.jpg          the 3D view (960 × 540) in the 단원's main activity
 *   try still   /education/shots/<id>-<A|B|C>.webp tools/build/topic-shots.mjs (the 3D view, 960 × 600, at
 *                                                the try's result; the tries that have one: lesson/shots.gen.ts)
 * npm run check:learn makes sure every topic and 단원 has them.
 */

import type { StepKey, TopicId } from './catalog';

export const figureGif = (id: TopicId) => `/education/fig/${id}.gif`;
export const figureStill = (id: TopicId) => `/education/fig/${id}.png`;
/** The 교육 home's picture of a 단원: our arm in the 3D view doing its main activity. */
export const unitPicture = (cat: string) => `/education/unit/u${cat}.jpg`;
export const tryGif = (id: TopicId, step: StepKey) => `/education/clips/${id}-${step}.gif`;
/** The 3D view at a try's result (dark studio), when the try has one (ui/education/lesson/shots.gen.ts). */
export const tryShot = (id: TopicId, step: StepKey) => `/education/shots/${id}-${step}.webp`;
