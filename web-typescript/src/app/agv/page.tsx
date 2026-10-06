import type { Metadata } from 'next';

import AgvConsole from '@/ui/agv/AgvConsole';

export const metadata: Metadata = {
  title: 'Physical AI 이동 로봇 실습',
  description: 'myAGV 조이스틱·키보드·게임패드 주행, 앞 카메라로 카드·마커 찾기, 라이다, 직진 보정',
};

export default function AgvPage() {
  return <AgvConsole />;
}
