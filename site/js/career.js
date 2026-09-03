/* Career screen states, matching the three Figma frames:
     388:56   compact grid + start-ups rail
     388:245  expanded grid (rail hidden)
     388:470  start-up detail (grid hidden, detail pane open)

   There are two expansions on this screen, and both of them move the SAME
   element — the start-ups panel. Nothing else ever travels.

     the listings ⤢   .startups flies off to the RIGHT and the revealed job
                      cards rise in behind it
     the directory ↗   .startups sweeps LEFTWARD from its right half across the
                      whole content width, covering the listings grid, and the
                      wide rows rise in inside it

   In both cases the panel is pinned `position: fixed` over a measured rect for
   the duration, so neither `.main`'s clip nor a scroll box can crop it, and it
   is moved with `transform` alone. The listings grid never animates in either
   sequence: the ⤢ reveals it in place, and the directory sweep parks it over
   its own rect (`.jobs.is-held`) one layer down and simply covers it. The
   content that arrives animates `jobRise` over `--card-ms` with a
   `--stagger-ms` step. Transform and opacity only, so no step of either
   sequence can move the page.

   Every duration lives in career.css as a custom property on `.career-page`;
   this module reads them back, which is what makes the `prefers-reduced-motion`
   block over there switch the choreography off here as well. */

import { store } from './store.js';
import { readIdentity } from './sidebar.js';

const body     = document.getElementById('careerBody');
const jobs     = document.getElementById('jobs');
const expand   = document.getElementById('expandToggle');
const saved    = document.getElementById('savedExpand');
const filters  = document.getElementById('filters');
const startups = document.getElementById('startups');
const list     = document.getElementById('startupsList');
const wide     = document.getElementById('startupsWide');
const back     = document.getElementById('startupsBack');
const detail   = document.getElementById('startupDetail');
const dTitle   = document.getElementById('startupDetailTitle');
const dBody    = document.getElementById('startupDetailBody');

const rail     = document.getElementById('savedRail');
const savedList = document.getElementById('savedList');
const savedEmpty = document.getElementById('savedEmpty');
const savedCount = document.querySelector('[data-saved-count]');

/* the listing detail — the pane that opens where the start-ups panel sits */
const jobDetail = document.getElementById('jobDetail');
const jdTag     = document.getElementById('jobDetailTag');
const jdTitle   = document.getElementById('jobDetailTitle');
const jdCompany = document.getElementById('jobDetailCompany');
const jdLoc     = document.querySelector('#jobDetailLoc span');
const jdFacts   = document.getElementById('jobDetailFacts');
const jdBody    = document.getElementById('jobDetailBody');
const jdSkills  = document.getElementById('jobDetailSkills');
const jdVisa    = document.getElementById('jobDetailVisa');
const jdVisaTxt = document.getElementById('jobDetailVisaText');
const jdSave    = document.getElementById('jobDetailSave');
const jdClose   = document.getElementById('jobDetailClose');

/* the directory record inside the wide panel */
const wideLogo   = document.getElementById('wideLogo');
const wideTitle  = document.getElementById('wideTitle');
const wideMeta   = document.getElementById('wideMeta');
const wideBlurbs = document.getElementById('wideBlurbs');
const wideRoles  = document.getElementById('wideRoles');
const wideMail   = document.getElementById('wideMail');
const wideMsg    = document.getElementById('wideMsg');

/* the Message → composer */
const msgTitle = document.getElementById('msgTitle');
const msgMeta  = document.getElementById('msgMeta');
const msgBody  = document.getElementById('msgBody');
const msgCopy  = document.getElementById('msgCopy');
const msgSave  = document.getElementById('msgSave');
const msgDone  = document.getElementById('msgDone');

/* Only the toolbar ⤢ drives the listings grid. The ↓ in the panel header opens
   the saved list itself — a different thing entirely, wired further down, and
   it never reads or writes any grid state. */
const toggles = [expand];

/* --- motion ---------------------------------------------------------------- */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/** A duration token from career.css, in milliseconds. */
function ms(name) {
  return parseFloat(getComputedStyle(body).getPropertyValue(name)) || 0;
}

/** Timings, resolved fresh on every toggle so a media-query change lands. */
function timing() {
  return {
    panel:   ms('--panel-ms'),
    card:    ms('--card-ms'),
    cardOut: ms('--card-out-ms'),
    stagger: ms('--stagger-ms'),
    staggerOut: ms('--stagger-out-ms'),
  };
}

function still(t) { return reduced.matches || t.panel === 0; }

let pending = [];
function later(fn, delay) { pending.push(setTimeout(fn, delay)); }

