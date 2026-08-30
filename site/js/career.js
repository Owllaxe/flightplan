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
});

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

list.addEventListener('click', (e) => {
  if (e.target.closest('.bookmark') || e.target.closest('.btn') || e.target.closest('.startup__mail')) return;
  const card = e.target.closest('.startup');
  if (card) openDetail(card);
});

/* keyboard: the card itself is a tab stop, Enter or Space opens its detail */
list.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('.startup');
  if (!card || e.target !== card) return;
  e.preventDefault();
  openDetail(card);
});

/* The one circular control in the panel header: Back while a detail is open,
   otherwise the full-width directory. */
back.addEventListener('click', () => {
  if (body.classList.contains('is-detail')) { closeDetail(); return; }
  if (isWide()) leaveWide();
  else enterWide();
});

applyFilters();
paintToggles(isExpanded());
setWide(isWide());
