import type { Metadata } from 'next';

import Console from '@/ui/simulator/Console';

export const metadata: Metadata = {
  title: '생활 로봇 · Physical AI 로봇 학습 시뮬레이터',
  description: '입문: 로봇 카페 · 그림 로봇으로 순서와 위치를 블록으로 짜 보는 로봇팔 시뮬레이터',
};

export default function TrackLifePage() {
  return <Console track="life" />;
}
