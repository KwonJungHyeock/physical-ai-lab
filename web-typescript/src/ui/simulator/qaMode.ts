/**
 * 입문 과정 QA (동결 뒤 고침 v6 파트 5-3): /track/life?qa=1 keeps its learning record apart from the real one.
 * Opened so, this page's localStorage is read and written under 'qa:' + the key — every key, so no record of the
 * real class is read, changed or removed while QA goes on; without ?qa=1 nothing here does anything.
 * [QA 기록 처음부터] (QaPanel) removes the 'qa:' keys only.
 *
 * Installed when this module is first loaded (Console imports it), before any screen reads its record.
 */

export const QA_PREFIX = 'qa:';

/** This page was opened as QA: the 입문 과정's address with ?qa=1. */
export const isQa = (): boolean => typeof window !== 'undefined' && window.location.pathname.startsWith('/track/life') && new URLSearchParams(window.location.search).get('qa') === '1';

const proto = typeof Storage !== 'undefined' ? Storage.prototype : null;
const own = proto ? { get: proto.getItem, set: proto.setItem, remove: proto.removeItem, key: proto.key, clear: proto.clear } : null;

/** The QA record's own keys, as stored ('qa:…'). */
function qaKeys(local: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < local.length; i++) {
    const k = own?.key.call(local, i);
    if (k?.startsWith(QA_PREFIX)) keys.push(k);
  }
  return keys;
}

function install() {
  if (!proto || !own || !isQa()) return;
  const marked = proto as Storage & { __qa?: boolean };
  if (marked.__qa) return;
  marked.__qa = true;
  const local = window.localStorage;
  proto.getItem = function (this: Storage, k: string) {
    return own.get.call(this, this === local ? QA_PREFIX + k : k);
  };
  proto.setItem = function (this: Storage, k: string, v: string) {
    own.set.call(this, this === local ? QA_PREFIX + k : k, v);
  };
  proto.removeItem = function (this: Storage, k: string) {
    own.remove.call(this, this === local ? QA_PREFIX + k : k);
  };
  // (Nothing clears the whole store today; if it did, in QA only the QA record goes.)
  proto.clear = function (this: Storage) {
    if (this === local) qaKeys(local).forEach((k) => own.remove.call(local, k));
    else own.clear.call(this);
  };
}
install();

/** The QA record's keys removed (the real record untouched); the page then starts again. */
export function resetQaRecord() {
  if (!own || !isQa()) return;
  const local = window.localStorage;
  qaKeys(local).forEach((k) => own.remove.call(local, k));
  window.location.reload();
}
