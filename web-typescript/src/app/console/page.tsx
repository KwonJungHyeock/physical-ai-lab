import type { Metadata } from 'next';

import Console from '@/ui/simulator/Console';

export const metadata: Metadata = {
  title: 'Physical AI 로봇 학습 프로그램',
  description: '로봇팔 · 이동형 로봇 · 휴머노이드 피지컬 AI 통합 시뮬레이터: 조그 · 공정 · 블록 · 파이썬 · ROS 2 · 손 따라하기, 실제 로봇 연결',
};

export default function ConsolePage() {
  return <Console />;
}
