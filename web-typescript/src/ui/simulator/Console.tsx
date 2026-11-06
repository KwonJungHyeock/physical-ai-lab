'use client';

/**
 * 로봇팔 실습 — the classroom console.
 *
 * Three levels, each with its own editor: 초급 blocks, 중급 Python with the
 * official pymycobot API, 고급 ROS 2 nodes (rclpy). Direct control is there
 * at every level. One simulator has to pass before a program can go to the
 * real robot.
 */

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';

import { BLOCK_MM, BLOCK_START, BLOCK_STORED, CAL_BOARD, HAND_PHOTO_DEG, HOME_DEG, KIT_RISE_MM, randomBlockLayout, STORAGE_BOX, type ColorName, type Theme } from '@/engine/simulator/board';
import { EFFECTOR_BY_ID, flangeRefusal, tcpFor, toolMismatch, toolsUsed, type EffectorId, type FlangeReading } from '@/engine/simulator/effectors';
import { toPymycobot } from '@/engine/simulator/export';
import {
  aiOnRobot,
  calibrateRobot,
  cameraFrameUrl,
  robotFetch,
  fetchArrivals,
  handVisionOnRobot,
  fetchRobotState,
  fetchSelfcheck,
  fetchTool,
  focusRobot,
  jogRobot,
  jogRobotAxis,
  jointServo,
  moveRobot,
  pumpRobot,
  gripRobot,
  reconnectRobot,
  releaseRobot,
  runOnRobot,
  stopRobot,
  targetRobot,
  visionOnRobot,
  otherOwner,
  type RobotAi,
  type RobotState,
  remoteRobot,
  setRemoteRobot,
} from '@/engine/simulator/robotLink';
import { addEvidence, loadEvidence, reportHtml, saveEvidence, setDemoRobot, type PrepItem } from '@/engine/simulator/evidence';
import { categoryOf, loadProgress, markKey, openCheck, saveProgress, type ConsoleMode, type Progress, type Where } from '@/engine/simulator/modules';
import { DEFAULT_MODEL, MODEL_CHOICE, extraArmsOn, modelById, offeredModels, setExtraArms, type RobotModelId } from '@/engine/robot/catalog';
import { activeArm, adaptPython, armById, setActiveArm, type ArmSpec } from '@/engine/robot/arms';
import {
  EMPTY_DESK,
  SCENE_FIXED,
  SCENES,
  freeSpot,
  makeObject,
  practiceUsesMat,
  restingZ,
  sceneObjects,
  setActiveDesk,
  setMatNeeded,
  type Desk,
  type DeskObject,
  type ObjectKind,
  type SceneId,
} from '@/engine/simulator/desk';
import { usbAvailable } from '@/engine/simulator/usbKit';
import { carryHash, loadAside, loadLastPractice, loadProgram, readCarried, saveAside, saveLastPractice, saveProgram } from '@/engine/simulator/programs';
import { TRACKS, trackLevel, type TrackId } from '@/engine/simulator/tracks';
import { isStarter, newSession, placedBlocks, practiceFor, practicesFor, repeatability, starterFor, toolFits, toolNeeded, type Level, type PracticeId, type Session } from '@/engine/simulator/practices';
import { check, parse, type CameraId, type Problem, type Step } from '@/engine/simulator/program';
import { checkProcess, compileProcess, emptyProcess, processFromFile, processListing, processToFile, PROCESS_EXT, type Process } from '@/engine/simulator/process';
import { findSlots, tutorialFor } from '@/engine/simulator/tutorials';
import { blockLayout, buildPlan, carryTargets, freshPlan, makeSolver, practiceOf, strokes, type Built, type PlanKind, type Solver, type Spot } from '@/engine/simulator/plan';
import { CELL_BY_ID, cellLayout, type CellId } from '@/engine/simulator/cell/cells';
import { missionById, missionsOf } from '@/engine/simulator/cell/missions';
import { LEVEL_NAME, type CellAlert } from '@/engine/simulator/cell/faults';
import { cellChecks, repairCell } from '@/engine/simulator/cell/run';
import CellCamera from './stage/CellCamera';
import CellHud, { QuestCard } from './stage/CellHud';
import type { CellClock } from './stage/DeskObjects';
import CafeStrip from './stage/CafeStrip';
import { BoardStrip, DrawStrip } from './stage/SiteStrips';
import { RunError, SelfCollision, Stop, contactJoints, createCellWorld, createWorld, poseContact, emptyStats, instantAnimate, jogTo, moveCheck, moveProblem, playTimeline, preflight, runProcess, runProgram, type RobotAction, type RunHooks, type WorldState } from '@/engine/simulator/sim';
import { demoFits, demoFor, demoStepAt } from '@/engine/simulator/demos';
import { runPython, warmPython } from '@/engine/python/client';
import type { PyOutput, PyResult } from '@/engine/python/types';
import { buildChain, forwardKinematics, forwardKinematicsFrames, liftChain, solveIk, type ChainSegment } from '@/engine/robot/kinematics';
import { jointMax, jointMin } from '@/engine/robot/limits';
import { ARM_STOP_DEC_DEG_S2, tcpPositionMm } from '@/engine/robot/motion';
import { STRAIGHT_DOWN, coordJogBlocked, currentOrientation, shiftTool, solveToolPose, toolTiltDeg, toolYawDeg, turnTool, type PointMm } from '@/engine/robot/tool';
import { parseUrdf, type UrdfRobot } from '@/engine/robot/urdf';
import type { ImageLike } from '@/engine/vision/color';
import { Divergence, findColor, offCentre, probeJacobian, stepTowards, type Seen } from '@/engine/vision/track';

import BlockEditor from './editors/BlockEditor';
import { CellTerminal, type PyEnd } from './editors/CellTerminal';
import { PyTerminal } from './editors/PyTerminal';
import { ModeSeg } from './editors/Terminal';
import { labAt } from '@/engine/simulator/terminal/labs';
import type { TermLine } from '@/engine/simulator/terminal/shell';
import CameraViews, { analyse, type CameraView, type CameraViewsHandle, type Detection } from './stage/CameraViews';
import CodeEditor from './editors/CodeEditor';
import ControlPanel, { type Axis } from './control/ControlPanel';
import LeftRail, { type BarItem, type RailItem } from './stage/LeftRail';
import MiniArmLabels from './stage/MiniArmLabels';
import { HudGauges, StageTitle } from './stage/StageHud';
import { createMonitor, type MiniRect } from './stage/MiniArm';
import DeskPanel from './control/DeskPanel';
import DemoCaption from './stage/DemoCaption';
import { ResultCard, RunTimeline, applyFrame, snapshot, type Replay } from './stage/RunReplay';
import Hud, { type HudStatus } from './stage/Hud';
import Intro, { skipIntroOnce } from './connect/Intro';
import HelpSheet from './connect/HelpSheet';
import { announceRobotStop } from './connect/robotStop';
import ModelPicker from './connect/ModelPicker';
import ConnectDialog from './connect/ConnectDialog';
import UsbMaker from './connect/UsbMaker';
import RobotSetup from './connect/RobotSetup';
import PartsPanel from './control/PartsPanel';
import ProcessPanel from './editors/ProcessPanel';
import { FullBar, LangSeg, Snippets, SlotCode, TutorialCard } from './editors/Tutorial';
import CafeMaker from './editors/CafeMaker';
import { HandPane, WatchPane } from './editors/CafeSteps';
import DrawCards from './editors/DrawCards';
import BoardCards from './editors/BoardCards';
import ThemePanel from './tasks/ThemePanel';
import TutorialStrip from './tasks/TutorialStrip';
import { MomentAsk, PredictCard, StepResult, loadPredictions, savePrediction } from './stage/StepGuide';
import { QUESTS, questNow, type QuestPhase } from '@/engine/simulator/cell/quests';
import { askNow, asksOf, guideOf, type Ask } from '@/engine/simulator/cell/guides';
import { stationAt } from '@/engine/simulator/cell/shots';
import SiteTour from './stage/SiteTour';
import Roadmap from './connect/Roadmap';
import { LIFE_TUTORIALS, lifeTutorialById, type TutCtx, type TutMem } from '@/engine/simulator/lifeTutorials';
import { StartGuide, type StartStep } from './stage/StartGuide';
import HandPanel, { type HandState } from './control/HandPanel';
import { HandMapper, demoProcess, simplifyDemo, type DemoPoint, type DemoSample, type HandPose } from '@/engine/vision/hand';
import ProcessFlow, { activePlan, initialFlow, REF_MARK, type FlowState } from './editors/ProcessFlow';
import PyPanel from './editors/PyPanel';
import RunBar from './tasks/RunBar';
import { usePcApp } from './connect/usePcApp';
import { createLive } from './liveStore';
import { CameraPip, ViewTools, type CameraPipHandle } from './stage/StageTools';
import Notices, { namedButtons, type Guide, type LogEntry, type LogKind } from './stage/Notices';
import TopBar, { type ConsoleView } from './TopBar';
import LearnView from '../education/LearnView';
import { openPractice7, type UnitId } from '@/engine/education/practice7';
import type { RealArm } from '../education/lessons';
import { LEVEL_TAB, TaskChip } from './tasks/TaskChip';
import Library, { type LibrarySection } from './pages/Library';
import Archive, { type ArchiveSection } from './pages/Archive';
import ZeroPanel from './control/ZeroPanel';
import Icon from './Icon';
import RobotStatus, { calibratedText } from './control/RobotStatus';
import StatusLights from './control/StatusLights';
import type { CameraFrame, StageApi, ViewName } from './stage/Stage';
import { DEFAULT_DISPLAY, type DisplayOpts } from './stage/sceneHelpers';
import css from './console.module.css';
import { isTouch } from './touch';
import TouchTips from './TouchTips';
import { obj } from '@/engine/robot/selfCollision';

// memo: the 3D view re-renders only when one of its own props changes, not with every console update.
const Stage = memo(
  dynamic(() => import('./stage/Stage'), {
    ssr: false,
    loading: () => <div className={css.loading}>3D 화면을 불러오는 중…</div>,
  }),
);

const URDF_URL = '/robot/rdkx5/mycobot_280_rdkx5.urdf';
const GRIPPER_URDF_URL = '/robot/rdkx5/mycobot_280_rdkx5_adaptive_gripper.urdf';
const TAB_KEY = 'robot-console-tab';
/** 처음 시작: the steps done and whether the guide is folded (this PC). */
const START_KEY = 'robot-console-start';
/** The 공정 짜기 process being made (its project-file text). */
const PROCESS_KEY = 'robot-console-process';
/** 공정 짜기: the step, the practice, the taught places and the rules. */
const FLOW_KEY = 'robot-console-process-flow';
/** The menu bar down the left edge (stage/LeftRail), px (its width follows the window); the 3D view's things start right of it. */
const barW = () => (typeof document === 'undefined' ? 96 : (document.querySelector<HTMLElement>('nav[aria-label="메뉴"]')?.offsetWidth ?? 96));
/** The mini arm's corner, px: from the left menu bar's left edge, and its size. Left of the arm's joints
 *  sit their angle chips (about 80 px): room for them right of the bar. */
const MINI = { bottom: 64, width: 250, height: 300 };
// Room on the left for a chip with its reason ("−142.4° 한계까지 8°") clear of the menu bar.
const miniLeft = () => barW() + 84;
const QUALITY_KEY = 'robot-console-quality';
const LEVEL_KEY = 'robot-console-level';
const DISPLAY_KEY = 'robot-console-display';
/** 실습 셀: the steps passed, and the program kept for each step (and for 자유 실습). */
const CELL_PASSED_KEY = 'robot-console-cell-passed';
/** The Python tab's way (코드 / 터미널), kept apart for the cells and the arm alone. */
const PY_MODE_KEY = 'robot-console-py-mode';
type PyMode = 'code' | 'term';
const CELL_PROG_KEY = 'robot-console-cell-prog';
/** A cell program's start: the import line and the arm to its home pose. */
const CELL_START = 'from edu import robot, cell\n\nrobot.home()\n';
/** Equipment whose name tags show for a ladder step (by its place in the ladder). */
const cellStepTags = (cell: CellId, n: number): string[] => {
  if (cell === 'vision') return n <= 3 ? ['위 카메라', '분류함'] : n <= 6 ? ['위 카메라', '끝 센서', '분류함'] : ['위 카메라', '분류함', '불량 슈트'];
  if (cell === 'assembly') return n <= 1 ? ['진동 피더', '핀 트랙', '클램프 지그'] : n <= 5 ? ['클램프 지그', '핀 트랙', '진동 피더'] : ['하우징 컨베이어', '클램프 지그', '완성 상자'];
  if (cell === 'tend') return n <= 2 ? ['문', '척', 'CNC 머신'] : n <= 5 ? ['문', '척', '완성품 트레이'] : ['대기 자리', '문', '척'];
  if (cell === 'inspect') return n <= 2 ? ['스토퍼', '배출 실린더', '불량함'] : n <= 4 ? ['높이 센서', '근접 센서', '배출 실린더'] : n === 5 ? ['스토퍼', '배출 실린더', '컨베이어'] : ['높이 센서', '불량함', '양품 트레이'];
  return n <= 5 ? ['소재 판', '적재 판'] : n <= 9 ? ['매거진', '끝 센서', '적재 판'] : ['공급 실린더', '컨베이어', '끝 센서'];
};
/** Where a step's program is kept: by the step, or each cell's 자유 실습 (cell A's under its first name). */
const cellProgKey = (at: { cell: CellId; mission: string | null }) => `${CELL_PROG_KEY}:${at.mission ?? (at.cell === 'feed' ? 'free' : `free-${at.cell}`)}`;
const loadCellProgram = (at: { cell: CellId; mission: string | null }): string | null => {
  try {
    return localStorage.getItem(cellProgKey(at));
  } catch {
    return null;
  }
};
const saveCellProgram = (at: { cell: CellId; mission: string | null }, c: string) => {
  try {
    if (c === CELL_START) localStorage.removeItem(cellProgKey(at));
    else localStorage.setItem(cellProgKey(at), c);
  } catch {
    /* this session only */
  }
};
const MODE_KEY = 'robot-console-mode';
const DOCK_KEY = 'robot-console-dock-open';
const SIM_RATE_KEY = 'robot-console-sim-rate';
const POSES_KEY = 'robot-console-poses';
/** The corner camera preview is drawn at 240 × 180: a sixth of the pixels to render and read back. */
const PIP_SCALE = 0.5;
const MODEL_KEY = 'robot-console-model';
/** 자료실 › 프로그램: the 로봇 설치 도구 (로봇 USB 만들기 · 새 로봇 설치, with the robot kit), the newest GitHub release. */
const INSTALLER_URL = 'https://github.com/KwonJungHyeock/physical-ai-lab/releases/latest/download/PhysicalAI-RobotTool.zip';
/** The simulator opens on the arm alone; the AI kit is one click away (the 실습 환경 dock). */
const START_THEME: Theme = 'arm';
const SECTION_KEY = 'robot-console-section';
/** 입문 튜토리얼s finished (this browser). */
const TUT_KEY = 'robot-console-life-tutorials';
const MOUNT_KEY = 'robot-console-mount';
const PC_OFFER_KEY = 'robot-console-pc-offered';
/** Which real camera is which (kit / hand), when the robot has more than one. */
const CAM_ROLES_KEY = 'robot-console-cam-roles';

/** What the side panel shows: direct control, or the editor of one language. */
type PanelTab = 'direct' | 'process' | Level;
/** A picture of each arm family (rendered from its 3D model, tools/build/part-thumbs.mjs). */
const FIRST_LOG: Record<Level, string> = {
  basic: '블록을 쌓고 [시뮬레이션]을 눌러 보세요.',
  python: '파이썬 코드를 고치고 [시뮬레이션]을 눌러 보세요. 통과한 코드는 로봇에서 그대로 돌아가요.',
  ros: 'ROS 2 노드를 만들고 [시뮬레이션]을 눌러 보세요. /joint_states 를 로봇 드라이버가 받아 팔을 움직여요.',
};

function cancelJogTick(j: { raf: number; timer: boolean }): void {
  if (j.timer) window.clearTimeout(j.raf);
  else cancelAnimationFrame(j.raf);
}

