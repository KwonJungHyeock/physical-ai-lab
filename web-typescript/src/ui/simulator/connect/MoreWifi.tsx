'use client';

/**
 * More Wi-Fi networks for wifi.txt (로봇 USB 만들기 · 새 로봇 설치): a teacher who uses two routers writes
 * both once; the robot joins whichever one is there and remembers the others (usb_setup.join_any).
 */

import { MAX_WIFI, type WifiNet } from '@/engine/simulator/usbKit';

import u from './usbMaker.module.css';

interface Props {
  value: WifiNet[];
  onChange(next: WifiNet[]): void;
  disabled?: boolean;
}

export default function MoreWifi({ value, onChange, disabled }: Props) {
  const set = (i: number, k: keyof WifiNet, v: string) => onChange(value.map((n, j) => (j === i ? { ...n, [k]: v } : n)));
  return (
    <div className={u.more}>
      {value.map((n, i) => (
        <div key={i} className={u.moreRow}>
          <span className={u.moreNo}>{i + 2}</span>
          <input value={n.ssid} onChange={(e) => set(i, 'ssid', e.target.value)} placeholder="Wi-Fi 이름" aria-label={`${i + 2}번째 Wi-Fi 이름`} spellCheck={false} autoComplete="off" disabled={disabled} />
          <input type="password" value={n.password} onChange={(e) => set(i, 'password', e.target.value)} placeholder="비밀번호" aria-label={`${i + 2}번째 Wi-Fi 비밀번호`} spellCheck={false} autoComplete="off" disabled={disabled} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={disabled} aria-label={`${i + 2}번째 Wi-Fi 지우기`}>
            ×
          </button>
        </div>
      ))}
      {value.length < MAX_WIFI - 1 && (
        <button type="button" className={u.linkBtn} onClick={() => onChange([...value, { ssid: '', password: '' }])} disabled={disabled}>
          + Wi-Fi 하나 더 (번갈아 쓰는 곳: 로봇이 있는 쪽에 저절로 붙어요)
        </button>
      )}
    </div>
  );
}
