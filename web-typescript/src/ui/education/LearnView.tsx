'use client';

/**
 * 교육 tab: a robotics course of 8 단원 and 28 차시 (engine/education/catalog.ts, written in
 * content-markdown/*.md). It opens on the course home (roadmap/Course: where to go on, the roadmap
 * and the 단원 in their three 대단원, fitted to the school's equipment, with a 단원 preview); a 차시 is one
 * lesson screen — the step bar on top (lesson/LessonBar), the lesson in one column on the left
 * (lesson/LessonRail: what to read, pick, move and see, the topic's controls inside) and the 3D view.
 * The 교육 tab opens on the 로봇 시티 (map/ParkView): the 로봇 아카데미 (the 1학문 차시, and 전체 차시 for
 * the whole course), seven theme places with their problem-solving labs (lab/*Lab), and the 관제센터
 * (data/DataCenter) over every lab run. A lesson's 정리 card links to the places that use its 학문.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TOPIC_BY_ID, TOPICS, lessonNo, nextTopicOf, type StepKey, type TopicId } from '@/engine/education/catalog';
import { DEFAULT_OWNED, PRODUCTS, type ProductId, type StudyLevel } from '@/engine/education/roadmap';
import { SITE_BY_ID, labLocks, nextStep, type LabId, type ProblemNo, type SiteId } from '@/engine/education/park';
import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { workspaceProfile, type WorkspaceProfile } from '@/engine/physics/workspace';

import LearnStage, { type LearnScene } from './stage/LearnStage';
import { HOME_POSE, type Mm, type RealArm } from './lessons';
import { SymbolsProvider } from './lesson/Rich';
import Course from './roadmap/Course';
import FactoryLab from './lab/FactoryLab';
import BioLab from './lab/BioLab';
import FarmLab from './lab/FarmLab';
import CafeLab from './lab/CafeLab';
import AiLab from './lab/AiLab';
import EnergyLab from './lab/EnergyLab';
import DataCenter from './data/DataCenter';
import FinalExam from './lab/FinalExam';
import LogisticsLab from './lab/LogisticsLab';
import { LabGateContext, type LabGate } from './lab/SiteFlow';
import Practice7 from './practice7/Practice7';
import { LeadEnded, LeadInvite, LeadJoin } from './lead/LeadDialogs';
import { useStudentLead } from './lead/useLead';
import ParkView from './map/ParkView';
import { FollowBar, FollowContext, useRealFollow } from './stage/RealFollow';
import LessonBar from './lesson/LessonBar';
import { PAGES, isActivity, type Onward, type PageId, type ResumeSpot } from './lesson/LessonCards';
import LessonRail from './lesson/LessonRail';
import { TOPIC_PANELS } from './topics';
import { TCP } from './topics/kit';
import type { ResultRow, StepView } from './topics/types';
import type { RunLab } from '@/engine/education/runLog';
import { events, lessonObject } from '@/engine/account';
import { REAL_ROBOT, operatedObject, useAccount } from '../account/AccountProvider';
import LessonLocked from '../account/LessonLocked';
import css from './learn.module.css';

const TOPIC_KEY = 'learn-topic';
const DONE_KEY = 'learn-done';
const MISSION_KEY = 'learn-missions';
const OWNED_KEY = 'learn-owned';
const LEVEL_KEY = 'learn-level';
const RESUME_KEY = 'learn-resume';
/** Each 차시's activity results (활동 1 · 2 · 3), as recorded. */
const RESULTS_KEY = 'learn-results';
const LAB_KEY = 'lab-solved';
const LOGI_KEY = 'lab-solved-logistics';
const BIO_KEY = 'lab-solved-bio';
const FARM_KEY = 'lab-solved-farm';
const CAFE_KEY = 'lab-solved-cafe';
const AI_KEY = 'lab-solved-ai';
const ENERGY_KEY = 'lab-solved-energy';
const ALL_OPEN_KEY = 'park-all-open';
const FIRST: TopicId = TOPICS[0].id;
const KEYS_ABC: readonly StepKey[] = ['A', 'B', 'C'];
/** Stable "no results yet" (a fresh {} each render would re-render the memoised panel). */
const NO_RESULTS: Partial<Record<StepKey, ResultRow>> = {};

// Memoised: a topic's own scene update re-renders this view, not the topic again.
const PANELS = Object.fromEntries(Object.entries(TOPIC_PANELS).map(([k, c]) => [k, memo(c)])) as unknown as typeof TOPIC_PANELS;

