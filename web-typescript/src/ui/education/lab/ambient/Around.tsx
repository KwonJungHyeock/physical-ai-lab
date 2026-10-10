'use client';

/**
 * What stands and moves round each site's cell (inside LearnStage's robot-frame group: metres, z up;
 * positions in mm): the rest of the line or room, out of the robot's reach and mostly behind the cell.
 * Each site has its look (floor, sky and the floor's height when the cell stands on a bench or a
 * counter) and its surroundings, in its own file under around/; the cell itself is the site's own *Cell.
 */

import type { SiteLook } from './Ground';
import { AI_LOOK } from './around/ai';
import { BIO_LOOK } from './around/bio';
import { FACTORY_LOOK } from './around/factory';
import { FARM_LOOK } from './around/farm';
import { LOGISTICS_LOOK } from './around/logistics';
import { CAFE_COUNTER_MM, CARE_ARM_Z } from './Props';

export { Hall } from './Hall';
export { FactoryAround } from './around/factory';
export { LogisticsAround } from './around/logistics';
export { BioAround } from './around/bio';
export { FarmAround } from './around/farm';
export { CafeAround, CareAround, CareBed } from './around/cafe';
export { AiAround } from './around/ai';
export { ENERGY_LOOK, EnergyAround } from './around/energy';

export type AroundSite = 'factory' | 'logistics' | 'bio' | 'farm' | 'cafe' | 'care' | 'ai';

export const LOOKS: Record<AroundSite, SiteLook> = {
  factory: FACTORY_LOOK,
  logistics: LOGISTICS_LOOK,
  bio: BIO_LOOK,
  farm: FARM_LOOK,
  cafe: { sky: '#e9e0d4', floor: 'wood', groundZ: -CAFE_COUNTER_MM },
  /** 스마트시티 돌봄 (카페 ③): a resident's room; the arm stands on a myAGV and its lift column, so the floor is lower. */
  care: { sky: '#e6ebe4', floor: 'laminate', groundZ: -CARE_ARM_Z },
  ai: AI_LOOK,
};
