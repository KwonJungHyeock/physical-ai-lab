import type { ComponentType } from 'react';

import type { TopicId } from '@/engine/education/catalog';

import A1Joints from './1-basics/Joints';
import A2Pose from './1-basics/Pose';
import A3Transforms from './2-kinematics/Transforms';
import A4Workspace from './1-basics/Workspace';
import B1Inverse from './2-kinematics/Inverse';
import B2JointLinear from './2-kinematics/JointLinear';
import B3Jacobian from './3-differential/Jacobian';
import C1Carry from './3-differential/Carry';
import C2ViaPoints from './3-differential/ViaPoints';
import C3Sync from './3-differential/Sync';
import Capstone from './8-learning/Capstone';
import D1Gravity from './4-dynamics/Gravity';
import D2Inertia from './4-dynamics/Inertia';
import E1Collision from './6-planning/Collision';
import E2Planning from './6-planning/Planning';
import F1MassFriction from './4-dynamics/MassFriction';
import Feedback from './5-control/Feedback';
import ForceLimit from './5-control/ForceLimit';
import F2PickPlace from './6-planning/PickPlace';
import F3Stack from './6-planning/Stack';
import G1Camera from './7-vision/Camera';
import G2Color from './7-vision/Color';
import G3Servo from './7-vision/Servo';
import G4Demo from './8-learning/Demo';
import G5Calibration from './5-control/Calibration';
import Pid from './5-control/Pid';
import RotationOrder from './1-basics/RotationOrder';
import Tracking from './5-control/Tracking';
import type { TopicProps } from './types';

/** The hands-on panel of each topic (curriculum id N-M), one folder per 학문; gcam · kit · types are shared. */
export const TOPIC_PANELS: Record<TopicId, ComponentType<TopicProps>> = {
  // 1 기초 로봇공학
  '1-1': A1Joints,
  '1-2': A2Pose,
  '1-3': RotationOrder,
  '1-4': A4Workspace,
  // 2 기구학 & 역기구학
  '2-1': A3Transforms,
  '2-2': B1Inverse,
  '2-3': B2JointLinear,
  // 3 미분기구학 · 궤적 생성
  '3-1': B3Jacobian,
  '3-2': C1Carry,
  '3-3': C2ViaPoints,
  '3-4': C3Sync,
  // 4 로봇 동역학
  '4-1': D1Gravity,
  '4-2': D2Inertia,
  '4-3': F1MassFriction,
  // 5 로봇 제어공학
  '5-1': Feedback,
  '5-2': Pid,
  '5-3': Tracking,
  '5-4': ForceLimit,
  '5-5': G5Calibration,
  // 6 동작 계획
  '6-1': E1Collision,
  '6-2': E2Planning,
  '6-3': F2PickPlace,
  '6-4': F3Stack,
  // 7 로봇 비전 · 인식
  '7-1': G1Camera,
  '7-2': G2Color,
  '7-3': G3Servo,
  // 8 로봇 학습
  '8-1': G4Demo,
  '8-2': Capstone,
};
