/**
 * The 자료실's folders, built from what the app already has: the PC programs, the textbooks and question
 * sheets (engine/education/materials.ts → public/materials), the two guides (tools/build/guides.mjs → public/guides)
 * and the acceptance-check sheet. The figure and demonstration GIFs are not offered here (the lessons and the
 * library show them where they are used).
 */

import { CATEGORIES } from '@/engine/education/catalog';
import { MATERIALS, type Material } from '@/engine/education/materials';
import { partOf } from '@/engine/education/roadmap';

export type FileType = 'pdf' | 'gif' | 'html' | 'app' | 'zip' | 'exe';

export const TYPE_LABEL: Record<FileType, string> = {
  pdf: 'PDF 문서',
  gif: 'GIF 애니메이션',
  html: 'HTML 문서',
  app: '앱 설치',
  zip: 'ZIP 압축 파일',
  exe: '실행 파일',
};

/** A thing made by the console when it is taken (no fixed file): the launcher, the result sheet. */
export interface ArchiveItem {
  icon: string;
  title: string;
  note: string;
  action: string;
  run(): void;
  disabled?: boolean;
  /** The file it saves (its name tells the type); none: an action (installing the app). */
  file?: string;
  /** A fixed file on this site whose size it has. */
  sizeFrom?: string;
}

export interface ArcFile {
  key: string;
  name: string;
  type: FileType;
  /** One line: what is inside. */
  note: string;
  /** Where it is (public/) — opened, downloaded and measured from there. */
  href?: string;
  /** The name it is saved under. */
  download?: string;
  /** A picture for the tile and the preview (a PDF's first page). */
  thumb?: string;
  /** Made when taken: what the button says and does. */
  action?: { label: string; run(): void; disabled?: boolean };
  sizeFrom?: string;
}

export interface ArcFolder {
  key: string;
  name: string;
  note: string;
  folders: ArcFolder[];
  files: ArcFile[];
}

const pdfName = (m: Material) => `${m.title.replace(/\s*—\s*/g, ' - ').replace(/[^\p{L}\p{N} .·-]/gu, '')}.pdf`;
const pdf = (m: Material): ArcFile => ({ key: m.id, name: pdfName(m), type: 'pdf', note: m.desc, href: m.file, download: pdfName(m), thumb: `/materials/thumbs/${m.id}.jpg` });

function fromItem(it: ArchiveItem): ArcFile {
  const ext = it.file?.split('.').pop()?.toLowerCase();
  const type: FileType = ext === 'pdf' || ext === 'gif' || ext === 'html' || ext === 'zip' || ext === 'exe' ? ext : 'app';
  return { key: it.title, name: it.file ?? it.title, type, note: `${it.title} — ${it.note}`, action: { label: it.action, run: it.run, disabled: it.disabled }, sizeFrom: it.sizeFrom };
}

export function buildTree(programs: ArchiveItem[], checks: ArchiveItem[]): ArcFolder {
  const docs: ArcFolder = {
    key: 'docs',
    name: '교재 · 문항지',
    note: '단원별 이론 자료(실습교육서)와 문항지(OX · 객관식, 정답과 해설은 끝에) PDF',
    folders: CATEGORIES.map((c) => ({
      key: `docs/${c.id}`,
      name: `${c.id}. ${c.title}`,
      note: `대단원 ${partOf(c.id).no} ${partOf(c.id).title} · 이론 자료, OX 문항지, 객관식 문항지`,
      folders: [],
      files: MATERIALS.filter((m) => m.cat === c.id).map(pdf),
    })),
    files: MATERIALS.filter((m) => m.cat === null).map(pdf),
  };
  return {
    key: '',
    name: '자료실',
    note: '수업에 쓰는 프로그램 · 교재 · 문항지 · 매뉴얼을 폴더별로 모았어요.',
    folders: [
      { key: 'program', name: '프로그램', note: 'PC 에 두고 쓰는 프로그램', folders: [], files: programs.map(fromItem) },
      docs,
      {
        key: 'guides',
        name: '매뉴얼 · 가이드',
        note: '시뮬레이터 사용 매뉴얼과 교사용 교육 가이드라인 (인쇄용 PDF)',
        folders: [],
        files: [
          {
            key: 'simulator-guide',
            name: '시뮬레이터 사용 매뉴얼.pdf',
            type: 'pdf',
            note: 'PC 에서 로봇팔을 움직이고 블록 · 파이썬 · ROS 2 로 프로그램을 만들어 실제 로봇까지 — 그림으로 안내',
            href: '/guides/simulator-guide.pdf',
            download: '시뮬레이터 사용 매뉴얼.pdf',
            thumb: '/guides/thumbs/simulator-guide.jpg',
          },
          {
            key: 'teacher-guide',
            name: '교사용 교육 가이드라인.pdf',
            type: 'pdf',
            note: '로봇공학 8개 단원 · 28차시 — 수업 준비, 한 차시 운영, 평가, 자료실 활용',
            href: '/guides/teacher-guide.pdf',
            download: '교사용 교육 가이드라인.pdf',
            thumb: '/guides/thumbs/teacher-guide.jpg',
          },
        ],
      },
      { key: 'check', name: '검수 서류', note: '검수별 시각과 실측값을 한 장으로 (열어서 인쇄 → PDF)', folders: [], files: checks.map(fromItem) },
    ],
    files: [],
  };
}

/** The folder with this key and the folders down to it (root first). */
export function folderPath(root: ArcFolder, key: string): ArcFolder[] {
  if (root.key === key) return [root];
  for (const f of root.folders) {
    const p = folderPath(f, key);
    if (p.length) return [root, ...p];
  }
  return [];
}

/** Every file under a folder. */
export const fileCount = (f: ArcFolder): number => f.files.length + f.folders.reduce((n, s) => n + fileCount(s), 0);

export function formatSize(n: number | undefined): string {
  if (n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
