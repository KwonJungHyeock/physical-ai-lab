'use client';

/**
 * 라이브러리: everything the simulator can open, as a gallery — the practices, the seven acceptance
 * checks, the practice environments (실습 환경), the robot models and the tools. Every card has a short
 * moving picture of it in the simulator (public/library/<kind>-<id>.gif, recorded from the app by
 * tools/build/library-gifs.mjs) and one line of what it opens. Picking one opens it in the simulator.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { THEMES, type Theme } from '@/engine/simulator/board';
import { SCENES, type SceneId } from '@/engine/simulator/desk';
import { EFFECTORS, type Effector, type EffectorId } from '@/engine/simulator/effectors';
import { loadEvidence, realMissing, type Evidence } from '@/engine/simulator/evidence';
import { CATEGORIES, CHECKS, checkState, markKey, openCheck, type ConsoleMode, type Progress, type Where } from '@/engine/simulator/modules';
import { LEVELS, practiceFor, practicesFor, type Level, type Practice, type PracticeId } from '@/engine/simulator/practices';
import { MODELS, type RobotModelId } from '@/engine/robot/catalog';

import Icon from '../Icon';
import PageShell, { type PageSection } from './PageShell';
import css from './pages.module.css';

export type LibrarySection = 'all' | 'tasks' | 'checks' | 'scenes' | 'models' | 'tools';
type Kind = 'practice' | 'check' | 'scene' | 'model' | 'tool';

/** The card's moving picture: public/library/<kind>-<id>.gif (tools/build/library-gifs.mjs). */
export const libraryGif = (kind: Kind, id: string) => `/library/${kind}-${id}.gif`;

const LEVEL_SHORT: Record<Level, string> = { basic: '블록', python: 'Python', ros: 'ROS 2' };
const THEME_SHORT: Record<Theme, string> = { kit: 'AI 키트', arm: '매트' };
/** What each environment is for: the practices it suits. */
const SCENE_USE: Record<SceneId, string> = {
  empty: '기본 조작 · 관절 · 좌표 연습',
  lab: '집기 · 옮기기 · 분류',
  factory: '비전 · 검사 · 분류',
  logistics: '쌓기 · 팔레타이징',
  home: '생활 속 집기 과제',
  kit: '검수 시연 · 카메라 · 분류함',
};
const TOOL_USE: Record<Effector['kind'], string> = {
  grip: '손가락으로 블록을 집어 옮겨요',
  suction: '공기로 빨아들여 평평한 물건을 옮겨요',
  pen: '펜을 끼워 종이에 선과 그림을 그려요',
  press: '실린더 끝으로 버튼을 눌러요',
  hold: '휴대폰을 끼워 촬영 · 화상 시연에 써요',
  none: '도구를 뺀 끝 플랜지만으로 움직여요',
};
const STATE_LABEL = ['아직', '시뮬레이션 완료', '실제 로봇 완료'];
const KIND_ICON: Record<Kind, string> = { practice: 'flag', check: 'check', scene: 'scene', model: 'robot', tool: 'tool' };

interface Props {
  section: LibrarySection;
  onSection(s: LibrarySection): void;
  mode: ConsoleMode;
  level: Level;
  theme: Theme;
  practiceId: PracticeId;
  progress: Progress;
  /** Open a practice (mode 'learn') or a check (mode 'check') in the simulator. */
  onOpen(mode: ConsoleMode, where: Where): void;
  /** Beside the checks: the readiness check and the result sheet. */
  checkActions: ReactNode;
  /** The acceptance checks are shown (the teacher turned the 검수 시연 on); hidden from students. */
  showChecks: boolean;
  /** The other robot models are offered (MODEL_CHOICE); hidden while the course is 280 RDK X5 only. */
  showModels: boolean;
  model: RobotModelId | null;
  onModel(id: RobotModelId): void;
  scene: SceneId;
  kitAvailable: boolean;
  onScene(id: SceneId): void;
  effector: EffectorId;
  tools: readonly EffectorId[];
  onTool(id: EffectorId): void;
  busy: boolean;
}

interface CardProps {
  kind: Kind;
  id: string;
  title: string;
  desc: string;
  /** Small labels under the description. */
  tags?: (string | false | undefined)[];
  /** Top-left label over the picture. */
  badge?: string;
  /** 0 not yet, 1 done in the simulator, 2 done on the robot. */
  state?: 0 | 1 | 2;
  current?: boolean;
  disabled?: boolean;
  onOpen(): void;
}

