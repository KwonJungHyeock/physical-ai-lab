/**
 * Accounts and roles for the classroom (교실 학급 서버 + 클라우드, docs/reports/system/23-accounts-hybrid.md).
 *
 *  - 운영자 (operator, our company): everything, every class, issues teacher accounts, cloud sync.
 *  - 교사/관리자 (teacher): own classes — students, PIN cards, open lessons, live grid, export, archive.
 *  - 수강생 (student): logs in with 학급 코드 + 번호 + 4-digit PIN; sends only own learning events.
 *
 * The class server (desktop-go/classroom) is the authority; these types mirror its JSON. `can()` is for
 * the UI's role gating only (hide what a role cannot use) — the server checks every call itself.
 * No React, no DOM.
 */

export type Role = 'operator' | 'teacher' | 'student';

/** A student's pseudonymous id: the class code and the 번호. No name, ever. */
export interface StudentId {
  classId: string;
  classCode: string;
  no: number;
}

/** The xAPI actor the server writes for a student (homePage = the class server, name = "<code>-<no>"). */
export interface XapiAgent {
  objectType: 'Agent';
  account: { homePage: string; name: string };
}

export interface UserInfo {
  id: string;
  username: string;
  role: Exclude<Role, 'student'>;
  disabled: boolean;
  createdAt: number;
}

/** A class as the server shows it to its teacher / the operator (no PIN hashes). */
export interface ClassInfo {
  id: string;
  /** 6 characters, no look-alike letters, e.g. "K7M4QX". */
  code: string;
  /** The teacher's label, e.g. "2학년 3반" (never sent to the cloud; no student names here). */
  name: string;
  ownerId: string;
  createdAt: number;
  archived: boolean;
  /** Lessons (차시 · 현장 ids) students may open; ["*"] = all. */
  openLessons: string[];
  /** The students' 번호. */
  students: number[];
  /** Events received so far (the last sequence number). */
  events: number;
}

/** What a logged-in student is told about the class. */
export interface StudentClass {
  code: string;
  name: string;
  openLessons: string[];
}

/** A login, as kept by the client (the token is the only secret; it is never logged). */
export type Session =
  | { role: 'student'; token: string; expiresAt: number; baseUrl: string; student: StudentId & { actor: XapiAgent }; class: StudentClass }
  | { role: 'teacher' | 'operator'; token: string; expiresAt: number; baseUrl: string; user: UserInfo };

/** A newly issued student: 번호 and PIN, shown once (print the cards then). */
export interface IssuedStudent {
  no: number;
  pin: string;
}

/** Things a screen may offer. */
export type Action =
  | 'learn' // use the lessons and labs
  | 'sendEvents'
  | 'seeTeacherContent' // answers, "선생님이 물어볼 것", teacher's plan
  | 'manageClasses' // create classes, issue students, reset PINs, open/close lessons
  | 'seeLive'
  | 'export'
  | 'archive'
  | 'manageTeachers'
  | 'seeAllClasses'
  | 'configureSync';

const ALLOWED: Readonly<Record<Role, readonly Action[]>> = {
  student: ['learn', 'sendEvents'],
  teacher: ['learn', 'seeTeacherContent', 'manageClasses', 'seeLive', 'export', 'archive'],
  operator: ['learn', 'seeTeacherContent', 'manageClasses', 'seeLive', 'export', 'archive', 'manageTeachers', 'seeAllClasses', 'configureSync'],
};

/** May this role use this action? (null role = not logged in: only learning, nothing recorded.) */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return action === 'learn';
  return ALLOWED[role].includes(action);
}

/** Is a lesson open for the class? Teachers and operators can open everything. */
export function lessonOpen(session: Session | null, lessonId: string): boolean {
  if (!session) return true; // no class: the app works as before
  if (session.role !== 'student') return true;
  const open = session.class.openLessons;
  return open.includes('*') || open.includes(lessonId);
}

/** Has the session run out (with a minute's margin)? */
export function sessionExpired(session: Pick<Session, 'expiresAt'>, now: number): boolean {
  return now >= session.expiresAt - 60_000;
}
