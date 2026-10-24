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

import { BLOCK_MM, BLOCK_START, HAND_PHOTO_DEG, HOME_DEG, randomBlockLayout, type ColorName, type Theme } from '@/engine/simulator/board';
import { EFFECTOR_BY_ID, flangeRefusal, tcpFor, toolMismatch, toolsUsed, type EffectorId, type FlangeReading } from '@/engine/simulator/effectors';
import { toPymycobot } from '@/engine/simulator/export';
import {
  aiOnRobot,
  calibrateRobot,
  cameraFrameUrl,
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
} from '@/engine/simulator/robotLink';
import { addEvidence, loadEvidence, reportHtml, saveEvidence, setDemoRobot, type PrepItem } from '@/engine/simulator/evidence';
import { categoryOf, loadProgress, markKey, openCheck, saveProgress, type ConsoleMode, type Progress, type Where } from '@/engine/simulator/modules';
import { DEFAULT_MODEL, MODEL_CHOICE, modelById, type RobotModelId } from '@/engine/robot/catalog';
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
import { carryHash, loadLastPractice, loadProgram, readCarried, saveLastPractice, saveProgram } from '@/engine/simulator/programs';
import { isStarter, newSession, placedBlocks, practiceFor, practicesFor, repeatability, starterFor, toolFits, toolNeeded, type Level, type PracticeId, type Session } from '@/engine/simulator/practices';
import { check, parse, type CameraId, type Problem, type Step } from '@/engine/simulator/program';
import { checkProcess, compileProcess, emptyProcess, processFromFile, processListing, processToFile, PROCESS_EXT, type Process } from '@/engine/simulator/process';
import { findSlots, tutorialFor } from '@/engine/simulator/tutorials';
import { blockLayout, buildPlan, carryTargets, freshPlan, makeSolver, practiceOf, type Built, type PlanKind, type Solver, type Spot } from '@/engine/simulator/plan';
import { CELL_BY_ID, cellLayout, type CellId } from '@/engine/simulator/cell/cells';
import { missionById, missionsOf } from '@/engine/simulator/cell/missions';
import { LEVEL_NAME, type CellAlert } from '@/engine/simulator/cell/faults';
import { cellChecks, repairCell } from '@/engine/simulator/cell/run';
import CellCamera from './stage/CellCamera';
import CellHud from './stage/CellHud';
import { RunError, SelfCollision, Stop, createCellWorld, createWorld, emptyStats, instantAnimate, jogTo, moveCheck, moveProblem, playTimeline, preflight, runProcess, runProgram, type RobotAction, type RunHooks, type WorldState } from '@/engine/simulator/sim';
import { demoFits, demoFor, demoStepAt } from '@/engine/simulator/demos';
import { runPython, warmPython } from '@/engine/python/client';
import type { PyOutput, PyResult } from '@/engine/python/types';
import { buildChain, forwardKinematics, forwardKinematicsFrames, liftChain, solveIk, type ChainSegment } from '@/engine/robot/kinematics';
import { jointMax, jointMin } from '@/engine/robot/limits';
import { tcpPositionMm } from '@/engine/robot/motion';
import { STRAIGHT_DOWN, currentOrientation, shiftTool, solveToolPose, turnTool } from '@/engine/robot/tool';
import { parseUrdf, type UrdfRobot } from '@/engine/robot/urdf';
import type { ImageLike } from '@/engine/vision/color';
import { Divergence, findColor, offCentre, probeJacobian, stepTowards, type Seen } from '@/engine/vision/track';

import BlockEditor from './editors/BlockEditor';
import CameraViews, { analyse, type CameraView, type CameraViewsHandle, type Detection } from './stage/CameraViews';
import CodeEditor from './editors/CodeEditor';
import ControlPanel, { type Axis } from './control/ControlPanel';
import LeftRail, { type BarItem, type RailItem } from './stage/LeftRail';
import MiniArmLabels from './stage/MiniArmLabels';
import { createMonitor, type MiniRect } from './stage/MiniArm';
import DeskPanel from './control/DeskPanel';
import DemoCaption from './stage/DemoCaption';
import { ResultCard, RunTimeline, applyFrame, snapshot, type Replay } from './stage/RunReplay';
import Hud, { type HudStatus } from './stage/Hud';
import Intro from './connect/Intro';
import FirstGuide, { resetFirstGuide } from './connect/FirstGuide';
import HelpSheet from './connect/HelpSheet';
import { announceRobotStop } from './connect/robotStop';
import ModelPicker from './connect/ModelPicker';
import ConnectDialog from './connect/ConnectDialog';
import UsbMaker from './connect/UsbMaker';
import PartsPanel from './control/PartsPanel';
import ProcessPanel from './editors/ProcessPanel';
import { FullBar, LangSeg, Snippets, SlotCode, TutorialCard } from './editors/Tutorial';
import ProcessFlow, { activePlan, initialFlow, REF_MARK, type FlowState } from './editors/ProcessFlow';
import PyPanel from './editors/PyPanel';
import RunBar from './tasks/RunBar';
import { usePcApp } from './connect/usePcApp';
import { createLive } from './liveStore';
import { CameraPip, ViewTools, type CameraPipHandle } from './stage/StageTools';
import Notices, { type LogEntry, type LogKind } from './stage/Notices';
import TopBar, { type ConsoleView } from './TopBar';
import LearnView from '../education/LearnView';
import { useAccount } from '../account/AccountProvider';
import AccountChip from '../account/AccountChip';
import ClassDashboard from '../account/ClassDashboard';
import LearnGate from '../account/LearnGate';
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
/** The 공정 짜기 process being made (its project-file text). */
const PROCESS_KEY = 'robot-console-process';
/** 공정 짜기: the step, the practice, the taught places and the rules. */
const FLOW_KEY = 'robot-console-process-flow';
/** The menu bar down the left edge (stage/LeftRail), px (its width follows the window); the 3D view's things start right of it. */
const barW = () => (typeof document === 'undefined' ? 96 : (document.querySelector<HTMLElement>('nav[aria-label="메뉴"]')?.offsetWidth ?? 96));
/** The mini arm's corner, px: from the left menu bar's left edge, and its size. Left of the arm's joints
 *  sit their angle chips (about 80 px): room for them right of the bar. */
