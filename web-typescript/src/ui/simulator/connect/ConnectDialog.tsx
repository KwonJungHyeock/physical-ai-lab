'use client';

/**
 * 로봇 연결: each student opens their own robot.
 *
 * Two ways, as a classroom has them: the classroom Wi-Fi (a router), or one LAN cable to the PC.
 * - Wi-Fi: the browser asks every address of the classroom network and
 *   lists the robots that answer; [움직여 확인] makes one straighten so the
 *   student knows which is theirs, [연결] opens its console.
 *   In the desktop simulator (`auto`) the PC's own networks come from the
 *   program and the search starts by itself; each robot shows its 사용자
 *   이름 (set on the USB stick) with its address.
 *   Not found (a network that hides devices from each other): the robot's ID, the last number of its
 *   address (every console shows it), typed in the fold below the list.
 * - 랜선 직결: one cable, the robot at its fixed direct address. A robot not set up yet goes to
 *   새 로봇 설치 (desktop program: it installs a new robot over that cable).
 * - 로봇 Wi-Fi (only on a robot's own console): move the robot to the classroom router.
 *
 * Connecting keeps this program's own screens (교육 · 시뮬레이터, always this version) and sends
 * only the arm's commands to the robot (robotLink setRemoteRobot). A robot with an older server
 * (no `remote` in its state) cannot take that: only its own console, with the screens of the kit
 * it was set up with, could open. That is said first, with the way out (update it from the USB
 * kit), and its old screens open only when asked — never as a silent swap.
 * A radar beside the list shows the search, and the link to the picked robot is drawn and checked
 * step by step (network → robot server → arm signal → console) before it is used.
 */

import { useEffect, useRef, useState } from 'react';

import { remoteRobot, setRemoteRobot } from '@/engine/simulator/robotLink';
import { identifyRobot, networkPrefix, otherWifiHint, pcLan, probeRobot, ROBOT_PORT, sameRobot, scanNetwork, type FoundRobot } from '@/engine/simulator/discover';

import { DIRECT_IP } from '@/engine/simulator/usbKit';

import Icon from '../Icon';
import { skipIntroOnce } from './Intro';
import WifiPanel from './WifiPanel';
import css from '../console.module.css';

const PREFIX_KEY = 'robot-console-net-prefix';
const RECENT_KEY = 'robot-console-recent-robots';
/** The Wi-Fi a robot was last seen on (robots report it): 로봇 찾기 says so when this PC is on another one. */
const ROBOT_WIFI_KEY = 'robot-console-robot-wifi';
const PORT = ROBOT_PORT;

/** "252" → prefix + 252; "192.168.0.252", "robot.local" or "…:8081" are taken as they are. */
export function robotAddress(input: string, prefix: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/^\d{1,3}$/.test(v)) {
    const n = Number(v);
    if (n < 1 || n > 254) return null;
    return `${prefix.replace(/\.?$/, '.')}${n}:${PORT}`;
  }
  if (!/^[A-Za-z0-9.-]+(:\d{2,5})?$/.test(v)) return null;
  return v.includes(':') ? v : `${v}:${PORT}`;
}

type Tab = 'find' | 'direct' | 'wifi';

interface Props {
  /** On a robot's own console: its ID and address, to show and to switch away from. */
  current?: { id: string; ips: string[] } | null;
  /** Desktop simulator: ask the program for this PC's networks and search them at once. */
  auto?: boolean;
  /** The open program, as an address part (`#carry=…`) for the robot's console to put back. */
  carry?: () => string;
  /** Open this robot at once (a USB result's [연결]): its checks, then its console. */
  start?: { addr: string; label: string } | null;
  /** Desktop program: robots not on the Wi-Fi yet → 로봇 USB 만들기. */
  onUsb?: () => void;
  /** Desktop program: a robot never set up → 새 로봇 설치 (over the LAN cable). */
  onSetup?: () => void;
  onClose(): void;
}

