'use client';

/**
 * 새 로봇 설치 (desktop program only, engine/simulator/robotSetup.ts): the first time for a robot,
 * with no monitor or keyboard on it. Write the Wi-Fi it should join, join it to this PC with one LAN
 * cable, one button: the program finds it at its factory address, logs in with the factory account,
 * copies the robot kit, runs the installer and shows how it went (robot ID, address) with [연결].
 * When that cannot work (an account changed, no LAN port), the monitor-and-keyboard way is folded
 * at the bottom, as on the kit's memo.
 */

import { useCallback, useEffect, useState } from 'react';

import { checkWifi, DIRECT_IP, formatBytes, INSTALL_LINE, kitDate, parseResult, pcWifi, WIFI_OFF, type WifiForm } from '@/engine/simulator/usbKit';
import { SETUP_STEPS, setupLine, setupRunning, setupState, setupStep, startSetup, type SetupJob, type SetupLogin } from '@/engine/simulator/robotSetup';
import { ROBOT_PORT } from '@/engine/simulator/discover';

import Icon from '../Icon';
import css from '../console.module.css';
import u from './usbMaker.module.css';
import s from './robotSetup.module.css';

interface Props {
  onClose(): void;
  /** [이 로봇에 연결]: the connect dialog's checks, then this robot (address with port). */
  onConnect(address: string, label: string): void;
}

