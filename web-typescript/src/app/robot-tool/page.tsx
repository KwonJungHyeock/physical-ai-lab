import type { Metadata } from 'next';

import RobotTool from '@/ui/simulator/connect/RobotTool';

export const metadata: Metadata = {
  title: '로봇 설치 도구 · Physical AI',
  description: '로봇 USB 만들기 · 새 로봇 설치 (PC 프로그램)',
};

export default function RobotToolPage() {
  return <RobotTool />;
}