/** A program line as the timeline names it: the block's words, not the code (robot.home() → 기본 자세). */
function lineName(src: string): string {
  const t = src.trim();
  const m =
    t.match(/^robot\.move_joint\(\s*(\d+)\s*,\s*(-?[\d.]+)/) ??
    null;
  if (m) return `${m[1]}번 관절 ${m[2]}°`;
  const named: [RegExp, string][] = [
    [/^robot\.home\(/, '기본 자세'],
    [/^robot\.move_joints\(/, '관절 한 번에'],
    [/^robot\.go_pose\(\s*['"](.+?)['"]/, '$1'],
    [/^robot\.set_speed\(\s*(\d+)/, '속도 $1'],
    [/^robot\.wait\(\s*([\d.]+)/, '$1초 기다리기'],
    [/^robot\.gripper\.open/, '그리퍼 열기'],
    [/^robot\.gripper\.close/, '그리퍼 닫기'],
    [/^robot\.pump\.on/, '펌프 켜기'],
    [/^robot\.pump\.off/, '펌프 끄기'],
    [/^robot\.pen\.down/, '펜 내리기'],
    [/^robot\.pen\.up/, '펜 올리기'],
    [/^robot\.cylinder\.push/, '버튼 누르기'],
    [/^robot\.move_above\(\s*['"]?([^'",)]+)/, '$1 위로'],
    [/^robot\.move_down\(\s*['"]?([^'",)]+)/, '$1 내려가기'],
    [/^robot\.move_to\(/, '좌표로 가기'],
    [/(camera|hand_camera)\.find\(\s*['"](.+?)['"]/, '$2 찾기'],
    // Python (pymycobot) and ROS 2
    [/\.send_angle\(\s*(\d+)\s*,\s*(-?[\d.]+)\s*,/, '$1번 관절 $2°'],
    [/\.send_angle\(/, '관절 하나 돌리기'],
    [/\.(sync_)?send_angles\(/, '관절 한 번에'],
    [/\.(sync_)?send_coords?\(/, '좌표로 가기'],
    [/\.set_gripper_state\(\s*0\b/, '그리퍼 열기'],
    [/\.set_gripper_state\(\s*1\b/, '그리퍼 닫기'],
    [/\.set_gripper_/, '그리퍼'],
    [/\.(set_basic_output|set_digital_output)\(/, '펌프 신호'],
    [/time\.sleep\(\s*([\d.]+)\s*\)/, '$1초 기다리기'],
    [/time\.sleep\(/, '기다리기'],
    [/\.publish\(/, '명령 보내기'],
  ];
  for (const [re, name] of named) {
    const x = t.match(re);
    if (x) return name.replace(/\$(\d)/g, (_, i: string) => x[Number(i)] ?? '');
  }
  const s = t.replace(/^robot\./, '');
  return s.length > 24 ? `${s.slice(0, 23)}…` : s;
}

/** A jog's commanded pose may lead the measured one by at most this much per joint (the server allows 15°). */
const JOG_LEAD = 8;
/** Dragging a joint's slider or dial on the robot: the target may run this far ahead of the arm (server allows 15°). */
const FOLLOW_LEAD = 12;

/** `chain` stands on the base (G base) when one is fitted; `rawChain` is the arm alone, for drawing it. */
type Loaded = { robot: UrdfRobot; chain: ChainSegment[]; rawChain: ChainSegment[]; gripper: UrdfRobot };

export default function Console({ track: trackId }: { track?: TrackId } = {}) {
  /** The 트랙 this page sells (engine/simulator/tracks.ts); none = the full package. */
  const track = trackId ? TRACKS[trackId] : null;
  const pcApp = usePcApp();
  const [loadedArm, setLoaded] = useState<Omit<Loaded, 'rawChain'> | null>(null);
  /** The 교육 tab always teaches on myCobot 280 RDK X5, whichever arm the simulator has open. */
  const [learnArm, setLearnArm] = useState<Omit<Loaded, 'rawChain'> | null>(null);
  /** The robot stands on a base (G base) this many mm above the table; 0 = on the table. */
  /** The G base under the robot: off, or on at its own 32 mm (another height can be set). */
  const [mount, setMount] = useState({ on: false, mm: 32 });
  const [theme, setTheme] = useState<Theme>(START_THEME);
  // On the AI kit the real robot's base stands KIT_RISE_MM above the plate: the arm is lifted by that too.
  const mountMm = (theme === 'kit' ? KIT_RISE_MM : 0) + (mount.on ? mount.mm : 0);
  // Every check and solver works in the table's frame: the arm's chain lifted by the base.
  const loaded = useMemo<Loaded | null>(
    () => (loadedArm ? { ...loadedArm, chain: liftChain(loadedArm.chain, mountMm), rawChain: loadedArm.chain } : null),
    [loadedArm, mountMm],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('basic');
  // 실습 환경: the desk's scene and objects (빈 화면 at every start), the panel (and the tab it opened on), the picked object.
  const [desk, setDesk] = useState<Desk>(EMPTY_DESK);
  /** The left menu bar's open window (실습 환경 · 물건 · 모니터; the camera has its own window). */
  const [railOpen, setRailOpen] = useState<RailItem | null>(null);
  /** Each joint's warning and where the mini arm's joints are, written by the 3D view every frame. */
  const monitor = useMemo(() => ({ current: createMonitor() }), []);
  const [deskSel, setDeskSel] = useState<string | null>(null);
  // 수동 제어 screens from the menu bar (조그 · 도구 · 자세): the one last opened, kept on this PC.
  const [section, setSection] = useState<string>('jog');
  const openSection = (id: string) => {
    setSection(id);
    // 테마학습 is the 입문 page's own: not kept for the full console.
    if (id === 'theme') return;
    try {
      localStorage.setItem(SECTION_KEY, id);
    } catch {
      /* private window */
    }
  };
  const [practiceId, setPracticeId] = useState<PracticeId>('joints');
  const practice = practiceFor(level, theme, practiceId);
  /** Every model opens with no tool on; a practice that needs one asks for it ([끼우기]). */
  const [effector, setEffector] = useState<EffectorId>('none');
  const [cameraFlange, setCameraFlange] = useState(false);
  const [code, setCode] = useState(() => practiceFor('basic', START_THEME, 'joints').starter('none', START_THEME));
  /** The saved level, practice and program have been read (until then nothing is saved over them). */
  const [restored, setRestored] = useState(false);
  /** The side panel is open (on a PC screen it floats over the 3D view and folds to an edge tab). */
  const [dockOpen, setDockOpen] = useState(true);
  /** The side panel's tab: direct control first, then one tab per language. */
  const [tab, setTab] = useState<PanelTab>('direct');
  const [proc, setProc] = useState<Process>(() => emptyProcess());
  const [flow, setFlowState] = useState<FlowState>(() => initialFlow(activeArm().home));
  const setFlow = (f: FlowState) => {
    setFlowState(f);
    try {
      localStorage.setItem(FLOW_KEY, JSON.stringify(f));
    } catch {
      /* this session only */
    }
  };
  /** 코딩 튜토리얼: the step each tutorial is on (level:practice), and 전체 편집 (Python · ROS 2). */
  const [tutSteps, setTutSteps] = useState<Record<string, number>>({});
  const [fullEdit, setFullEdit] = useState(false);
  /** The last simulated run of the process (실행 · 확인). */
  const [lastRun, setLastRun] = useState<{ ok: boolean; seconds: number; placed?: number; total?: number } | null>(null);
  const procFile = useRef<HTMLInputElement>(null);
  /** The side panel stays on the right: the menu bar holds the left edge. */
  const side = 'right';
  /** Each language keeps its own program while another tab is open. */
  const kept = useRef<Partial<Record<Level, { theme: Theme; id: PracticeId; code: string }>>>({});
  /** The 라이브러리 and 자료실 pages: their open section. */
  const [libSection, setLibSection] = useState<LibrarySection>('all');
  const [arcSection, setArcSection] = useState<ArchiveSection>('');
  /** ▶ 데모 of a 실습 환경 on the simulated arm, with its caption bar: the step shown, and whether it still plays. */
  const [demo, setDemo] = useState<{ scene: SceneId; step: number; playing: boolean } | null>(null);
  /** [블록으로 보기] pressed while the demo still played: opened once it has stopped. */
  const demoBlocksPending = useRef<SceneId | null>(null);
  /** The result card after a practice's goal is reached in the simulator. */
  const [goalCard, setGoalCard] = useState<{ goal: string; done: number; total: number } | null>(null);
  /** The last program run, frame by frame, for the timeline under the 3D view (null: none, or the world was reset). */
  const [replay, setReplay] = useState<Replay | null>(null);
  /** [다시 보기] on the result card: starts the timeline playing (a new number each time). */
  const [replayPlay, setReplayPlay] = useState(0);
  /** The goal was reached while a run was going: shown when it ends. */
  const goalPending = useRef<{ goal: string; done: number; total: number } | null>(null);
  /** Where the block program will leave the arm (the see-through arm), with the program it was worked out for. */
  const [ghost, setGhost] = useState<{ code: string; angles: number[] } | null>(null);
  /** First visit of a robot's console on this PC: offer the PC program (shown once). */
  const [pcOffer, setPcOffer] = useState(false);
  /** A program is running (simulation or robot): with 표시 › 실행할 때 패널 접기 the panels fold for it. */
  const [programRun, setProgramRun] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([{ id: 0, kind: 'info', msg: FIRST_LOG.basic }]);
  const [busy, setBusy] = useState(false);
  const [runningLine, setRunningLine] = useState(-1);
  const [errorLines, setErrorLines] = useState<number[]>([]);
  const [badge, setBadge] = useState<{ kind: 'sim' | 'stop' | 'real'; text: string } | null>(null);
  /** The run that passed; `start` = the pose a Python run started from (it has to start there on the robot too). */
  const [passed, setPassed] = useState<{ code: string; actions: RobotAction[]; start?: number[] } | null>(null);
  /** 중급·고급: loading state of Python, what the program printed, the ROS graph. */
  const [pyStatus, setPyStatus] = useState('');
  const [pyOut, setPyOut] = useState<PyOutput[]>([]);
  const [pyRos, setPyRos] = useState<PyResult['ros']>(undefined);
  const [poses, setPoses] = useState<Record<string, number[]>>({});
  const [camView, setCamView] = useState<CameraView>('top');
  /**
   * Panel under the 3D view on a laptop screen: the log or the cameras (a wide
   * screen shows both). A camera in use brings the cameras up; an error brings the log back.
   */
  /** Camera panel over the 3D view, and the log opened up from its one-line bar. */
  const [camOpen, setCamOpen] = useState(false);
  /** 색 따라가기: the colour picked, and while following, what it is doing. */
  const [trackColor, setTrackColor] = useState<ColorName>('빨강');
  /** The robot's camera shown in the real view, and what the user said each one is. */
  const [realCam, setRealCam] = useState(0);
  const [camRoles, setCamRoles] = useState<Record<number, CameraId>>({});
  const [tracking, setTracking] = useState<{ color: ColorName; note: string } | null>(null);
  /** 3D picture quality, chosen by itself (no button); 'high' adds ambient occlusion and sharper shadows. */
  const [quality, setQuality] = useState<'high' | 'normal'>('high');
  /** Which practices reached their goal in the simulator / ran on the robot (kept in this browser). */
  const [progress, setProgress] = useState<Progress>({});
  const pip = useRef<CameraPipHandle>(null);
  /** 3D view: 'loading' until the arm is on screen, 'slow' after 15 s without it. */
  const [scene3d, setScene3d] = useState<'loading' | 'ready' | 'slow'>('loading');
  /** The start screen (Eduino logo) stays until the arm first shows, or it takes too long, or loading failed. */
  const [started, setStarted] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  /** Joint angles for the readouts and the robot's latest state: outside React state (see liveStore). */
  const live = useMemo(() => createLive(createWorld('none', false).angles), []);
  const setAnglesView = live.setAngles;
  /** On-robot mode: the page is served by robot-python/server/server.py. */
  const [robot, setRobot] = useState<RobotState | null>(null);
  const [robotMode, setRobotMode] = useState(false);
  /** On the robot: the server stopped answering (Wi-Fi, power, server off). */
  const [serverLost, setServerLost] = useState(false);
  /** A [다시 연결] attempt is running; its last result. */
  const [retry, setRetry] = useState<{ busy: boolean; note: string }>({ busy: false, note: '' });
  const [realRun, setRealRun] = useState(false);
  /** Zero calibration takes over the control dock; the 3D view rings the joint being set. */
  const [zeroMode, setZeroMode] = useState(false);
  const [ringJoint, setRingJoint] = useState<number | null>(null);
  // Joint jog: the joint the keys and the 3D dial turn (0..5), and whether the jog panel shows joints.
  const [jogJoint, setJogJoint] = useState(0);
  /** The tool move that could not be made last: its jog key shows red until the next move. */
  const [tipBlocked, setTipBlocked] = useState<{ axis: Axis; dir: -1 | 1 } | null>(null);
  /** Classes ('learn': practices by topic) or the delivery demonstration of the seven checks ('check'). */
  const [mode, setMode] = useState<ConsoleMode>('learn');
  /** The robot model; null until chosen on the first screen (the robot's own server picks it). */
  const [model, setModel] = useState<RobotModelId | null>(null);
  /** The teacher turned on the extra arms (⚙ 설정 › 다른 로봇팔 쓰기: OMX-F, MG400); read after mount. */
  const [extraArms, setExtraArmsState] = useState(false);
  /** A model can be chosen: every model (MODEL_CHOICE), or the course robot and the extra arms. */
  const choice = MODEL_CHOICE || extraArms;
  const offered = offeredModels(extraArms);
  /**
   * The arm open in the simulator (a real robot is always the myCobot 280 RDK X5 serving the page).
   * Its joint ranges, ready pose and Python class are in force everywhere from this render on.
   */
  const arm = armById(robotMode || !choice ? DEFAULT_MODEL : model);
  setActiveArm(arm.id);
  setActiveDesk(desk);
  // 공정 works on the practice mat too (its example picks a block from it).
  setMatNeeded(practiceUsesMat(practice.id) || tab === 'process');
  const [picking, setPicking] = useState(false);
  /** [?] 도움말 open. */
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  /** The 로봇 연결 dialog. */
  const [connectOpen, setConnectOpen] = useState(false);
  /** Top tabs: 교육 (the robotics course), 시뮬레이터 (this console), 라이브러리, 자료실; it always opens on the simulator. */
  const [view, setView] = useState<ConsoleView>('sim');
  // Counted only while the simulator shows: on the other pages the 3D view is paused and cannot get ready.
  useEffect(() => {
    if (scene3d !== 'loading' || view !== 'sim') return;
    // Only from 'loading': a 'ready' already queued (not yet drawn on a busy page) wins.
    const id = window.setTimeout(() => setScene3d((s) => (s === 'loading' ? 'slow' : s)), 15000);
    return () => window.clearTimeout(id);
  }, [scene3d, quality, view]);
  /** The 교육 screen stays mounted once opened, so switching back and forth keeps its state. */
  const [learnSeen, setLearnSeen] = useState(false);
  const viewRef = useRef<ConsoleView>('sim');
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const chooseView = (v: ConsoleView) => {
    setView(v);
    if (v === 'learn') setLearnSeen(true);
  };
  /** Opened by the desktop simulator program (desktop-go/, `?from=sim`): nothing to install; robots are found on the PC's own networks. */
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    // Read after hydration (the page is a static export).
    const fromSim = new URLSearchParams(window.location.search).get('from') === 'sim';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktop(fromSim);
  }, []);
  /** 로봇 USB 만들기: only where the desktop program answers (it writes the USB stick). */
  const [usbOk, setUsbOk] = useState(false);
  const [usbOpen, setUsbOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  /** A robot to open at once in the connect dialog (from a USB result's [연결]). */
  const [connectTo, setConnectTo] = useState<{ addr: string; label: string } | null>(null);
  useEffect(() => {
    if (!desktop) return;
    let live = true;
    void usbAvailable().then((ok) => live && setUsbOk(ok));
    return () => {
      live = false;
    };
  }, [desktop]);
  /** The program the replay bar belongs to when it is not the editor's (a replayed hand demonstration). */
  const [runText, setRunText] = useState<string | null>(null);
  // On a robot's console the window title names the robot (several tabs, several robots).
  const robotId = robot?.robotId;
  useEffect(() => {
    if (robotId) document.title = `로봇 ${robotId} · Physical AI 로봇팔 실습`;
  }, [robotId]);
  /** Drawing aids of the 3D view (frames, joint axes, path, grid, reach), kept in this browser. */
  const [display, setDisplay] = useState<DisplayOpts>(DEFAULT_DISPLAY);
  // A run is over when nothing is busy any more: the panels come back. The run flag is set a moment
  // before the program turns busy, so wait until it has been busy (or 3 s, for a run that never starts).
  const runSawBusy = useRef(false);
  useEffect(() => {
    if (!programRun) {
      runSawBusy.current = false;
      return;
    }
    if (busy || realRun) {
      runSawBusy.current = true;
      return;
    }
    if (runSawBusy.current) {
      setProgramRun(false);
      return;
    }
    const id = window.setTimeout(() => setProgramRun(false), 3000);
    return () => window.clearTimeout(id);
  }, [programRun, busy, realRun]);
  const chooseDisplay = (d: DisplayOpts) => {
    setDisplay(d);
    try {
      localStorage.setItem(DISPLAY_KEY, JSON.stringify(d));
    } catch {
      /* storage blocked: this session only */
    }
  };
  /** Simulation playback speed (the real robot always runs at its real speed). */
  const [simRate, setSimRate] = useState(1);
  const simRateRef = useRef(1);
  /**
   * 입문 퀘스트 모드: the scene held still (the 예측 asked at its moment): the program's clock and the
   * cell's both read the rate through `runRate`, which is 0 while held.
   */
  const heldRef = useRef(false);
  /**
   * 입문 트랙: a move is also sampled between the screen's frames, every 1/60 s of its time, so what
   * it leaves (the pen's line, the path the checks read) does not depend on how fast the computer
   * draws (a slow one would join far-apart points with straight lines). 0: once a frame (the full console).
   */
  const subRef = useRef(track ? 1 / 60 : 0);
  /** 입문 트랙: while a program runs, the cell goes on by the program's steps (each 1/60 s and the arm's pose then, Stage → CellPhysics). */
  const cellClock = useRef<CellClock>({ on: false, steps: [] });
  const runRate = useMemo(
    () => ({
      get current() {
        return heldRef.current ? 0 : simRateRef.current;
      },
    }),
    [],
  );
  const chooseSimRate = (r: number) => {
    simRateRef.current = r;
    setSimRate(r);
    try {
      localStorage.setItem(SIM_RATE_KEY, String(r));
    } catch {
      /* this session only */
    }
  };
  /** Speed override of the jog keys, percent. */
  const [jogSpeed, setJogSpeed] = useState(50);
  /** What this tab has done across runs, for the practice progress. */
  const session = useRef<Session>(newSession());
  /** The 3D arm shows a preview (slider drag, 0° picture), not the real robot. */
  const previewing = useRef(false);

  const layout = useRef<Record<ColorName, { x: number; y: number }>>(BLOCK_START);
  const world = useRef<WorldState>(createWorld('none', false, BLOCK_START, START_THEME));
  /** 실습 셀 open (its world replaces the desk's), or null. */
  const [cellAt, setCellAt] = useState<{ cell: CellId; mission: string | null } | null>(null);
  // 작업 순서 카드 (입문 트랙's café) write the program here.
  /** The card a program line came from (the replay bar names the card, not the code). */
  const recipeCardOf = useRef<(line: number) => string>(() => '');
  const onRecipeCode = useCallback((c: string, cardOf: (line: number) => string) => {
    setCode(c);
    setErrorLines([]);
    recipeCardOf.current = cardOf;
  }, []);
  const cellRef = useRef(cellAt);
  const [cellTags, setCellTags] = useState<string[]>([]);
  /** Steps passed (kept in this browser) and the last finished run of the open step. */
  const [cellPassed, setCellPassed] = useState<Record<string, boolean>>({});
  /** 입문 튜토리얼 (lifeTutorials.ts): the one running, its step and what the arm was when the step began. */
  const [lifeTut, setLifeTut] = useState<{ id: string; step: number; start: TutCtx; mem: TutMem } | null>(null);
  const [tutDone, setTutDone] = useState<Record<string, boolean>>({});
  /** Process runs that finished well (튜토리얼 '위치 가르쳐 옮기기'). */
  const [procRuns, setProcRuns] = useState(0);
  /** 입문 단계 안내: the 예측 card open (▶ pressed before predicting), steps skipped, the last run's checks for the result card. */
  const [asking, setAsking] = useState(false);
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  /** 입문 퀘스트 모드: the predictions made (this browser), read once and kept here so the briefing closes as one is chosen. */
  const [preds, setPreds] = useState<Record<string, number>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
    setPreds(loadPredictions());
  }, []);
  const [lastChecks, setLastChecks] = useState<{ label: string; ok: boolean; detail?: string }[] | null>(null);
  /** 입문 퀘스트 모드: the step whose 예측 is being asked now, the scene held (MomentAsk). */
  const [moment, setMoment] = useState<{ key: string; ask: Ask; ox: boolean } | null>(null);
  /** 입문: the place being toured (its opening look round, SiteTour.tsx). */
  const [touring, setTouring] = useState<CellId | null>(null);
  /** 입문: the 학습 로드맵 over the intro (its [ROADMAP]). */
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const toured = useRef(false);
  useEffect(() => {
    try {
      // Read after hydration (this browser's record).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTutDone(JSON.parse(localStorage.getItem(TUT_KEY) ?? '{}') as Record<string, boolean>);
    } catch {
      /* private window */
    }
  }, []);
  const [cellResult, setCellResult] = useState<boolean | null>(null);
  /** 실습 셀's Python tab (the blocks otherwise). */
  const [cellTerm, setCellTerm] = useState(false);
  /** The Python tab's way, in a cell and on the arm alone: write the code, or run it from a terminal. */
  const [pyMode, setPyModeState] = useState<{ cell: PyMode; arm: PyMode }>({ cell: 'term', arm: 'code' });
  useEffect(() => {
    try {
      const kept = JSON.parse(localStorage.getItem(PY_MODE_KEY) ?? 'null') as { cell?: PyMode; arm?: PyMode } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's choice, read once after the first render
      if (kept) setPyModeState((m) => ({ cell: kept.cell ?? m.cell, arm: kept.arm ?? m.arm }));
    } catch {
      /* the defaults */
    }
  }, []);
  const setPyMode = (where: 'cell' | 'arm', m: PyMode) =>
    setPyModeState((prev) => {
      const next = { ...prev, [where]: m };
      try {
        localStorage.setItem(PY_MODE_KEY, JSON.stringify(next));
      } catch {
        /* this session only */
      }
      return next;
    });
  const cellTermOn = !!cellAt && cellTerm && pyMode.cell === 'term';
  const armTermOn = !cellAt && level === 'python' && pyMode.arm === 'term';
  // A run folds the panel away for the 3D, but not one from the terminal: its output is the point.
  const runFold = display.autoFold && programRun && !cellTermOn && !armTermOn;
  const dockShown = dockOpen && !runFold;
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CELL_PASSED_KEY) ?? '{}') as Record<string, boolean>;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from this browser
      if (v && typeof v === 'object') setCellPassed(v);
    } catch {
      /* none kept */
    }
  }, []);
  /** Leave the cell (another practice, arm or demo takes the world). */
  const dropCell = () => {
    if (!cellRef.current) return;
    saveCellProgram(cellRef.current, code);
    cellRef.current = null;
    setCellAt(null);
    setCellResult(null);
  };
  const stageApi = useRef<StageApi | null>(null);
  const getStage = useCallback(() => stageApi.current, []);
  // The small camera picture comes back after the camera window closes: draw it once now
  // (it otherwise waits for the next change in the scene).
  useEffect(() => {
    if (camOpen || camView === 'real') return;
    const id = requestAnimationFrame(() => {
      const frame = stageApi.current?.capture(camView, PIP_SCALE);
      if (frame) pip.current?.draw(camView, frame);
    });
    return () => cancelAnimationFrame(id);
  }, [camOpen, camView]);

  /* Stable handlers for the 3D view (it is memoised: new functions each render would redraw it). */
  const onStageApi = useCallback((api: StageApi | null) => {
    stageApi.current = api;
  }, []);
  const onCameraFrame = useCallback((cam: CameraId, frame: CameraFrame) => {
    cams.current?.push(cam, frame);
    pip.current?.draw(cam, frame);
  }, []);
  const onStageReady = useCallback(() => {
    setScene3d('ready');
    setStarted(true);
  }, []);
  const renderError = useRef<(msg: string) => void>(() => {});
  const onRenderError = useCallback((msg: string) => renderError.current(msg), []);
  const onSlow = useCallback(() => {
    setQuality('normal');
    try {
      localStorage.setItem(QUALITY_KEY, 'normal');
    } catch {
      /* ignore */
    }
  }, []);

  /** The panels' container: on a PC screen they float over the full-window 3D view. */
  const shellRef = useRef<HTMLDivElement>(null);
  /**
   * How much of the 3D view the floating panels cover on each side, in pixels, so the view
   * frames the robot in the part that stays visible. Null in the stacked (narrow) layout.
   */
  const miniShown = useRef(true);
  const frameInsets = useCallback(() => {
    const sh = shellRef.current;
    const vp = sh?.querySelector<HTMLElement>('[data-viewport]');
    const panel = sh?.querySelector<HTMLElement>('aside');
    if (!sh || !vp || !panel || getComputedStyle(panel).position !== 'absolute') return null;
    const v = vp.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const onRight = p.left > v.left + v.width / 2;
    let l = onRight ? barW() + 12 : Math.max(barW() + 12, p.right - v.left + 12);
    // The left menu bar and the mini arm beside it: the robot is framed to their right.
    if (miniShown.current) l = Math.max(l, (onRight ? 12 : l) + miniLeft() + MINI.width + 8);
    const r = onRight ? Math.max(0, v.right - p.left + 12) : 0;
    // The camera window opens in the free part's lower left: the robot is framed beside it.
    const camEl = sh.querySelector<HTMLElement>('[data-panel="camera"]');
    if (camEl && !camEl.hidden) l = Math.max(l, camEl.getBoundingClientRect().right - v.left + 12);
    // The monitor's column on the left, the view tools on the right, the top bar over the view.
    const rect = (sel: string) => sh.ownerDocument.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    const hud = rect('[data-panel="hud"]');
    if (hud && hud.width) l = Math.max(l, hud.right - v.left + 12);
    // The 처음 시작 card under the title: the robot is framed to its right while it is open.
    const guide = rect('[data-panel="start"]');
    if (guide && guide.width) l = Math.max(l, guide.right - v.left + 12);
    const tools = rect('[data-panel="viewtools"]');
    const top = rect('[data-panel="topbar"]');
    return {
      l,
      r: tools && tools.width ? Math.max(r, v.right - tools.left + 8) : r,
      t: top ? Math.max(0, top.bottom - v.top + 8) : 0,
      b: 0,
    };
  }, []);
  const cams = useRef<CameraViewsHandle>(null);
  const token = useRef<{ aborted: boolean } | null>(null);
  const logId = useRef(0);

  /** While a terminal python3 runs: the run's messages are printed there too. */
  const termSink = useRef<((kind: LogKind, msg: string, fix?: string) => void) | null>(null);
  // 처음 시작: three steps for someone opening the simulator the first time (StartGuide).
  const [start, setStart] = useState<{ done: StartStep[]; folded: boolean }>({ done: [], folded: false });
  /** 넓게 보기: the work panel widened while the blocks are shown. */
  const [blockWide, setBlockWide] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(START_KEY) ?? 'null') as { done?: StartStep[]; folded?: boolean } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after hydration
      if (s) setStart({ done: s.done ?? [], folded: !!s.folded });
    } catch {
      /* private window */
    }
  }, []);
  const saveStart = (next: { done: StartStep[]; folded: boolean }) => {
    setStart(next);
    try {
      localStorage.setItem(START_KEY, JSON.stringify(next));
    } catch {
      /* this session only */
    }
  };
  const markStart = (step: StartStep) => {
    if (start.done.includes(step)) return;
    const done = [...start.done, step];
    // All three done: the guide folds itself away.
    saveStart({ done, folded: done.length >= 3 || start.folded });
  };
  const addLog = useCallback((kind: LogKind, msg: string, fix?: string) => {
    termSink.current?.(kind, msg, fix);
    // A touch (the desk, the kit, an object): the joints it is about show red on the 3D arm for a moment.
    if ((kind === 'err' || kind === 'warn') && /닿아|부딪|뚫고/.test(msg)) {
      const until = performance.now() + 4000;
      const c = world.current.contact;
      if (!c || c.until !== Infinity) world.current.contact = { joints: contactJoints(msg), until };
    }
    logId.current += 1;
    const id = logId.current;
    // The log opens only when the user asks; an error shows in red on its one-line bar.
    setLog((l) => [...l.slice(-80), { id, kind, msg, fix }]);
  }, []);

  // How many times the whole console has redrawn: read by the performance check (it must stay
  // still while the arm moves; only the readouts should redraw then).
  useEffect(() => {
    const w = window as Window & { __consoleRenders?: number };
    w.__consoleRenders = (w.__consoleRenders ?? 0) + 1;
  });

  /* --- load robot description ------------------------------------------- */
  const loadArm = useCallback(async (urdf: string) => {
    const [a, b] = await Promise.all([fetch(urdf), fetch(GRIPPER_URDF_URL)]);
    if (!a.ok || !b.ok) throw new Error(`HTTP ${a.status}/${b.status}`);
    const robot = parseUrdf(await a.text());
    return { robot, chain: buildChain(robot), gripper: parseUrdf(await b.text()) };
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadArm(URDF_URL).then(
      (l) => !cancelled && setLearnArm(l),
      (err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [loadArm]);
  // The simulator's arm: loaded again when another model is chosen.
  useEffect(() => {
    let cancelled = false;
    loadArm(arm.urdf).then(
      (l) => !cancelled && setLoaded(l),
      (err: unknown) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      cancelled = true;
    };
  }, [loadArm, arm.urdf]);

  /** Python (중급·고급) loads in the background the first time a Python level is chosen. */
  const loadPython = useCallback(() => {
    setPyStatus('파이썬 불러오는 중… (처음 한 번, 약 13MB)');
    warmPython().then(
      () => setPyStatus(''),
      (err: unknown) => setPyStatus(`파이썬을 불러오지 못했어요: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, []);

  useEffect(() => {
    try {
      // Read after hydration so the server-rendered HTML and the first client render agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(loadProgress());
      const savedSection = localStorage.getItem(SECTION_KEY);
      if (savedSection !== null) setSection(savedSection);
      // The 실습 환경 is not restored: every start is the arm alone on an empty desk (빈 화면).
      // The picture quality is chosen by itself: lighter on a small PC (4 cores or fewer), on one that
      // drew the full picture too slowly or not at all before (remembered), or when it runs slowly now.
      // A tablet's GPU starts on 보통 too (it can be raised in the settings).
      const saved = localStorage.getItem(QUALITY_KEY);
      if (saved === 'normal' || (!saved && isTouch()) || (navigator.hardwareConcurrency ?? 8) <= 4) setQuality('normal');
      if (localStorage.getItem(DOCK_KEY) === '0') setDockOpen(false);
      const roles = JSON.parse(localStorage.getItem(CAM_ROLES_KEY) ?? 'null') as Record<string, unknown> | null;
      if (roles && typeof roles === 'object') {
        setCamRoles(Object.fromEntries(Object.entries(roles).filter(([, r]) => r === 'top' || r === 'hand')) as Record<number, CameraId>);
      }
      const m = JSON.parse(localStorage.getItem(MOUNT_KEY) ?? 'null') as { on?: unknown; mm?: unknown } | null;
      if (m && typeof m.on === 'boolean' && typeof m.mm === 'number' && m.mm >= 5 && m.mm <= 300) setMount({ on: m.on, mm: m.mm });
      const rate = Number(localStorage.getItem(SIM_RATE_KEY));
      if (rate === 2 || rate === 4) {
        simRateRef.current = rate;
        setSimRate(rate);
      }
      if (!track && localStorage.getItem(MODE_KEY) === 'check') setMode('check');
      const savedPoses = JSON.parse(localStorage.getItem(POSES_KEY) ?? 'null') as Record<string, number[]> | null;
      if (savedPoses && typeof savedPoses === 'object') {
        setPoses(Object.fromEntries(Object.entries(savedPoses).filter(([, q]) => Array.isArray(q) && q.length === 6 && q.every((v) => Number.isFinite(v)))));
      }
      const savedModel = modelById(localStorage.getItem(MODEL_KEY));
      // The mobile robot has its own page; this one opens on an arm.
      const extra = extraArmsOn();
      setExtraArmsState(extra);
      if (savedModel?.status === 'ready' && savedModel.kind === 'arm' && offeredModels(extra).some((m) => m.id === savedModel.id)) {
        switchArm(savedModel.id);
        setModel(savedModel.id);
      }
      // From the driving console's [로봇팔로 바꾸기]: straight to the model choice.
      if ((MODEL_CHOICE || extra) && new URLSearchParams(window.location.search).has('pick')) setPicking(true);
      const d = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? 'null') as Partial<DisplayOpts> | null;
      if (d && typeof d === 'object') setDisplay({ ...DEFAULT_DISPLAY, ...d });
      // The level and practice left last time, with the student's program (kept in this browser), or
      // the program carried here from the PC's console when connecting to this robot.
      const carried = readCarried(window.location.hash);
      if (carried) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const stored = localStorage.getItem(LEVEL_KEY) as Level | null;
      const savedLevel: Level = trackLevel(track, carried?.level ?? (stored === 'python' || stored === 'ros' ? stored : 'basic'));
      const th: Theme = carried?.theme ?? START_THEME;
      const p = practiceFor(savedLevel, th, carried?.id ?? loadLastPractice(savedLevel) ?? 'joints');
      const left = loadProgram(activeArm().id, savedLevel, th, p.id);
      // A check (검수) always opens on its own example; a program changed there waits under [내 프로그램].
      const aside = !carried && !!p.check && !!left && !isStarter(left);
      if (aside && left) {
        saveAside(activeArm().id, savedLevel, th, p.id, left);
        saveProgram(activeArm().id, savedLevel, th, p.id, null);
      }
      const program = carried?.code ?? (aside ? null : left) ?? starterFor(p, 'none', th);
      if (savedLevel !== 'basic' || th !== START_THEME || p.id !== 'joints' || program !== code) {
        setLevel(savedLevel);
        setTheme(th);
        setPracticeId(p.id);
        setCode(program);
        setMatNeeded(practiceUsesMat(p.id));
        if (savedLevel !== 'basic') setLog([{ id: 0, kind: 'info', msg: FIRST_LOG[savedLevel] }]);
        world.current = createWorld('none', false, BLOCK_START, th);
        if (savedLevel !== 'basic') loadPython();
      }
      if (aside) addLog('info', `검수 ${p.check} 예제 프로그램으로 열었어요. 전에 고친 프로그램은 [내 프로그램]으로 다시 불러와요.`);
      if (carried) {
        setTab(carried.level);
        addLog('info', '시뮬레이터에서 만들던 프로그램을 가져왔어요.');
      } else {
        const savedTab = localStorage.getItem(TAB_KEY);
        if (savedTab === 'direct' || savedTab === 'process' || savedTab === 'basic' || savedTab === 'python' || savedTab === 'ros') setTab(savedTab === 'direct' || savedTab === 'process' || savedTab === savedLevel ? savedTab : 'direct');
        const savedProcess = localStorage.getItem(PROCESS_KEY);
        const back = savedProcess ? processFromFile(savedProcess) : null;
        if (back && 'process' in back) setProc(back.process);
        const savedFlow = localStorage.getItem(FLOW_KEY);
        const f = savedFlow ? (JSON.parse(savedFlow) as Partial<FlowState>) : null;
        if (f && typeof f === 'object' && typeof f.kind === 'string') {
          const base = initialFlow(activeArm().home);
          setFlowState({ ...base, ...f, rules: { ...base.rules, ...f.rules }, startJoints: Array.isArray(f.startJoints) && f.startJoints.length === base.startJoints.length ? f.startJoints : base.startJoints });
        }
      }
    } catch {
      /* storage blocked: keep the defaults */
    }
    // 실습 셀 (not on screen yet): ?cell=feed&mission=A8 opens the cell with the step's reference program.
    const q = new URLSearchParams(window.location.search);
    const qc = (q.get('cell') ?? track?.start?.cell ?? null) as CellId | null;
    if (qc && CELL_BY_ID[qc]) {
      const m = q.get('mission') ?? (qc === track?.start?.cell ? track.start.mission : null);
      const c = { cell: qc, mission: m && missionById(m)?.cell === qc && CELL_BY_ID[qc].built ? m : null };
      cellRef.current = c;
      setCellAt(c);
      setLevel('basic');
      setTheme('arm');
      setTab('basic');
      const tool = CELL_BY_ID[qc].effector ?? 'adaptive';
      setEffector(tool);
      world.current = createCellWorld(c.cell, c.mission, tool);
      setCode((c.mission && missionById(c.mission)?.solution) || 'from edu import robot, cell\n\nrobot.home()\n');
    }
    setRestored(true);
    // Once, on opening: the saved choices are read with the first render's handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPython]);

  /** Keep the open program in this browser (an untouched example is forgotten). */
  const keepProgram = (c: string) => {
    if (cellRef.current) return saveCellProgram(cellRef.current, c);
    // Not before the saved ones are read: the first render holds only the defaults.
    if (restored && practice.id !== 'demo') saveProgram(arm.id, level, theme, practice.id, isStarter(c) ? null : c);
  };
  // Saved a moment after each change, so a reload or a closed window loses nothing; and the practice
  // each level was left on.
  const keepNow = useRef(keepProgram);
  useEffect(() => {
    keepNow.current = keepProgram;
  });
  useEffect(() => {
    if (!restored || practice.id === 'demo') return;
    saveLastPractice(level, practice.id);
    const t = window.setTimeout(() => keepNow.current(code), 400);
    return () => window.clearTimeout(t);
  }, [restored, code, level, theme, practice.id, arm.id]);

  /* --- the real robot (only when served by the robot) --------------------- */
  const busyRef = useRef(false);
  const realRunRef = useRef(false);
  /** The latest robot state, for the real-time jog loop (state updates are too slow for it). */
  const robotNow = useRef<RobotState | null>(null);
  /** What the real arm's flange has (/api/tool): read on connect, on a tool change and every 20 s while idle. */
  const [flange, setFlange] = useState<FlangeReading>(undefined);
  const [flangeHidden, setFlangeHidden] = useState('');
  const readFlange = useCallback(async () => {
    const v = await fetchTool();
    setFlange(v);
    return v;
  }, []);
  /** The running real-time jog (see startJog). */
  /** endJog for 정지 (stop is memoised; the jog functions are not). */
  const endJogRef = useRef<(() => void) | null>(null);
  const jog = useRef<{
    /** A held key: a joint or a base axis and its direction; a slider: the pose to reach. */
    joint?: number;
    axis?: Axis;
    dir: -1 | 1;
    goal?: number[];
    cmd: number[];
    last: number;
    sent: number;
    inflight: boolean;
    /** Pending tick: an animation frame, or a timer on the robot. */
    raf: number;
    timer: boolean;
    /** When the key went down (first tick), for the ease-in. */
    t0?: number;
    view: number;
    /** Share of the jog speed (slide jog: how far the knob is pulled), 0.1..1; keys use 1. */
    scale?: number;
  } | null>(null);
  /** The running 색 따라가기 (see startTracking); `alive` false asks it to stop. */
  const tracker = useRef<{ alive: boolean } | null>(null);
  /** 손 따라하기 while the arm follows the hand (and records it). */
  const follower = useRef<{ alive: boolean; mapper: HandMapper; target: PointMm | null; closed: boolean; rec: DemoSample[] | null; t0: number } | null>(null);
  /** Reused canvas for reading real camera frames. */
  const trackCanvas = useRef<HTMLCanvasElement | null>(null);
  /** The server's id for the run "로봇에서 실행" started; 0 when none. */
  const realRunId = useRef(0);
  /** What the running real-robot job is: the practice program, or a check (connection check). */
  const realKind = useRef<'program' | 'check'>('program');
  useEffect(() => {
    busyRef.current = busy;
    realRunRef.current = realRun;
  }, [busy, realRun]);
  // 입문 트랙: the cell keeps the program's time while one runs in the simulator (not the real robot).
  useEffect(() => {
    cellClock.current = { on: !!track && busy && !robotMode, steps: [] };
  }, [track, busy, robotMode]);

  const tcpNow = tcpFor(effector, cameraFlange);

  /* --- modules ----------------------------------------------------------------- */
  const here: Where = { level, theme, id: practice.id };

  /**
   * 검수 결과 기록 (kept in this browser): what was shown for each check, when, with what values.
   * Read from storage on every write: 로봇 실습 7 (education tab) adds lines to the same list.
   */
  const note = (check: number | undefined, text: string, real: boolean) => {
    if (!check) return;
    addEvidence(check, text, real);
  };
  // A demo robot server (pretend arm): what is recorded on it is practice, not proof (the sheet says so).
  const demoRobot = !!robot?.demo;
  useEffect(() => setDemoRobot(demoRobot), [demoRobot]);

  /** 검수 준비 점검 (the robot's self-check) and the result sheet. */
  const [prep, setPrep] = useState<{ items: PrepItem[]; at: string } | null>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const runPrep = async () => {
    setPrepOpen(true);
    const r = await fetchSelfcheck();
    if (!r.ok || !r.items.length) {
      setPrep(null);
      return addLog('err', `검수 준비 점검: ${r.error ?? '로봇이 답하지 않아요.'}`);
    }
    setPrep({ items: r.items, at: new Date().toISOString() });
    const bad = r.items.filter((i) => i.ok === false);
    addLog(bad.length ? 'warn' : 'ok', `검수 준비 점검: ${r.items.length - bad.length}/${r.items.length} 준비됨${bad.length ? `. 확인할 것: ${bad.map((i) => i.name).join(', ')}` : ''}`);
  };
  const saveReport = () => {
    const who = robotMode && robot?.robotId ? `로봇 ${robot.robotId}${robot.host ? ` (${robot.host})` : ''}` : '시뮬레이터';
    const html = reportHtml({ robot: who, model: modelById(modelNow ?? DEFAULT_MODEL)?.name ?? 'myCobot 280 RDK X5', evidence: loadEvidence(), prep: prep?.items ?? null, prepAt: prep?.at ?? null });
    const d = new Date();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    a.download = `검수결과표_${robotMode && robot?.robotId ? `로봇${robot.robotId}` : '시뮬레이터'}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    addLog('ok', '검수 결과표를 저장했어요. 브라우저로 열어 인쇄(PDF 저장)할 수 있어요.');
  };
  const clearEvidence = () => {
    if (!window.confirm('지금까지의 검수 기록을 지우고 새로 시작할까요?')) return;
    saveEvidence([]);
    addLog('info', '검수 기록을 새로 시작해요.');
  };

  /** Remember that the open practice reached its goal ('sim') or ran on the robot ('robot'). */
  const mark = (what: 'sim' | 'robot') => {
    setProgress((prev) => {
      const key = markKey(here);
      if (prev[key]?.[what]) return prev;
      const next = { ...prev, [key]: { ...prev[key], [what]: Date.now() } };
      saveProgress(next);
      return next;
    });
  };

  /** After a real run finished normally: practice bookkeeping and the measured repeatability. */
  const onRealDone = useEffectEvent(() => {
    if (practice.action === 'api') session.current.apiRuns += 1;
    mark('robot');
    note(practice.check, `로봇에서 실행 완료: ${practice.title} (${LEVEL_TAB[level].name}, ${EFFECTOR_BY_ID[effector].name})`, true);
    void (async () => {
      if (!loaded) return;
      const rep = repeatability(await fetchArrivals(), (q) => tcpPositionMm(loaded.chain, q, tcpNow));
      if (!rep) return;
      // Proof for 검수 2 only from its own practice (other programs also return to the same pose).
      if (practice.check === 2) note(2, `반복 정밀도: 같은 자세 ${rep.count}번, 도착점 퍼짐 최대 ${rep.spreadMm.toFixed(2)}mm, 목표와 평균 차이 ${rep.offsetMm.toFixed(2)}mm (로봇 각도 센서 기준)`, true);
      addLog(
        'ok',
        `반복 정밀도(로봇 각도 센서 기준): 같은 자세 ${rep.count}번, 도착점 퍼짐 최대 ${rep.spreadMm.toFixed(2)}mm, 목표와 평균 차이 ${rep.offsetMm.toFixed(2)}mm`,
      );
    })();
  });
  useEffect(() => {
    let alive = true;
    let lastShown = '';
    let misses = 0;
    let everConnected = false;
    let boot = '';
    let timer = 0;
    const apply = (s: RobotState | null) => {
      if (!s) {
        misses += 1;
        // Three misses in a row (about 5 s on a slow Wi-Fi), not one slow answer, count as a lost link.
        if (misses === 3) {
          lastShown = '';
          setServerLost(true);
          setRobot((prev) => (prev ? { ...prev, connected: false } : prev));
        }
        return;
      }
      if (misses >= 3) addLog('ok', '로봇 서버와 다시 연결됐어요.');
      misses = 0;
      everConnected = true;
      setServerLost(false);
      setRobotMode(true);
      robotNow.current = s;
      live.setRobot(s);
      // The console itself re-renders only when a coarse state changed (connected, running, servos, …);
      // angles and freshness go to the live readouts only, 10 times a second.
      const shownKey = JSON.stringify({ ...s, updated: 0, age: s.age !== null && s.age < 2, angles: null, read_errors: 0 });
      if (shownKey !== lastShown) {
        lastShown = shownKey;
        setRobot(s);
      }
      // Idle, or running on the robot: the 3D arm shows the real one.
      if (s.angles && (!busyRef.current || realRunRef.current || tracker.current) && !previewing.current) {
        world.current.angles = s.angles.slice();
        world.current.version += 1;
        live.setAngles(s.angles);
      }
      if (realRunRef.current) setRunningLine(s.running && s.line ? s.line : -1);
      // The server started again (power cut, update): its run ids start over, so a run this console
      // was waiting for is gone — never wait for it.
      const restarted = !!boot && !!s.boot && s.boot !== boot;
      if (s.boot) boot = s.boot;
      if (restarted) addLog('warn', realRunId.current ? '로봇 서버가 다시 켜졌어요. 실행하던 프로그램은 멈췄어요.' : '로봇 서버가 다시 켜졌어요.');
      // Compare run ids rather than watching for running → idle: a short run can start and end between two polls.
      if (realRunId.current && (restarted || (s.run >= realRunId.current && !s.running))) {
        realRunId.current = 0;
        setRealRun(false);
        setBusy(false);
        setRunningLine(-1);
        if (s.error) {
          addLog('err', `로봇: ${s.error}`);
          setBadge({ kind: 'stop', text: '로봇 멈춤' });
        } else {
          addLog(s.message === '정지했어요.' ? 'info' : 'ok', `로봇: ${s.message}`);
          setBadge(null);
          if (s.message !== '정지했어요.' && realKind.current === 'program') onRealDone();
        }
      }
    };
    // One request at a time (a slow answer never piles up requests behind it), 10 times a second
    // with a robot; a page with no robot server behind it (the PC simulator) asks only every 3 s.
    const tick = async () => {
      // 1.5 s: a busy classroom Wi-Fi answers late now and then; three misses in a row still mean lost.
      const s = await fetchRobotState(AbortSignal.timeout(1500));
      if (!alive) return;
      apply(s);
      timer = window.setTimeout(tick, s || misses < 3 ? 100 : everConnected ? 300 : 3000);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [addLog, live]);

  /** Would a joint move from `from` to `to` keep every joint above the table? */
  const jointMoveSafe = (from: readonly number[], to: readonly number[]): boolean => {
    if (!loaded) return false;
    for (let k = 0; k <= 30; k += 1) {
      const q = from.map((a, i) => a + ((to[i] - a) * k) / 30);
      const frames = forwardKinematicsFrames(loaded.chain, q);
      if (frames.some((f, i) => i >= 1 && f.elements[14] < 0.005)) return false;
    }
    return true;
  };

  /** Send actions to the robot and lock the console until the server reports that run finished. */
  const startReal = async (actions: RobotAction[], note: string, kind: 'program' | 'check' = 'program') => {
    realKind.current = kind;
    // A gripper program on an arm without one (or a pump program with a gripper on): say so instead.
    const why = flangeRefusal(toolsUsed(actions), await readFlange());
    if (why) {
      addLog('err', `로봇: ${why}`);
      return;
    }
    const res = await runOnRobot(actions, EFFECTOR_BY_ID[effector].gripperType);
    if (!res.ok) {
      addLog('err', `로봇: ${res.error ?? '실행할 수 없어요.'}`);
      return;
    }
    realRunId.current = res.run ?? 0;
    setRealRun(true);
    setBusy(true);
    if (kind === 'program') setProgramRun(true);
    setBadge({ kind: 'real', text: '로봇 실행 중' });
    addLog('sim', note);
  };

  const runReal = async () => {
    if (!passed || !robot?.angles) return;
    let actions = passed.actions;
    const isPump = (a: RobotAction) => a.type === 'pump' || (a.type === 'timed' && a.cmd === 'pump');
    const pumpSteps = actions.filter(isPump);
    if (pumpSteps.length && !robot.pump) {
      // The robot cannot drive the pump (no GPIO library there): offer the motion alone.
      const ok = window.confirm(`로봇에서 흡착 펌프를 켤 수 없어요 (${robot.pumpError || '펌프 제어 없음'}).\n\n펌프 동작은 빼고 팔 움직임만 실행할까요?`);
      if (!ok) return;
      actions = actions.filter((a) => !isPump(a));
      addLog('info', `흡착 펌프 동작 ${pumpSteps.length}개는 빼고 움직임만 실행해요.`);
    }
    if (robot.released) {
      addLog('err', '서보가 풀려 있어요.', '패널 위 상태 표시등을 눌러 [서보 고정]을 누른 뒤 실행해 주세요.');
      return;
    }
    if (passed.start) {
      // A Python program runs from where the arm is, like on the robot itself: it was simulated from this pose.
      const off = Math.max(...robot.angles.map((a, i) => Math.abs(a - passed.start![i])));
      if (off > 3) {
        addLog('err', `시뮬레이션한 뒤 로봇 자세가 바뀌었어요 (최대 ${off.toFixed(0)}°).`, '지금 자세에서 [시뮬레이션]을 한 번 더 한 뒤 실행해 주세요.');
        setPassed(null);
        return;
      }
      if (!actions.length) return addLog('info', '로봇에 보낼 명령이 없어요.');
      await startReal(
        actions,
        tab === 'process'
          ? '로봇이 움직여요. 공정을 시뮬레이션과 같은 순서로 실행해요.'
          : level === 'ros'
            ? '로봇이 움직여요. 노드가 보낸 /joint_states 를 드라이버처럼 같은 시각에 보내요.'
            : '로봇이 움직여요. 프로그램의 명령을 시뮬레이션과 같은 시각에 보내요.',
      );
      return;
    }
    if (!jointMoveSafe(robot.angles, HOME_DEG)) {
      addLog('err', '지금 자세에서 기본 자세로 곧장 가면 팔이 책상에 닿아요.', '패널 위 상태 표시등의 [서보 풀기]로 팔을 손으로 세운 뒤 다시 실행해 주세요.');
      return;
    }
    const start = { type: 'angles' as const, angles: HOME_DEG.slice(), speed: 20, line: 0 };
    await startReal([start, ...actions], '로봇이 움직여요. 먼저 기본 자세로 천천히 간 뒤 프로그램을 시작해요.');
  };

  /** Connection check: the arm straightens slowly (every joint 0°) and stays so, seen from anywhere whatever the pose was. */
  const wiggleReal = async () => {
    if (!robot?.angles) return;
    if (robot.released) {
      addLog('warn', '서보가 풀려 있어 움직여 확인할 수 없어요.', '상태 표시등에서 관절을 고정한 뒤 다시 눌러 주세요.');
      return;
    }
    const straight = robot.angles.map(() => 0);
    if (!jointMoveSafe(robot.angles, straight)) {
      addLog('err', '지금 자세에서 곧장 펴면 팔이 책상에 닿아요.', '[서보 풀기]로 팔을 손으로 조금 세운 뒤 다시 눌러 주세요.');
      return;
    }
    await startReal([{ type: 'angles', angles: straight, speed: 25, line: 0 }], '연결 확인: 로봇이 천천히 일자로 펴져요. 주변을 비워 주세요.', 'check');
  };

  const toggleDock = () => {
    // Folded only for a run: open it again for the rest of the run.
    if (dockOpen && !dockShown) return setProgramRun(false);
    setDockOpen((o) => {
      try {
        localStorage.setItem(DOCK_KEY, o ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !o;
    });
  };

  /* --- world ------------------------------------------------------------- */
  const resetWorld = useCallback(
    (e: EffectorId = effector, flange: boolean = cameraFlange, th: Theme = theme) => {
      world.current = cellRef.current ? createCellWorld(cellRef.current.cell, cellRef.current.mission, e) : createWorld(e, flange, layout.current, th);
      setDemo(null);
      setReplay(null);
      setAnglesView(world.current.angles.slice());
    },
    [effector, cameraFlange, theme, setAnglesView],
  );

  /** Keep the camera panel on a camera that exists. */
  const fitCamView = (th: Theme, flange: boolean) => {
    setCamView((v) => (v === 'real' ? v : th === 'arm' ? (flange ? 'hand' : 'top') : v === 'hand' && !flange ? 'top' : v));
  };

  /**
   * Open a practice. The program open now is kept (in this browser, per practice), and the practice
   * opens on the program left in it before, or on its example; another level is another language
   * (`restore` brings back the one kept while its tab was closed), so nothing is lost.
   */
  const selectPractice = (lv: Level, th: Theme, id: PracticeId, restore?: string, fresh = false) => {
    if (busy) return;
    const p = practiceFor(lv, th, id);
    if (lv !== level || th !== theme || id !== practice.id) session.current.pickTools.clear();
    // A check opened from its number or the library always starts on its own example program (the one
    // the check list asks for); a program changed there before is kept aside for [내 프로그램].
    // The fitted tool stays on: a practice that needs another one asks for it ([끼우기]). A check (검수)
    // in the simulation opens set up as the check list sets the robot up — its own tool and camera
    // flange on; a real robot keeps what is fitted on it (the panel asks for the tool).
    const kitOut = !!p.check && !robotMode && !cellRef.current;
    const eff = kitOut && p.effector !== effector && activeArm().tools.includes(p.effector) ? p.effector : effector;
    const flange = cameraFlange || (kitOut && !!p.cameraFlange && activeArm().cameraFlange);
    const saved = loadProgram(activeArm().id, lv, th, p.id);
    const example = starterFor(p, eff, th);
    let program = restore ?? saved ?? example;
    const aside = !restore && !!p.check && !!saved && !isStarter(saved);
    const levelChange = lv !== level;
    keepProgram(code);
    if (levelChange) {
      kept.current[level] = { theme, id: practice.id, code };
      setLevel(lv);
      setPyOut([]);
      setPyRos(undefined);
      try {
        localStorage.setItem(LEVEL_KEY, lv);
      } catch {
        /* ignore */
      }
      if (lv !== 'basic') loadPython();
      addLog('info', FIRST_LOG[lv]);
    }
    setTheme(th);
    setPracticeId(p.id);
    fitCamView(th, flange);
    if (aside && saved) {
      program = example;
      saveAside(activeArm().id, lv, th, p.id, saved);
      saveProgram(activeArm().id, lv, th, p.id, null);
    }
    setCode(program);
    if (fresh) setTutSteps((m) => ({ ...m, [`${lv}:${p.id}`]: 0 }));
    layout.current = BLOCK_START;
    setMatNeeded(practiceUsesMat(p.id));
    dropCell();
    if (eff !== effector) setEffector(eff);
    if (flange !== cameraFlange) setCameraFlange(flange);
    world.current = createWorld(eff, flange, layout.current, th);
    setDemo(null);
    setReplay(null);
    setAnglesView(world.current.angles.slice());
    setPassed(null);
    setErrorLines([]);
    setBadge(null);
    addLog('info', `${mode === 'check' && p.check ? `[검수 ${p.check}] ` : ''}${p.title}: ${p.goal}`);
    if (eff !== effector || flange !== cameraFlange) addLog('info', `검수 ${p.check} 에 맞게 ${obj([eff !== effector && EFFECTOR_BY_ID[eff].name, flange !== cameraFlange && '카메라 플랜지'].filter(Boolean).join(' · '))} 달았어요.`);
    if (aside) addLog('info', `검수 ${p.check} 예제 프로그램으로 열었어요. 전에 고친 프로그램은 [내 프로그램]으로 다시 불러와요.`);
  };

  /**
   * Open another arm: its theme (the AI Kit is modelled for the 280 only), a tool it can carry,
   * its ready pose, and the practice's starter for it when the program was still the starter.
   */
  const switchArm = (next: RobotModelId) => {
    const to = armById(next);
    if (to.id === activeArm().id) return;
    const untouched = !code.trim() || isStarter(code);
    keepProgram(code);
    setActiveArm(to.id);
    // The G base is Elephant Robotics' accessory: OMX-F and MG400 stand on their own bases.
    if (to.family === 'omx' || to.family === 'mg400') setMount((m) => ({ ...m, on: false }));
    const th: Theme = to.kit ? theme : 'arm';
    const e: EffectorId = to.tools.includes(effector) ? effector : to.tools.includes('none') ? 'none' : to.tools[0];
    const p = practiceFor(level, th, practiceId);
    setTheme(th);
    setEffector(e);
    setCameraFlange(false);
    fitCamView(th, false);
    setPracticeId(p.id);
    const kept = p.id === 'demo' ? null : loadProgram(to.id, level, th, p.id);
    if (kept !== null || untouched) setCode(kept ?? starterFor(p, e, th));
    layout.current = BLOCK_START;
    dropCell();
    world.current = createWorld(e, false, layout.current, th);
    setDemo(null);
    setReplay(null);
    setAnglesView(world.current.angles.slice());
    setPassed(null);
    setErrorLines([]);
    setBadge(null);
    addLog('info', `${obj(to.name)} 열었어요 (${to.board}). 관절 범위 · 기본 자세 · 파이썬 클래스(${to.sdk.cls})가 이 로봇팔에 맞춰졌어요.`);
  };

  const changeTool = (next: EffectorId, flange: boolean) => {
    if (busy) return;
    const unchanged = isStarter(code);
    setEffector(next);
    setCameraFlange(flange);
    fitCamView(theme, flange);
    world.current = cellRef.current ? createCellWorld(cellRef.current.cell, cellRef.current.mission, next) : createWorld(next, flange, layout.current, theme);
    setDemo(null);
    setReplay(null);
    setAnglesView(world.current.angles.slice());
    if (unchanged && !cellRef.current) setCode(starterFor(practice, next, theme));
    setPassed(null);
    setErrorLines([]);
    setBadge(null);
    if (next !== effector) addLog('info', next === 'none' ? '도구를 뺐어요. 이제 끝 플랜지만 있어요.' : `${obj(EFFECTOR_BY_ID[next].name)} 달았어요.`);
    else addLog('info', flange ? '카메라 플랜지를 달았어요. 손 카메라를 쓸 수 있어요.' : '카메라 플랜지를 뗐어요.');
  };

  const shuffle = () => {
    if (busy) return;
    layout.current = randomBlockLayout();
    resetWorld();
    setPassed(null);
    addLog('info', '블록을 섞었어요. 카메라로 찾아서 옮겨 보세요.');
  };

  /* --- 작업대 꾸미기 ------------------------------------------------------ */
  // The desk is the setup (for this session: every start is 빈 화면); the world holds where things are
  // now (physics or the tool may have moved them). An edit changes both; the world gets a new objects
  // list, so the physics is rebuilt.
  const commitDesk = (next: Desk) => {
    setDesk(next);
    setActiveDesk(next);
  };
  const objectsToWorld = (fn: (list: DeskObject[]) => DeskObject[]) => {
    const w = world.current;
    if (w.theme !== 'arm') return;
    w.objects = fn(w.objects);
    w.version += 1;
  };
  /** An object with its bottom on whatever is under it. */
  const settled = (d: Desk, o: DeskObject): DeskObject => ({ ...o, q: undefined, z: restingZ(d.scene, d.objects, o) });
  const deskScene = (id: SceneId) => {
    if (busy) return;
    setDeskSel(null);
    setDemo(null);
    if (id === 'kit') {
      if (theme !== 'kit') {
        openKeeping(level, 'kit');
        // The kit comes out with the camera's board clear: one object at a time to pick (practices
        // opened from 검수 or the library still lay their blocks out).
        kitClear();
        addLog('info', 'AI 키트를 불러왔어요. 블록은 보관함에 있어요.', '[블록 1개 놓기]로 카메라 칸에 하나씩 놓고 집어 보세요.');
      }
      return;
    }
    const next: Desk = { ...desk, scene: id, objects: sceneObjects(id) };
    commitDesk(next);
    if (theme === 'kit') openKeeping(level, 'arm');
    else {
      const w = world.current;
      w.scene = id;
      w.fixed = SCENE_FIXED[id];
      objectsToWorld(() => next.objects.map((o) => ({ ...o })));
    }
  };
  /** The kit's blocks into the storage box: the camera's board clear. */
  const kitClear = () => {
    const w = world.current;
    if (w.theme !== 'kit') return;
    for (const b of w.blocks) Object.assign(b, { x: BLOCK_STORED[b.color].x, y: BLOCK_STORED[b.color].y, z: STORAGE_BOX.floorZ + BLOCK_MM / 2, yawDeg: 0 });
    w.held = null;
    w.version += 1;
    setPassed(null);
  };
  /** One block from the storage box onto the board: its middle, or the next start place still free. */
  const kitPlaceOne = () => {
    const w = world.current;
    if (busy || w.theme !== 'kit') return;
    const stored = w.blocks.find((b) => Math.hypot(b.x - BLOCK_STORED[b.color].x, b.y - BLOCK_STORED[b.color].y) < 1);
    if (!stored) return addLog('warn', '보관함에 남은 블록이 없어요.', '[처음 상태로]를 누르면 블록이 처음 자리로 돌아가요.');
    const spots = [{ x: CAL_BOARD.x, y: CAL_BOARD.y }, ...Object.values(BLOCK_START)];
    const free = spots.find((s) => w.blocks.every((b) => b === stored || Math.hypot(b.x - s.x, b.y - s.y) > BLOCK_MM + 8));
    if (!free) return addLog('warn', '카메라 칸에 블록을 놓을 빈 자리가 없어요.');
    Object.assign(stored, { x: free.x, y: free.y, z: BLOCK_MM / 2, yawDeg: 0 });
    w.version += 1;
    setPassed(null);
    addLog('info', `${obj(`${stored.color} 블록`)} 카메라 칸에 놓았어요.`);
  };
  const deskAdd = (kind: ObjectKind) => {
    if (busy) return;
    const o0 = makeObject(kind, freeSpot(desk.scene, world.current.objects, kind));
    const next: Desk = { ...desk, objects: [...desk.objects, o0] };
    const o = settled(next, o0);
    next.objects[next.objects.length - 1] = o;
    commitDesk(next);
    objectsToWorld((list) => [...list, { ...o }]);
    setDeskSel(o.id);
  };
  const deskUpdate = (id: string, patch: Partial<DeskObject>) => {
    if (busy) return;
    const objects = desk.objects.map((o) => (o.id === id ? { ...o, ...patch } : o));
    const next: Desk = { ...desk, objects };
    const placed = settled(next, objects.find((o) => o.id === id)!);
    next.objects = objects.map((o) => (o.id === id ? placed : o));
    commitDesk(next);
    objectsToWorld((list) => list.map((o) => (o.id === id ? { ...placed } : o)));
  };
  /** While an object is dragged in 3D: only the world moves (the desk is saved when it is let go). */
  const deskDrag = (id: string, x: number, y: number) => {
    if (busy) return;
    objectsToWorld((list) => list.map((o) => (o.id === id ? { ...o, x, y, q: undefined, z: restingZ(desk.scene, list, { ...o, x, y }) } : o)));
  };
  const deskRemove = (id: string) => {
    if (busy) return;
    commitDesk({ ...desk, objects: desk.objects.filter((o) => o.id !== id) });
    objectsToWorld((list) => list.filter((o) => o.id !== id));
    setDeskSel(null);
  };
  const deskClear = () => {
    if (busy) return;
    commitDesk({ ...desk, objects: [] });
    objectsToWorld(() => []);
    setDeskSel(null);
  };
  const deskMat = (on: boolean) => {
    if (busy) return;
    const next = { ...desk, mat: on };
    commitDesk(next);
    resetWorld();
  };

  /* --- ▶ 데모 ----------------------------------------------------------------- */
  /**
   * ▶ 데모 of a 실습 환경: the scene put out as it comes (the demo's tool on), then its block
   * program played on the simulated arm — never on a connected robot — under the caption bar's four steps.
   */
  const playDemo = async (scene: SceneId) => {
    if (busy || !loaded) return;
    const name = SCENES.find((s) => s.id === scene)?.name ?? '';
    if (!demoFits(scene, arm)) return addLog('info', `${name} 데모는 아직 ${arm.name} 에 맞춘 것이 없어요.`);
    const d = demoFor(scene, arm);
    const th: Theme = scene === 'kit' ? 'kit' : 'arm';
    setRailOpen(null);
    setDeskSel(null);
    setGoalCard(null);
    if (th === 'arm') commitDesk({ ...desk, scene, objects: sceneObjects(scene), mat: false });
    if (th !== theme) {
      // The other environment's task list: the same task when it has one (the program stays as it is).
      const list = practicesFor(level, th);
      const same = practiceId === 'demo' && level === 'basic' ? practice : (list.find((p) => (practice.check ? p.check === practice.check : p.id === practice.id)) ?? list[0]);
      setPracticeId(same.id);
      setTheme(th);
    }
    setEffector(d.effector);
    setCameraFlange(false);
    fitCamView(th, false);
    layout.current = BLOCK_START;
    // The demo's own desk: no practice mat or blocks in the way.
    setMatNeeded(false);
    dropCell();
    world.current = createWorld(d.effector, false, BLOCK_START, th);
    setReplay(null);
    setPassed(null);
    setErrorLines([]);
    setBadge(null);
    setAnglesView(world.current.angles.slice());
    const { steps } = parse(d.code);
    // Played through at once first (this arm, on its base as set): a demo that cannot finish does not start.
    const probe = createWorld(d.effector, false, BLOCK_START, th);
    try {
      await runProgram(steps, { chain: loaded.chain, world: probe, poses, animate: instantAnimate, see: async (_c, color) => probe.blocks.find((b) => b.color === color) ?? null });
    } catch (err) {
      addLog('err', `${name} 데모를 이 로봇팔로는 끝까지 할 수 없어요. ${err instanceof Error ? err.message : String(err)}`, mount.on ? '받침대(G 베이스)를 떼고 다시 해 보세요.' : undefined);
      return;
    }
    setDemo({ scene, step: 0, playing: true });
    addLog('sim', `${name} 데모예요. 화면 속 로봇만 움직여요.`);
    const { ok, stopped } = await execute((h) => runProgram(steps, h), {
      reset: false,
      quiet: true,
      onLine: (line) => setDemo((s) => (s?.playing ? { ...s, step: demoStepAt(d, line) } : s)),
    });
    // The place stays as the demo left it, but the open task's progress does not count it.
    world.current.stats = emptyStats(world.current.angles);
    if (stopped) setBadge(null);
    setDemo((s) => (s ? { ...s, playing: false, step: ok ? d.steps.length - 1 : s.step } : s));
  };
  /** [■ 그만] / [닫기] on the caption bar. */
  const stopDemo = () => {
    if (demo?.playing && token.current) token.current.aborted = true;
    setDemo(null);
  };
  /** The demo as a block program in 블록 코딩, ready to run or change. */
  const openDemoBlocks = (scene: SceneId) => {
    selectPractice('basic', scene === 'kit' ? 'kit' : 'arm', 'demo', demoFor(scene, arm).code);
    chooseTab('basic');
  };
  const demoToBlocks = () => {
    if (!demo) return;
    if (!demo.playing) return openDemoBlocks(demo.scene);
    // Still playing: stop it, and open the program once it has stopped.
    demoBlocksPending.current = demo.scene;
    if (token.current) token.current.aborted = true;
  };
  const openPendingDemo = useEffectEvent(() => {
    const scene = demoBlocksPending.current;
    demoBlocksPending.current = null;
    if (scene) openDemoBlocks(scene);
  });
  useEffect(() => {
    if (!busy) openPendingDemo();
  }, [busy]);

  /* --- running ------------------------------------------------------------ */
  const animate = useCallback((durationS: number, frame: (t: number) => void) => {
    const tk = token.current;
    // Simulation speed (×1 ×2 ×4): the simulated time runs that much faster than the clock.
    const rate = simRateRef.current;
    return new Promise<void>((resolve, reject) => {
      // Time runs with the clock, but at most a quarter second a frame: on a slow computer the
      // motion slows down rather than jumps (the cell's physics keeps the same pace).
      let t = 0;
      let last = performance.now();
      // After 정지 the arm runs on a little, slowing down, as the real one does (about 3° from speed 10):
      // the same move goes on with its clock slowing to a halt over coastS.
      let coast: { s: number; left: number } | null = null;
      const step = (now: number) => {
        // (Nothing moves while the scene is held for a 예측.)
        let dt = (Math.min(now - last, 250) / 1000) * (heldRef.current ? 0 : rate);
        if (tk?.aborted && !coast) {
          const at = world.current.angles.slice();
          const ahead = Math.min(durationS, t + 0.02);
          let fastest = 0;
          try {
            frame(ahead);
            fastest = Math.max(0, ...world.current.angles.map((q, i) => Math.abs(q - at[i]) / Math.max(1e-6, ahead - t)));
            frame(t);
          } catch {
            fastest = 0;
          }
          const s = ahead > t ? fastest / ARM_STOP_DEC_DEG_S2 : 0;
          if (s < 0.02) return reject(new Stop());
          coast = { s, left: s };
        }
        if (coast) {
          // The clock slows evenly to a stop: the move covers half of what it would at full pace.
          const was = coast.left;
          coast.left = Math.max(0, coast.left - dt);
          dt = (was * was - coast.left * coast.left) / (2 * coast.s);
          if (coast.left <= 0 || t >= durationS) {
            const end = Math.min(durationS, t + dt);
            try {
              frame(end);
              if (cellClock.current.on && end > t) cellClock.current.steps.push({ dt: end - t, angles: world.current.angles.slice() });
              t = end;
            } catch {
              /* stopped against something: it stays where it is */
            }
            return reject(new Stop());
          }
        }
        const next = Math.min(durationS, t + dt);
        last = now;
        try {
          const sub = subRef.current;
          const ck = cellClock.current;
          // One step of the move: the pose at u, handed to the cell with the time since the last (입문).
          const one = (u: number) => {
            frame(u);
            if (ck.on && u > t) ck.steps.push({ dt: u - t, angles: world.current.angles.slice() });
            t = u;
          };
          if (sub > 0) for (let u = t + sub; u < next; u += sub) one(u);
          one(next);
        } catch (err) {
          return reject(err);
        }
        if (t < durationS) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }, []);

  const see = async (camera: CameraId, color: ColorName) => {
    // The small camera picture shows this camera; the big camera panel opens only when asked.
    if (camera !== camView) setCamView(camera);
    // Let one frame render so the scene shows the current pose.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const frame = stageApi.current?.capture(camera);
    if (!frame) return null;
    session.current.cameras.add(camera);
    cams.current?.mark(color);
    cams.current?.push(camera, frame, true);
    const hit = analyse(camera, frame).detections.find((d) => d.color === color);
    return hit?.robot ?? null;
  };

  /** Run something on the simulated world (a block program, one control-panel step, a Python timeline). */
  /** `program`: the program run is not the editor's (a hand demonstration): its lines are not marked in the editor. */
  const execute = async (run: (hooks: RunHooks) => Promise<unknown>, opts: { reset: boolean; label?: boolean; start?: number[]; quiet?: boolean; onLine?: (line: number) => void; program?: string }) => {
    if (!loaded) return { ok: false, stopped: false, actions: [] as RobotAction[], error: undefined as string | undefined };
    const own = opts.program === undefined;
    if (opts.label) setRunText(own ? null : opts.program!);
    const tk = { aborted: false };
    token.current = tk;
    setBusy(true);
    if (opts.reset) resetWorld();
    if (opts.start) world.current.angles = opts.start.slice();
    setReplay(null);
    setGoalCard(null);
    // A program run is recorded (about 30 frames a second) for the timeline under the 3D view.
    const rec = opts.label ? { frames: [snapshot(world.current, 0)], marks: [] as Replay['marks'], base: 0, cur: 0 } : null;
    const recordFrame = (t: number) => {
      if (!rec) return;
      rec.cur = t;
      const at = rec.base + t;
      if (at - rec.frames[rec.frames.length - 1].t >= 1 / 30) rec.frames.push(snapshot(world.current, at));
    };
    const actions: RobotAction[] = [];
    let ok = false;
    let stopped = false;
    let error: string | undefined;
    try {
      await run({
        chain: loaded.chain,
        world: world.current,
        poses,
        animate: rec
          ? (d, frame) =>
              animate(d, (t) => {
                frame(t);
                recordFrame(t);
              }).finally(() => {
                rec.base += d;
                rec.cur = 0;
              })
          : animate,
        see,
        onLine: opts.label
          ? (line) => {
              if (own) setRunningLine(line);
              rec?.marks.push({ t: rec.base + rec.cur, line });
            }
          : opts.onLine,
        // quiet: only errors (a manual tool button on the real robot — the picture has no real blocks to report on)
        log: (kind, msg) => (opts.quiet && kind !== 'err' ? undefined : addLog(kind, msg)),
        record: (a) => actions.push(a),
      });
      ok = true;
    } catch (err) {
      if (err instanceof Stop) {
        stopped = true;
        addLog('info', '정지했어요.');
        setBadge({ kind: 'stop', text: '정지' });
      } else if (err instanceof RunError) {
        addLog('err', `${err.line ? `${err.line}번째 줄: ` : ''}${err.message}`, err.fix);
        setBadge({ kind: 'stop', text: err.collision ? '부딪혀서 멈춤' : '멈춤' });
        if (err.line && own) setErrorLines([err.line]);
        error = `${err.line && !own ? `'${(opts.program!.split('\n')[err.line - 1] ?? '').trim()}' 에서 ` : ''}멈췄어요: ${err.message}`;
      } else {
        addLog('err', `예상하지 못한 오류: ${err instanceof Error ? err.message : String(err)}`);
        error = '예상하지 못한 오류로 멈췄어요.';
      }
    } finally {
      token.current = null;
      setBusy(false);
      setRunningLine(-1);
      cams.current?.mark(null);
      setAnglesView(world.current.angles.slice());
      if (goalPending.current) {
        setGoalCard(goalPending.current);
        goalPending.current = null;
      }
      if (rec) {
        const end = rec.base + rec.cur;
        rec.frames.push(snapshot(world.current, end));
        if (end > 0.2 && rec.marks.length) setReplay({ frames: rec.frames, marks: rec.marks, duration: end, trail: world.current.trail.map((s) => s.slice()) });
      }
    }
    return { ok, stopped, actions, error };
  };

  const problemsFor = (text: string): { steps: Step[]; errors: Problem[]; warnings: Problem[] } => {
    const { steps, errors: pe } = parse(text);
    const { errors: ce, warnings } = check(steps, { theme, effector, cameraFlange, poses, cell: cellAt?.cell });
    return { steps, errors: [...pe, ...ce], warnings };
  };

  // The see-through end pose (블록 코딩): the program run at once on a copy of the world, a moment
  // after the last edit. Programs that look with a camera stop at the first look.
  // 실습 셀: hooks for the page's console (screen captures and checks): run the step's reference
  // program, read the world, turn the view, load a recorded state, show name tags.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the hooks take this render's functions
  useEffect(() => {
    if (!cellAt) return;
    const w = window as unknown as { __cellRun?: (text?: string) => void; __cellWorld?: () => WorldState };
    w.__cellRun = (text) => {
      const { steps, errors } = problemsFor(text ?? ((cellAt.mission && missionById(cellAt.mission)?.solution) || ''));
      if (!errors.length) void runSteps(steps, { reset: true, label: true });
      else console.error(JSON.stringify(errors));
    };
    w.__cellWorld = () => world.current;
    (w as { __cellView?: (n: ViewName) => void }).__cellView = (n) => stageApi.current?.view(n);
    (w as { __cellZoom?: (d: 1 | -1) => void }).__cellZoom = (d) => stageApi.current?.zoom(d);
    (w as { __cellTags?: (t: string[]) => void }).__cellTags = setCellTags;
    // A cell state recorded elsewhere (tests/simulator), shown as it was: for still pictures.
    (w as { __cellLoad?: (s: { angles: number[]; gap: number; objects: WorldState['objects']; carry: WorldState['carry']; line: object; alerts: object[]; halt: unknown; fault: unknown; load: number[] }) => void }).__cellLoad = (s) => {
      const cw = world.current;
      if (!cw.cell) return;
      cw.angles = s.angles.slice();
      cw.gapMm = s.gap;
      cw.objects = s.objects;
      cw.carry = s.carry;
      cw.cell = { ...cw.cell, line: s.line, alerts: s.alerts, halt: s.halt, health: { ...cw.cell.health, fault: s.fault, load: s.load } } as typeof cw.cell;
      cw.version += 1;
      setAnglesView(cw.angles.slice());
    };
  });

  const ghostWanted = !!loaded && !cellAt && level === 'basic' && tab !== 'direct' && !busy && display.ghost;
  useEffect(() => {
    if (!ghostWanted || !loaded) return;
    const text = code;
    const run = { cancelled: false };
    const id = window.setTimeout(() => {
      const { steps, errors } = problemsFor(text);
      if (errors.length) return setGhost(null);
      const w = createWorld(effector, cameraFlange, layout.current, theme);
      // A coarse playback (12 frames a second of motion), in slices of ~10 ms so the page never
      // stalls; given up after 3 s, or when the program changes again.
      const t0 = performance.now();
      let slice = t0;
      const coarse = async (d: number, frame: (t: number) => void) => {
        const n = Math.max(1, Math.ceil(d * 12));
        for (let k = 1; k <= n; k += 1) {
          frame((d * k) / n);
          if (performance.now() - slice > 10) {
            await new Promise((r) => window.setTimeout(r, 0));
            slice = performance.now();
            if (run.cancelled || slice - t0 > 3000) throw new Stop();
          }
        }
      };
      void runProgram(steps, { chain: loaded.chain, world: w, poses, animate: coarse, see: async () => null }).then(
        () => !run.cancelled && setGhost({ code: text, angles: w.angles.slice() }),
        (err) => !run.cancelled && setGhost(err instanceof Stop ? null : { code: text, angles: w.angles.slice() }),
      );
    }, 450);
    return () => {
      run.cancelled = true;
      window.clearTimeout(id);
    };
    // problemsFor reads the same state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostWanted, code, effector, cameraFlange, theme, poses, loaded]);

  const runSteps = (steps: Step[], opts: { reset: boolean; label?: boolean; quiet?: boolean }) => execute((h) => runProgram(steps, h), opts);

  /** After a run passed: the gate opens and the practice reports. */
  // Fitted to the example as it stands here: only places it has, only snippets that work with the
  // fitted tool and on this desk (no new problem in a block program).
  const tut = useMemo(() => {
    const example = starterFor(practice, effector, theme);
    const ctx = { theme, effector, cameraFlange, poses };
    const known = level === 'basic' ? new Set(check(parse(example).steps, ctx).errors.map((e) => e.msg)) : null;
    const fits = known
      ? (next: string) => {
          const r = parse(next);
          return !r.errors.length && check(r.steps, ctx).errors.every((e) => known.has(e.msg));
        }
      : undefined;
    return tutorialFor(level, theme, practice.id, { example, fits });
  }, [level, theme, practice, effector, cameraFlange, poses]);
  const tutKey = `${level}:${practice.id}`;
  const tutStep = Math.min(tutSteps[tutKey] ?? 0, tut.steps.length - 1);
  const setTutStep = (k: number) => setTutSteps((m) => ({ ...m, [tutKey]: Math.max(0, Math.min(tut.steps.length - 1, k)) }));
  // What to do now, on the situation board over the 3D view (the panel keeps the controls): the
  // tutorial's step while its code is open, pointing at the button the step names.
  const tutNow = tut.steps[tutStep];
  // A check's program kept aside when it opened on its example ([내 프로그램]).
  const mine = practice.check && restored ? loadAside(arm.id, level, theme, practice.id) : null;
  const guide: Guide | null =
    !cellAt && !armTermOn && view === 'sim' && (tab === 'basic' || tab === 'python' || tab === 'ros')
      ? {
          head: `${tutStep + 1}/${tut.steps.length} · ${tutNow.title}`,
          text: tutNow.text,
          onNext: tutStep < tut.steps.length - 1 ? () => setTutStep(tutStep + 1) : undefined,
          hint: namedButtons(tutNow.text).length ? namedButtons(tutNow.text) : tutNow.slots.length ? [] : ['시뮬레이션'],
        }
      : null;
  /** 입문 트랙: the step's goal on the notice board (what to do now), its first check in one line. */
  const lifeStep = track && cellAt?.mission ? missionById(cellAt.mission) : null;
  // 입문: no base axes while a place runs or is toured (the close-up cameras put them over the cup or the pen).
  const axesQuiet = !!track && !!cellAt && (busy || !!touring);
  const stageDisplay = useMemo(() => (axesQuiet ? { ...display, baseAxes: false } : display), [axesQuiet, display]);
  const lifeGuide: Guide | null = lifeStep && view === 'sim' ? { head: `${lifeStep.n}단계 · ${lifeStep.title}`, text: `목표 ${lifeStep.checks?.[0]?.label ?? lifeStep.goal}` } : null;
  // 입문 퀘스트 모드: a place's step (or a 기초 조작 tutorial) is a quest — 브리핑 → 해 보기 → 실행 · 관찰 → 결과.
  // The quest card (top left) says what to do now; the side panel follows the phase; the left menu folds away.
  const questOn = !!track && (!!lifeStep || !!lifeTut);
  const questQ = lifeStep ? QUESTS[lifeStep.id] : undefined;
  const questPhase: QuestPhase | null =
    lifeStep && cellAt ? (busy ? 'run' : cellResult !== null && lastChecks ? 'result' : 'do') : null;
  // The card to change lights while there is something to do (not over a passed result).
  const questGlow = (questPhase === 'do' || (questPhase === 'result' && !cellResult)) && questQ ? questQ.cards : undefined;
  const questGlowAdd = (questPhase === 'do' || (questPhase === 'result' && !cellResult)) && !!questQ?.add;
  // 예측 (and 미리보기's O · X) at its moment: while a quest runs, the scene holds still when a
  // question's moment comes (guides.ts askNow) until the student answers over it; each once (this browser).
  const answeredRef = useRef<(key: string) => boolean>(() => false);
  answeredRef.current = (key) => preds[key] !== undefined || !!skipped[key];
  const askId = busy && questOn && lifeStep && asksOf(lifeStep.id).some((a) => preds[a.key] === undefined && !skipped[a.key]) ? lifeStep.id : null;
  useEffect(() => {
    if (!askId) return;
    const id = window.setInterval(() => {
      const run = world.current.cell;
      if (heldRef.current || !run || run.mission !== askId) return;
      const due = askNow(run, world.current, (k) => answeredRef.current(k));
      if (!due) return;
      heldRef.current = true;
      setMoment({ ...due, ox: !!guideOf(askId)?.asks });
    }, 40);
    return () => window.clearInterval(id);
  }, [askId]);
  const letGo = () => {
    heldRef.current = false;
    setMoment(null);
  };
  const passedRun = (text: string, actions: RobotAction[], start?: number[]) => {
    if (tab === 'process') markStart('process');
    else if (tab === 'basic') markStart('code');
    // A passed run of a coding tutorial moves it on to its next step.
    if (tab !== 'process' && tutStep < tut.steps.length - 1) setTutStep(tutStep + 1);
    setBadge(null);
    setPassed({ code: text, actions, start });
    // 도구 2종 counts only the tools used in this practice (another practice's pump run is not a swap).
    if (practice.id === 'tools' && placedBlocks(world.current) > 0) session.current.pickTools.add(effector);
    const m = practice.progress(world.current, session.current);
    addLog('ok', m.total && m.done >= m.total ? `실습 목표 달성! (${m.title}) 로봇에서 실행할 수 있어요.` : '시뮬레이션 성공! 로봇에서 실행할 수 있어요.');
    if (practice.id === 'tools' && session.current.pickTools.size === 1) {
      addLog('info', '이제 왼쪽 [도구]에서 다른 도구(흡착 펌프 또는 그리퍼)로 바꿔 한 번 더 해 보세요.');
    }
  };

  /**
   * 중급·고급: run the program in Python (web worker, simulated time), then
   * play its timed commands in 3D with the collision checks. On the robot the
   * program starts from the real arm's pose, as it would there.
   */
  /** The console's log, printed in the terminal while python3 runs there. */
  const sinkTo =
    (print: (l: TermLine) => void) =>
    (kind: LogKind, raw: string, fix?: string) => {
      // A cell alert comes as "주의 · 핀 걸림: …": the terminal's own [주의] / [오류] says the level.
      const msg = raw.replace(/^(알림|주의|정지|고장) · /, '');
      if (kind === 'err') {
        print({ text: `[오류] ${msg}`, tone: 'err' });
        if (fix) print({ text: `  → ${fix}`, tone: 'info' });
      } else print({ text: kind === 'warn' ? `[주의] ${msg}` : msg, tone: kind === 'warn' ? 'warn' : kind === 'ok' ? 'ok' : 'out' });
    };
  /** Run the Python program (the code mode's, or a file python3 runs in the terminal, printing there). */
  const simulatePy = async (file?: { text: string; name: string; print: (l: TermLine) => void }): Promise<PyEnd | null> => {
    if (!loaded || busy || level === 'basic') return null;
    if (!file) return runPy(code);
    termSink.current = sinkTo(file.print);
    try {
      return await runPy(file.text, file);
    } finally {
      termSink.current = null;
    }
  };
  const runPy = async (text: string, file?: { name: string; print: (l: TermLine) => void }): Promise<PyEnd | null> => {
    if (!loaded || level === 'basic') return null;
    setProgramRun(true);
    const start = robotMode && robot?.angles ? robot.angles.slice() : arm.home.slice();
    setErrorLines([]);
    setPassed(null);
    setBusy(true);
    setBadge({ kind: 'sim', text: '파이썬 실행 중' });
    addLog('sim', pyStatus ? '파이썬을 불러오는 중이에요. 준비되면 바로 실행해요…' : '파이썬 프로그램을 실행해요.');
    let r: PyResult;
    try {
      r = await runPython(text, { robot: loaded.robot, startAngles: start, mode: level, armId: arm.id });
    } catch (err) {
      setBusy(false);
      setBadge({ kind: 'stop', text: '멈춤' });
      addLog('err', err instanceof Error ? err.message : String(err));
      return 'error';
    } finally {
      setPyStatus('');
    }
    setBusy(false);
    setPyOut(r.output);
    setPyRos(r.ros);
    if (r.ros) session.current.lastRos = r.ros;
    // In the terminal: what the program printed, then Python's own error report.
    if (file) {
      for (const o of r.output) for (const line of o.text.replace(/\n$/, '').split('\n')) file.print({ text: line, tone: 'out' });
      if (r.error) {
        file.print({ text: 'Traceback (most recent call last):', tone: 'err' });
        if (r.error.line) file.print({ text: `  File "${file.name}", line ${r.error.line}, in <module>`, tone: 'err' });
        file.print({ text: `${r.error.type}: ${r.error.message}`, tone: 'err' });
        if (r.error.hint) file.print({ text: `  → ${r.error.hint}`, tone: 'info' });
      }
    }
    const e = r.ok ? null : r.error;
    const postError = () => e && !file && addLog('err', `${e.line ? `${e.line}번째 줄: ` : ''}${e.type}: ${e.message}`, e.hint);
    if (e) {
      if (e.line) setErrorLines([e.line]);
      setBadge({ kind: 'stop', text: '오류' });
      // Commands issued before the error still play, so the student sees how far it got; the
      // error is posted after them (the last notice on the board).
      if (!r.events.length) {
        postError();
        return 'error';
      }
    }
    // The whole timeline is checked first: a run that would fold the arm into itself does not start.
    const preWorld = createWorld(effector, cameraFlange, layout.current, theme);
    preWorld.angles = start.slice();
    const pre = await preflight((h) => playTimeline(r, h), { chain: loaded.chain, world: preWorld, poses });
    if (pre) {
      postError();
      refuseRun(pre);
      return 'error';
    }
    const moves = r.events.filter((ev) => ev.kind === 'move').length;
    addLog('sim', `${r.endT.toFixed(1)}초 동안 명령 ${r.events.length}개 (움직임 ${moves}개). 3D 로 재생하며 충돌을 검사해요.`);
    if (!r.ok) setBadge({ kind: 'sim', text: '오류 전까지 재생' });
    else setBadge({ kind: 'sim', text: '시뮬레이션' });
    const { ok, stopped, actions } = await execute(
      async (h) => {
        for (const a of await playTimeline(r, h)) h.record!(a);
      },
      { reset: true, label: true, start },
    );
    if (stopped) {
      file?.print({ text: 'KeyboardInterrupt', tone: 'warn' });
      return 'stopped';
    }
    if (!r.ok) {
      postError();
      setBadge({ kind: 'stop', text: '오류' });
      return 'error';
    }
    if (ok) passedRun(text, actions, start);
    file?.print({ text: ok ? `[끝] ${r.endT.toFixed(1)}초 동안 명령 ${r.events.length}개를 3D 로 실행했어요` : '[멈춤] 3D 실행이 도중에 멈췄어요', tone: ok ? 'ok' : 'warn' });
    return ok ? 'pass' : 'error';
  };

  /** The planned path folds the arm into itself: nothing moves; the notice names the joint to change. */
  const refuseRun = (err: SelfCollision) => {
    addLog('err', `실행하지 않았어요. ${err.line ? `${err.line}번째 줄: ` : ''}${err.message}`, err.fix);
    setBadge({ kind: 'stop', text: '팔이 부딪혀서 실행 안 함' });
    if (err.line) setErrorLines([err.line]);
    setPassed(null);
  };

  /* --- 공정 짜기 ------------------------------------------------------------ */
  // The practice-led process (plan.ts): the places and rules make the rows. Places are the tip as
  // the robot reports it (from its base), the solver works on the table: a base under the robot lifts them.
  const solver = useMemo<Solver | null>(() => {
    if (!loaded) return null;
    const solve = makeSolver(loaded.chain, tcpFor(effector, cameraFlange));
    return (at, seed, keep) => solve({ ...at, z: at.z + mountMm }, seed, keep);
  }, [loaded, effector, cameraFlange, mountMm]);
  const plan = activePlan(flow);
  const planKey = JSON.stringify([plan, flow.rules, flow.startJoints]);
  const built = useMemo<Built>(
    () => (solver ? buildPlan(plan, flow.rules, solver, flow.startJoints) : { rows: [], cycle: [], times: 0, blend: 'tick', problems: [], notes: [], marks: [], path: [] }),
    // planKey stands for the plan, the rules and the start pose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [solver, planKey],
  );
  // Not 직접 짜기: the rows are the plan's (kept in the process, so it runs, exports and is saved as ever).
  useEffect(() => {
    if (!restored || flow.mode === 'free') return;
    const next: Process = { name: practiceOf(flow.kind).name, blend: built.blend, speed: proc.speed, rows: built.rows };
    if (processToFile(next) !== processToFile(proc)) changeProcess(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built, flow.mode, flow.kind, restored]);
  /** The practice's blocks where the plan picks them (simulator, arm-only desk). */
  const placePracticeBlocks = () => {
    if (busy || practiceOf(flow.kind).group !== 'carry') return;
    layout.current = blockLayout(activePlan(flow));
    resetWorld();
  };
  /** 이 실습으로 시작: the practice's tool on (simulator) and its blocks where it picks them. */
  const startPractice = (kind: PlanKind) => {
    if (busy) return;
    const prac = practiceOf(kind);
    if (prac.group === 'carry') layout.current = blockLayout(flow.plans[kind] ?? freshPlan(kind));
    const fits = prac.tool === 'grip' ? EFFECTOR_BY_ID[effector].kind === 'grip' : effector === 'pen';
    if (!robotMode && !fits) changeTool(prac.tool === 'grip' ? 'adaptive' : 'pen', cameraFlange);
    else resetWorld();
  };
  const goTip = (at: Spot, what: string) => {
    if (!solver) return;
    const r = solver(at, basePose());
    if (!r) return addLog('err', `${what}: 도구를 아래로 향한 채 닿을 수 없어요.`, '로봇에 더 가까운 곳이나 더 높은 곳으로 바꿔 주세요.');
    void goJoints(r.joints, what);
  };
  const saveProcessFile = () => {
    const blob = new Blob([processToFile(proc)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${proc.name.replace(/[\\/:*?"<>|]/g, '_') || '공정'}${PROCESS_EXT}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    addLog('info', `공정 파일로 저장했어요: ${a.download}`);
  };
  const openProcessFile = async (file: File | undefined) => {
    if (!file) return;
    const r = processFromFile(await file.text());
    if ('error' in r) return addLog('err', `${file.name}: ${r.error}`);
    changeProcess(r.process);
    // Rows from a file are not made from places: they are edited as rows.
    setFlow({ ...flow, mode: 'free', step: 3 });
    addLog('info', `공정 파일을 열었어요: ${r.process.name} (${r.process.rows.length}줄) · 직접 짜기에서 고칠 수 있어요.`);
  };

  const changeProcess = (p: Process) => {
    setProc(p);
    setErrorLines([]);
    try {
      localStorage.setItem(PROCESS_KEY, processToFile(p));
    } catch {
      /* this session only */
    }
  };
  const canGrip = EFFECTOR_BY_ID[effector].kind === 'grip';
  /** The whole process from where the arm is now, as a pendant runs it; on passing, the robot step opens. */
  const simulateProcess = async () => {
    if (!loaded || busy) return;
    if (flow.mode !== 'free' && built.problems.length) {
      built.problems.forEach((e) => addLog('err', e.msg, e.fix));
      setPassed(null);
      return;
    }
    const carry = flow.mode !== 'free' && practiceOf(flow.kind).group === 'carry';
    if (carry && theme === 'arm') layout.current = blockLayout(plan);
    const problems = checkProcess(proc, canGrip);
    setErrorLines(problems.map((e) => e.line).filter((l) => l > 0));
    if (problems.length) {
      problems.forEach((e) => addLog('err', e.msg, e.fix));
      setPassed(null);
      return;
    }
    const items = compileProcess(proc);
    const start = basePose();
    const preWorld = createWorld(effector, cameraFlange, layout.current, theme);
    preWorld.angles = start.slice();
    const pre = await preflight((h) => runProcess(items, h, proc.speed), { chain: loaded.chain, world: preWorld, poses });
    if (pre) return refuseRun(pre);
    setProgramRun(true);
    setBadge({ kind: 'sim', text: '시뮬레이션' });
    addLog('sim', `공정을 시뮬레이션해요 (${proc.blend === 'smooth' ? 'Smooth: 점을 이어서 지나가요' : 'Tick: 점마다 멈춰요'}).`);
    const text = procText;
    let simT = 0;
    const { ok, actions } = await execute(
      (h) =>
        runProcess(
          items,
          {
            ...h,
            animate: (d, frame) => {
              simT += d;
              return h.animate(d, frame);
            },
          },
          proc.speed,
        ),
      { reset: true, label: true, start },
    );
    const targets = carry ? carryTargets(plan) : [];
    // A block counts where it is meant to rest; one that dropped more than the simulator lets pass
    // without a warning (8 mm: a gap wider than the block) is not placed, and the run does not pass.
    const placed = targets.filter((t) => world.current.blocks.some((b) => Math.hypot(b.x - t.x, b.y - t.y) < 8 && Math.abs(b.z - t.z) < 8)).length;
    const done = ok && (theme !== 'arm' || placed === targets.length);
    if (ok && !done) addLog('err', `블록 ${targets.length - placed}개가 정한 높이에 놓이지 않고 떨어졌어요.`, flow.kind === 'stack' ? '쌓기 간격을 블록 높이(25 mm)에 맞춰 주세요.' : '내려놓는 곳의 높이(Z)를 블록이 놓일 높이에 맞춰 주세요.');
    setLastRun({ ok: done, seconds: simT, ...(carry ? { placed, total: targets.length } : {}) });
    if (done) {
      passedRun(text, actions, start);
      setProcRuns((n) => n + 1);
    }
    else setPassed(null);
    if (done && flow.step === 3) setFlow({ ...flow, step: 4 });
  };
  /**
   * 관절로 그려 보기 (pen practices, simulator): the drawing rows run as MOVE J instead of MOVE L,
   * and the pen line shows how far a joint move bends off the straight line (measured on the paper).
   */
  const [jointTry, setJointTry] = useState<{ key: string; bowMm: number; trail: [number, number][][] } | null>(null);
  const tryJointDraw = async () => {
    if (!loaded || busy || robotMode) return;
    const rows = proc.rows.map((r) => (r.kind === 'move' && r.mode === 'L' && /→/.test(r.note ?? '') ? { ...r, mode: 'J' as const } : r));
    addLog('sim', '곧게(MOVE L) 그리던 선을 관절로(MOVE J) 그려 봐요.');
    const { ok } = await execute((h) => runProcess(compileProcess({ ...proc, rows, blend: 'tick' }), h, proc.speed), { reset: true, start: basePose() });
    if (!ok) return;
    const lines = strokes(plan) ?? [];
    const off = (x: number, y: number) =>
      Math.min(
        ...lines.flatMap((l) =>
          l.slice(1).map((b, k) => {
            const a = l[k];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
            return Math.hypot(x - a.x - u * dx, y - a.y - u * dy);
          }),
        ),
      );
    const bowMm = Math.round(Math.max(0, ...world.current.trail.flat().map(([x, y]) => off(x, y))) * 10) / 10;
    setJointTry({ key: planKey, bowMm, trail: world.current.trail.map((st) => st.slice()) });
    addLog('info', `관절로 그렸더니 선이 곧은 선에서 최대 ${bowMm} mm 휘었어요. 관절이 함께 돌면 손끝은 곡선으로 가요.`, '▶ 로 다시 실행하면 곧게(MOVE L) 그려요. 두 선을 비교해 보세요.');
  };
  /** 한 줄씩: one row from where the arm is (the simulated arm only). */
  const runProcessRow = async (i: number) => {
    if (!loaded || busy) return;
    const row = proc.rows[i];
    if (row.kind === 'move' && !row.joints) return addLog('err', `${i + 1}번 줄: 좌표가 아직 없어요.`, '[좌표 저장]을 눌러 주세요.');
    if (robotMode) return addLog('info', '실제 로봇에서는 [가 보기]로 점을 확인하고, 공정 전체는 [로봇 실행]으로 돌려요.');
    await execute((h) => runProcess(compileProcess({ ...proc, blend: 'tick' }, i), h, proc.speed), { reset: false, onLine: setRunningLine });
  };

  const simulate = async () => {
    if (busy) return;
    if (tab === 'process') return simulateProcess();
    if (level !== 'basic') return simulatePy();
    return simulateBlocks(code);
  };
  /** The block program `text` in the simulator (the editor's, or one the AI button just put there). */
  const simulateBlocks = async (text: string) => {
    const fault = cellRef.current && world.current.cell?.health.fault;
    if (fault) return addLog('err', `고장 · ${fault.title}: [점검 · 복구]를 먼저 눌러 주세요.`, fault.fix);
    const { steps, errors, warnings } = problemsFor(text);
    setErrorLines(errors.map((e) => e.line));
    if (!errors.length) setProgramRun(true);
    if (errors.length) {
      errors.forEach((e) => addLog('err', `${e.line}번째 줄: ${e.msg}`, e.fix));
      setPassed(null);
      return;
    }
    warnings.forEach((w) => addLog('warn', `${w.line}번째 줄: ${w.msg}`));
    const pre = loaded && !cellAt && (await preflight((h) => runProgram(steps, h), { chain: loaded.chain, world: createWorld(effector, cameraFlange, layout.current, theme), poses }));
    if (pre) return refuseRun(pre);
    setBadge({ kind: 'sim', text: '시뮬레이션' });
    addLog('sim', '시뮬레이션을 시작해요.');
    if (cellRef.current) setCellResult(null);
    const { ok, actions } = await runSteps(steps, { reset: true, label: true });
    if (cellRef.current) return finishCellRun(ok);
    if (ok) passedRun(text, actions);
    else setPassed(null);
  };
  /** A step passed (by blocks, code or the terminal): the next one opens. */
  const recordPass = (id: string) =>
    setCellPassed((prev) => {
      const next = { ...prev, [id]: true };
      try {
        localStorage.setItem(CELL_PASSED_KEY, JSON.stringify(next));
      } catch {
        /* this session only */
      }
      return next;
    });
  // 입문 카페 해 보기 (by hand): the step's checks are read as it goes; all met, it is passed.
  const handStep = track && cellAt?.mission && missionById(cellAt.mission)?.mode === 'hand' && !busy && cellResult !== true ? cellAt.mission : null;
  const recordPassRef = useRef(recordPass);
  useEffect(() => {
    recordPassRef.current = recordPass;
  });
  useEffect(() => {
    if (!handStep) return;
    const id = window.setInterval(() => {
      const res = cellChecks(world.current);
      if (!res || res.mission.id !== handStep || !res.items.every((i) => i.ok)) return;
      window.clearInterval(id);
      setCellResult(true);
      setLastChecks(res.items);
      recordPassRef.current(handStep);
    }, 400);
    return () => window.clearInterval(id);
  }, [handStep]);
  /** A cell run is over: the last part comes to rest, then the step's checks decide. */
  const finishCellRun = async (ok: boolean) => {
    const c = cellRef.current;
    const run = world.current.cell;
    if (!c || !run) return;
    run.endT = run.line.t;
    if (!c.mission) return;
    await new Promise((r) => window.setTimeout(r, 1200));
    if (cellRef.current !== c || world.current.cell !== run) return;
    const res = cellChecks(world.current);
    if (!res) return;
    const all = ok && res.items.every((i) => i.ok);
    setCellResult(all);
    setLastChecks(res.items);
    if (all) {
      addLog('ok', `${res.mission.id} ${res.mission.title} 통과!`);
      recordPass(res.mission.id);
    } else {
      const miss = res.items.filter((i) => !i.ok).map((i) => i.label);
      addLog('warn', `${res.mission.id} 아직이에요: ${miss.join(' · ') || '프로그램이 끝까지 가지 못했어요'}`);
    }
  };
  /**
   * 터미널: python3 a file on the open cell — the same run and checks as the blocks, printed in the
   * terminal as it goes. A pass counts like the blocks' (a student stuck on the blocks can go on).
   */
  const runTermPython = async (path: string, text: string, print: (l: TermLine) => void): Promise<PyEnd | null> => {
    const c = cellRef.current;
    if (!c || busy) return null;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const lab = labAt(path);
    if (lab && lab.cell !== c.cell) {
      print({ text: `[연결] 이 파일은 셀 ${CELL_BY_ID[lab.cell].letter} 실습이에요. 지금 열린 셀은 ${CELL_BY_ID[c.cell].letter} 예요.`, tone: 'err' });
      print({ text: '  왼쪽 [환경] → 실습 셀에서 그 셀을 열고 실행해 주세요.', tone: 'info' });
      return null;
    }
    if (lab && lab.mission !== c.mission) {
      print({ text: `[연결] 이 파일은 ${lab.mission} 단계 실습이에요. 지금 열린 단계는 ${c.mission ?? '자유 실습'} 예요.`, tone: 'err' });
      print({ text: `  위 단계 버튼에서 ${lab.mission} 을 열고 다시 실행해 주세요.`, tone: 'info' });
      return null;
    }
    const fault = world.current.cell?.health.fault;
    if (fault) {
      print({ text: `[오류] 고장 · ${fault.title}: 3D 아래 [점검 · 복구]를 먼저 눌러 주세요.`, tone: 'err' });
      return 'error';
    }
    const { steps, errors } = problemsFor(text);
    if (errors.length) {
      for (const e of errors.slice(0, 3)) {
        print({ text: `  File "${name}", line ${e.line}`, tone: 'err' });
        print({ text: `SyntaxError: ${e.msg}`, tone: 'err' });
        if (e.fix) print({ text: `  → ${e.fix}`, tone: 'info' });
      }
      setErrorLines(errors.map((e) => e.line));
      return 'error';
    }
    const m = c.mission ? missionById(c.mission) : null;
    print({ text: `[연결] 시뮬레이터 셀 ${CELL_BY_ID[c.cell].letter} · ${m ? `${m.id} ${m.title}` : '자유 실습'}`, tone: 'dim' });
    termSink.current = sinkTo(print);
    setBadge({ kind: 'sim', text: 'python3' });
    setCellResult(null);
    let res: Awaited<ReturnType<typeof runSteps>>;
    try {
      res = await runSteps(steps, { reset: true, label: true });
    } finally {
      termSink.current = null;
    }
    if (res.stopped) {
      print({ text: 'KeyboardInterrupt', tone: 'warn' });
      return 'stopped';
    }
    const run = world.current.cell;
    if (run) run.endT = run.line.t;
    if (!c.mission) {
      print({ text: res.ok ? '[끝]' : '[멈춤]', tone: res.ok ? 'ok' : 'warn' });
      return res.ok ? 'pass' : 'error';
    }
    // The last part comes to rest, then the step's checks decide.
    await new Promise((r) => window.setTimeout(r, 1200));
    const checks = cellChecks(world.current);
    if (!checks) return res.ok ? 'pass' : 'error';
    for (const i of checks.items) print({ text: `  ${i.ok ? '✓' : '✗'} ${i.label}${i.detail ? ` (${i.detail})` : ''}`, tone: i.ok ? 'ok' : 'err' });
    const all = res.ok && checks.items.every((i) => i.ok);
    const next = all ? missionsOf(c.cell).find((x) => x.n === checks.mission.n + 1) : null;
    print({ text: `[결과] ${all ? `통과${next ? ` · 다음 단계 ${next.id} 가 열렸어요` : ''}` : res.ok ? '목표를 다 채우지 못했어요' : '도중에 멈췄어요'}`, tone: all ? 'ok' : 'warn' });
    if (all) {
      setCellResult(true);
      recordPass(checks.mission.id);
    }
    return all ? 'pass' : res.ok ? 'fail' : 'error';
  };

  /** Open a cell on a ladder step (or 자유 실습): its world, the gripper, the step's program. */
  /** Into a cell at its first step not passed yet (a cell whose ladder is still to come: to look round and run by hand). */
  const enterCell = (id: CellId) => {
    setLifeTut(null);
    const steps = missionsOf(id);
    const first = steps.find((m) => !cellPassed[m.id]) ?? steps[0];
    openCell(id, CELL_BY_ID[id].built ? (first?.id ?? null) : null);
  };
  const openCell = (cell: CellId, mission: string | null) => {
    if (busy) return;
    if (cellRef.current) saveCellProgram(cellRef.current, code);
    else keepProgram(code);
    const c = { cell, mission };
    cellRef.current = c;
    setCellAt(c);
    setCellResult(null);
    setDemo(null);
    setReplay(null);
    setDeskSel(null);
    if (theme === 'kit') setTheme('arm');
    let e = effector;
    const k = EFFECTOR_BY_ID[e].kind;
    const tool = CELL_BY_ID[cell].effector;
    if (tool && tool !== e) {
      e = tool;
      setEffector(e);
      setCameraFlange(false);
      addLog('info', `이 셀은 ${EFFECTOR_BY_ID[e].name}로 일해서 도구를 바꿔 달았어요.`);
    } else if (!tool && k !== 'grip' && k !== 'suction') {
      e = 'adaptive';
      setEffector(e);
      setCameraFlange(false);
      addLog('info', '실습 셀은 부품을 집어야 해서 적응형 그리퍼를 달았어요.');
    }
    world.current = createCellWorld(cell, mission, e);
    setAnglesView(world.current.angles.slice());
    setLevel('basic');
    setTab('basic');
    setCode(loadCellProgram(c) ?? CELL_START);
    setErrorLines([]);
    setPassed(null);
    const m = mission ? missionById(mission) : null;
    const info = CELL_BY_ID[cell];
    // (입문: the goal is on the notice board already, as 지금 할 일.)
    if (!track || !m) addLog('info', m ? `${m.id} ${m.title}: ${m.goal}` : info.built ? '자유 실습: 채점 없이 셀을 움직여 봐요.' : `${info.letter} ${info.name}: 단계 실습은 준비 중이에요. 왼쪽 조작판으로 장비를 직접 움직여 볼 수 있어요.`);
  };
  /** Back to the desk: the practice's program as it was left. */
  const leaveCell = () => {
    if (busy || !cellRef.current) return;
    dropCell();
    world.current = createWorld(effector, cameraFlange, layout.current, theme);
    setAnglesView(world.current.angles.slice());
    setCode(loadProgram(activeArm().id, level, theme, practice.id) ?? starterFor(practice, effector, theme));
  };
  const onCellAlert = useCallback(
    (a: CellAlert) => {
      if (a.level === 'info' && a.kind === 'order') return;
      // A 정지 or 고장 during a run stops the program, which reports it on its own.
      if ((a.level === 'stop' || a.level === 'fault') && busyRef.current) return;
      addLog(a.level === 'info' ? 'info' : a.level === 'warn' ? 'warn' : 'err', `${LEVEL_NAME[a.level]} · ${a.title}: ${a.msg}`, a.fix);
    },
    [addLog],
  );

  const stop = useCallback(() => {
    const running = !!token.current || !!tracker.current?.alive || !!realRunRef.current || !!jog.current || !!follower.current?.alive;
    if (follower.current) follower.current.alive = false;
    // A held jog key (or a dragged slider) stops too, before the key is let go.
    if (jog.current) endJogRef.current?.();
    // A held scene (예측 at its moment) lets go, so the stop can run its course.
    heldRef.current = false;
    setMoment(null);
    if (token.current) token.current.aborted = true;
    if (tracker.current) tracker.current.alive = false;
    if (realRunRef.current || robotMode) {
      // Always answered: a press that seems to do nothing looks like a dead button.
      void stopRobot().then((r) => {
        if (!r.ok) addLog('err', `정지 신호를 로봇이 받지 못했어요: ${r.error ?? '응답 없음'}`, '로봇 전원 옆 버튼이나 USB 를 뽑아 멈추고, 연결을 확인해 주세요.');
        else if (!running) addLog('info', '정지: 로봇에 멈춤을 보냈어요. 지금 움직이던 동작은 없었어요.');
      });
    } else if (!running) {
      addLog('info', '정지: 지금 움직이는 동작이 없어요. 팔은 멈춰 있어요.');
    }
    setBadge(null);
    // 실물 연동 and 로봇 실습 7 end too, so they do not send the arm on.
    announceRobotStop();
  }, [robotMode, addLog]);

  // The first time this PC opens a robot's console by its address, offer the PC program, so next
  // time it opens with a double click. Not when it was opened from the PC program itself.
  useEffect(() => {
    // A tablet cannot run the Windows program: it keeps the page (홈 화면에 추가) instead.
    if (!robotMode || isTouch()) return;
    try {
      if (localStorage.getItem(PC_OFFER_KEY)) return;
      if (new URLSearchParams(window.location.search).get('from') === 'pc') {
        localStorage.setItem(PC_OFFER_KEY, '1');
        return;
      }
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once the robot answers
    setPcOffer(true);
  }, [robotMode]);
  const closePcOffer = () => {
    setPcOffer(false);
    try {
      localStorage.setItem(PC_OFFER_KEY, '1');
    } catch {
      /* this session only */
    }
  };

  /** Ctrl+Enter anywhere but a text field (the code editor has its own): simulate. */
  const runShortcut = useEffectEvent(() => void simulate());
  /** Delete / Backspace (not in a text field): the object picked on the desk goes. */
  const deleteShortcut = useEffectEvent(() => {
    if (!deskSel || busy || theme !== 'arm') return false;
    deskRemove(deskSel);
    return true;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The 교육 tab has its own controls; only Esc (stop the real arm) applies there.
      if (viewRef.current === 'learn') {
        if (e.key === 'Escape') stop();
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (document.activeElement as HTMLElement | null)?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        runShortcut();
        return;
      }
      const typing = /^(TEXTAREA|INPUT|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName ?? '') || !!(document.activeElement as HTMLElement | null)?.isContentEditable;
      if (!typing && (e.key === 'Delete' || e.key === 'Backspace') && deleteShortcut()) {
        e.preventDefault();
        return;
      }
      if (!typing && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) {
        stageApi.current?.zoom(e.key === '+' || e.key === '=' ? 1 : -1);
        return;
      }
      if (e.key === 'Escape' || (e.code === 'Space' && !typing && (token.current || realRunRef.current))) {
        if (token.current || realRunRef.current) e.preventDefault();
        stop();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [stop]);

  /** What a passed run is tied to: the program text, or (공정 짜기) the process listing. */
  const procText = processListing(proc);
  const gateOpen = passed !== null && passed.code === (tab === 'process' ? procText : code) && !busy;

  /** Switch level or environment, staying on the same acceptance check when the new place has it. */
  const openKeeping = (lv: Level, th: Theme) => {
    const list = practicesFor(lv, th);
    const same = list.find((p) => (practice.check ? p.check === practice.check : p.id === practice.id));
    selectPractice(lv, th, (same ?? list[0]).id);
  };

  const chooseTab = (t: PanelTab) => {
    setTab(t);
    // Into 공정 on a bare desk: the practice mat and its blocks come out, the arm stays where it is.
    if (t === 'process' && !busy && theme === 'arm' && !world.current.blocks.length && !cellRef.current) {
      setMatNeeded(true);
      const at = world.current.angles.slice();
      world.current = createWorld(effector, cameraFlange, layout.current, theme);
      world.current.angles = at;
      setAnglesView(at);
    }
    if (!dockShown) toggleDock();
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* this session only */
    }
  };
  /** A language tab: that language's program as it was left, or the same task in the new language. */
  const openTab = (t: PanelTab) => {
    if (t === 'direct' || t === 'process' || t === level) return chooseTab(t);
    // A 트랙 opens only its coding languages.
    if (track && (t === 'basic' || t === 'python' || t === 'ros') && !track.levels.includes(t)) return chooseTab(level);
    if (busy) return;
    const back = kept.current[t];
    if (back && back.theme === theme) selectPractice(t, theme, back.id, back.code);
    else openKeeping(t, theme);
    chooseTab(t);
  };
  /** A task from the gallery or a check number: it opens in its language's tab. */
  const openTask = (w: Where) => {
    if (busy) return;
    selectPractice(w.level, w.theme, w.id, undefined, true);
    chooseTab(w.level);
  };
  /** The base under the robot: kept in this browser (on a robot's own console: for that robot). */
  const chooseMount = (m: { on: boolean; mm: number }) => {
    if (busy) return;
    setMount(m);
    setPassed(null);
    setBadge(null);
    try {
      localStorage.setItem(MOUNT_KEY, JSON.stringify(m));
    } catch {
      /* this session only */
    }
    if (m.on !== mount.on) addLog('info', m.on ? `받침대(G 베이스)를 달았어요. 로봇이 책상보다 ${m.mm}mm 높아요. 그만큼 더 아래까지 닿아요.` : '받침대를 뗐어요. 로봇이 책상 바로 위에 있어요.');
  };

  const chooseQuality = (q: 'high' | 'normal') => {
    setQuality(q);
    try {
      localStorage.setItem(QUALITY_KEY, q);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    renderError.current = (msg: string) => {
      if (quality === 'high') {
        setScene3d('loading');
        chooseQuality('normal');
        addLog('warn', '이 컴퓨터의 그래픽 카드에서 고화질 효과가 그려지지 않아 보통 화질로 바꿨어요.', msg);
      } else addLog('err', '3D 화면을 그리지 못했어요. 브라우저를 최신으로 바꾸거나 다른 브라우저(크롬·엣지)로 열어 주세요.', msg);
    };
  });

  /** The practice after this one (the result card's [다음 과제]). */
  const nextPractice = (() => {
    const list = practicesFor(level, theme);
    const i = list.findIndex((p) => p.id === practice.id);
    return i >= 0 ? (list[i + 1] ?? null) : null;
  })();
  const closeGoalCard = useCallback(() => setGoalCard(null), []);

  /** The open practice needs a tool (or the camera flange) that is not on: one line with [끼우기]. */
  const needTool = toolNeeded(practice, theme);
  const missingTool = needTool && !toolFits(needTool, effector) && arm.tools.includes(needTool) ? needTool : null;
  const missingFlange = !!practice.cameraFlange && !cameraFlange && arm.cameraFlange;
  const toolAsk =
    missingTool || missingFlange
      ? {
          text: [missingTool && EFFECTOR_BY_ID[missingTool].name, missingFlange && '카메라 플랜지'].filter(Boolean).join(' + '),
          fit: () => changeTool(missingTool ?? effector, cameraFlange || missingFlange),
        }
      : undefined;

  /** The module's own button (image processing, the robot code). */
  const practiceAction =
    practice.action === 'vision' && practice.id === 'ai' && robotMode && robot?.camera
      ? { label: 'AI 샘플 실행 (로봇에서 · YOLO)', run: () => void runAi() }
      : practice.action === 'vision'
      ? { label: robotMode && robot?.camera ? '영상처리 실행 (로봇에서)' : '영상처리 실행', run: () => void runVision() }
      : practice.action === 'api'
        ? {
            label: level === 'ros' ? 'ROS 2 로 실행하는 법' : level === 'python' ? '로봇용 파일로 받기' : '파이썬 API 코드 보기',
            run: () => (passed ? openExport() : addLog('err', '먼저 [시뮬레이션]을 통과해야 로봇용 코드가 나와요.')),
          }
        : practice.action === 'photo'
          ? { label: '카메라 열기', run: () => setCamOpen(true) }
          : undefined;

  /** 초급: the blocks turned into a pymycobot script. 중급·고급: the student's own program, unchanged — it is the robot program. */
  const openExport = () => {
    if (!passed) return;
    if (practice.check === 7) note(7, `로봇용 ${level === 'basic' ? '파이썬 API(pymycobot) 코드' : level === 'ros' ? 'ROS 2 노드' : '파이썬 파일'} 받기`, false);
    setExportText(adaptPython(level === 'basic' || tab === 'process' ? toPymycobot(passed.actions, effector, passed.code, theme) : passed.code, arm));
  };

  /* --- direct control ------------------------------------------------------ */
  /** The last "into itself" notice of a slider drag (one card per kind of contact, not one per pixel). */
  const selfNoted = useRef('');
  /** Slider drag: the 3D arm goes there at once (on the robot: a preview until the slider is let go). */
  const setJoint = (i: number, deg: number) => {
    if (busy || !loaded) return;
    const from = world.current.angles.slice();
    let next = from.slice();
    next[i] = deg;
    // Into itself: the arm stays where it was (the slider springs back) and the card says which joint to change.
    const bad = moveCheck(loaded.chain, world.current, next, 1);
    // Into the desk, the floor or what is on it: the arm stops where it touches (a servo cannot push
    // through), unless it is already touching there — then it may move, to get out.
    if (bad && !(bad instanceof SelfCollision) && !moveCheck(loaded.chain, world.current, from, 1)) {
      let free = 0;
      let hit = 1;
      for (let k = 0; k < 10; k += 1) {
        const t = (free + hit) / 2;
        const q = from.slice();
        q[i] = from[i] + (deg - from[i]) * t;
        if (moveCheck(loaded.chain, world.current, q, 4)) hit = t;
        else free = t;
      }
      next = from.slice();
      next[i] = from[i] + (deg - from[i]) * free;
      if (Math.abs(next[i] - from[i]) < 0.05) {
        setBadge({ kind: 'stop', text: bad.message });
        setAnglesView(from);
        return;
      }
    }
    if (bad instanceof SelfCollision) {
      setBadge({ kind: 'stop', text: '팔이 스스로 부딪혀요' });
      setAnglesView(world.current.angles.slice());
      if (selfNoted.current !== bad.message) addLog('warn', bad.message, bad.fix);
      selfNoted.current = bad.message;
      return;
    }
    selfNoted.current = '';
    if (robotMode) {
      // The real arm follows the slider as it is dragged (at jog speed, checked on the way).
      previewing.current = true;
      const goal = (jog.current?.goal ?? basePose()).slice();
      goal[i] = next[i];
      startJog({ dir: 1, goal });
    }
    const why = bad?.message ?? null;
    world.current.angles = next;
    world.current.version += 1;
    setBadge(why ? { kind: 'stop', text: why } : null);
    setAnglesView(next);
  };

  /** Pose the controls start from: the real arm on the robot, the simulated one otherwise. */
  const basePose = (): number[] => {
    const real = robotNow.current?.angles;
    return robotMode && real ? real.slice() : world.current.angles.slice();
  };

  /**
   * Move to joint angles from the control panel. Checked for collisions first
   * (table, board, kit, blocks); on the robot the real arm moves, slowly.
   */
  /**
   * Move to joint angles from the control panel. `jog`: a held jog key — it
   * skips a tick while the arm is still busy with the previous one, quietly.
   */
  const goJoints = async (target: number[], what: string, jog = false) => {
    if (!loaded || busy) return;
    if (jog && robotMode && robot?.running) return;
    const to = target.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
    // A step past a limit stops at it, and says so (the held key does the same).
    const capped = target.findIndex((a, i) => Math.abs(a - to[i]) > 0.01);
    if (capped >= 0) {
      const limit = to[capped];
      if (Math.abs(basePose()[capped] - limit) < 0.05) return addLog('warn', `J${capped + 1} 이 한계(${limit}°)에 닿아 있어요.`, '반대 방향으로 움직여 주세요.');
      addLog('info', `J${capped + 1} 은 한계(${limit}°)까지만 움직여요.`);
    }
    if (robotMode) {
      previewing.current = false;
      if (!robot?.connected || !robot.angles) return addLog('err', '로봇이 연결되지 않았어요.');
      if (robot.released) return addLog('err', '서보가 풀려 있어요.', '[서보 고정]을 누른 뒤 움직여 주세요.');
    }
    const from = { ...world.current, angles: basePose() };
    const why = moveProblem(loaded.chain, from, to);
    if (why) {
      addLog('err', `${what}: ${why}`, '다른 방향으로 움직이거나 먼저 [기본 자세]를 눌러 주세요.');
      setBadge({ kind: 'stop', text: why });
      if (robotMode) setAnglesView(from.angles);
      return;
    }
    setBadge(null);
    // One step speed for both: 10..100 % → speed 5..40, the same move in the simulator and on the robot.
    const speed = Math.max(5, Math.round((40 * jogSpeed) / 100));
    if (robotMode) {
      const res = await moveRobot(to, speed);
      if (!res.ok && !(jog && res.status === 409)) addLog('err', `로봇: ${res.error}`);
      return;
    }
    await runSteps([{ type: 'move', joints: to, speed, line: 0 }], { reset: false });
  };

  const jointStep = (i: number, delta: number) => {
    setTipBlocked(null);
    const t = basePose();
    t[i] += delta;
    void goJoints(t, `J${i + 1} ${delta > 0 ? '+' : ''}${delta}°`, true);
  };

  /** Slider let go: on the robot the arm goes on to exactly where the slider stopped. */
  const jointCommit = (i: number, deg: number) => {
    if (!robotMode) return;
    const goal = (jog.current?.goal ?? basePose()).slice();
    goal[i] = deg;
    startJog({ dir: 1, goal });
  };

  /**
   * A coordinate jog that cannot start from this pose (the arm stretched straight — a singular pose —
   * the end of its reach, a joint's limit): said before anything moves, with the way out. `onlySingular`:
   * the step buttons have other ways to get there, so only the stretched arm stops them.
   */
  const coordRefused = (axis: Axis, dir: -1 | 1, pose: readonly number[], onlySingular = false): boolean => {
    if (!loaded) return false;
    const why = coordJogBlocked(loaded.chain, pose, tcpNow, axis, dir);
    const singular = !!why && why.includes('특이 자세');
    if (!why || (onlySingular && !singular)) return false;
    setTipBlocked({ axis, dir });
    addLog('err', why, singular ? '먼저 [기본 자세]를 누른 뒤 좌표로 움직여요. 팔꿈치가 굽어 있어야 손끝을 곧게 옮길 수 있어요.' : '반대 방향으로 움직이거나 [기본 자세]를 눌러 주세요.');
    setBadge({ kind: 'stop', text: why });
    return true;
  };

  /** Tool tip one step along x / y / z, the tool kept the way it points now (down). */
  const tipStep = (axis: Axis, delta: number) => {
    if (!loaded || busy) return;
    const base = basePose();
    setTipBlocked(null);
    if (coordRefused(axis, delta < 0 ? -1 : 1, base, true)) return;
    const blocked = () => setTipBlocked({ axis, dir: delta < 0 ? -1 : 1 });
    if (axis === 'rx' || axis === 'ry' || axis === 'rz') {
      const turned = turnTool(loaded.chain, base, tcpNow, axis[1] as 'x' | 'y' | 'z', delta, 0.2);
      if (!turned.converged) {
        blocked();
        return addLog('err', `도구를 ${axis.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}° 더 돌릴 수 없어요 (손끝 자리를 지킨 채 닿지 않아요).`, '반대로 돌리거나 손끝을 로봇 쪽으로 옮긴 뒤 돌려 주세요.');
      }
      return void goJoints(turned.anglesDeg, `${axis.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}°`, true);
    }
    const here = tcpPositionMm(loaded.chain, base, tcpNow);
    const to = { x: here.x, y: here.y, z: here.z, [axis]: here[axis] + delta };
    // First the tool kept exactly as it is held; then pointing down (it may turn to get there).
    const kept = shiftTool(loaded.chain, base, { x: 0, y: 0, z: 0, [axis]: delta });
    const orientation = currentOrientation(loaded.chain, base, tcpNow);
    let sol = kept.converged ? kept : orientation ? solveToolPose(loaded.chain, to, base, { tcpMm: tcpNow, orientation }) : null;
    if (!sol?.converged) sol = solveToolPose(loaded.chain, to, base, { tcpMm: tcpNow });
    if (!sol.converged) {
      blocked();
      addLog('err', `(x ${Math.round(to.x)}, y ${Math.round(to.y)}, z ${Math.round(to.z)})에는 도구를 아래로 향한 채 닿을 수 없어요.`, '반대 방향으로 움직이거나 기본 자세로 돌아가 주세요.');
      return;
    }
    // A step that needs a big turn of some joint (the tool was not pointing down) is a surprise on a real arm: ask first.
    const turn = Math.max(...sol.anglesDeg.map((a, i) => Math.abs(a - base[i])));
    if (turn > 25) {
      if (!window.confirm(`도구를 아래로 향하게 하느라 관절이 최대 ${Math.round(turn)}° 크게 움직여요.\n계속할까요?`)) return;
      addLog('info', '도구가 아래를 향하도록 자세를 바꿔요.');
    }
    void goJoints(sol.anglesDeg, `${axis.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}mm`, true);
  };
  /** [손 아래로]: the tool pointing straight down again (after RX · RY · RZ), its tip where it is. */
  const toolDown = () => {
    if (!loaded || busy) return;
    const base = basePose();
    // Straight down, the hand kept turned as it is (only the lean is taken out).
    const keep = { yawDeg: toolYawDeg(loaded.chain, base, tcpNow), tiltDeg: 0 };
    let sol = solveToolPose(loaded.chain, tcpPositionMm(loaded.chain, base, tcpNow), base, { tcpMm: tcpNow, orientation: keep });
    if (!sol.converged) sol = solveToolPose(loaded.chain, tcpPositionMm(loaded.chain, base, tcpNow), base, { tcpMm: tcpNow, orientation: STRAIGHT_DOWN });
    if (!sol.converged) return addLog('err', '이 자리에서는 손을 똑바로 아래로 향하게 할 수 없어요.', '손끝을 로봇 쪽으로 조금 옮긴 뒤 다시 눌러 주세요.');
    void goJoints(sol.anglesDeg, '손 아래로', true);
  };


  /* --- real-time jog (a jog key held down) ----------------------------------- */
  /**
   * While a key is held the arm moves continuously at the speed override:
   * in the simulator every frame (each small change checked like a program
   * move); on the robot a target a little ahead of the arm goes out several
   * times a second, and the server stops the arm when they stop coming. The
   * commanded pose never runs more than JOG_LEAD° ahead of the measured one,
   * so letting go (or losing the link) stops the arm within a moment.
   */

  /** Joint speed °/s and tool speed mm/s at the speed override. */
  const jogRates = () => ({ deg: 4 + (36 * jogSpeed) / 100, mm: 6 + (54 * jogSpeed) / 100 });

  const endJog = (why?: string) => {
    const j = jog.current;
    if (!j) return;
    jog.current = null;
    cancelJogTick(j);
    if (robotMode) {
      void stopRobot();
      previewing.current = false;
    } else {
      setAnglesView(world.current.angles.slice());
    }
    if (why) {
      if (j.axis) setTipBlocked({ axis: j.axis, dir: j.dir });
      addLog('err', why, '반대 방향으로 움직이거나 먼저 [기본 자세]를 눌러 주세요.');
      setBadge({ kind: 'stop', text: why });
    }
  };

  endJogRef.current = () => endJog();

  /** One frame of the jog loop: advance the commanded pose, check it, apply it (sim) or stream it (robot). */
  const jogFrame = (now: number) => {
    const j = jog.current;
    if (!j || !loaded) return;
    // The robot is driven from a timer (not tied to drawing), the simulator every frame.
    const dt = j.last ? Math.max(0, Math.min(robotMode ? 0.25 : 0.1, (now - j.last) / 1000)) : 0;
    j.last = now;
    // Ease in over the first quarter second, so a held key starts smoothly instead of with a jolt.
    if (!j.t0) j.t0 = now;
    const ease = j.goal ? 1 : Math.min(1, 0.25 + (0.75 * (now - j.t0)) / 250);
    const deg = jogRates().deg * ease * (j.scale ?? 1);
    const mm = jogRates().mm * ease * (j.scale ?? 1);
    if (robotMode && (j.joint !== undefined || j.axis) && !j.goal) return robotJog(j, now);
    let next = j.cmd.slice();
    if (j.goal) {
      // Slider or dial dragged (robot): aim straight at where it is now, as far ahead of the arm as the
      // robot accepts, so the arm keeps up with the hand instead of creeping along at jog speed.
      const goal = j.goal;
      const actual = robotNow.current?.angles ?? j.cmd;
      next = goal.map((g, i) => actual[i] + Math.max(-FOLLOW_LEAD, Math.min(FOLLOW_LEAD, g - actual[i])));
    } else if (j.joint !== undefined) {
      const i = j.joint;
      const limit = j.dir > 0 ? jointMax()[i] : jointMin()[i];
      if (j.cmd[i] * j.dir >= limit * j.dir) return endJog(`J${i + 1} 이 한계(${limit}°)에 닿았어요.`);
      next[i] = Math.min(jointMax()[i], Math.max(jointMin()[i], next[i] + j.dir * deg * dt));
    } else if (j.axis === 'rx' || j.axis === 'ry' || j.axis === 'rz') {
      // Turning about a base axis, the tip kept: about as many °/s as the joints turn.
      // In sub-steps of at most 1.5°, each checked, so a slow frame (a long dt) is not taken for a flip.
      const total = j.dir * deg * 0.75 * dt;
      const n = Math.max(1, Math.ceil(Math.abs(total) / 1.5));
      let at = j.cmd;
      for (let k = 0; k < n; k++) {
        const sol = turnTool(loaded.chain, at, tcpNow, j.axis[1] as 'x' | 'y' | 'z', total / n);
        if (!sol.converged || sol.anglesDeg.some((a, i) => Math.abs(a - at[i]) > 6)) return endJog(coordJogBlocked(loaded.chain, j.cmd, tcpNow, j.axis, j.dir) ?? '도구를 이 방향으로 더 돌릴 수 없어요 (자세가 크게 바뀌어야 해요).');
        at = sol.anglesDeg;
      }
      next = at.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
    } else if (j.axis) {
      // In sub-steps of at most 2 mm, each checked, so a slow frame (a long dt) is not taken for a flip.
      const total = j.dir * mm * dt;
      const n = Math.max(1, Math.ceil(Math.abs(total) / 2));
      let at = j.cmd;
      for (let k = 0; k < n; k++) {
        const sol = shiftTool(loaded.chain, at, { x: 0, y: 0, z: 0, [j.axis]: total / n });
        if (!sol.converged || sol.anglesDeg.some((a, i) => Math.abs(a - at[i]) > 6)) return endJog(coordJogBlocked(loaded.chain, j.cmd, tcpNow, j.axis, j.dir) ?? '도구를 이 방향으로 더 움직일 수 없어요 (자세가 크게 바뀌어야 해요).');
        at = sol.anglesDeg;
      }
      next = at.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
    }
    if (robotMode) {
      const r = robotNow.current;
      if (!r?.connected || !r.angles) return endJog('로봇이 연결되지 않았어요.');
      if (r.running || r.released) return endJog();
      const actual = r.angles;
      // Do not run ahead of the arm; wait for it (a dragged goal is already kept within FOLLOW_LEAD).
      if (!j.goal && next.some((a, i) => Math.abs(a - actual[i]) > JOG_LEAD)) next = j.cmd;
      const why = moveProblem(loaded.chain, { ...world.current, angles: j.cmd }, next, 1);
      if (why) return endJog(why);
      j.cmd = next;
      if (j.goal && next.every((a, i) => Math.abs(a - j.goal![i]) < 0.05)) {
        // The dragged pose is within the robot's reach: send it and let the arm finish on its own.
        // (Checked before the next send: a streaming jog left running would stop the next move.)
        if (j.inflight) return scheduleJog(j);
        void targetRobot(j.goal, robot?.speedCap ?? 50);
        jog.current = null;
        previewing.current = false;
        return;
      }
      if (!j.inflight && now - j.sent > 90) {
        j.sent = now;
        j.inflight = true;
        // A dragged goal follows at the classroom top speed; held keys at the speed set in the panel.
        const cap = robot?.speedCap ?? 50;
        const speed = j.goal ? cap : Math.max(5, Math.min(cap, Math.round(jogSpeed / 2)));
        void targetRobot(next, speed).then((res) => {
          j.inflight = false;
          if (!res.ok && jog.current === j) endJog(`로봇: ${res.error ?? '움직일 수 없어요.'}`);
        });
      }
    } else {
      const why = jogTo(loaded.chain, world.current, next);
      if (why) return endJog(why);
      j.cmd = next;
      if (now - j.view > 60) {
        j.view = now;
        setAnglesView(next);
      }
    }
    scheduleJog(j);
  };
  /**
   * A held joint key on the robot: the robot's own continuous jog (smooth, no stop-and-go),
   * kept alive every 0.2 s. Each tick looks 8° ahead in the direction of travel with the
   * simulator's collision check and stops the arm before anything is hit.
   */
  const robotJog = (j: NonNullable<typeof jog.current>, now: number) => {
    const r = robotNow.current;
    if (!loaded || !r?.connected || !r.angles) return endJog('로봇이 연결되지 않았어요.');
    if (r.running || r.released) return endJog();
    let ahead = r.angles.slice();
    if (j.joint !== undefined) {
      const i = j.joint;
      ahead[i] = Math.min(jointMax()[i], Math.max(jointMin()[i], ahead[i] + j.dir * 8));
    } else if (j.axis === 'rx' || j.axis === 'ry' || j.axis === 'rz') {
      // How the tool will be turned a moment from now, as the robot's own coordinate jog (rx / ry / rz) turns it.
      const about = j.axis[1] as 'x' | 'y' | 'z';
      let sol = turnTool(loaded.chain, r.angles, tcpNow, about, j.dir * 8, 0.5);
      if (!sol.converged) sol = turnTool(loaded.chain, r.angles, tcpNow, about, j.dir * 3, 0.5);
      if (!sol.converged) return endJog(coordJogBlocked(loaded.chain, r.angles, tcpNow, j.axis, j.dir) ?? '도구를 이 방향으로 더 돌릴 수 없어요.');
      ahead = sol.anglesDeg;
    } else if (j.axis) {
      // Where the tool will be a moment from now, held as it is now — as the robot's coordinate jog moves it.
      // Near a joint limit the exact tool angle may not be kept for 25 mm: look less far, and at last solve
      // for the tool position alone (the collision check below still runs on the pose found).
      const step = { x: 0, y: 0, z: 0, [j.axis]: j.dir * 25 };
      let sol = shiftTool(loaded.chain, r.angles, step, 2);
      if (!sol.converged) sol = shiftTool(loaded.chain, r.angles, { ...step, [j.axis]: j.dir * 8 }, 2);
      if (!sol.converged) {
        const tip = forwardKinematicsFrames(loaded.chain, r.angles).at(-1)!;
        const target = new Vector3().setFromMatrixPosition(tip).add(new Vector3(step.x, step.y, step.z).multiplyScalar(0.001));
        sol = solveIk(loaded.chain, target, r.angles, { positionToleranceM: 0.002, restarts: 0 });
      }
      if (!sol.converged) return endJog(coordJogBlocked(loaded.chain, r.angles, tcpNow, j.axis, j.dir) ?? '도구를 이 방향으로 더 움직일 수 없어요 (팔이 닿는 끝이에요).');
      ahead = sol.anglesDeg;
    }
    const why = moveProblem(loaded.chain, { ...world.current, angles: r.angles.slice() }, ahead, 4);
    if (why) return endJog(why);
    if (!j.inflight && now - j.sent > 140) {
      j.sent = now;
      j.inflight = true;
      // 10%..100% → robot jog speed 3..50; sent on every keep-alive, so a new speed applies at once.
      const speed = Math.max(3, Math.min(robot?.speedCap ?? 50, Math.round((3 + (47 * (jogSpeed - 10)) / 90) * (j.scale ?? 1))));
      const call = j.joint !== undefined ? jogRobot(j.joint + 1, j.dir, speed) : jogRobotAxis(j.axis!, j.dir, speed);
      void call.then((res) => {
        j.inflight = false;
        if (!res.ok && jog.current === j) endJog(`로봇: ${res.error ?? '움직일 수 없어요.'}`);
      });
    }
    scheduleJog(j);
  };

  /** Next jog tick: every frame in the simulator; every 100 ms on the robot, even when drawing is slow. */
  const scheduleJog = (j: { raf: number; timer: boolean }) => {
    j.timer = robotMode;
    j.raf = robotMode ? window.setTimeout(() => jogFrameRef.current(performance.now()), 100) : requestAnimationFrame((t) => jogFrameRef.current(t));
  };
  const jogFrameRef = useRef(jogFrame);
  useEffect(() => {
    jogFrameRef.current = jogFrame;
  });
  useEffect(() => () => {
    if (!jog.current) return;
    cancelJogTick(jog.current);
  }, []);

  const startJog = (spec: { joint?: number; axis?: Axis; dir: -1 | 1; goal?: number[]; scale?: number }) => {
    if (!loaded || busy) return;
    if (robotMode) {
      if (!robot?.connected || !robot.angles) return addLog('err', '로봇이 연결되지 않았어요.');
      if (robot.released) return addLog('err', '서보가 풀려 있어요.', '[서보 고정]을 누른 뒤 움직여 주세요.');
      if (robot.running) return;
    }
    if (jog.current) {
      if (spec.goal && jog.current.goal) jog.current.goal = spec.goal;
      if (spec.goal) return;
      endJog();
    }
    setBadge(null);
    setTipBlocked(null);
    if (spec.axis && !spec.goal && coordRefused(spec.axis, spec.dir, basePose())) return;
    // `last` 0: the first tick starts the clock.
    jog.current = { ...spec, cmd: basePose(), last: 0, sent: 0, inflight: false, raf: 0, timer: false, view: 0 };
    scheduleJog(jog.current);
  };

  /* --- 색 따라가기 (hand camera follows a colour) --------------------------------- */
  /**
   * The hand camera keeps one colour in the middle of its picture (src/engine/vision/track.ts):
   * first the arm moves 2 cm along x and along y and watches where the colour goes in the
   * picture (so the camera may be turned any way on its flange), then it steps towards the
   * colour several times a second — height and tool direction kept, every step checked like
   * a jog. The simulator uses the 3D hand camera; on the robot, its real camera.
   */
  /** Real cameras: how many, and which is the kit camera / the hand camera (two: 1 = kit, 2 = hand unless told otherwise). */
  const realCams = robotMode && robot?.camera ? Math.max(1, robot.cameras ?? 1) : 0;
  const roleOf = (n: number): CameraId => camRoles[n] ?? (realCams >= 2 ? (n === 1 ? 'hand' : 'top') : cameraFlange ? 'hand' : 'top');
  const handCam = Array.from({ length: realCams }, (_, n) => n).find((n) => roleOf(n) === 'hand') ?? -1;
  const kitCam = Array.from({ length: realCams }, (_, n) => n).find((n) => roleOf(n) === 'top') ?? -1;
  const chooseRole = (role: CameraId) => {
    const next = { ...camRoles, [realCam]: role };
    setCamRoles(next);
    try {
      localStorage.setItem(CAM_ROLES_KEY, JSON.stringify(next));
    } catch {
      /* this session only */
    }
  };
  const trackReady = cameraFlange && (robotMode ? handCam >= 0 : true);

  /** One hand-camera picture (320 px wide): the robot's newest frame, or the simulated camera. */
  const grabHand = async (): Promise<ImageLike | null> => {
    if (robotMode) {
      const r = await robotFetch(cameraFrameUrl(Math.max(0, handCam))).catch(() => null);
      if (!r?.ok) return null;
      const bmp = await createImageBitmap(await r.blob());
      const c = (trackCanvas.current ??= document.createElement('canvas'));
      c.width = 320;
      c.height = Math.round((320 * bmp.height) / bmp.width);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const d = g.getImageData(0, 0, c.width, c.height);
      return { data: d.data, width: d.width, height: d.height };
    }
    // Let the scene draw the arm where it is now before taking the picture.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const frame = stageApi.current?.capture('hand', 0.5);
    if (!frame) return null;
    cams.current?.push('hand', frame, true);
    return frame.image;
  };

  /**
   * Move the tool sideways by d (mm), kept as it points. On the robot the pose goes out as a
   * jog target (`wait`: until the arm is there); in the simulator the arm glides there.
   * A move that would turn a joint a lot is shortened; `moved` gets the move made.
   * Returns why it cannot, or null.
   */
  const trackMove = async (t: { alive: boolean }, d: { x: number; y: number }, wait: boolean, moved = { x: 0, y: 0 }): Promise<string | null> => {
    if (!loaded) return '로봇 모델이 아직 없어요.';
    const from = basePose();
    // Close above the base a small sideways move turns the base a lot: shorten the move until
    // no joint turns more than 12° (the robot takes jog targets up to 15° ahead).
    let sol = shiftTool(loaded.chain, from, { x: d.x, y: d.y, z: 0 }, 0.2);
    for (let k = 0; k < 3 && sol.converged && sol.anglesDeg.some((a, i) => Math.abs(a - from[i]) > 12); k++) {
      d = { x: d.x / 2, y: d.y / 2 };
      sol = shiftTool(loaded.chain, from, { x: d.x, y: d.y, z: 0 }, 0.2);
    }
    if (!sol.converged || sol.anglesDeg.some((a, i) => Math.abs(a - from[i]) > 12)) return '팔이 이 방향으로 더 닿지 않아요.';
    moved.x = d.x;
    moved.y = d.y;
    const to = sol.anglesDeg.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
    const why = moveProblem(loaded.chain, { ...world.current, angles: from }, to, 6);
    if (why) return why;
    if (robotMode) {
      const speed = Math.min(robot?.speedCap ?? 50, 40);
      const res = await targetRobot(to, speed);
      if (!res.ok) return `로봇: ${res.error ?? '움직일 수 없어요.'}`;
      if (!wait) return null;
      // Until the arm is there; the target is sent again now and then (a jog lasts while targets come).
      const t0 = performance.now();
      let sent = t0;
      while (t.alive && performance.now() - t0 < 3000) {
        await new Promise((r) => setTimeout(r, 80));
        const a = robotNow.current?.angles;
        if (a && a.every((v, i) => Math.abs(v - to[i]) < 0.8)) break;
        if (performance.now() - sent > 400) {
          sent = performance.now();
          void targetRobot(to, speed);
        }
      }
      // The camera sees the arm a moment late: let it settle into the picture.
      await new Promise((r) => setTimeout(r, 250));
      return null;
    }
    const dist = Math.hypot(d.x, d.y);
    const dur = Math.max(0.1, dist / 60) * 1000;
    const t0 = performance.now();
    for (;;) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (!t.alive) return null;
      const k = Math.min(1, (performance.now() - t0) / dur);
      const step = from.map((a, i) => a + (to[i] - a) * k);
      const bad = jogTo(loaded.chain, world.current, step);
      if (bad) return bad;
      setAnglesView(step);
      if (k >= 1) return null;
    }
  };

  const stopTracking = () => {
    if (tracker.current) tracker.current.alive = false;
  };
  useEffect(
    () => () => {
      if (tracker.current) tracker.current.alive = false;
    },
    [],
  );

  const startTracking = async (color: ColorName) => {
    if (!loaded || busy || tracker.current) return;
    if (!trackReady) return addLog('err', robotMode ? '로봇 카메라가 없어요.' : '도구에서 카메라 플랜지를 달아 주세요.');
    if (robotMode) {
      if (!robot?.connected || !robot.angles) return addLog('err', '로봇이 연결되지 않았어요.');
      if (robot.released) return addLog('err', '서보가 풀려 있어요.', '[서보 고정]을 누른 뒤 시작해 주세요.');
      if (robot.running) return;
    }
    if (jog.current) endJog();
    const t = { alive: true };
    tracker.current = t;
    setBusy(true);
    setBadge(null);
    setCamOpen(true);
    setCamView(robotMode ? 'real' : 'hand');
    if (robotMode) setRealCam(Math.max(0, handCam));
    cams.current?.aim(color);
    const note = (text: string) => t.alive && setTracking({ color, note: text });
    let failure: string | null = null;
    try {
      note('방향 맞추는 중이에요. 물체를 그대로 두세요');
      const look = async () => {
        const img = await grabHand();
        return img ? findColor(img, color) : null;
      };
      const s0 = await look();
      if (!s0) throw new Error(`카메라 화면에서 ${color}을 찾지 못했어요. 물체를 카메라 아래에 놓고 다시 눌러 주세요.`);
      // Probe towards the middle of the work area, 2 cm along x, then along y.
      const tip = tipOf(basePose());
      const PROBE = 20;
      const px = tip && tip.x > 190 ? -PROBE : PROBE;
      const py = tip && tip.y > 0 ? -PROBE : PROBE;
      const probe = async (d: { x: number; y: number }) => {
        const moved = { x: 0, y: 0 };
        const why = await trackMove(t, d, true, moved);
        if (why) throw new Error(`방향을 맞추려다 멈췄어요: ${why}`);
        const seen = t.alive ? await look() : null;
        const back = await trackMove(t, { x: -moved.x, y: -moved.y }, true);
        if (back) throw new Error(`방향을 맞추려다 멈췄어요: ${back}`);
        const again = t.alive ? await look() : null;
        return { seen, again, step: moved.x || moved.y };
      };
      const ax = await probe({ x: px, y: 0 });
      if (!t.alive) return;
      const ay = await probe({ x: 0, y: py });
      if (!t.alive) return;
      if (!ax.seen || !ay.seen || !ax.again || !ay.again) throw new Error(`방향을 맞추는 동안 ${color}이 화면에서 사라졌어요. 물체를 화면 가운데 쪽에 두고 다시 해 주세요.`);
      const sightings = [s0, ax.again, ay.again];
      const base: Seen = { ...s0, u: sightings.reduce((a, s) => a + s.u, 0) / 3, v: sightings.reduce((a, s) => a + s.v, 0) / 3 };
      if (sightings.some((s) => Math.hypot(s.u - base.u, s.v - base.v) > 20)) throw new Error('방향을 맞추는 동안 물체가 움직였어요. 가만히 둔 채 다시 해 주세요.');
      const j = probeJacobian(base, ax.seen, ay.seen, ax.step, ay.step);
      if (!j) throw new Error('카메라 화면이 팔의 움직임을 따라 움직이지 않아요. 손 카메라가 아래(물체)를 보고 있는지 확인해 주세요.');
      addLog('ok', `색 따라가기: 방향을 맞췄어요. 이제 ${color}을 화면 가운데에 두도록 따라가요.`);
      const div = new Divergence();
      let missing = 0;
      while (t.alive) {
        const s = await look();
        if (!t.alive) break;
        if (!s) {
          missing += 1;
          note(missing > 3 ? `${color}을 찾는 중이에요. 카메라 앞에 놓아 주세요` : `${color} 따라가는 중`);
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
        missing = 0;
        const off = offCentre(s);
        const d = stepTowards(j, s);
        if (div.feed(off, !!d)) throw new Error('따라갈수록 화면 가운데에서 멀어져요. 방향을 다시 맞춰야 해요 (물체를 가만히 두고 다시 시작).');
        if (!d) {
          note(`${color} 가운데 ✓`);
          await new Promise((r) => setTimeout(r, robotMode ? 120 : 80));
          continue;
        }
        note(`${color} 따라가는 중 · 가운데에서 ${Math.round(off)}px`);
        const why = await trackMove(t, d, false);
        if (why) note(`${color} 따라가는 중 · ${why}`);
        if (robotMode) await new Promise((r) => setTimeout(r, why ? 300 : 120));
      }
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    } finally {
      if (tracker.current === t) tracker.current = null;
      t.alive = false;
      if (robotMode) void stopRobot();
      else setAnglesView(world.current.angles.slice());
      cams.current?.aim(null);
      setTracking(null);
      setBusy(false);
      if (failure) {
        addLog('err', `색 따라가기: ${failure}`);
        setBadge({ kind: 'stop', text: '색 따라가기 멈춤' });
      } else addLog('info', '색 따라가기를 멈췄어요.');
    }
  };

  /* --- 손 따라하기 (the PC camera's hand moves the tool; a shown path is replayed) ------- */
  const handSeen = useRef<HandPose | null>(null);
  const [handState, setHandState] = useState<HandState>('idle');
  const [handWarn, setHandWarn] = useState<string | null>(null);
  const [handClosed, setHandClosed] = useState(false);
  const [handDemo, setHandDemo] = useState<{ seconds: number; points: DemoPoint[]; blocks: WorldState['blocks'] } | null>(null);
  const [handRecS, setHandRecS] = useState(0);
  const handGrip = EFFECTOR_BY_ID[effector].kind === 'grip';
  const onHandPose = (pose: HandPose | null) => {
    handSeen.current = pose;
    const f = follower.current;
    if (!f) return;
    // Out of sight: the tool stays where it is until the hand comes back.
    const out = pose ? f.mapper.update(pose) : null;
    f.target = out?.target ?? null;
    if (out) f.closed = out.closed;
  };
  /** Follow the hand: the tool goes after it at up to 150 mm/s, each step checked like a jog; a touch stops it. */
  const followHand = async () => {
    if (!loaded || busy || robotMode || follower.current) return;
    const pose = handSeen.current;
    const tip = tipOf(basePose());
    if (!pose || !tip) return addLog('err', '손이 안 보여요.', '손바닥을 카메라 쪽으로 펴 주세요.');
    const mapper = new HandMapper();
    mapper.reference(pose, tip);
    const f = { alive: true, mapper, target: null as PointMm | null, closed: mapper.closed, rec: null as DemoSample[] | null, t0: 0 };
    follower.current = f;
    if (jog.current) endJog();
    setBusy(true);
    setBadge(null);
    setHandState('follow');
    setHandWarn(null);
    token.current = { aborted: false };
    const isOpen = () => world.current.gapMm >= (EFFECTOR_BY_ID[world.current.effector].gapMm?.open ?? 0) - 0.5;
    let closedNow = handGrip && !isOpen();
    setHandClosed(closedNow);
    let warn: string | null = null;
    const say = (w: string | null) => {
      if (w !== warn) setHandWarn((warn = w));
    };
    let failure: string | null = null;
    let last = performance.now();
    let lastRec = 0;
    let frame = 0;
    try {
      while (f.alive) {
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (handGrip && f.closed !== closedNow) {
          await runProgram([{ type: 'grip', open: !f.closed, line: 0 }], { chain: loaded.chain, world: world.current, poses, animate, see: async () => null, log: (k, m) => addLog(k, m) });
          closedNow = f.closed;
          setHandClosed(closedNow);
        }
        const from = world.current.angles.slice();
        const goal = f.target;
        const cur = tipOf(from);
        if (goal && cur) {
          const d = { x: goal.x - cur.x, y: goal.y - cur.y, z: goal.z - cur.z };
          const len = Math.hypot(d.x, d.y, d.z);
          if (len > 0.8) {
            const k = Math.min(len, 150 * dt) / len;
            const sol = shiftTool(loaded.chain, from, { x: d.x * k, y: d.y * k, z: d.z * k }, 0.2);
            if (!sol.converged || sol.anglesDeg.some((a, i) => Math.abs(a - from[i]) > 8)) say('팔이 그쪽으로 더 닿지 않아요. 손을 조금 되돌려 주세요.');
            else {
              const to = sol.anglesDeg.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
              const bad = jogTo(loaded.chain, world.current, to);
              if (bad) {
                world.current.angles = from;
                failure = bad;
                break;
              }
              say(null);
            }
          }
        }
        if (f.rec && now - lastRec >= 100) {
          lastRec = now;
          const at = tipOf(world.current.angles);
          if (at) f.rec.push({ t: (now - f.t0) / 1000, tip: at, joints: world.current.angles.slice(), closed: closedNow });
          if (f.rec.length % 5 === 0) setHandRecS((now - f.t0) / 1000);
        }
        if (++frame % 2 === 0) setAnglesView(world.current.angles.slice());
      }
    } catch (err) {
      if (!(err instanceof Stop)) failure = err instanceof Error ? err.message : String(err);
    } finally {
      if (f.rec) finishDemo(f);
      if (follower.current === f) follower.current = null;
      f.alive = false;
      token.current = null;
      setAnglesView(world.current.angles.slice());
      setHandState('idle');
      setHandWarn(null);
      setBusy(false);
      if (failure) {
        addLog('err', `손 따라하기: ${failure}`, '손을 천천히 움직여 다시 해 보세요.');
        setBadge({ kind: 'stop', text: '손 따라하기 멈춤' });
      }
    }
  };
  /** The recording ends: the shown path, simplified to a few points (hand.ts simplifyDemo). */
  const finishDemo = (f: NonNullable<typeof follower.current>) => {
    const samples = f.rec ?? [];
    f.rec = null;
    if (samples.length < 3) return addLog('info', '녹화가 너무 짧아요. 손을 움직이며 다시 녹화해 보세요.');
    const points = simplifyDemo(samples, 5);
    const seconds = samples[samples.length - 1].t;
    setHandDemo((d) => ({ seconds, points, blocks: d?.blocks ?? [] }));
    addLog('ok', `시연을 ${seconds.toFixed(1)}초 녹화했어요. 지나간 길을 점 ${points.length}개로 줄였어요.`, '[재생]을 누르면 로봇이 같은 길을 따라 해요.');
  };
  const recordHand = (on: boolean) => {
    const f = follower.current;
    if (!f) return;
    if (on) {
      f.rec = [];
      f.t0 = performance.now();
      setHandRecS(0);
      // The desk as it was when the showing began: 재생 starts from it again.
      setHandDemo({ seconds: 0, points: [], blocks: world.current.blocks.map((b) => ({ ...b })) });
      setHandState('record');
    } else {
      finishDemo(f);
      setHandState('follow');
    }
  };
  /** 재생: the desk back as it was, then the shown path as a process (MOVE J to its start, MOVE L along it). */
  const replayHand = async () => {
    if (!loaded || busy || !handDemo?.points.length) return;
    const p = demoProcess(handDemo.points, handGrip);
    if (handDemo.blocks.length) {
      world.current.blocks = handDemo.blocks.map((b) => ({ ...b }));
      world.current.held = null;
      world.current.version += 1;
    }
    addLog('sim', `시연을 재생해요: 점 ${handDemo.points.length}개를 MOVE J · L 로 이어요.`);
    // The timeline names its marks by the demonstration's rows (MOVE L 시연 3), not by the program in the code tab.
    const names = p.rows.map((r) => (r.kind === 'move' ? `MOVE ${r.mode} ${r.note ?? ''}` : r.kind === 'grip' ? `그리퍼 ${r.open ? '열기' : '닫기'}` : `대기 ${r.sec}초`)).join('\n');
    const { ok } = await execute((h) => runProcess(compileProcess(p), h, p.speed), { reset: false, label: true, program: names });
    if (ok) addLog('ok', '로봇이 시연한 길을 따라 했어요.', '[공정으로]를 누르면 줄을 고치거나 파일로 저장할 수 있어요.');
  };
  /** 공정으로: the demonstration as rows of 공정 직접 짜기. */
  const demoToProcess = () => {
    if (!handDemo?.points.length) return;
    const p = demoProcess(handDemo.points, handGrip);
    changeProcess(p);
    setFlow({ ...flow, mode: 'free', step: 3, demo: true });
    openWork('process');
    addLog('info', `시연을 공정 ${p.rows.length}줄로 옮겼어요. 직접 짜기에서 점을 고치거나 저장해요.`);
  };

  const goPose = (which: 'home' | 'zero') => void goJoints(which === 'home' ? arm.home.slice() : arm.zero.slice(), which === 'home' ? '기본 자세' : '0° 자세');

  const toolStep = (step: Step, quiet = false) => {
    if (busy) return;
    void runSteps([step], { reset: false, quiet });
  };

  /** Pump buttons: the simulated pump, and on the robot the real one too. */
  const pumpStep = async (on: boolean) => {
    toolStep({ type: 'pump', on, line: 0 });
    if (!robotMode) return;
    const res = await pumpRobot(on);
    if (!res.ok) addLog('err', `로봇 펌프: ${res.error}`);
    else {
      addLog('info', on ? '실제 흡착 펌프를 켰어요.' : '실제 흡착 펌프를 껐어요.');
      note(5, `실제 흡착 펌프 ${on ? '켜기' : '끄기'}`, true);
    }
  };

  /** Gripper buttons: the simulated gripper, and on the robot the real one too. */
  const gripStep = async (open: boolean) => {
    toolStep({ type: 'grip', open, line: 0 }, robotMode);
    if (!robotMode) return;
    const res = await gripRobot(open, EFFECTOR_BY_ID[effector].gripperType ?? 1);
    if (!res.ok) addLog('err', `로봇 그리퍼: ${res.error}`);
    else {
      addLog('info', open ? '실제 그리퍼를 열었어요.' : '실제 그리퍼를 닫았어요.');
      note(5, `실제 ${EFFECTOR_BY_ID[effector].name} ${open ? '열기' : '닫기'}`, true);
    }
  };

  /** Hand guiding: all servos off (after a warning) or on again. */
  const toggleServos = async () => {
    if (!robot?.released && !window.confirm('서보를 풀면 팔이 아래로 떨어질 수 있어요.\n한 손으로 팔을 받쳤나요?')) return;
    const res = robot?.released ? await focusRobot() : await releaseRobot();
    if (!res.ok) addLog('err', `로봇: ${res.error}`);
    else addLog('info', robot?.released ? '서보를 고정했어요.' : '서보를 풀었어요. 팔을 손으로 받친 채 움직여 보세요.');
  };

  /* --- practice actions ------------------------------------------------------ */
  /** "AI 샘플 실행" (검수 6, on the robot): YOLOv5s object detection on the robot's own CPU. */
  const [aiResult, setAiResult] = useState<RobotAi | null>(null);
  const runAi = async () => {
    if (busy) return;
    // The real camera on screen, else the kit camera (else the hand camera).
    const cam = camOpen && camView === 'real' ? Math.min(realCam, Math.max(0, realCams - 1)) : Math.max(0, kitCam >= 0 ? kitCam : handCam);
    addLog('sim', '로봇(RDK X5) 안에서 AI 물체 인식(YOLOv5s)을 실행해요… 처음 한 번은 모델을 읽느라 몇 초 걸려요.');
    setBusy(true);
    const r = await aiOnRobot(cam);
    setBusy(false);
    if (!r.ok) return addLog('err', `로봇 AI 샘플: ${r.error ?? '실행하지 못했어요.'}`);
    session.current.visionRuns += 1;
    const names = r.detections.map((d) => `${d.label} ${Math.round(d.score * 100)}%`).join(', ') || '찾은 물체 없음';
    addLog('ok', `로봇에서 AI 처리 ${r.ms}ms${r.loadMs ? ` (모델 읽기 ${r.loadMs}ms)` : ''} · ${r.engine} · ${names}`);
    note(6, `AI 샘플 로봇 실행: YOLOv5s ${r.ms}ms, 찾은 물체: ${names}`, true);
    setAiResult(r);
  };

  /** "영상처리 실행": the colour program once — on the robot when it has a camera, else in this browser. */
  const runVision = async () => {
    if (busy) return;
    if (robotMode && robot?.camera) {
      addLog('sim', '로봇(RDK X5) 안에서 색 인식을 실행해요…');
      const r = kitCam < 0 && handCam >= 0 ? await handVisionOnRobot(handCam, BLOCK_MM - mountMm) : await visionOnRobot(Math.max(0, kitCam));
      if (!r.ok) return addLog('err', `로봇 영상처리: ${r.error}`);
      session.current.visionRuns += 1;
      const found = r.detections.map((d) => `${d.color}${d.x !== undefined ? ` (x ${Math.round(d.x)}, y ${Math.round(d.y!)})` : ''}`).join(', ');
      addLog('ok', `로봇에서 처리 ${r.ms}ms · ${r.engine} · 마커 ${r.markers.join('·') || '없음'} · 블록 ${r.detections.length}개${found ? `: ${found}` : ''}`);
      note(practice.check === 6 ? 6 : 4, `로봇 안 색 인식 ${r.ms}ms: 블록 ${r.detections.length}개${found ? `: ${found}` : ''}`, true);
      return;
    }
    const cam: CameraId = theme === 'kit' ? 'top' : 'hand';
    const frame = stageApi.current?.capture(cam);
    if (!frame) return addLog('err', theme === 'kit' ? '카메라 화면을 만들 수 없어요.' : '로봇팔 단독 실습 환경에서는 카메라 플랜지를 달아야 해요.');
    const [a, ms] = timed(() => analyse(cam, frame));
    cams.current?.push(cam, frame, true);
    session.current.visionRuns += 1;
    addLog('ok', `이 컴퓨터(브라우저)에서 처리 ${ms.toFixed(0)}ms · 블록 ${a.detections.length}개: ${a.detections.map((d) => d.color).join(', ') || '없음'}`);
    if (!robotMode) addLog('info', '로봇에 연결해 콘솔을 열면 같은 처리를 로봇(RDK X5) 안에서 실행해요.');
  };

  /** Real camera → simulator: put the simulated blocks where the real ones are. */
  const importBlocks = (found: Detection[]) => {
    if (busy) return;
    const next = { ...layout.current };
    for (const d of found) if (d.robot) next[d.color] = { x: Math.round(d.robot.x), y: Math.round(d.robot.y) };
    layout.current = next;
    resetWorld();
    setPassed(null);
    addLog('ok', `실제 카메라가 찾은 블록 ${found.length}개를 시뮬레이터에 옮겼어요. 이 배치로 시뮬레이션한 뒤 로봇에서 실행해요.`);
    note(4, `실제 블록 위치를 시뮬레이터로 가져옴: ${found.map((d) => `${d.color} (${Math.round(d.robot?.x ?? 0)}, ${Math.round(d.robot?.y ?? 0)})`).join(', ')}`, true);
  };


  /** Real hand camera → simulator: the robot works out where the blocks are (official hand-eye calibration). */
  const importHand = async () => {
    if (busy) return;
    addLog('sim', '로봇이 손 카메라 영상과 지금 팔 자세로 블록 위치를 계산해요…');
    const r = await handVisionOnRobot(realCam, BLOCK_MM - mountMm);
    if (!r.ok) return addLog('err', `손 카메라: ${r.error ?? '계산하지 못했어요.'}`);
    const found: Detection[] = r.detections
      .filter((d): d is typeof d & { x: number; y: number } => d.x !== undefined && d.y !== undefined && d.color in BLOCK_START)
      .map((d) => ({ color: d.color as ColorName, official: '', u: d.u, v: d.v, box: { x0: d.u, y0: d.v, x1: d.u, y1: d.v }, robot: { x: d.x, y: d.y } }));
    if (!found.length) return addLog('err', '손 카메라에서 블록을 찾지 못했어요.', '[카메라 자세]로 책상을 내려다보게 한 뒤, 블록이 화면에 보일 때 다시 눌러 주세요.');
    const where = found.map((d) => `${d.color} (x ${Math.round(d.robot!.x)}, y ${Math.round(d.robot!.y)})`).join(', ');
    addLog('info', `로봇 손 카메라 ${r.ms}ms · ${r.engine} · ${where}`);
    note(4, `실제 손 카메라로 블록 위치 계산 (공식 손-눈 보정, ${r.ms}ms): ${where}`, true);
    importBlocks(found);
  };

  /** A recorded pose's chip: go there (checked like any control-panel move). */
  const goSaved = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.pose ?? '';
    const q = poses[name];
    if (q) void goJoints(q.slice(), name);
  };

  /** Saved poses are kept in this browser, so they are still there next class. */
  const changePoses = (next: Record<string, number[]>) => {
    setPoses(next);
    try {
      localStorage.setItem(POSES_KEY, JSON.stringify(next));
    } catch {
      /* this session only */
    }
  };
  const deleteSaved = (e: React.MouseEvent<HTMLButtonElement>) => {
    const name = e.currentTarget.dataset.pose ?? '';
    const next = { ...poses };
    delete next[name];
    changePoses(next);
  };

  const recordPose = () => {
    const n = Object.keys(poses).length + 1;
    let name = `내 자세 ${n}`;
    for (let k = n; poses[name]; k += 1) name = `내 자세 ${k + 1}`;
    changePoses({ ...poses, [name]: basePose().map((a) => Math.round(a * 10) / 10) });
    addLog('ok', `'${name}' 자세를 저장했어요. [이 자세로] 를 누르면 이 자세로 돌아와요.`);
  };

  const kind = EFFECTOR_BY_ID[effector].kind;
  /** Tool tip (TCP) from the robot's base, so a base under the robot is taken off; with a tool, the flange too (what get_coords reports). */
  const tipOf = useCallback(
    (angles: readonly number[]) => {
      if (!loaded) return null;
      const p = tcpPositionMm(loaded.chain, angles, tcpNow);
      const r = forwardKinematics(loaded.chain, angles).rpyDeg;
      const f = tcpNow > 0 ? tcpPositionMm(loaded.chain, angles, 0) : null;
      return { ...p, z: p.z - mountMm, rx: r.x, ry: r.y, rz: r.z, flange: f ? { ...f, z: f.z - mountMm } : undefined, tilt: toolTiltDeg(loaded.chain, angles) };
    },
    [loaded, tcpNow, mountMm],
  );
  const camAvailable = theme === 'kit' || cameraFlange || (robotMode && !!robot?.camera);

  /* --- 입문 튜토리얼: the arm read a few times a second; a step done moves the quest on ----------- */
  const tutCtx = (): TutCtx => {
    const a = world.current.angles.slice();
    const tip = tipOf(a);
    return { angles: a, home: arm.home, tip: tip ? { x: tip.x, y: tip.y, z: tip.z } : { x: 0, y: 0, z: 0 }, poses, flowStep: flow.step, runs: procRuns };
  };
  const tutCtxRef = useRef(tutCtx);
  useEffect(() => {
    tutCtxRef.current = tutCtx;
  });
  useEffect(() => {
    if (!lifeTut) return;
    const t = lifeTutorialById(lifeTut.id);
    const step = t?.steps[lifeTut.step];
    if (!t || !step) return;
    const id = window.setInterval(() => {
      const now = tutCtxRef.current();
      if (!step.done(now, lifeTut.start, lifeTut.mem)) return;
      const next = lifeTut.step + 1;
      setLifeTut({ ...lifeTut, step: next, start: now, mem: {} });
      // The next step's panel opens by itself (the strip and its ringed control are there).
      if (next < t.steps.length) return void (t.steps[next].panel !== step.panel && openTutPanelRef.current(t.steps[next].panel));
      setTutDone((d) => {
        const n = { ...d, [t.id]: true };
        try {
          localStorage.setItem(TUT_KEY, JSON.stringify(n));
        } catch {
          /* private window */
        }
        return n;
      });
      addLog('ok', `튜토리얼 '${t.title}'를 마쳤어요.`);
    }, 300);
    return () => window.clearInterval(id);
  }, [lifeTut, addLog]);
  const openTutPanel = (panel: 'jog' | 'pose' | 'process') => {
    if (panel === 'process') return openTab('process');
    openSection(panel);
    openTab('direct');
  };
  const openTutPanelRef = useRef(openTutPanel);
  useEffect(() => {
    openTutPanelRef.current = openTutPanel;
  });
  /** 입문 기초 조작: out of a place, onto the empty desk (the arm only, nothing on the table). */
  const toPlainDesk = () => {
    if (busy) return;
    if (cellRef.current) leaveCell();
    if (theme === 'kit' || desk.scene !== 'empty' || desk.objects.length) deskScene('empty');
  };
  const startTutorial = (id: string) => {
    const t = lifeTutorialById(id);
    if (!t || busy) return;
    if (track) toPlainDesk();
    else if (cellRef.current) leaveCell();
    // 공정 짜기 from its first screen.
    if (id === 'teach') setFlow({ ...flow, step: 1 });
    const start = tutCtx();
    setLifeTut({ id, step: 0, start: id === 'teach' ? { ...start, flowStep: 1 } : start, mem: {} });
    openTutPanel(t.steps[0].panel);
  };

  /** No tool fitted: the open/close buttons still show, and say what to do. */
  /** The fitted tool's own buttons: in the jog screen (the 도구 screen only fits and swaps the tool). */
  const toolRow = (
    <div className={css.toolRow}>
      {/* One plate: TOOL, the tool's name, its keys (no tool: one key to fit one). */}
      <div className={`${css.poseRow} ${css.toolPlate}`}>
        <span className={css.toolTag}>
          <em>TOOL</em>
          <b>{kind === 'none' ? '도구 없음' : EFFECTOR_BY_ID[effector].name}</b>
        </span>
        {kind === 'none' && (
          <button type="button" className={`${css.jogWide} ${css.toolFit}`} disabled={busy} onClick={() => openWork('parts')} aria-label="도구 달기">
            달기 ›
          </button>
        )}
        {kind === 'grip' && (
          <>
            <button type="button" className={css.jogWide} disabled={busy} onClick={() => void gripStep(true)}>
              열기
            </button>
            <button type="button" className={css.jogWide} disabled={busy} onClick={() => void gripStep(false)}>
              닫기
            </button>
          </>
        )}
        {kind === 'suction' && (
          <>
            <button type="button" className={css.jogWide} disabled={busy} onClick={() => pumpStep(true)}>
              흡착 켜기
            </button>
            <button type="button" className={css.jogWide} disabled={busy} onClick={() => pumpStep(false)}>
              흡착 끄기
            </button>
          </>
        )}
        {kind === 'suction' && robotMode && robot && !robot.pump && (
          <p className={css.pumpWarn} role="alert">
            <b>로봇에서 펌프를 켤 수 없어요.</b> {robot.pumpError || '펌프 제어가 없어요.'}
            <br />
            로봇 터미널에서 <code>sudo python3 /media/*/eduino/checks/pump_check.py</code> 로 원인을 확인해요 (매뉴얼 &lsquo;흡착 펌프&rsquo;).
          </p>
        )}
        {kind === 'pen' && (
          <>
            <button type="button" className={css.jogWide} disabled={busy} onClick={() => toolStep({ type: 'pen', down: true, line: 0 })}>
              펜 내리기
            </button>
            <button type="button" className={css.jogWide} disabled={busy} onClick={() => toolStep({ type: 'pen', down: false, line: 0 })}>
              펜 올리기
            </button>
          </>
        )}
        {kind === 'press' && (
          <button type="button" className={css.jogWide} disabled={busy} onClick={() => toolStep({ type: 'push', line: 0 })}>
            누르기
          </button>
        )}
      </div>
      {cameraFlange && (
        <div className={css.poseRow}>
          <button
            type="button"
            className={css.jogWide}
            disabled={busy && !tracking}
            onClick={() => {
              if (tracking) return stopTracking();
              setCamView(robotMode && handCam >= 0 ? 'real' : 'hand');
              if (robotMode && handCam >= 0) setRealCam(handCam);
              setCamOpen(true);
            }}
            title="손 카메라가 고른 색을 화면 가운데에 두도록 팔이 따라 움직여요"
          >
            <Icon name="camera" size={15} /> {tracking ? '색 따라가기 멈추기' : '색 따라가기'} <small>손 카메라</small>
          </button>
        </div>
      )}
    </div>
  );

  const poseNames = Object.keys(poses);
  const recordRow = (
    <div className={css.poseList}>
      <button className={`${css.jogWide} ${css.poseSave}`} type="button" disabled={busy} onClick={recordPose}>
        <Icon name="save" size={15} /> 지금 자세 저장하기
      </button>
      {poseNames.length === 0 && (
        <>
          <p className={css.poseHelp}>
            [제어]로 팔을 옮긴 뒤 저장하면 관절 {arm.home.length}개의 각도가 이름과 함께 여기에 쌓여요.
          </p>
          <ul aria-label="고정 자세">
            {(
              [
                ['home', '기본 자세', arm.home],
                ['zero', '일자', arm.zero],
              ] as const
            ).map(([id, name, angles]) => (
              <li key={id}>
                <span className={css.poseIcon}>
                  <Icon name={id} size={18} />
                </span>
                <span className={css.poseName}>
                  <b>{name}</b>
                  <small>{angles.map((a) => `${Math.round(a * 10) / 10}°`).join(' ')}</small>
                </span>
                <button type="button" className={css.poseGo} disabled={busy} onClick={() => goPose(id)}>
                  이 자세로
                </button>
                <em className={css.poseFixed} title="고정 자세 (지울 수 없어요)" aria-label="고정">
                  <Icon name="lock" size={14} />
                </em>
              </li>
            ))}
          </ul>
        </>
      )}
      {poseNames.length > 0 && (
        <ul>
          {poseNames.map((n) => (
            <li key={n}>
              <span className={css.poseIcon}>
                <Icon name="flag" size={18} />
              </span>
              <span className={css.poseName} title={`J1~J6: ${poses[n].join('°, ')}°`}>
                <b>{n}</b>
                <small>{poses[n].map((a) => `${a}°`).join(' ')}</small>
              </span>
              <button type="button" className={css.poseGo} disabled={busy} data-pose={n} onClick={goSaved} title={`${n}(으)로 움직여요`}>
                이 자세로
              </button>
              <button type="button" className={css.poseDel} aria-label={`${n} 지우기`} data-pose={n} onClick={deleteSaved}>
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
      {poseNames.length > 0 && (
        <p className={css.subNote}>{level === 'basic' ? '블록의 [자세로 가기]에서도 이 이름으로 쓸 수 있어요.' : '마우스를 올리면 각도가 보여요. send_angles([...]) 에 그대로 쓸 수 있어요.'}</p>
      )}
    </div>
  );

  /** The panel tab as shown: a language tab always shows the language in use. */
  const shownTab: PanelTab = tab === 'direct' || tab === 'process' ? tab : level;
  const canPick = ['grip', 'suction'].includes(kind);
  /** The 실습 환경 whose ▶ 데모 this arm can play. */
  const demoOk = (id: SceneId) => demoFits(id, arm);
  /** One line on the monitor and four lights on the panel: what the console is doing now. */
  const lights = {
    sim: !robotMode,
    robot: robotMode && !!robot?.connected && !serverLost,
    running: busy || realRun,
    error: (robotMode && (serverLost || !robot?.connected)) || badge?.kind === 'stop',
  };
  const connectionLost = robotMode && (serverLost || !robot?.connected);
  /** Why the 오류 light is on (the status popover): the robot connection, or the problem the notices show now. */
  const lastLog = log[log.length - 1];
  const errorReason = connectionLost ? '로봇 연결 확인' : lastLog && (lastLog.kind === 'err' || lastLog.kind === 'warn') ? lastLog.msg : (badge?.text ?? '멈춤');
  const hudStatus: HudStatus = lights.error
    ? { text: connectionLost ? '로봇 연결 확인' : (badge?.text ?? '멈춤'), tone: 'stop' }
    : lights.running
      ? { text: robotMode ? '실제 로봇 · 실행 중' : '시뮬레이션 · 실행 중', tone: 'run' }
      : robotMode
        ? { text: '실제 로봇 연결', tone: 'real' }
        : { text: '정상 · 시뮬레이션', tone: 'ok' };

  /** The mini arm's corner: right of the left menu bar, above the position line. */
  const miniPlace = useMemo<() => MiniRect>(
    () => () => {
      const vp = shellRef.current?.querySelector<HTMLElement>('[data-viewport]');
      const panel = shellRef.current?.querySelector<HTMLElement>('aside');
      const v = vp?.getBoundingClientRect();
      const p = panel?.getBoundingClientRect();
      const dock = v && p && panel && getComputedStyle(panel).position === 'absolute' && p.left < v.left + v.width / 2 ? p.right - v.left + 12 : 12;
      return { ...MINI, left: dock + miniLeft() };
    },
    [],
  );

  // The planned tool path leg by leg, as the arm will go: a J leg (all joints together) bends, an
  // L leg is the straight line (drawn differently in 3D, so the two kinds can be told apart).
  const planLegs = useMemo(() => {
    if (!loaded) return [];
    const tip = (j: readonly number[]) => {
      const q = tcpPositionMm(loaded.chain, j, tcpNow);
      return { ...q, z: q.z - mountMm };
    };
    const legs: { mode: 'J' | 'L'; pts: Spot[] }[] = [];
    let from = flow.startJoints;
    for (const r of built.rows) {
      if (r.kind !== 'move' || !r.joints) continue;
      const to = r.joints;
      const n = r.mode === 'J' ? 16 : 1;
      legs.push({ mode: r.mode, pts: Array.from({ length: n + 1 }, (_, k) => tip(from.map((a, i) => a + ((to[i] - a) * k) / n))) });
      from = to;
    }
    return legs.filter((l) => Math.hypot(l.pts[0].x - l.pts.at(-1)!.x, l.pts[0].y - l.pts.at(-1)!.y, l.pts[0].z - l.pts.at(-1)!.z) > 0.5);
  }, [loaded, built, flow.startJoints, tcpNow, mountMm]);
  // 공정 짜기 in 3D: the base frame and the + mark while checking the zero; the taught places and the path after.
  const planMarks =
    view === 'sim' && shownTab === 'process' && dockShown && !zeroMode && (flow.step === 1 || flow.step >= 3)
      ? flow.step === 1
        ? {
            spots: [
              { tag: '0', label: '위치 기준 (0, 0, 0)', at: { x: 0, y: 0, z: 0 } },
              { tag: '+', label: `기준점 X ${REF_MARK.x} · Y ${REF_MARK.y}`, at: REF_MARK },
            ],
            path: [],
          }
        : flow.mode === 'free'
          ? null
          : { spots: built.marks, path: built.path, legs: planLegs, ghost: jointTry?.key === planKey ? jointTry.trail : undefined }
      : null;
  // 입문: while a step runs, the view goes to the station the tool works at (from its side, the cup in
  // view), unless the user has moved the view; back to the whole place when the run is over.
  const lifeCell = track && (cellAt?.cell === 'cafe' || cellAt?.cell === 'draw' || cellAt?.cell === 'board') ? cellAt.cell : null;
  // A run ends the place's tour (the run's own camera takes over).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the tour stops when a run starts
    if (busy) setTouring(null);
  }, [busy]);
  useEffect(() => {
    if (!lifeCell || !busy || touring) return;
    let last: string | null = null;
    let seen: string | null = null;
    let followed = false;
    const id = window.setInterval(() => {
      const api = stageApi.current;
      if (!api || api.userMoved()) return;
      const tip = tipOf(world.current.angles);
      const st = tip ? stationAt(lifeCell, tip) : null;
      // Two looks in a row at the same station before moving (passing by is not working there).
      if (!st || st.name !== seen) {
        seen = st?.name ?? null;
        return;
      }
      if (st.name === last) return;
      last = st.name;
      followed = true;
      api.lookAt(st.eye, st.target);
    }, 350);
    return () => {
      window.clearInterval(id);
      const api = stageApi.current;
      if (followed && api && !api.userMoved()) window.setTimeout(() => api.view('home'), 1200);
    };
  }, [lifeCell, busy, touring, tipOf]);
  /** 입문: the step's 예측 first (once per step, unless skipped), then the run. */
  const simulateLife = () => {
    const ms = cellAt?.mission;
    if (!questOn && track && ms && guideOf(ms) && loadPredictions()[ms] === undefined && !skipped[ms] && !busy) return setAsking(true);
    void simulate();
  };
  const runBar = (
    <RunBar
      passed={gateOpen}
      robotDone={!!progress[markKey(here)]?.robot}
      robotMode={robotMode}
      busy={busy}
      ready={!!loaded}
      realProgress={realRun && robot && robot.step >= 0 ? `${robot.step + 1}/${robot.total}` : null}
      realDisabled={!gateOpen || (robotMode && !robot?.connected)}
      realBlocked={robotMode && !robot?.connected ? '로봇 연결 필요' : !gateOpen ? '시뮬레이션 통과 후' : null}
      onSim={track ? simulateLife : simulate}
      simRate={simRate}
      onSimRate={chooseSimRate}
      onReal={robotMode ? runReal : openExport}
      onStop={stop}
    />
  );

  const controlPanel = (
    <ControlPanel
      live={live}
      speed={jogSpeed}
      onSpeed={setJogSpeed}
      tipOf={tipOf}
      busy={busy || !loaded || (robotMode && (!robot?.connected || !!robot?.released))}
      real={robotMode}
      onJointPreview={setJoint}
      onJointCommit={(...a: Parameters<typeof jointCommit>) => {
        markStart('move');
        return jointCommit(...a);
      }}
      onJointStep={(i, d) => {
        markStart('move');
        jointStep(i, d);
      }}
      onTipStep={(a, d) => {
        markStart('move');
        tipStep(a, d);
      }}
      blocked={tipBlocked}
      onToolDown={toolDown}
      onHome={() => goPose('home')}
      onJointJog={(i, dir) => {
        markStart('move');
        startJog({ joint: i, dir });
      }}
      onTipJog={(axis, dir, scale) => {
        markStart('move');
        startJog({ axis, dir, scale });
      }}
      onJogStop={() => endJog()}
      selected={jogJoint}
      onSelect={setJogJoint}
    />
  );

  /* --- the menu bar: work screens in the side panel, view windows next to the bar ------------ */
  const wideOn = blockWide && dockShown && shownTab !== 'direct' && shownTab !== 'process' && (cellAt ? !cellTerm : level === 'basic');
  const workScreen = zeroMode ? 'zero' : shownTab === 'direct' ? section || 'jog' : shownTab;
  const openWork = (id: string) => {
    if (dockShown && workScreen === id) return toggleDock();
    if (id === 'zero') {
      setZeroMode(true);
      // The 0° pose stands the arm straight up: frame all of it.
      stageApi.current?.view('tall');
      return chooseTab('direct');
    }
    if (zeroMode) {
      setRingJoint(null);
      setZeroMode(false);
    }
    if (id === 'jog' || id === 'parts' || id === 'pose' || id === 'hand' || id === 'theme') {
      openSection(id);
      return openTab('direct');
    }
    if (id === 'code') {
      if (dockShown && (workScreen === 'basic' || workScreen === 'python' || workScreen === 'ros')) return toggleDock();
      return openTab(level);
    }
    openTab(id as PanelTab);
  };
  const work = (id: string, label: string, icon: string, title: string, free = false): BarItem => ({
    id,
    label,
    icon,
    title,
    on: dockShown && workScreen === id,
    disabled: busy && !free && workScreen !== id,
    onClick: () => openWork(id),
  });
  const toggleRail = (item: RailItem) => {
    const open = railOpen ?? (camOpen ? 'camera' : null);
    const next = open === item ? null : item;
    if (next === 'camera') {
      setRailOpen(null);
      setCamOpen(true);
      return;
    }
    if (next === null && !railOpen) setCamOpen(false);
    if (next !== null) setCamOpen(false);
    setRailOpen(next);
  };
  const viewItem = (id: RailItem, label: string, icon: string, title: string, badge?: string): BarItem => ({
    id,
    label,
    icon,
    title,
    badge,
    on: id === 'camera' ? camOpen && !railOpen : railOpen === id,
    onClick: () => toggleRail(id),
  });
  // 제어: moving the arm by hand. 작업: programs that run (a process of points, blocks, Python, ROS 2). 보기: windows.
  // 입문 트랙's café and calligraphy booth: the program is 작업 순서 카드, not code (CafeMaker · DrawCards · BoardCards).
  const recipeOn = !!track && (cellAt?.cell === 'cafe' || cellAt?.cell === 'draw' || cellAt?.cell === 'board');
  const controlGroup = { name: '제어', items: [work('jog', '제어', 'move', '제어: 관절 · 좌표로 움직이기 (조그)', true), { ...work('parts', '도구', 'tool', '도구 · 액세서리', true), hintFor: '끼우기, 도구' }, { ...work('pose', '자세', 'home', '자세 저장 · 불러오기', true), hintFor: '기본 자세, 일자로 펴기, 카메라 자세, 이 자세로, 자세' }] };
  const objectsItem = theme === 'kit' ? [] : [viewItem('objects', '물건', 'box', '책상에 물건 놓기', desk.objects.length ? String(desk.objects.length) : undefined)];
  const monitorItem = viewItem('monitor', '모니터', 'chart', '관절 · 손끝 · 그래프 · 부하');
  // 입문 트랙: 제어 · 도구 · 자세 always; 테마학습 (실생활 협동로봇 · 튜토리얼) and, in a place, its 작업 순서; 물건 · 모니터.
  const lifeGroups = [
    controlGroup,
    {
      name: '학습',
      items: [
        work('theme', '테마학습', 'flag', '테마학습: 실생활 협동로봇 · 튜토리얼'),
        ...(recipeOn ? [{ ...work('code', '순서', 'code', '작업 순서: 카드로 로봇이 할 일을 차례로'), on: dockShown && (workScreen === 'basic' || workScreen === 'python' || workScreen === 'ros') }] : []),
      ],
    },
    { name: '보기', items: [...objectsItem, monitorItem] },
  ];
  const fullGroups = [
    controlGroup,
    {
      name: '작업',
      items: [
        work('process', '공정', 'flag', '공정 짜기: 위치를 가르쳐 옮기기 · 그리기'),
        ...(!robotMode ? [{ ...work('hand', '손', 'hand', '손 따라하기: PC 카메라로 손을 보여 주면 로봇이 따라 하고, 시연한 길을 재생해요'), on: dockShown && workScreen === 'hand' }] : []),
        { ...(recipeOn ? work('code', '순서', 'code', '작업 순서: 카드로 로봇이 할 일을 차례로') : work('code', '코딩', 'code', '코딩: 블록 · Python · ROS 2 (튜토리얼)')), on: dockShown && (workScreen === 'basic' || workScreen === 'python' || workScreen === 'ros') },
      ],
    },
    {
      name: '보기',
      items: [
        { ...viewItem('env', '환경', 'scene', '실습 환경 · 장면마다 ▶ 데모'), hintFor: '책상에 매트와 블록 놓기, 매트, 실습 환경, 블록 섞기, 처음 상태로, 물리' },
        ...objectsItem,
        ...(camAvailable ? [viewItem('camera', '카메라', 'camera', '카메라 화면 · 영상 처리')] : []),
        monitorItem,
      ],
    },
  ];
  const barGroups = track?.menu.includes('theme') ? lifeGroups : fullGroups;
  // A 트랙 opens only its menus.
  const shownGroups = track ? barGroups.map((g) => ({ ...g, items: g.items.filter((i) => track.menu.includes(i.id)) })).filter((g) => g.items.length) : barGroups;
  // The mini arm (angles, load, tip position) stays on every screen, 제어 too.
  const miniWanted = display.mini;
  const miniOn = miniWanted && !railOpen && !cellAt;
  useEffect(() => {
    miniShown.current = miniWanted;
  }, [miniWanted]);
  const barFoot: BarItem[] = [{ ...work('zero', '영점', 'zero', robotMode ? '영점 맞추기' : '로봇을 연결하면 영점을 맞춰요'), disabled: !robotMode || (busy && !zeroMode) }];
  /** The 3D view's top-left corner: the arm's name and ROBOT LINK, when no cell or window is there. */
  const stageTitle = !!loaded && view === 'sim' && !cellAt && !railOpen && !lifeTut;
  /** The open screen in the 3D view's corner: [English, Korean]. */
  const SCREEN_EN: Record<string, string> = { hand: 'HAND', jog: 'CONTROL', parts: 'TOOL', pose: 'POSE', zero: 'ZERO', process: 'TASK', basic: 'CODE', python: 'CODE', ros: 'CODE', ai: 'AI' };
  const SCREEN_TITLE: Record<string, string> = { theme: '테마학습', hand: '손 따라하기', jog: '제어', parts: '도구', pose: '자세', zero: '영점', process: '공정', basic: recipeOn ? '작업 순서' : '코딩', python: '코딩', ros: '코딩' };

  const zeroPanel = (
    <ZeroPanel
      live={live}
      busy={busy}
      onFocusJoint={setRingJoint}
      onPose={goPose}
      onJointServo={async (j, off) => {
        const res = await jointServo(j, off);
        if (!res.ok) addLog('err', `로봇: ${res.error}`);
        else addLog('info', off ? `J${j} 만 풀었어요. 팔을 받친 채 표시선을 손으로 맞춰 주세요.` : `J${j} 서보를 고정했어요.`);
        return res.ok;
      }}
      onNudge={async (j, d) => {
        if (!robot?.angles) return false;
        const to = robot.angles.slice();
        to[j - 1] = Math.min(jointMax()[j - 1], Math.max(jointMin()[j - 1], to[j - 1] + d));
        previewing.current = false;
        const res = await moveRobot(to, 10);
        if (!res.ok) addLog('err', `로봇: ${res.error}`);
        return res.ok;
      }}
      onCalibrate={async (joints) => {
        const res = await calibrateRobot(joints);
        const names = joints.map((j) => `J${j}`).join(', ');
        if (!res.ok) addLog('err', `영점: ${res.error}`);
        else addLog('ok', `${names} 영점을 저장했어요. 지금 위치가 0° 예요.`);
        return res.ok;
      }}
      onClose={() => {
        setRingJoint(null);
        setZeroMode(false);
      }}
    />
  );

  /**
   * [PC 프로그램 받기]: one HTML file to keep on the desktop. Opened with a double click it finds
   * the robots on the classroom network and opens the chosen one's console; the robot this page
   * came from is written into it, so it is listed first.
   */
  const downloadLauncher = async () => {
    try {
      const res = await fetch('/pc/physical-ai-tool.html', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Opened on the robot itself (localhost): the PC needs the robot's network address instead.
      const local = /^(localhost|127\.|\[::1\])/.test(window.location.hostname) && robot?.ips?.[0];
      const address = local ? `${robot.ips![0]}:${window.location.port || 80}` : window.location.host;
      const known = robotMode && robot?.robotId ? [{ id: robot.robotId, address, ips: robot.ips ?? [] }] : [];
      const html = (await res.text()).replace('/*ROBOTS*/[]', JSON.stringify(known).replace(/</g, '\\u003c'));
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Physical AI Tool.html';
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      addLog('ok', "PC 프로그램 'Physical AI Tool.html' 을 받았어요. 다운로드 폴더에서 바탕화면으로 옮겨 두고, 더블클릭하면 로봇을 찾아 바로 열어요. (크롬이 물으면 [유지])");
    } catch (err) {
      addLog('err', `PC 프로그램을 받지 못했어요: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Another page shown (교육 · 라이브러리 · 자료실): the paused 3D view does not hold the start screen.
  const splashDone = started || scene3d === 'slow' || !!loadError || (view !== 'sim' && !!loaded);
  // Served by the robot: the model is the robot's own (myCobot 280 RDK X5 server).
  // With the model choice hidden (MODEL_CHOICE, no extra arms), it is the myCobot 280 RDK X5 everywhere.
  const modelNow = robotMode || !choice ? DEFAULT_MODEL : model;
  /** Past the intro's last frame (CONNECT or SIMULATOR); on a robot's own console the intro steps aside by itself. */
  const [entered, setEntered] = useState(false);
  // 입문: the first place is toured once the console is entered (the intro's [시작]).
  useEffect(() => {
    if (!track || !entered || !loaded || !cellAt || toured.current) return;
    toured.current = true;
    // After the intro has faded out.
    const id = window.setTimeout(() => setTouring(cellAt.cell), 1400);
    return () => window.clearTimeout(id);
  }, [track, entered, loaded, cellAt]);
  const pastIntro = entered || robotMode || picking;
  const showPicker = splashDone && pastIntro && !connectOpen && (picking || !modelNow);

  // Connecting to the real robot (a myCobot 280) while another arm was open: the model choice goes back
  // to the 280 too, so the picker, the saved choice and the screen agree.
  useEffect(() => {
    if (!robotMode || model === null || model === DEFAULT_MODEL) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the connected robot decides the model
    setModel(DEFAULT_MODEL);
    try {
      localStorage.setItem(MODEL_KEY, DEFAULT_MODEL);
    } catch {
      /* this session only */
    }
    addLog('info', '실물 myCobot 280 과 연결돼서 화면의 로봇팔도 myCobot 280 이에요.');
  }, [robotMode, model, addLog]);

  const chooseModel = (id: RobotModelId) => {
    if (modelById(id)?.kind === 'agv') {
      router.push('/agv');
      return;
    }
    // Connected, the arm on screen is the real myCobot 280 the page drives: another arm cannot open.
    if (robotMode && id !== DEFAULT_MODEL) {
      setPicking(false);
      addLog('warn', `실물 myCobot 280 과 연결된 동안은 다른 로봇팔(${modelById(id)?.name ?? id})을 열 수 없어요.`, '오른쪽 위 [로봇 연결] → [연결 끊기 (시뮬레이션으로)] 를 누른 뒤 다시 골라 주세요.');
      return;
    }
    switchArm(id);
    setModel(id);
    setPicking(false);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      /* this session only */
    }
  };

  /**
   * [다시 연결]: the server gone — ask it again now (the page also keeps asking by itself);
   * the server there but the arm silent — have the server reopen the robot's port.
   */
  const reconnect = async () => {
    setRetry({ busy: true, note: '' });
    if (serverLost) {
      const s = await fetchRobotState(AbortSignal.timeout(3000));
      setRetry({ busy: false, note: s ? '' : '아직 연결되지 않았어요. 아래를 확인한 뒤 다시 눌러 주세요. (화면도 계속 스스로 다시 시도해요)' });
      return;
    }
    const res = await reconnectRobot();
    if (res.ok) addLog('ok', '로봇 팔과 다시 연결됐어요.');
    setRetry({ busy: false, note: res.ok ? '' : res.error ?? '다시 연결하지 못했어요.' });
  };

  const chooseMode = (m: ConsoleMode) => {
    if (m === mode || busy) return;
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* this session only */
    }
    // The demonstration starts on a check: the open practice when it is one, else check 1 — on the
    // check's own example program either way, always in the AI kit at 초급 (each check the same way,
    // whatever was open before).
    if (m === 'check') {
      const w = openCheck(practice.check ?? 1, 'basic', 'kit');
      if (w) selectPractice(w.level, w.theme, w.id, undefined, true);
    }
    addLog('info', m === 'check' ? '검수 시연 모드예요. 위의 1~7 번호로 검수 항목을 하나씩 열어 시연해요.' : '실습 모드예요. [라이브러리]의 실습 과제에서 주제별 실습을 골라요.');
  };

  // The arm standing into the kit, the plate or the desk while still (the scene changed under it, or the
  // real arm stands so): the simulated arm goes back home, as a twin would; the real one shows red on the
  // 3D arm with a notice pointing at [기본 자세] (only the user may move a real arm).
  const touchSaid = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || view !== 'sim') return;
    const t = window.setInterval(() => {
      if (busyRef.current || previewing.current) return;
      const w = world.current;
      const err = poseContact(loaded.chain, w);
      if (!err) {
        if (w.contact?.until === Infinity) w.contact = null;
        touchSaid.current = null;
        return;
      }
      if (!robotMode) {
        w.angles = activeArm().home.slice();
        w.version += 1;
        setAnglesView(w.angles.slice());
        addLog('info', `팔이 장면과 겹쳐 있어서 (${err.message.replace(/\.$/, '')}) 기본 자세로 옮겼어요.`);
        return;
      }
      w.contact = { joints: contactJoints(err.message), until: Infinity };
      if (touchSaid.current !== err.message) {
        touchSaid.current = err.message;
        addLog('warn', `지금 로봇 팔이 3D 장면과 겹쳐요: ${err.message}`, '실제 팔 주변이 비어 있는지 보고 [기본 자세]를 눌러 팔을 빼 주세요.');
      }
    }, 800);
    return () => window.clearInterval(t);
  }, [loaded, view, robotMode, addLog]);

  // The flange again on connect, on a tool change and every 20 s while the arm is idle (tools get swapped mid-class).
  const flangeLive = robotMode && !!robot?.connected;
  useEffect(() => {
    if (!flangeLive) return;
    const look = () => {
      if (!robotNow.current?.running) void readFlange();
    };
    look();
    const t = window.setInterval(look, 20000);
    return () => window.clearInterval(t);
  }, [flangeLive, effector, readFlange]);
  const mismatch = flangeLive ? toolMismatch(effector, flange) : null;
  const mismatchKey = mismatch ? `${effector}:${mismatch}` : '';

  /** The real arm for the 교육 screens (only when this console runs on the robot). */
  const realArm = useMemo<RealArm>(
    () => ({
      online: robotMode && !!robot?.connected,
      angles: robot?.angles ?? null,
      move: (angles, speed) => moveRobot(angles, speed),
      run: async (actions) => {
        const why = flangeRefusal(toolsUsed(actions), await readFlange());
        return why ? { ok: false, error: why } : runOnRobot(actions);
      },
      now: () => robotNow.current?.angles ?? null,
      target: (angles, speed) => targetRobot(angles, speed),
      stop: () => stopRobot(),
      pump: async (on) => {
        const why = on ? flangeRefusal({ grip: false, pump: true }, await readFlange()) : '';
        return why ? { ok: false, error: why } : pumpRobot(on);
      },
      grip: async (open) => {
        const why = flangeRefusal({ grip: true, pump: false }, await readFlange());
        return why ? { ok: false, error: why } : gripRobot(open, EFFECTOR_BY_ID[effector].gripperType ?? 1);
      },
    }),
    [robotMode, robot?.connected, robot?.angles, effector, readFlange],
  );

  // Banners about the robot (another PC drives it · the tool does not match · the link is down): they
  // share the top-centre column with the notices (Notices `above`), so the 기록 button never sits under them.
  const bannerOn = !!(
    (robotMode && !serverLost && robot?.connected && otherOwner(robot)) ||
    (mismatch && !pcOffer && flangeHidden !== mismatchKey && !otherOwner(robot)) ||
    (robotMode && (serverLost || (robot && !robot.connected)))
  );
  const banners = (
    <>
        {robotMode && !serverLost && robot?.connected && otherOwner(robot) && (
          <div className={css.ownerBanner} role="status">
            <b>다른 PC({otherOwner(robot)})가 이 로봇을 움직이는 중이에요.</b>
            <span>그동안 이 화면의 로봇 명령은 로봇이 받지 않아요. 그 PC 가 끝내고 15초가 지나면 다시 쓸 수 있어요. 멈추기는 언제나 돼요.</span>
          </div>
        )}
        {mismatch && !pcOffer && flangeHidden !== mismatchKey && !otherOwner(robot) && (
          <div className={css.ownerBanner} role="status" aria-label="도구 확인">
            <b>
              {mismatch === 'no-gripper'
                ? `화면의 도구는 ${EFFECTOR_BY_ID[effector].name}인데, 로봇의 그리퍼가 대답하지 않아요.`
                : `로봇에 그리퍼가 끼워져 있어요. 화면의 도구는 ${EFFECTOR_BY_ID[effector].name}예요.`}
            </b>
            <span>
              {mismatch === 'no-gripper'
                ? '그리퍼가 끼워져 있는지, 그리퍼 케이블이 팔 끝에 꽂혀 있는지 확인해요. 다른 도구를 끼웠다면 도구 칸에서 그 도구로 바꿔요.'
                : '이대로 실행하면 손끝 길이가 달라 블록에 닿지 않거나 부딪힐 수 있어요. 화면 도구를 그리퍼로 바꿔요.'}
            </span>
            <span className={css.ownerActions}>
              {mismatch === 'gripper-fitted' && (
                <button type="button" className={css.primary} disabled={busy} onClick={() => changeTool('adaptive', cameraFlange)}>
                  어댑티브 그리퍼로 바꾸기
                </button>
              )}
              <button type="button" className={css.ghost} onClick={() => void readFlange()}>
                다시 확인
              </button>
              <button type="button" className={css.ghost} onClick={() => setFlangeHidden(mismatchKey)}>
                닫기
              </button>
            </span>
          </div>
        )}
        {robotMode && (serverLost || (robot && !robot.connected)) && (
          <div className={css.connBanner} role="alert">
            <b>{serverLost ? '로봇 서버와 연결이 끊겼어요' : '로봇 팔이 대답하지 않아요'}</b>
            <ol>
              {serverLost ? (
                <>
                  <li>로봇 전원이 켜져 있는지 확인해요.</li>
                  <li>PC 와 로봇이 같은 공유기(와이파이)에 연결돼 있는지 확인해요.</li>
                  <li>로봇의 서버가 켜져 있는지 확인해요 (자동 시작, 또는 로봇 터미널의 python3 server.py).</li>
                </>
              ) : (
                <>
                  <li>로봇 베이스의 전원 스위치와 전원 어댑터를 확인해요.</li>
                  <li>로봇 포트를 쓰는 다른 프로그램(공식 앱, ROS 2 예제 등)을 꺼요.</li>
                  <li>로봇을 껐다 켰다면 아래 [다시 연결]을 눌러요.</li>
                </>
              )}
            </ol>
            <div className={css.connBannerRow}>
              <button type="button" className={css.btnAction} disabled={retry.busy} onClick={() => void reconnect()}>
                <Icon name="refresh" size={15} /> {retry.busy ? '연결하는 중…' : '다시 연결'}
              </button>
              {/* The robot may have a new address (Wi-Fi changed, new lease): find it again, or go on without it. */}
              <button type="button" className={css.ghost} onClick={() => setConnectOpen(true)}>
                로봇 다시 찾기
              </button>
              {remoteRobot() && (
                <button
                  type="button"
                  className={css.ghost}
                  onClick={() => {
                    setRemoteRobot(null);
                    skipIntroOnce();
                    window.location.reload();
                  }}
                >
                  시뮬레이션으로
                </button>
              )}
              {retry.note && <span>{retry.note}</span>}
            </div>
          </div>
        )}
    </>
  );

  return (
    // data-busy: a program or a move is running (read by the behaviour checks).
    <div className={css.app} data-busy={busy || undefined}>
      <Intro
        brand={track?.intro}
        ready={splashDone}
        progress={loadError || started ? 1 : loaded ? 0.72 : 0.3}
        note={loadError ? '로봇 모델을 불러오지 못했어요' : started ? '준비됐어요' : loaded ? '3D 화면을 준비하고 있어요' : '로봇 모델을 불러오고 있어요'}
        gate={
          robotMode || picking || entered
            ? undefined
            : {
                onConnect: () => {
                  setEntered(true);
                  setConnectOpen(true);
                },
                onStart: () => setEntered(true),
                ...(track
                  ? {
                      onRoadmap: () => setRoadmapOpen(true),
                    }
                  : {}),
              }
        }
      />
      {connectOpen && pastIntro && (
        <ConnectDialog
          current={robotMode && robot?.robotId ? { id: robot.robotId, ips: robot.ips ?? [] } : null}
          auto={desktop && !connectTo}
          start={connectTo}
          onUsb={usbOk ? () => (setConnectOpen(false), setUsbOpen(true)) : undefined}
          onSetup={usbOk ? () => (setConnectOpen(false), setSetupOpen(true)) : undefined}
          carry={() => (practice.id === 'demo' ? '' : carryHash({ level, theme, id: practice.id, code }))}
          onClose={() => (setConnectOpen(false), setConnectTo(null))} />
      )}
      {setupOpen && (
        <RobotSetup
          onClose={() => setSetupOpen(false)}
          onConnect={(addr, label) => {
            setSetupOpen(false);
            setConnectTo(addr ? { addr, label } : null);
            setConnectOpen(true);
          }}
        />
      )}
      {usbOpen && (
        <UsbMaker
          onClose={() => setUsbOpen(false)}
          onSetup={() => (setUsbOpen(false), setSetupOpen(true))}
          onConnect={(addr, id) => {
            setUsbOpen(false);
            setConnectTo({ addr, label: id || addr });
            setConnectOpen(true);
          }}
        />
      )}
      {helpOpen && (
        <HelpSheet
          onClose={() => setHelpOpen(false)}
          onGuide={() => {
            chooseView('sim');
            saveStart({ ...start, folded: false });
          }}
        />
      )}
      {showPicker && <ModelPicker current={modelNow} models={offered} onPick={chooseModel} onClose={modelNow ? () => setPicking(false) : undefined} />}
      {prepOpen && (
        <div className={css.picker} role="dialog" aria-modal="true" aria-label="검수 준비 점검" onKeyDown={(e) => e.key === 'Escape' && setPrepOpen(false)} onMouseDown={(e) => e.target === e.currentTarget && setPrepOpen(false)}>
          <div className={`${css.pickerBox} ${css.aiBox}`}>
            <header className={css.pickerHead}>
              <div>
                <h1>검수 준비 점검</h1>
                <p>{robot?.robotId ? `로봇 ${robot.robotId}` : '로봇'} 이 검수 1~7 에 필요한 것을 갖췄는지 확인해요.</p>
              </div>
              <button type="button" className={css.pickerClose} onClick={() => setPrepOpen(false)} aria-label="닫기" autoFocus>
                ×
              </button>
            </header>
            {!prep ? (
              <p className={css.aiStats}>로봇에 물어보는 중…</p>
            ) : (
              <ul className={css.prepList}>
                {prep.items.map((i) => (
                  <li key={i.id} data-ok={i.ok === true ? 'yes' : i.ok === false ? 'no' : 'unknown'}>
                    <span className={css.prepMark}>{i.ok === true ? '✓' : i.ok === false ? '✗' : '?'}</span>
                    <span>
                      <b>{i.name}</b>
                      <small>{i.detail}</small>
                    </span>
                    <em>검수 {i.checks.join('·')}</em>
                  </li>
                ))}
              </ul>
            )}
            <div className={css.prepActions}>
              <button type="button" className={css.ghost} onClick={() => void runPrep()}>
                다시 점검
              </button>
              <button type="button" className={css.ghost} onClick={clearEvidence}>
                검수 기록 새로 시작
              </button>
              <button type="button" className={css.trackGo} onClick={saveReport}>
                검수 결과표 저장
              </button>
            </div>
          </div>
        </div>
      )}
      {aiResult && (
        <div className={css.picker} role="dialog" aria-modal="true" aria-label="AI 샘플 결과" onKeyDown={(e) => e.key === 'Escape' && setAiResult(null)} onMouseDown={(e) => e.target === e.currentTarget && setAiResult(null)}>
          <div className={`${css.pickerBox} ${css.aiBox}`}>
            <header className={css.pickerHead}>
              <div>
                <h1>AI 샘플 결과 (로봇 안에서 실행)</h1>
                <p>{aiResult.engine}</p>
              </div>
              <button type="button" className={css.pickerClose} onClick={() => setAiResult(null)} aria-label="닫기" autoFocus>
                ×
              </button>
            </header>
            {/* eslint-disable-next-line @next/next/no-img-element -- a frame the robot just marked, as a data URL */}
            {aiResult.image && <img className={css.aiImage} src={aiResult.image} alt="로봇 카메라 영상에 AI 가 찾은 물체를 표시한 그림" />}
            <p className={css.aiStats}>
              <b>{aiResult.ms}ms</b> 처리{aiResult.loadMs ? ` · 모델 읽기 ${aiResult.loadMs}ms (처음 한 번)` : ''} · 찾은 물체 {aiResult.detections.length}개
            </p>
            <ul className={css.aiList}>
              {aiResult.detections.length === 0 ? (
                <li>찾은 물체가 없어요. 컵·병·휴대폰·사람처럼 흔한 물체를 카메라 앞에 두고 다시 해 보세요.</li>
              ) : (
                aiResult.detections.map((d, k) => (
                  <li key={k}>
                    <b>{d.label}</b> <small>{d.name}</small> <i>{Math.round(d.score * 100)}%</i>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
      <TouchTips />
      <div className={css.inner}>
        <TopBar
          view={view}
          track={track ? { name: track.name, grade: track.grade, color: track.color, screens: track.screens } : undefined}
          onView={(v) => {
            chooseView(v);
          }}
          busy={busy}
          robotStop={robotMode && !!robot?.connected}
          onStop={stop}
          onHelp={() => setHelpOpen(true)}
          context={
            // A coding task belongs to the coding tabs (and the library): 수동 제어 shows none.
            // 입문: a place's step card (top left) already says where you are.
            ((view === 'sim' && tab !== 'direct') || view === 'library') && !(track && cellAt) ? (
              <TaskChip
                mode={mode}
                practice={practice}
                level={level}
                theme={theme}
                progress={progress}
                busy={busy}
                world={world}
                session={session}
                demo={!!demo?.playing}
                process={tab === 'process' ? { name: proc.name || '공정', rows: proc.rows.length } : undefined}
                cell={
                  cellAt
                    ? {
                        name: cellAt.mission ? `${cellAt.mission} ${missionById(cellAt.mission)?.title ?? ''}` : '자유 실습',
                        note: `${CELL_BY_ID[cellAt.cell].letter} ${CELL_BY_ID[cellAt.cell].name} · ${missionsOf(cellAt.cell).filter((m) => cellPassed[m.id]).length}/${missionsOf(cellAt.cell).length} 통과`,
                      }
                    : undefined
                }
                onGoal={() => {
                  // A demo is shown, not done by the student.
                  if (demo) return;
                  mark('sim');
                  note(practice.check, `시뮬레이션 목표 달성: ${practice.title} (${LEVEL_TAB[level].name})`, false);
                  const m = practice.progress(world.current, session.current);
                  // Reached during a run: the card comes when the run ends (with its time and [다시 보기]).
                  if (token.current) goalPending.current = { goal: m.title, done: m.done, total: m.total };
                  else setGoalCard({ goal: m.title, done: m.done, total: m.total });
                }}
                onOpen={openTask}
                onGallery={() => {
                  setLibSection(mode === 'check' ? 'checks' : 'tasks');
                  chooseView('library');
                }}
                onReal={
                  robotMode && robot?.connected
                    ? (check) => {
                        // The real-robot check is 로봇 실습 7's unit (its [실물로] measures and records it).
                        openPractice7(check as UnitId);
                        chooseView('learn');
                      }
                    : undefined
                }
              />
            ) : null
          }
          settings={(close) => (
            <>
              {choice && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setPicking(true);
                    close();
                  }}
                >
                  <b>
                    <Icon name="robot" size={15} /> 로봇 모델 바꾸기
                  </b>
                  <small>지금: {modelById(modelNow)?.short ?? '고르지 않음'}</small>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setConnectOpen(true);
                  close();
                }}
              >
                <b>
                  <Icon name="wifi" size={15} /> 로봇 연결 · 로봇 Wi-Fi
                </b>
                <small>같은 Wi-Fi 의 로봇 찾기 · 로봇의 Wi-Fi 바꾸기</small>
              </button>
              {usbOk && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSetupOpen(true);
                    close();
                  }}
                >
                  <b>
                    <Icon name="install" size={15} /> 새 로봇 설치
                  </b>
                  <small>처음 한 번: 랜선 하나로 이어 로봇에 설치하고 Wi-Fi 를 맞춰요</small>
                </button>
              )}
              {usbOk && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUsbOpen(true);
                    close();
                  }}
                >
                  <b>
                    <Icon name="usb" size={15} /> 로봇 USB 만들기
                  </b>
                  <small>Wi-Fi 를 적어 USB 를 만들고, 로봇에 꽂았던 결과를 봐요</small>
                </button>
              )}
              {!track && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  chooseMode(mode === 'check' ? 'learn' : 'check');
                  // Straight to the simulator on check 1: the chips 1~7 above lead the demonstration.
                  if (mode !== 'check') chooseView('sim');
                  close();
                }}
              >
                <b>
                  <Icon name="check" size={15} /> {mode === 'check' ? '검수 시연 끝내기' : '검수 시연 (교사용)'}
                </b>
                <small>{mode === 'check' ? '학생 실습 화면으로 돌아가요' : '납품 검수 7종 · 검수 서류'}</small>
              </button>
              )}
              {!robotMode && !MODEL_CHOICE && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    const on = !extraArms;
                    setExtraArms(on);
                    setExtraArmsState(on);
                    // Off: back to the course robot; on: straight to the choice.
                    if (on) setPicking(true);
                    else if (modelNow !== DEFAULT_MODEL) chooseModel(DEFAULT_MODEL);
                    close();
                  }}
                >
                  <b>
                    <Icon name="robot" size={15} /> {extraArms ? '다른 로봇팔 끄기' : '다른 로봇팔 쓰기 (OMX-F · MG400)'}
                  </b>
                  <small>{extraArms ? 'myCobot 280 RDK X5 만 다시 보여요' : 'ROBOTIS OMX-F 와 Dobot MG400 을 시뮬레이션으로 열 수 있게 해요 (이 PC 에서만)'}</small>
                </button>
              )}
            </>
          )}
          status={
            <>
            {/* On the simulator the link sits in the 3D view's top-left corner (StageTitle), unless a cell or a window holds that corner. */}
            {!stageTitle && (
            <button
              type="button"
              className={css.connPill}
              data-state={!robotMode ? 'sim' : robot?.connected ? 'real' : 'lost'}
              onClick={() => setConnectOpen(true)}
              title={robotMode ? '다른 로봇으로 바꾸기 · 로봇 Wi-Fi 설정' : '같은 Wi-Fi 의 로봇을 찾아 연결해요'}
            >
              <span className={css.connOrb} aria-hidden="true" />
              <span>
                <b>
                  {!robotMode
                    ? '로봇 연결'
                    : robot?.connected
                      ? `${robot.demo ? '데모 ' : ''}로봇 ${robot.robotId ?? ''} 연결됨`
                      : `로봇 ${robot?.robotId ?? ''} 연결 끊김`}
                </b>
                <small>{!robotMode ? (pcApp.offline ? '지금은 시뮬레이션 · 오프라인 가능' : '지금은 시뮬레이션') : robot?.ips?.[0] ?? '로봇 콘솔'}</small>
              </span>
            </button>
            )}
            </>
          }
        />
        {view === 'library' && (
          <Library
            section={libSection}
            onSection={setLibSection}
            mode={mode}
            level={level}
            theme={theme}
            practiceId={practice.id}
            progress={progress}
            onOpen={(m, w) => {
              if (m !== mode) chooseMode(m);
              openTask(w);
              chooseView('sim');
            }}
            checkActions={
              <span className={css.pageActions}>
                <button type="button" disabled={!robotMode} onClick={() => void runPrep()} title={robotMode ? '카메라 · AI 모델 · 펌프 · 그리퍼 · ROS 2 를 한 번에 확인' : '로봇에 연결하면 할 수 있어요'}>
                  <Icon name="check" size={15} /> 검수 준비 점검
                </button>
                <button type="button" onClick={saveReport} title="검수별 시각 · 실측값을 한 장으로 (열어서 인쇄 → PDF)">
                  <Icon name="download" size={15} /> 검수 결과표 저장
                </button>
                <button type="button" onClick={clearEvidence} title="연습 · 리허설 기록을 지우고 오늘 검수를 처음부터 기록해요">
                  검수 기록 새로 시작
                </button>
              </span>
            }
            showChecks={mode === 'check'}
            models={offered}
            model={modelNow}
            onModel={(id) => {
              chooseModel(id);
              chooseView('sim');
            }}
            scene={theme === 'kit' ? 'kit' : desk.scene}
            kitAvailable={arm.kit}
            cell={cellAt?.cell ?? null}
            onCell={(id) => {
              enterCell(id);
              chooseView('sim');
            }}
            onScene={(id) => {
              if (cellAt) leaveCell();
              deskScene(id);
              chooseView('sim');
            }}
            effector={effector}
            tools={arm.tools}
            onTool={(e) => {
              changeTool(e, cameraFlange);
              chooseView('sim');
            }}
            busy={busy}
          />
        )}
        {view === 'archive' && (
          <Archive
            section={arcSection}
            onSection={setArcSection}
            programs={[
              {
                icon: 'pc',
                title: 'PC 프로그램 (Physical AI Tool)',
                note: '바탕화면에 두고 더블클릭하면 같은 Wi-Fi 의 로봇을 찾아 바로 열어요',
                action: '받기',
                run: () => void downloadLauncher(),
                file: 'Physical AI Tool.html',
                sizeFrom: '/pc/physical-ai-tool.html',
              },
              {
                icon: 'usb',
                title: '로봇 설치 도구 (Windows)',
                note: '로봇 USB 만들기 · 새 로봇 설치. 압축을 풀고 「로봇 설치 도구.exe」 를 더블클릭 (약 100 MB, 로봇 키트 포함)',
                action: '받기',
                // releases/latest always serves the newest release, so this link never needs updating.
                run: () => window.location.assign(INSTALLER_URL),
                file: 'PhysicalAI-RobotTool.zip',
              },
              ...(!robotMode && !desktop && pcApp.install
                ? [{ icon: 'install', title: '이 PC 에 앱으로 설치', note: '인터넷 없이도 시뮬레이션 · 시작 메뉴에서 열기', action: '설치', run: () => void pcApp.install?.() }]
                : []),
            ]}
            checks={mode !== 'check' ? [] : [{ icon: 'doc', title: '검수 결과표', note: '검수 1~7 의 시각 · 실측값 한 장 (열어서 인쇄 → PDF)', action: '저장', run: saveReport, file: '검수결과표.html' }]}
          />
        )}
        {roadmapOpen && (
          <Roadmap
            passed={cellPassed}
            tutorialsDone={tutDone}
            onClose={() => setRoadmapOpen(false)}
            onPick={(pk) => {
              setRoadmapOpen(false);
              setEntered(true);
              if (pk.kind === 'tutorial') {
                // 기초 조작: the plain desk with the arm only (out of the place the track opens in), then the tutorials' list.
                toured.current = true;
                toPlainDesk();
                openSection('theme');
                openTab('direct');
                return;
              }
              toured.current = true;
              enterCell(pk.cell);
              setTouring(pk.cell);
            }}
          />
        )}
        <div ref={shellRef} className={track ? `${css.shell} life-shell` : css.shell} data-dock={dockShown ? 'open' : 'closed'} data-side={side} data-tab={shownTab === 'direct' ? 'direct' : 'code'} data-mini={miniOn ? 'on' : 'off'} data-life={(!!track && !!cellAt) || undefined} data-wide={wideOn || undefined} style={view !== 'sim' ? { display: 'none' } : undefined}>
          <section className={`${css.panel} ${css.stageCol}`} aria-label="시뮬레이션">
            <div className={css.viewport} data-viewport>
              {loadError ? (
                <div className={css.loading}>로봇 모델을 불러오지 못했어요 ({loadError})</div>
              ) : loaded ? (
                <Stage
                  paused={view !== 'sim'}
                  theme={theme}
                  arm={arm}
                  robot={loaded.robot}
                  chain={loaded.rawChain}
                  mountMm={mountMm}
                  ghost={ghostWanted && !replay && ghost && ghost.code === code ? ghost.angles : null}
                  monitor={monitor}
                  miniRect={miniOn && view === 'sim' ? miniPlace : null}
                  desk={{
                    scene: desk.scene,
                    objects: desk.objects,
                    // A demo's desk has no practice mat.
                    mat: !demo && (practiceUsesMat(practice.id) || desk.mat),
                    edit: !busy && theme === 'arm' ? { selected: deskSel, onSelect: setDeskSel, onMove: deskDrag, onDrop: (id, x, y) => deskUpdate(id, { x, y }), onRemove: deskRemove } : undefined,
                  }}
                  gripperRobot={loaded.gripper}
                  world={world}
                  effector={effector}
                  cameraFlange={cameraFlange}
                  onApi={onStageApi}
                  liveCamera={camView === 'real' ? null : camView}
                  liveCameraScale={camOpen ? 1 : PIP_SCALE}
                  onCameraFrame={onCameraFrame}
                  quality={quality}
                  smoothFollow={robotMode && (!busy || realRun || !!tracking)}
                  tcpMm={tcpNow}
                  ringJoint={ringJoint}
                  planMarks={planMarks}
                  cell={cellAt?.cell ?? null}
                  simRate={runRate}
                  cellClock={cellClock}
                  cellCallouts={!!track}
                  cellTags={cellTags.length ? cellTags : cellAt?.mission && !busy ? cellStepTags(cellAt.cell, missionById(cellAt.mission)?.n ?? 1) : []}
                  display={stageDisplay}
                  frameInsets={frameInsets}
                  layoutKey={`${dockShown}:${side}:${camOpen}:${miniWanted}:${start.folded}:${wideOn}`}
                  onReady={onStageReady}
                  onRenderError={onRenderError}
                  onSlow={onSlow}
                />
              ) : (
                <div className={css.loading}>로봇 모델을 불러오는 중…</div>
              )}
              {loaded && scene3d !== 'ready' && (
                <div className={css.sceneNote} role="status">
                  {scene3d === 'loading'
                    ? '3D 로봇 모델을 불러오는 중…'
                    : '3D 로봇 모델이 아직 안 보여요. 새로고침(F5) 해 보고, 그래도 안 되면 크롬이나 엣지 최신 버전으로 열어 주세요.'}
                </div>
              )}
              {pcOffer && !showPicker && !connectOpen && (
                <div className={css.pcOffer} role="dialog" aria-label="PC 프로그램 받기">
                  <span className={css.pcOfferIcon}>
                    <Icon name="install" size={24} />
                  </span>
                  <div className={css.pcOfferText}>
                    <b>다음부터 주소 없이 열기: PC 프로그램 받기</b>
                    <small>
                      지금 주소 <code>{typeof window !== 'undefined' ? `${window.location.host}/console` : ''}</code>
                      {robot?.robotId ? ` · 로봇 ID ${robot.robotId}` : ''}. &lsquo;Physical AI Tool&rsquo; 파일을 받아 바탕화면에 두고 더블클릭하면 같은 Wi-Fi 의 로봇을 찾아 바로 열어요.
                    </small>
                  </div>
                  <button
                    type="button"
                    className={css.btnAction}
                    onClick={() => {
                      void downloadLauncher();
                      closePcOffer();
                    }}
                  >
                    <Icon name="download" size={15} /> PC 프로그램 받기
                  </button>
                  <button type="button" className={css.ghost} onClick={closePcOffer}>
                    나중에
                  </button>
                </div>
              )}
              {loaded && view === 'sim' && railOpen === 'monitor' && (
                <Hud world={world} chain={loaded.chain} tcpMm={tcpNow} mountMm={mountMm} loadModel={arm.family === 'mycobot280'} status={hudStatus} onClose={() => setRailOpen(null)} simple={!!track} />
              )}
              {loaded && view === 'sim' && touring && cellAt?.cell === touring && <SiteTour
                  key={touring}
                  cell={touring}
                  api={getStage}
                  onDone={() => {
                    setTouring(null);
                    // After the look round: a quest opens on its briefing in the side panel; 자유 연습 on 제어.
                    if (cellRef.current?.mission) openTab(level);
                    else {
                      openSection('jog');
                      openTab('direct');
                    }
                  }}
                />}
              {/* 입문 현장의 공정 띠: the order (or the game) and what the step is about, over the scene. */}
              {loaded && view === 'sim' && track && cellAt?.cell === 'cafe' && <CafeStrip world={world} />}
              {loaded && view === 'sim' && track && cellAt?.cell === 'draw' && <DrawStrip world={world} />}
              {loaded && view === 'sim' && track && cellAt?.cell === 'board' && <BoardStrip world={world} />}
              {loaded && view === 'sim' && moment && (
                <MomentAsk
                  key={moment.key}
                  ask={moment.ask}
                  ox={moment.ox ? '장면 멈춤 · O X' : undefined}
                  onAnswer={(k) => {
                    savePrediction(moment.key, k);
                    setPreds((p) => ({ ...p, [moment.key]: k }));
                    letGo();
                  }}
                  onSkip={() => {
                    setSkipped((x) => ({ ...x, [moment.key]: true }));
                    letGo();
                  }}
                />
              )}
              {loaded && view === 'sim' && asking && cellAt?.mission && (
                <PredictCard
                  mission={cellAt.mission}
                  onAnswer={(k) => {
                    savePrediction(cellAt.mission!, k);
                    setAsking(false);
                    void simulate();
                  }}
                  onSkip={() => {
                    setSkipped((s) => ({ ...s, [cellAt.mission!]: true }));
                    setAsking(false);
                    void simulate();
                  }}
                />
              )}
              {/* 입문 기초 조작: the tutorial is a quest too — its card at the top left, where a place's quest card stands. */}
              {loaded && view === 'sim' && lifeTut && (
                <div className={css.questSlot}>
                  <TutorialStrip
                    id={lifeTut.id}
                    step={lifeTut.step}
                    read={() => tutCtxRef.current()}
                    start={lifeTut.start}
                    n={LIFE_TUTORIALS.findIndex((x) => x.id === lifeTut.id) + 1}
                    of={LIFE_TUTORIALS.length}
                    onNext={() => {
                      const k = LIFE_TUTORIALS.findIndex((x) => x.id === lifeTut.id);
                      if (LIFE_TUTORIALS[k + 1]) startTutorial(LIFE_TUTORIALS[k + 1].id);
                    }}
                    onClose={() => setLifeTut(null)}
                  />
                </div>
              )}
              {loaded && view === 'sim' && cellAt && railOpen !== 'monitor' && (
                <CellHud
                  world={world}
                  cell={cellAt.cell}
                  mission={cellAt.mission}
                  passed={cellPassed}
                  allOpen={false}
                  busy={busy}
                  result={cellResult}
                  onMission={(id) => openCell(cellAt.cell, id)}
                  onRepair={() => {
                    const run = world.current.cell;
                    if (!run) return;
                    repairCell(run);
                    addLog('info', '점검 · 복구했어요. 고친 점을 프로그램에 넣고 다시 실행해 보세요.');
                  }}
                  onAlert={onCellAlert}
                  onReset={() => {
                    resetWorld();
                    setBadge(null);
                  }}
                  guides={!!track}
                  questOut={questOn && !!lifeStep}
                  quest={
                    track && lifeStep && questPhase
                      ? { phase: questPhase, checks: questPhase === 'result' ? lastChecks : null, now: questNow(questPhase, lifeStep.id, cellResult), onList: () => setRoadmapOpen(true) }
                      : track
                        ? { phase: 'do', checks: null, now: '', onList: () => setRoadmapOpen(true) }
                        : undefined
                  }
                />
              )}
              {loaded && view === 'sim' && cellAt && railOpen !== 'monitor' && cellLayout(cellAt.cell).line.camera && <CellCamera world={world} cell={cellAt.cell} />}
              {loaded && view === 'sim' && miniOn && <MiniArmLabels monitor={monitor} live={live} tipOf={tipOf} side="right" />}
              {stageTitle && (
                <StageTitle
                  link={!robotMode ? 'sim' : robot?.connected ? 'real' : 'lost'}
                  robotId={robot?.robotId}
                  ip={robot?.ips?.[0]}
                  demo={robot?.demo}
                  offline={pcApp.offline}
                  arm={arm.name}
                  screen={[SCREEN_EN[workScreen] ?? 'VIEW', SCREEN_TITLE[workScreen] ?? '보기']}
                  onLink={() => setConnectOpen(true)}
                >
                  {/* The full console's first-steps card (공정 · 블록 코딩); 입문 has its own 튜토리얼. */}
                  {!track && <StartGuide
                    done={start.done}
                    folded={start.folded}
                    tip={!miniOn}
                    onFold={(folded) => saveStart({ ...start, folded })}
                    onOpen={(step) => {
                      const id = step === 'move' ? 'jog' : step === 'process' ? 'process' : 'basic';
                      if (dockShown && workScreen === id) return;
                      if (step === 'code') openTab('basic');
                      else openWork(id);
                    }}
                  />}
                </StageTitle>
              )}
              {loaded && view === 'sim' && !railOpen && !cellAt && <HudGauges speed={jogSpeed} monitor={monitor} dock={dockShown ? 'open' : 'closed'} />}
              {loaded && view === 'sim' && !questOn && (
                <LeftRail groups={shownGroups} foot={barFoot} sheetOpen={railOpen !== null} onCloseSheet={() => setRailOpen(null)}>
                  {(railOpen === 'env' || railOpen === 'objects') && (
                    <DeskPanel
                      key={railOpen}
                      docked
                      initialTab={railOpen === 'objects' ? 'objects' : 'scene'}
                      desk={desk}
                      scene={theme === 'kit' ? 'kit' : desk.scene}
                      kitAvailable={arm.kit}
                      demoOk={demoOk}
                      onDemo={(id) => {
                        setRailOpen(null);
                        void playDemo(id);
                      }}
                      busy={busy}
                      matNeeded={practiceUsesMat(practice.id)}
                      payloadG={arm.payloadG}
                      canPick={canPick}
                      selected={deskSel}
                      onSelect={setDeskSel}
                      onScene={(id) => {
                        if (cellAt) leaveCell();
                        deskScene(id);
                      }}
                      cell={cellAt?.cell ?? null}
                      cells={track?.cells}
                      objectsOnly={!!track}
                      onCell={(id) => {
                        setRailOpen(null);
                        enterCell(id);
                      }}
                      onMat={deskMat}
                      onShuffle={shuffle}
                      onPlaceOne={kitPlaceOne}
                      onReset={() => {
                        layout.current = BLOCK_START;
                        resetWorld();
                        setBadge(null);
                      }}
                      onAdd={deskAdd}
                      onUpdate={deskUpdate}
                      onRemove={deskRemove}
                      onClear={deskClear}
                      onClose={() => setRailOpen(null)}
                    />
                  )}
                </LeftRail>
              )}
              <Notices
                entries={log}
                guide={questOn ? null : (guide ?? lifeGuide)}
                quiet={!!(lifeStep && cellAt && cellResult !== null && lastChecks && !busy && view === 'sim')}
                above={
                  bannerOn || (goalCard && view === 'sim') || (!questOn && lifeStep && cellResult !== null && lastChecks && !busy) ? (
                    <>
                      {banners}
                      {!questOn && lifeStep && cellAt && cellResult !== null && lastChecks && !busy && view === 'sim' && (
                        <StepResult
                          cell={cellAt.cell}
                          mission={lifeStep.id}
                          passed={cellResult}
                          checks={lastChecks}
                          chosen={loadPredictions()[lifeStep.id]}
                          onNext={() => {
                            const next = missionsOf(cellAt.cell)[lifeStep.n];
                            if (next) openCell(cellAt.cell, next.id);
                          }}
                          onClose={() => setLastChecks(null)}
                        />
                      )}
                      {goalCard && view === 'sim' && (
                        <ResultCard
                          title={practice.title}
                          goal={goalCard.goal}
                          done={goalCard.done}
                          total={goalCard.total}
                          seconds={replay ? replay.duration : null}
                          onReplay={replay ? () => setReplayPlay((n) => n + 1) : undefined}
                          onNext={nextPractice ? () => openTask({ level, theme, id: nextPractice.id }) : undefined}
                          nextTitle={nextPractice?.title}
                          onClose={closeGoalCard}
                        />
                      )}
                    </>
                  ) : undefined
                }
              />
              {loaded && view === 'sim' && replay && !busy ? (
                <RunTimeline
                  key={replay.duration}
                  replay={replay}
                  autoplay={replayPlay}
                  lineLabel={(line) => recipeOn ? recipeCardOf.current(line) : (tab === 'process' && runText === null ? (procText.split('\n')[line - 1] ?? '') : lineName((runText ?? code).split('\n')[line - 1] ?? ''))}
                  onSeek={(f, line) => {
                    applyFrame(world.current, f, replay.trail);
                    setAnglesView(world.current.angles.slice());
                    setRunningLine(line);
                  }}
                  onClose={() => {
                    applyFrame(world.current, replay.frames[replay.frames.length - 1], replay.trail);
                    setAnglesView(world.current.angles.slice());
                    setRunningLine(-1);
                    setReplay(null);
                  }}
                />
              ) : loaded && view === 'sim' && demo ? (
                <DemoCaption demo={demoFor(demo.scene, arm)} step={demo.step} playing={demo.playing} onBlocks={demoToBlocks} onStop={stopDemo} />
              ) : null}
              <ViewTools
                api={getStage}
                display={display}
                onDisplay={chooseDisplay}
                onSnapshot={(ok) => addLog(ok ? 'ok' : 'err', ok ? '3D 화면을 그림 파일(PNG)로 저장했어요. 다운로드 폴더를 보세요.' : '3D 화면을 저장하지 못했어요.')}
              />
              {!camOpen && camView !== 'real' && (theme === 'kit' || cameraFlange) && (
                <CameraPip ref={pip} camera={camView} onOpen={() => setCamOpen(true)} />
              )}
              <div className={css.camOverlay} hidden={!camOpen} data-panel="camera">
                <button type="button" className={css.camClose} aria-label="카메라 닫기" title="카메라 창 접기" onClick={() => setCamOpen(false)}>
                  ×
                </button>
                <CameraViews
                  ref={cams}
                  view={camView}
                  onView={setCamView}
                  topAvailable={theme === 'kit'}
                  handAvailable={cameraFlange}
                  realAvailable={robotMode && !!robot?.camera}
                  realCams={realCams}
                  realCam={Math.min(realCam, Math.max(0, realCams - 1))}
                  onRealCam={setRealCam}
                  realRole={roleOf(Math.min(realCam, Math.max(0, realCams - 1)))}
                  onRealRole={chooseRole}
                  onImportHand={importHand}
                  onPhoto={(c) => {
                    session.current.cameras.add(c);
                    note(3, `${camView === 'real' ? '실제 ' : '시뮬레이션 '}${c === 'top' ? '키트 카메라' : '손 카메라'} 사진 저장 (RGB)`, camView === 'real');
                    addLog('ok', `${camView === 'real' ? '실제 ' : ''}${c === 'top' ? '키트 카메라' : '손 카메라'} 사진을 저장했어요.`);
                  }}
                  onImport={importBlocks}
                  track={
                    trackReady
                      ? {
                          color: trackColor,
                          onColor: setTrackColor,
                          note: tracking?.note ?? null,
                          disabled: busy || !loaded,
                          onStart: () => void startTracking(trackColor),
                          onStop: stopTracking,
                          onPose: () => void goJoints(HAND_PHOTO_DEG.slice(), '카메라 자세'),
                        }
                      : undefined
                  }
                />
              </div>
            </div>
          </section>

          <aside className={`${css.panel} ${css.dock} ${css.side}`} aria-label="작업 패널" data-open={dockShown} data-tab={shownTab}>
            {dockShown ? (
              <>
                <div className={css.sideHeader}>
                  <button type="button" className={css.sideModel} onClick={() => setPicking(true)} disabled={busy || !choice} title={choice ? '로봇 모델 바꾸기' : undefined}>
                    <span>
                      <b>{SCREEN_TITLE[workScreen] ?? ''}</b>
                    </span>
                    {choice && <em>바꾸기</em>}
                  </button>
                  <StatusLights lights={lights}>
                    <RobotStatus
                      robotMode={robotMode}
                      live={live}
                      lights={lights}
                      reason={errorReason}
                      busy={busy}
                      onWiggle={wiggleReal}
                      onServos={() => void toggleServos()}
                      onZero={() => {
                        setZeroMode(true);
                        // The 0° pose stands the arm straight up: frame all of it.
                        stageApi.current?.view('tall');
                      }}
                    />
                  </StatusLights>
                  <button type="button" className={css.sideFold} onClick={toggleDock} title="패널 접기 (3D 화면을 넓게)" aria-label="작업 패널 접기">
                    <Icon name="chevron" size={16} />
                  </button>
                </div>
                {shownTab === 'direct' ? (
                  <div className={css.dockScroll} role="region" aria-label={SCREEN_TITLE[workScreen]}>
                    {zeroMode ? (
                      <div className={css.screen}>{zeroPanel}</div>
                    ) : workScreen === 'theme' ? (
                      <div className={css.screen}>
                        <ThemePanel cell={cellAt?.cell ?? null} passed={cellPassed} tutorial={lifeTut?.id ?? null} tutorialsDone={tutDone} busy={busy} onSite={(id) => {
                            enterCell(id);
                            setTouring(id);
                          }} onTutorial={startTutorial} />
                      </div>
                    ) : workScreen === 'parts' ? (
                      <div className={css.screen}>
                        <PartsPanel effector={effector} cameraFlange={cameraFlange} busy={busy} onTool={changeTool} mount={mount} onMount={chooseMount} tools={arm.tools} flangeAvailable={arm.cameraFlange} mountAvailable={arm.family !== 'omx' && arm.family !== 'mg400'} />
                      </div>
                    ) : workScreen === 'pose' ? (
                      <div className={css.screen}>{recordRow}</div>
                    ) : workScreen === 'hand' ? (
                      <div className={css.screen}>
                        <HandPanel
                          state={handState}
                          demo={handState === 'record' ? { seconds: handRecS, points: 0 } : handDemo?.points.length ? { seconds: handDemo.seconds, points: handDemo.points.length } : null}
                          closed={handGrip ? handClosed : null}
                          warn={handWarn}
                          busy={busy}
                          robotMode={robotMode}
                          onPose={onHandPose}
                          onFollow={(on) => (on ? void followHand() : stop())}
                          onRecord={recordHand}
                          onReplay={() => void replayHand()}
                          onToProcess={demoToProcess}
                          onTools={() => openWork('parts')}
                        />
                      </div>
                    ) : (
                      <div className={css.screen}>
                        {controlPanel}
                        {toolRow}
                      </div>
                    )}
                    {!zeroMode && workScreen !== 'theme' && (
                      // Always in reach, whatever section is open: back to the ready pose, straight up, stop.
                      <div className={css.poseDock}>
                        <button type="button" disabled={busy} onClick={() => goPose('home')} title="관찰 자세 (공식 AI 키트)">
                          <Icon name="home" size={15} /> 기본 자세
                        </button>
                        <button type="button" disabled={busy} onClick={() => goPose('zero')} title="모든 관절 0° (팔이 위로 곧게)">
                          <Icon name="zero" size={15} /> 일자로 펴기
                        </button>
                        <button type="button" className={css.poseStop} onClick={() => void stop()} title="움직임을 바로 멈춰요 (Esc)">
                          <Icon name="stop" size={14} /> 정지 <kbd>Esc</kbd>
                        </button>
                      </div>
                    )}
                  </div>
                ) : shownTab === 'process' ? (
                  <div className={css.codeTab} role="region" aria-label="공정 짜기">
                    <ProcessFlow
                      flow={flow}
                      onFlow={setFlow}
                      built={built}
                      process={proc}
                      live={live}
                      robotMode={robotMode}
                      busy={busy}
                      pose={basePose}
                      tipOf={tipOf}
                      armHome={arm.home}
                      armZero={arm.zero}
                      poses={poses}
                      calibrated={calibratedText(robot?.calibrated)}
                      toolKind={EFFECTOR_BY_ID[effector].kind}
                      toolName={EFFECTOR_BY_ID[effector].name}
                      onStart={startPractice}
                      onGoJoints={(j, what) => void goJoints(j, what)}
                      onGoTip={goTip}
                      onZero={() => {
                        setZeroMode(true);
                        stageApi.current?.view('tall');
                      }}
                      onResetDesk={placePracticeBlocks}
                      runningLine={runningLine}
                      lastRun={lastRun}
                      onSaveFile={saveProcessFile}
                      onOpenFile={() => procFile.current?.click()}
                      onTools={() => openWork('parts')}
                      jointTry={jointTry?.key === planKey ? jointTry.bowMm : null}
                      onTryJoint={robotMode ? undefined : () => void tryJointDraw()}
                      onRun={() => void simulateProcess()}
                      runBar={runBar}
                      editor={
                        <ProcessPanel
                          process={proc}
                          onProcess={changeProcess}
                          pose={basePose}
                          tipOf={tipOf}
                          busy={busy}
                          canGrip={canGrip}
                          runningLine={runningLine}
                          errorLines={errorLines}
                          onGo={(j, what) => void goJoints(j, what)}
                          onRunRow={(i) => void runProcessRow(i)}
                          onNote={(kind, msg) => addLog(kind, msg)}
                          runBar={null}
                        />
                      }
                    />
                    <input
                      ref={procFile}
                      type="file"
                      accept={`${PROCESS_EXT},application/json`}
                      hidden
                      onChange={(e) => {
                        void openProcessFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </div>
                ) : (
                  <div className={css.codeTab} role="region" aria-label={recipeOn ? '작업 순서' : LEVEL_TAB[level].name}>
                    {!recipeOn && <LangSeg
                      level={cellAt ? (cellTerm ? 'python' : 'basic') : level}
                      levels={track?.levels}
                      busy={busy}
                      onLevel={(lv) => (cellAt ? (lv === 'ros' ? addLog('info', '실습 셀의 ROS 2 터미널 실습은 다음 차례에 열려요.') : setCellTerm(lv === 'python')) : openTab(lv))}
                      extra={(cellAt && cellTerm) || (!cellAt && level === 'python') ? <ModeSeg mode={cellAt ? pyMode.cell : pyMode.arm} busy={busy} onMode={(m) => setPyMode(cellAt ? 'cell' : 'arm', m)} /> : undefined}
                    />}
                    {cellAt && questOn ? null : cellAt ? (
                      <div className={css.cellCodeHead} data-life={recipeOn || undefined}>
                        <b>
                          {recipeOn
                            ? `${CELL_BY_ID[cellAt.cell].name} · ${cellAt.mission ? `${missionById(cellAt.mission)?.n ?? ''}단계 ${missionById(cellAt.mission)?.title ?? ''}` : '자유 실습'}`
                            : `실습 셀 · ${cellAt.mission ? `${cellAt.mission} ${missionById(cellAt.mission)?.title ?? ''}` : '자유 실습'}`}
                        </b>
                        <small>
                          {recipeOn ? '카드 순서대로 로봇과 장비가 움직여요. 코드는 쓰지 않아요.' : cellTermOn ? '터미널에서 명령으로 파이썬 파일을 실행해요.' : cellTerm ? '블록 프로그램을 파이썬 코드로 고쳐요. 블록과 같은 프로그램이에요.' : '블록으로 로봇과 장비를 움직여요.'}
                          {recipeOn ? '' : ' 목표와 채점은 3D 왼쪽 카드에 있어요.'}
                        </small>
                        <button type="button" className={css.cellLeave} disabled={busy} onClick={leaveCell}>
                          {recipeOn ? '현장에서 나가기' : '셀에서 나가기'}
                        </button>
                      </div>
                    ) : (
                    <TutorialCard
                      practice={practice}
                      sub={`${LEVEL_TAB[level].sub} · ${mode === 'check' && practice.check ? `검수 ${practice.check}` : categoryOf(practice.id)}`}
                      tut={tut}
                      step={tutStep}
                      onStep={setTutStep}
                      busy={busy}
                      action={practiceAction}
                      need={toolAsk}
                      noSteps={armTermOn}
                      onLibrary={() => {
                        setLibSection('tasks');
                        chooseView('library');
                      }}
                      onMine={
                        practice.check && mine && mine !== code
                          ? () => {
                              setCode(mine);
                              setErrorLines([]);
                              setPassed(null);
                              addLog('info', `검수 ${practice.check} 에서 전에 고친 프로그램을 불러왔어요. 예제로 돌아가려면 [처음 예제로]를 눌러요.`);
                            }
                          : undefined
                      }
                      onReload={() => {
                        if (code === starterFor(practice, effector, theme) || window.confirm('지금 프로그램 대신 이 실습의 예제 프로그램을 다시 불러올까요?')) {
                          setCode(starterFor(practice, effector, theme));
                          setErrorLines([]);
                          setPassed(null);
                          setTutStep(0);
                        }
                      }}
                    />
                    )}
                    {recipeOn ? (
                      <div className={css.pane} data-scroll={(questOn && !!lifeStep) || undefined}>
                        {/* 퀘스트 모드: the quest card at the top of the side panel (미션 · 지금 할 일), over the cards it points at. */}
                        {questOn && lifeStep && cellAt && questPhase && (
                          <QuestCard
                            inPanel
                            cell={cellAt.cell}
                            mission={cellAt.mission}
                            passed={cellPassed}
                            allOpen={false}
                            busy={busy}
                            onMission={(id) => openCell(cellAt.cell, id)}
                            quest={{ phase: questPhase, checks: questPhase === 'result' ? lastChecks : null, now: questNow(questPhase, lifeStep.id, cellResult), onList: () => setRoadmapOpen(true) }}
                          />
                        )}
                        {questPhase === 'result' && lifeStep && cellAt && lastChecks && cellResult !== null && (
                          <StepResult
                            inPanel
                            cell={cellAt.cell}
                            mission={lifeStep.id}
                            passed={cellResult}
                            checks={lastChecks}
                            chosen={preds[lifeStep.id]}
                            onNext={() => {
                              const next = missionsOf(cellAt.cell)[lifeStep.n];
                              if (next) openCell(cellAt.cell, next.id);
                            }}
                            onClose={() => setLastChecks(null)}
                          />
                        )}
                        {cellAt!.cell === 'draw' ? (
                          <DrawCards key={cellAt!.mission ?? 'free'} mission={cellAt!.mission} busy={busy} runningLine={runningLine} onCode={onRecipeCode} glow={questGlow} glowAdd={questGlowAdd} flow={questOn && !!lifeStep} />
                        ) : cellAt!.cell === 'board' ? (
                          <BoardCards key={cellAt!.mission ?? 'free'} mission={cellAt!.mission} busy={busy} runningLine={runningLine} onCode={onRecipeCode} glow={questGlow} glowAdd={questGlowAdd} flow={questOn && !!lifeStep} />
                        ) : (
                          (() => {
                            // 입문 로봇 카페: 미리보기 · 해 보기 · 나만의 카페 (menus and their motion).
                            const mode = cellAt!.mission ? missionById(cellAt!.mission)?.mode : undefined;
                            if (mode === 'watch') return <WatchPane key={cellAt!.mission} mission={cellAt!.mission!} answered={(k) => preds[k] !== undefined || !!skipped[k]} onCode={onRecipeCode} />;
                            if (mode === 'hand') return <HandPane key={cellAt!.mission} mission={cellAt!.mission!} world={world} busy={busy} jog={controlPanel} onCode={onRecipeCode} />;
                            return <CafeMaker key={cellAt!.mission ?? 'free'} mission={cellAt!.mission} busy={busy} runningLine={runningLine} onCode={onRecipeCode} world={world} focus={cellAt!.mission === 'F5' ? 'door' : cellAt!.mission === 'F7' ? 'menu2' : null} />;
                          })()
                        )}
                      </div>
                    ) : cellAt && cellTermOn ? (
                      <div className={css.pane}>
                        <CellTerminal cell={cellAt.cell} mission={cellAt.mission} busy={busy} onPython={runTermPython} onStop={stop} onOpenStep={(m) => openCell(cellAt.cell, m)} />
                      </div>
                    ) : cellAt && cellTerm ? (
                      <div className={css.pane}>
                        <CodeEditor
                          code={code}
                          onCode={(c) => {
                            setCode(c);
                            setErrorLines([]);
                          }}
                          runningLine={runningLine}
                          errorLines={errorLines}
                          fileName="cell_program.py"
                          modified={false}
                          onRun={() => void simulate()}
                          label="실습 셀 파이썬 코드"
                          status={<span>블록과 같은 프로그램</span>}
                        />
                      </div>
                    ) : armTermOn ? (
                      <div className={css.pane}>
                        <PyTerminal
                          code={code}
                          onCode={(c) => {
                            setCode(c);
                            setErrorLines([]);
                          }}
                          busy={busy}
                          title={practice.title}
                          onPython={(path, text, print) => simulatePy({ text, name: path.split('/').pop() ?? path, print })}
                          onStop={stop}
                        />
                      </div>
                    ) : level === 'basic' ? (
                      <div className={css.pane}>
                        <BlockEditor
                          code={code}
                          onCode={(c) => {
                            setCode(c);
                            setErrorLines([]);
                          }}
                          effector={effector}
                          cameraFlange={cameraFlange}
                          theme={theme}
                          poseNames={Object.keys(poses)}
                          live={live}
                          runningLine={runningLine}
                          onError={(m, f) => addLog('err', m, f)}
                          cell={cellAt?.cell ?? null}
                          wide={{ on: blockWide, set: setBlockWide }}
                          hotLines={cellAt ? [] : findSlots(code, tut)
                            .filter((h) => tut.steps[tutStep]?.slots.includes(h.index))
                            .map((h) => h.line)}
                        />
                      </div>
                    ) : !fullEdit ? (
                      <div className={css.pane}>
                        <SlotCode
                          code={code}
                          onCode={(c) => {
                            setCode(c);
                            setErrorLines([]);
                          }}
                          tut={tut}
                          step={tutStep}
                          runningLine={runningLine}
                          errorLines={errorLines}
                          fileName={level === 'ros' ? 'my_node.py' : 'my_robot.py'}
                          full={fullEdit}
                          onFull={setFullEdit}
                        />
                        <PyPanel level={level} status={pyStatus} output={pyOut} ros={pyRos} />
                      </div>
                    ) : (
                      <div className={css.pane}>
                        <FullBar onFull={setFullEdit} />
                        <CodeEditor
                          code={code}
                          onCode={(c) => {
                            setCode(c);
                            setErrorLines([]);
                          }}
                          runningLine={runningLine}
                          errorLines={errorLines}
                          fileName={level === 'ros' ? 'my_node.py' : 'my_robot.py'}
                          modified={code !== starterFor(practice, effector, theme)}
                          onRun={() => void simulate()}
                          label={level === 'ros' ? 'ROS 2 노드 코드' : '파이썬 코드'}
                          status={<span>{robotMode ? '로봇에는 동작 명령만 전송' : '로봇 없이 시뮬레이션'}</span>}
                        />
                        <PyPanel level={level} status={pyStatus} output={pyOut} ros={pyRos} />
                      </div>
                    )}
                    {!cellAt && !armTermOn && (
                      <Snippets
                        tut={tut}
                        code={code}
                        busy={busy}
                        onCode={(c) => {
                          setCode(c);
                          setErrorLines([]);
                        }}
                      />
                    )}
                    {!cellTermOn && !armTermOn && runBar}
                  </div>
                )}
              </>
            ) : (
              <div className={css.sideRail}>
                <button type="button" className={css.dockRail} onClick={toggleDock} title="패널 열기" aria-label="작업 패널 열기">
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            )}
          </aside>
        </div>
        {learnArm && learnSeen && (
          <LearnView robot={learnArm.robot} chain={learnArm.chain} gripperRobot={learnArm.gripper} real={realArm} hidden={view !== 'learn'} />
        )}
      </div>

      {exportText !== null && (
        <ExportDialog
          text={exportText}
          level={level}
          ros={level === 'ros' || practice.id === 'api'}
          onClose={() => setExportText(null)}
          onCopied={(how) => {
            session.current.apiRuns += 1;
            addLog('ok', how === 'copy' ? '로봇용 코드를 복사했어요.' : '로봇용 코드를 파일로 받았어요.');
          }}
        />
      )}
    </div>
  );
}

/* --- small pieces --------------------------------------------------------- */

/** Run `fn` and time it, ms. */
function timed<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const out = fn();
  return [out, performance.now() - t0];
}

/**
 * Official ROS 2 package of this robot (elephantrobotics/mycobot_ros2, humble:
 * mycobot_280/mycobot_280_rdkx5 — launch/mycobot_follow.launch.py and
 * slider_control.launch.py; the nodes open /dev/ttyS1 at 1 000 000 baud).
 */
const ROS2_STEPS = (a: ArmSpec) => `sudo systemctl stop robot-console     # 콘솔 서버 끄기 (시리얼 포트를 비워요)
source /opt/ros/humble/setup.bash
source ~/colcon_ws/install/setup.bash      # mycobot_ros2 를 빌드한 작업공간

# ① 실제 팔 → RViz: 서보를 풀고 손으로 움직이면 화면의 모델이 따라와요
ros2 launch ${a.ros.pkg} ${a.ros.follow}

# ② RViz 슬라이더 → 실제 팔
ros2 launch ${a.ros.pkg} slider_control.launch.py

# 다른 터미널에서 관절 값 보기
ros2 topic echo /joint_states

# 끝나면 콘솔 서버 다시 켜기
sudo systemctl start robot-console`;

/**
 * 고급: the student's node next to the official driver node alone
 * (setup.py entry point slider_control: subscribes /joint_states and sends the
 * angles to the arm). Not the launch file — its joint_state_publisher_gui would
 * publish /joint_states too and fight the student's node.
 */
const ROS2_NODE_STEPS = (a: ArmSpec) => `# 먼저: 콘솔 서버 끄기 (시리얼 포트를 비워요)
sudo systemctl stop robot-console

# 터미널 1: 로봇 드라이버 노드 (/joint_states 를 받아 팔을 움직여요)
source /opt/ros/humble/setup.bash
source ~/colcon_ws/install/setup.bash      # mycobot_ros2 를 빌드한 작업공간
ros2 run ${a.ros.pkg} slider_control

# 터미널 2: 내 노드
source /opt/ros/humble/setup.bash
python3 my_node.py

# 터미널 3: 확인
ros2 node list
ros2 topic echo /joint_states

# 끝나면 콘솔 서버 다시 켜기
sudo systemctl start robot-console`;

function ExportDialog({ text, level, ros, onClose, onCopied }: { text: string; level: Level; ros: boolean; onClose(): void; onCopied(how: 'copy' | 'file'): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const download = useMemo(() => URL.createObjectURL(new Blob([text], { type: 'text/x-python' })), [text]);
  useEffect(() => () => URL.revokeObjectURL(download), [download]);
  const file = level === 'ros' ? 'my_node.py' : 'my_robot.py';
  return (
    <dialog ref={ref} className={css.dialog} onClose={onClose} aria-label="로봇에서 실행">
      <div className={css.dialogInner}>
        <h2>{level === 'ros' ? 'ROS 2 노드를 로봇에서 실행하기' : '파이썬 API(pymycobot)로 로봇에서 실행하기'}</h2>
        <ol>
          <li>
            로봇 OS(RDK X5)에 접속해요. 콘솔 서버가 팔의 시리얼 포트를 쓰고 있어서 먼저 꺼요: <code>sudo systemctl stop robot-console</code>. 끝나면{' '}
            <code>sudo systemctl start robot-console</code> 로 다시 켜요.
          </li>
          <li>
            아래 코드를 복사해 파일로 저장해요 (예: {file}).
            {level === 'python' && ' 시뮬레이션을 통과한 코드 그대로예요.'}
            {level === 'ros' && ' 시뮬레이션을 통과한 노드 그대로예요.'}
          </li>
          {level === 'ros' ? (
            <li>아래 [ROS 2 로 실행하기] 순서대로 드라이버 노드와 내 노드를 켜요. 멈출 때는 각 터미널에서 Ctrl+C.</li>
          ) : (
            <li>
              터미널에서 <code>python3 {file}</code> 를 실행해요. 멈출 때는 Ctrl+C.
            </li>
          )}
        </ol>
        <pre>{text}</pre>
        {ros && level !== 'python' && (
          <>
            <h3>ROS 2 로 실행하기 (공식 패키지 mycobot_280_rdkx5)</h3>
            <p className={css.empty}>로봇 터미널에서 한 줄씩 실행해요. 이때도 콘솔 서버는 꺼 두어요.</p>
            <pre>{level === 'ros' ? ROS2_NODE_STEPS(activeArm()) : ROS2_STEPS(activeArm())}</pre>
          </>
        )}
        <div className={css.dialogActions}>
          <a className={css.ghost} href={download} download={file} onClick={() => onCopied('file')}>
            파일로 받기
          </a>
          <button
            type="button"
            className={css.ghost}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                onCopied('copy');
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? '✓ 복사했어요' : '코드 복사'}
          </button>
          <button type="button" className={`${css.btn} ${css.btnSim}`} onClick={() => ref.current?.close()}>
            닫기
          </button>
        </div>
      </div>
    </dialog>
  );
}