/** Drop any transition or keyframe animation still attached to an element, so
    clearing its classes always lands on the resting style. */
function stop(el) {
  el.getAnimations?.().forEach((a) => a.cancel());
}

/** Freeze an element over the box it currently occupies. */
function pin(el, rect) {
  el.style.position = 'fixed';
  el.style.left   = `${rect.left}px`;
  el.style.top    = `${rect.top}px`;
  el.style.width  = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.margin = '0';
}

const FLIGHT = ['is-flying', 'is-moving', 'is-gone', 'is-back',
                'is-sweep', 'is-swept', 'is-held'];

/** Put a flown half back exactly as the stylesheet leaves it. */
function land(el) {
  el.classList.remove(...FLIGHT);
  el.removeAttribute('style');
  stop(el);
}

/** Un-stagger a set of rows or cards. */
function clearRise(nodes) {
  nodes.forEach((n) => { n.style.removeProperty('--i'); stop(n); });
}

/** Land every in-flight animation immediately — a second click never stacks,
    and no class, pin or inline style can outlive the sequence that set it. */
function settle() {
  pending.forEach(clearTimeout);
  pending = [];

  land(startups);
  land(jobs);

  wide.classList.remove('is-rising', 'is-leaving');
  wide.removeAttribute('style');
  stop(wide);
  clearRise([...wide.children]);

  detail.classList.remove('is-rising');
  stop(detail);

  jobDetail.classList.remove('is-rising');
  stop(jobDetail);

  jobs.querySelectorAll('.job.is-rising, .job.is-leaving').forEach((card) => {
    card.classList.remove('is-rising', 'is-leaving');
    card.removeAttribute('style');
    stop(card);
  });
}

/** The shared entrance: `nodes` rise into place, staggered. */
function riseIn(nodes, t, host, cls = 'is-rising') {
  if (!nodes.length && !host) return;
  nodes.forEach((n, i) => n.style.setProperty('--i', i));
  (host ? [host] : nodes).forEach((n) => n.classList.add(cls));
  const total = t.card + t.stagger * Math.max(0, nodes.length - 1);
  later(() => {
    (host ? [host] : nodes).forEach((n) => n.classList.remove(cls));
    clearRise(nodes);
  }, total + 30);
}

/** Hold a half over the box it occupies right now. Measured BEFORE the class
    goes on, because `is-flying` takes it out of flow. */
function hold(el) {
  const resting = el.getBoundingClientRect();
  el.classList.add('is-flying');
  pin(el, resting);
}

/** Park an element over the box it occupies right now and leave it there,
    untransformed and unanimated. Used for the listings grid while the start-ups
    panel sweeps across it: it is covered, not moved. */
function holdStill(el) {
  const resting = el.getBoundingClientRect();
  el.classList.add('is-held');
  pin(el, resting);
}

/** The shared exit for a half: hold it where it is, then push it off `edge`. */
function flyOut(el, edge) {
  void el.offsetWidth;                       /* settle at the pinned box, untransitioned */
  el.classList.add('is-moving', edge);
}

/** The shared return for a half: place it off `edge`, then let it come back. */
function flyIn(el, edge) {
  hold(el);
  el.classList.add(edge);
  void el.offsetWidth;                       /* placed off screen, no transition */
  el.classList.add('is-moving', 'is-back');
  el.classList.remove(edge);
}

/* --- expand / collapse the listings grid ----------------------------------- */

const isExpanded = () => body.classList.contains('is-expanded');

/** Both controls, one source of truth. */
function paintToggles(on) {
  toggles.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-expanded', String(on));
    btn.setAttribute('aria-label', on ? 'Collapse the listings grid' : 'Expand the listings grid');
  });
}

function setExpanded(on) {
  body.classList.toggle('is-expanded', on);
  document.body.classList.toggle('is-expanded', on);
  paintToggles(on);
  /* the single writer for this state, so it is the single place that remembers
     it — whatever the grid looks like when you leave is what you come back to */
  store.set('checks', 'career-expanded', on || undefined);
}

/** The cards `:nth-child(n + 9)` reveals — minus any the filters have hidden. */
function revealed() {
  return [...jobs.children].slice(8).filter((c) => !c.classList.contains('is-filtered'));
}

function expandGrid() {
  settle();
  const t = timing();
  if (still(t)) { setExpanded(true); return; }

  /* hold the start-ups panel over the box it has now, so switching the grid
     underneath it does not move or hide it */
  hold(startups);

  setExpanded(true);          /* grid -> one column, cards 9-16 revealed */
  riseIn(revealed(), t);

  flyOut(startups, 'is-gone');/* ... then slide off right */

  later(() => land(startups), t.panel);
}