export default function RobotSetup({ onClose, onConnect }: Props) {
  const [kit, setKit] = useState<{ version: string; size: number } | null | undefined>(undefined);
  const [form, setForm] = useState<WifiForm>({ ssid: '', password: '', label: '' });
  const [touched, setTouched] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [login, setLogin] = useState<SetupLogin>({ host: '', user: '', password: '' });
  const [job, setJob] = useState<SetupJob | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // The program's kit, a setup already going (the window was closed), and this PC's Wi-Fi for the form.
  useEffect(() => {
    let live = true;
    void setupState()
      .then((st) => {
        if (!live) return;
        setKit(st.kit);
        if (setupRunning(st.job)) setJob(st.job);
      })
      .catch((e: Error) => live && (setKit(null), setError(e.message)));
    void pcWifi()
      .then((w) => live && w.ssid && setForm((f) => (f.ssid ? f : { ...f, ssid: w.ssid, password: w.password })))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // While it goes: how far, every 0.7 s.
  const running = setupRunning(job);
  const poll = useCallback(async () => {
    try {
      const st = await setupState();
      if (st.job) setJob(st.job);
    } catch {
      /* the program is busy: next time */
    }
  }, []);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void poll(), 700);
    return () => window.clearInterval(t);
  }, [running, poll]);

  const wired = form.ssid === WIFI_OFF;
  const edit = (k: keyof WifiForm, v: string) => {
    setTouched(true);
    setForm((f) => ({ ...f, [k]: v }));
  };
  const problem = checkWifi(form);
  const start = async () => {
    if (problem || running || !kit) return;
    setError('');
    try {
      const typed = login.user.trim() || login.host.trim() ? login : undefined;
      const r = await startSetup(form, typed);
      setJob(r.job);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const copy = () => {
    void navigator.clipboard?.writeText(INSTALL_LINE).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  const step = setupStep(job);
  // An error: the stage it stopped at in red, the ones before it done.
  const badAt = job?.state === 'error' ? lastStage(job) : -1;
  const reached = badAt >= 0 ? badAt : step;
  const ended = job && !running;
  const result = job?.result ? parseResult('result.txt', job.result) : null;
  // After the install the robot always keeps its fixed direct address on the LAN port (the cable is still in).
  const robotAddr = result?.wifi === 'ok' && result.ips[0] ? result.ips[0] : DIRECT_IP;

  return (
    <div className={css.picker} role="dialog" aria-modal="true" aria-label="새 로봇 설치" onKeyDown={(e) => e.key === 'Escape' && !running && onClose()}>
      <div className={`${css.pickerBox} ${u.box}`}>
        <header className={css.pickerHead}>
          <span className={u.headIcon}>
            <Icon name="install" size={24} />
          </span>
          <div>
            <h1>새 로봇 설치 (처음 한 번)</h1>
            <p>랜선 하나로 PC 와 로봇을 이으면, 이 프로그램이 로봇에 설치하고 Wi-Fi 까지 맞춰요. 모니터 · 키보드는 필요 없어요.</p>
          </div>
          <button type="button" className={css.pickerClose} onClick={onClose} disabled={running} aria-label="닫기">
            ×
          </button>
        </header>

        {kit === null && <p className={u.error}>{error || '이 프로그램에는 로봇 키트가 들어 있지 않아요. 키트가 든 새 프로그램을 받아 주세요.'}</p>}

        {!job && (
          <>
            <section className={u.step} aria-label="로봇이 붙을 Wi-Fi">
              <h2>
                <b>1</b> 로봇이 붙을 Wi-Fi
              </h2>
              <div className={u.ways} role="radiogroup" aria-label="연결 방법">
                {(
                  [
                    ['wifi', '교실 Wi-Fi', '설치 뒤 공유기 Wi-Fi 에 붙어요'],
                    ['off', '랜선만 (Wi-Fi 끔)', '늘 랜선 직결로 써요'],
                  ] as const
                ).map(([id, name, sub]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={(id === 'off') === wired}
                    onClick={() => {
                      setTouched(true);
                      setForm((f) => ({ ...f, ssid: id === 'off' ? WIFI_OFF : '', password: '' }));
                    }}
                  >
                    <b>{name}</b>
                    <small>{sub}</small>
                  </button>
                ))}
              </div>
              <div className={u.form}>
                {!wired && (
                  <>
                    <label>
                      <span>Wi-Fi 이름</span>
                      <input value={form.ssid} onChange={(e) => edit('ssid', e.target.value)} placeholder="예: EDUINO-LAB" spellCheck={false} autoComplete="off" />
                    </label>
                    <label>
                      <span>비밀번호</span>
                      <span className={u.pass}>
                        <input type={showPass ? 'text' : 'password'} value={form.password} onChange={(e) => edit('password', e.target.value)} placeholder="비밀번호가 없으면 비워 두기" spellCheck={false} autoComplete="off" />
                        <button type="button" onClick={() => setShowPass((v) => !v)} aria-pressed={showPass}>
                          {showPass ? '숨기기' : '보기'}
                        </button>
                      </span>
                    </label>
                  </>
                )}
                <label>
                  <span>
                    로봇 이름 <i>(선택)</i>
                  </span>
                  <input value={form.label} onChange={(e) => edit('label', e.target.value)} placeholder="예: 3조 · 로봇 찾기 목록에 보일 이름" maxLength={24} />
                </label>
              </div>
              <p className={u.note}>
                {wired
                  ? `로봇의 Wi-Fi 를 꺼요. 수업 때도 랜선으로 PC 와 이어 [랜선 직결] 로 연결해요 (로봇 ${DIRECT_IP}).`
                  : !touched && form.ssid
                    ? '이 PC 가 연결된 Wi-Fi 를 넣었어요. 로봇과 학생 PC 는 같은 Wi-Fi 여야 해요.'
                    : '로봇과 학생 PC 는 같은 Wi-Fi 여야 해요. 이름은 대소문자 · 띄어쓰기까지 똑같이.'}
              </p>
            </section>

            <section className={u.step} aria-label="랜선으로 잇기">
              <h2>
                <b>2</b> 랜선으로 잇기
              </h2>
              <ol className={s.plain}>
                <li>
                  로봇 전원을 켜고 <b>1분</b> 기다려요.
                </li>
                <li>
                  <b>PC 의 랜 포트 ↔ 로봇의 LAN 포트</b> 를 랜선 하나로 바로 이어요. 공유기 · 벽 랜선은 빼요.
                </li>
                <li>랜 포트가 없는 노트북은 USB 랜 어댑터를 써요.</li>
              </ol>
            </section>

            <details className={s.fold}>
              <summary>로봇 계정을 바꿨다면 (보통은 그대로)</summary>
              <p className={u.note}>비워 두면 공장 계정(sunrise / sunrise)으로 로봇 192.168.127.10 에 접속해요.</p>
              <div className={u.form}>
                <label>
                  <span>로봇 주소</span>
                  <input value={login.host} onChange={(e) => setLogin((l) => ({ ...l, host: e.target.value }))} placeholder="192.168.127.10" spellCheck={false} inputMode="decimal" />
                </label>
                <label>
                  <span>계정</span>
                  <input value={login.user} onChange={(e) => setLogin((l) => ({ ...l, user: e.target.value }))} placeholder="sunrise" spellCheck={false} autoComplete="off" />
                </label>
                <label>
                  <span>비밀번호</span>
                  <input type="password" value={login.password} onChange={(e) => setLogin((l) => ({ ...l, password: e.target.value }))} spellCheck={false} autoComplete="off" />
                </label>
              </div>
            </details>

            {error && <p className={u.error}>{error}</p>}
            {form.ssid && problem && <p className={u.error}>{problem}</p>}
            <div className={u.makeRow}>
              <button type="button" className={u.primary} onClick={() => void start()} disabled={!kit || !!problem}>
                설치 시작
              </button>
              <small>{kit ? `로봇 키트 ${kitDate(kit.version)} · ${formatBytes(kit.size)} · 3~5분` : ''}</small>
            </div>
          </>
        )}

        {job && (
          <section className={u.step} aria-label="설치 진행">
            <ol className={s.stages}>
              {SETUP_STEPS.map((name, i) => (
                <li key={name} data-state={i === badAt ? 'bad' : i < reached ? 'done' : i === step ? 'now' : 'wait'}>
                  <span>{i < reached ? <Icon name="check" size={14} /> : i + 1}</span>
                  {name}
                </li>
              ))}
            </ol>
            {!ended && (
              <p className={job.state === 'error' ? u.error : s.line} aria-live="polite">
                {setupLine(job)}
              </p>
            )}
            {job.state === 'error' && <p className={u.error}>{setupLine(job)}</p>}
            {job.state === 'upload' && (
              <div className={u.bar} role="progressbar" aria-valuenow={job.total ? Math.round((job.done / job.total) * 100) : 0} aria-valuemin={0} aria-valuemax={100} aria-label="키트 보내는 중">
                <i style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }} />
                <span>랜선을 빼지 마세요.</span>
              </div>
            )}
            {job.log.length > 0 && (
              <details className={s.fold}>
                <summary>로봇 화면 기록 보기</summary>
                <pre className={s.log}>{job.log.slice(-14).join('\n')}</pre>
              </details>
            )}
          </section>
        )}

        {ended && job.state !== 'error' && (
          <section className={u.done} aria-label="설치를 마쳤어요">
            <h2>
              <Icon name="check" size={20} /> 로봇 설치를 마쳤어요
              {job.board && <small> · {job.board}</small>}
            </h2>
            {result && (
              <p className={s.result}>
                {result.user || result.robot}
                {result.robotId && ` · 로봇 ID ${result.robotId}`} · {result.wifi === 'ok' ? 'Wi-Fi 연결 성공' : result.wifi === 'fail' ? `Wi-Fi 연결 실패 — ${result.message}` : result.message}
                {result.addrs.length > 0 && <small>{result.addrs.map((x) => (x.kind ? `${x.kind} ${x.ip}` : x.ip)).join(' · ')}</small>}
              </p>
            )}
            {job.state === 'moved' ? (
              <p className={u.note}>
                로봇이 &apos;{job.ssid}&apos; 로 옮겨 가 이 연결이 끊겼어요. PC 도 &apos;{job.ssid}&apos; 에 연결한 뒤 [로봇 연결] 에서 찾으세요.
              </p>
            ) : (
              <p className={u.note}>이제 랜선을 빼도 돼요. 다음부터는 로봇을 켜기만 하면 {wired || result?.wifi !== 'ok' ? '랜선 직결로' : `'${job.ssid}' 에서`} 찾을 수 있어요.</p>
            )}
            <div className={s.row}>
              <button type="button" className={u.primary} onClick={() => onConnect(job.state === 'moved' ? '' : `${robotAddr}:${ROBOT_PORT}`, result?.robotId || result?.user || '새 로봇')}>
                {job.state === 'moved' ? '로봇 연결 열기' : '이 로봇에 연결'}
              </button>
              <button type="button" className={u.secondary} onClick={() => (setJob(null), setError(''))}>
                다른 로봇 설치
              </button>
            </div>
          </section>
        )}

        {job?.state === 'error' && (
          <div className={s.row}>
            <button type="button" className={u.primary} onClick={() => (setJob(null), setError(''))}>
              다시 하기
            </button>
          </div>
        )}

        <details className={s.fold}>
          <summary>그래도 안 되면: 모니터 · 키보드로 설치하기</summary>
          <ol className={s.plain}>
            <li>⚙ → [로봇 USB 만들기] 로 USB 를 만들어 로봇에 꽂아요.</li>
            <li>로봇에 모니터 · 키보드 · 마우스를 꽂고 전원을 켜요 (로그인: sunrise / sunrise).</li>
            <li>터미널을 열고(Ctrl + Alt + T) 아래 한 줄을 붙여 넣고 Enter. 비밀번호를 물으면 sunrise + Enter (글자가 안 보여도 정상).</li>
          </ol>
          <span className={u.cmd}>
            <code>{INSTALL_LINE}</code>
            <button type="button" onClick={copy}>
              {copied ? '복사했어요' : '복사'}
            </button>
          </span>
          <p className={u.note}>같은 순서가 USB 의 eduino 폴더 「처음 설치 (모니터로).txt」 에도 있어요.</p>
        </details>
      </div>
    </div>
  );
}

/** Which stage the error came at (0 find … 3 install), from what the job had reached. */
function lastStage(j: SetupJob): number {
  if (j.log.length) return 3;
  if (j.done > 0) return 2;
  if (j.user) return 2;
  if (j.host) return 1;
  return 0;
}
