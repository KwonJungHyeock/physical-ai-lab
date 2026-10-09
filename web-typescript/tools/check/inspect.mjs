// Shared by the layout checks (learn-ui.mjs, site-ui.mjs): what to look for on a screen as drawn,
// and how to start Playwright and the app. `inspect` runs inside the page (it is passed to
// locator.evaluate), so it uses nothing from this module.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}

export const chromiumPath = () => process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

/** Runs in the page: problems inside `root`. */
export function inspect(root) {
  const out = [];
  const R = root.getBoundingClientRect();
  if (root.scrollWidth > root.clientWidth + 2) out.push(['WIDE', root.getAttribute('aria-label') ?? root.tagName, `${root.scrollWidth - root.clientWidth} px 넘침`]);
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < R.top || r.top > R.bottom + 4000) continue;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const clips = ['hidden', 'clip'].includes(cs.overflowX) || cs.textOverflow === 'ellipsis';
    if (text && clips && el.scrollWidth > el.clientWidth + 1 && el.children.length < 4 && !['svg', 'canvas', 'IMG'].includes(el.tagName))
      out.push(['CLIPPED', text.slice(0, 50), `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0] ?? ''} ${el.scrollWidth - el.clientWidth} px 잘림`]);
    if (el.tagName === 'IMG' && el.complete && !el.naturalWidth) out.push(['IMAGE', el.getAttribute('src'), '불러오지 못함']);
    // Small boxes that hold one short label: is the label in the middle?
    // (A symbol carrying its name above it — ruby — is meant to sit high.)
    const small = r.width < 140 && r.height < 48 && text && text.length <= 12 && el.children.length <= 1 && !el.querySelector('ruby');
    const centred = cs.textAlign === 'center' || cs.justifyContent === 'center' || cs.placeItems.includes('center') || cs.justifyItems === 'center' || ['BUTTON', 'KBD', 'I'].includes(el.tagName);
    const boxed = cs.borderTopWidth !== '0px' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.borderRadius !== '0px';
    if (small && centred && boxed) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      if (!t.width) continue;
      const padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
      const padT = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
      const padB = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
      const bx = r.left + padL + (r.width - padL - padR) / 2;
      const by = r.top + padT + (r.height - padT - padB) / 2;
      const dx = t.left + t.width / 2 - bx;
      const dy = t.top + t.height / 2 - by;
      if (t.width > r.width - padL - padR + 1) out.push(['CLIPPED', text, `${el.tagName.toLowerCase()} 칸보다 글자가 넓음`]);
      else if (Math.abs(dx) > 2.5 && cs.textAlign !== 'left' && cs.textAlign !== 'start') out.push(['OFFCENTER', text, `가로 ${dx.toFixed(1)} px`]);
      if (Math.abs(dy) > 2.5) out.push(['OFFCENTER', text, `세로 ${dy.toFixed(1)} px`]);
    }
  }
  return out;
}
