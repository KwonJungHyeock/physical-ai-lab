'use client';

/**
 * /spike/twin — digital twin viewer for the myCobot 280.
 *
 * Forward kinematics comes straight from the URDF joint origins; inverse
 * kinematics is numerical (damped least squares). Neither talks to the real
 * robot: syncing hardware to the simulation is deliberately out of scope until
 * the Web Serial spike is confirmed against a physical arm.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';

import {
  buildChain,
  forwardKinematics,
  solveIk,
  type ChainSegment,
  type IkResult,
} from '@/engine/robot/kinematics';
import {
  FLANGE_REACH_MM,
  JOINT_ANGLE_MAX,
  JOINT_ANGLE_MIN,
  JOINT_COUNT,
  JOINT_NAMES,
  REACH_MM,
  SHOULDER_HEIGHT_M,
  clampJointAngle,
} from '@/engine/robot/limits';
import { parseUrdf, type UrdfRobot } from '@/engine/robot/urdf';

// three.js touches browser globals at import time, so the scene never renders
// on the server.
const TwinScene = dynamic(() => import('@/ui/twin/TwinScene'), {
  ssr: false,
  loading: () => <SceneMessage text="3D 뷰어 로딩 중…" />,
});

const URDF_URL = '/robot/mycobot280/mycobot_280_m5.urdf';
const HOME_POSE = [0, 0, 0, 0, 0, 0];

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; robot: UrdfRobot; chain: ChainSegment[] };

export default function TwinPage() {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [anglesDeg, setAnglesDeg] = useState<number[]>(HOME_POSE);
  const [showJointAxes, setShowJointAxes] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(true);
  const [ikEnabled, setIkEnabled] = useState(false);
  const [target, setTarget] = useState(() => new Vector3(0.15, 0.15, 0.2));
  const [ik, setIk] = useState<IkResult | null>(null);

  const startedAt = useRef<number>(0);
  const [urdfMs, setUrdfMs] = useState<number | null>(null);
  const [modelMs, setModelMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    startedAt.current = performance.now();

    void (async () => {
      try {
        const response = await fetch(URDF_URL);
        if (!response.ok) throw new Error(`URDF fetch failed: HTTP ${response.status}`);
        const robot = parseUrdf(await response.text());
        if (cancelled) return;
        if (robot.movableJoints.length !== JOINT_COUNT) {
          throw new Error(
            `URDF declares ${robot.movableJoints.length} movable joints, expected ${JOINT_COUNT}`,
          );
        }
        setUrdfMs(performance.now() - startedAt.current);
        setLoad({ status: 'ready', robot, chain: buildChain(robot) });
      } catch (err) {
        if (!cancelled) setLoad({ status: 'error', message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSceneLoaded = useCallback(() => {
    setModelMs((prev) => prev ?? performance.now() - startedAt.current);
  }, []);

  const chain = load.status === 'ready' ? load.chain : null;

  const pose = useMemo(
    () => (chain ? forwardKinematics(chain, anglesDeg) : null),
    [chain, anglesDeg],
  );

  const onSlider = useCallback((index: number, value: number) => {
    setIkEnabled(false);
    setAnglesDeg((prev) => {
      const next = prev.slice();
      next[index] = clampJointAngle(index, value);
      return next;
    });
  }, []);

  // Re-solve whenever the target moves while IK is engaged. The current pose is
  // the seed, so the arm keeps its configuration and the motion reads as
  // continuous rather than snapping between branches.
  const onTargetChange = useCallback(
    (position: Vector3) => {
      setTarget(position);
      if (!chain || !ikEnabled) return;
      const result = solveIk(chain, position, anglesDeg);
      setIk(result);
      setAnglesDeg(result.anglesDeg);
    },
    [chain, ikEnabled, anglesDeg],
  );

  const solveNow = useCallback(() => {
    if (!chain) return;
    const result = solveIk(chain, target, anglesDeg);
    setIk(result);
    setAnglesDeg(result.anglesDeg);
  }, [chain, target, anglesDeg]);

  const shoulder = useMemo(() => new Vector3(0, 0, SHOULDER_HEIGHT_M), []);
  const targetReachMm = target.distanceTo(shoulder) * 1000;
  const outsideDatasheet = targetReachMm > REACH_MM;
  const beyondFlange = targetReachMm > FLANGE_REACH_MM;
  const belowFloor = target.z < 0;
  const tipBelowFloor = (pose?.position.z ?? 0) < 0;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-6 py-8">
      <nav className="mb-5 text-sm">
        <Link href="/" className="text-neutral-400 underline hover:text-neutral-200">
          ← 홈
        </Link>
        <span className="mx-2 text-neutral-600">/</span>
        <Link href="/spike/serial" className="text-neutral-400 underline hover:text-neutral-200">
          Web Serial 브리지
        </Link>
        <span className="mx-2 text-neutral-600">/</span>
        <Link href="/spike/diag" className="text-neutral-400 underline hover:text-neutral-200">
          환경 진단
        </Link>
      </nav>

      <h1 className="text-2xl font-semibold">디지털 트윈 뷰어</h1>
      <p className="mt-2 text-sm text-neutral-400">
        myCobot 280 (M5) URDF 를 파싱해 링크 계층을 구성하고, 순기구학·역기구학을 계산합니다.
        실기기와는 연결되지 않습니다.
      </p>

      {load.status === 'error' && (
        <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          모델을 불러오지 못했습니다 — {load.message}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Viewport ------------------------------------------------------- */}
        {/* On a wide screen the control column is far taller than a fixed-height
            viewport, which left a large empty gap beside it. The viewport grows
            with the window instead, so the arm gets the space and the row stays
            balanced. */}
        <div className="relative h-[520px] overflow-hidden rounded-lg border border-neutral-800 bg-[#0b0b0d] lg:h-[calc(100vh-9rem)] lg:min-h-[620px]">
          {load.status === 'ready' ? (
            <TwinScene
              robot={load.robot}
              chain={load.chain}
              anglesDeg={anglesDeg}
              showJointAxes={showJointAxes}
              showWorkspace={showWorkspace}
              target={target}
              onTargetChange={onTargetChange}
              targetEnabled={ikEnabled}
              onLoaded={onSceneLoaded}
            />
          ) : load.status === 'loading' ? (
            <SceneMessage text="URDF 파싱 중…" />
          ) : null}

          <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-neutral-400">
            좌클릭 회전 · 휠 줌 · 우클릭 팬
          </div>
        </div>

        {/* Controls ------------------------------------------------------- */}
        <div className="space-y-4">
          <Panel title="표시">
            <div className="space-y-2 text-sm">
              <Toggle checked={showJointAxes} onChange={setShowJointAxes}>
                관절 로컬 좌표축 (TF)
              </Toggle>
              <Toggle checked={showWorkspace} onChange={setShowWorkspace}>
                작업영역 구 (반경 {REACH_MM}mm)
              </Toggle>
            </div>
          </Panel>

          <Panel title="관절각">
            <div className="space-y-2">
              {JOINT_NAMES.map((name, i) => (
                <div key={name} className="grid grid-cols-[2rem_1fr_4rem] items-center gap-2">
                  <span className="font-mono text-xs text-neutral-400">{name}</span>
                  <input
                    type="range"
                    min={JOINT_ANGLE_MIN[i]}
                    max={JOINT_ANGLE_MAX[i]}
                    step={0.5}
                    value={anglesDeg[i]}
                    disabled={!chain}
                    onChange={(e) => onSlider(i, Number(e.target.value))}
                    className="w-full accent-sky-500 disabled:opacity-40"
                  />
                  <span className="text-right font-mono text-xs text-sky-300">
                    {anglesDeg[i].toFixed(1)}°
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <SmallButton
                onClick={() => {
                  setIkEnabled(false);
                  setAnglesDeg(HOME_POSE);
                  setIk(null);
                }}
                disabled={!chain}
              >
                영점 자세
              </SmallButton>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              범위는 SDK·데이터시트·URDF 중 축별로 가장 좁은 값입니다 (src/engine/robot/limits.ts).
            </p>
          </Panel>

          <Panel title="순기구학 (FK)">
            {pose ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
                <Row label="x" value={`${(pose.position.x * 1000).toFixed(1)} mm`} />
                <Row label="roll" value={`${pose.rpyDeg.x.toFixed(1)}°`} />
                <Row label="y" value={`${(pose.position.y * 1000).toFixed(1)} mm`} />
                <Row label="pitch" value={`${pose.rpyDeg.y.toFixed(1)}°`} />
                <Row label="z" value={`${(pose.position.z * 1000).toFixed(1)} mm`} />
                <Row label="yaw" value={`${pose.rpyDeg.z.toFixed(1)}°`} />
              </dl>
            ) : (
              <p className="text-xs text-neutral-500">—</p>
            )}
            <p className="mt-2 text-[11px] text-neutral-500">
              URDF 의 joint origin 을 그대로 누적한 값입니다 (DH 파라미터 미사용). 기준 프레임은
              베이스 하단, 플랜지 기준.
            </p>
            {tipBelowFloor && <Warn tone="red">엔드이펙터가 바닥면 아래입니다 (z &lt; 0).</Warn>}
          </Panel>

          <Panel title="역기구학 (IK)">
            <Toggle checked={ikEnabled} onChange={setIkEnabled}>
              목표점 기즈모로 조작
            </Toggle>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <label key={axis} className="text-xs">
                  <span className="text-neutral-500">{axis} (mm)</span>
                  <input
                    type="number"
                    step={5}
                    value={Math.round(target[axis] * 1000)}
                    onChange={(e) => {
                      const next = target.clone();
                      next[axis] = Number(e.target.value) / 1000;
                      setTarget(next);
                    }}
                    className="mt-0.5 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono text-xs"
                  />
                </label>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <SmallButton onClick={solveNow} disabled={!chain}>
                풀기
              </SmallButton>
            </div>

            <div className="mt-3 space-y-1 font-mono text-xs">
              <Row label="목표 거리" value={`${targetReachMm.toFixed(0)} mm (어깨 기준)`} />
              {ik && (
                <>
                  <Row
                    label="상태"
                    value={ik.converged ? '수렴' : '도달 불가'}
                    tone={ik.converged ? 'ok' : 'bad'}
                  />
                  <Row label="위치 오차" value={`${(ik.positionErrorM * 1000).toFixed(2)} mm`} />
                  <Row label="반복" value={`${ik.iterations}`} />
                  {ik.limitedJoints.length > 0 && (
                    <Row
                      label="한계 도달"
                      value={ik.limitedJoints.map((i) => JOINT_NAMES[i]).join(', ')}
                      tone="warn"
                    />
                  )}
                </>
              )}
            </div>

            {belowFloor && <Warn tone="red">목표점이 바닥면 아래입니다 (z &lt; 0).</Warn>}
            {beyondFlange ? (
              <Warn tone="red">
                목표점이 기구학적 최대 도달거리({FLANGE_REACH_MM}mm) 밖입니다.
              </Warn>
            ) : outsideDatasheet ? (
              <Warn tone="amber">
                데이터시트 작업반경({REACH_MM}mm) 밖입니다. 플랜지는 최대 {FLANGE_REACH_MM}mm 까지
                닿으므로 풀릴 수 있습니다.
              </Warn>
            ) : null}

            <p className="mt-2 text-[11px] text-neutral-500">
              수치해석(Damped Least Squares). myCobot 280 은 구면손목이 아니라 닫힌 해가 안정적이지
              않으므로 해석적 IK 를 쓰지 않습니다. 실패 시 다른 시드로 재시작합니다.
            </p>
          </Panel>

          <Panel title="로딩">
            <dl className="space-y-1 font-mono text-xs">
              <Row label="URDF 파싱" value={urdfMs === null ? '…' : `${urdfMs.toFixed(0)} ms`} />
              <Row
                label="모델(GLB) 표시"
                value={modelMs === null ? '…' : `${modelMs.toFixed(0)} ms`}
              />
            </dl>
            <p className="mt-2 text-[11px] text-neutral-500">
              GLB 238KB (Draco). 원본 Collada 20.1MB 에서 변환. 디코더는 자체 호스팅(/draco/)이라
              외부 CDN 요청이 없습니다.
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}

/* -- small presentational helpers ------------------------------------------ */

function SceneMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
      {text}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-sky-500"
      />
      <span className="text-neutral-300">{children}</span>
    </label>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'bad' | 'warn';
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'bad'
        ? 'text-red-300'
        : tone === 'warn'
          ? 'text-amber-300'
          : 'text-neutral-200';
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={color}>{value}</dd>
    </div>
  );
}

function Warn({ tone, children }: { tone: 'red' | 'amber'; children: React.ReactNode }) {
  const cls =
    tone === 'red'
      ? 'border-red-500/40 bg-red-500/10 text-red-200'
      : 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  return <p className={`mt-3 rounded border px-2.5 py-1.5 text-xs ${cls}`}>{children}</p>;
}
