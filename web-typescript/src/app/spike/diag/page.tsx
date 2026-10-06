'use client';

/**
 * /spike/diag — environment diagnostics for Web Serial.
 *
 * Schools often hand out managed PCs where the Web Serial API is missing or
 * switched off by policy. This page reports exactly which precondition failed
 * and what to do about it, so a teacher can triage without developer tools.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Verdict = 'pass' | 'fail' | 'warn' | 'unknown';

interface Check {
  id: string;
  label: string;
  verdict: Verdict;
  detail: string;
  remedy?: string;
}

interface Report {
  checks: Check[];
  userAgent: string;
  platform: string;
  origin: string;
}

const VERDICT_STYLE: Record<Verdict, string> = {
  pass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  fail: 'bg-red-500/15 text-red-300 border-red-500/40',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  unknown: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/40',
};

const VERDICT_LABEL: Record<Verdict, string> = {
  pass: 'OK',
  fail: '불가',
  warn: '주의',
  unknown: '확인 불가',
};

/** Rough engine/OS identification from the UA string, for the report only. */
function describeBrowser(ua: string): { name: string; chromiumLike: boolean } {
  if (/Edg\//.test(ua)) return { name: 'Microsoft Edge (Chromium)', chromiumLike: true };
  if (/OPR\//.test(ua)) return { name: 'Opera (Chromium)', chromiumLike: true };
  if (/Whale\//.test(ua)) return { name: 'Naver Whale (Chromium)', chromiumLike: true };
  if (/Firefox\//.test(ua)) return { name: 'Mozilla Firefox', chromiumLike: false };
  if (/Chrome\//.test(ua)) return { name: 'Google Chrome', chromiumLike: true };
  if (/Safari\//.test(ua)) return { name: 'Apple Safari', chromiumLike: false };
  return { name: '알 수 없음', chromiumLike: false };
}

function describeOs(ua: string): string {
  if (/Windows NT 10\.0/.test(ua)) return 'Windows 10 / 11';
  if (/Windows/.test(ua)) return 'Windows (구버전)';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Android/.test(ua)) return 'Android';
  if (/(iPhone|iPad|iPod)/.test(ua)) return 'iOS / iPadOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '알 수 없음';
}

async function buildReport(): Promise<Report> {
  const ua = navigator.userAgent;
  const browser = describeBrowser(ua);
  const os = describeOs(ua);
  const checks: Check[] = [];

  // 1. Secure context. Web Serial is gated on it.
  const secure = window.isSecureContext;
  checks.push({
    id: 'secure-context',
    label: 'Secure context (HTTPS 또는 localhost)',
    verdict: secure ? 'pass' : 'fail',
    detail: secure
      ? `${window.location.origin} 은(는) secure context 입니다.`
      : `${window.location.origin} 은(는) secure context 가 아닙니다.`,
    remedy: secure
      ? undefined
      : 'Web Serial 은 HTTPS 또는 http://localhost 에서만 동작합니다. 배포 주소를 https 로 접속하세요.',
  });

  // 2. The API itself. Test the property value, not just its presence: a
  // policy-blocked Chromium can expose `serial` as undefined rather than
  // dropping the key, and `'serial' in navigator` would still report true.
  const hasSerial = typeof navigator !== 'undefined' && !!navigator.serial;
  checks.push({
    id: 'api',
    label: 'navigator.serial 존재 여부',
    verdict: hasSerial ? 'pass' : 'fail',
    detail: hasSerial
      ? 'Web Serial API 를 사용할 수 있습니다.'
      : 'navigator.serial 이 없습니다.',
    remedy: hasSerial
      ? undefined
      : browser.chromiumLike
        ? '브라우저는 지원 계열이지만 API 가 보이지 않습니다. 학교 관리 PC 의 정책(WebSerialBlockedForUrls / DefaultWebSerialGuardSetting)으로 차단된 경우가 많습니다. 브라우저 주소창에 chrome://policy 를 열어 관련 정책을 확인하고, 관리자에게 해제를 요청하세요.'
        : 'Web Serial 은 Chromium 계열(Chrome, Edge, Whale, Opera) 데스크톱 브라우저에서만 지원됩니다. Firefox / Safari / 모바일 브라우저는 지원하지 않습니다. Chrome 또는 Edge 로 접속하세요.',
  });

  // 3. Browser family.
  checks.push({
    id: 'browser',
    label: '브라우저',
    verdict: browser.chromiumLike ? 'pass' : 'fail',
    detail: browser.name,
    remedy: browser.chromiumLike
      ? undefined
      : 'Chrome 또는 Edge 최신 버전을 사용하세요.',
  });

  // 4. OS. Web Serial ships on desktop only.
  const desktop = ['Windows 10 / 11', 'macOS', 'ChromeOS', 'Linux'].includes(os);
  checks.push({
    id: 'os',
    label: '운영체제',
    verdict: desktop ? 'pass' : os === 'Windows (구버전)' ? 'warn' : 'fail',
    detail: os,
    remedy: desktop
      ? undefined
      : 'Web Serial 은 데스크톱 OS 에서만 지원됩니다. Android/iOS 태블릿에서는 사용할 수 없습니다.',
  });

  // 5. Ports already granted. Reveals whether a device was ever authorised.
  if (hasSerial && navigator.serial) {
    try {
      const ports = await navigator.serial.getPorts();
      checks.push({
        id: 'granted-ports',
        label: '이미 권한이 부여된 포트',
        verdict: ports.length > 0 ? 'pass' : 'warn',
        detail:
          ports.length > 0
            ? `${ports.length}개 — ${ports
                .map((p) => {
                  const info = p.getInfo();
                  return info.usbVendorId !== undefined
                    ? `VID:PID ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId ?? 0).toString(16).padStart(4, '0')}`
                    : '알 수 없는 장치';
                })
                .join(', ')}`
            : '없음 (아직 포트를 선택한 적이 없습니다)',
        remedy:
          ports.length > 0
            ? undefined
            : '정상입니다. /spike/serial 에서 [연결] 을 눌러 포트를 선택하면 권한이 부여됩니다.',
      });
    } catch (err) {
      checks.push({
        id: 'granted-ports',
        label: '이미 권한이 부여된 포트',
        verdict: 'unknown',
        detail: `조회 실패: ${(err as Error).message}`,
      });
    }
  }

  // 6. Permissions Policy can disable the API inside an iframe.
  const inFrame = window.self !== window.top;
  checks.push({
    id: 'frame',
    label: '최상위 문서 여부',
    verdict: inFrame ? 'warn' : 'pass',
    detail: inFrame ? 'iframe 안에서 실행 중입니다.' : '최상위 문서에서 실행 중입니다.',
    remedy: inFrame
      ? 'iframe 은 Permissions Policy(serial) 로 차단될 수 있습니다. 새 탭에서 직접 열어 확인하세요.'
      : undefined,
  });

  return {
    checks,
    userAgent: ua,
    platform: `${os} / ${browser.name}`,
    origin: window.location.origin,
  };
}

export default function DiagPage() {
  const [report, setReport] = useState<Report | null>(null);

  // Runs after mount so server and first client render agree.
  useEffect(() => {
    void buildReport().then(setReport);
  }, []);

  const blocking = report?.checks.filter((c) => c.verdict === 'fail') ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-neutral-400 underline hover:text-neutral-200">
          ← 홈
        </Link>
        <span className="mx-2 text-neutral-600">/</span>
        <Link href="/spike/serial" className="text-neutral-400 underline hover:text-neutral-200">
          Web Serial 브리지
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold">환경 진단</h1>
      <p className="mt-2 text-sm text-neutral-400">
        이 PC 에서 myCobot 280 AR 을 브라우저로 제어할 수 있는지 확인합니다.
      </p>

      {report === null ? (
        <p className="mt-8 text-sm text-neutral-500">진단 중…</p>
      ) : (
        <>
          <div
            className={`mt-8 rounded-lg border px-4 py-3 text-sm ${
              blocking.length === 0
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            {blocking.length === 0
              ? '이 환경에서 Web Serial 을 사용할 수 있습니다.'
              : `사용 불가 — ${blocking.length}개 항목이 조건을 만족하지 않습니다. 아래 대응 방법을 확인하세요.`}
          </div>

          <ul className="mt-6 space-y-3">
            {report.checks.map((check) => (
              <li
                key={check.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium">{check.label}</span>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-xs ${VERDICT_STYLE[check.verdict]}`}
                  >
                    {VERDICT_LABEL[check.verdict]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-400">{check.detail}</p>
                {check.remedy && (
                  <p className="mt-2 border-l-2 border-neutral-700 pl-3 text-sm text-neutral-300">
                    {check.remedy}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
            <h2 className="text-sm font-medium">USB 시리얼 드라이버</h2>
            <p className="mt-2 text-sm text-neutral-400">
              myCobot 280 AR 의 제어보드는 M5Stack ATOM (ESP32) 입니다. Windows 에서 포트 목록에
              장치가 아예 보이지 않으면 USB-UART 브리지 드라이버가 없는 경우입니다. ATOM 은 생산
              시기에 따라 <span className="font-mono">CP210x</span> 또는{' '}
              <span className="font-mono">CH9102</span> 칩을 사용하므로, 장치관리자에서 확인 후 해당
              드라이버를 설치하세요. macOS 12+ / ChromeOS / 최신 Linux 커널은 기본 내장입니다.
            </p>
          </section>

          <section className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
            <h2 className="text-sm font-medium">원본 정보</h2>
            <dl className="mt-2 space-y-1 font-mono text-xs text-neutral-400">
              <div>
                <dt className="inline text-neutral-500">origin: </dt>
                <dd className="inline break-all">{report.origin}</dd>
              </div>
              <div>
                <dt className="inline text-neutral-500">platform: </dt>
                <dd className="inline break-all">{report.platform}</dd>
              </div>
              <div>
                <dt className="inline text-neutral-500">userAgent: </dt>
                <dd className="inline break-all">{report.userAgent}</dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
