/**
 * A topic's picture from our own 3D arm: the lesson view at the end of 활동 1 · 2 · 3 (the trails,
 * shapes, targets and labels the try draws), rendered in the dark studio by
 * tools/build/topic-shots.mjs. Three side by side, or one large for a try's page, each named
 * with its activity. A try without a still falls back to the drawn figure (TopicArt).
 * No hooks: the steps' names come from the catalog.
 */

import { STEP_NAME, TOPIC_BY_ID, type StepKey, type TopicId } from '@/engine/education/catalog';
import { tryShot } from '@/engine/education/media';

import { SHOTS } from './shots.gen';
import { TopicArt } from './TopicArt';
import css from './shot.module.css';

const KEYS: readonly StepKey[] = ['A', 'B', 'C'];
/** Each try's colour, as most topics draw its trail (topics/kit STEP_COLORS — a client module, so not imported here). */
const TRY_COLOR: Record<StepKey, string> = { A: '#ffad1f', B: '#22c7e8', C: '#3ddc84' };

/** Whether the topic has a 3D still for this try (or, with no try, for all three). */
export const hasShot = (id: TopicId, step?: StepKey) => (step ? !!SHOTS[id]?.includes(step) : KEYS.every((k) => SHOTS[id]?.includes(k)));

/** A step's text as shown: the `symbol` marks of the 원고 dropped. */
const plain = (s: string) => s.replace(/`/g, '');

export function TopicShot({
  id,
  focus,
  className,
}: {
  id: TopicId;
  /** Show only this try's still, large (else the three side by side). */
  focus?: StepKey;
  className?: string;
}) {
  const topic = TOPIC_BY_ID.get(id);
  if (!topic || !hasShot(id, focus)) return <TopicArt id={id} focus={focus} className={className} />;
  const keys = focus ? [focus] : KEYS;
  return (
    <div className={[css.frame, className ?? ''].join(' ')} data-one={focus ? true : undefined} role="group" aria-label={`${topic.title}: 3D 실습 화면`}>
      {keys.map((k) => {
        const s = topic.steps.find((x) => x.key === k)!;
        return (
          <figure key={k} className={css.shot}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a still of the 3D view, also in the static export */}
            <img src={tryShot(id, k)} alt={`${STEP_NAME[k]} ${plain(s.title)}: 결과를 3D 화면으로`} width={960} height={600} loading="lazy" decoding="async" />
            <figcaption style={{ ['--c' as string]: TRY_COLOR[k] }}>
              <b>{STEP_NAME[k]}</b>
              <span>{plain(s.title)}</span>
              {focus && <small>{`${s.change.what} · ${plain(s.change.value)}`}</small>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
