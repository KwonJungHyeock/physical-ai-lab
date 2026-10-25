/**
 * AI 버튼: the desktop simulator (desktop-go/localai.go) asks a model in Ollama on this PC for block
 * lines — no class server, no login, no key. The same scene description and answer checks as the
 * class server's 말로 만들기 (speak.ts); only the desktop program answers these (on this PC only), so
 * anywhere else `localAiStatus()` says no and the button stays hidden.
 */

import type { LlmContext, LlmMode } from '../account/client';

const API = '/__physical-ai-simulator/ai';
const HEAD = { 'X-Physical-AI': '1' };

export interface LocalModel {
  name: string;
  /** Bytes on disk. */
  size: number;
  /** "8.2B". */
  params?: string;
}

/** Is this the desktop program, and is Ollama there with which models. */
export interface LocalAiStatus {
  /** The desktop program answered (false: a browser, the button is not shown). */
  program: boolean;
  /** Ollama answered. */
  ok: boolean;
  models: LocalModel[];
  error?: string;
}

export interface LocalAiAnswer {
  ok: boolean;
  mode?: LlmMode;
  lines?: string[];
  explain: string;
}

export async function localAiStatus(): Promise<LocalAiStatus> {
  try {
    const r = await fetch(API, { cache: 'no-store', headers: HEAD, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return { program: false, ok: false, models: [] };
    const j = (await r.json()) as { ok: boolean; models?: LocalModel[]; error?: string };
    return { program: true, ok: j.ok, models: j.models ?? [], error: j.error };
  } catch {
    return { program: false, ok: false, models: [] };
  }
}

export async function localAiAsk(text: string, model: string, context: LlmContext): Promise<LocalAiAnswer> {
  let r: Response;
  try {
    r = await fetch(`${API}/ask`, { method: 'POST', cache: 'no-store', headers: { ...HEAD, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model, context }) });
  } catch {
    throw new Error('시뮬레이터 프로그램이 대답하지 않아요. 검은 창이 켜져 있는지 확인해 주세요.');
  }
  const j = (await r.json().catch(() => ({}))) as LocalAiAnswer & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `AI 에게 답을 받지 못했어요 (${r.status}).`);
  return j;
}

/**
 * The model to ask: the one chosen before if Ollama still has it, else a Qwen 3 (good at Korean and
 * at keeping to a format among the small ones), else the first.
 */
export function pickModel(models: readonly LocalModel[], saved: string | null): string {
  if (saved && models.some((m) => m.name === saved)) return saved;
  return (models.find((m) => /^qwen3/i.test(m.name)) ?? models.find((m) => /qwen/i.test(m.name)) ?? models[0])?.name ?? '';
}
