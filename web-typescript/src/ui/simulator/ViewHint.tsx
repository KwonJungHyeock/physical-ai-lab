'use client';

import { useTouch } from './touch';

/** The line under a 3D view saying how to turn and zoom it: mouse words on a PC, finger words on a tablet. */
export default function ViewHint({ className, pan = false, extra = '' }: { className: string; pan?: boolean; extra?: string }) {
  const touch = useTouch();
  const text = touch
    ? `한 손가락으로 돌려 보기 · 두 손가락으로 확대${pan ? ' · 옮기기' : ''}`
    : `끌어서 돌려 보기 · 휠로 확대${pan ? ' · 오른쪽 끌기로 옮기기' : ''}`;
  return (
    <p className={className}>
      {text}
      {extra}
    </p>
  );
}
