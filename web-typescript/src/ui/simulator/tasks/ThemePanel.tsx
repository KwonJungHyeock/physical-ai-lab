'use client';

/**
 * 테마학습 (입문 트랙 ① 생활 로봇): what to learn with, in the side panel, in the 학습 로드맵's
 * dress (Roadmap.tsx). 실생활 협동로봇 — the places where cobots work in everyday life (the café,
 * the calligraphy booth; the board-game robot is coming) — each its picture with the caption in its
 * shade (the tag, the five field ticks, the fields by name), then its name, its order of work and
 * its four steps as ticks; and three 튜토리얼 on the controls every step uses, cut into one plate.
 * Picking a place opens it in the 3D view with its 작업 순서 cards; picking a tutorial leaves the
 * place for the desk and starts the quest card over the 3D view.
 */

import type { CellId } from '@/engine/simulator/cell/cells';
import { missionsOf } from '@/engine/simulator/cell/missions';
import { fieldsLine, LIFE_STOPS } from '@/engine/simulator/lifeFields';
import { LIFE_TUTORIALS } from '@/engine/simulator/lifeTutorials';

import FieldTicks from './FieldTicks';
import css from './theme.module.css';

/** The places (the stops that are not the tutorials). */
const SITES = LIFE_STOPS.filter((s) => s.opens !== 'tutorial');

interface Props {
  /** The place open now (null: the desk). */
  cell: CellId | null;
  /** Steps passed, by id. */
  passed: Readonly<Record<string, boolean>>;
  /** The tutorial running, and the ones finished. */
  tutorial: string | null;
  tutorialsDone: Readonly<Record<string, boolean>>;
  busy: boolean;
  onSite(id: CellId): void;
  onTutorial(id: string): void;
}

export default function ThemePanel(p: Props) {
  return (
    <div className={css.theme}>
      <section>
        <h4>
          <em>SITES</em>
          <b>실생활 협동로봇</b>
          <small>현장마다 4단계</small>
        </h4>
        <div className={css.sites}>
          {SITES.map((s) => {
            const cell = s.opens && s.opens !== 'tutorial' ? s.opens : null;
            const steps = cell ? missionsOf(cell) : [];
            const done = steps.filter((m) => p.passed[m.id]).length;
            const body = (
              <>
                <span className={css.pic}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the places' pictures, also in the static export */}
                  <img src={s.img} alt="" />
                  <span className={css.caption}>
                    <span>
                      <em>{cell ? s.phase : `${s.phase} · ${s.title}`}</em>
                      <FieldTicks className={css.capTicks} on={(f) => s.fields.includes(f)} />
                    </span>
                    <small>{fieldsLine(s)}</small>
                  </span>
                  {cell && p.cell === cell && <span className={css.flag}>지금 여기</span>}
                  {!cell && (
                    <span className={css.flag} data-soon>
                      준비 중
                    </span>
                  )}
                </span>
                {cell && (
                  <span className={css.body}>
                    <b>{s.title}</b>
                    <small>{s.flow}</small>
                    {steps.length > 0 && (
                      <span className={css.prog} aria-label={`${done} / ${steps.length}단계 통과`}>
                        <span className={css.steps}>
                          {steps.map((m) => (
                            <i key={m.id} data-done={p.passed[m.id] || undefined} />
                          ))}
                        </span>
                        <em>
                          {done}/{steps.length} 단계
                        </em>
                      </span>
                    )}
                  </span>
                )}
              </>
            );
            return cell ? (
              <button key={s.key} type="button" className={css.site} aria-pressed={p.cell === cell} disabled={p.busy} onClick={() => p.onSite(cell)}>
                {body}
              </button>
            ) : (
              <div key={s.key} className={css.site} data-soon>
                {body}
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h4>
          <em>TUTORIAL</em>
          <b>튜토리얼</b>
          <small>조작 익히기</small>
        </h4>
        <ol className={css.tuts}>
          {LIFE_TUTORIALS.map((t, k) => (
            <li key={t.id}>
              <button type="button" aria-pressed={p.tutorial === t.id} disabled={p.busy} onClick={() => p.onTutorial(t.id)}>
                <i data-done={p.tutorialsDone[t.id] || undefined}>{p.tutorialsDone[t.id] ? '✓' : String(k + 1).padStart(2, '0')}</i>
                <span>
                  <b>{t.title}</b>
                  <small>{t.note}</small>
                </span>
                <em>{t.steps.length}단계</em>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
