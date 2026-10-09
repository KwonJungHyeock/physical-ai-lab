'use client';

/**
 * /spike/world — the world map on its own (every place open, nothing picked; ?pick=<site> picks one);
 * /spike/world?sheet=<pack> — one pack's models on a grid.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import { SITES, type SiteId } from '@/engine/education/park';
import type { SiteView } from '@/ui/education/map/world/WorldScene';
import { PACKS, type PackId } from '@/ui/education/map/world/worldAssets';

const WorldSheet = dynamic(() => import('@/ui/education/map/world/WorldSheet'), { ssr: false });
const WorldScene = dynamic(() => import('@/ui/education/map/world/WorldScene'), { ssr: false });

const VIEWS = Object.fromEntries(
  SITES.map((s) => [s.id, { state: 'open', next: s.id === 'center', tag: s.content === 'lessons' ? '이론' : s.content === 'data' ? '데이터' : '테마', line: s.kind }]),
) as Record<SiteId, SiteView>;

export default function WorldPage() {
  const [sheet, setSheet] = useState<PackId | null | undefined>(undefined);
  const [pick, setPick] = useState<SiteId | null>(null);
  const [fx, setFx] = useState(true);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('sheet');
    const p = q.get('pick');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address after hydration
    setSheet(s && (PACKS as readonly string[]).includes(s) ? (s as PackId) : null);
    if (p && SITES.some((x) => x.id === p)) setPick(p as SiteId);
    setFx(q.get('fx') !== 'none');
  }, []);
  const noop = useCallback(() => {}, []);
  if (sheet === undefined) return null;
  if (sheet) return <WorldSheet pack={sheet} />;
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <WorldScene onReady={noop} views={VIEWS} selected={pick} onSelect={setPick} paused={false} cardPx={0} effects={fx} />
    </div>
  );
}
