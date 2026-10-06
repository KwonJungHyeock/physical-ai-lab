/** The topic figures by curriculum id (fig/kit.tsx), one file per 학문. */

import { FIGS1 } from './f1';
import { FIGS2 } from './f2';
import { FIGS3 } from './f3';
import { FIGS4 } from './f4';
import { FIGS6 } from './f6';
import { FIGS5 } from './f5';
import { FIGS7 } from './f7';
import { FIGS8 } from './f8';
import type { FigureDef } from './kit';

export const FIGURES: Readonly<Record<string, FigureDef>> = { ...FIGS1, ...FIGS2, ...FIGS3, ...FIGS4, ...FIGS6, ...FIGS5, ...FIGS7, ...FIGS8 };

export type { FigureDef } from './kit';
