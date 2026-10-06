'use client';

/**
 * Bottom panel of the Python editor (중급 · 고급), like an editor's terminal
 * panel: what the program printed, with the simulated time of each line, and
 * for ROS 2 the node graph and the messages on the topics (as `ros2 node
 * list` / `ros2 topic echo` would show them).
 */

import { useState } from 'react';

import type { PyOutput, PyResult } from '@/engine/python/types';

import css from '../console.module.css';

interface Props {
  level: 'python' | 'ros';
  /** '' when Python is ready; otherwise what it is doing (loading…). */
  status: string;
  output: readonly PyOutput[];
  ros?: PyResult['ros'];
}

type Tab = 'out' | 'graph' | 'echo';

export default function PyPanel({ level, status, output, ros }: Props) {
  const [tab, setTab] = useState<Tab>('out');
  const topics = ros ? [...new Set(ros.graph.nodes.flatMap((n) => [...n.publishes, ...n.subscribes]))] : [];
  const echo = ros ? ros.messages.slice(-40) : [];
  const shown: Tab = level === 'python' ? 'out' : tab;
  const tabs: [Tab, string, number | null][] =
    level === 'ros'
      ? [
          ['out', '출력', output.length],
          ['graph', '노드 · 토픽', topics.length],
          ['echo', '토픽 메시지', ros?.messages.length ?? 0],
        ]
      : [['out', '출력', output.length]];
  return (
    <div className={css.termPanel}>
      <div className={css.termTabs} role="tablist" aria-label="출력">
        {tabs.map(([id, name, n]) => (
          <button key={id} type="button" role="tab" aria-selected={shown === id} onClick={() => setTab(id)}>
            {name}
            {n ? <i>{n}</i> : null}
          </button>
        ))}
        {status && <span className={css.termStatus}>{status}</span>}
      </div>
      <div className={css.termBody}>
        {shown === 'out' &&
          (output.length === 0 ? (
            <p className={css.termEmpty}>print() 로 출력한 내용이 시뮬레이션 시각과 함께 여기에 나와요.</p>
          ) : (
            <pre className={css.termText} aria-live="polite">
              {output.map((o, i) => (
                <span key={i}>
                  <i>{o.t.toFixed(2).padStart(6)}s</i> {o.text}
                  {'\n'}
                </span>
              ))}
            </pre>
          ))}
        {shown === 'graph' &&
          (topics.length === 0 ? (
            <p className={css.termEmpty}>시뮬레이션을 하면 만든 노드와 토픽이 여기에 그려져요.</p>
          ) : (
            <ul className={css.rosGraph}>
              {topics.map((t) => {
                const pubs = ros!.graph.nodes.filter((n) => n.publishes.includes(t)).map((n) => n.name);
                const subs = ros!.graph.nodes.filter((n) => n.subscribes.includes(t)).map((n) => n.name);
                const count = ros!.messages.filter((m) => m.topic === t).length;
                return (
                  <li key={t}>
                    <span className={css.rosNodes}>
                      {pubs.map((n) => (
                        <b key={n} className={css.rosNode}>
                          {n}
                        </b>
                      ))}
                    </span>
                    <span className={css.rosArrow}>→</span>
                    <span className={css.rosTopic}>
                      {t}
                      <small>{count}개</small>
                    </span>
                    <span className={css.rosArrow}>→</span>
                    <span className={css.rosNodes}>
                      {subs.length ? (
                        subs.map((n) => (
                          <b key={n} className={css.rosNode}>
                            {n}
                            {n === 'control_slider' && <small>로봇 드라이버</small>}
                          </b>
                        ))
                      ) : (
                        <span className={css.termEmpty}>받는 노드 없음</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ))}
        {shown === 'echo' &&
          (echo.length === 0 ? (
            <p className={css.termEmpty}>노드가 보낸 메시지가 여기에 나와요.</p>
          ) : (
            <pre className={css.termText} aria-label="토픽 메시지">
              {echo.map((m, i) => (
                <span key={i}>
                  <i>{m.t.toFixed(2).padStart(6)}s</i> <b>{m.topic}</b> {readable(m.type, m.data)}
                  {'\n'}
                </span>
              ))}
            </pre>
          ))}
      </div>
    </div>
  );
}

/** A JointState reads better as joint angles in degrees; other messages are shown as Python printed them. */
function readable(type: string, data: string): string {
  if (!type.endsWith('JointState')) return data;
  const m = data.match(/position=\[([^\]]*)\]/);
  if (!m) return data;
  const deg = m[1]
    .split(',')
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .map((r) => ((r * 180) / Math.PI).toFixed(1));
  return `position (°) [${deg.join(', ')}]`;
}
