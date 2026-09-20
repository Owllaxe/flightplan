import { store } from './store.js';

/* The pigeon.

   Build B animates the mascot from `assets/b/pigeon-stage.webp`, an 11 x 11
   sprite sheet of 121 frames (280 x 297 native), by writing `background-position`
   straight to the DOM at 15fps. That is what this module does; the frame lists
   below are B's own `PG.segments`, with its filename manifest resolved to sheet
   indices so the table is readable instead of 121 strings.

   Nothing here re-renders anything. A running animation costs two style writes
   per frame per visible pigeon, which is why B could leave it looping forever. */

const FPS = 15;
const COLS = 11;
const ROWS = 11;

/* entry -> loop x N -> accent -> exit, exactly as B flattens a segment. */
const SEGMENTS = {
  idle: { loop: [0, 1, 2, 3, 4, 4, 4, 4, 4, 5, 6, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 10, 11, 12, 12, 12, 12, 13, 14, 15, 15, 16, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17] },
  excited: { entry: [18, 19, 20, 21, 22, 23, 24], loop: [25, 26, 27, 28, 29, 29, 29, 30, 31, 32, 33, 34, 35, 36, 37, 37, 37, 38, 39, 39, 39, 39, 40, 41], exit: [22, 21, 20, 19, 42] },
  sleepy: { entry: [42, 42, 42, 42, 42, 43, 44, 45, 46, 47, 48], loop: [48, 48, 48, 48, 49, 50, 51, 51, 51, 51, 51, 52, 53, 54, 54, 54] },
  crying: { entry: [55, 56, 57, 58, 59, 60, 61], loop: [62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 72, 73, 74, 75, 76, 77, 78, 56, 55, 79, 79, 79, 79, 79, 80, 81, 82, 82, 83] },
  angry: { entry: [84, 85, 86, 87, 88, 89, 90], loop: [91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116], accent: [88, 117, 118, 119, 120, 120, 120, 120] },
};

/* ~2 minutes of no input and the pigeon nods off; any input wakes it. */
const DOZE_MS = 120000;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

let timer = null;
let sleepTimer = null;
let expr = 'idle';
let lastNegative = 'crying';   /* so the first negative reaction is 'angry' */

/* Both pigeons — the corner mascot and the one in the quiz card — step
   together, and each is drawn at whatever size its own layout gives it. */
function els() {
  return ['pigeon-stage', 'pigeon-quiz']
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function draw(i) {
  if (i == null) return;
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  els().forEach((el) => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    el.style.backgroundSize = `${COLS * w}px ${ROWS * h}px`;
    el.style.backgroundPosition = `${-col * w}px ${-row * h}px`;
  });
}

function playlist(name, loops) {
  const s = SEGMENTS[name];
  if (!s) return null;
  const n = loops == null ? 2 : loops;
  if (name === 'idle') return { frames: s.loop.slice(), repeat: true };
  if (name === 'sleepy') {
    return { frames: s.entry.slice(), then: { frames: s.loop.slice(), repeat: true } };
  }
  const out = [];
  const add = (a) => { if (a) out.push(...a); };
  add(s.entry);
  for (let i = 0; i < n; i++) add(s.loop);
  add(s.accent);
  add(s.exit);
  return { frames: out };
}

export function playPigeon(name, loops) {
  let pl = playlist(name, loops);
  if (!pl) return;
  clearInterval(timer);
  clearTimeout(sleepTimer);
  expr = name;

  draw(pl.frames[0]);

  /* Reduced motion: hold the opening frame rather than flipping 15 times a
     second. The pigeon still changes expression, it just does not move. */
  if (reduced.matches) {
    if (name !== 'idle') sleepTimer = setTimeout(() => restPigeon(), 1800);
    return;
  }

  let i = 0;
  timer = setInterval(() => {
    i += 1;
    if (i >= pl.frames.length) {
      if (pl.repeat) i = 0;
      else if (pl.then) { pl = pl.then; i = 0; }
      else { restPigeon(); return; }
    }
    draw(pl.frames[i]);
  }, 1000 / FPS);
}

/* Always return here. */
export function restPigeon() {
  expr = 'idle';
  playPigeon('idle');
  doze();
}

