'use client';

/**
 * 교육 tab: a robotics course of 8 단원 and 28 차시 (engine/education/catalog.ts, written in
 * content-markdown/*.md). It opens on the course home (roadmap/Course: where to go on, the roadmap
 * and the 단원 in their three 대단원, fitted to the school's equipment, with a 단원 preview); a 차시 is one
 * lesson screen — the step bar on top (lesson/LessonBar), the 3D view with the activity panel
 * over it (stage/ControlOverlay), and a short card per step on the right (lesson/LessonCards).
 * The 교육 tab opens on the 로봇 산업단지 (map/ParkView): seven industrial sites in order, each opening
 * when the one before it is finished — the 교육센터 is the 1단원 차시, the 스마트 공장 is lab/FactoryLab (a
 * working conveyor line to fix); 전체 차시 there opens the course home.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TOPIC_BY_ID, TOPICS, type StepKey, type TopicId } from '@/engine/education/catalog';
import { DEFAULT_OWNED, PRODUCTS, type ProductId, type StudyLevel } from '@/engine/education/roadmap';
import type { LabId } from '@/engine/education/park';
import { forwardKinematicsFrames, type ChainSegment } from '@/engine/robot/kinematics';
import type { UrdfRobot } from '@/engine/robot/urdf';
import { workspaceProfile, type WorkspaceProfile } from '@/engine/physics/workspace';

import LearnStage, { type LearnScene } from './stage/LearnStage';
import { HOME_POSE, type Mm, type RealArm } from './lessons';
import ControlOverlay from './stage/ControlOverlay';
import { SymbolsProvider } from './lesson/Rich';
import Course from './roadmap/Course';
import FactoryLab from './lab/FactoryLab';
import BioLab from './lab/BioLab';
import FarmLab from './lab/FarmLab';
import LogisticsLab from './lab/LogisticsLab';
import ParkView from './map/ParkView';
import LessonBar from './lesson/LessonBar';
import LessonCards, { PAGES, isActivity, type PageId, type ResumeSpot } from './lesson/LessonCards';
import { TOPIC_PANELS } from './topics';
import { TCP } from './topics/kit';
import type { ResultRow, StepView } from './topics/types';
import css from './learn.module.css';

const TOPIC_KEY = 'learn-topic';
const DONE_KEY = 'learn-done';
const MISSION_KEY = 'learn-missions';
const OWNED_KEY = 'learn-owned';
const LEVEL_KEY = 'learn-level';
const RESUME_KEY = 'learn-resume';
const LAB_KEY = 'lab-solved';
const LOGI_KEY = 'lab-solved-logistics';
const BIO_KEY = 'lab-solved-bio';
const FARM_KEY = 'lab-solved-farm';
const FIRST: TopicId = TOPICS[0].id;
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
  }
}

/** The controls' activity for a lesson step (도입 · 개념 show activity 1's scene; 평가 keeps the last one). */
const stepFor = (p: PageId, cur: StepView): StepView => (isActivity(p) || p === 'cmp' ? p : p === 'check' ? cur : 'A');

