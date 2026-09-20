/* The pigeon, on its own — pigeon-demo.html.

   A stage for the mascot: one big bird in the middle of an empty screen, its
   speech bubble open beside it, walking through every animation it has.

   It plays the SAME table js/pigeon.js uses (SEGMENTS) and draws the SAME
   hand-drawn bubble (outline), both imported rather than copied, so this page
   cannot drift from the pigeon on the real site. Importing that module is
   otherwise inert here: its dock looks for `#pigeon-stage` or a sidebar, and
   this page has neither. */

import { SEGMENTS, outline } from './pigeon.js';

const FPS = 15;
const COLS = 11;
const ROWS = 11;

/* The order the demo walks through, with what the bubble says for each and how
   many times a looping segment repeats before moving on. */
const SHOW = [
  { key: 'idle', label: 'Idle', line: 'Just here, keeping an eye on your plan.', loops: 1 },
  { key: 'excited', label: 'Excited', line: 'You ticked something off — that is a star in the jar.', loops: 2 },
  { key: 'sleepy', label: 'Sleepy', line: 'Two quiet minutes and I nod off. Any click wakes me.', loops: 3 },
  { key: 'crying', label: 'Sad', line: 'That deadline went past. We can still fix it.', loops: 1 },
  { key: 'angry', label: 'Annoyed', line: 'That course is out of prerequisite order!', loops: 1 },
];

const stage = document.getElementById('pgDemoStage');
const bubble = document.getElementById('pgDemoBubble');
const head = document.getElementById('pgDemoHead');
const line = document.getElementById('pgDemoLine');
const tabs = document.getElementById('pgDemoTabs');
const playBtn = document.getElementById('pgDemoPlay');

/* --- the sprite ------------------------------------------------------------- */

function draw(i) {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  stage.style.backgroundSize = `${COLS * w}px ${ROWS * h}px`;
  stage.style.backgroundPosition = `${-(i % COLS) * w}px ${-Math.floor(i / COLS) * h}px`;
}

/** One flat list of frames for a segment: entry, the loop N times, accent, exit. */
function frames(key, loops) {
  const seg = SEGMENTS[key];
  if (!seg) return [];
  const out = [];
  const add = (a) => { if (a) out.push(...a); };
  add(seg.entry);
  for (let i = 0; i < Math.max(1, loops); i += 1) add(seg.loop);
  add(seg.accent);
  add(seg.exit);
  return out;
}

/* --- the walk-through ------------------------------------------------------- */

let at = 0;            /* which entry of SHOW is on screen */
let timer = null;
let playing = true;
let auto = true;       /* auto = advance to the next animation when this one ends */

function paintChrome() {
  const item = SHOW[at];
  head.textContent = item.label;
  line.textContent = item.line;
  [...tabs.children].forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.seg === item.key));
  });
  document.title = `Pigeon — ${item.label}`;
}

function run() {
  clearInterval(timer);
  const item = SHOW[at];
  const list = frames(item.key, item.loops);
  paintChrome();
  draw(list[0]);
  if (!playing) return;

  let i = 0;
  timer = setInterval(() => {
    i += 1;
    if (i >= list.length) {
      if (!auto) { i = 0; } else { next(); return; }
    }
    draw(list[i]);
  }, 1000 / FPS);
}

function next() {
  at = (at + 1) % SHOW.length;
  run();
}

function show(key) {
  const i = SHOW.findIndex((s) => s.key === key);
  if (i < 0) return;
  at = i;
  auto = false;              /* picking one holds it until Play again */
  playing = true;
  paintPlay();
  run();
}

function paintPlay() {
  playBtn.textContent = playing && auto ? 'Pause' : 'Play all';
  playBtn.setAttribute('aria-pressed', String(playing && auto));
}

/* --- wiring ----------------------------------------------------------------- */

SHOW.forEach((item) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pgd-tab';
  b.dataset.seg = item.key;
  b.textContent = item.label;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => show(item.key));
  tabs.append(b);
});

playBtn.addEventListener('click', () => {
  if (playing && auto) { playing = false; clearInterval(timer); }
  else { playing = true; auto = true; run(); }
  paintPlay();
});

/* Clicking the bird itself skips to the next animation, which is the handiest
   control while recording. */
stage.addEventListener('click', () => { auto = true; playing = true; paintPlay(); next(); });

/* The bubble's tail is parked on the beak, which sits at this share of a frame
   — the same measurement js/pigeon.js uses for the real bubble. */
const BEAK = { x: 0.221, y: 0.296 };
const TIP = { dx: 6, dy: 26 };

function placeBubble() {
  const w = stage.offsetWidth;
  const h = stage.offsetHeight;
  const right = w - (BEAK.x * w - TIP.dx);
  bubble.style.right = `${right}px`;
  bubble.style.bottom = `${h - (BEAK.y * h - TIP.dy)}px`;

  /* On a narrow screen there is not always room to the bird's left, so the
     bubble is pulled back until it clears the edge; the tail still leaves it
     towards the beak. */
  const r = bubble.getBoundingClientRect();
  if (r.left < 12) bubble.style.right = `${right + r.left - 12}px`;
}

bubble.prepend(...outline());
placeBubble();
if ('ResizeObserver' in window) new ResizeObserver(placeBubble).observe(stage);
window.addEventListener('resize', placeBubble);

paintPlay();
run();
