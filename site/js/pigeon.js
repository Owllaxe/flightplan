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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