export default function ConnectDialog({ current, auto, carry, start, onUsb, onSetup, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('find');
  // On a robot's console its own network is the one to search; elsewhere the last one used.
  const hereNet = current?.ips[0]?.replace(/\d+$/, '');
  const [prefix, setPrefix] = useState(hereNet ?? '192.168.0.');
  const [id, setId] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const p = localStorage.getItem(PREFIX_KEY);
      // Read after the first render so server and client HTML agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!hereNet && p) setPrefix(p);
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
      if (Array.isArray(r)) setRecent(r.filter((x): x is string => typeof x === 'string').slice(0, 6));
    } catch {
      /* storage blocked */
    }
  }, [hereNet]);

  const address = robotAddress(id, prefix);
  /** The search as the radar shows it. */
  const [scan, setScan] = useState<{ scanning: boolean; found: FoundRobot[]; progress: number }>({ scanning: false, found: [], progress: 0 });
  /** Linking to a robot: the checks done so far (0–4), then its console opens; `error` when it did not answer. */
  const [link, setLink] = useState<Link | null>(null);
  const go = (addr: string, label: string, robot?: FoundRobot) => {
    try {
      localStorage.setItem(PREFIX_KEY, prefix);
      localStorage.setItem(RECENT_KEY, JSON.stringify([label, ...recent.filter((x) => x !== label)].slice(0, 6)));
    } catch {
      /* ignore */
    }
    setLink({ label, robot, addr, step: 0 });
  };
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current) return;
    started.current = true;

    setLink({ label: start.label, addr: start.addr, step: 0 });
  }, [start]);
  // The latest program at the moment of leaving (the console redraws while the dialog is open).
  const carryNow = useRef(carry);
  useEffect(() => {
    carryNow.current = carry;
  });
  /** The robot's own console (an older robot, or from a secure page): the open program goes along
   *  (a robot's page is another address with its own store). */
  const openOwn = (addr: string) => {
    const program = (carryNow.current?.() ?? '').replace(/^#/, '');
    window.location.href = `http://${addr}/console${program ? `#${program}` : ''}`;
  };
  // The first step asks the robot itself (its address may be a typed ID, a recent one, or a robot
  // switched off since the search): the console opens only after it answered — never onto a
  // browser error page in the program window, which has no address bar to come back from.
  const asked = useRef<Link | null>(null);
  useEffect(() => {
    if (!link || link.checked || link.error || asked.current === link) return;
    asked.current = link;
    const [host, port] = link.addr.split(':');
    void (async () => {
      let r = await probeRobot(host, 3000, Number(port) || ROBOT_PORT);
      // A dozing Wi-Fi answers the second time.
      if (!r) r = await probeRobot(host, 5000, Number(port) || ROBOT_PORT);
      setLink((l) =>
        l !== link
          ? l
          : r
            ? { ...l, robot: r, checked: true, step: 1 }
            : {
                ...l,
                error: link.addr.startsWith(DIRECT_IP)
                  ? '랜선으로 이은 로봇이 대답하지 않아요. 랜선이 로봇의 LAN 포트에 꽂혔는지, 로봇을 켠 지 1분이 지났는지 확인하고 다시 눌러 주세요.'
                  : `로봇(${link.addr})이 대답하지 않아요. 로봇 전원이 켜져 있는지, PC 와 같은 Wi-Fi 인지, ID 가 맞는지 확인해 주세요.`,
              },
      );
    })();
  }, [link]);
  useEffect(() => {
    if (!link || !link.checked || link.error) return;
    const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (link.step >= LINK_STEPS.length) {
      const t = window.setTimeout(
        () => {
          // A newer robot: stay on this program's screens and drive the arm from here — not from a
          // secure (https) page, which may not call an http robot: there, open the robot's own page.
          if (link.robot?.remote && window.location.protocol === 'https:') {
            openOwn(link.addr);
            return;
          }
          if (link.robot?.remote) {
            setRemoteRobot(link.addr);
            skipIntroOnce();
            window.location.reload();
            return;
          }
          // An older robot, from this program: say so and wait (LinkSteps). On a robot's own
          // console, going to another robot is going to its console anyway.
          if (!current) {
            setLink((l) => (l === link ? { ...l, old: true } : l));
            return;
          }
          openOwn(link.addr);
        },
        quick ? 0 : 450,
      );
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setLink((l) => (l ? { ...l, step: l.step + 1 } : l)), quick ? 0 : 380);
    return () => window.clearTimeout(t);
  }, [link, current]);

  const tabs: { key: Tab; label: string; icon: string }[] = [{ key: 'find', label: 'Wi-Fi (공유기)', icon: 'search' }, { key: 'direct', label: '랜선 직결', icon: 'pc' }, ...(current ? [{ key: 'wifi' as Tab, label: '로봇 Wi-Fi', icon: 'wifi' }] : [])];

  return (
    <div className={css.picker} role="dialog" aria-modal="true" aria-label="로봇 연결" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className={`${css.pickerBox} ${css.connectBox}`}>
        <Radar scanning={scan.scanning} found={scan.found} progress={scan.progress} link={link} net={networkPrefix(prefix)} />
        <div className={css.connectMain}>
          <header className={css.pickerHead}>
            <span className={css.connectIcon}>
              <Icon name={tab === 'wifi' ? 'wifi' : 'link'} size={22} />
            </span>
            <div>
              <h1>{current ? `지금 로봇 ${current.id} 에 연결돼 있어요` : '로봇 연결'}</h1>
              <p>
                {tab === 'wifi'
                  ? '로봇이 붙을 Wi-Fi 를 정해요. 교실 공유기에 한 번 연결해 두면 다음부터 켜기만 하면 돼요.'
                  : current
                    ? '다른 로봇으로 바꾸려면 찾거나 ID 를 넣어요.'
                    : '[Wi-Fi] 는 같은 공유기의 로봇을, [랜선 직결] 은 랜선 하나로 PC 와 이은 로봇을 연결해요. 로봇 없이 연습하려면 [시뮬레이션만].'}
              </p>
            </div>
            <button type="button" className={css.pickerClose} onClick={onClose} aria-label="닫기">
              ×
            </button>
          </header>

          <div className={css.connectTabs} role="tablist" aria-label="연결 방법">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? css.connectTabOn : undefined} onClick={() => setTab(t.key)}>
                <Icon name={t.icon} size={17} />
                {t.label}
              </button>
            ))}
          </div>

          {link && <LinkSteps link={link} onRetry={() => setLink({ label: link.label, robot: link.robot, addr: link.addr, step: 0 })} onBack={() => setLink(null)} onOpenOld={() => openOwn(link.addr)} onUsb={onUsb} />}

          {!link && tab === 'find' && (
            <>
              <FindRobots prefix={prefix} setPrefix={setPrefix} here={current?.ips ?? []} auto={auto} onScan={setScan} onConnect={(r) => go(r.address, r.robotId, r)} onUsb={onUsb} />
              <details className={css.idFold} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && input.current?.focus()}>
                <summary>목록에 없나요? 로봇 ID 로 연결</summary>
                <form
                  className={css.connectForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (address) go(address, id.trim());
                  }}
                >
                  <label className={css.connectField}>
                    <span>로봇 ID (주소의 마지막 숫자)</span>
                    <span className={css.connectAddr}>
                      <input className={css.connectPrefix} value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label="네트워크 앞부분" spellCheck={false} />
                      <input ref={input} className={css.connectId} value={id} onChange={(e) => setId(e.target.value)} placeholder="252" inputMode="numeric" aria-label="로봇 ID" spellCheck={false} />
                    </span>
                  </label>
                  <button type="submit" className={css.connectGo} disabled={!address}>
                    연결
                  </button>
                </form>
                <p className={css.connectHint}>
                  {address ? (
                    <>
                      <b>http://{address}/console</b> 로 열어요.
                    </>
                  ) : (
                    '로봇 ID 는 연결했던 화면 오른쪽 위, USB 결과 파일에 있어요. 공유기가 기기끼리 못 보게 막으면(학교 · 손님용 Wi-Fi) 찾기는 안 되고 ID 로만 돼요.'
                  )}
                </p>
                {recent.length > 0 && (
                  <div className={css.connectRecent}>
                    <span>최근 연결한 로봇</span>
                    <div>
                      {recent.map((r) => (
                        <button key={r} type="button" onClick={() => setId(r)}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </details>
            </>
          )}

          {!link && tab === 'direct' && (
            <>
              <ol className={`${css.connectSteps} ${css.stepCards}`}>
                <li>
                  <b>랜선 하나로 잇기</b> PC 의 랜 포트와 로봇의 LAN 포트를 랜선으로 바로 이어요. 공유기 · 허브는 없어도 돼요.
                </li>
                <li>
                  <b>1분 기다리기</b> 로봇을 켜고 1분쯤 기다려요. PC 가 이 연결의 주소를 스스로 잡아요 (설정할 것 없음).
                </li>
                <li>
                  <b>연결</b> 로봇은 늘 <code>{DIRECT_IP}</code> 에 있어요.
                </li>
              </ol>
              <div className={css.connectForm}>
                <button type="button" className={css.connectGo} onClick={() => go(`${DIRECT_IP}:${PORT}`, '랜선 직결')}>
                  랜선 직결로 연결
                </button>
              </div>
              <p className={css.connectHint}>안 되면: 랜선이 로봇의 LAN 포트에 꽂혔는지, PC 의 랜 포트가 학교망 대신 로봇에 이어졌는지 확인하고 30초 뒤 다시 눌러요. 공유기 · 허브에 함께 꽂았다면 [Wi-Fi (공유기)] 탭에서 찾아요.</p>
              {onSetup && (
                <button type="button" className={`${css.usbHint} ${css.newHint}`} onClick={onSetup}>
                  <Icon name="usb" size={18} />
                  <span>
                    <b>새 로봇이에요 (처음 한 번)</b>
                    <small>새 로봇 설치: 이 랜선 그대로 프로그램이 로봇에 설치하고 Wi-Fi 까지 맞춰요. 모니터 · 키보드는 필요 없어요.</small>
                  </span>
                </button>
              )}
            </>
          )}

          {!link && tab === 'wifi' && current && <WifiPanel onFind={() => setTab('find')} />}

          <div className={css.connectFoot}>
            {remoteRobot() && (
              <button
                type="button"
                className={css.ghost}
                onClick={() => {
                  setRemoteRobot(null);
                  skipIntroOnce();
                  window.location.reload();
                }}
              >
                연결 끊기 (시뮬레이션으로)
              </button>
            )}
            <button type="button" className={css.ghost} onClick={onClose}>
              {current ? '닫기' : '시뮬레이션만 (로봇 없이)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What is checked, in order, before the robot's console opens. */
const LINK_STEPS = ['네트워크', '로봇 서버', '로봇팔 신호', '콘솔 열기'] as const;

interface Link {
  label: string;
  robot?: FoundRobot;
  addr: string;
  step: number;
  /** The robot answered (its state read again just now). */
  checked?: boolean;
  /** It did not answer: why, and what to check. */
  error?: string;
  /** It answered, but its robot program is too old for this program's screens (no `remote`). */
  old?: boolean;
}

/** A picture of the robot's family for the link line. */
function robotPicture(r?: FoundRobot): string {
  const m = `${r?.model ?? ''} ${r?.kind ?? ''}`;
  if (/agv/i.test(m)) return '/brand/intro/myagv.png';
  if (/320/.test(m)) return '/brand/intro/mycobot320-pi.png';
  if (/mech/i.test(m)) return '/brand/intro/mecharm270-pi.png';
  if (/pallet|ultra/i.test(m)) return '/brand/intro/mypalletizer260-pi.png';
  return '/brand/intro/mycobot280-rdkx5.png';
}

/** Where a found robot shows on the radar: its angle from its ID, its distance from how fast it answered. */
function blipAt(r: FoundRobot): { left: string; top: string } {
  let h = 0;
  for (const ch of r.robotId + r.ip) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = ((h % 360) * Math.PI) / 180;
  const d = 0.3 + Math.min(1, r.ms / 400) * 0.6;
  return { left: `${50 + Math.cos(a) * d * 46}%`, top: `${50 + Math.sin(a) * d * 46}%` };
}

function Radar({ scanning, found, progress, link, net }: { scanning: boolean; found: FoundRobot[]; progress: number; link: Link | null; net: string | null }) {
  const linked = !!link && link.step >= LINK_STEPS.length;
  return (
    <aside className={css.radarSide} data-scanning={scanning || undefined} data-linked={linked || undefined} aria-hidden="true">
      <div className={css.radarBrand}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the brand mark, also in the static export */}
        <img src="/brand/sim-mark-white.svg" alt="" />
        <span>
          <b>ROBOT LINK</b>
          <small>교실 네트워크 · 로봇 연결</small>
        </span>
      </div>
      <div className={css.radar}>
        <i className={css.radarSweep} />
        {found.map((r) => (
          <span key={r.address} className={css.radarBlip} data-pick={link?.robot?.address === r.address || undefined} data-off={!r.connected || undefined} style={blipAt(r)}>
            <b>{r.robotId}</b>
          </span>
        ))}
        <span className={css.radarPc}>
          <Icon name="pc" size={22} />
        </span>
      </div>
      <p className={css.radarState}>
        {link
          ? link.step >= LINK_STEPS.length
            ? '연결됐어요'
            : link.error
              ? '대답이 없어요'
              : '연결하는 중'
          : scanning
            ? `찾는 중 · ${Math.round(progress * 100)}% · ${found.length}대`
            : found.length
              ? `로봇 ${found.length}대를 찾았어요`
              : '같은 Wi-Fi 의 로봇을 찾아요'}
      </p>
      <dl className={css.radarStats}>
        <div>
          <dt>찾은 로봇</dt>
          <dd>
            {found.length}
            <small>대</small>
          </dd>
        </div>
        <div>
          <dt>준비됨</dt>
          <dd>
            {found.filter((r) => r.connected).length}
            <small>대</small>
          </dd>
        </div>
        <div>
          <dt>네트워크</dt>
          <dd className={css.radarNet}>{net ? `${net}x` : '—'}</dd>
        </div>
      </dl>
    </aside>
  );
}

function LinkSteps({ link, onRetry, onBack, onOpenOld, onUsb }: { link: Link; onRetry(): void; onBack(): void; onOpenOld(): void; onUsb?: () => void }) {
  const done = link.step >= LINK_STEPS.length;
  // The arm's signal: known from the search (the server answers whether it reaches the arm).
  const armOk = link.robot ? link.robot.connected : true;
  return (
    <div className={css.linkBox} data-done={done || undefined}>
      <div className={css.linkLine}>
        <span className={css.linkNode}>
          <i>
            <Icon name="pc" size={22} />
          </i>
          이 PC
        </span>
        <span className={css.linkWire} />
        <span className={css.linkNode}>
          <i>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
            <img src={robotPicture(link.robot)} alt="" />
          </i>
          {link.robot?.label || `로봇 ${link.label}`}
        </span>
      </div>
      <ol className={css.linkChecks}>
        {LINK_STEPS.map((s, i) => (
          <li key={s} data-state={i < link.step ? (i === 2 && !armOk ? 'warn' : 'ok') : i === link.step ? (link.error ? 'fail' : 'now') : undefined}>
            <i />
            {s}
          </li>
        ))}
      </ol>
      {link.old ? (
        <div className={css.linkError} role="alert">
          <p>
            <b>이 로봇의 로봇 프로그램이 예전 판이에요{link.robot?.version ? ` (${link.robot.version.slice(0, 8)})` : ''}.</b> 그대로 열면 지금 화면 대신 로봇 안에 든 예전 화면(예전 인트로 · 패널)으로 바뀌어요.
          </p>
          <p>
            로봇 USB 키트로 한 번 업데이트하면, 연결해도 지금 이 화면 그대로 로봇을 움직여요. USB 맨 위에 <code>eduino</code> 폴더가 있어야 로봇이 찾아요 (⚙ → 로봇 USB 만들기 가 맞춰 줘요).
          </p>
          <span>
            {onUsb && (
              <button type="button" className={css.connectGo} onClick={onUsb}>
                로봇 USB 만들기
              </button>
            )}
            <button type="button" className={css.ghost} onClick={onOpenOld}>
              예전 화면으로 열기
            </button>
            <button type="button" className={css.ghost} onClick={onBack}>
              돌아가기
            </button>
          </span>
        </div>
      ) : link.error ? (
        <div className={css.linkError} role="alert">
          <p>{link.error}</p>
          <span>
            <button type="button" className={css.connectGo} onClick={onRetry}>
              다시 시도
            </button>
            <button type="button" className={css.ghost} onClick={onBack}>
              돌아가기
            </button>
          </span>
        </div>
      ) : (
        <p className={css.linkNote}>
          {done ? `${link.robot?.label || `로봇 ${link.label}`} 에 연결하는 중…` : link.step === 0 ? `http://${link.addr} 에 물어보는 중…` : `http://${link.addr}`}
          {!armOk && link.step > 2 && ' · 로봇팔 신호가 없어요 (전원 · USB 선 확인)'}
        </p>
      )}
    </div>
  );
}

function FindRobots({
  prefix,
  setPrefix,
  here,
  auto,
  onScan,
  onConnect,
  onUsb,
}: {
  prefix: string;
  setPrefix(p: string): void;
  here: string[];
  auto?: boolean;
  /** The search as it goes (for the radar). */
  onScan(s: { scanning: boolean; found: FoundRobot[]; progress: number }): void;
  onConnect(r: FoundRobot): void;
  onUsb?: () => void;
}) {
  const [found, setFound] = useState<FoundRobot[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [scanned, setScanned] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  /** The second, slower search (the first found nothing). */
  const [slow, setSlow] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const net = networkPrefix(prefix);
  const scanning = progress !== null;
  useEffect(() => onScan({ scanning, found, progress: progress ?? (scanned ? 1 : 0) }), [scanning, found, progress, scanned, onScan]);
  const [filter, setFilter] = useState('');
  /** The PC's own networks (desktop simulator), searched together. */
  const [pcNets, setPcNets] = useState<string[]>([]);
  /** This PC's Wi-Fi (desktop simulator) and the one a robot was last seen on. */
  const [pcSsid, setPcSsid] = useState('');
  const [robotWifi, setRobotWifi] = useState('');
  useEffect(() => {
    try {
      // Read after the first render so server and client HTML agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRobotWifi(localStorage.getItem(ROBOT_WIFI_KEY) ?? '');
    } catch {
      /* storage blocked */
    }
  }, []);
  const seenOn = (r: FoundRobot) => {
    if (!r.wifi) return;
    setRobotWifi(r.wifi);
    try {
      localStorage.setItem(ROBOT_WIFI_KEY, r.wifi);
    } catch {
      /* ignore */
    }
  };
  const scan = async (asked: string[] = net ? [net] : []) => {
    // A PC on a LAN cable straight to a robot has only a 169.254.x.y address: no network to sweep,
    // the robot answers at its fixed direct address instead (asked below, whatever the networks).
    const nets = asked.filter((n) => !n.startsWith('169.254.'));
    if (!asked.length) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setFound([]);
    setNotes({});
    setProgress(0);
    try {
      if (nets[0]) localStorage.setItem(PREFIX_KEY, nets[0]);
    } catch {
      /* ignore */
    }
    let any = 0;
    const pass = (timeoutMs: number, from: number, span: number) =>
      Promise.all(
        nets.map((n, i) =>
          scanNetwork(n, {
            signal: ctl.signal,
            timeoutMs,
            parallel: Math.max(16, Math.round(48 / nets.length)),
            onFound: (r) => {
              any += 1;
              seenOn(r);
              setFound((f) => [...f.filter((x) => !sameRobot(x, r)), r].sort(byName));
            },
            onProgress: (done, total) => (i === 0 ? setProgress(from + (span * done) / total) : undefined),
          }),
        ),
      );
    const direct = probeRobot(DIRECT_IP, 2500).then((r) => {
      if (!r || ctl.signal.aborted) return;
      any += 1;
      seenOn(r);
      setFound((f) => [...f.filter((x) => !sameRobot(x, r)), r].sort(byName));
    });
    await Promise.all([pass(1500, 0, 1), direct]);
    // Nothing answered: once more, waiting longer (a robot's Wi-Fi dozing, a crowded network).
    if (!any && !ctl.signal.aborted) {
      setSlow(true);
      await pass(3500, 0, 1);
      setSlow(false);
    }
    if (ctl.signal.aborted) return;
    setProgress(null);
    setScanned(true);
  };
  const stop = () => {
    abort.current?.abort();
    setProgress(null);
    setScanned(true);
  };
  // Desktop simulator: this PC's networks, then search them straight away (once per opening).
  const started = useRef(false);
  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void pcLan().then(({ prefixes: nets, ssid }) => {
      setPcSsid(ssid);
      if (!nets.length) return;
      setPcNets(nets);
      setPrefix(nets[0]);
      void scan(nets);
    });
    // scan reads the current state; this runs once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  const identify = async (r: FoundRobot) => {
    setNotes((n) => ({ ...n, [r.address]: '움직이는 중…' }));
    const res = await identifyRobot(r.address);
    setNotes((n) => ({ ...n, [r.address]: res.ok ? (r.kind === 'agv' ? '제자리에서 살짝 돌았어요' : '일자로 폈어요 (천천히)') : res.error || '움직이지 못했어요' }));
  };

  return (
    <div className={css.find}>
      <form
        className={css.findBar}
        onSubmit={(e) => {
          e.preventDefault();
          if (scanning) stop();
          else void scan(pcNets.length && net && pcNets.includes(net) ? pcNets : undefined);
        }}
      >
        <label className={css.connectField}>
          <span>찾을 네트워크 (주소 앞부분)</span>
          <input className={css.findNet} value={prefix} onChange={(e) => setPrefix(e.target.value)} aria-label="찾을 네트워크" spellCheck={false} inputMode="decimal" />
        </label>
        <button type="submit" className={css.connectGo} disabled={!net && !scanning}>
          <Icon name={scanning ? 'stop' : 'search'} size={18} />
          {scanning ? '그만 찾기' : found.length || scanned ? '다시 찾기' : '로봇 찾기'}
        </button>
      </form>
      <div className={css.findProgress} aria-hidden={!scanning}>
        <i style={{ width: `${Math.round((progress ?? (scanned ? 1 : 0)) * 100)}%` }} />
      </div>
      <p className={css.connectHint} aria-live="polite">
        {!net
          ? '주소 앞 세 숫자를 넣어요 (예: 192.168.0.)'
          : scanning
            ? `${slow ? '한 번 더, 천천히 · ' : ''}${pcNets.length > 1 ? pcNets.join(' · ') : `${net}1 ~ ${net}254`} 에서 찾는 중… ${Math.round((progress ?? 0) * 100)}% · ${found.length}대 찾음`
            : scanned
              ? found.length
                ? `로봇 ${found.length}대를 찾았어요. 이름·IP 로 내 로봇을 고르고(헷갈리면 [움직여 확인]) [연결] 해요.`
                : '이 네트워크에서 로봇을 찾지 못했어요.'
              : `[로봇 찾기] 를 누르면 ${net}1 ~ 254 를 살펴봐요 (몇 초 걸려요).`}
      </p>
      {onUsb && scanned && !scanning && !found.length && (
        <button type="button" className={css.usbHint} onClick={onUsb}>
          <Icon name="usb" size={18} />
          <span>
            <b>로봇이 아직 이 Wi-Fi 에 없나요?</b>
            <small>로봇 USB 만들기: Wi-Fi 이름 · 비밀번호를 적은 USB 를 로봇에 꽂으면 붙어요.</small>
          </span>
        </button>
      )}

      {found.length > 4 && <input className={css.findFilter} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름 · ID · IP 로 찾기" aria-label="찾은 로봇 거르기" spellCheck={false} />}
      {found.length > 0 && (
        <ul className={css.foundList} aria-label="찾은 로봇">
          {found
            .filter((r) => matches(r, filter))
            .map((r) => {
              const mine = r.ips.some((ip) => here.includes(ip));
              return (
                <li key={r.address} className={css.foundCard} data-state={r.running ? 'busy' : r.connected ? 'ready' : 'off'}>
                  <span className={css.foundPic}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed pictures, also in the static export */}
                    <img src={robotPicture(r)} alt="" />
                    <b className={css.foundId}>
                      <small>ID</small>
                      {r.robotId}
                    </b>
                  </span>
                  <span className={css.foundInfo}>
                    <b>
                      {r.label || <span className={css.foundNoName}>이름 없음</span>}
                      {r.demo && <em>데모</em>}
                      {mine && <em className={css.foundHere}>지금 이 화면</em>}
                    </b>
                    <span>
                      <i className={css.foundDot} aria-hidden="true" />
                      <b className={css.foundState}>{r.running ? '움직이는 중' : r.connected ? '준비됨' : '로봇팔 신호 없음'}</b> · <b className={css.foundIp}>IP {r.ip}</b> · {r.model}
                    </span>
                    {notes[r.address] && <span className={css.foundNote}>{notes[r.address]}</span>}
                  </span>
                  <span className={css.foundActions}>
                    <button type="button" className={css.ghost} onClick={() => void identify(r)} disabled={notes[r.address] === '움직이는 중…'}>
                      <Icon name="hand" size={15} />
                      움직여 확인
                    </button>
                    <button type="button" className={css.foundGo} onClick={() => onConnect(r)} disabled={mine}>
                      {mine ? '연결됨' : '연결'}
                    </button>
                  </span>
                </li>
              );
            })}
        </ul>
      )}

      {scanned && !scanning && found.length === 0 && otherWifiHint(robotWifi, pcSsid) && (
        <p className={css.wifiHint} role="status">
          {otherWifiHint(robotWifi, pcSsid)}
        </p>
      )}
      {scanned && !scanning && found.length === 0 && (
        <ol className={css.connectSteps}>
          <li>
            <b>같은 Wi-Fi 인가요?</b> PC 와 로봇이 같은 공유기(예: ROBOT-LAB)에 붙어 있어야 해요.
          </li>
          <li>
            <b>주소 앞부분</b>: PC 의 주소 앞 세 숫자와 같아야 해요 (Windows: <code>ipconfig</code>). 교실 공유기는 보통 <code>192.168.0.</code> 이에요.
          </li>
          <li>
            <b>로봇 서버</b>: 로봇 전원을 켜고 1분쯤 기다려요 (자동 시작). 그래도 없으면 아래 [로봇 ID 로 연결] 에 로봇 ID 를 넣어 봐요.
          </li>
          <li>
            <b>학교 · 손님용 Wi-Fi</b>: 기기끼리 서로 못 보게 막아 둔 망(AP 격리)이 많아요. 실습실 공유기에 PC 와 로봇을 함께 붙여요.
          </li>
        </ol>
      )}
    </div>
  );
}

/** Named robots first (by name), then the rest by ID. */
const byName = (a: FoundRobot, b: FoundRobot) => (a.label && b.label ? a.label.localeCompare(b.label, 'ko', { numeric: true }) : a.label ? -1 : b.label ? 1 : Number(a.robotId) - Number(b.robotId));

const matches = (r: FoundRobot, q: string) => {
  const t = q.trim().toLowerCase();
  return !t || [r.label, r.robotId, r.ip, r.host].some((x) => x.toLowerCase().includes(t));
};