interface Props {
  robot: UrdfRobot;
  chain: readonly ChainSegment[];
  gripperRobot: UrdfRobot | null;
  real: RealArm;
  hidden?: boolean;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window: not remembered */
  }
}

declare global {
  interface Window {
    /** A table click at mm (base frame), when the open try asks for one. */
    __learnPick?: (mm: Mm) => void;
    /** Open a 차시 at a step (tools/check/learn-sim.mjs and the guide screenshots). */
    __learnOpen?: (id: TopicId, page?: PageId) => void;
    /** Open 문제 해결 실습 (시범). */
    __learnLab?: () => void;
    /** Open the 물류 센터 lab. */
    __learnLogi?: () => void;
    __learnBio?: () => void;
    __learnFarm?: () => void;
    __learnCafe?: () => void;
    __learnAi?: () => void;
    __learnEnergy?: () => void;
    __learnFinal?: () => void;
    /** Open 로봇 실습 7 (tools/check/text-lines.mjs). */
    __learnP7?: () => void;
  }
}

/** The controls' activity for a lesson step (도입 · 개념 show activity 1's scene; 평가 keeps the last one). */
const stepFor = (p: PageId, cur: StepView): StepView => (isActivity(p) || p === 'cmp' ? p : p === 'check' ? cur : 'A');

/** The site-lab screens, by the lab each shows (실물 연동 asks that lab whether to follow). */
const FOLLOW_LAB: Partial<Record<string, RunLab>> = { lab: 'factory', logistics: 'logistics', bio: 'bio', farm: 'farm', cafe: 'cafe', ai: 'ai', energy: 'energy' };

/** The screens of the 교육 tab. */
type Screen = 'map' | 'course' | 'topic' | 'lab' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'ai' | 'energy' | 'data' | 'final' | 'p7';