function doze() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => playPigeon('sleepy'), DOZE_MS);
}

function wake() {
  if (expr === 'sleepy') restPigeon();
  else doze();
}

/* A varied reaction: never the same negative movement twice running. */
export function reactPigeon(kind) {
  if (kind === 'positive') { playPigeon('excited'); return; }
  lastNegative = lastNegative === 'angry' ? 'crying' : 'angry';
  playPigeon(lastNegative);
}

function start() {
  if (!els().length) return;
  restPigeon();
}

/* A hidden tab should not burn a timer 15 times a second. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInterval(timer);
  else if (els().length) restPigeon();
});

['pointerdown', 'keydown', 'wheel'].forEach((t) => {
  window.addEventListener(t, wake, { passive: true });
});

/* The quiz overlay builds #pigeon-quiz after load, so pick it up when it
   appears rather than only at boot. */
new MutationObserver(() => {
  if (document.getElementById('pigeon-quiz') && !timer) start();
}).observe(document.documentElement, { childList: true, subtree: true });

/* --- the dock ---------------------------------------------------------------
   Every signed-in page gets a pigeon. Home, Goals, Resume and Visa
   carry their own mascot markup; Career, Alumni and Planner get one built here. On Planner only the head pokes in from the right edge, so it
   never covers the board. The login page has its own bird and is left alone. */

const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';

function ensureDock() {
  let bird = document.getElementById('pigeon-stage');
  if (bird) return bird;
  if (!document.querySelector('.sidebar')) return null;       /* login, embedded app */
  const box = document.createElement('div');
  box.className = 'mascot mascot--injected';
  bird = document.createElement('div');
  bird.id = 'pigeon-stage';
  bird.setAttribute('aria-label', 'Your pigeon');
  box.append(bird);
  document.body.append(box);
  return bird;
}

/* --- the speech bubble (build B) --------------------------------------------
   B's bubble, rebuilt from its markup: a head line that counts what still needs
   you, where it is speaking from, a line for this page, up to five reminders you
   can tick off or jump to, an outreach action, and a cheer. Clicking the bird
   opens and closes it; the x closes it. The choice is remembered per page for
   the browser session. Home and Planner start closed so the bubble does not
   cover the page; everywhere else it starts open, as in B. */

const FROM = {
  index: 'YOUR SEMESTER', planner: 'YOUR PLANNER', plan: 'YOUR GOALS', career: 'YOUR CAREER PLAN',
  alumni: 'YOUR NETWORK', visa: 'YOUR VISA PLAN', profile: 'YOUR PROFILE', resume: 'YOUR RESUME',
};

const CHEERS = [
  'every application is a rep — you’re getting stronger',
  'future you is already proud of this version of you',
  'small steps still cover ground — keep going',
  'you’ve handled harder weeks than this one',
  'planes take off against the wind — so do you',
];

const CAT = { goal: ['GOALS', '#739159'], todo: ['TO-DO', '#A5822C'], visa: ['VISA', '#A24D36'], career: ['CAREER', '#54676A'] };

const mail = (to, subject, body) =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

function firstName() {
  const s = store.all();
  const n = (s.auth && s.auth.name) || (s.identity && s.identity.name) || '';
  return n.split(' ')[0];
}

function message() {
  const name = firstName();
  const lines = {
    index: `Ready to plan your next adventure, ${name || 'friend'}?`,
    planner: 'Drag a course to another semester, or click one to swap it. Drag it off the board to remove it.',
    plan: 'Tick a goal when it is done and I will add a star to the jar.',
    career: 'Add the roles you are aiming for, and I will keep them next to your coursework.',
    alumni: 'Search by your major or the courses you took to find people who walked the same path.',
    visa: 'Your passport expires Dec 2026, and the travel signature is due before winter break. Ask OIE to sign the I-20 first.',
    profile: 'Office hours are Tuesday and Thursday. I will remind you.',
    resume: 'Bullets that start with a verb read stronger. Just saying.',
  };
  return lines[PAGE] || 'Ready to plan your next adventure?';
}

