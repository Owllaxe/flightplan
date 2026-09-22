/* The pigeon, on its own — pigeon-demo.html.

   A stage for the mascot: one big bird in the middle of an empty screen with
   the site's own speech bubble open beside it — the same bubble, with the same
   reminders, outreach button and cheer line the rest of the site shows — while
   it walks through every animation it has.

   Everything here is driven through js/pigeon.js rather than copied from it:
   the page carries the same `#pigeon-stage` inside a `.mascot` box that any
   other page does, so that module builds the bubble, and `playPigeon` runs the
   frames. This page only decides what to play and when. */

import { SEGMENTS, playPigeon, openBubble } from './pigeon.js';

const FPS = 15;

/* The order the demo walks through. `loops` is how many times a looping
   segment repeats before the next animation takes over; `hold` is how long an
   endlessly looping one (idle, sleepy) stays on screen. */
const SHOW = [
  { key: 'idle', label: 'Idle', hold: 4200 },
  { key: 'excited', label: 'Excited', loops: 2 },
  { key: 'sleepy', label: 'Sleepy', hold: 5200 },
  { key: 'crying', label: 'Sad', loops: 1 },
  { key: 'angry', label: 'Annoyed', loops: 1 },
];

const tabs = document.getElementById('pgDemoTabs');
const playBtn = document.getElementById('pgDemoPlay');
const now = document.getElementById('pgDemoNow');

/** How long js/pigeon.js will be busy with one segment, in ms. */
function span(item) {
  const seg = SEGMENTS[item.key];
  if (!seg) return 2000;
  if (item.hold) return item.hold;
  const n = (seg.entry || []).length
    + (seg.loop || []).length * Math.max(1, item.loops || 1)
    + (seg.accent || []).length
    + (seg.exit || []).length;
  return (n / FPS) * 1000 + 200;      /* + a beat on the idle it returns to */
}

let at = 0;
let timer = null;
let auto = true;

function paintChrome() {
  const item = SHOW[at];
  now.textContent = item.label;
  [...tabs.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seg === item.key)));
  document.title = `Pigeon — ${item.label}`;
}

function run() {
  clearTimeout(timer);
  const item = SHOW[at];
  paintChrome();
  playPigeon(item.key, item.loops);
  if (auto) timer = setTimeout(next, span(item));
}

function next() {
  at = (at + 1) % SHOW.length;
  run();
}

function show(key) {
  const i = SHOW.findIndex((s) => s.key === key);
  if (i < 0) return;
  at = i;
  auto = false;                 /* picking one holds it until Play all */
  paintPlay();
  run();
}

function paintPlay() {
  playBtn.textContent = auto ? 'Pause' : 'Play all';
  playBtn.setAttribute('aria-pressed', String(auto));
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
  auto = !auto;
  paintPlay();
  if (auto) next(); else clearTimeout(timer);
});

document.getElementById('pgDemoNext').addEventListener('click', () => { auto = true; paintPlay(); next(); });

/* The site holds the pigeon still when the computer asks for less motion, so
   say so here rather than let the page look broken. */
const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionNote = document.getElementById('pgDemoMotion');
const paintMotion = () => { motionNote.hidden = !lessMotion.matches; };
lessMotion.addEventListener('change', paintMotion);
paintMotion();

/* js/pigeon.js wires the bird itself (click opens and closes the bubble, drag
   moves it), and it restores whatever the session last remembered — so the
   bubble is opened here, since this page is about showing it. */
openBubble();
paintPlay();
run();
