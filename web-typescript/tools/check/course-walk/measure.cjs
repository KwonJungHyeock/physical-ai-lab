/**
 * 입문 과정 가독성 기준 (가독성 정리 지시서 파트 2), measured on the page as it is shown.
 *
 *  - 글자: text to read 14 px or more; number values (angle · coordinate · percent) 16 px or more.
 *  - 누르는 것: buttons, switches, inputs, keys over the scene 40 × 40 px or more; text inside an input 16 px or more.
 *  - 대비: text against what is behind it 4.5 : 1 or more (a disabled key's text 3 : 1).
 *  - 넘침 · 잘림 · 겹침: none; items in one row (align-items: center) within 2 px of the same middle.
 *  - 같은 역할: the panel's width and inner padding, the gap between its groups, the run row's height —
 *    recorded per screen so they can be compared across 절.
 *
 * Sizes are as shown (CSS px × the screen's zoom), so at 1366 × 768 (zoom 1) they are the layout's own.
 * Only what is on top is counted: text under a window's dimmed backdrop is not read by anyone.
 * Run in the page: `await page.evaluate(MEASURE)` → { issues: [...], roles: {...} }.
 */

const MEASURE = async () => {
  // A card that pops in (scale 0.6 → 1) is read once it has landed: finite animations end first (3 s at most).
  const moving = document.getAnimations().filter((x) => {
    const t = x.effect && x.effect.getComputedTiming ? x.effect.getComputedTiming() : null;
    return t && t.iterations !== Infinity && x.playState === 'running';
  });
  await Promise.race([Promise.all(moving.map((x) => x.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 3000))]);
  const TEXT_MIN = 14;
  const VALUE_MIN = 16;
  const HIT_MIN = 40;
  const INPUT_TEXT_MIN = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const issues = [];
  const add = (kind, el, detail) => {
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute?.('aria-label') || el.textContent || el.tagName || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    issues.push({ kind, name, at: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], detail });
  };

  // --- what is shown -------------------------------------------------------------------------
  const shown = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse' || Number(cs.opacity) === 0) return false;
      if (e.getAttribute('aria-hidden') === 'true' && e.tagName !== 'I') return false;
      // Inside a closed fold (only its summary shows).
      if (e.parentElement && e.parentElement.tagName === 'DETAILS' && !e.parentElement.open && e.tagName !== 'SUMMARY') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  };
  // On top at its middle (or at one of a few points): not under a window's backdrop or another layer.
  const onTop = (el, rect) => {
    const r = rect || el.getBoundingClientRect();
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + r.height / 2],
      [r.right - 3, r.top + r.height / 2],
    ];
    return pts.some(([x, y]) => {
      if (x < 0 || y < 0 || x >= vw || y >= vh) return false;
      const t = document.elementFromPoint(x, y);
      return !!t && (t === el || el.contains(t) || t.contains(el));
    });
  };
  // Shown size factor: the box as drawn over its own layout size (the screen's zoom, a transform).
  // (Read on a box at least 40 px wide: a one-letter label's own width rounds to whole px and would read 13.2 for 14.)
  const scaleOf = (el) => {
    let e = el;
    while (e.parentElement && e.offsetWidth < 40) e = e.parentElement;
    const w = e.offsetWidth;
    const r = e.getBoundingClientRect();
    return w > 0 ? r.width / w : 1;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    return o;
  };

  // --- colour --------------------------------------------------------------------------------
  const parse = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // What is behind an element: its own and its ancestors' backgrounds laid over each other (a gradient or a picture: its
  // first colour stop, else skipped — the 3D view behind a label counts as the scene's mid grey).
  const SCENE = { r: 139, g: 129, b: 118, a: 1 };
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
      else if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const stop = /rgba?\([^)]+\)/.exec(cs.backgroundImage);
        if (stop) layers.push(parse(stop[0]));
      }
      if (layers.length && layers[layers.length - 1].a >= 1) break;
      if (e.tagName === 'CANVAS' || e.querySelector?.(':scope > canvas')) {
        layers.push(SCENE);
        break;
      }
    }
    let c = { r: 18, g: 20, b: 24, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c);
    return c;
  };

  // --- 1. text --------------------------------------------------------------------------------
  const VALUE = /^[+−-]?\d[\d.,]*\s?(°|mm|%|초|°C)?$/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName) || el.closest('nextjs-portal, [data-qa], svg title')) continue;
    if (!shown(el)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const rect = range.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (!onTop(el, rect)) continue;
    texts.push({ n, el, t, rect });
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize) * scaleOf(el);
    // A value is judged by its element's whole text ('J' + '1' is a label, '+45.0' + '°' a value).
    const whole = el.textContent.replace(/\s+/g, ' ').trim();
    const isValue = VALUE.test(whole) || (el.tagName === 'OUTPUT' && /\d/.test(whole));
    const min = isValue ? VALUE_MIN : TEXT_MIN;
    if (px < min - 0.25) add(isValue ? 'value-size' : 'text-size', el, `${px.toFixed(1)}px < ${min} · "${t.slice(0, 30)}"`);
    // contrast
    const fg = parse(cs.color);
    if (fg) {
      const bg = behind(el);
      const o = opacityOf(el);
      const shownFg = over({ ...fg, a: fg.a * o }, bg);
      const r = ratio(shownFg, bg);
      // Switched off: a disabled key, a switch whose box is disabled, a row whose only key is disabled (a locked 절 in the list), a row not open yet ([data-soon]).
      const row = el.closest('li, [data-row]');
      const rowKeys = row ? [...row.querySelectorAll('button, input')] : [];
      const off = !!el.closest('button:disabled, [aria-disabled="true"], input:disabled, [data-soon]') || !!el.closest('label')?.querySelector('input:disabled') || (rowKeys.length > 0 && rowKeys.every((k) => k.disabled));
      const need = off ? 3 : 4.5;
      if (r < need - 0.05) add(off ? 'contrast-off' : 'contrast', el, `${r.toFixed(2)} < ${need} · "${t.slice(0, 30)}"`);
    }
    // clipped by its own box
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) add('clip', el, `말줄임 · "${t.slice(0, 30)}"`);
    if (rect.right > vw + 1 || rect.bottom > vh + 1 || rect.left < -1) add('clip', el, `화면 밖 · "${t.slice(0, 30)}"`);
  }
  // Text cut by a box that hides what does not fit (overflow hidden / clip): part of it inside, part outside.
  // (Wholly outside is a thing put away on purpose — a hand waiting off the scene — and not counted.)
  const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker2.nextNode(); n; n = walker2.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent.trim() || !shown(el) || el.closest('[data-qa], nextjs-portal')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1) continue;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (!/hidden|clip/.test(cs.overflowX + cs.overflowY)) continue;
      const b = a.getBoundingClientRect();
      const outX = /hidden|clip/.test(cs.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1);
      const outY = /hidden|clip/.test(cs.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1);
      const inside = r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
      if ((outX || outY) && inside && getComputedStyle(el).textOverflow !== 'ellipsis') add('clip', el, `잘림 · "${n.textContent.trim().slice(0, 30)}"`);
      break;
    }
  }
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/auto|scroll/.test(cs.overflowY + cs.overflowX) || !shown(el)) continue;
    const dy = el.scrollHeight - el.clientHeight;
    const dx = el.scrollWidth - el.clientWidth;
    if ((dy > 1 && /auto|scroll/.test(cs.overflowY)) || (dx > 1 && /auto|scroll/.test(cs.overflowX))) add('overflow', el, `스크롤 ${dy > 1 ? `세로 ${dy}px` : ''}${dx > 1 ? ` 가로 ${dx}px` : ''}`.trim());
  }
  if (document.documentElement.scrollHeight > vh + 1 || document.documentElement.scrollWidth > vw + 1) add('overflow', document.documentElement, `페이지 ${document.documentElement.scrollWidth}×${document.documentElement.scrollHeight}`);

  // --- 2. what is pressed -----------------------------------------------------------------------
  const keys = new Set();
  for (const el of document.querySelectorAll('button, a[href], select, textarea, input, [role="button"], [role="switch"], [role="tab"]')) {
    if (el.matches('input[type="hidden"]')) continue;
    let target = el;
    // A box ticked through its label: the label is what is pressed.
    if (el.matches('input[type="checkbox"], input[type="radio"]')) target = el.closest('label') || el;
    if (keys.has(target) || !shown(target) || target.closest('[data-qa], nextjs-portal')) continue;
    const r = target.getBoundingClientRect();
    if (!onTop(target, r)) continue;
    keys.add(target);
    // (A disabled control is not pressed now — a title shown as a key, ▶ before its turn: measured where it is on.)
    const offNow = el.disabled || target.getAttribute('aria-disabled') === 'true';
    if (!offNow && (r.width < HIT_MIN - 0.5 || r.height < HIT_MIN - 0.5)) add('hit', target, `${Math.round(r.width)}×${Math.round(r.height)} < 40×40`);
    if (el.matches('input:not([type]), input[type="text"], input[type="number"], textarea, select')) {
      const px = parseFloat(getComputedStyle(el).fontSize) * scaleOf(el);
      if (px < INPUT_TEXT_MIN - 0.25) add('input-text', el, `${px.toFixed(1)}px < 16`);
    }
  }

  // --- 3. overlap: text over text, text over a key it is not part of ---------------------------
  const clipped = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).clipPath !== 'none') return true;
    return false;
  };
  const boxes = texts.map((x) => ({ el: x.el, r: x.rect, t: x.t }));
  for (const k of keys) boxes.push({ el: k, r: k.getBoundingClientRect(), key: true });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // A key cut to a shape (clip-path — the round 좌표 pad's quarters): its box is not what is drawn or pressed.
      if (clipped(a.el) || clipped(b.el)) continue;
      if (a.key && b.key) {
        // two keys over each other (not side by side)
      }
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 2 && h > 2) add('overlap', a.el, `${(a.t || a.el.textContent || '').trim().slice(0, 16)} ↔ ${(b.t || b.el.textContent || '').trim().slice(0, 16)} (${Math.round(w)}×${Math.round(h)})`);
    }

  // --- 4. one row, one middle ----------------------------------------------------------------
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (!/flex/.test(cs.display) || !/^row/.test(cs.flexDirection) || cs.alignItems !== 'center' || cs.flexWrap === 'wrap' || !shown(el)) continue;
    const kids = [...el.children].filter((c) => shown(c) && getComputedStyle(c).position !== 'absolute' && getComputedStyle(c).position !== 'fixed');
    if (kids.length < 2) continue;
    const mids = kids.map((c) => {
      const r = c.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    const spread = Math.max(...mids) - Math.min(...mids);
    if (spread > 2.01) add('align', el, `가운데 차이 ${spread.toFixed(1)}px`);
  }

  // --- 5. the same role, the same size (recorded) ------------------------------------------------
  const side = document.querySelector('aside[aria-label="작업 패널"]');
  const roles = {};
  if (side && shown(side)) {
    const s = side.getBoundingClientRect();
    const scroll = side.querySelector('[class*="dockScroll"]');
    const cs = scroll ? getComputedStyle(scroll) : null;
    const scale = scaleOf(side);
    roles.panelWidth = Math.round(s.width / scale);
    roles.panelPad = cs ? `${parseFloat(cs.paddingTop)} ${parseFloat(cs.paddingRight)} ${parseFloat(cs.paddingBottom)} ${parseFloat(cs.paddingLeft)}` : null;
    const screen = side.querySelector('[class*="screen"]');
    if (screen) {
      const kids = [...screen.querySelectorAll(':scope > *, :scope > * > [class*="panel"] > *')].filter(shown);
      const gaps = [];
      for (let i = 1; i < kids.length; i++) {
        const g = Math.round((kids[i].getBoundingClientRect().top - kids[i - 1].getBoundingClientRect().bottom) / scale);
        if (g >= 0 && g < 80) gaps.push(g);
      }
      roles.groupGaps = [...new Set(gaps)].sort((a, b) => a - b).join(' ');
    }
    const run = side.querySelector('[data-step="run"], button[aria-label="시뮬레이션"]');
    if (run && shown(run)) roles.runHeight = Math.round(run.getBoundingClientRect().height / scale);
    // How much of the panel stays empty under its content (a panel whose content sits at its top).
    if (scroll) {
      const last = [...scroll.querySelectorAll(':scope *')].filter((e) => shown(e) && e.children.length === 0 && !e.closest('[data-foot], [class*="poseDock"]')).reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
      const foot = scroll.querySelector('[data-foot], [class*="poseDock"]');
      const end = foot && shown(foot) ? foot.getBoundingClientRect().top : scroll.getBoundingClientRect().bottom;
      roles.emptyBelow = Math.max(0, Math.round((end - last) / scale));
    }
  }
  return { issues, roles };
};

module.exports = { MEASURE };