function Card({ kind, id, title, desc, tags, badge, state, current, disabled, onOpen }: CardProps) {
  // 'loading' shows a shimmer until the GIF is in; 'missing' (not recorded yet) the kind's icon.
  const [media, setMedia] = useState<'loading' | 'ready' | 'missing'>('loading');
  return (
    <button type="button" className={css.card} data-lib={`${kind}-${id}`} aria-current={current ? 'true' : undefined} disabled={disabled} onClick={onOpen} title={desc}>
      <span className={css.cardMedia} data-media={media}>
        {media === 'missing' && <Icon name={KIND_ICON[kind]} size={30} />}
        {/* eslint-disable-next-line @next/next/no-img-element -- recorded GIFs, also in the static export */}
        <img
          src={libraryGif(kind, id)}
          alt=""
          width={320}
          height={200}
          loading="lazy"
          decoding="async"
          ref={(el) => {
            if (el?.complete && el.naturalWidth && media === 'loading') setMedia('ready');
          }}
          onLoad={() => setMedia('ready')}
          onError={() => setMedia('missing')}
        />
        {badge && <i className={css.cardBadge}>{badge}</i>}
        {current && <i className={css.cardNow}>지금</i>}
      </span>
      <span className={css.cardBody}>
        <span className={css.cardTitle}>
          <b>{title}</b>
          {state !== undefined && <i className={css.cardState} data-state={state} title={STATE_LABEL[state]} />}
        </span>
        <small>{desc}</small>
        {tags && (
          <span className={css.cardTags}>
            {tags.filter(Boolean).map((t) => (
              <em key={t as string}>{t}</em>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

/** Every practice once (any language or environment), opened where it fits the open one best. */
function practiceEntries(level: Level, theme: Theme) {
  const order: [Level, Theme][] = [[level, theme], ...THEMES.map((t): [Level, Theme] => [level, t.id]), ...LEVELS.flatMap((l) => THEMES.map((t): [Level, Theme] => [l.id, t.id]))];
  const found = new Map<PracticeId, { p: Practice; where: Where; levels: Set<Level>; themes: Set<Theme> }>();
  for (const [lv, th] of order) {
    for (const p of practicesFor(lv, th)) {
      const e = found.get(p.id) ?? { p, where: { level: lv, theme: th, id: p.id }, levels: new Set<Level>(), themes: new Set<Theme>() };
      e.levels.add(lv);
      e.themes.add(th);
      found.set(p.id, e);
    }
  }
  const ids = CATEGORIES.flatMap((c) => c.ids.map((id) => ({ id, cat: c.name })));
  return ids.flatMap(({ id, cat }) => {
    const e = found.get(id);
    return e ? [{ ...e, cat }] : [];
  });
}

export default function Library(p: Props) {
  const practices = practiceEntries(p.level, p.theme);
  const scenes = SCENES.filter((s) => s.id !== 'kit' || p.kitAvailable);
  const tools = EFFECTORS.filter((e) => p.tools.includes(e.id)).sort((a, b) => Number(b.kind === 'none') - Number(a.kind === 'none'));
  const models = MODELS.filter((m) => m.status !== 'planned');
  // The 검수 record (the result sheet's lines) is shared with 로봇 실습 7 on the 교육 tab: a check
  // shown there counts here too.
  const [evidence, setEvidence] = useState<readonly Evidence[]>([]);
  useEffect(() => {
    // Read after mount (the page is a static export).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvidence(loadEvidence());
  }, []);
  const stateOf = (check: number): 0 | 1 | 2 => {
    const lines = evidence.filter((e) => e.check === check);
    const robotLines = lines.filter((e) => e.robot).map((e) => e.text);
    const fromRecord = robotLines.length && realMissing(check, robotLines) === null ? 2 : lines.length ? 1 : 0;
    return Math.max(checkState(p.progress, check), fromRecord) as 0 | 1 | 2;
  };
  const checksDone = CHECKS.filter((c) => stateOf(c.check) > 0).length;
  const current = p.practiceId;

  const groups: { id: Exclude<LibrarySection, 'all'>; name: string; icon: string; sub: string; aside?: ReactNode; cards: ReactNode[] }[] = [
    {
      id: 'tasks',
      name: '실습 과제',
      icon: 'flag',
      sub: '고르면 맞는 언어 탭과 실습 환경이 함께 열려요. 필요한 도구는 [끼우기]로 알려 줘요.',
      cards: practices.map(({ p: pr, where, levels, themes, cat }) => {
        const m = p.progress[markKey(where)];
        return (
          <Card
            key={pr.id}
            kind="practice"
            id={pr.id}
            title={pr.title}
            desc={pr.goal}
            badge={cat}
            tags={[...LEVELS.filter((l) => levels.has(l.id)).map((l) => LEVEL_SHORT[l.id]), ...THEMES.filter((t) => themes.has(t.id)).map((t) => THEME_SHORT[t.id])]}
            state={m?.robot ? 2 : m?.sim ? 1 : 0}
            current={p.mode === 'learn' && current === pr.id}
            disabled={p.busy}
            onOpen={() => p.onOpen('learn', where)}
          />
        );
      }),
    },
    {
      id: 'checks',
      name: '검수 시연',
      icon: 'check',
      sub: `납품 검수 7종을 하나씩 열어 시연해요 · ${checksDone}/7 완료`,
      aside: p.checkActions,
      cards: CHECKS.map((c) => {
        const where = openCheck(c.check, p.level, p.theme);
        const pr = where && practiceFor(where.level, where.theme, where.id);
        return (
          <Card
            key={c.check}
            kind="check"
            id={String(c.check)}
            title={c.title}
            desc={pr?.goal ?? c.spec}
            badge={`검수 ${c.check}`}
            tags={[c.spec]}
            state={stateOf(c.check)}
            current={p.mode === 'check' && pr?.id === current}
            disabled={p.busy || !where}
            onOpen={() => where && p.onOpen('check', where)}
          />
        );
      }),
    },
    {
      id: 'scenes',
      name: '실습 환경',
      icon: 'scene',
      sub: '같은 로봇을 다른 현장에 놓아 봐요. 고르면 시뮬레이터에 바로 놓여요.',
      cards: scenes.map((s) => (
        <Card key={s.id} kind="scene" id={s.id} title={s.name} desc={s.note} tags={[SCENE_USE[s.id]]} current={p.scene === s.id} disabled={p.busy} onOpen={() => p.onScene(s.id)} />
      )),
    },
    {
      id: 'models',
      name: '로봇 모델',
      icon: 'robot',
      sub: '누르면 그 로봇의 3D 모델 · 관절 범위 · 실습이 열려요.',
      cards: models.map((m) => (
        <Card
          key={m.id}
          kind="model"
          id={m.id}
          title={m.name}
          desc={m.summary}
          badge={m.status === 'ready' ? m.board || undefined : '다음 순서'}
          tags={[m.kind === 'agv' ? '이동 로봇' : '로봇팔', m.link !== 'sim' ? '실물 연결' : '시뮬레이션']}
          current={p.model === m.id}
          disabled={p.busy || m.status !== 'ready'}
          onOpen={() => p.onModel(m.id)}
        />
      )),
    },
    {
      id: 'tools',
      name: '도구 · 액세서리',
      icon: 'tool',
      sub: '끝에 달 도구를 골라요. 고르면 시뮬레이터에서 바로 바뀌어요.',
      cards: tools.map((e) => (
        <Card
          key={e.id}
          kind="tool"
          id={e.id}
          title={e.name}
          desc={TOOL_USE[e.kind]}
          tags={[e.gapMm && `벌림 ${e.gapMm.open}mm`, e.kind !== 'none' && `길이 ${e.tcpMm}mm`, e.official && e.kind !== 'none' && '공식 구성품']}
          current={p.effector === e.id}
          disabled={p.busy}
          onOpen={() => p.onTool(e.id)}
        />
      )),
    },
  ];

  const shownGroups = groups.filter((g) => (g.id !== 'checks' || p.showChecks) && (g.id !== 'models' || p.showModels));
  const total = shownGroups.reduce((n, g) => n + g.cards.length, 0);
  const sections: PageSection<LibrarySection>[] = [{ id: 'all', name: '전체', icon: 'grid', count: total }, ...shownGroups.map((g) => ({ id: g.id, name: g.name, icon: g.icon, count: g.cards.length }))];
  const open = shownGroups.find((g) => g.id === p.section);
  return (
    <PageShell
      label="LIBRARY"
      sections={sections}
      current={p.section}
      onSection={p.onSection}
      title={open?.name ?? '라이브러리'}
      sub={open?.sub ?? '시뮬레이터에서 여는 모든 것이에요. 카드를 누르면 시뮬레이터에 바로 열려요.'}
      help="시뮬레이터 안에서 여는 것들이에요. 내려받는 자료는 자료실에 있어요."
      aside={open?.aside}
    >
      {open ? (
        <div className={css.cards}>{open.cards}</div>
      ) : (
        shownGroups.map((g) => (
          <section key={g.id} className={css.group} aria-label={g.name}>
            <header className={css.groupHead}>
              <h2>
                {g.name}
                <small>{g.cards.length}</small>
              </h2>
              <p>{g.sub}</p>
              {g.aside}
              <button type="button" className={css.groupMore} onClick={() => p.onSection(g.id)}>
                {g.name}만 보기 →
              </button>
            </header>
            <div className={css.cards}>{g.cards}</div>
          </section>
        ))
      )}
    </PageShell>
  );
}
