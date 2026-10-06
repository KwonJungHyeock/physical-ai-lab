import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import MaterialDoc from '@/ui/education/print/MaterialDoc';
import { MATERIAL_BY_ID, MATERIALS } from '@/engine/education/materials';

// Printable pages of the 자료실 (tools/build/materials.mjs turns each into a PDF).
export const dynamicParams = false;

export function generateStaticParams() {
  return MATERIALS.map((m) => ({ doc: m.id }));
}

export async function generateMetadata({ params }: PageProps<'/materials/[doc]'>): Promise<Metadata> {
  const { doc } = await params;
  return { title: MATERIAL_BY_ID.get(doc)?.title ?? '자료실' };
}

export default async function MaterialPage({ params }: PageProps<'/materials/[doc]'>) {
  const { doc } = await params;
  const m = MATERIAL_BY_ID.get(doc);
  if (!m) notFound();
  return <MaterialDoc material={m} />;
}