export default function LearnView({ robot, chain, gripperRobot, real, hidden }: Props) {
  /** Class accounts: a student's events, and the 차시 the teacher opened (free mode: all, nothing recorded). */
  const account = useAccount();
  const { track, lessonOpen } = account;
  const student = account.role === 'student';
  /** A lesson the teacher leads (로봇 실습 7 "선생님과 함께"): a student is invited, joins, and follows it there. */
  const clientOf = account.client;
  const leadClient = useMemo(() => (student ? clientOf() : null), [student, clientOf]);
  const studentLead = useStudentLead(leadClient);
  const [joinOpen, setJoinOpen] = useState(false);
  const studentNo = account.session?.role === 'student' ? account.session.student.no : null;
  /** A 차시 a student tried to open before the teacher opened it. */
  const [locked, setLocked] = useState<TopicId | null>(null);
  const [topicId, setTopicId] = useState<TopicId>(FIRST);
  /** The park (front page), the course, a lesson, or the problem-solving lab (opened once, then kept). */
  const [screen, setScreen] = useState<Screen>('map');
  const screenNow = useRef<Screen>('map');
  useEffect(() => {
    screenNow.current = screen;
  });
  /** 로봇 실습 7 mounts on first use (its own 3D view). */
  const [p7Seen, setP7Seen] = useState(false);
  /** 대단원 마무리 평가: mounted the first time it is opened. */
  const [finalSeen, setFinalSeen] = useState(false);
  const openFinal = useCallback(() => {
    setFinalSeen(true);
    setScreen('final');
  }, []);
  const [logiSeen, setLogiSeen] = useState(false);
  const [bioSeen, setBioSeen] = useState(false);
  const [farmSeen, setFarmSeen] = useState(false);
  const [cafeSeen, setCafeSeen] = useState(false);
  const [aiSeen, setAiSeen] = useState(false);
  const [energySeen, setEnergySeen] = useState(false);
  const [dataSeen, setDataSeen] = useState(false);
  /** A place to open on the map (a lesson's 이 원리를 쓰는 현장). */
  const [mapPick, setMapPick] = useState<{ id: SiteId; n: number } | null>(null);
  const openData = useCallback(() => {
    setDataSeen(true);
    setScreen('data');
  }, []);
  const toSite = useCallback((id: SiteId) => {
    setMapPick((p) => ({ id, n: (p?.n ?? 0) + 1 }));
    setScreen('map');
  }, []);
  /** 모든 현장 열기 (the teacher's switch on the map): every site and problem open. */
  const [allOpen, setAllOpenRaw] = useState(false);
  useEffect(() => {
    // Read after hydration (the page is a static export).
    const v = readJson<unknown>(ALL_OPEN_KEY, false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAllOpenRaw(v === true || v === 1);
  }, []);
  const setAllOpen = useCallback((on: boolean) => {
    setAllOpenRaw(on);
    writeJson(ALL_OPEN_KEY, on);
  }, []);
  /** Where a lesson goes back to: the page it was opened from (the map, 전체 차시, or a site lab's '배우러 가기'). */
  const [lessonFrom, setLessonFrom] = useState<Screen>('course');
  /** Where a site lab goes back to: the map, or 관제센터 when it was opened from there. */
  const [labFrom, setLabFrom] = useState<'map' | 'data'>('map');
  /** The lab's problems solved so far (1 · 2 · 3), kept between visits. */
  const [labSolved, setLabSolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onLabSolved = useCallback((p: 1 | 2 | 3) => {
    setLabSolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(LAB_KEY, next);
      return next;
    });
  }, []);
  const [logiSolved, setLogiSolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onLogiSolved = useCallback((p: 1 | 2 | 3) => {
    setLogiSolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(LOGI_KEY, next);
      return next;
    });
  }, []);
  const [bioSolved, setBioSolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onBioSolved = useCallback((p: 1 | 2 | 3) => {
    setBioSolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(BIO_KEY, next);
      return next;
    });
  }, []);
  const [farmSolved, setFarmSolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onFarmSolved = useCallback((p: 1 | 2 | 3) => {
    setFarmSolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(FARM_KEY, next);
      return next;
    });
  }, []);
  const [cafeSolved, setCafeSolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onCafeSolved = useCallback((p: 1 | 2 | 3) => {
    setCafeSolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(CAFE_KEY, next);
      return next;
    });
  }, []);
  const [aiSolved, setAiSolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onAiSolved = useCallback((p: 1 | 2 | 3) => {
    setAiSolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(AI_KEY, next);
      return next;
    });
  }, []);
  const [energySolved, setEnergySolved] = useState<Partial<Record<1 | 2 | 3, boolean>>>({});
  const onEnergySolved = useCallback((p: 1 | 2 | 3) => {
    setEnergySolved((x) => {
      if (x[p]) return x;
      const next = { ...x, [p]: true };
      writeJson(ENERGY_KEY, next);
      return next;
    });
  }, []);
  const [labSeen, setLabSeen] = useState(false);
  const openLab = useCallback(() => {
    setLabSeen(true);
    setScreen('lab');
  }, []);
  /** The problem a lab opens at when entered for it (the map's next step). */
  const [labStart, setLabStart] = useState<LabGate['start']>(null);
  const openSiteLab = useCallback((lab: LabId, prob?: ProblemNo) => {
    setLabFrom(screenNow.current === 'data' ? 'data' : 'map');
    if (prob) setLabStart((x) => ({ lab, prob, n: (x?.n ?? 0) + 1 }));
    if (lab === 'logistics') {
      setLogiSeen(true);
      setScreen('logistics');
    } else if (lab === 'bio') {
      setBioSeen(true);
      setScreen('bio');
    } else if (lab === 'farm') {
      setFarmSeen(true);
      setScreen('farm');
    } else if (lab === 'cafe') {
      setCafeSeen(true);
      setScreen('cafe');
    } else if (lab === 'ai') {
      setAiSeen(true);
      setScreen('ai');
    } else if (lab === 'energy') {
      setEnergySeen(true);
      setScreen('energy');
    } else {
      setLabSeen(true);
      setScreen('lab');
    }
  }, []);
  const [owned, setOwnedRaw] = useState<readonly ProductId[]>(DEFAULT_OWNED);
  const setOwned = (p: readonly ProductId[]) => {
    const next = p.includes('sim') ? p : [...p, 'sim' as const];
    setOwnedRaw(next);
    writeJson(OWNED_KEY, next);
  };
  const [level, setLevelRaw] = useState<StudyLevel>('hs');
  const setLevel = (l: StudyLevel) => {
    setLevelRaw(l);
    writeJson(LEVEL_KEY, l);
  };
  /** Where to come back to (the home's 이어서 수업하기). */
  const [resume, setResume] = useState<ResumeSpot | null>(null);
  const [step, setStep] = useState<StepView>('A');
  const [page, setPageRaw] = useState<PageId>('intro');
  const setPage = useCallback(
    (p: PageId) => {
      setPageRaw(p);
      setStep((s) => stepFor(p, s));
      const spot = { topic: topicId, page: p };
      setResume(spot);
      writeJson(RESUME_KEY, spot);
    },
    [topicId],
  );
  // The topic panels move on by themselves (e.g. after a try is done): their step is a page here.
  const goStep = useCallback((s: StepView) => setPage(s), [setPage]);
  const [done, setDone] = useState<Partial<Record<TopicId, boolean>>>({});
  const [missions, setMissions] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Partial<Record<TopicId, Partial<Record<StepKey, ResultRow>>>>>({});
  useEffect(() => {
    const t = readJson<string>(TOPIC_KEY, FIRST);
    // Read after hydration (the page is a static export).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TOPIC_BY_ID.has(t as TopicId)) setTopicId(t as TopicId);
    // Progress kept under an id this curriculum no longer has is dropped.
    setDone(Object.fromEntries(Object.entries(readJson<Record<string, boolean>>(DONE_KEY, {})).filter(([k]) => TOPIC_BY_ID.has(k as TopicId))));
    setResults(Object.fromEntries(Object.entries(readJson<Record<string, Partial<Record<StepKey, ResultRow>>>>(RESULTS_KEY, {})).filter(([k]) => TOPIC_BY_ID.has(k as TopicId))));
    const o = readJson<string[]>(OWNED_KEY, [...DEFAULT_OWNED]).filter((p) => PRODUCTS.some((x) => x.id === p)) as ProductId[];
    setOwnedRaw(o);
    if (readJson<string>(LEVEL_KEY, 'hs') === 'uni') setLevelRaw('uni');
    setMissions(readJson(MISSION_KEY, {}));
    setLabSolved(readJson(LAB_KEY, {}));
    setLogiSolved(readJson(LOGI_KEY, {}));
    setBioSolved(readJson(BIO_KEY, {}));
    setFarmSolved(readJson(FARM_KEY, {}));
    setCafeSolved(readJson(CAFE_KEY, {}));
    setAiSolved(readJson(AI_KEY, {}));
    setEnergySolved(readJson(ENERGY_KEY, {}));
    const r = readJson<Partial<ResumeSpot> | null>(RESUME_KEY, null);
    if (r && TOPIC_BY_ID.has(r.topic as TopicId) && PAGES.includes(r.page as PageId)) setResume({ topic: r.topic as TopicId, page: r.page as PageId });
  }, []);
  /** The 차시 on screen as last started (a jump to another of its pages is not a new start). */
  const started = useRef<TopicId | null>(null);
  useEffect(() => {
    if (screen !== 'topic') started.current = null;
  }, [screen]);
  /** Open a 차시 at a step (its first by default). */
  const openLesson = useCallback((t: TopicId, at: PageId = 'intro') => {
    if (started.current !== t) {
      started.current = t;
      track(() => events.lessonStarted(t));
    }
    setTopicId(t);
    setStep(stepFor(at, 'A'));
    setPageRaw(at);
    setScreen('topic');
    writeJson(TOPIC_KEY, t);
    const spot = { topic: t, page: at };
    setResume(spot);
    writeJson(RESUME_KEY, spot);
  }, [track]);
  /** The same, unless the teacher has not opened the 차시 yet (students in class mode): then say so. */
  const choose = useCallback(
    (t: TopicId, at: PageId = 'intro') => {
      if (lessonOpen(t)) openLesson(t, at);
      else setLocked(t);
    },
    [lessonOpen, openLesson],
  );
  const markDone = useCallback((t: TopicId) => {
    setDone((d) => {
      if (d[t]) return d;
      const next = { ...d, [t]: true };
      writeJson(DONE_KEY, next);
      return next;
    });
  }, []);
  const complete = useCallback((key: string) => {
    setMissions((m) => {
      if (m[key]) return m;
      const next = { ...m, [key]: true };
      writeJson(MISSION_KEY, next);
      return next;
    });
  }, []);
  const resultsNow = useRef(results);
  useEffect(() => {
    resultsNow.current = results;
  });
  const record = useCallback(
    (s: StepKey, row: ResultRow) => {
      // An activity's result is in: a learning event (students in class mode), and the 차시 when all three are.
      const before = resultsNow.current[topicId];
      if (!before?.[s]) {
        track(() => events.completed(lessonObject(topicId, s)));
        if (KEYS_ABC.every((k) => k === s || before?.[k])) track(() => events.completed(lessonObject(topicId)));
      }
      setResults((r) => {
        const cur = { ...r[topicId], [s]: row };
        if (cur.A && cur.B && cur.C) markDone(topicId);
        const next = { ...r, [topicId]: cur };
        // Kept like the 차시 done: a reload (or the next class) still shows the ✓ and the 정리 table.
        writeJson(RESULTS_KEY, next);
        return next;
      });
    },
    [topicId, markDone, track],
  );
  // The lesson page on screen (once per page: switching tabs back and forth is not a new visit).
  const lastPage = useRef('');
  useEffect(() => {
    if (hidden || screen !== 'topic') return;
    const at = `${topicId}:${page}`;
    if (lastPage.current === at) return;
    lastPage.current = at;
    track(() => events.pageOpened(topicId, page));
  }, [hidden, screen, topicId, page, track]);

  // The workspace takes a moment to sample (~250k poses): after the first paint.
  const [workspace, setWorkspace] = useState<WorkspaceProfile | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setWorkspace(workspaceProfile(chain, TCP)), 60);
    return () => window.clearTimeout(id);
  }, [chain]);
  // The arm's plane at J1 = 0: the way the tool moves when J2 turns (not the home tool's bearing —
  // the arm sits ~65 mm beside the base axis, which put the folded home pose ~45° off the plane),
  // pointed to the side the home tool is on.
  const frontDeg = useMemo(() => {
    const tip = (j2: number) => {
      const e = forwardKinematicsFrames(chain, [0, j2, HOME_POSE[2], HOME_POSE[3], 0, 0]).at(-1)!.elements;
      return [e[12], e[13]];
    };
    const [a, b, home] = [tip(HOME_POSE[1] - 15), tip(HOME_POSE[1] + 15), tip(HOME_POSE[1])];
    let [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    if (dx * home[0] + dy * home[1] < 0) [dx, dy] = [-dx, -dy];
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }, [chain]);

  const [scene, setScene] = useState<LearnScene>({ angles: HOME_POSE });
  const pick = useRef<((mm: Mm) => void) | null>(null);
  const [picking, setPicking] = useState(false);
  const onPick = useCallback((fn: ((mm: Mm) => void) | null) => {
    pick.current = fn;
    setPicking(!!fn);
  }, []);
  // The same as a click on the table at `mm` — for tools/check/learn-sim.mjs, which cannot aim at the 3D view.
  useEffect(() => {
    window.__learnPick = (mm: Mm) => pick.current?.(mm);
    window.__learnOpen = (id: TopicId, at?: PageId) => {
      if (TOPIC_BY_ID.has(id)) choose(id, at);
    };
    window.__learnLab = openLab;
    window.__learnLogi = () => openSiteLab('logistics');
    window.__learnBio = () => openSiteLab('bio');
    window.__learnFarm = () => openSiteLab('farm');
    window.__learnCafe = () => openSiteLab('cafe');
    window.__learnAi = () => openSiteLab('ai');
    window.__learnEnergy = () => openSiteLab('energy');
    window.__learnFinal = openFinal;
    window.__learnP7 = () => {
      setP7Seen(true);
      setScreen('p7');
    };
    return () => {
      delete window.__learnPick;
      delete window.__learnOpen;
      delete window.__learnLab;
      delete window.__learnLogi;
      delete window.__learnBio;
      delete window.__learnFarm;
      delete window.__learnCafe;
      delete window.__learnAi;
      delete window.__learnEnergy;
      delete window.__learnFinal;
      delete window.__learnP7;
    };
  }, [choose, openLab, openSiteLab, openFinal]);

  const fromMap = useCallback(
    (t: TopicId) => {
      setLessonFrom('map');
      // Back into the 차시 last left: on the page it was left at (as 전체 차시 does).
      choose(t, resume?.topic === t ? resume.page : 'intro');
    },
    [choose, resume],
  );
  /** A site lab's '배우러 가기': the 차시 it needs, and back to the lab from there. */
  const fromLab = useCallback(
    (t: TopicId) => {
      setLessonFrom(screenNow.current);
      choose(t);
    },
    [choose],
  );
  const fromCourse = useCallback(
    (t: TopicId, at?: PageId) => {
      setLessonFrom('course');
      choose(t, at);
    },
    [choose],
  );
  const progress = useMemo(
    () => ({ done, solved: { factory: labSolved, logistics: logiSolved, bio: bioSolved, farm: farmSolved, cafe: cafeSolved, ai: aiSolved, energy: energySolved } }),
    [done, labSolved, logiSolved, bioSolved, farmSolved, cafeSolved, aiSolved, energySolved],
  );

  const gate = useMemo<LabGate>(
    () => ({ locks: labLocks(progress, allOpen && !student), onLearn: fromLab, onMap: () => setScreen('map'), start: labStart }),
    [progress, allOpen, student, fromLab, labStart],
  );

  const topic = TOPIC_BY_ID.get(topicId)!;
  const Panel = PANELS[topicId];
  // After the 평가: where the course goes next once this 차시 counts as learnt — the site problem it opens, or the next 차시.
  const onward = useMemo<Onward | null>(() => {
    const n = nextStep({ ...progress, done: { ...progress.done, [topicId]: true } });
    if (n.kind === 'topic') {
      if (n.topic === topicId) return null;
      // An earlier 차시 still open (passed by with 건너뛰기) never sends the class backwards: go on in order.
      const ahead = lessonNo(n.topic) > lessonNo(topicId) ? TOPIC_BY_ID.get(n.topic)! : nextTopicOf(topicId);
      if (!ahead) return null;
      return { kicker: '다음 차시', title: `${ahead.id} ${ahead.title}`, go: () => choose(ahead.id) };
    }
    if (n.kind === 'lab') {
      const site = SITE_BY_ID.get(n.site)!;
      // The class may also go on with the theory first: the next 차시 as a small second way.
      const after = nextTopicOf(topicId);
      return {
        kicker: '배운 것을 현장에서',
        title: `${site.name} ${'①②③'[n.prob - 1]} ${site.problems[n.prob - 1].title}`,
        go: () => openSiteLab(n.lab, n.prob),
        alt: after ? { title: `${after.id} ${after.title}`, go: () => choose(after.id) } : undefined,
      };
    }
    return { kicker: '다음', title: '디지털 트윈 관제센터', go: openData };
  }, [progress, topicId, choose, openSiteLab, openData]);
  const inLesson = !hidden && screen === 'topic';
  // 실물 연동: a lesson, or the site lab on screen (it says itself when the arm may follow).
  const onFollow = useCallback(
    (place: string, prob: number | null) => track(() => events.operated(operatedObject(place === 'topic' ? { lesson: topicId } : { lab: place, problem: prob ?? undefined }), REAL_ROBOT)),
    [track, topicId],
  );
  const follow = useRealFollow(real, chain, hidden ? null : screen === 'topic' ? 'topic' : (FOLLOW_LAB[screen] ?? null), onFollow);
  // A lesson's own [실물로] buttons take the arm over from 실물 연동 first (they would fight over it).
  const { handOver } = follow;
  const lessonReal = useMemo<RealArm>(
    () => ({
      ...real,
      move: async (angles, speed) => {
        await handOver();
        return real.move(angles, speed);
      },
      run: async (actions) => {
        await handOver();
        return real.run(actions);
      },
    }),
    [real, handOver],
  );

  return (
    <LabGateContext.Provider value={gate}>
      <FollowContext.Provider value={follow.link}>
      <ParkView
        progress={progress}
        allOpen={allOpen && !student}
        onAllOpen={student ? undefined : setAllOpen}
        hidden={hidden || screen !== 'map'}
        onTopic={fromMap}
        onLab={openSiteLab}
        onCourse={() => setScreen('course')}
        onFinal={openFinal}
        onData={openData}
        onPractice={() => {
          setP7Seen(true);
          setScreen('p7');
        }}
        pick={mapPick}
      />
      {p7Seen && (
        <Practice7
          robot={robot}
          chain={chain}
          gripperRobot={gripperRobot}
          real={real}
          hidden={hidden || screen !== 'p7'}
          teacher={!student}
          studentLead={student ? studentLead : null}
          studentNo={studentNo}
          onBack={() => setScreen('map')}
        />
      )}
      {student && !hidden && studentLead.lead && !studentLead.joined && !joinOpen && <LeadInvite lead={studentLead.lead} onJoin={() => setJoinOpen(true)} />}
      {student && !hidden && studentLead.ended && <LeadEnded onClose={studentLead.dismissEnded} />}
      {joinOpen && studentLead.lead && (
        <LeadJoin
          robotOnline={real.online}
          onClose={() => setJoinOpen(false)}
          onJoin={async (j) => {
            const why = await studentLead.join(j);
            if (why) return why;
            setJoinOpen(false);
            setP7Seen(true);
            setScreen('p7');
            return null;
          }}
        />
      )}
      {dataSeen && <DataCenter hidden={hidden || screen !== 'data'} onBack={() => setScreen('map')} onOpenLab={(lab) => openSiteLab(lab)} />}
      {energySeen && (
        <EnergyLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'energy'} level={level} saved={energySolved} onSolved={onEnergySolved} onBack={() => setScreen(labFrom)} />
      )}
      {finalSeen && <FinalExam robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'final'} onBack={() => setScreen('map')} />}
      <Course
        hidden={hidden || screen !== 'course'}
        done={done}
        owned={owned}
        onOwned={setOwned}
        level={level}
        onLevel={setLevel}
        resume={resume}
        onStart={fromCourse}
        onLab={() => setScreen('map')}
      />
      {aiSeen && (
        <AiLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'ai'} level={level} saved={aiSolved} onSolved={onAiSolved} onBack={() => setScreen(labFrom)} />
      )}
      {cafeSeen && (
        <CafeLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'cafe'} level={level} saved={cafeSolved} onSolved={onCafeSolved} onBack={() => setScreen(labFrom)} />
      )}
      {farmSeen && (
        <FarmLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'farm'} level={level} saved={farmSolved} onSolved={onFarmSolved} onBack={() => setScreen(labFrom)} />
      )}
      {bioSeen && (
        <BioLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'bio'} level={level} saved={bioSolved} onSolved={onBioSolved} onBack={() => setScreen(labFrom)} />
      )}
      {logiSeen && (
        <LogisticsLab
          robot={robot}
          chain={chain}
          gripperRobot={gripperRobot}
          hidden={hidden || screen !== 'logistics'}
          level={level}
          saved={logiSolved}
          onSolved={onLogiSolved}
          onBack={() => setScreen(labFrom)}
        />
      )}
      {labSeen && (
        <FactoryLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'lab'} level={level} saved={labSolved} onSolved={onLabSolved} onBack={() => setScreen(labFrom)} />
      )}
      <SymbolsProvider symbols={topic.symbols}>
        <div className={css.learn} hidden={hidden || screen !== 'topic'}>
          <LessonBar topic={topic} page={page} onPage={setPage} results={results[topicId] ?? NO_RESULTS} passed={!!done[topicId]} level={level} backLabel={lessonFrom === 'course' ? '← 전체 차시' : lessonFrom === 'map' ? '← 지도' : '← 현장 실습'} onBack={() => setScreen(lessonFrom)} />
          <LessonRail
            key={topicId}
            topic={topic}
            page={page}
            onPage={setPage}
            results={results[topicId] ?? NO_RESULTS}
            onChecked={() => {
              if (!done[topicId]) track(() => events.completed(lessonObject(topicId)));
              markDone(topicId);
            }}
            level={level}
            onSite={toSite}
            onward={onward}
            passed={!!done[topicId]}
            controls={
              <Panel
                key={topicId}
                id={topicId}
                step={step}
                goStep={goStep}
                record={record}
                results={results[topicId] ?? NO_RESULTS}
                chain={chain}
                show={setScene}
                onPick={onPick}
                real={lessonReal}
                workspace={workspace}
                frontDeg={frontDeg}
                missions={missions}
                complete={complete}
              />
            }
          />
          <section className={css.stage} aria-label="3D 실습 화면">
            <div className={css.canvas} data-picking={picking || undefined}>
              <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={!inLesson} onTablePick={(mm) => pick.current?.(mm)} />
              <p className={css.stageHint}>끌어서 돌려 보기 · 휠로 확대 · 오른쪽 끌기로 옮기기{picking ? ' · 책상을 클릭하면 그 자리를 골라요' : ''}</p>
            </div>
          </section>
        </div>
      </SymbolsProvider>
      <FollowBar {...follow} hidden={hidden} stage="right" />
      {locked && !hidden && (
        <LessonLocked
          topic={locked}
          onClose={() => setLocked(null)}
          onOpen={() => {
            setLocked(null);
            openLesson(locked);
          }}
        />
      )}
      </FollowContext.Provider>
    </LabGateContext.Provider>
  );
}