const goalKey = (text) =>
  `pl-goal-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

function reminders() {
  const s = store.all();
  const quiz = (s.flightplan && s.flightplan.quiz) || {};
  const items = [];
  const go = (href) => () => { location.href = href; };

  const goals = Array.isArray(quiz.goals) ? quiz.goals.map((g) => String(g).trim()).filter(Boolean) : [];
  goals.slice(0, 2).forEach((t) => {
    const key = goalKey(t);
    const done = !!store.get('checks', key, false);
    items.push({ text: t, cat: 'goal', done, pending: !done,
      toggle: () => { store.set('checks', key, done ? undefined : true); if (!done) reactPigeon('positive'); },
      go: go('plan.html') });
  });

  const todo = store.get('lists', 'plan-todo', null);
  if (Array.isArray(todo)) {
    todo.map((t, i) => ({ t, i })).filter(({ t }) => t && !t.done).slice(0, 2).forEach(({ t, i }) => {
      items.push({ text: t.t, cat: 'todo', done: false, pending: true,
        toggle: () => {
          const list = store.get('lists', 'plan-todo', []);
          if (list[i]) { list[i].done = true; store.set('lists', 'plan-todo', list); }
          reactPigeon('positive');
        },
        go: go('plan.html') });
    });
  }

  if (quiz.intl !== false && PAGE !== 'visa') {
    items.push({ text: 'your visa checklist — 1 renewal due', cat: 'visa', info: true, go: go('visa.html') });
  }

  const saved = Object.keys(s.bookmarks || {}).filter((k) => s.bookmarks[k] && !k.startsWith('al-')).length;
  if (saved && PAGE !== 'career') {
    items.push({ text: `${saved} saved job${saved === 1 ? '' : 's'} — apply to one this week`, cat: 'career', info: true, go: go('career.html') });
  }
  return items.slice(0, 5);
}

function actions() {
  const intl = ((store.all().flightplan || {}).quiz || {}).intl;
  if (PAGE === 'visa' && intl !== false) return [{ label: 'Email the OIE →',
    href: mail('oie@andrew.cmu.edu', 'Question about my visa plan', 'Hi OIE team,\n\nI have a question about my visa plan:\n\n') }];
  if (PAGE === 'career') return [{ label: 'Message your advisor →',
    href: mail('advisor@university.edu', 'Quick question about my career plan', 'Hi,\n\nCould we talk about my applications this term?\n\n') }];
  if (PAGE === 'plan') return [{ label: 'Share goals with advisor →',
    href: mail('advisor@university.edu', 'My goals this semester', 'Hi,\n\nHere are the goals I’m working toward this semester — I’d love your thoughts.\n\n') }];
  return [];
}

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const OPEN_KEY = 'flightplan.pigeonBubble';

function bubbleWanted() {
  try {
    const all = JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}');
    if (PAGE in all) return all[PAGE];
  } catch { /* fall through */ }
  /* on a phone the bubble would cover most of the screen: start closed */
  if (window.matchMedia('(max-width: 900px)').matches) return false;
  return !['index', 'planner', 'visa'].includes(PAGE);
}

function rememberBubble(open) {
  try {
    const all = JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}');
    all[PAGE] = open;
    sessionStorage.setItem(OPEN_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

let bubble = null;
let dockBox = null;

function renderBubble() {
  if (!bubble) return;
  const items = reminders();
  const pending = items.filter((i) => i.pending).length;
  bubble.textContent = '';

  const x = h('button', 'pg-bubble__x', '✕');
  x.type = 'button';
  x.title = 'Dismiss';
  x.setAttribute('aria-label', 'Close the pigeon’s note');
  x.addEventListener('click', () => {
    if (pending) reactPigeon('negative');
    setBubble(false);
  });

  bubble.append(
    x,
    h('div', 'pg-bubble__head', pending ? (pending === 1 ? 'one thing needs you' : `${pending} things need you`) : 'all clear — nice work!'),
    h('div', 'pg-bubble__from', FROM[PAGE] || 'FLIGHTPLAN'),
    h('div', 'pg-bubble__msg', message()),
  );

  items.forEach((it) => {
    const row = h('div', 'pg-item');
    const box = h('button', 'pg-item__box' + (it.done ? ' is-done' : '') + (it.info ? ' is-go' : ''),
      it.info ? '→' : (it.done ? '✓' : ''));
    box.type = 'button';
    box.title = it.info ? 'Take me there' : (it.done ? 'Uncheck' : 'Check it off');
    box.setAttribute('aria-label', `${box.title}: ${it.text}`);
    box.addEventListener('click', () => { if (it.info) it.go(); else { it.toggle(); renderBubble(); } });
    const txt = h('button', 'pg-item__text' + (it.done ? ' is-done' : ''), it.text);
    txt.type = 'button';
    txt.addEventListener('click', it.go);
    const chip = h('span', 'pg-item__chip', CAT[it.cat][0]);
    chip.style.background = CAT[it.cat][1];
    row.append(box, txt, chip);
    bubble.append(row);
  });

  actions().forEach((a) => {
    const link = h('a', 'pg-bubble__act', a.label);
    link.href = a.href;
    bubble.append(link);
  });

  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  bubble.append(h('div', 'pg-bubble__cheer', CHEERS[(doy + PAGE.length) % CHEERS.length]));

  /* Out of the way, please: the bird slides to the right edge and leaves only
     its head poking in, the way it sits on the Planner. Clicking the head
     brings it back. */
  const tuck = h('button', 'pg-bubble__tuck', 'Tuck me away \u2192');
  tuck.type = 'button';
  tuck.title = 'Send the pigeon to the edge of the screen';
  tuck.addEventListener('click', () => { if (dockBox) setPeek(dockBox, true); });
  bubble.append(tuck);
  bubble.prepend(...outline());
}

/* --- the hand-drawn outline --------------------------------------------------
   A pen line that wobbles a little at every corner, drawn twice (a firm stroke
   and a faint second pass slightly off it) the way an ink sketch doubles back.
   The body lives in a 200 x 100 box stretched to the bubble; the strokes use
   non-scaling-stroke so a tall bubble does not get fat sides. The tail is a
   separate fixed-size drawing so its point never distorts. */

const SVGNS = 'http://www.w3.org/2000/svg';

function svg(cls, attrs, paths) {
  const el = document.createElementNS(SVGNS, 'svg');
  el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  paths.forEach(([pc, d]) => {
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', pc);
    path.setAttribute('d', d);
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    el.append(path);
  });
  return el;
}

const BODY = 'M8,3 C45,1 120,3 190,2 C197,2 199,6 199,20 C198,48 200,72 198,90 C197,97 191,98 165,98 C115,97 55,99 12,98 C4,97 1,93 1,76 C2,50 0,26 2,12 C3,5 5,3 8,3 Z';
const BODY_2 = 'M12,5 C60,3 130,5 187,4 C196,5 197,14 197,32 C196,58 198,80 195,94';
const TAIL_FILL = 'M-4,0 L25,0 L24,7 C26,16 28,25 32,34 C22,28 12,20 -2,8 Z';
const TAIL_INK = 'M23,7 C25,16 28,25 32,34 C22,28 12,20 -1,8';

function outline() {
  return [
    svg('pg-bubble__shape', { viewBox: '0 0 200 100', preserveAspectRatio: 'none' },
      [['pg-bubble__fill', BODY], ['pg-bubble__ink', BODY], ['pg-bubble__ink pg-bubble__ink--2', BODY_2]]),
    svg('pg-bubble__tail', { viewBox: '0 0 34 36' },
      [['pg-bubble__fill', TAIL_FILL], ['pg-bubble__ink', TAIL_INK]]),
  ];
}

/* Where the beak is on one sprite frame (280 x 297), as a share of the frame:
   the idle, excited and sleepy loops all keep the tip within a few px of it. */
const BEAK = { x: 0.221, y: 0.296 };
/* Flipped to the right, the tail points at the top of the helmet instead. */
const CROWN = { x: 0.56, y: 0.1 };
/* The tail's tip, measured from the bubble's bottom-right corner (see the CSS:
   the 34 x 36 tail sits 26px in and 8px up, its point at 32, 34). */
const TIP = { dx: 6, dy: 26 };

/* Point on the bird, in the mascot box's own coordinates — through the bird's
   CSS transform when it has one (the Planner head is tilted). */
function birdPoint(box, share) {
  const bird = document.getElementById('pigeon-stage');
  const w = bird.offsetWidth;
  const hgt = bird.offsetHeight;
  let x = share.x * w;
  let y = share.y * hgt;
  const cs = getComputedStyle(bird);
  if (cs.transform && cs.transform !== 'none') {
    const m = new DOMMatrix(cs.transform);
    const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
    const rx = x - ox;
    const ry = y - oy;
    x = m.a * rx + m.c * ry + m.e + ox;
    y = m.b * rx + m.d * ry + m.f + oy;
  }
  return { x: bird.offsetLeft + x, y: bird.offsetTop + y };
}

function positionBubble() {
  if (!bubble || bubble.hidden || !dockBox) return;
  const box = dockBox;
  const flipped = box.classList.contains('pg-flip');
  const p = birdPoint(box, flipped ? CROWN : BEAK);
  const boxH = box.clientHeight;
  bubble.style.bottom = `${boxH - (p.y - TIP.dy)}px`;
  if (flipped) {
    bubble.style.right = 'auto';
    bubble.style.left = `${p.x + TIP.dx}px`;
  } else {
    bubble.style.left = 'auto';
    bubble.style.right = `${box.clientWidth - (p.x - TIP.dx)}px`;
  }
}

function setBubble(open) {
  if (!bubble) return;
  if (open) renderBubble();
  bubble.hidden = !open;
  rememberBubble(open);
  const bird = document.getElementById('pigeon-stage');
  if (bird) bird.setAttribute('aria-expanded', String(open));
  if (dockBox) flip(dockBox);
  positionBubble();
}

function initBubble(box) {
  bubble = h('div', 'pg-bubble');
  /* The bubble's own clicks must not start a drag on the bird. */
  bubble.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.prepend(bubble);
  setBubble(bubbleWanted());
}

/* --- dragging ---------------------------------------------------------------
   The bird can sit over a card or a button, so it can be picked up and put
   somewhere else. The whole mascot box moves (bubble, planet and all), is kept
   on screen, and remembers where it was left on each page, stored as a fraction
   of the viewport so it lands in the same place after a resize. A click without
   a drag opens or closes the bubble. Double-click (or Home/Escape while focused)
   sends it back to its corner; arrow keys nudge it. On Planner the peeking head
   only slides up and down the right edge. */

const POS_KEY = 'flightplan.pigeonPos';

function readPos() {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { return {}; }
}

function writePos(pos) {
  try {
    const all = readPos();
    if (pos) all[PAGE] = pos; else delete all[PAGE];
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch { /* storage blocked: the bird just forgets */ }
}

/* --- tucked away ------------------------------------------------------------
   The bird can be sent to the right edge, where only its head pokes in — the
   Planner's resting state, now available on every page. Tapping the head brings
   it back. Remembered per page, like its position; the Planner starts tucked. */

const PEEK_KEY = 'flightplan.pigeonPeek';

const isPeek = (box) => box.classList.contains('mascot--peek');

function readPeek() {
  try {
    const all = JSON.parse(localStorage.getItem(PEEK_KEY) || '{}');
    if (PAGE in all) return !!all[PAGE];
  } catch { /* fall through */ }
  return PAGE === 'planner';
}

function writePeek(on) {
  try {
    const all = JSON.parse(localStorage.getItem(PEEK_KEY) || '{}');
    all[PAGE] = on;
    localStorage.setItem(PEEK_KEY, JSON.stringify(all));
  } catch { /* storage blocked: it just forgets */ }
}

function setPeek(box, on, remember = true) {
  box.classList.toggle('mascot--peek', on);
  const bird = box.querySelector('#pigeon-stage');
  if (bird) {
    bird.title = on
      ? 'Click to bring the pigeon back'
      : 'Click to talk to the pigeon — drag to move it';
  }
  if (on) {
    setBubble(false);
    /* the edge position is the stylesheet's; only the height it sits at is kept */
    box.style.removeProperty('left');
    box.style.removeProperty('right');
    box.style.removeProperty('bottom');
  } else {
    unplace(box);
  }
  if (remember) writePeek(on);
  positionBubble();
}

/* The control that sends it away lives in the speech bubble (see renderBubble),
   so the whole thing is one gesture: click the bird, then "Tuck me away". */

/* Not enough room to the bird's left for the bubble: open it on the right. */
function flip(box) {
  if (isPeek(box)) return;
  const r = box.getBoundingClientRect();
  const need = bubble && !bubble.hidden ? bubble.offsetWidth : 300;
  box.classList.toggle('pg-flip', r.left + r.width * .22 < need + 8);
  positionBubble();
}

function place(box, left, top) {
  const y = Math.min(Math.max(0, top), Math.max(0, window.innerHeight - box.offsetHeight));
  box.style.top = `${y}px`;
  box.style.bottom = 'auto';
  if (!isPeek(box)) {
    const x = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - box.offsetWidth));
    box.style.left = `${x}px`;
    box.style.right = 'auto';
  }
  flip(box);
}

function unplace(box) {
  ['left', 'top', 'right', 'bottom'].forEach((k) => box.style.removeProperty(k));
  flip(box);
}

function save(box) {
  const r = box.getBoundingClientRect();
  writePos({ x: r.left / window.innerWidth, y: r.top / window.innerHeight });
}

function restore(box) {
  const pos = readPos()[PAGE];
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
    place(box, pos.x * window.innerWidth, pos.y * window.innerHeight);
  } else flip(box);
}

function initDock() {
  const bird = ensureDock();
  const box = bird && bird.closest('.mascot, .pl-mascot, .gb-mascot');
  if (!box || bird.dataset.draggable) return;
  dockBox = box;
  bird.dataset.draggable = '1';
  bird.tabIndex = 0;
  bird.setAttribute('role', 'button');
  bird.title = 'Click to talk to the pigeon — drag to move it';

  initBubble(box);
  if (readPeek()) setPeek(box, true, false); else restore(box);
  /* The box can still change size after this (the Goals planet image loads
     late, the bird scales with the window), so the tail is re-aimed whenever
     it does. */
  if ('ResizeObserver' in window) new ResizeObserver(() => positionBubble()).observe(box);

  let drag = null;

  bird.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const r = box.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    try { bird.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    e.preventDefault();
  });

  bird.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
    if (!drag.moved) { drag.moved = true; box.classList.add('is-dragging'); }
    place(box, e.clientX - drag.dx, e.clientY - drag.dy);
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved } = drag;
    box.classList.remove('is-dragging');
    drag = null;
    if (moved) {
      /* dropped against the right edge: tuck it away there */
      if (!isPeek(box) && box.getBoundingClientRect().right >= window.innerWidth - 2) {
        writePos(null);
        setPeek(box, true);
        return;
      }
      save(box);
      return;
    }
    if (e.type !== 'pointerup') return;
    /* A plain click: bring a tucked bird back, wake a dozing one, otherwise
       open or close the bubble. */
    if (isPeek(box)) { setPeek(box, false); return; }
    if (expr === 'sleepy') { restPigeon(); return; }
    setBubble(bubble.hidden);
  };
  bird.addEventListener('pointerup', end);
  bird.addEventListener('pointercancel', end);

  bird.addEventListener('dblclick', () => { unplace(box); writePos(null); setPeek(box, false); });

  bird.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (isPeek(box)) setPeek(box, false); else setBubble(bubble.hidden);
      e.preventDefault();
      return;
    }
    if (e.key === 'Home' || e.key === 'Escape') { unplace(box); writePos(null); setPeek(box, false); e.preventDefault(); return; }
    const step = e.shiftKey ? 60 : 20;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    const r = box.getBoundingClientRect();
    place(box, r.left + d[0], r.top + d[1]);
    save(box);
    e.preventDefault();
  });

  /* Keep a moved bird on screen when the window changes size. */
  window.addEventListener('resize', () => {
    if (isPeek(box)) { /* the edge keeps it */ }
    else if (box.style.top) restore(box);
    else flip(box);
    positionBubble();
  });

  /* Ticking a goal or to-do on the page itself should show in an open bubble. */
  document.addEventListener('change', () => { if (!bubble.hidden) setTimeout(renderBubble, 0); });
}

function boot() {
  initDock();
  start();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