function collapseGrid() {
  settle();
  const t = timing();
  if (still(t)) { setExpanded(false); return; }

  /* freeze the cards that are about to go, so the grid can reflow beneath
     them while they drop out */
  const cards = revealed();
  const rects = cards.map((c) => c.getBoundingClientRect());
  cards.forEach((card, i) => {
    pin(card, rects[i]);
    card.style.setProperty('--i', i);
    card.classList.add('is-leaving');
  });

  setExpanded(false);         /* grid -> two columns, .startups back in flow */
  flyIn(startups, 'is-gone'); /* pinned off screen right, then slides back */

  later(() => land(startups), t.panel);

  const total = t.cardOut + t.staggerOut * Math.max(0, cards.length - 1);
  later(() => cards.forEach((card) => {
    card.classList.remove('is-leaving');
    card.removeAttribute('style');
    stop(card);
  }), total + 30);
}

function toggleExpanded() {
  if (isWide()) setWide(false);   /* instant — the ⤢ never plays the wide swipe */
  closeJobDetail();               /* the grid is about to take the whole width */
  if (isExpanded()) collapseGrid();
  else { closeDetail(); expandGrid(); }
}

toggles.forEach((btn) => btn.addEventListener('click', toggleExpanded));

/* --- SAVED LISTS: the ↓ drops the panel open over the page ------------------
   This control owns the rail and nothing else. It never reads `is-expanded`,
   never calls into the grid choreography, and its handler is bound to
   `#savedExpand` alone — so no entry path (grid expanded, a detail open, the
   directory wide) can make it touch the listings. */

const isSavedOpen = () => rail.classList.contains('is-open');

/** Tall enough for the whole list, but never past the bottom of the window. */
function savedHeight() {
  const head = 52;                                  /* header + its 15px gap */
  const want = head + savedList.scrollHeight;
  const room = window.innerHeight - rail.getBoundingClientRect().top - 24;
  return Math.max(180, Math.min(want, room));
}

function setSavedOpen(on) {
  if (on) rail.style.setProperty('--saved-open-h', `${savedHeight()}px`);
  rail.classList.toggle('is-open', on);
  saved.setAttribute('aria-expanded', String(on));
  saved.setAttribute('aria-label', on ? 'Collapse the saved list' : 'Show the whole saved list');
}

saved.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setSavedOpen(!isSavedOpen());
});

/* Clicking anywhere else, or pressing Escape, puts it away again. */
document.addEventListener('pointerdown', (e) => {
  if (isSavedOpen() && !rail.contains(e.target)) setSavedOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isSavedOpen()) setSavedOpen(false);
});
window.addEventListener('resize', () => { if (isSavedOpen()) setSavedOpen(true); });

/* --- category filters ------------------------------------------------------ */

function applyFilters() {
  const active = [...filters.querySelectorAll('.filter.is-on')].map((b) => b.dataset.cat);
  jobs.querySelectorAll('.job').forEach((job) => {
    job.classList.toggle('is-filtered', active.length > 0 && !active.includes(job.dataset.cat));
  });
}

filters.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter');
  if (!btn) return;
  btn.classList.toggle('is-on');
  btn.setAttribute('aria-pressed', String(btn.classList.contains('is-on')));
  applyFilters();
  saveFilters();
});

/** Which categories are switched on, remembered across loads. `undefined` when
    none are, so the store does not carry an empty array around forever. */
function saveFilters() {
  const on = [...filters.querySelectorAll('.filter.is-on')].map((b) => b.dataset.cat);
  store.set('lists', 'career-filters', on.length ? on : undefined);
}

/** The mirror of saveFilters, run once at boot. It paints `aria-pressed` on
    every button, which is also what gives the three that start off their
    initial value. */
