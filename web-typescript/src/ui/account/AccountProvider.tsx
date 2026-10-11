'use client';

/**
 * Class accounts in the app (docs/reports/system/23-accounts-hybrid.md, 10장): which mode the app is
 * in, who is logged in, and the student's learning-event queue. The engine (engine/account) does the
 * work; this holds it in React for the console's screens.
 *
 *  - Free mode (the default; demos, the simulator program, the robot console): no class server and no
 *    login. Everything works as before, nothing is recorded. A login stays reachable (gear menu).
 *  - Class mode: the page came from the class server (?from=class, its port), a join link
 *    (?server=…&class=…), a saved login, or a login on this PC not yet logged out. The 교육 tab asks
 *    for a login (학생: 학급 코드 + 번호 + PIN; 교사 · 운영자: 아이디 + 비밀번호); on a fresh server, the
 *    server PC itself shows the first-run setup.
 *  - A student's events go through EventQueue + autoFlush (never a teacher's: the server refuses them).
 *    A refused login (401) stops the queue until the student logs in again; practice never waits.
 *
 * useAccount() outside the provider (a figure page, a test) answers as free mode.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  CLASS_PORT,
  ClassApiError,
  ClassServerClient,
  EventQueue,
  autoFlush,
  browserStore,
  can as canDo,
  clearSession,
  events,
  joinParams,
  lessonObject,
  lessonOpen as lessonOpenFor,
  loadSession,
  profileOf,
  readHandoff,
  queueKeyFor,
  resolveServer,
  robotObject,
  saveSession,
  savedServerAddress,
  switchProfile,
  withoutHandoff,
  siteObject,
  type Action,
  type Role,
  type ServerStatus,
  type Session,
  type Statement,
} from '@/engine/account';
import { RUN_LOG_KEY, type RunLogEvent } from '@/engine/education/runLog';

import LoginDialog from './LoginDialog';

/** Set while someone on this PC is logged in to a class server (an explicit logout clears it). */
const CLASS_MODE_KEY = 'class-mode';
/** The real robot of the 교육 screens (myCobot 280 RDK X5). */
export const REAL_ROBOT = 'mycobot280-rdkx5';

export type ServerState = 'idle' | 'checking' | 'found' | 'none';

/** The student's queue as the top bar shows it. */
export interface SyncState {
  pending: number;
  /** Sends are failing (the server or the network is down): they wait and retry. */
  offline: boolean;
  /** The server refused the login: log in again, then sending goes on. */
  authNeeded: boolean;
}

export interface LoginAsk {
  /** 'relogin': the server refused the saved login; 'setup': first run on the server PC. */
  reason?: 'relogin' | 'menu';
  tab?: 'student' | 'teacher';
}

export interface Account {
  /** The page is used with a class server (see the head comment). */
  classMode: boolean;
  /** The class server's address ("http://host:port"), once found. */
  server: string | null;
  serverState: ServerState;
  status: ServerStatus | null;
  session: Session | null;
  role: Role | null;
  can(action: Action): boolean;
  /** May the 차시 be opened (students: only those the teacher opened)? */
  lessonOpen(id: string): boolean;
  /**
   * Whose progress the 교육 screens show (a student's own, or the PC's: profile.ts); null while it is
   * being switched. The 교육 screens are mounted per learner (keyed on this), so they re-read it.
   */
  learner: string | null;
  /** Record a learning event (students only; anything else is a no-op). Builders that throw are ignored. */
  track(make: () => Statement): void;
  /** The server refused the login (expired, or the teacher ended the class's sessions). */
  authLost: boolean;
  /** From a join link (?class=…): fills in the 학급 코드. */
  joinCode: string | null;
  /** Opened as the teacher's window (?role=teacher): the login opens on the teacher tab. */
  preferTeacher: boolean;
  /** Look for the class server (at `address`, or where it was found before). */
  findServer(address?: string | null): Promise<string | null>;
  /** A login (or the first-run setup) went through. */
  signedIn(s: Session): void;
  logout(): Promise<void>;
  /** The student's class again (lessons the teacher opened); returns its open lessons. */
  refreshClass(): Promise<string[] | null>;
  /** The server answered 401 to a teacher's call: ask to log in again. */
  loginLost(): void;
  client(): ClassServerClient | null;
  login: LoginAsk | null;
  openLogin(ask?: LoginAsk): void;
  closeLogin(): void;
  dashboard: boolean;
  openDashboard(): void;
  closeDashboard(): void;
}

