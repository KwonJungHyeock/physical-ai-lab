import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { TOPICS, TOPIC_BY_ID, type TopicId } from '@/engine/education/catalog';
import { FIGURES } from '@/ui/education/fig';
import { Figure } from '@/ui/education/fig/Figure';

// One topic figure alone, animated, filling the window — for showing on a classroom
// screen, and for tools/build/figure-gifs.mjs, which records it to public/education/fig/<id>.gif.
export const dynamicParams = false;

export function generateStaticParams() {
  return TOPICS.filter((t) => FIGURES[t.id]).map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: PageProps<'/figures/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const t = TOPIC_BY_ID.get(id as TopicId);
  return { title: t ? `그림 ${t.id} ${t.title}` : '그림' };
}

export default async function FigurePage({ params }: PageProps<'/figures/[id]'>) {
  const { id } = await params;
  const def = FIGURES[id];
  if (!def) notFound();
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff' }}>
      <div id="figure" style={{ width: 'min(100vw, 177.78vh)' }}>
        <Figure def={def} animate />
      </div>
    </main>
  );
}
