/* Sidebar hydration — the one script every page loads for the shared aside.

   The markup in each page already carries the seeded values, so the sidebar is
   correct with JavaScript off; this module only re-paints it from the store so
   a change made on one screen shows up on all of them.

   Build B drives THIS TERM from `GET /programs/{id}/coursemap`. A has no
   backend, so the numbers come from the `term` bucket in js/store.js, seeded to
   match Home's own course cards (18 credits across five courses) and Profile
   (42 of 120 credits earned, 35% major progress).

   The term reads Fall 2026 because that is what the rest of the product already
   assumes: the whiteboard's calendar renders the live month, and Home's content
   talks about the Fall Career Fair and September deadlines. The seeded
   "Spring 2026" was the only thing disagreeing. */

import { store } from './store.js';

const SEED_TERM = {
  label: 'Fall 2026',
  doneCr: 42,
  totalCr: 120,
  inProgCr: 18,
  pct: 35,
  unitLabel: 'credits',
};

const SEED_IDENTITY = { name: 'Jordan Lee', initials: 'JL' };

function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function readTerm() {
  const state = store.all();
  return { ...SEED_TERM, ...(state.term || {}) };
}

export function readIdentity() {
  const stored = store.all().identity || {};
  const id = { ...SEED_IDENTITY, ...stored };
  /* Only an explicitly stored `initials` overrides what the name implies, so
     changing just the name still relabels every circle. */
  if (!stored.initials) id.initials = initialsFrom(id.name);
  return id;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

export function paintSidebar(root = document) {
  const term = readTerm();
  const id = readIdentity();

  const set = (sel, text) => {
    root.querySelectorAll(sel).forEach((el) => { el.textContent = text; });
  };

  set('[data-term-label]', term.label);
  set('[data-term-inprog]', String(term.inProgCr));
  set('[data-term-unit]', term.unitLabel);
  set('[data-term-pct]', `${term.pct}%`);

  const done = pct(term.doneCr, term.totalCr);
  const prog = pct(term.inProgCr, term.totalCr);
  root.querySelectorAll('[data-term-bar-done]').forEach((el) => { el.style.width = `${done}%`; });
  root.querySelectorAll('[data-term-bar-prog]').forEach((el) => { el.style.width = `${prog}%`; });

  /* B's avatar is the user's uploaded picture when there is one, and the
     initials circle otherwise (spec §6). A has no upload flow yet, so every
     circle renders the initials. */
  root.querySelectorAll('[data-avatar-initials]').forEach((el) => {
    el.textContent = id.initials;
  });

  /* Every page that shows the student's name marks it up rather than hardcoding
     one, so signing up as yourself relabels the whole product instead of just
     the sidebar circle. `first` is for greetings ("Welcome back, Mei"), `name`
     for headers and the printed resume. */
  set('[data-identity-name]', id.name);
  set('[data-identity-first]', id.name.trim().split(/\s+/)[0] || id.name);

}

/* ===========================================================================
   § THEME — Flightplan (default) or NYU.

   The choice is a per-device preference, not part of anyone's plan, so it lives
   under its own localStorage key rather than in the store (whose user buckets
   are wiped when a different student signs in). Each page's <head> reads the
   same key before painting; this module builds the toggle, applies a change
   live, and themes the Planner's embedded board.
   =========================================================================== */

const BRAND_KEY = 'flightplan.brand';
const NYU_FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700&family=Montserrat:wght@400;500;600;700&display=swap';

export function readBrand() {
  try { return localStorage.getItem(BRAND_KEY) === 'nyu' ? 'nyu' : 'default'; }
  catch { return 'default'; }
}

function ensureFonts(doc) {
  if (!doc.head || doc.querySelector('link[data-nyu-fonts]')) return;
  const l = doc.createElement('link');
  l.rel = 'stylesheet';
  l.href = NYU_FONTS;
  l.setAttribute('data-nyu-fonts', '');
  doc.head.appendChild(l);
}

/* The Planner board is a generated bundle inside an iframe that paints with
   inline style="color:#…" strings rather than tokens, so it is themed by
   remapping its dominant colours with attribute selectors. The map covers the
   colours that make up nearly all of its paint; anything rarer keeps B's
   original. */
const PLANNER_MAP = {
  A2593A: '57068C', '8F8779': '6D6D6D', FDFBF6: 'FFFFFF', E4DED0: 'D6D6D6', '5C554A': '404040',
  A9A192: '767676', EFEADD: 'EEEEEE', '5A7355': '00837C', '96742E': '4E7AA1', DFC2AC: 'AB82C5',
  '7E3F22': '330662', '8C3A1E': 'B00B5E', '3F5139': '005E58', DFCB9B: 'EDE59A', '7A5C1E': '3E6283',
  F1E3D8: 'E3D2F0', B4AC9C: '8A8A8A', FBE9E4: 'FDE7F1', D99B84: 'F39AC4', '3A362F': '262626',
  F2EDE1: 'F2F2F2', C9D2C0: 'CCE6E4', '1B1916': '000000', E6CDB8: 'D9C7E6', FAF0E7: 'F7F2FA',
  F8F4EA: 'F7F7F7', EDE7DA: 'E6E6E6', E9EDE2: 'E6F3F2', F6F2E9: 'F2F2F2', F0D9C8: 'E3D2F0',
  /* the rest of the board's warm paint: alert dots, the in-progress term's cream
     and peach, and its tan hairlines */
  B4552F: 'E00E78', F3E6DB: 'EEE6F3', F6EFDC: 'F6F1F9', FBF1E4: 'F7F2FA', FBF3E9: 'F7F7F7',
  D9B893: 'CFCFCF', DDD5C4: 'D6D6D6', E7E1D4: 'E6E6E6',
};

function plannerCss() {
  /* The bundle's framework writes inline styles through the CSSOM, so by the
     time they reach the attribute they are serialised as `rgb(r, g, b)` with
     spaces, not the `#A2593A` in its source. Both forms are matched: the hex
     for any string written straight to the attribute, the rgb for the rest.
     background-color, not the `background` shorthand, so an image or gradient
     on the same element survives. */
  const rules = [
    "html[data-brand='nyu'] body { background: #F2F2F2 !important; font-family: 'Montserrat', Verdana, sans-serif !important; }",
    "[style*=\"Pathfinder Hand\" i] { font-family: 'Frank Ruhl Libre', Georgia, serif !important; }",
    "[style*=\"Instrument Sans\" i], [style*=\"Inter\" i], [style*=\"JetBrains Mono\" i] { font-family: 'Montserrat', Verdana, sans-serif !important; }",
  ];
  /* `to` at one-third strength over white, as an opaque hex */
  const solidThird = (h) => '#' + [0, 2, 4].map((i) => Math.round(255 - (255 - parseInt(h.slice(i, i + 2), 16)) / 3)
    .toString(16).padStart(2, '0')).join('');
  const rgb = (h) => `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  for (const [from, to] of Object.entries(PLANNER_MAP)) {
    const c = rgb(from);
    rules.push(
      `[style*="color:#${from}" i], [style*="color: ${c}"] { color: #${to} !important; }`,
      `[style*="background:#${from}" i], [style*="background: #${from}" i], [style*="background-color:#${from}" i], [style*="background: ${c}"], [style*="background-color: ${c}"] { background-color: #${to} !important; }`,
      `[style*="solid #${from}" i], [style*="dashed #${from}" i], [style*="solid ${c}"], [style*="dashed ${c}"] { border-color: #${to} !important; }`,
      /* The board draws some pill outlines as the colour at one-third alpha
         (rgba(r, g, b, 0.333)). NYU wants no see-through violet, so each
         becomes a solid colour: the NYU equivalent laid over white at the
         same one-third strength, so it reads just as light. */
      `[style*="solid ${c.replace('rgb(', 'rgba(').replace(')', ',')}"] { border-color: ${solidThird(to)} !important; }`,
      `[stroke="#${from}" i], [stroke="${c}"] { stroke: #${to} !important; }`,
      `[fill="#${from}" i], [fill="${c}"] { fill: #${to} !important; }`,
    );
  }
  return rules.join('\n');
}