function restoreFilters() {
  const on = store.get('lists', 'career-filters', []);
  const want = Array.isArray(on) ? on : [];
  filters.querySelectorAll('.filter').forEach((btn) => {
    const active = want.includes(btn.dataset.cat);
    btn.classList.toggle('is-on', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

/* --- start-ups: the full-width directory -----------------------------------
   The panel is the thing that moves. Nothing here is used by the detail pane —
   opening a detail runs none of it. */

const isWide = () => body.classList.contains('is-startups-wide');

function setWide(on) {
  body.classList.toggle('is-startups-wide', on);
  /* also on the page body: `.career-tools` is a sibling of `.career-body`, so a
     class on the body element alone can never reach it */
  document.body.classList.toggle('is-startups-wide', on);
  if (on) setSavedOpen(false);
  back.setAttribute('aria-expanded', String(on));
  back.setAttribute('aria-label', on
    ? 'Close the full start-up directory'
    : 'Open the full start-up directory');
}

/** The rect the panel rests in at half width. Measured by taking the wide class
    off and putting it straight back inside one task, so nothing paints in
    between and the reading is the real resting geometry, not an estimate. */
function halfRect() {
  const on = body.classList.contains('is-startups-wide');
  body.classList.remove('is-startups-wide');
  document.body.classList.remove('is-startups-wide');
  const r = startups.getBoundingClientRect();
  body.classList.toggle('is-startups-wide', on);
  document.body.classList.toggle('is-startups-wide', on);
  return r;
}

/** Pin the panel over `box` and hold the wide arrangement inside it, so its
    insides cannot reflow while it is in flight. */
function pinSweep(box) {
  startups.classList.add('is-flying', 'is-sweep');
  pin(startups, box);
}

function enterWide() {
  settle();
  renderWide(wideSlug);       /* the record is right before the panel is measured */
  const t = timing();
  if (still(t)) { setWide(true); return; }

  const home = startups.getBoundingClientRect();   /* its right-half rect */

  /* park the listings grid over the box it has now: it does not move, it gets
     covered — so it must stay painted while the panel travels across it */
  holdStill(jobs);

  setWide(true);              /* panel -> full width, the directory shows */

  const full = startups.getBoundingClientRect();   /* the whole content width */
  pinSweep(full);

  /* start it full width but sitting over its half-width home ... */
  startups.style.setProperty('--sweep-x', `${home.left - full.left}px`);
  startups.classList.add('is-swept');
  void startups.offsetWidth;                       /* placed, untransitioned */
  startups.classList.add('is-moving');
  startups.classList.remove('is-swept');           /* ... then sweep leftward */

  riseIn([...wide.children], t, wide);

  later(() => { land(startups); land(jobs); }, t.panel);
}

function leaveWide() {
  settle();
  const t = timing();
  if (still(t)) { setWide(false); return; }

  const full = startups.getBoundingClientRect();   /* the whole content width */
  const home = halfRect();                         /* where it is going back to */

  pinSweep(full);

  /* the directory rows drop out inside the panel as it travels — no pin of
     their own, they ride along. The step is squeezed so the last row is gone
     by the time the panel lands and the wide arrangement goes away. */
  const rows = [...wide.children];
  const step = rows.length > 1
    ? Math.min(t.staggerOut, Math.max(0, (t.panel - t.cardOut) / (rows.length - 1)))
    : 0;
  wide.style.setProperty('--stagger-out-ms', `${step}ms`);
  rows.forEach((n, i) => n.style.setProperty('--i', i));
  wide.classList.add('is-leaving');

  setWide(false);             /* .jobs back in flow, still and covered */

  startups.style.setProperty('--sweep-x', `${home.left - full.left}px`);
  void startups.offsetWidth;                       /* placed, untransitioned */
  startups.classList.add('is-moving', 'is-swept'); /* sweep back rightward */

  later(() => {
    land(startups);
    wide.classList.remove('is-leaving');
    wide.removeAttribute('style');
    stop(wide);
    clearRise(rows);
  }, t.panel);
}

/* --- start-up cards -------------------------------------------------------- */

/** `is-open` marks the selected card. The enlarge-and-reveal is a hover /
    focus state in career.css, so nothing is ever stuck open. */
function selectCard(card) {
  list.querySelectorAll('.startup').forEach((c) => c.classList.toggle('is-open', c === card));
}

/** Opening a detail plays ONE animation — the pane rising in. Leaving the wide
    state or the expanded grid to get here is a state switch, not a swipe, so
    the two sequences can never run at once. */
function openDetail(card) {
  settle();
  closeJobDetail();           /* the two panes share a column — never both */
  if (isWide()) setWide(false);
  if (isExpanded()) setExpanded(false);

  selectCard(card);
  dTitle.textContent = card.querySelector('.startup__name').textContent;
  dBody.innerHTML = '';
  (card.dataset.detail || '').split('\n\n').forEach((para) => {
    if (!para.trim()) return;
    const p = document.createElement('p');
    p.textContent = para.trim();
    dBody.append(p);
  });

  body.classList.add('is-detail');

  const t = timing();
  if (still(t)) return;
  void detail.offsetWidth;
  detail.classList.add('is-rising');
  later(() => { detail.classList.remove('is-rising'); stop(detail); }, t.card + 30);
}

function closeDetail() {
  if (!body.classList.contains('is-detail')) return;
  settle();
  body.classList.remove('is-detail');
  selectCard(null);
}

/** A click on a card means one of two things depending on where you are. In the
    directory the left rail is a picker: the record beside it swaps and the
    directory stays open. Everywhere else it opens that start-up's detail pane,
    exactly as it did before. */
function pickCard(card) {
  if (isWide()) { selectCard(card); showWideRecord(card); return; }
  openDetail(card);
}

list.addEventListener('click', (e) => {
  if (e.target.closest('.bookmark') || e.target.closest('.btn') || e.target.closest('.startup__mail')) return;
  const card = e.target.closest('.startup');
  if (card) pickCard(card);
});

/* keyboard: the card itself is a tab stop, Enter or Space opens its detail */
list.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.startup');
  if (!card || e.target !== card) return;
  e.preventDefault();
  pickCard(card);
});

/* The one circular control in the panel header: Back while a detail is open,
   otherwise the full-width directory. */
back.addEventListener('click', () => {
  if (body.classList.contains('is-detail')) { closeDetail(); return; }
  if (isWide()) leaveWide();
  else enterWide();
});

/* --- the listing detail ----------------------------------------------------
   The cards advertised a click for a long time without answering one. They
   answer it here, and the pane they open takes the column the start-ups panel
   normally holds — so the grid you were reading stays on screen and you can
   walk down it card by card. Opening one is the same single animation the
   start-up detail plays: the pane rises in, nothing swipes. */

const FACTS = [['Commitment', 'term'], ['Pay', 'pay'], ['Deadline', 'deadline']];

/** Which card the open pane belongs to, or null. */
let openJob = null;

function selectJob(card) {
  jobs.querySelectorAll('.job').forEach((c) => c.classList.toggle('is-selected', c === card));
  openJob = card;
}

/** The pane's own save button is a remote control for the card's bookmark: it
    clicks the real one, so app.js still owns the store write and the rail below
    still hears about it. One writer, three places that show the result. */
function syncSave() {
  if (!openJob) return;
  const id = openJob.querySelector('.bookmark').dataset.bookmark;
  const on = Boolean(store.get('bookmarks', id, false));
  jdSave.textContent = on ? 'Saved ✓' : 'Save listing';
  jdSave.setAttribute('aria-pressed', String(on));
}

/** Make sure a card is actually on screen before its detail opens. Two things
    can be hiding it: a category filter, and the grid being compact — cards 9-16
    exist only when it is expanded. Both are cleared rather than worked around,
    because opening a listing you cannot see would be worse than either. */
function revealJob(card) {
  if (card.classList.contains('is-filtered')) {
    filters.querySelectorAll('.filter.is-on').forEach((b) => {
      b.classList.remove('is-on');
      b.setAttribute('aria-pressed', 'false');
    });
    applyFilters();
    saveFilters();
  }
  if ([...jobs.children].indexOf(card) >= 8 && !isExpanded()) setExpanded(true);
}

function openJobDetail(card) {
  settle();
  if (isWide()) setWide(false);
  closeDetail();              /* a start-up and a listing never show at once */

  selectJob(card);
  jdTag.className = `tag tag--${card.dataset.cat}`;
  jdTag.textContent = card.querySelector('.tag').textContent;
  jdTitle.textContent   = card.querySelector('.job__title').textContent;
  jdCompany.textContent = card.querySelector('.job__company').textContent;
  jdLoc.textContent     = card.querySelector('.job__loc').textContent.trim();

  jdFacts.replaceChildren(...FACTS.flatMap(([label, key]) => {
    const value = card.dataset[key];
    if (!value) return [];
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    return [dt, dd];
  }));

  jdBody.replaceChildren(...(card.dataset.detail || '').split('\n\n')
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => {
      const p = document.createElement('p');
      p.textContent = para;
      return p;
    }));

  jdSkills.replaceChildren(...(card.dataset.skills || '').split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const li = document.createElement('li');
      li.className = 'job-detail__skill';
      li.textContent = s;
      return li;
    }));

  /* the ! on the card, spelled out — the whole reason this page exists */
  jdVisaTxt.textContent = card.dataset.visa || '';
  jdVisa.hidden = !card.dataset.visa;

  syncSave();
  body.classList.add('is-job-detail');

  const t = timing();
  if (still(t)) return;
  void jobDetail.offsetWidth;
  jobDetail.classList.add('is-rising');
  later(() => { jobDetail.classList.remove('is-rising'); stop(jobDetail); }, t.card + 30);
}