export default function LearnView({ robot, chain, gripperRobot, real, hidden }: Props) {
  const [topicId, setTopicId] = useState<TopicId>(FIRST);
  /** The park (front page), the course, a lesson, or the problem-solving lab (opened once, then kept). */
  const [screen, setScreen] = useState<'map' | 'course' | 'topic' | 'lab' | 'logistics' | 'bio' | 'farm'>('map');
  const [logiSeen, setLogiSeen] = useState(false);
  const [bioSeen, setBioSeen] = useState(false);
  const [farmSeen, setFarmSeen] = useState(false);
  /** Where a lesson goes back to: the page it was opened from. */
  const [lessonFrom, setLessonFrom] = useState<'map' | 'course'>('course');
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
  const [labSeen, setLabSeen] = useState(false);
  const openLab = useCallback(() => {
    setLabSeen(true);
    setScreen('lab');
  }, []);
  const openSiteLab = useCallback((lab: LabId) => {
    if (lab === 'logistics') {
      setLogiSeen(true);
      setScreen('logistics');
    } else if (lab === 'bio') {
      setBioSeen(true);
      setScreen('bio');
    } else if (lab === 'farm') {
      setFarmSeen(true);
      setScreen('farm');
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
    const o = readJson<string[]>(OWNED_KEY, [...DEFAULT_OWNED]).filter((p) => PRODUCTS.some((x) => x.id === p)) as ProductId[];
    setOwnedRaw(o);
    if (readJson<string>(LEVEL_KEY, 'hs') === 'uni') setLevelRaw('uni');
    setMissions(readJson(MISSION_KEY, {}));
    setLabSolved(readJson(LAB_KEY, {}));
    setLogiSolved(readJson(LOGI_KEY, {}));
    setBioSolved(readJson(BIO_KEY, {}));
    setFarmSolved(readJson(FARM_KEY, {}));
    const r = readJson<Partial<ResumeSpot> | null>(RESUME_KEY, null);
    if (r && TOPIC_BY_ID.has(r.topic as TopicId) && PAGES.includes(r.page as PageId)) setResume({ topic: r.topic as TopicId, page: r.page as PageId });
  }, []);
  /** Open a 차시 at a step (its first by default). */
  const choose = useCallback((t: TopicId, at: PageId = 'intro') => {
    setTopicId(t);
    setStep(stepFor(at, 'A'));
    setPageRaw(at);
    setScreen('topic');
    writeJson(TOPIC_KEY, t);
    const spot = { topic: t, page: at };
    setResume(spot);
    writeJson(RESUME_KEY, spot);
  }, []);
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
  const record = useCallback(
    (s: StepKey, row: ResultRow) => {
      setResults((r) => {
        const cur = { ...r[topicId], [s]: row };
        if (cur.A && cur.B && cur.C) markDone(topicId);
        return { ...r, [topicId]: cur };
      });
    },
    [topicId, markDone],
  );

  // The workspace takes a moment to sample (~250k poses): after the first paint.
  const [workspace, setWorkspace] = useState<WorkspaceProfile | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setWorkspace(workspaceProfile(chain, TCP)), 60);
    return () => window.clearTimeout(id);
  }, [chain]);
  const frontDeg = useMemo(() => {
    const f = forwardKinematicsFrames(chain, [0, HOME_POSE[1], HOME_POSE[2], HOME_POSE[3], 0, 0]);
    const e = f[f.length - 1].elements;
    return (Math.atan2(e[13], e[12]) * 180) / Math.PI;
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
    return () => {
      delete window.__learnPick;
      delete window.__learnOpen;
      delete window.__learnLab;
      delete window.__learnLogi;
      delete window.__learnBio;
      delete window.__learnFarm;
    };
  }, [choose, openLab, openSiteLab]);

  const fromMap = useCallback(
    (t: TopicId) => {
      setLessonFrom('map');
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
  const progress = useMemo(() => ({ done, solved: { factory: labSolved, logistics: logiSolved, bio: bioSolved, farm: farmSolved } }), [done, labSolved, logiSolved, bioSolved, farmSolved]);

  const topic = TOPIC_BY_ID.get(topicId)!;
  const Panel = PANELS[topicId];
  const inLesson = !hidden && screen === 'topic';

  return (
    <>
      <ParkView
        robot={robot}
        chain={chain}
        progress={progress}
        hidden={hidden || screen !== 'map'}
        onTopic={fromMap}
        onLab={openSiteLab}
        onCourse={() => setScreen('course')}
      />
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
      {farmSeen && (
        <FarmLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'farm'} level={level} saved={farmSolved} onSolved={onFarmSolved} onBack={() => setScreen('map')} />
      )}
      {bioSeen && (
        <BioLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'bio'} level={level} saved={bioSolved} onSolved={onBioSolved} onBack={() => setScreen('map')} />
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
          onBack={() => setScreen('map')}
        />
      )}
      {labSeen && (
        <FactoryLab robot={robot} chain={chain} gripperRobot={gripperRobot} hidden={hidden || screen !== 'lab'} level={level} saved={labSolved} onSolved={onLabSolved} onBack={() => setScreen('map')} />
      )}
      <SymbolsProvider symbols={topic.symbols}>
        <div className={css.learn} hidden={hidden || screen !== 'topic'}>
          <LessonBar topic={topic} page={page} onPage={setPage} results={results[topicId] ?? NO_RESULTS} level={level} onBack={() => setScreen(lessonFrom)} />
          <section className={css.stage} aria-label="3D 실습 화면">
            <div className={css.canvas} data-picking={picking || undefined}>
              <LearnStage robot={robot} chain={chain} gripperRobot={gripperRobot} scene={scene} paused={!inLesson} shift={384} onTablePick={(mm) => pick.current?.(mm)} />
              <ControlOverlay key={topicId} topic={topic} page={page} onPage={setPage} results={results[topicId] ?? NO_RESULTS}>
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
                  real={real}
                  workspace={workspace}
                  frontDeg={frontDeg}
                  missions={missions}
                  complete={complete}
                />
              </ControlOverlay>
              <p className={css.stageHint}>끌어서 돌려 보기 · 휠로 확대 · 오른쪽 끌기로 옮기기{picking ? ' · 책상을 클릭하면 그 자리를 골라요' : ''}</p>
            </div>
          </section>
          <aside className={css.panel} aria-label={`${topic.title} 수업 카드`}>
            <LessonCards key={topicId} topic={topic} page={page} onPage={setPage} results={results[topicId] ?? NO_RESULTS} onChecked={() => markDone(topicId)} level={level} onTopic={(t) => choose(t)} />
          </aside>
        </div>
      </SymbolsProvider>
    </>
  );
}
