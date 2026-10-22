// The simulator's logo (시안 C): the ROBODYNE SYSTEMS hexagon drawn as a robot arm — base, shoulder, elbow,
// wrist, gripper along the hexagon's sides, the forearm and gripper in red — with the company name as it is
// on the official logo (public/brand/robodyne-name-*.png, the official wordmark without its tagline).
// Writes, under public/brand: sim-mark-{white,ink}.svg (the arm alone) and sim-logo-{white,ink}.svg (arm +
// name, the name embedded so the file works in an <img>); under public/icons the app icons, and
// src/app/favicon.ico (the program's .exe icon is made from icons/icon-512.png by desktop-go/build.sh).
//   node tools/build/brand.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pub = (...p) => path.join(web, 'public', ...p);

const RED = '#E5322D';
/** The official hexagon's corners in its 500 × 250 frame: base, left, top-left, top-right; then the wrist going down-right. */
const P = { base: [80, 211], left: [26, 118], tl: [92, 24], tr: [214, 24], wrist: [244, 80] };
/** The arm in the 500 × 250 frame; `hole` fills the joint rings (the background it sits on). */
function arm(ink, hole) {
  const line = (a, b, c = ink) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="14" stroke-linecap="round"/>`;
  const [wx, wy] = P.wrist;
  const gripper =
    `<g transform="translate(${wx} ${wy}) rotate(-28)" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round">` +
    `<rect x="-13" y="-4" width="26" height="14" rx="3" fill="${RED}" stroke="none"/><path d="M-11 10v18q0 4 4 4"/><path d="M11 10v18q0 4-4 4"/></g>`;
  const joints = [P.left, P.tl, P.tr].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${hole}" stroke="${ink}" stroke-width="6"/><circle cx="${x}" cy="${y}" r="3.5" fill="${ink}"/>`).join('');
  return `<path d="M58 226L64 214H94L98 226Z" fill="${ink}"/>` + line(P.base, P.left) + line(P.left, P.tl) + line(P.tl, P.tr, RED) + line(P.tr, P.wrist, RED) + joints + gripper;
}
/** The two colourings: white on the dark screens, ink on the light top bar. */
const THEMES = { white: { ink: '#ffffff', hole: '#0b1017' }, ink: { ink: '#101828', hole: '#ffffff' } };
/** The arm's own box, and the arm + name box, in the 500 × 250 frame. */
const MARK_BOX = '4 4 272 228';
const LOGO_BOX = '10 6 464 228';
const svg = (box, body) => {
  const [, , w, h] = box.split(' ').map(Number);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${w}" height="${h}">${body}</svg>\n`;
};

for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(pub('brand', `sim-mark-${name}.svg`), svg(MARK_BOX, arm(t.ink, t.hole)));
  const word = readFileSync(pub('brand', `robodyne-name-${name}.png`)).toString('base64');
  writeFileSync(pub('brand', `sim-logo-${name}.svg`), svg(LOGO_BOX, arm(t.ink, t.hole) + `<image href="data:image/png;base64,${word}" x="104" y="118" width="366" height="103.6"/>`));
}

/** The app icon: the white arm on the dark tile, inside the maskable safe zone. */
const BG = '#0b1017';
const icon = (size, round) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">` +
        `<rect width="512" height="512" rx="${round ? 96 : 0}" fill="${BG}"/>` +
        `<g transform="translate(78 92) scale(1.31)">${arm('#ffffff', BG)}</g></svg>`,
    ),
  )
    .png()
    .toBuffer();
writeFileSync(pub('icons', 'icon-512.png'), await icon(512, true));
writeFileSync(pub('icons', 'icon-192.png'), await icon(192, true));
writeFileSync(pub('icons', 'apple-touch-icon.png'), await icon(180, false));

// favicon.ico: 16, 32 and 48 px PNG images in one icon file.
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => icon(s, true)));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let at = head.length;
sizes.forEach((s, k) => {
  const e = 6 + 16 * k;
  head.writeUInt8(s, e);
  head.writeUInt8(s, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[k].length, e + 8);
  head.writeUInt32LE(at, e + 12);
  at += pngs[k].length;
});
writeFileSync(path.join(web, 'src/app/favicon.ico'), Buffer.concat([head, ...pngs]));
console.log('brand: sim-mark/sim-logo (white, ink), icons 512/192/180, favicon.ico');