function closeJobDetail() {
  if (!body.classList.contains('is-job-detail')) return;
  settle();
  body.classList.remove('is-job-detail');
  selectJob(null);
}

jobs.addEventListener('click', (e) => {
  if (e.target.closest('.bookmark')) return;     /* saving is not opening */
  const card = e.target.closest('.job');
  if (card) openJobDetail(card);
});

/* keyboard: same contract as the start-up cards — the article is the tab stop */
jobs.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.job');
  if (!card || e.target !== card) return;
  e.preventDefault();
  openJobDetail(card);
});

jdClose.addEventListener('click', closeJobDetail);
jdSave.addEventListener('click', () => openJob?.querySelector('.bookmark').click());

/* Escape puts an open pane away, unless the composer is up — that one is
   app.js's to close, and it is on top. */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (document.querySelector('.modal-backdrop.is-open')) return;
  if (body.classList.contains('is-job-detail')) closeJobDetail();
  else if (body.classList.contains('is-detail')) closeDetail();
});

/* --- the start-up directory records ----------------------------------------
   The wide panel used to be one placeholder record that all four cards opened.
   Each card now has its own, and the panel's skeleton in career.html never
   changes shape — only the text and the role rows below are replaced, so the
   sweep still staggers the same seven children it always did. */

const TAG_LABEL = {
  internship: 'INTERNSHIP', research: 'RESEARCH',
  oncampus: 'ON-CAMPUS', newgrad: 'NEW GRAD',
};

