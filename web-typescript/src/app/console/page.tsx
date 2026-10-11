import type { Metadata } from 'next';

import { AccountProvider } from '@/ui/account/AccountProvider';
import Console from '@/ui/simulator/Console';

export const metadata: Metadata = {
  title: 'Physical AI 로봇 학습 프로그램',
  description: 'myCobot 280 RDK X5 블록·파이썬 실습, 엔드이펙터 교체, 카메라 영상 처리',
};

export default function ConsolePage() {
  return (
    <AccountProvider>
      <Console />
    </AccountProvider>
  );
}