function themeFrame(frame) {
  let doc;
  try { doc = frame.contentDocument; } catch { return; }   /* cross-origin: leave it */
  if (!doc || !doc.documentElement) return;
  const nyu = readBrand() === 'nyu';
  const old = doc.getElementById('fp-nyu-theme');
  if (nyu) {
    doc.documentElement.setAttribute('data-brand', 'nyu');
    ensureFonts(doc);
    if (!old && doc.head) {
      const st = doc.createElement('style');
      st.id = 'fp-nyu-theme';
      st.textContent = plannerCss();
      doc.head.appendChild(st);
    }
  } else {
    doc.documentElement.removeAttribute('data-brand');
    if (old) old.remove();
  }
}

function applyBrand() {
  const nyu = readBrand() === 'nyu';
  if (nyu) {
    document.documentElement.setAttribute('data-brand', 'nyu');
    ensureFonts(document);
  } else {
    document.documentElement.removeAttribute('data-brand');
  }
  document.querySelectorAll('iframe').forEach(themeFrame);
  document.querySelectorAll('.theme-toggle button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.brand === (nyu ? 'nyu' : 'default')));
  });
}

export function setBrand(brand) {
  try {
    if (brand === 'nyu') localStorage.setItem(BRAND_KEY, 'nyu');
    else localStorage.removeItem(BRAND_KEY);
  } catch { /* private mode: the change still applies to this page */ }
  applyBrand();
}

