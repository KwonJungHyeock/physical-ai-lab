'use client';

/**
 * /spike/world — the world map prototype; /spike/world?sheet=<pack> — one pack's models on a grid.
 */

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { PACKS, type PackId } from '@/ui/education/map/world/worldAssets';

const WorldSheet = dynamic(() => import('@/ui/education/map/world/WorldSheet'), { ssr: false });
const WorldPreview = dynamic(() => import('@/ui/education/map/world/WorldPreview'), { ssr: false });

export default function WorldPage() {
  const [sheet, setSheet] = useState<PackId | null | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('sheet');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address after hydration
    setSheet(q && (PACKS as readonly string[]).includes(q) ? (q as PackId) : null);
  }, []);
  if (sheet === undefined) return null;
  return sheet ? <WorldSheet pack={sheet} /> : <WorldPreview />;
}
