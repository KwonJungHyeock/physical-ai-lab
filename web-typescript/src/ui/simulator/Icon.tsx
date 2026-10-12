/** Small line icons for the console (24×24 grid, currentColor). */

const PATHS: Record<string, string> = {
  school: 'M3 9l9-4.5L21 9l-9 4.5zM7 11v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5M21 9v6',
  factory: 'M3 20V10l5 3V10l5 3V10l5 3V5h3v15zM7 17h2M12 17h2M17 17h2',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9M8 5.3l8 4.5',
  flask: 'M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 15h9',
  leaf: 'M5 19c0-8 5-13 15-14-1 10-6 15-14 15M5 19l7-7',
  cup: 'M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v2.5M11 3v2.5M14 3v2.5',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h0a3 3 0 0 1-3-3M9 9h1M14 13h1M9 15h1',
  recycle: 'M7 19H4.5l3-5.2M17 19h2.5l-3-5.2M9.5 6l2.5-4 2.5 4M7 19h10M5.5 11.5 9.5 6M18.5 11.5 14.5 6',
  chart: 'M4 20h16M7 16v-5M11 16V8M15 16v-7M19 16V5',
  play: 'M8 5.5v13l10.5-6.5z',
  stop: 'M7 7h10v10H7z',
  robot: 'M5 20h11M8 20v-3h5v3M10.5 17V11l6-4 2.5 4M10.5 11a1.6 1.6 0 1 0 0 .01M16.5 7a1.6 1.6 0 1 0 0 .01',
  joints: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  tool: 'M14.5 4.5a4 4 0 0 0-5 5L4 15l5 5 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z',
  zero: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0',
  camera: 'M4 8h3l2-2.5h6L17 8h3v11H4zM12 11a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  log: 'M5 6h14M5 10h14M5 14h10M5 18h7',
  code: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
  chevron: 'M6 9l6 6 6-6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.3-2.4L4 14.5a1.5 1.5 0 0 1 2.5-1.6L8 15',
  home: 'M4 11l8-6 8 6v8h-5v-5H9v5H4z',
  panel: 'M4 5h16v14H4zM15 5v14',
  help: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6M12 16.8v.2',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  refresh: 'M19 12a7 7 0 1 1-2.1-5M19 4v4h-4',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  wifi: 'M3.5 9.5a12 12 0 0 1 17 0M6.8 12.8a7.4 7.4 0 0 1 10.4 0M9.9 15.9a3 3 0 0 1 4.2 0M12 19h.01',
  search: 'M11 11m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0M16 16l4.5 4.5',
  ff: 'M3.5 6.5v11l8-5.5zM12.5 6.5v11l8-5.5z',
  ff3: 'M1.5 7.5v9l6-4.5zM9 7.5v9l6-4.5zM16.5 7.5v9l6-4.5z',
  dots: 'M5 10.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6M12 10.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6M19 10.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  swap: 'M4 8h13l-3.5-3.5M20 16H7l3.5 3.5',
  install: 'M4 5h16v11H4zM9 20h6M12 16v4M12 7.5v5.5M9.5 10.5l2.5 2.5 2.5-2.5',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  cube: 'M12 2.5l8.5 4.7v9.6L12 21.5l-8.5-4.7V7.2zM3.5 7.2L12 12l8.5-4.8M12 12v9.5',
  archive: 'M3.5 4h17v4h-17zM5 8v12h14V8M10 12h4',
  gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-2 1.2l-.3 2h-3.6l-.3-2a7 7 0 0 1-2-1.2l-1.9.7-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.4L3.4 10l1.8-3.1 1.9.7a7 7 0 0 1 2-1.2l.3-2h3.6l.3 2a7 7 0 0 1 2 1.2l1.9-.7 1.8 3.1-1.6 1.1a7 7 0 0 1 0 2.4z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  scene: 'M3 18l5-6 4 4 3-3 6 5M3 5h18v14H3zM16 8.5a1.5 1.5 0 1 0 0 .01',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  pc: 'M3.5 5h17v11h-17zM9 20h6M12 16v4',
    gallery: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  table: 'M3 10h18M5 10v9M19 10v9M7 10V6h4v4M13 10V7h4v3',
  shuffle: 'M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.6-1.6 3.4-3.4M13.2 9.4C14 8 15 7 16.5 7H20M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5',
};

const FILLED = new Set(['play', 'stop', 'ff', 'ff3', 'dots']);

export default function Icon({ name, size = 16, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d={PATHS[name] ?? ''}
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