/* Under the degree progress (THIS TERM), on every page that has a sidebar. */
function buildToggle() {
  document.querySelectorAll('.sidebar__term').forEach((term) => {
    if (term.parentElement.querySelector('.sidebar__theme')) return;
    const wrap = document.createElement('div');
    wrap.className = 'sidebar__theme';
    wrap.innerHTML = `
      <p class="term__label" id="themeLabel">THEME</p>
      <div class="theme-toggle" role="group" aria-labelledby="themeLabel">
        <button type="button" data-brand="default"><span class="theme-toggle__dot theme-toggle__dot--fp" aria-hidden="true"></span>Flightplan</button>
        <button type="button" data-brand="nyu"><span class="theme-toggle__dot theme-toggle__dot--nyu" aria-hidden="true"></span>NYU</button>
      </div>`;
    wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setBrand(b.dataset.brand)));
    term.insertAdjacentElement('afterend', wrap);
  });
}

function initBrand() {
  buildToggle();
  applyBrand();
  /* the Planner's iframe loads after this runs */
  document.querySelectorAll('iframe').forEach((f) => f.addEventListener('load', () => themeFrame(f)));
  /* keep other open tabs in step */
  window.addEventListener('storage', (e) => { if (e.key === BRAND_KEY) applyBrand(); });
}

/* --- phones and small tablets: the sidebar becomes a top bar ----------------
   At 900px and below css/base.css turns the rail into a 56px bar holding the
   brand and this button; the rest of the rail (nav, THIS TERM, theme, avatar,
   sign out) opens as a full-screen menu under it. */
function buildMenuButton() {
  document.querySelectorAll('.sidebar').forEach((bar) => {
    if (bar.querySelector('.sidebar__menu-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar__menu-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
    btn.innerHTML = '<span></span><span></span><span></span>';
    const set = (open) => {
      bar.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    btn.addEventListener('click', () => set(!bar.classList.contains('is-open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bar.classList.contains('is-open')) { set(false); btn.focus(); } });
    /* leaving the phone layout (rotating, resizing) must not strand an open menu */
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) set(false); });
    bar.querySelector('.sidebar__brand').insertAdjacentElement('afterend', btn);
  });
}

document.addEventListener('DOMContentLoaded', () => { paintSidebar(); initBrand(); buildMenuButton(); });
