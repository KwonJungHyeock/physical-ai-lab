'use client';

/**
 * /spike/parts?part=pump — one tool or accessory on its own, lit like the simulator, on a clear
 * background: tools/build/part-thumbs.mjs photographs these for the 도구 buttons.
 */

import dynamic from 'next/dynamic';

const PartView = dynamic(() => import('@/ui/simulator/stage/PartView'), { ssr: false });

export default function PartsPage() {
  return <PartView />;
}