const MINI = { bottom: 64, width: 250, height: 300 };
const miniLeft = () => barW() + 24;
const QUALITY_KEY = 'robot-console-quality';
const LEVEL_KEY = 'robot-console-level';
const DISPLAY_KEY = 'robot-console-display';
/** 실습 셀: the steps passed, and the program kept for each step (and for 자유 실습). */
const CELL_PASSED_KEY = 'robot-console-cell-passed';
const CELL_PROG_KEY = 'robot-console-cell-prog';
/** A cell program's start: the import line and the arm to its home pose. */
const CELL_START = 'from edu import robot, cell\n\nrobot.home()\n';
/** Equipment whose name tags show for a ladder step (by its place in the ladder). */
const cellStepTags = (cell: CellId, n: number): string[] => {
  if (cell === 'vision') return n <= 3 ? ['위 카메라', '분류함'] : n <= 6 ? ['위 카메라', '끝 센서', '분류함'] : ['위 카메라', '분류함', '불량 슈트'];
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
/** The simulator opens on the arm alone; the AI kit is one click away (the 실습 환경 dock). */
const START_THEME: Theme = 'arm';
const SECTION_KEY = 'robot-console-section';
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

export default function Console() {
  const pcApp = usePcApp();
  const [loadedArm, setLoaded] = useState<Omit<Loaded, 'rawChain'> | null>(null);
  /** The 교육 tab always teaches on myCobot 280 RDK X5, whichever arm the simulator has open. */
  const [learnArm, setLearnArm] = useState<Omit<Loaded, 'rawChain'> | null>(null);
  /** The robot stands on a base (G base) this many mm above the table; 0 = on the table. */
  /** The G base under the robot: off, or on at its own 32 mm (another height can be set). */
  const [mount, setMount] = useState({ on: false, mm: 32 });
  const mountMm = mount.on ? mount.mm : 0;
  // Every check and solver works in the table's frame: the arm's chain lifted by the base.
  const loaded = useMemo<Loaded | null>(
    () => (loadedArm ? { ...loadedArm, chain: liftChain(loadedArm.chain, mountMm), rawChain: loadedArm.chain } : null),
    [loadedArm, mountMm],
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>('basic');
  const [theme, setTheme] = useState<Theme>(START_THEME);
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
  /**
   * The arm open in the simulator (a real robot is always the myCobot 280 RDK X5 serving the page).
   * Its joint ranges, ready pose and Python class are in force everywhere from this render on.
   */
  const arm = armById(robotMode || !MODEL_CHOICE ? DEFAULT_MODEL : model);
  setActiveArm(arm.id);
  setActiveDesk(desk);
  // 공정 works on the practice mat too (its example picks a block from it).
  setMatNeeded(practiceUsesMat(practice.id) || tab === 'process');
  const [picking, setPicking] = useState(false);
  /** [?] 도움말 open; the first-run guide's mount number (a new one shows the steps again). */
  const [helpOpen, setHelpOpen] = useState(false);
  const [guideRun, setGuideRun] = useState(0);
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
  /** Class accounts (ui/account): in class mode the console opens on 교육, where the login is. */
  const account = useAccount();
  const classOpened = useRef(false);
  useEffect(() => {
    if (!account.classMode || classOpened.current) return;
    classOpened.current = true;
    setView('learn');
    setLearnSeen(true);
  }, [account.classMode]);
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
  // On a robot's console the window title names the robot (several tabs, several robots).
  const robotId = robot?.robotId;
  useEffect(() => {
    if (robotId) document.title = `로봇 ${robotId} · Physical AI 로봇팔 실습`;
  }, [robotId]);
  /** Drawing aids of the 3D view (frames, joint axes, path, grid, reach), kept in this browser. */
  const [display, setDisplay] = useState<DisplayOpts>(DEFAULT_DISPLAY);
  useEffect(() => {
    miniShown.current = display.mini;
  }, [display.mini]);
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
  const runFold = display.autoFold && programRun;
  const dockShown = dockOpen && !runFold;
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
  const cellRef = useRef(cellAt);
  const [cellTags, setCellTags] = useState<string[]>([]);
  /** Steps passed (kept in this browser) and the last finished run of the open step. */
  const [cellPassed, setCellPassed] = useState<Record<string, boolean>>({});
  const [cellResult, setCellResult] = useState<boolean | null>(null);
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

  const addLog = useCallback((kind: LogKind, msg: string, fix?: string) => {
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
      if (localStorage.getItem(MODE_KEY) === 'check') setMode('check');
      const savedPoses = JSON.parse(localStorage.getItem(POSES_KEY) ?? 'null') as Record<string, number[]> | null;
      if (savedPoses && typeof savedPoses === 'object') {
        setPoses(Object.fromEntries(Object.entries(savedPoses).filter(([, q]) => Array.isArray(q) && q.length === 6 && q.every((v) => Number.isFinite(v)))));
      }
      const savedModel = modelById(localStorage.getItem(MODEL_KEY));
      // The mobile robot has its own page; this one opens on an arm.
      if (MODEL_CHOICE && savedModel?.status === 'ready' && savedModel.kind === 'arm') {
        switchArm(savedModel.id);
        setModel(savedModel.id);
      }
      // From the driving console's [로봇팔로 바꾸기]: straight to the model choice.
      if (MODEL_CHOICE && new URLSearchParams(window.location.search).has('pick')) setPicking(true);
      const d = JSON.parse(localStorage.getItem(DISPLAY_KEY) ?? 'null') as Partial<DisplayOpts> | null;
      if (d && typeof d === 'object') setDisplay({ ...DEFAULT_DISPLAY, ...d });
      // The level and practice left last time, with the student's program (kept in this browser), or
      // the program carried here from the PC's console when connecting to this robot.
      const carried = readCarried(window.location.hash);
      if (carried) window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const stored = localStorage.getItem(LEVEL_KEY) as Level | null;
      const savedLevel: Level = carried?.level ?? (stored === 'python' || stored === 'ros' ? stored : 'basic');
      const th: Theme = carried?.theme ?? START_THEME;
      const p = practiceFor(savedLevel, th, carried?.id ?? loadLastPractice(savedLevel) ?? 'joints');
      const program = carried?.code ?? loadProgram(activeArm().id, savedLevel, th, p.id) ?? starterFor(p, 'none', th);
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
    const qc = q.get('cell') as CellId | null;
    if (qc && CELL_BY_ID[qc]) {
      const m = q.get('mission');
      const c = { cell: qc, mission: m && missionById(m)?.cell === qc && CELL_BY_ID[qc].built ? m : null };
      cellRef.current = c;
      setCellAt(c);
      setLevel('basic');
      setTheme('arm');
      setTab('basic');
      setEffector('adaptive');
      world.current = createCellWorld(c.cell, c.mission, 'adaptive');
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
      note(2, `반복 정밀도: 같은 자세 ${rep.count}번, 도착점 퍼짐 최대 ${rep.spreadMm.toFixed(2)}mm, 목표와 평균 차이 ${rep.offsetMm.toFixed(2)}mm (로봇 각도 센서 기준)`, true);
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
        // A few misses in a row (half a second), not one slow answer, count as a lost link.
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
      addLog('err', '손으로 움직이기가 켜져 있어요.', '패널 위 상태 표시등을 눌러 [서보 고정]을 누른 뒤 실행해 주세요.');
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
      addLog('err', '지금 자세에서 기본 자세로 곧장 가면 팔이 책상에 닿아요.', '패널 위 상태 표시등의 [손으로 움직이기]로 팔을 세운 뒤 다시 실행해 주세요.');
      return;
    }
    const start = { type: 'angles' as const, angles: HOME_DEG.slice(), speed: 20, line: 0 };
    await startReal([start, ...actions], '로봇이 움직여요. 먼저 기본 자세로 천천히 간 뒤 프로그램을 시작해요.');
  };

  /** Connection check: turn the wrist (J6) 15° and back, from wherever the arm is now. */
  const wiggleReal = async () => {
    if (!robot?.angles || robot.released) return;
    const here = robot.angles.slice();
    const there = here.slice();
    // The base (J1) turning 10° is plain to see from anywhere; the height of every part stays the same.
    there[0] += here[0] > 0 ? -10 : 10;
    await startReal(
      [
        { type: 'angles', angles: there, speed: 35, line: 0 },
        { type: 'angles', angles: here, speed: 35, line: 0 },
      ],
      `연결 확인: 로봇 전체(1번 관절)가 ${there[0] > here[0] ? '왼쪽' : '오른쪽'}으로 10° 돌았다가 돌아와요.`,
      'check',
    );
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
  const selectPractice = (lv: Level, th: Theme, id: PracticeId, restore?: string) => {
    if (busy) return;
    const p = practiceFor(lv, th, id);
    // The fitted tool stays on: a practice that needs another one asks for it ([끼우기]).
    const flange = cameraFlange;
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
    setCode(restore ?? loadProgram(activeArm().id, lv, th, p.id) ?? starterFor(p, effector, th));
    layout.current = BLOCK_START;
    setMatNeeded(practiceUsesMat(p.id));
    dropCell();
    world.current = createWorld(effector, flange, layout.current, th);
    setDemo(null);
    setReplay(null);
    setAnglesView(world.current.angles.slice());
    setPassed(null);
    setErrorLines([]);
    setBadge(null);
    addLog('info', `${mode === 'check' && p.check ? `[검수 ${p.check}] ` : ''}${p.title}: ${p.goal}`);
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
    const th: Theme = to.kit ? theme : 'arm';
    const e: EffectorId = to.tools.includes(effector) ? effector : 'none';
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
    addLog('info', `${to.name} · ${to.board} 를 열었어요. 관절 범위 · 기본 자세 · 파이썬 클래스(${to.sdk.cls})가 이 로봇팔에 맞춰졌어요.`);
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
    if (next !== effector) addLog('info', next === 'none' ? '도구를 뺐어요. 이제 끝 플랜지만 있어요.' : `${EFFECTOR_BY_ID[next].name}을(를) 달았어요.`);
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
      if (theme !== 'kit') openKeeping(level, 'kit');
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
      const step = (now: number) => {
        if (tk?.aborted) return reject(new Stop());
        t = Math.min(durationS, t + (Math.min(now - last, 250) / 1000) * rate);
        last = now;
        try {
          frame(t);
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
  const execute = async (run: (hooks: RunHooks) => Promise<unknown>, opts: { reset: boolean; label?: boolean; start?: number[]; quiet?: boolean; onLine?: (line: number) => void }) => {
    if (!loaded) return { ok: false, stopped: false, actions: [] as RobotAction[] };
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
              setRunningLine(line);
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
        if (err.line) setErrorLines([err.line]);
      } else {
        addLog('err', `예상하지 못한 오류: ${err instanceof Error ? err.message : String(err)}`);
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
    return { ok, stopped, actions };
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
  const tut = tutorialFor(level, theme, practice.id);
  const tutKey = `${level}:${practice.id}`;
  const tutStep = Math.min(tutSteps[tutKey] ?? 0, tut.steps.length - 1);
  const setTutStep = (k: number) => setTutSteps((m) => ({ ...m, [tutKey]: Math.max(0, Math.min(tut.steps.length - 1, k)) }));
  const passedRun = (text: string, actions: RobotAction[], start?: number[]) => {
    // A passed run of a coding tutorial moves it on to its next step.
    if (tab !== 'process' && tutStep < tut.steps.length - 1) setTutStep(tutStep + 1);
    setBadge(null);
    setPassed({ code: text, actions, start });
    if (placedBlocks(world.current) > 0) session.current.pickTools.add(effector);
    const m = practice.progress(world.current, session.current);
    addLog('ok', m.total && m.done >= m.total ? `실습 목표 달성! (${m.title}) 로봇에서 실행할 수 있어요.` : '시뮬레이션 성공! 로봇에서 실행할 수 있어요.');
    if (practice.id === 'tools' && session.current.pickTools.size === 1) {
      addLog('info', '이제 위의 [도구]에서 다른 도구(흡착 펌프 또는 그리퍼)로 바꿔 한 번 더 해 보세요.');
    }
  };

  /**
   * 중급·고급: run the program in Python (web worker, simulated time), then
   * play its timed commands in 3D with the collision checks. On the robot the
   * program starts from the real arm's pose, as it would there.
   */
  const simulatePy = async () => {
    if (!loaded || busy || level === 'basic') return;
    setProgramRun(true);
    const text = code;
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
      return;
    } finally {
      setPyStatus('');
    }
    setBusy(false);
    setPyOut(r.output);
    setPyRos(r.ros);
    if (r.ros) session.current.lastRos = r.ros;
    if (!r.ok && r.error) {
      const e = r.error;
      addLog('err', `${e.line ? `${e.line}번째 줄: ` : ''}${e.type}: ${e.message}`, e.hint);
      if (e.line) setErrorLines([e.line]);
      setBadge({ kind: 'stop', text: '오류' });
      // Commands issued before the error still play, so the student sees how far it got.
      if (!r.events.length) return;
    }
    // The whole timeline is checked first: a run that would fold the arm into itself does not start.
    const preWorld = createWorld(effector, cameraFlange, layout.current, theme);
    preWorld.angles = start.slice();
    const pre = await preflight((h) => playTimeline(r, h), { chain: loaded.chain, world: preWorld, poses });
    if (pre) return refuseRun(pre);
    const moves = r.events.filter((e) => e.kind === 'move').length;
    addLog('sim', `${r.endT.toFixed(1)}초 동안 명령 ${r.events.length}개 (움직임 ${moves}개). 3D 로 재생하며 충돌을 검사해요.`);
    if (!r.ok) setBadge({ kind: 'sim', text: '오류 전까지 재생' });
    else setBadge({ kind: 'sim', text: '시뮬레이션' });
    const { ok, actions } = await execute(
      async (h) => {
        for (const a of await playTimeline(r, h)) h.record!(a);
      },
      { reset: true, label: true, start },
    );
    if (!r.ok) {
      setBadge({ kind: 'stop', text: '오류' });
      return;
    }
    if (ok) passedRun(text, actions, start);
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
    const placed = targets.filter((t) => world.current.blocks.some((b) => Math.hypot(b.x - t.x, b.y - t.y) < 8 && Math.abs(b.z - (t.z - 1.5)) < 4)).length;
    setLastRun({ ok, seconds: simT, ...(carry ? { placed, total: targets.length } : {}) });
    if (ok) passedRun(text, actions, start);
    else setPassed(null);
    if (ok && flow.step === 3) setFlow({ ...flow, step: 4 });
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
    const fault = cellRef.current && world.current.cell?.health.fault;
    if (fault) return addLog('err', `고장 · ${fault.title}: [점검 · 복구]를 먼저 눌러 주세요.`, fault.fix);
    const text = code;
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
    if (all) {
      addLog('ok', `${res.mission.id} ${res.mission.title} 통과!`);
      setCellPassed((prev) => {
        const next = { ...prev, [res.mission.id]: true };
        try {
          localStorage.setItem(CELL_PASSED_KEY, JSON.stringify(next));
        } catch {
          /* this session only */
        }
        return next;
      });
    } else {
      const miss = res.items.filter((i) => !i.ok).map((i) => i.label);
      addLog('warn', `${res.mission.id} 아직이에요: ${miss.join(' · ') || '프로그램이 끝까지 가지 못했어요'}`);
    }
  };
  /** Open a cell on a ladder step (or 자유 실습): its world, the gripper, the step's program. */
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
    if (k !== 'grip' && k !== 'suction') {
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
    addLog('info', m ? `${m.id} ${m.title}: ${m.goal}` : info.built ? '자유 실습: 채점 없이 셀을 움직여 봐요.' : `${info.letter} ${info.name}: 단계 실습은 준비 중이에요. 왼쪽 조작판으로 장비를 직접 움직여 볼 수 있어요.`);
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
    if (token.current) token.current.aborted = true;
    if (tracker.current) tracker.current.alive = false;
    if (realRunRef.current || robotMode) void stopRobot();
    // 실물 연동 and 로봇 실습 7 end too, so they do not send the arm on.
    announceRobotStop();
  }, [robotMode]);

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
    if (busy) return;
    const back = kept.current[t];
    if (back && back.theme === theme) selectPractice(t, theme, back.id, back.code);
    else openKeeping(t, theme);
    chooseTab(t);
  };
  /** A task from the gallery or a check number: it opens in its language's tab. */
  const openTask = (w: Where) => {
    if (busy) return;
    selectPractice(w.level, w.theme, w.id);
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
    note(7, `로봇용 ${level === 'basic' ? '파이썬 API(pymycobot) 코드' : level === 'ros' ? 'ROS 2 노드' : '파이썬 파일'} 받기`, false);
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
    if (robotMode) {
      const res = await moveRobot(to, Math.max(5, Math.round((40 * jogSpeed) / 100)));
      if (!res.ok && !(jog && res.status === 409)) addLog('err', `로봇: ${res.error}`);
      return;
    }
    await runSteps([{ type: 'move', joints: to, speed: Math.max(8, Math.round((70 * jogSpeed) / 100)), line: 0 }], { reset: false });
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

  /** Tool tip one step along x / y / z, the tool kept the way it points now (down). */
  const tipStep = (axis: Axis, delta: number) => {
    if (!loaded || busy) return;
    const base = basePose();
    setTipBlocked(null);
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
      if (robotMode && !window.confirm(`도구를 아래로 향하게 하느라 관절이 최대 ${Math.round(turn)}° 크게 움직여요.\n계속할까요?`)) return;
      addLog('info', '도구가 아래를 향하도록 자세를 바꿔요.');
    }
    void goJoints(sol.anglesDeg, `${axis.toUpperCase()} ${delta > 0 ? '+' : ''}${delta}mm`, true);
  };
  /** [손 아래로]: the tool pointing straight down again (after RX · RY · RZ), its tip where it is. */
  const toolDown = () => {
    if (!loaded || busy) return;
    const base = basePose();
    const sol = solveToolPose(loaded.chain, tcpPositionMm(loaded.chain, base, tcpNow), base, { tcpMm: tcpNow, orientation: STRAIGHT_DOWN });
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
      const sol = turnTool(loaded.chain, j.cmd, tcpNow, j.axis[1] as 'x' | 'y' | 'z', j.dir * deg * 0.75 * dt);
      if (!sol.converged || sol.anglesDeg.some((a, i) => Math.abs(a - j.cmd[i]) > 6)) return endJog('도구를 이 방향으로 더 돌릴 수 없어요 (손끝 자리를 지킬 수 없거나 자세가 크게 바뀌어요).');
      next = sol.anglesDeg.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
    } else if (j.axis) {
      const sol = shiftTool(loaded.chain, j.cmd, { x: 0, y: 0, z: 0, [j.axis]: j.dir * mm * dt });
      if (!sol.converged || sol.anglesDeg.some((a, i) => Math.abs(a - j.cmd[i]) > 6)) return endJog('도구를 이 방향으로 더 움직일 수 없어요 (닿지 않거나 자세가 크게 바뀌어요).');
      next = sol.anglesDeg.map((a, i) => Math.min(jointMax()[i], Math.max(jointMin()[i], a)));
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
      if (!sol.converged) return endJog('도구를 이 방향으로 더 돌릴 수 없어요.');
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
      if (!sol.converged) return endJog('도구를 이 방향으로 더 움직일 수 없어요 (팔이 닿지 않는 곳이에요).');
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
      const r = await fetch(cameraFrameUrl(Math.max(0, handCam))).catch(() => null);
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
    addLog('ok', `'${name}' 을(를) 저장했어요. [이 자세로] 를 누르면 이 자세로 돌아와요.`);
  };

  const kind = EFFECTOR_BY_ID[effector].kind;
  /** Tool tip as the robot reports it (get_coords): from the robot's base, so a base under the robot is taken off. */
  const tipOf = useCallback(
    (angles: readonly number[]) => {
      if (!loaded) return null;
      const p = tcpPositionMm(loaded.chain, angles, tcpNow);
      const r = forwardKinematics(loaded.chain, angles).rpyDeg;
      return { ...p, z: p.z - mountMm, rx: r.x, ry: r.y, rz: r.z };
    },
    [loaded, tcpNow, mountMm],
  );
  const camAvailable = theme === 'kit' || cameraFlange || (robotMode && !!robot?.camera);

  /** The fitted tool's own buttons (direct control). */
  const toolRow = (
    <div className={css.toolRow}>
      <div className={css.poseRow}>
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
      <button className={css.jogWide} type="button" disabled={busy} onClick={recordPose}>
        <Icon name="save" size={15} /> 지금 자세 저장하기
      </button>
      {poseNames.length > 0 && (
        <ul>
          {poseNames.map((n) => (
            <li key={n}>
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
          : { spots: built.marks, path: built.path }
      : null;
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
      onSim={simulate}
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
      onJointCommit={jointCommit}
      onJointStep={jointStep}
      onTipStep={tipStep}
      blocked={tipBlocked}
      onToolDown={toolDown}
      onHome={() => goPose('home')}
      onJointJog={(i, dir) => startJog({ joint: i, dir })}
      onTipJog={(axis, dir, scale) => startJog({ axis, dir, scale })}
      onJogStop={() => endJog()}
      selected={jogJoint}
      onSelect={setJogJoint}
    />
  );

  /* --- the menu bar: work screens in the side panel, view windows next to the bar ------------ */
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
    if (id === 'jog' || id === 'parts' || id === 'pose') {
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
  const barGroups = [
    { name: '제어', items: [work('jog', '조그', 'move', '조그: 좌표 · 관절로 움직이기', true), work('parts', '도구', 'tool', '도구 · 액세서리', true), work('pose', '자세', 'home', '자세 저장 · 불러오기', true)] },
    {
      name: '작업',
      items: [
        work('process', '공정', 'flag', '공정 짜기: 위치를 가르쳐 옮기기 · 그리기'),
        { ...work('code', '코딩', 'code', '코딩: 블록 · Python · ROS 2 (튜토리얼)'), on: dockShown && (workScreen === 'basic' || workScreen === 'python' || workScreen === 'ros') },
      ],
    },
    {
      name: '보기',
      items: [
        viewItem('env', '환경', 'scene', '실습 환경 · 장면마다 ▶ 데모'),
        ...(theme === 'kit' ? [] : [viewItem('objects', '물건', 'box', '책상에 물건 놓기', desk.objects.length ? String(desk.objects.length) : undefined)]),
        ...(camAvailable ? [viewItem('camera', '카메라', 'camera', '카메라 화면 · 영상 처리')] : []),
        viewItem('monitor', '모니터', 'chart', '관절 · 손끝 · 그래프 · 부하'),
      ],
    },
  ];
  const barFoot: BarItem[] = [{ ...work('zero', '영점', 'zero', robotMode ? '영점 맞추기' : '로봇을 연결하면 영점을 맞춰요'), disabled: !robotMode || (busy && !zeroMode) }];
  const SCREEN_TITLE: Record<string, string> = { jog: '조그', parts: '도구', pose: '자세', zero: '영점', process: '공정', basic: '코딩', python: '코딩', ros: '코딩' };

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
  // With the model choice hidden (MODEL_CHOICE), it is the myCobot 280 RDK X5 everywhere.
  const modelNow = robotMode || !MODEL_CHOICE ? DEFAULT_MODEL : model;
  /** Past the intro's last frame ([연결하기] or 시뮬레이터로 시작); on a robot's own console the intro steps aside by itself. */
  const [entered, setEntered] = useState(false);
  const pastIntro = entered || robotMode || picking;
  const showPicker = splashDone && pastIntro && !connectOpen && (picking || !modelNow);

  const chooseModel = (id: RobotModelId) => {
    if (modelById(id)?.kind === 'agv') {
      router.push('/agv');
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
      const s = await fetchRobotState();
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
    // The demonstration starts on a check: the open practice when it is one, else check 1.
    if (m === 'check' && !practice.check) {
      const w = openCheck(1, level, theme);
      if (w) selectPractice(w.level, w.theme, w.id);
    }
    addLog('info', m === 'check' ? '검수 시연 모드예요. 위의 1~7 번호로 검수 항목을 하나씩 열어 시연해요.' : '실습 모드예요. [라이브러리]의 실습 과제에서 주제별 실습을 골라요.');
  };

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

  return (
    // data-busy: a program or a move is running (read by the behaviour checks).
    <div className={css.app} data-busy={busy || undefined}>
      <Intro
        ready={splashDone}
        progress={loadError || started ? 1 : loaded ? 0.72 : 0.3}
        note={loadError ? '로봇 모델을 불러오지 못했어요' : started ? '준비됐어요' : loaded ? '3D 화면을 준비하고 있어요' : '로봇 모델을 불러오고 있어요'}
        gate={
          robotMode || picking
            ? undefined
            : {
                onConnect: () => {
                  setEntered(true);
                  setConnectOpen(true);
                },
                onStart: () => setEntered(true),
              }
        }
      />
      {connectOpen && pastIntro && (
        <ConnectDialog
          current={robotMode && robot?.robotId ? { id: robot.robotId, ips: robot.ips ?? [] } : null}
          auto={desktop && !connectTo}
          start={connectTo}
          onUsb={usbOk && account.role !== 'student' ? () => (setConnectOpen(false), setUsbOpen(true)) : undefined}
          carry={() => (practice.id === 'demo' ? '' : carryHash({ level, theme, id: practice.id, code }))}
          onClose={() => (setConnectOpen(false), setConnectTo(null))} />
      )}
      {usbOpen && (
        <UsbMaker
          onClose={() => setUsbOpen(false)}
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
            resetFirstGuide();
            chooseView('sim');
            setGuideRun((n) => n + 1);
          }}
        />
      )}
      {showPicker && <ModelPicker current={modelNow} onPick={chooseModel} onClose={modelNow ? () => setPicking(false) : undefined} />}
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
          onView={(v) => {
            account.closeDashboard();
            chooseView(v);
          }}
          busy={busy}
          robotStop={robotMode && !!robot?.connected}
          onStop={stop}
          onHelp={() => setHelpOpen(true)}
          context={
            // A coding task belongs to the coding tabs (and the library): 수동 제어 shows none.
            (view === 'sim' && tab !== 'direct') || view === 'library' ? (
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
              />
            ) : null
          }
          settings={(close) => (
            <>
              {MODEL_CHOICE && (
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
              {usbOk && account.role !== 'student' && (
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
              {account.role !== 'student' && (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  chooseMode(mode === 'check' ? 'learn' : 'check');
                  if (mode !== 'check') {
                    setLibSection('checks');
                    chooseView('library');
                  }
                  close();
                }}
              >
                <b>
                  <Icon name="check" size={15} /> {mode === 'check' ? '검수 시연 끝내기' : '검수 시연 (교사용)'}
                </b>
                <small>{mode === 'check' ? '학생 실습 화면으로 돌아가요' : '납품 검수 7종 · 검수 서류 (학생 화면에는 보이지 않아요)'}</small>
              </button>
              )}
              {!account.session && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    account.openLogin({ reason: 'menu' });
                    close();
                  }}
                >
                  <b>
                    <Icon name="lock" size={15} /> 학급 로그인
                  </b>
                  <small>교실 학급 서버에 선생님 · 학생 계정으로 들어가요</small>
                </button>
              )}
            </>
          )}
          status={
            <>
            <AccountChip />
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
              </span>
            }
            showChecks={mode === 'check'}
            showModels={MODEL_CHOICE}
            model={modelNow}
            onModel={(id) => {
              chooseModel(id);
              chooseView('sim');
            }}
            scene={theme === 'kit' ? 'kit' : desk.scene}
            kitAvailable={arm.kit}
            onScene={(id) => {
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
              ...(!robotMode && !desktop && pcApp.install
                ? [{ icon: 'install', title: '이 PC 에 앱으로 설치', note: '인터넷 없이도 시뮬레이션 · 시작 메뉴에서 열기', action: '설치', run: () => void pcApp.install?.() }]
                : []),
            ]}
            checks={mode !== 'check' ? [] : [{ icon: 'doc', title: '검수 결과표', note: '검수 1~7 의 시각 · 실측값 한 장 (열어서 인쇄 → PDF)', action: '저장', run: saveReport, file: '검수결과표.html' }]}
          />
        )}
        <div ref={shellRef} className={css.shell} data-dock={dockShown ? 'open' : 'closed'} data-side={side} data-tab={shownTab === 'direct' ? 'direct' : 'code'} data-mini={display.mini && !railOpen ? 'on' : 'off'} style={view !== 'sim' ? { display: 'none' } : undefined}>
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
                  miniRect={display.mini && view === 'sim' && !railOpen && !cellAt ? miniPlace : null}
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
                  simRate={simRateRef}
                  cellTags={cellTags.length ? cellTags : cellAt?.mission && !busy ? cellStepTags(cellAt.cell, missionById(cellAt.mission)?.n ?? 1) : []}
                  display={display}
                  frameInsets={frameInsets}
                  layoutKey={`${dockShown}:${side}:${camOpen}:${display.mini}`}
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
              {view === 'sim' && !showPicker && !connectOpen && !pcOffer && <FirstGuide key={guideRun} side={side} />}
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
                    {retry.note && <span>{retry.note}</span>}
                  </div>
                </div>
              )}
              {loaded && view === 'sim' && railOpen === 'monitor' && (
                <Hud world={world} chain={loaded.chain} tcpMm={tcpNow} mountMm={mountMm} loadModel={arm.family === 'mycobot280'} status={hudStatus} onClose={() => setRailOpen(null)} />
              )}
              {loaded && view === 'sim' && cellAt && railOpen !== 'monitor' && (
                <CellHud
                  world={world}
                  cell={cellAt.cell}
                  mission={cellAt.mission}
                  passed={cellPassed}
                  allOpen={account.role === 'teacher' || account.role === 'operator'}
                  busy={busy}
                  result={cellResult}
                  onMission={(id) => openCell(cellAt.cell, id)}
                  onRepair={() => {
                    const run = world.current.cell;
                    if (!run) return;
                    repairCell(run);
                    addLog('info', '점검 · 복구했어요. 고친 점을 프로그램에 넣고 다시 실행해 보세요.');
                  }}
                  onExample={
                    (account.role === 'teacher' || account.role === 'operator') && cellAt.mission
                      ? () => {
                          const sol = missionById(cellAt.mission!)?.solution;
                          if (sol && (code === CELL_START || window.confirm('지금 프로그램 대신 이 단계의 예시 프로그램을 불러올까요?'))) setCode(sol);
                        }
                      : undefined
                  }
                  onAlert={onCellAlert}
                  onReset={() => {
                    resetWorld();
                    setBadge(null);
                  }}
                />
              )}
              {loaded && view === 'sim' && cellAt && railOpen !== 'monitor' && cellLayout(cellAt.cell).line.camera && <CellCamera world={world} cell={cellAt.cell} />}
              {loaded && view === 'sim' && display.mini && !railOpen && !cellAt && <MiniArmLabels monitor={monitor} live={live} tipOf={tipOf} side="right" />}
              {loaded && view === 'sim' && (
                <LeftRail groups={barGroups} foot={barFoot} sheetOpen={railOpen !== null} onCloseSheet={() => setRailOpen(null)}>
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
                      onCell={(id) => {
                        setRailOpen(null);
                        const steps = missionsOf(id);
                        const first = steps.find((m) => !cellPassed[m.id]) ?? steps[0];
                        // A cell whose ladder is still to come opens to look round and run by hand.
                        openCell(id, CELL_BY_ID[id].built ? (first?.id ?? null) : null);
                      }}
                      onMat={deskMat}
                      onShuffle={shuffle}
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
              <Notices entries={log} beside={!!loaded && !!cellAt && railOpen !== 'monitor'} />
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
              {loaded && view === 'sim' && replay && !busy ? (
                <RunTimeline
                  key={replay.duration}
                  replay={replay}
                  autoplay={replayPlay}
                  lineLabel={(line) => (tab === 'process' ? (procText.split('\n')[line - 1] ?? '') : lineName(code.split('\n')[line - 1] ?? ''))}
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
                  <button type="button" className={css.sideModel} onClick={() => setPicking(true)} disabled={busy || !MODEL_CHOICE} title={MODEL_CHOICE ? '로봇 모델 바꾸기' : undefined}>
                    <span>
                      <b>{SCREEN_TITLE[workScreen] ?? ''}</b>
                      <small>
                        {arm.name} · {arm.dof}축
                      </small>
                    </span>
                    {MODEL_CHOICE && <em>바꾸기</em>}
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
                    ) : workScreen === 'parts' ? (
                      <div className={css.screen}>
                        {(kind !== 'none' || cameraFlange) && toolRow}
                        <PartsPanel effector={effector} cameraFlange={cameraFlange} busy={busy} onTool={changeTool} mount={mount} onMount={chooseMount} tools={arm.tools} flangeAvailable={arm.cameraFlange} />
                      </div>
                    ) : workScreen === 'pose' ? (
                      <div className={css.screen}>{recordRow}</div>
                    ) : (
                      <div className={css.screen}>{controlPanel}</div>
                    )}
                    {!zeroMode && (
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
                  <div className={css.codeTab} role="region" aria-label={LEVEL_TAB[level].name}>
                    <LangSeg level={level} busy={busy} onLevel={(lv) => (cellAt && lv !== 'basic' ? addLog('info', '실습 셀은 지금은 블록 코딩으로 해요. Python은 다음에 열려요.') : openTab(lv))} />
                    {cellAt ? (
                      <div className={css.cellCodeHead}>
                        <b>
                          실습 셀 · {cellAt.mission ? `${cellAt.mission} ${missionById(cellAt.mission)?.title ?? ''}` : '자유 실습'}
                        </b>
                        <small>블록으로 로봇과 장비를 움직여요. 목표와 채점은 3D 왼쪽 카드에 있어요.</small>
                        <button type="button" className={css.cellLeave} disabled={busy} onClick={leaveCell}>
                          셀에서 나가기
                        </button>
                      </div>
                    ) : (
                    <TutorialCard
                      practice={practice}
                      sub={`${LEVEL_TAB[level].sub} · ${mode === 'check' && practice.check ? `검수 ${practice.check}` : categoryOf(practice.id)} · 라이브러리 튜토리얼`}
                      tut={tut}
                      step={tutStep}
                      onStep={setTutStep}
                      busy={busy}
                      action={practiceAction}
                      need={toolAsk}
                      onLibrary={() => {
                        setLibSection('tasks');
                        chooseView('library');
                      }}
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
                    {level === 'basic' ? (
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
                    {!cellAt && (
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
                    {runBar}
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
          <LearnGate hidden={view !== 'learn' || account.dashboard}>
            {/* Mounted per learner (a student's own progress on a shared PC: engine/account/profile.ts). */}
            {account.learner && (
              <LearnView key={account.learner} robot={learnArm.robot} chain={learnArm.chain} gripperRobot={learnArm.gripper} real={realArm} hidden={view !== 'learn' || account.dashboard} />
            )}
          </LearnGate>
        )}
        {account.dashboard && <ClassDashboard onClose={account.closeDashboard} />}
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
