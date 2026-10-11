'use client';

/**
 * 로봇 연결: each student opens their own robot.
 *
 * - 로봇 찾기: the browser asks every address of the classroom network and
 *   lists the robots that answer; [움직여 확인] makes one wiggle so the
 *   student knows which is theirs, [연결] opens its console.
 * - ID 로 연결: the robot's ID is the last number of its address (the server
 *   prints "로봇 ID: 252" when it starts, and every console shows it); with
 *   the network's first part remembered, typing the ID is enough.
 *   In the desktop simulator (`auto`) the PC's own networks come from the
 *   program and the search starts by itself; each robot shows its 사용자
 *   이름 (set on the USB stick) with its address.
 * - 로봇 Wi-Fi (only on a robot's own console): move the robot from its
 *   hotspot to the classroom router, or back.
 *
 * Connecting opens that robot's console (the same app, served by the robot): a radar beside the
 * list shows the search, and the link to the picked robot is drawn and checked step by step
 * (network → robot server → arm signal → console) before the console opens.
 */

import { useEffect, useRef, useState } from 'react';

import { identifyRobot, networkPrefix, pcNetworks, probeRobot, ROBOT_PORT, sameRobot, scanNetwork, type FoundRobot } from '@/engine/simulator/discover';

import { sessionHandoff } from '@/engine/account';

import { useAccount } from '../../account/AccountProvider';
import Icon from '../Icon';
import WifiPanel from './WifiPanel';
import css from '../console.module.css';

const PREFIX_KEY = 'robot-console-net-prefix';
const RECENT_KEY = 'robot-console-recent-robots';
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

type Tab = 'find' | 'id' | 'wifi';

interface Props {
  /** On a robot's own console: its ID and address, to show and to switch away from. */
  current?: { id: string; ips: string[] } | null;
  /** Desktop simulator: ask the program for this PC's networks and search them at once. */
  auto?: boolean;
  /** The open program, as an address part (`#carry=…`) for the robot's console to put back. */
  carry?: () => string;
  onClose(): void;
}

export default function ConnectDialog({ current, auto, carry, onClose }: Props) {
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
  useEffect(() => {
    if (tab === 'id') input.current?.focus();
  }, [tab]);

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
  // The latest program at the moment of leaving (the console redraws while the dialog is open).
  const carryNow = useRef(carry);
  const session = useAccount().session;
  const sessionNow = useRef(session);
  useEffect(() => {
    carryNow.current = carry;
    sessionNow.current = session;
  });
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
            : { ...l, error: `로봇(${link.addr})이 대답하지 않아요. 로봇 전원이 켜져 있는지, PC 와 같은 Wi-Fi 인지, ID 가 맞는지 확인해 주세요.` },
      );
    })();
  }, [link]);
  useEffect(() => {
    if (!link || !link.checked || link.error) return;
    const quick = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (link.step >= LINK_STEPS.length) {
      const t = window.setTimeout(() => {
        // The class login goes along (a robot's page is another address with its own store).
        const program = (carryNow.current?.() ?? '').replace(/^#/, '');
        const login = sessionNow.current ? sessionHandoff(sessionNow.current) : '';
        const hash = [login, program].filter(Boolean).join('&');
        window.location.href = `http://${link.addr}/console${hash ? `#${hash}` : ''}`;
      }, quick ? 0 : 450);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setLink((l) => (l ? { ...l, step: l.step + 1 } : l)), quick ? 0 : 380);
    return () => window.clearTimeout(t);
  }, [link]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'find', label: '로봇 찾기', icon: 'search' },
    { key: 'id', label: 'ID 로 연결', icon: 'link' },
    ...(current ? [{ key: 'wifi' as Tab, label: '로봇 Wi-Fi', icon: 'wifi' }] : []),
  ];

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
                    : '[로봇 찾기] 로 같은 Wi-Fi 의 로봇을 찾아 연결해요. 로봇 없이 연습하려면 [시뮬레이션만] 을 눌러요.'}
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

          {link && <LinkSteps link={link} onRetry={() => setLink({ label: link.label, robot: link.robot, addr: link.addr, step: 0 })} onBack={() => setLink(null)} />}

          {!link && tab === 'find' && <FindRobots prefix={prefix} setPrefix={setPrefix} here={current?.ips ?? []} auto={auto} onScan={setScan} onConnect={(r) => go(r.address, r.robotId, r)} />}

          {!link && tab === 'id' && (
            <>
              <form
                className={css.connectForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (address) go(address, id.trim());
                }}
              >
                <label className={css.connectField}>
                  <span>로봇 ID</span>
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
                  '숫자만(예: 252) 넣으면 앞부분과 합쳐요. 전체 주소(192.168.0.252)나 이름(robot.local)도 돼요.'
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

              <ol className={css.connectSteps}>
                <li>
                  <b>로봇 ID 찾기</b>: 로봇을 켜고 서버가 켜지면 터미널에 <code>★ 로봇 ID: 252</code> 가 나와요. 연결한 뒤에는 이 화면 오른쪽 위에도 보여요. (IP 주소의 마지막 숫자예요. 로봇마다 번호
                  스티커를 붙여 두면 편해요)
                </li>
                <li>
                  <b>같은 공유기</b>: PC 와 로봇이 같은 와이파이(공유기)에 있어야 해요. 앞부분(192.168.0.)은 교실 공유기에 맞게 한 번만 고치면 기억해요.
                </li>
                <li>
                  <b>안 열리면</b> 로봇 전원, 서버가 켜져 있는지(자동 시작), ID 가 맞는지 확인해요.
                </li>
              </ol>
            </>
          )}

          {!link && tab === 'wifi' && current && <WifiPanel onFind={() => setTab('find')} />}

          <div className={css.connectFoot}>
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
        <img src="/brand/robodyne-mark.png" alt="" />
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

