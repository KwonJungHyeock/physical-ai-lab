'use client';

/**
 * 로봇 설치 도구: the small Windows program for the people who set up robots (desktop-go built as the
 * tool, `sh desktop-go/build.sh tool`). Two things only, the two that need this PC's USB and LAN port:
 * 로봇 USB 만들기 and 새 로봇 설치 — the same windows as the simulator's ⚙ menu (UsbMaker, RobotSetup).
 * The simulator itself is the web site. Anywhere but the program (the web site) this page says so.
 */

import { useEffect, useState } from 'react';

import { usbAvailable } from '@/engine/simulator/usbKit';

import Icon from '../Icon';
import css from '../console.module.css';
import RobotSetup from './RobotSetup';
import UsbMaker from './UsbMaker';
import t from './robotTool.module.css';

/** The simulator on the web (Vercel). */
const SIMULATOR_URL = 'https://physical-ai-lab-lake.vercel.app/console';

/** A robot just set up or read from a USB result: its own console in the browser. */
const openRobot = (addr: string) => window.open(`http://${addr}/console`, '_blank');

export default function RobotTool() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [open, setOpen] = useState<'usb' | 'setup' | null>(null);
  useEffect(() => {
    let live = true;
    void usbAvailable().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className={`${css.app} ${t.tool}`}>
      <header className={t.head}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed logo, also in the program's own pages */}
        <img src="/brand/sim-logo-white.svg" alt="ROBODYNE SYSTEMS" width={73} height={36} />
        <div>
          <h1>로봇 설치 도구</h1>
          <p>로봇을 교실 Wi-Fi 에 붙이고, 처음 쓰는 로봇에 프로그램을 설치해요.</p>
        </div>
      </header>

      {ok === false ? (
        <p className={t.note}>이 화면은 PC 에 받은 「로봇 설치 도구」 프로그램에서만 열려요. 웹 사이트의 자료실 › 프로그램에서 받을 수 있어요.</p>
      ) : (
        <div className={t.cards}>
          <button type="button" className={t.card} disabled={!ok} onClick={() => setOpen('usb')}>
            <Icon name="usb" size={34} />
            <b>로봇 USB 만들기</b>
            <span>Wi-Fi 이름 · 비밀번호를 적은 USB 를 만들어 로봇에 꽂아요. 로봇 프로그램도 최신으로 바뀌어요.</span>
          </button>
          <button type="button" className={t.card} disabled={!ok} onClick={() => setOpen('setup')}>
            <Icon name="install" size={34} />
            <b>새 로봇 설치</b>
            <span>처음 쓰는 로봇: PC 랜 포트와 로봇을 랜선 하나로 이으면 설치하고 Wi-Fi 까지 맞춰요.</span>
          </button>
        </div>
      )}

      <footer className={t.foot}>
        시뮬레이터와 수업은 웹에서 열어요:{' '}
        <a href={SIMULATOR_URL} target="_blank" rel="noreferrer">
          {SIMULATOR_URL.replace('https://', '')}
        </a>
      </footer>

      {open === 'usb' && (
        <UsbMaker
          onClose={() => setOpen(null)}
          onSetup={() => setOpen('setup')}
          onConnect={(addr) => {
            setOpen(null);
            openRobot(addr);
          }}
        />
      )}
      {open === 'setup' && (
        <RobotSetup
          onClose={() => setOpen(null)}
          onConnect={(addr) => {
            setOpen(null);
            if (addr) openRobot(addr);
          }}
        />
      )}
    </main>
  );
}
