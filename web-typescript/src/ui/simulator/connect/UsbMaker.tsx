'use client';

/**
 * 로봇 USB 만들기 (desktop program only, engine/simulator/usbKit.ts): pick the stick, write the Wi-Fi,
 * one button — the program puts the robot kit it carries onto the stick and fills wifi.txt. The robots
 * read it when it is plugged in; put back into this PC, the stick shows what each robot answered.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { checkWifi, ejectUsb, formatBytes, INSTALL_LINE, kitDate, makeUsb, pcWifi, usbJob, usbResults, usbState, type RobotResult, type UsbDrive, type UsbJob, type UsbState, type WifiForm, WIFI_HOTSPOT, WIFI_OFF, DIRECT_IP } from '@/engine/simulator/usbKit';
import { ROBOT_PORT } from '@/engine/simulator/discover';

import Icon from '../Icon';
import css from '../console.module.css';
import u from './usbMaker.module.css';
import MoreWifi from './MoreWifi';

type Tab = 'make' | 'results';

interface Props {
  onClose(): void;
  /** [연결] on a robot's result: open that robot (the connect dialog's checks, then its console). */
  onConnect(address: string, robotId: string): void;
  /** A robot never set up: 새 로봇 설치 (over a LAN cable, RobotSetup). */
  onSetup?: () => void;
}

