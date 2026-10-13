/**
 * Class accounts and learning records (학급 계정 · 학습 기록), the browser side. The class server is
 * desktop-go/classroom (the simulator program started as 교사용 학급 서버); the design is
 * docs/reports/system/23-accounts-hybrid.md.
 *
 *  - types.ts   roles, class / student / session shapes, can() for role gating
 *  - client.ts  the class server API (fetch), finding the server, join links
 *  - session.ts keeping the login and the server address on this PC
 *  - events.ts  xAPI-shaped statements: verbs with their published purposes, object ids, builders
 *  - queue.ts   the offline event queue (batches, retry with backoff)
 *  - live.ts    the teacher's live grid from events (where, last seen, stuck / idle flags)
 *  - roster.ts  the teacher's 번호 ↔ 이름 list (never leaves the teacher's PC), login cards
 *  - pin.ts     PBKDF2 PIN / password hashes (the same format as the server)
 *  - lead.ts    a lesson the teacher leads: the shared step, students' marks, the rail's summary
 */

export * from './types';
export * from './client';
export * from './session';
export * from './events';
export * from './queue';
export * from './live';
export * from './roster';
export * from './pin';
export * from './profile';
export * from './lead';
