/**
 * Keeping the login on this PC: the session (token, role, who) and the class server's address, in a
 * store passed in (localStorage). A session read back is checked field by field and dropped when it
 * has expired. Logging out (or the server answering 401) clears it.
 *
 * On a PC shared by several students, the screen should log out at the end of the lesson (the teacher
 * can also end every student session of the class: client.logoutAll).
 * No React, no DOM.
 */

import { normalizeServerAddress, SERVER_ADDRESS_KEY } from './client';
import type { KVStore } from './queue';
import { sessionExpired, type Session } from './types';

export const SESSION_KEY = 'class-session';

export function saveSession(store: KVStore | null, s: Session): void {
  store?.setItem(SESSION_KEY, JSON.stringify(s));
  store?.setItem(SERVER_ADDRESS_KEY, s.baseUrl);
}

export function clearSession(store: KVStore | null): void {
  store?.removeItem?.(SESSION_KEY);
}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 2000;

/** The saved session, or null (none, malformed, or expired). */
export function loadSession(store: KVStore | null, now: number): Session | null {
  if (!store) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(store.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || !str(v.token) || typeof v.expiresAt !== 'number' || !str(v.baseUrl)) return null;
  if (normalizeServerAddress(v.baseUrl) !== v.baseUrl) return null;
  if (sessionExpired({ expiresAt: v.expiresAt }, now)) {
    clearSession(store);
    return null;
  }
  if (v.role === 'student') {
    const st = v.student as Record<string, unknown> | undefined;
    const cl = v.class as Record<string, unknown> | undefined;
    if (!st || !str(st.classId) || !str(st.classCode) || typeof st.no !== 'number' || !st.actor) return null;
    if (!cl || !Array.isArray(cl.openLessons)) return null;
    return v as unknown as Session;
  }
  if (v.role === 'teacher' || v.role === 'operator') {
    const u = v.user as Record<string, unknown> | undefined;
    if (!u || !str(u.id) || !str(u.username)) return null;
    return v as unknown as Session;
  }
  return null;
}

/** The class server address last used on this PC (to try first next time). */
export function savedServerAddress(store: KVStore | null): string | null {
  const v = store?.getItem(SERVER_ADDRESS_KEY) ?? null;
  return v ? normalizeServerAddress(v) : null;
}

/**
 * Handing the login over to a robot's page. Connecting to a robot opens that robot's own console
 * (another address, so another browser store); the login goes along in the address's fragment
 * (`#class=…`: never sent to any server) and the robot's page takes it in and removes it at once.
 */
const HANDOFF = 'class=';

export function sessionHandoff(s: Session): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `${HANDOFF}${encodeURIComponent(btoa(bin))}`;
}

/** The login handed over in this fragment (`#class=…`, up to the next `&`), checked like a saved one. */
export function readHandoff(hash: string, now: number): Session | null {
  const m = /(?:^#?|&)class=([^&]*)/.exec(hash);
  if (!m) return null;
  try {
    const bin = atob(decodeURIComponent(m[1]));
    const text = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    const probe: KVStore & { v: string | null } = {
      v: text,
      getItem() {
        return this.v;
      },
      setItem() {},
      removeItem() {},
    };
    return loadSession(probe, now);
  } catch {
    return null;
  }
}

/** The fragment without the handed-over login (what else it carries stays). */
export function withoutHandoff(hash: string): string {
  const rest = hash
    .replace(/^#/, '')
    .split('&')
    .filter((p) => p && !p.startsWith(HANDOFF));
  return rest.length ? `#${rest.join('&')}` : '';
}
