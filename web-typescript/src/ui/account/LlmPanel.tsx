'use client';

/**
 * 학급 관리 › 말로 만들기 (AI): turn the students' 말로 만들기 on or off and set how many questions a
 * student may ask a day; the operator also picks the AI — Claude (the Anthropic API key, kept on this
 * PC and shown only as its first and last characters, and the model) or a model in Ollama on this PC
 * (for demonstrations: no key, no internet, weaker answers). Below, a class's questions: what each
 * student said, the blocks the AI made, whether the student put them in — to look at after the lesson.
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

type Provider = LlmSettings['provider'];
type LocalModel = { name: string; size: number; params?: string };

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

export default function LlmPanel({ client, operator, classes, onError }: { client: ClassServerClient; operator: boolean; classes: ClassInfo[]; onError(e: unknown): void }) {
  const [view, setView] = useState<LlmSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [daily, setDaily] = useState(30);
  const [model, setModel] = useState('');
  const [key, setKey] = useState('');
  const [provider, setProvider] = useState<Provider>('claude');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [local, setLocal] = useState<LocalModel[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [classId, setClassId] = useState(classes.find((c) => !c.archived)?.id ?? '');
  const [log, setLog] = useState<LlmLogEntry[] | null>(null);

  const show = useCallback((v: LlmSettings) => {
    setView(v);
    setEnabled(v.enabled);
    setDaily(v.daily);
    setModel(v.model);
    setProvider(v.provider);
    setOllamaUrl(v.ollamaUrl);
    setOllamaModel(v.ollamaModel);
  }, []);
  useEffect(() => {
    client.llmSettings().then(show, onError);
  }, [client, show, onError]);
  useEffect(() => {
    if (!classId) return;
    client.classLlm(classId, 300).then((r) => setLog(r.entries.slice().reverse()), onError);
  }, [client, classId, onError]);

  /** Ask Ollama at the address which models it has; picks the first when none is chosen yet. */
  const find = useCallback(
    async (url: string) => {
      setFinding(true);
      setFindNote(null);
      try {
        const r = await client.llmLocalModels(url);
        setLocal(r.models);
        setOllamaUrl(r.url);
        if (r.models.length === 0) setFindNote('Ollama 는 켜져 있지만 받아 둔 모델이 없어요. 명령창에서 ollama pull qwen3:8b 처럼 받아 주세요.');
        else setOllamaModel((m) => (m && r.models.some((x) => x.name === m) ? m : r.models[0].name));
      } catch (x) {
        setLocal(null);
        setFindNote(x instanceof Error ? x.message : 'Ollama 에 연결할 수 없어요.');
      } finally {
        setFinding(false);
      }
    },
    [client],
  );

  const choose = (p: Provider) => {
    setProvider(p);
    if (p === 'ollama' && local === null && !finding) void find(ollamaUrl);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const ai = provider === 'claude' ? { provider, model, ...(key.trim() ? { apiKey: key.trim() } : {}) } : { provider, ollamaUrl, ollamaModel };
      const v = await client.setLlmSettings({ enabled, daily, ...(operator ? ai : {}) });
      show(v);
      setKey('');
      setNote(v.enabled ? '저장했어요. 학생 화면의 [말로 만들기] 가 열려요.' : '저장했어요. 말로 만들기는 꺼져 있어요.');
    } catch (x) {
      onError(x);
    }
  };

  const onPC = view?.provider === 'ollama';
  const price = PRICE[view?.model ?? ''] ?? [0, 0];
  const t = view?.today;
  const cost = t ? ((t.inputTokens - t.cacheReadTokens) * price[0] + t.cacheReadTokens * price[0] * 0.1 + t.outputTokens * price[1]) / 1e6 : 0;
  /** Something to ask once saved: the saved settings, or what the operator is about to save. */
  const canTurnOn = operator ? (provider === 'claude' ? !!view?.keySet || !!key.trim() : !!ollamaModel) : !!view?.ready;
  const aiNow = view ? (onPC ? `이 PC 의 Ollama · ${view.ollamaModel || '모델 안 고름'}` : (MODEL_NAMES[view.model] ?? view.model).split(' · ')[0]) : '';

  return (
    <section className={css.panel} aria-label="말로 만들기 (AI)">
      <header className={css.panelHead}>
        <div className={css.panelTitle}>
          <h2>말로 만들기 (AI)</h2>
          <p>학생이 할 일을 말로 적으면 AI 가 블록을 만들어 보여 줘요. 학생이 확인해서 넣고, 시뮬레이션을 통과해야 로봇이 움직여요. AI 에 묻는 일은 이 PC(학급 서버)가 해요.</p>
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
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!canTurnOn && !enabled} />
              <span>
                <b>말로 만들기 {enabled ? '켜짐' : '꺼짐'}</b>
                <small>{canTurnOn ? `지금 AI: ${aiNow} · 끄면 학생 화면에서 바로 닫혀요.` : provider === 'ollama' ? '먼저 운영자가 Ollama 모델을 골라야 켤 수 있어요.' : '먼저 운영자가 API 키를 넣어야 켤 수 있어요.'}</small>
              </span>
            </label>
            <label className={css.field}>
              <span>
                학생 한 명이 하루에 물을 수 있는 횟수 <small>1~200번</small>
              </span>
              <input type="number" min={1} max={200} value={daily} onChange={(e) => setDaily(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
            </label>
            {operator && (
              <fieldset className={css.llmKind}>
                <legend>AI 종류</legend>
                <label>
                  <input type="radio" name="llm-provider" checked={provider === 'claude'} onChange={() => choose('claude')} />
                  <span>
                    <b>Claude</b>
                    <small>인터넷 · Anthropic API 키 · 쓴 만큼 비용</small>
                  </span>
                </label>
                <label>
                  <input type="radio" name="llm-provider" checked={provider === 'ollama'} onChange={() => choose('ollama')} />
                  <span>
                    <b>이 PC 의 Ollama</b>
                    <small>시연용 · 키와 인터넷 없이 · 답이 느리고 더 자주 틀려요</small>
                  </span>
                </label>
              </fieldset>
            )}
            {operator && provider === 'ollama' && (
              <>
                <label className={css.field}>
                  <span>
                    Ollama 주소 <small>같은 PC 면 그대로 두세요</small>
                  </span>
                  <span className={css.llmFind}>
                    <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" spellCheck={false} />
                    <button type="button" className={css.ghostBtn} disabled={finding} onClick={() => void find(ollamaUrl)}>
                      {finding ? '찾는 중…' : '모델 찾기'}
                    </button>
                  </span>
                </label>
                {findNote && <p className={css.error}>{findNote}</p>}
                <label className={css.field}>
                  <span>
                    Ollama 모델 <small>{local ? `${local.length}개 찾음` : '[모델 찾기] 를 눌러요'}</small>
                  </span>
                  <select value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} disabled={!local?.length && !ollamaModel}>
                    {!local?.some((m) => m.name === ollamaModel) && <option value={ollamaModel}>{ollamaModel || '모델을 찾아 주세요'}</option>}
                    {(local ?? []).map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} · {m.params ? `${m.params} · ` : ''}
                        {gb(m.size)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {operator && provider === 'claude' && (
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
                <dt>{onPC ? '오늘 쓴 양' : '오늘 쓴 비용 (대략)'}</dt>
                <dd>
                  {onPC ? '비용 없음 (이 PC 에서 계산)' : `약 $${cost.toFixed(cost < 1 ? 3 : 2)}`} · 입력 {t.inputTokens.toLocaleString()} · 출력 {t.outputTokens.toLocaleString()} 토큰
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
