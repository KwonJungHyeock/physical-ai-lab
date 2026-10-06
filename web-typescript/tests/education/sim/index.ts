import { S1 } from './s1';
import { S2 } from './s2';
import { S3 } from './s3';
import { S4 } from './s4';
import { S5 } from './s5';
import { S6 } from './s6';
import { S7 } from './s7';
import { S8 } from './s8';
import type { TopicScenario } from './types';

export type { Action, SimStep, TopicScenario } from './types';

/** Every topic's scenario, in topic order (one file per 학문). */
export const SCENARIOS: TopicScenario[] = [...S1, ...S2, ...S3, ...S4, ...S5, ...S6, ...S7, ...S8];