function LinkSteps({ link, onRetry, onBack }: { link: Link; onRetry(): void; onBack(): void }) {
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
      {link.error ? (
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
          {done ? `${link.robot?.label || `로봇 ${link.label}`} 의 화면을 여는 중…` : link.step === 0 ? `http://${link.addr} 에 물어보는 중…` : `http://${link.addr}`}
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
}: {
  prefix: string;
  setPrefix(p: string): void;
  here: string[];
  auto?: boolean;
  /** The search as it goes (for the radar). */
  onScan(s: { scanning: boolean; found: FoundRobot[]; progress: number }): void;
  onConnect(r: FoundRobot): void;
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
  const scan = async (nets: string[] = net ? [net] : []) => {
    if (!nets.length) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setFound([]);
    setNotes({});
    setProgress(0);
    try {
      localStorage.setItem(PREFIX_KEY, nets[0]);
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
              setFound((f) => [...f.filter((x) => !sameRobot(x, r)), r].sort(byName));
            },
            onProgress: (done, total) => (i === 0 ? setProgress(from + (span * done) / total) : undefined),
          }),
        ),
      );
    await pass(1500, 0, 1);
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
    void pcNetworks().then((nets) => {
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
    setNotes((n) => ({ ...n, [r.address]: res.ok ? (r.kind === 'agv' ? '제자리에서 살짝 돌았어요' : '받침이 살짝 돌았다 돌아왔어요') : res.error || '움직이지 못했어요' }));
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

      {found.length > 4 && (
        <input className={css.findFilter} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름 · ID · IP 로 찾기" aria-label="찾은 로봇 거르기" spellCheck={false} />
      )}
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

      {scanned && !scanning && found.length === 0 && (
        <ol className={css.connectSteps}>
          <li>
            <b>같은 Wi-Fi 인가요?</b> PC 와 로봇이 같은 공유기(예: ROBOT-LAB)에 붙어 있어야 해요.
          </li>
          <li>
            <b>주소 앞부분</b>: PC 의 주소 앞 세 숫자와 같아야 해요 (Windows: <code>ipconfig</code>). 교실 공유기는 보통 <code>192.168.0.</code>, 로봇 핫스팟은 <code>10.42.0.</code> 이에요.
          </li>
          <li>
            <b>로봇 서버</b>: 로봇 전원을 켜고 1분쯤 기다려요 (자동 시작). 그래도 없으면 [ID 로 연결] 에 로봇 ID 를 넣어 봐요.
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
