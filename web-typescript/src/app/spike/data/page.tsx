'use client';

/**
 * /spike/data — the 디지털 트윈 관제센터 on its own (temporary, to look at it before it is on the map).
 * The /spike layout is dark; the screen is light, so it sits on the console's light grey here.
 */

import DataCenter from '@/ui/education/data/DataCenter';

export default function DataSpikePage() {
  return (
    <div
      style={{
        background: '#f2f4f7',
        colorScheme: 'light',
        padding: '15px 15px 0',
        minHeight: '100dvh',
      }}
    >
      <DataCenter onBack={() => history.back()} onOpenLab={(lab) => console.log('open lab', lab)} />
    </div>
  );
}
