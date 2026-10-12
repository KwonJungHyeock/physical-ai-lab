'use client';

import type { ReactNode } from 'react';

import { useSurround } from './ambient';

/** What stands round a site's work cell (the building, people, other lines): drawn only while 현장 주변 is on. */
export function Surround({ children }: { children: ReactNode }) {
  return useSurround() ? <>{children}</> : null;
}