const STARTUPS = {
  nimbus: {
    mono: 'NN', tone: 'peach', title: 'Nimbus Notes',
    meta: 'EdTech · Pre-seed · Founded 2025 · 4 people · Pittsburgh, PA',
    blurbs: [
      'Nimbus Notes turns a lecture recording into a clean set of notes and a study guide before the class has left the room. Two CS juniors built it after a semester of unreadable handwriting.',
      'About two thousand students across nine campuses used it through finals last spring. Founded by alumni of the School of Computer Science; the team works out of the incubator space on Henry Street.',
    ],
    roles: [
      { cat: 'internship', name: 'Front-End Engineer', meta: 'Remote · 10 hrs / week · Paid' },
      { cat: 'internship', name: 'Content Lead', meta: 'Remote · 8 hrs / week · Paid' },
    ],
  },
  fernweg: {
    mono: 'FW', tone: 'sage', title: 'Fernweg',
    meta: 'Travel Tech · Seed · Founded 2024 · 6 people · Pittsburgh + Ithaca',
    blurbs: [
      'Fernweg is trip planning built by students for students — group itineraries, a shared budget that settles itself, and edits everyone sees at once.',
      'The team is six people across two campuses and ran its first paid trips over spring break. They are hiring for the semester, not for the summer, so the hours fit around classes.',
    ],
    roles: [
      { cat: 'internship', name: 'Product Designer', meta: 'Remote · 10 hrs / week · Paid' },
      { cat: 'internship', name: 'iOS Engineer', meta: 'Hybrid · 12 hrs / week · Paid' },
      { cat: 'oncampus', name: 'Campus Ambassador', meta: 'On-campus · 5 hrs / week · Paid' },
      { cat: 'oncampus', name: 'Campus Ambassador, Ithaca', meta: 'On-campus · 5 hrs / week · Paid' },
    ],
  },
  loopline: {
    mono: 'LL', tone: 'amber', title: 'Loopline',
    meta: 'Fintech · Pre-seed · Founded 2026 · 3 people · Pittsburgh, PA',
    blurbs: [
      'Loopline settles up the group chat. Rent, groceries and club dues in one ledger, without three apps and a spreadsheet nobody trusts.',
      'Three founders, all seniors, running on a pre-seed cheque and a waitlist of about four hundred. They want one engineer who has opinions about double-entry bookkeeping.',
    ],
    roles: [
      { cat: 'internship', name: 'Backend Engineer', meta: 'Remote · 12 hrs / week · Paid' },
    ],
  },
  verdant: {
    mono: 'VL', tone: 'slate', title: 'Verdant Labs',
    meta: 'Sustainability · Seed · Founded 2023 · 9 people · Pittsburgh, PA',
    blurbs: [
      'Verdant Labs weighs what a dining hall throws away and turns it into a number the kitchen can act on that same week. Three pilot campuses so far.',
      'Nine people, half of them alumni, and the only start-up here with hardware in the field. Expect a loading dock, a scale that needs recalibrating, and real data.',
    ],
    roles: [
      { cat: 'research', name: 'Data Analyst', meta: 'Hybrid · 8 hrs / week · Paid' },
      { cat: 'internship', name: 'Hardware Engineer', meta: 'On-site · 12 hrs / week · Paid' },
      { cat: 'oncampus', name: 'Operations Lead', meta: 'On-campus · 10 hrs / week · Paid' },
    ],
  },
};

