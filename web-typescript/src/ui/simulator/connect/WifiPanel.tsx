'use client';

/**
 * 로봇 Wi-Fi: on a robot's own console, move the robot from its hotspot to
 * the classroom router (once per robot; afterwards it joins by itself at
 * power-on), or back to its hotspot.
 *
 * Switching takes the robot off the network this page reaches it on, so the
 * page watches for the answer to stop and then tells the student to move the
 * PC to the same Wi-Fi and find the robot again. When joining fails the robot
 * returns to its previous connection by itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { connectWifi, fetchWifi, hotspotWifi, scanWifi, type WifiNetwork, type WifiStatus } from '@/engine/simulator/robotLink';

import Icon from '../Icon';
import css from '../console.module.css';

type Phase = { kind: 'idle' } | { kind: 'switching'; ssid: string; hotspot: boolean } | { kind: 'moved'; ssid: string; hotspot: boolean };

function Bars({ signal }: { signal: number }) {
  const n = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return (
    <span className={css.wifiBars} aria-label={`신호 ${signal}%`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= n ? css.wifiBarOn : undefined} />
      ))}
    </span>
  );
}

export default function WifiPanel({ onFind }: { onFind(): void }) {
  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [nets, setNets] = useState<WifiNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const rescan = useCallback(async () => {
    setScanning(true);
    const r = await scanWifi();
    if (!alive.current) return;
    setScanning(false);
    setNets(r.networks);
    // The list is only a help: joining works from the name and password alone. A permission problem
    // would stop the join too, so that one is shown; other scan troubles only leave the list empty.
    if (!r.ok && r.error && /권한/.test(r.error)) setError(r.error);
  }, []);
  useEffect(() => {
    void (async () => {
      const s = await fetchWifi(AbortSignal.timeout(5000));
      if (!alive.current) return;
      setStatus(s);
      if (!s.ok && s.error) setError(s.error);
    })();
    // Scanning takes a few seconds; the list fills in when it is done.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void rescan();
  }, [rescan]);

  // While switching: the robot keeps answering until it leaves (then the page loses it),
  // or answers with the result (joining failed and it came back, or it stayed reachable).
  useEffect(() => {
    if (phase.kind !== 'switching') return;
    let misses = 0;
    const timer = setInterval(async () => {
      const s = await fetchWifi(AbortSignal.timeout(2000));
      if (!alive.current) return;
      if (!s.ok && !s.mode) {
        misses += 1;
        if (misses >= 2) setPhase({ ...phase, kind: 'moved' });
        return;
      }
      misses = 0;
      setStatus(s);
      if (s.last?.state === 'failed') {
        setError(s.last.error || '연결하지 못했어요.');
        setPhase({ kind: 'idle' });
      } else if (s.last?.state === 'ok') {
        setPhase({ kind: 'idle' });
        setError('');
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [phase]);

  const join = async () => {
    const name = ssid.trim();
    if (!name) return;
    setError('');
    const r = await connectWifi(name, password);
    if (!r.ok) {
      setError(r.error || '연결하지 못했어요.');
      return;
    }
    setPhase({ kind: 'switching', ssid: name, hotspot: false });
  };
  const toHotspot = async () => {
    setError('');
    const r = await hotspotWifi();
    if (!r.ok) {
      setError(r.error || '핫스팟을 켜지 못했어요.');
      return;
    }
    setPhase({ kind: 'switching', ssid: '로봇 핫스팟', hotspot: true });
  };

  const pwBad = password.length > 0 && (password.length < 8 || password.length > 63);

  if (phase.kind === 'moved') {
    return (
      <div className={css.wifiMoved} role="status">
        <Icon name="wifi" size={34} />
        <h2>로봇이 {phase.hotspot ? '자기 핫스팟' : `'${phase.ssid}'`} 으로 옮겨 가고 있어요</h2>
        <ol>
          {phase.hotspot ? (
            <li>
              PC 의 Wi-Fi 를 로봇 핫스팟(<b>{status?.ssid && status.mode === 'hotspot' ? status.ssid : 'ElephantRobotics_AP…'}</b>)으로 바꿔요.
            </li>
          ) : (
            <li>
              PC 의 Wi-Fi 도 <b>{phase.ssid}</b> 로 바꿔요.
            </li>
          )}
          <li>
            20초쯤 뒤 [로봇 찾기] 를 눌러요. 새 네트워크에서는 <b>로봇 ID 가 바뀌어요</b> (주소 끝 숫자).
          </li>
          <li>1분이 지나도 안 보이면 연결에 실패한 거예요. 로봇은 원래 연결로 돌아가요 — PC 도 원래 Wi-Fi 로 돌아와 다시 해 봐요.</li>
        </ol>
        <button type="button" className={css.connectGo} onClick={onFind}>
          <Icon name="search" size={18} />
          로봇 찾기로
        </button>
      </div>
    );
  }

  const busy = phase.kind === 'switching';
  return (
    <div className={css.wifi}>
      <div className={css.wifiNow}>
        <span className={css.wifiNowIcon} data-mode={status?.mode ?? 'none'}>
          <Icon name="wifi" size={20} />
        </span>
        <span>
          <small>지금 로봇 연결</small>
          <b>
            {!status
              ? '확인하는 중…'
              : status.mode === 'hotspot'
                ? `로봇 핫스팟 · ${status.ssid ?? ''}`
                : status.mode === 'wifi'
                  ? `Wi-Fi · ${status.ssid ?? ''}`
                  : '연결 안 됨'}
          </b>
          {status?.ips?.[0] && (
            <span>
              주소 {status.ips[0]} · 로봇 ID {status.robotId}
            </span>
          )}
        </span>
        {status?.mode === 'wifi' && (
          <button type="button" className={css.ghost} onClick={() => void toHotspot()} disabled={busy}>
            핫스팟으로 돌아가기
          </button>
        )}
      </div>

      <div className={css.wifiListHead}>
        <span>옮겨 갈 Wi-Fi</span>
        <button type="button" className={css.ghost} onClick={() => void rescan()} disabled={scanning || busy}>
          <Icon name="refresh" size={14} />
          {scanning ? '찾는 중…' : '다시 찾기'}
        </button>
      </div>
      <ul className={css.wifiList} aria-label="주변 Wi-Fi" aria-busy={scanning}>
        {nets.length === 0 && <li className={css.wifiEmpty}>{scanning
              ? '주변 Wi-Fi 를 찾는 중…'
              : status?.mode === 'hotspot'
                ? '핫스팟이 켜져 있는 동안에는 주변 Wi-Fi 가 안 보여요. 괜찮아요 — 아래에 Wi-Fi 이름과 비밀번호만 넣으면 연결돼요.'
                : '보이는 Wi-Fi 가 없어요. 아래에 Wi-Fi 이름과 비밀번호를 직접 넣으면 돼요.'}</li>}
        {nets.map((n) => (
          <li key={n.ssid}>
            <button type="button" className={`${css.wifiNet} ${ssid === n.ssid ? css.wifiNetOn : ''}`} onClick={() => setSsid(n.ssid)} disabled={busy || n.current}>
              <Bars signal={n.signal} />
              <span className={css.wifiName}>{n.ssid}</span>
              {n.current ? <em>지금 연결</em> : n.secure && <Icon name="lock" size={14} />}
            </button>
          </li>
        ))}
      </ul>

      <form
        className={css.wifiForm}
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <label className={css.connectField}>
          <span>Wi-Fi 이름</span>
          <input className={css.wifiInput} value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="EDUINO-LAB" spellCheck={false} autoComplete="off" disabled={busy} />
        </label>
        <label className={css.connectField}>
          <span>비밀번호</span>
          <span className={css.wifiPw}>
            <input
              className={css.wifiInput}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상"
              autoComplete="off"
              disabled={busy}
              aria-invalid={pwBad}
            />
            <button type="button" className={css.ghost} onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>
              {showPw ? '숨기기' : '보기'}
            </button>
          </span>
        </label>
        <button type="submit" className={css.connectGo} disabled={busy || !ssid.trim() || pwBad}>
          {busy ? '옮기는 중…' : '이 Wi-Fi 로 옮기기'}
        </button>
      </form>
      <p className={error ? css.wifiError : css.connectHint} role={error ? 'alert' : undefined}>
        {error ||
          (busy
            ? `로봇이 '${phase.ssid}' 에 연결하는 중이에요. 잠시 뒤 이 화면이 끊기면 정상이에요.`
            : pwBad
              ? 'Wi-Fi 비밀번호는 8~63자예요.'
              : '옮기면 이 화면은 끊겨요. PC 도 같은 Wi-Fi 로 바꾼 뒤 [로봇 찾기] 로 다시 찾아요. 실패하면 로봇은 원래 연결로 돌아와요.')}
      </p>
    </div>
  );
}