export default function UsbMaker({ onClose, onConnect, onSetup }: Props) {
  const [state, setState] = useState<UsbState | null>(null);
  const [error, setError] = useState('');
  const [others, setOthers] = useState(false);
  const [pick, setPick] = useState('');
  const [tab, setTab] = useState<Tab>('make');
  const [form, setForm] = useState<WifiForm>({ ssid: '', password: '', label: '' });
  const [formFrom, setFormFrom] = useState<'' | 'usb' | 'pc'>('');
  const [showPass, setShowPass] = useState(false);
  const [job, setJob] = useState<UsbJob | null>(null);
  const [eject, setEject] = useState<'' | 'busy' | 'done' | string>('');
  const [copied, setCopied] = useState(false);
  const touched = useRef(false);

  // The sticks, again every 2 s: one plugged in shows up by itself.
  const refresh = useCallback(async () => {
    try {
      const s = await usbState();
      setState(s);
      setError('');
      if (s.job?.state === 'copying') setJob(s.job);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first look at the sticks
    void refresh();
    const t = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const drives = useMemo(() => (state?.drives ?? []).filter((d) => d.removable || others), [state, others]);
  const hidden = (state?.drives ?? []).length - drives.length;
  // The stick picked; with one stick plugged in, that one.
  const drive: UsbDrive | undefined = drives.find((d) => d.id === pick) ?? (drives.length === 1 ? drives[0] : undefined);

  // The form: what the stick already has, else this PC's own Wi-Fi (until the teacher types).
  useEffect(() => {
    if (touched.current) return;
    if (drive?.wifi?.ssid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- filled once from the stick
      setForm({ ssid: drive.wifi.ssid, password: drive.wifi.password, label: drive.wifi.label, more: drive.wifi.more ?? [] });
      setFormFrom('usb');
      return;
    }
    let live = true;
    void pcWifi()
      .then((w) => {
        if (live && !touched.current && w.ssid) {
          setForm({ ssid: w.ssid, password: w.password, label: '' });
          setFormFrom('pc');
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [drive?.id, drive?.wifi?.ssid, drive?.wifi?.password, drive?.wifi?.label, drive?.wifi?.more]);
  /** How the robot is reached: the classroom Wi-Fi, its own hotspot, or the LAN cable only (Wi-Fi off). */
  const way: 'wifi' | 'hotspot' | 'off' = form.ssid === WIFI_HOTSPOT ? 'hotspot' : form.ssid === WIFI_OFF ? 'off' : 'wifi';
  const chooseWay = (w: typeof way) => {
    touched.current = true;
    setFormFrom('');
    setForm((f) => ({ ...f, ssid: w === 'hotspot' ? WIFI_HOTSPOT : w === 'off' ? WIFI_OFF : '', password: '', more: w === 'wifi' ? f.more : [] }));
  };
  const edit = (k: keyof WifiForm, v: string) => {
    touched.current = true;
    setFormFrom('');
    setForm((f) => ({ ...f, [k]: v }));
  };

  // A stick that came back from the robots opens on its results.
  const opened = useRef('');
  useEffect(() => {
    if (drive && opened.current !== drive.id) {
      opened.current = drive.id;

      setTab(drive.results > 0 && !job ? 'results' : 'make');
    }
  }, [drive, job]);

  // Writing: how far, every 0.4 s.
  useEffect(() => {
    if (job?.state !== 'copying') return;
    const t = window.setInterval(() => {
      void usbJob()
        .then((r) => {
          if (r.job) setJob(r.job);
          if (r.job?.state !== 'copying') void refresh();
        })
        .catch(() => {});
    }, 400);
    return () => window.clearInterval(t);
  }, [job?.state, refresh]);

  const problem = checkWifi(form);
  const kit = state?.kit ?? null;
  const writing = job?.state === 'copying';
  const make = async () => {
    if (!drive || problem || writing) return;
    setEject('');
    try {
      const r = await makeUsb(drive.id, form);
      setJob(r.job);
    } catch (e) {
      setJob({ drive: drive.id, state: 'error', done: 0, total: 0, error: (e as Error).message, moved: 0 });
    }
  };
  const doEject = async () => {
    if (!drive) return;
    setEject('busy');
    try {
      await ejectUsb(drive.id);
      setEject('done');
      void refresh();
    } catch (e) {
      setEject((e as Error).message);
    }
  };
  const copy = () => {
    void navigator.clipboard?.writeText(INSTALL_LINE).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const done = job?.state === 'done' && job.drive === drive?.id;
  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className={css.picker} role="dialog" aria-modal="true" aria-label="로봇 USB 만들기" onKeyDown={(e) => e.key === 'Escape' && !writing && onClose()}>
      <div className={`${css.pickerBox} ${css.toolBox} ${u.box}`}>
        <header className={css.pickerHead}>
          <span className={u.headIcon}>
            <Icon name="usb" size={24} />
          </span>
          <div>
            <h1>로봇 USB 만들기</h1>
            <p>USB 하나로 로봇을 교실 Wi-Fi 에 붙이고, 로봇 프로그램도 최신으로 바꿔요.</p>
          </div>
          <button type="button" className={css.pickerClose} onClick={onClose} disabled={writing} aria-label="닫기">
            ×
          </button>
        </header>

        {error && <p className={u.error}>{error}</p>}

        <section className={u.step} aria-label="USB 고르기">
          <h2>
            <b>1</b> USB 고르기
          </h2>
          {state && drives.length === 0 && (
            <div className={u.empty}>
              <Icon name="usb" size={30} />
              <p>
                <b>PC 에 USB 를 꽂아 주세요.</b>
                <br />
                꽂으면 여기 저절로 나와요. (보통 쓰는 USB 그대로, 1 GB 이상)
              </p>
            </div>
          )}
          {drives.length > 0 && (
            <ul className={u.drives} role="radiogroup" aria-label="USB">
              {drives.map((d) => (
                <li key={d.id}>
                  <button type="button" role="radio" aria-checked={d.id === drive?.id} className={u.drive} onClick={() => setPick(d.id)} disabled={writing}>
                    <Icon name="usb" size={22} />
                    <span className={u.driveName}>
                      <b>
                        {d.name} {d.id.length <= 3 && <span>({d.id})</span>}
                      </b>
                      <small>
                        빈 곳 {formatBytes(d.free)} / {formatBytes(d.total)}
                        {d.fs ? ` · ${d.fs}` : ''}
                        {!d.removable ? ' · USB 아님' : ''}
                      </small>
                    </span>
                    <span className={u.chip} data-tone={d.need > 0 ? 'bad' : d.kitVersion ? 'ok' : 'none'}>
                      {d.need > 0 ? `${formatBytes(d.need)} 모자람` : d.kitVersion ? `키트 있음 ${kitDate(d.kitVersion)}` : '키트 없음'}
                    </span>
                    {d.results > 0 && (
                      <span className={u.chip} data-tone="info">
                        로봇 결과 {d.results}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hidden > 0 && !others && (
            <button type="button" className={u.linkBtn} onClick={() => setOthers(true)}>
              USB 가 안 보이면: 다른 드라이브도 보기 ({hidden})
            </button>
          )}
        </section>

        {drive && (
          <div className={css.connectTabs} role="tablist" aria-label="할 일">
            <button type="button" role="tab" aria-selected={tab === 'make'} className={tab === 'make' ? css.connectTabOn : undefined} onClick={() => setTab('make')}>
              <Icon name="usb" size={17} /> USB 만들기
            </button>
            <button type="button" role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? css.connectTabOn : undefined} onClick={() => setTab('results')}>
              <Icon name="table" size={17} /> 로봇 결과 보기{drive.results ? ` · ${drive.results}` : ''}
            </button>
          </div>
        )}

        {drive && tab === 'make' && (
          <>
            <section className={u.step} aria-label="연결 방법">
              <h2>
                <b>2</b> 로봇 연결 방법
              </h2>
              <div className={u.ways} role="radiogroup" aria-label="연결 방법">
                {(
                  [
                    ['wifi', '교실 Wi-Fi', '공유기 Wi-Fi 에 붙어요'],
                    ['hotspot', '로봇 핫스팟', '로봇이 Wi-Fi 를 내보내요 (1대 1)'],
                    ['off', '유선만 (Wi-Fi 끔)', '랜선으로만 연결해요'],
                  ] as const
                ).map(([id, name, sub]) => (
                  <button key={id} type="button" role="radio" aria-checked={way === id} disabled={writing} onClick={() => chooseWay(id)}>
                    <b>{name}</b>
                    <small>{sub}</small>
                  </button>
                ))}
              </div>
              <div className={u.form}>
                {way === 'wifi' && (
                  <>
                    <label>
                      <span>Wi-Fi 이름</span>
                      <input value={form.ssid} onChange={(e) => edit('ssid', e.target.value)} placeholder="예: EDUINO-LAB" spellCheck={false} autoComplete="off" disabled={writing} />
                    </label>
                    <label>
                      <span>비밀번호</span>
                      <span className={u.pass}>
                        <input type={showPass ? 'text' : 'password'} value={form.password} onChange={(e) => edit('password', e.target.value)} placeholder="비밀번호가 없으면 비워 두기" spellCheck={false} autoComplete="off" disabled={writing} />
                        <button type="button" onClick={() => setShowPass((s) => !s)} aria-pressed={showPass}>
                          {showPass ? '숨기기' : '보기'}
                        </button>
                      </span>
                    </label>
                    <MoreWifi value={form.more ?? []} onChange={(more) => (touched.current = true, setFormFrom(''), setForm((f) => ({ ...f, more })))} disabled={writing} />
                  </>
                )}
                <label>
                  <span>
                    사용자 <i>(선택)</i>
                  </span>
                  <input value={form.label} onChange={(e) => edit('label', e.target.value)} placeholder="예: 3조 · 로봇 찾기 목록에 보일 이름" maxLength={24} disabled={writing} />
                </label>
              </div>
              <p className={u.note}>
                {way === 'hotspot'
                  ? '로봇이 자기 Wi-Fi 를 내보내요. PC 를 그 Wi-Fi 에 붙여 로봇 1대와 연결해요.'
                  : way === 'off'
                    ? `로봇의 Wi-Fi 를 꺼요. 공유기 · 허브에 랜선으로 연결하거나, PC 와 랜선 하나로 바로 연결해요 (연결 창 [유선 직결], 주소 ${DIRECT_IP}).`
                    : formFrom === 'pc'
                      ? '이 PC 가 연결된 Wi-Fi 를 넣었어요. 로봇과 학생 PC 는 같은 Wi-Fi 여야 해요.'
                      : formFrom === 'usb'
                        ? '이 USB 에 적혀 있던 Wi-Fi 예요. 바꿀 것만 고치세요.'
                        : '로봇과 학생 PC 는 같은 Wi-Fi 여야 해요. 이름은 대소문자 · 띄어쓰기까지 똑같이.'}
              </p>
            </section>

            {!kit && <p className={u.error}>이 프로그램에는 로봇 키트가 들어 있지 않아요. 키트가 든 새 프로그램을 받아 주세요.</p>}
            {(job?.state === 'error' && job.drive === drive.id && <p className={u.error}>{job.error}</p>) || (form.ssid && problem && <p className={u.error}>{problem}</p>)}

            {!done && (
              <div className={u.makeRow}>
                <button type="button" className={u.primary} onClick={() => void make()} disabled={!kit || !!problem || writing || drive.need > 0}>
                  {writing ? `USB 에 쓰는 중… ${pct}%` : 'USB 만들기'}
                </button>
                <small>{kit ? `로봇 키트 ${kitDate(kit.version)} · ${formatBytes(kit.size)} · 1~3분` : ''}</small>
              </div>
            )}
            {writing && (
              <div className={u.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="USB 에 쓰는 중">
                <i style={{ width: `${pct}%` }} />
                <span>다 될 때까지 USB 를 빼지 마세요.</span>
              </div>
            )}

            {done && (
              <section className={u.done} aria-label="다 됐어요">
                <h2>
                  <Icon name="check" size={20} /> USB 를 만들었어요
                  {job && job.moved > 0 && <small> · 예전 결과 {job.moved}개는 「지난 결과」 폴더로 옮겼어요</small>}
                </h2>
                <ol className={u.next}>
                  <li>
                    <b>USB 꺼내기</b>
                    <span>
                      <button type="button" className={u.secondary} onClick={() => void doEject()} disabled={eject === 'busy' || eject === 'done'}>
                        {eject === 'done' ? '꺼냈어요 · 이제 빼도 돼요' : eject === 'busy' ? '꺼내는 중…' : 'USB 꺼내기'}
                      </button>
                      {eject && eject !== 'busy' && eject !== 'done' && <small className={u.errorSmall}>{eject}</small>}
                    </span>
                  </li>
                  <li>
                    <b>로봇에 꽂기</b>
                    <span>로봇 전원을 켜고 USB 를 꽂아요. 1~2분 뒤 로봇이 살짝 움직이면 Wi-Fi 연결 끝. 여러 대를 차례로 꽂아도 돼요.</span>
                  </li>
                  <li>
                    <b>새 로봇이면 (처음 한 번)</b>
                    <span>
                      <span>USB 를 꽂기 전에 한 번 설치해야 해요. 랜선 하나로 PC 와 이어 [새 로봇 설치] 를 쓰면 모니터 · 키보드 없이 돼요.</span>
                      {onSetup && (
                        <button type="button" className={u.secondary} onClick={onSetup}>
                          새 로봇 설치 열기
                        </button>
                      )}
                      <span>모니터 · 키보드로 할 때는 USB 의 「처음 설치 (모니터로).txt」 순서대로, 터미널에 이 한 줄:</span>
                      <span className={u.cmd}>
                        <code>{INSTALL_LINE}</code>
                        <button type="button" onClick={copy}>
                          {copied ? '복사했어요' : '복사'}
                        </button>
                      </span>
                    </span>
                  </li>
                  <li>
                    <b>결과 보기</b>
                    <span>로봇에 꽂았던 USB 를 이 PC 에 다시 꽂으면 [로봇 결과 보기] 에 로봇마다 ID · 주소가 나와요.</span>
                  </li>
                </ol>
              </section>
            )}
          </>
        )}

        {drive && tab === 'results' && <Results drive={drive} onConnect={onConnect} />}
      </div>
    </div>
  );
}

function Results({ drive, onConnect }: { drive: UsbDrive; onConnect(address: string, robotId: string): void }) {
  const [list, setList] = useState<RobotResult[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    usbResults(drive.id)
      .then((r) => live && (setList(r), setError('')))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [drive.id, drive.results]);
  if (error) return <p className={u.error}>{error}</p>;
  if (!list) return <p className={u.note}>읽는 중…</p>;
  if (!list.length)
    return (
      <div className={u.empty}>
        <Icon name="table" size={28} />
        <p>
          <b>아직 로봇 결과가 없어요.</b>
          <br />이 USB 를 로봇에 꽂았다가 1~2분 뒤 빼서 이 PC 에 다시 꽂으면 여기 나와요.
        </p>
      </div>
    );
  const ok = list.filter((r) => r.wifi !== 'fail').length;
  return (
    <section className={u.step} aria-label="로봇 결과">
      <p className={u.note}>
        로봇 {list.length}대 · 연결 {ok}대{list.length > ok ? ` · 실패 ${list.length - ok}대 (이유를 보고 Wi-Fi 를 고쳐 USB 를 다시 만들어요)` : ''}
      </p>
      <ul className={u.results}>
        {list.map((r) => (
          <li key={r.file} data-tone={r.wifi}>
            <span className={u.dot} aria-hidden="true" />
            <span className={u.resMain}>
              <b>
                {r.user || r.robot}
                {r.robotId && <span> · 로봇 ID {r.robotId}</span>}
              </b>
              <small>
                {r.wifi === 'ok' ? '연결 성공' : r.wifi === 'fail' ? '연결 실패' : 'Wi-Fi 그대로'}
                {r.message ? ` — ${r.message}` : ''}
              </small>
              <small className={u.resMeta}>{[r.addrs.map((x) => (x.kind ? `${x.kind} ${x.ip}` : x.ip)).join(' · '), r.update ? `업데이트: ${r.update}` : r.version ? `버전 ${kitDate(r.version.split('→').pop()?.trim()) || r.version}` : '', r.when, r.user ? r.robot : ''].filter(Boolean).join(' · ')}</small>
            </span>
            {r.ips[0] && r.wifi !== 'fail' && (
              <button type="button" className={u.secondary} onClick={() => onConnect(`${r.ips[0]}:${ROBOT_PORT}`, r.robotId)}>
                연결
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