/** Which record the directory is showing. */
let wideSlug = 'nimbus';

function renderWide(slug) {
  const rec = STARTUPS[slug];
  if (!rec) return;

  wideLogo.textContent = rec.mono;
  wideLogo.dataset.tone = rec.tone;
  wideTitle.textContent = rec.title;
  wideMeta.textContent = rec.meta;

  wideBlurbs.replaceChildren(...rec.blurbs.map((text) => {
    const p = document.createElement('p');
    p.className = 'startups__wide-blurb';
    p.textContent = text;
    return p;
  }));

  wideRoles.replaceChildren(...rec.roles.map((role) => {
    const li = document.createElement('li');
    li.className = 'startups__role';

    const tag = document.createElement('span');
    tag.className = `tag tag--${role.cat}`;
    tag.textContent = TAG_LABEL[role.cat] || role.cat.toUpperCase();

    const name = document.createElement('span');
    name.className = 'startups__role-name';
    name.textContent = role.name;

    const meta = document.createElement('span');
    meta.className = 'startups__role-meta';
    meta.textContent = role.meta;

    li.append(tag, name, meta);
    return li;
  }));

  [wideMail, wideMsg].forEach((btn) => { btn.dataset.message = slug; });
  wideMail.setAttribute('aria-label', `Message ${rec.title}`);
}

/** Swap the record while the directory is open. The rows arrive the way every
    other revealed block on this screen arrives — `riseIn`, same tokens. */
function showWideRecord(card) {
  wideSlug = card.dataset.startup;
  renderWide(wideSlug);

  const t = timing();
  if (still(t)) return;
  wide.classList.remove('is-rising');
  stop(wide);
  clearRise([...wide.children]);
  void wide.offsetWidth;
  riseIn([...wide.children], t, wide);
}

/* --- Message → the composer ------------------------------------------------
   Five buttons that did nothing, and four mail links pointing at `.example`
   domains that cannot receive mail. They all open one composer now. It is
   honest about what it is: there is no server behind this build, so nothing is
   sent — the draft is kept per start-up and you copy it into your own mail. */

function draftKey(slug) { return `career-msg-${slug}`; }

function firstName() {
  const name = String(readIdentity().name || '').trim();
  return name.split(/\s+/)[0] || 'a Carnegie Mellon student';
}

function template(rec) {
  const first = firstName();
  const role = rec.roles[0] ? rec.roles[0].name : 'open';
  return `Hi ${rec.title} team,

I'm ${first}, a Carnegie Mellon undergraduate. I found you through the Flightplan alum start-up directory and your ${role} opening caught my eye.

[two lines on why you, and one thing you would want to work on]

Happy to send a resume or a portfolio link — whichever is more useful.

Thanks,
${first}`;
}

let msgSlug = 'nimbus';

function loadMessage(slug) {
  const rec = STARTUPS[slug];
  if (!rec) return;
  msgSlug = slug;
  msgTitle.textContent = rec.title;
  msgMeta.textContent = rec.meta;
  const saved = store.get('fields', draftKey(slug));
  msgBody.value = saved === undefined ? template(rec) : saved;
  msgDone.hidden = true;
}

/* Bound at module time, which is BEFORE app.js binds its [data-modal] opener on
   DOMContentLoaded — so on any of these buttons this listener runs first and
   the composer is already filled by the time app.js shows it. */
document.querySelectorAll('[data-message]').forEach((btn) => {
  btn.addEventListener('click', () => loadMessage(btn.dataset.message));
});

let draftTimer = null;
msgBody.addEventListener('input', () => {
  msgDone.hidden = true;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    store.set('fields', draftKey(msgSlug), msgBody.value.trim() || undefined);
  }, 400);
});

function flash(text) {
  msgDone.textContent = text;
  msgDone.hidden = false;
}

msgSave.addEventListener('click', () => {
  clearTimeout(draftTimer);
  store.set('fields', draftKey(msgSlug), msgBody.value.trim() || undefined);
  flash('Draft saved.');
});

msgCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(msgBody.value);
    flash('Copied to your clipboard.');
  } catch {
    /* no clipboard permission (or no https) — select it so ⌘C still works */
    msgBody.focus();
    msgBody.select();
    flash('Press ⌘C / Ctrl+C to copy.');
  }
});

