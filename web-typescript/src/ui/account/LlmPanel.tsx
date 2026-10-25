'use client';

/**
 * 학급 관리 › 말로 만들기 (AI): turn the students' 말로 만들기 on or off and set how many questions a
 * student may ask a day; the operator also enters the Anthropic API key (kept on this PC, shown only as
 * its first and last characters) and picks the model. Below, a class's questions: what each student
 * said, the blocks the AI made, whether the student put them in — to look at after the lesson.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { ClassInfo, ClassServerClient, LlmLogEntry, LlmSettings } from '@/engine/account';

import { clock } from './labels';
import css from './account.module.css';

const MODEL_NAMES: Record<string, string> = {
  'claude-haiku-5-5': 'Claude Haiku 5.5 · 빠르고 저렴',
  'claude-opus-5-5': 'Claude Opus 5.5 · 헷갈리는 말도 잘 알아들음 (약 15배 비용)',
};
/** Published list prices per million tokens (input, output), for the rough cost line. */
const PRICE: Record<string, [number, number]> = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-opus-5-5': [4, 20] };

export default function LlmPanel({ client, operator, classes, onError }: { client: ClassServerClient; operator: boolean; classes: ClassInfo[]; onError(e: unknown): void }) {
  const [view, setView] = useState<LlmSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [daily, setDaily] = useState(30);
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [classId, setClassId] = useState(classes.find((c) => !c.archived)?.id ?? '');
  const [log, setLog] = useState<LlmLogEntry[] | null>(null);

  const show = useCallback((v: LlmSettings) => {
    setView(v);
    setEnabled(v.enabled);
    setDaily(v.daily);
    setModel(v.model);
  }, []);
  useEffect(() => {
    client.llmSettings().then(show, onError);
  }, [client, show, onError]);
  useEffect(() => {
    if (!classId) return;
    client.classLlm(classId, 300).then((r) => setLog(r.entries.slice().reverse()), onError);
  }, [client, classId, onError]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const v = await client.setLlmSettings({ enabled, daily, ...(operator ? { model, ...(key.trim() ? { apiKey: key.trim() } : {}) } : {}) });
      show(v);
      setKey('');
      setNote(v.enabled ? '저장했어요. 학생 화면의 [말로 만들기] 가 열려요.' : '저장했어요. 말로 만들기는 꺼져 있어요.');
    } catch (x) {
      onError(x);
    }
  };

  const price = PRICE[view?.model ?? ''] ?? [0, 0];
  const t = view?.today;
  const cost = t ? ((t.inputTokens - t.cacheReadTokens) * price[0] + t.cacheReadTokens * price[0] * 0.1 + t.outputTokens * price[1]) / 1e6 : 0;

  return (
    <section className={css.panel} aria-label="말로 만들기 (AI)">
      <header className={css.panelHead}>
        <div className={css.panelTitle}>
          <h2>말로 만들기 (AI)</h2>
          <p>학생이 할 일을 말로 적으면 AI 가 블록을 만들어 보여 줘요. 학생이 확인해서 넣고, 시뮬레이션을 통과해야 로봇이 움직여요. API 키는 이 PC 에만 있어요.</p>
        </div>
      </header>
      {note && (
        <p className={css.ok} role="status">
          {note}
        </p>
      )}
      {!view ? (
        <p className={css.emptyLine}>불러오는 중…</p>
      ) : (
        <>
          <form className={css.syncForm} onSubmit={save} autoComplete="off">
            <label className={css.switchRow}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!view.keySet && !key.trim()} />
              <span>
                <b>말로 만들기 {enabled ? '켜짐' : '꺼짐'}</b>
                <small>{view.keySet ? '끄면 학생 화면에서 바로 닫혀요.' : '먼저 운영자가 API 키를 넣어야 켤 수 있어요.'}</small>
              </span>
            </label>
            <label className={css.field}>
              <span>
                학생 한 명이 하루에 물을 수 있는 횟수 <small>1~200번</small>
              </span>
              <input type="number" min={1} max={200} value={daily} onChange={(e) => setDaily(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
            </label>
            {operator && (
              <>
                <label className={css.field}>
                  <span>AI 모델</span>
                  <select value={model} onChange={(e) => setModel(e.target.value)}>
                    {view.models.map((m) => (
                      <option key={m} value={m}>
                        {MODEL_NAMES[m] ?? m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={css.field}>
                  <span>
                    Anthropic API 키 <small>{view.keySet ? `저장된 키 ${view.keyHint} · 바꿀 때만 넣어요` : 'sk-ant- 로 시작 · 회사 계정에서 발급'}</small>
                  </span>
                  <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="new-password" placeholder={view.keySet ? '그대로 두면 저장된 키를 써요' : 'sk-ant-…'} />
                </label>
              </>
            )}
            <div className={css.formBtns}>
              <button type="submit" className={css.primaryBtn}>
                저장
              </button>
            </div>
          </form>
          {t && (
            <dl className={css.syncStatus}>
              <div>
                <dt>오늘 물은 횟수</dt>
                <dd>{t.asks}번 (반 전체)</dd>
              </div>
              <div>
                <dt>오늘 쓴 비용 (대략)</dt>
                <dd>
                  약 ${cost.toFixed(cost < 1 ? 3 : 2)} · 입력 {t.inputTokens.toLocaleString()} · 출력 {t.outputTokens.toLocaleString()} 토큰
                </dd>
              </div>
            </dl>
          )}
        </>
      )}

      <h3 className={css.subHead}>학생들이 물은 것</h3>
      {classes.length === 0 ? (
        <p className={css.emptyLine}>학급이 없어요.</p>
      ) : (
        <>
          <label className={`${css.field} ${css.llmPick}`}>
            <span>학급</span>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? ' (보관)' : ''}
                </option>
              ))}
            </select>
          </label>
          {!log ? (
            <p className={css.emptyLine}>불러오는 중…</p>
          ) : log.length === 0 ? (
            <p className={css.emptyLine}>아직 물은 학생이 없어요.</p>
          ) : (
            <ol className={css.llmLog}>
              {log.map((e) => (
                <li key={e.id} data-bad={!!e.error || undefined}>
                  <span className={css.llmWho}>
                    {e.no ? `${e.no}번` : (e.user ?? '선생님')} · {clock(Date.parse(e.t))}
                  </span>
                  <b>“{e.text}”</b>
                  {e.error ? (
                    <small>답을 받지 못함 ({e.error})</small>
                  ) : e.ok ? (
                    <small>
                      블록 {(e.lines ?? []).filter((l) => !l.startsWith('from ')).length}줄{e.inserted ? ' · 넣었어요' : ' · 넣지 않음'}
                    </small>
                  ) : (
                    <small>못 만든다고 답함: {e.explain}</small>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
