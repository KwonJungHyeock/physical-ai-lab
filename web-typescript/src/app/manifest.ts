import type { MetadataRoute } from 'next';

// A fixed file, also in the robot's static export (npm run build:robot).
export const dynamic = 'force-static';

/**
 * Installable app ("PC에 설치"): Chrome and Edge offer to install the console
 * as a desktop app that opens in its own window and works offline (public/sw.js).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/console',
    name: 'Physical AI 로봇 학습 프로그램',
    short_name: 'Physical AI',
    description: 'ROBODYNE SYSTEMS Physical AI 로봇 학습 프로그램 — myCobot 280 RDK X5 — 블록 코딩, 파이썬(pymycobot), ROS 2. 인터넷 없이도 실행돼요.',
    lang: 'ko',
    start_url: '/console',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