/* --- SAVED LISTS: the contents ---------------------------------------------
   Bookmarking never reached this panel before. The rail is now rendered from
   the bookmarks in the store, described by the cards themselves — so a saved
   row can never disagree with the listing it came from, and the count is just
   how many there are. */

const TONE = { internship: 'peach', newgrad: 'peach', research: 'sage', oncampus: 'sage' };

/** Everything on this page that can be bookmarked, in document order. */
function savedSources() {
  const out = [];
  jobs.querySelectorAll('.job').forEach((card) => {
    out.push({
      id: card.querySelector('.bookmark').dataset.bookmark,
      title: card.querySelector('.job__title').textContent.trim(),
      sub: `${card.querySelector('.job__company').textContent.trim()} · ${card.querySelector('.job__loc').textContent.trim()}`,
      tone: TONE[card.dataset.cat] || 'peach',
    });
  });
  list.querySelectorAll('.startup').forEach((card) => {
    out.push({
      id: card.querySelector('.bookmark').dataset.bookmark,
      title: card.querySelector('.startup__name').textContent.trim(),
      sub: card.querySelector('.startup__meta').textContent.trim(),
      tone: 'sage',
    });
  });
  return out;
}

function renderSaved() {
  const marks = store.all().bookmarks || {};
  const items = savedSources().filter((s) => marks[s.id]);

  savedList.replaceChildren(...items.map((s) => {
    const btn = document.createElement('button');
    btn.className = 'saved-rail__item';
    btn.type = 'button';
    btn.dataset.tone = s.tone;
    btn.dataset.savedRef = s.id;

    const title = document.createElement('span');
    title.className = 'saved-rail__title';
    title.textContent = s.title;

    const sub = document.createElement('span');
    sub.className = 'saved-rail__sub';
    sub.textContent = s.sub;

    btn.append(title, sub);
    return btn;
  }));

  savedEmpty.hidden = items.length > 0;
  if (savedCount) savedCount.textContent = String(items.length);
  if (isSavedOpen()) setSavedOpen(true);   /* the drop is taller or shorter now */
}

/* A saved row is a way back to the listing it stands for. */
savedList.addEventListener('click', (e) => {
  const item = e.target.closest('.saved-rail__item');
  if (!item) return;
  const ref = item.dataset.savedRef;
  setSavedOpen(false);

  const jobCard = jobs.querySelector(`[data-bookmark="${ref}"]`)?.closest('.job');
  if (jobCard) { revealJob(jobCard); openJobDetail(jobCard); return; }

  const upCard = list.querySelector(`[data-bookmark="${ref}"]`)?.closest('.startup');
  if (upCard) openDetail(upCard);
});

/* app.js owns the bookmark buttons: it writes the store and paints the icon,
   then calls stopPropagation, so a delegated listener on the document would
   never hear the click. These are bound on the nodes themselves and, because
   app.js registers its DOMContentLoaded callback first, they land after its —
   which means the store is already up to date when they run. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-bookmark]').forEach((btn) => {
    btn.addEventListener('click', () => { renderSaved(); syncSave(); });
  });
});

/** The six listings the rail starts with, so a first visit does not open on an
    empty panel. Written straight to the store rather than to the DOM, so the
    card icons agree with the rail — and only ever once. */
const SEED_SAVED = ['job-3', 'job-2', 'job-5', 'job-4', 'job-7', 'startup-nimbus'];

function seedSaved() {
  if (store.get('lists', 'career-seed')) return;
  SEED_SAVED.forEach((id) => store.set('bookmarks', id, true));
  store.set('lists', 'career-seed', ['v1']);
}

/** The header line under the student's name. sidebar.js owns the name itself
    via [data-identity-name]; the credits come from the same `term` bucket that
    drives THIS TERM, so this page cannot drift from the sidebar beside it. */
function paintCredits() {
  const el = document.querySelector('[data-career-credits]');
  if (!el) return;
  const t = store.all().term || {};
  const done = t.doneCr ?? 42;
  const total = t.totalCr ?? 120;
  const prog = t.inProgCr ?? 18;
  el.textContent = `${done} of ${total} credits · ${prog} in progress`;
}

/* --- boot ------------------------------------------------------------------
   Restoring state is deliberately instant: setExpanded / applyFilters, never
   expandGrid, so a reload lands in the state you left rather than replaying an
   animation at you. */

seedSaved();                 /* before app.js paints the bookmark icons */
restoreFilters();
applyFilters();
if (store.get('checks', 'career-expanded', false)) setExpanded(true);
else paintToggles(isExpanded());
setWide(isWide());
renderWide(wideSlug);
renderSaved();
paintCredits();