const noop = () => {};

const FREE: Account = {
  classMode: false,
  server: null,
  serverState: 'idle',
  status: null,
  session: null,
  role: null,
  can: (a) => canDo(null, a),
  lessonOpen: () => true,
  learner: 'free',
  track: noop,
  authLost: false,
  joinCode: null,
  preferTeacher: false,
  findServer: async () => null,
  signedIn: noop,
  logout: async () => {},
  refreshClass: async () => null,
  loginLost: noop,
  client: () => null,
  login: null,
  openLogin: noop,
  closeLogin: noop,
  dashboard: false,
  openDashboard: noop,
  closeDashboard: noop,
};

const AccountContext = createContext<Account>(FREE);

export function useAccount(): Account {
  return useContext(AccountContext);
}

const SyncContext = createContext<SyncState | null>(null);

/** A student's records on their way to the class server (null: not a student). */
export function useAccountSync(): SyncState | null {
  return useContext(SyncContext);
}

interface Boot {
  classMode: boolean;
  /** The page itself may be the class server. */
  pageOrigin: string | null;
  joinServer: string | null;
  joinCode: string | null;
  preferTeacher: boolean;
}

const sameSync = (a: SyncState | null, b: SyncState | null) => a === b || (!!a && !!b && a.pending === b.pending && a.offline === b.offline && a.authNeeded === b.authNeeded);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [server, setServer] = useState<string | null>(null);
  const [serverState, setServerState] = useState<ServerState>('idle');
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [authLost, setAuthLost] = useState(false);
  const [reachable, setReachable] = useState(true);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [login, setLogin] = useState<LoginAsk | null>(null);
  const [dashboard, setDashboard] = useState(false);
  /** Logged in on this PC this time (keeps class mode after the login runs out). */
  const [loggedHere, setLoggedHere] = useState(false);
  const queue = useRef<EventQueue | null>(null);

  const findServer = useCallback(async (address?: string | null, page?: string | null) => {
    setServerState('checking');
    const base = await resolveServer({ pageOrigin: page ?? null, saved: address ?? savedServerAddress(browserStore()) });
    setServer(base);
    setServerState(base ? 'found' : 'none');
    setStatus(null);
    if (base) {
      try {
        setStatus(await new ClassServerClient(base).status());
      } catch {
        /* answered the probe a moment ago; the status shows on the next look */
      }
    }
    return base;
  }, []);

  // What the page was opened as (read after hydration: the page is a static export).
  useEffect(() => {
    const store = browserStore();
    const q = new URLSearchParams(window.location.search);
    const join = joinParams(window.location.search);
    // A login handed over by the page this one came from (connecting to a robot opens its own page):
    // keep it here and take it out of the address straight away.
    const handed = readHandoff(window.location.hash, Date.now());
    if (window.location.hash.includes('class=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + withoutHandoff(window.location.hash));
    }
    if (handed) {
      saveSession(store, handed);
      try {
        store?.setItem(CLASS_MODE_KEY, '1');
      } catch {
        /* this tab only */
      }
    }
    const saved = loadSession(store, Date.now());
    const servedHere = q.get('from') === 'class' || window.location.port === String(CLASS_PORT);
    const wanted = store?.getItem(CLASS_MODE_KEY) === '1';
    const b: Boot = {
      classMode: servedHere || !!join.server || !!saved || wanted,
      pageOrigin: servedHere ? window.location.origin : null,
      joinServer: join.server,
      joinCode: join.classCode,
      preferTeacher: q.get('role') === 'teacher',
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoot(b);
    setSession(saved);
    if (b.classMode) void findServer(join.server ?? saved?.baseUrl ?? null, b.pageOrigin);
  }, [findServer]);

  // A saved login: is it still good? (401: log in again; offline: keep working, it is checked later.)
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (!session || checked.current === session.token) return;
    checked.current = session.token;
    const c = ClassServerClient.forSession(session);
    c.me().then(
      () => setReachable(true),
      (e) => {
        if (e instanceof ClassApiError && e.status === 401) setAuthLost(true);
        else setReachable(false);
      },
    );
  }, [session]);

  const signedIn = useCallback((s: Session) => {
    const store = browserStore();
    saveSession(store, s);
    try {
      store?.setItem(CLASS_MODE_KEY, '1');
    } catch {
      /* this tab only */
    }
    checked.current = s.token;
    setSession(s);
    setServer(s.baseUrl);
    setServerState('found');
    setAuthLost(false);
    setReachable(true);
    setLoggedHere(true);
    queue.current?.resume();
  }, []);

  const refreshClass = useCallback(async () => {
    if (session?.role !== 'student') return null;
    try {
      const cls = await ClassServerClient.forSession(session).myClass();
      setReachable(true);
      const same = cls.openLessons.length === session.class.openLessons.length && cls.openLessons.every((x, i) => x === session.class.openLessons[i]);
      if (!same || cls.name !== session.class.name) {
        const next: Session = { ...session, class: { ...session.class, ...cls } };
        saveSession(browserStore(), next);
        setSession(next);
      }
      return cls.openLessons;
    } catch (e) {
      if (e instanceof ClassApiError && e.status === 401) setAuthLost(true);
      else setReachable(false);
      return null;
    }
  }, [session]);

  // A student's queue: kept on this PC per student, sent every 3 s, retried with backoff.
  const studentKey = session?.role === 'student' ? `${session.baseUrl}|${session.token}|${queueKeyFor(session.student)}` : null;
  const studentSession = session?.role === 'student' ? session : null;
  const sessionRef = useRef(studentSession);
  useEffect(() => {
    sessionRef.current = studentSession;
  });
  useEffect(() => {
    const s = sessionRef.current;
    if (!studentKey || !s) {
      queue.current = null;
      return;
    }
    const q = new EventQueue({ key: queueKeyFor(s.student), store: browserStore(), send: ClassServerClient.forSession(s).sender() });
    q.resume();
    queue.current = q;
    const stop = autoFlush(q, { intervalMs: 3000 });
    const online = () => {
      q.resume();
      void q.flush();
    };
    window.addEventListener('online', online);
    const look = () => {
      const st = q.state();
      const next: SyncState = { pending: st.pending, offline: st.failures > 0, authNeeded: st.authNeeded };
      setSync((p) => (sameSync(p, next) ? p : next));
      if (st.authNeeded) setAuthLost(true);
    };
    look();
    const id = window.setInterval(look, 1500);
    return () => {
      stop();
      window.removeEventListener('online', online);
      window.clearInterval(id);
      if (queue.current === q) queue.current = null;
      setSync(null);
    };
  }, [studentKey]);

  // The student's class every 15 s (the lessons the teacher opens; also tells the teacher's grid this PC is on).
  useEffect(() => {
    if (!studentKey) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fetch; its answer sets the state
    void refreshClass();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshClass();
    }, 15000);
    const focus = () => void refreshClass();
    window.addEventListener('focus', focus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', focus);
    };
  }, [studentKey, refreshClass]);

  const isStudent = session?.role === 'student';
  const track = useCallback(
    (make: () => Statement) => {
      if (!isStudent || !queue.current) return;
      try {
        queue.current.push(make());
      } catch {
        /* a malformed object id (a programming slip): nothing is recorded */
      }
    },
    [isStudent],
  );

  // Site-lab runs: every run the labs log (engine/education/runLog) is a learning event too.
  useEffect(() => {
    if (!isStudent) return;
    const on = (e: Event) => {
      const r = (e as RunLogEvent).detail;
      if (!r || typeof r.lab !== 'string') return;
      if (r.source === 'robot') track(() => events.operated(siteObject(r.lab, r.problem), REAL_ROBOT));
      else track(() => events.problemResult(r.lab, r.problem, r.pass, { durationS: Number.isFinite(r.durationS) ? r.durationS : undefined, values: r.values }));
    };
    window.addEventListener(RUN_LOG_KEY, on);
    return () => window.removeEventListener(RUN_LOG_KEY, on);
  }, [isStudent, track]);

  // The login was refused: ask once, calmly (practice goes on; the queue keeps what happens meanwhile).
  const asked = useRef(false);
  useEffect(() => {
    if (!authLost) {
      asked.current = false;
      return;
    }
    if (asked.current) return;
    asked.current = true;
    setLogin({ reason: 'relogin', tab: session?.role === 'student' ? 'student' : 'teacher' });
  }, [authLost, session?.role]);

  const logout = useCallback(async () => {
    const s = session;
    // A student's last events: one quick try to send them (what is left waits for the next login).
    const q = queue.current;
    if (q && q.pending() > 0) await Promise.race([q.flush(), new Promise((ok) => window.setTimeout(ok, 2000))]);
    const store = browserStore();
    clearSession(store);
    try {
      store?.removeItem?.(CLASS_MODE_KEY);
    } catch {
      /* nothing kept */
    }
    setSession(null);
    setDashboard(false);
    setAuthLost(false);
    setLoggedHere(false);
    if (s) await ClassServerClient.forSession(s).logout().catch(() => {});
  }, [session]);

  const role = session?.role ?? null;
  // A student's own progress on a shared PC: switch the learner keys when the student changes.
  const profile = boot ? profileOf(session) : null;
  const [learnerNow, setLearnerNow] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    try {
      if (typeof localStorage !== 'undefined') switchProfile(localStorage, profile);
    } catch {
      /* storage blocked: nothing kept anyway */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLearnerNow(profile);
  }, [profile]);
  const learner = learnerNow !== null && learnerNow === profile ? learnerNow : null;
  const classMode = !!boot?.classMode || !!session || loggedHere;
  // Stable functions: the 교육 screens depend on them (a new one each render would re-render the lessons).
  const can = useCallback((a: Action) => canDo(role, a), [role]);
  const lessonOpen = useCallback((id: string) => lessonOpenFor(session, id), [session]);
  const joinServer = boot?.joinServer ?? null;
  const pageOrigin = boot?.pageOrigin ?? null;
  const sessionBase = session?.baseUrl ?? null;
  const findServerHere = useCallback((address?: string | null) => findServer(address ?? joinServer ?? sessionBase, pageOrigin), [findServer, joinServer, sessionBase, pageOrigin]);
  const loginLost = useCallback(() => setAuthLost(true), []);
  const client = useCallback(() => (session ? ClassServerClient.forSession(session) : null), [session]);
  const openLogin = useCallback((ask?: LoginAsk) => setLogin(ask ?? {}), []);
  const closeLogin = useCallback(() => setLogin(null), []);
  const openDashboard = useCallback(() => setDashboard(true), []);
  const closeDashboard = useCallback(() => setDashboard(false), []);
  const value = useMemo<Account>(
    () => ({
      classMode,
      server,
      serverState,
      status,
      session,
      role,
      can,
      lessonOpen,
      learner,
      track,
      authLost,
      joinCode: boot?.joinCode ?? null,
      preferTeacher: !!boot?.preferTeacher,
      findServer: findServerHere,
      signedIn,
      logout,
      refreshClass,
      loginLost,
      client,
      login,
      openLogin,
      closeLogin,
      dashboard,
      openDashboard,
      closeDashboard,
    }),
    [classMode, server, serverState, status, session, role, can, lessonOpen, learner, track, authLost, boot, findServerHere, signedIn, logout, refreshClass, loginLost, client, login, openLogin, closeLogin, dashboard, openDashboard, closeDashboard],
  );
  // The queue's state changes often: its own context, read by the top bar only.
  const syncValue = useMemo(() => (sync ? { ...sync, offline: sync.offline || (!reachable && sync.pending > 0) } : null), [sync, reachable]);

  return (
    <AccountContext.Provider value={value}>
      <SyncContext.Provider value={syncValue}>
        {children}
        {login && <LoginDialog ask={login} />}
      </SyncContext.Provider>
    </AccountContext.Provider>
  );
}

/** The 실물 연동 event: the real arm moved with the screen (a lesson, or a site lab's problem). */
export function operatedObject(place: { lesson?: string; lab?: string; problem?: number }): string {
  if (place.lab && place.problem) return siteObject(place.lab, place.problem);
  if (place.lesson) return lessonObject(place.lesson);
  return robotObject(REAL_ROBOT);
}
