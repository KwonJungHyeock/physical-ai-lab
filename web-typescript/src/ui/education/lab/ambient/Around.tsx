'use client';

/**
 * What stands and moves round each site's cell (inside LearnStage's robot-frame group: metres, z up;
 * positions in mm): the rest of the line or room, out of the robot's reach and mostly behind the cell.
 * Each site has its look (floor, sky and the floor's height when the cell stands on a bench or a
 * counter) and its surroundings, in its own file under around/; the cell itself is the site's own *Cell.
 * The surroundings are off by default (the arm's work cell alone, as the real application looks);
 * 현장 주변 in the view tools brings them back.
 */

import type { ComponentType } from 'react';

import { useSurround } from './ambient';
import { AI_LOOK, AiAround as Ai } from './around/ai';
import { BIO_LOOK, BioAround as Bio } from './around/bio';
import { CafeAround as Cafe, CareAround as Care } from './around/cafe';
import { EnergyAround as Energy } from './around/energy';
import { FACTORY_LOOK } from './around/factory';
import { FARM_LOOK, FarmAround as Farm } from './around/farm';
import { LOGISTICS_LOOK, LogisticsAround as Logistics } from './around/logistics';
import type { SiteLook } from './Ground';
import { CAFE_COUNTER_MM, CARE_ARM_Z } from './Props';

export { Hall } from './Hall';
export { FactoryAround } from './around/factory';
export { CareBed } from './around/cafe';
export { ENERGY_LOOK } from './around/energy';

/** A site's surroundings, drawn only while 현장 주변 is on (the view tools); the cell itself always is. */
function whenSurround(Around: ComponentType): ComponentType {
  function Shown() {
    return useSurround() ? <Around /> : null;
  }
  Shown.displayName = `Surround(${Around.displayName ?? Around.name})`;
  return Shown;
}

export const LogisticsAround = whenSurround(Logistics);
export const BioAround = whenSurround(Bio);
export const FarmAround = whenSurround(Farm);
export const CafeAround = whenSurround(Cafe);
export const CareAround = whenSurround(Care);
export const AiAround = whenSurround(Ai);
export const EnergyAround = whenSurround(Energy);

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
