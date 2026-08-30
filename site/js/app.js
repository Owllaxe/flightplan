/* Shared behaviour every screen gets:
     [data-bookmark="id"]   toggle + persist a bookmark button
     [data-check="id"]      toggle + persist a checkbox
     [data-field="id"]      persist an input/textarea value
     [data-dismiss="id"]    hide a banner for good
     [data-modal="id"]      open the modal with that id
     [data-modal-close]     close the nearest modal
   Page-specific logic lives in its own module and imports from here.

   Since the build-B port this module also owns three things that have to be
   true on EVERY page, and so cannot live in a per-page script:

     · the prototype gate  (§ GATE)      — signed out ⇒ login.html
     · the pigeon onboarding quiz (§ QUIZ) — build B spec §2, verbatim
     · sign out             (§ SIGN OUT) — injected into the sidebar footer

   None of the nine page files were edited to make those work. */

import { store } from './store.js';

/* ===========================================================================
   § AUTH — a LOCAL prototype gate, not authentication.

   Build B backs its login with a real HTTP API (10 endpoints, Bearer tokens in
   `compass.auth.v1`). That server does not exist in this delivery, so there is
   nothing here that verifies anything: no network call, no password check, no
   token. What this does is remember a name / email / program in localStorage so
   the app can address you, and remember that you have been through the gate.
   Everything in B that was a claim about a server ("Keep me signed in",
   "Change password", the SYNCED badge, the catalog RETRY box) is dropped or
   relabelled — see login.html and js/login.js.
   =========================================================================== */

/* Two store buckets are added by this port (js/store.js itself is untouched —
   `read()` spreads the parsed blob over DEFAULTS, so extra top-level keys
   survive round-trips):

     auth = { signedIn, email, displayName, firstName, lastName,
              programId, sessionOnly, at }
     flightplan = { quiz: {fields, specifics, goals, intl}, quizTerm }

   `flightplan` deliberately mirrors B's `localStorage['flightplan.quizTerm']`
   (spec §2.6) so the "re-ask every new term" rule ports unchanged. */

const SESSION_KEY = 'stellic-pathfinders.session';
const LOGIN_PAGE = 'login.html';

function isLoginPage() {
  return /(^|\/)login\.html$/i.test(location.pathname);
}

export function authRecord() {
  return store.all().auth || {};
}

/* "Remember me on this device" is the one piece of B's remember-me that is
   honest here, because B's own mechanism was local: on ⇒ localStorage, off ⇒
   sessionStorage (gone when the browser session ends). js/store.js only writes
   localStorage, so session-only entries carry a sessionStorage stamp that has
   to match, which reproduces exactly that lifetime. */
export function isSignedIn() {
  const a = authRecord();
  if (!a.signedIn) return false;
  if (!a.sessionOnly) return true;
  try {
    return sessionStorage.getItem(SESSION_KEY) === String(a.at);
  } catch {
    return false;
  }
}

export function signIn(record) {
  const at = String(Date.now());
  const auth = { ...record, signedIn: true, at };
  store.replace({ auth });
  try {
    if (auth.sessionOnly) sessionStorage.setItem(SESSION_KEY, at);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* private mode — the record still works for this page load */ }

  /* Only a real first/last name from the signup step relabels the app. A plain
     login gives us an email local-part, which is not a name, so A's seeded
     identity ("Jordan Lee") is left alone rather than replaced with "j.lee". */
  const first = String(record.firstName || '').trim();
  const last = String(record.lastName || '').trim();
  if (first || last) {
    const name = [first, last].filter(Boolean).join(' ');
    store.replace({ identity: { name, initials: initialsFrom(name) } });
  }
}

/* B's signOut also wipes the local plan blob so one account cannot leak into
   the next on a shared device. There are no accounts here — one browser is one
   person's prototype — so wiping their goals, bookmarks and resume on sign-out
   would destroy work for no safety gain. Only the gate record is cleared. */
export function signOut() {
  store.replace({ auth: undefined });   /* JSON.stringify drops the key */
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  location.replace(LOGIN_PAGE);
}

function initialsFrom(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* ===========================================================================
   § GATE — run before anything else paints.
   Two mutually exclusive rules, so a loop is not expressible:
     · not login.html + signed out  ⇒ go to login.html
     · login.html     + signed in   ⇒ go to ?next (validated) or index.html
   login.html is never gated; nothing ever redirects to the page it is on.
   =========================================================================== */

/* `next` is only ever a bare page in this directory. Anything else — an
   absolute URL, a protocol, a traversal — is discarded, so the gate cannot be
   used as an open redirect. */
function safeNext(raw) {
  const v = String(raw || '').trim();
  if (!/^[A-Za-z0-9._-]+\.html(?:[?#][^\s]*)?$/.test(v)) return null;
  if (/^login\.html/i.test(v)) return null;
  return v;
}

function currentPageRef() {
  const file = location.pathname.split('/').pop() || 'index.html';
  return file + location.search + location.hash;
}

function runGate() {
  if (isLoginPage()) {
    if (isSignedIn()) {
      const next = safeNext(new URLSearchParams(location.search).get('next')) || 'index.html';
      location.replace(next);
      return true;
    }
    return false;
  }
  if (!isSignedIn()) {
    document.documentElement.style.visibility = 'hidden';
    location.replace(`${LOGIN_PAGE}?next=${encodeURIComponent(currentPageRef())}`);
    return true;
  }
  return false;
}

const gateRedirecting = runGate();

/* ===========================================================================
   § QUIZ — build B's pigeon onboarding quiz (spec §2), ported verbatim.
   The only change is the save: B does `PATCH /me/profile {pigeon:…}`, this
   writes the same object into the store.
   =========================================================================== */

const QFIELDS = [
  'Technology & Engineering',
  'Business & Finance',
  'Healthcare & Medicine',
  'Arts & Design',
  'Science & Research',
  'Education',
  'Law & Public Policy',
  'Media & Communications',
  'Not sure yet',
];

const QSUGG = [
  'Apply to 3 internships',
  'Get an on-campus job',
  'Raise my GPA',
  'Join a club or org',
  'Talk to 2 upperclassmen',
  'Build my resume',
];

const QCAP = [
  'Question 1 of 4 — pick as many as you like',
  'Question 2 of 4 — optional, type your own',
  'Question 3 of 4 — at least 3, up to 5',
  'Question 4 of 4 — this shapes your site',
];

const QHEAD = [
  'Which career fields are you drawn to?',
  'Anything more specific in mind?',
  'Set your semester goals',
  'Are you an international student?',
];

const QINTL = [
  { label: 'Yes — I study on a visa (F-1 / J-1)', value: true },
  { label: 'No — domestic student', value: false },
];

const GOAL_NOTE = 'These pin to your home page — the pigeon will check in on them all semester.';
const GOAL_ERR = 'Pick at least three goals — the pigeon checks in on these all semester.';
const SPEC_NOTE = 'Add as many as you want — you can change these later in Settings.';
const SPEC_PLACEHOLDER = 'e.g. UX design, machine learning, immigration law — press Enter to add';
const INTL_NOTE = 'Answering yes keeps the Visa tab front and centre — CPT/OPT timeline, documents and deadlines.';

/* The term key. B derives it from the fetched coursemap; here it comes from the
   `term` bucket js/store.js already seeds and js/sidebar.js already paints, so
   editing `term.label` is what starts a "new term". */
export function currentTermKey() {
  const label = String((store.all().term || {}).label || '').trim();
  return label ? label.toLowerCase().replace(/\s+/g, '-') : '';
}

function flightplan() {
  return store.all().flightplan || {};
}

function patchFlightplan(patch) {
  store.replace({ flightplan: { ...flightplan(), ...patch } });
}

export function savedQuiz() {
  return flightplan().quiz || null;
}

/* Spec §2.6: re-ask at the start of every new term, not only on first signup.
   `!user.pigeon || localStorage['flightplan.quizTerm'] !== currentTermKey` */
export function quizDue() {
  const term = currentTermKey();
  const fp = flightplan();
  if (!fp.quiz) return true;
  return Boolean(term) && fp.quizTerm !== term;
}

let qi = 0;
let qFields = [];
let qSpecs = [];
let qGoals = ['', '', '', '', ''];
let qIntl = null;
let qErr = '';
let qBusy = false;
let qov = null;
let pigeonTimer = null;

function pigeonEl() { return document.getElementById('pigeon-quiz'); }

/* pigeon-stage.webp is an 11 × 11 sheet drawn at 2046 × 2167, so frame N sits
   at (-186·col, -197·row). Spec pins the resting frame at 0/0 and names the
   reactions ("positive", "negative", "excited") but not their frame ranges, so
   the resting frame is exact and the reactions are a conservative walk along
   the first row plus a shake — see the report. */
function setFrame(n) {
  const el = pigeonEl();
  if (!el) return;
  const i = ((n % 121) + 121) % 121;
  el.style.backgroundPosition = `${-(i % 11) * 186}px ${-Math.floor(i / 11) * 197}px`;
}

function walk(frames, ms, then = 0) {
  clearInterval(pigeonTimer);
  let k = 0;
  setFrame(frames[0]);
  pigeonTimer = setInterval(() => {
    k += 1;
    if (k >= frames.length) { clearInterval(pigeonTimer); setFrame(then); return; }
    setFrame(frames[k]);
  }, ms);
}

function reactPositive() { walk([0, 1, 2, 3, 4, 5, 4, 3, 2, 1], 90, 0); }
function reactExcited() { walk([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 70, 0); }

function reactNegative() {
  const el = pigeonEl();
  if (!el) return;
  el.setAttribute('data-shake', '1');
  setTimeout(() => el.removeAttribute('data-shake'), 460);
}

function quizBlocked(i) {
  if (i === 0) return qFields.length === 0;
  if (i === 1) return false;
  if (i === 2) return qGoals.filter((g) => g.trim()).length < 3;
  if (i === 3) return qIntl !== true && qIntl !== false;
  return false;
}

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  kids.filter(Boolean).forEach((k) => node.append(k));
  return node;
}

function option(label, selected, multi, onPick) {
  return el(
    'button',
    { type: 'button', 'data-qopt': '', 'data-sel': selected ? '1' : '0',
      'aria-pressed': String(Boolean(selected)), on: { click: onPick } },
    el('span', { 'data-radio': '', 'data-multi': multi ? '1' : null, 'aria-hidden': 'true' }),
    el('span', { text: label }),
  );
}

/* --- the four question bodies ---------------------------------------------- */

function bodyFields() {
  const wrap = el('div');
  QFIELDS.forEach((label) => {
    wrap.append(option(label, qFields.includes(label), true, () => {
      /* Spec §2.3: "Not sure yet" clears everything else and becomes the sole
         answer; anything else drops "Not sure yet" first, then toggles. */
      if (label === 'Not sure yet') {
        qFields = qFields.includes(label) ? [] : [label];
      } else {
        qFields = qFields.filter((f) => f !== 'Not sure yet');
        qFields = qFields.includes(label) ? qFields.filter((f) => f !== label) : [...qFields, label];
      }
      reactPositive();
      render();
    }));
  });
  return wrap;
}

function bodySpecs() {
  const wrap = el('div');
  const input = el('input', {
    'data-qin': '', type: 'text', placeholder: SPEC_PLACEHOLDER, 'aria-label': 'Add a specific interest',
  });
  /* Enter commits the trimmed value, Escape clears without committing, no other
     key commits (spec §2.3 Q2). Duplicates are NOT deduped — B does not. */
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (v) { qSpecs = [...qSpecs, v]; render(); }
      else input.value = '';
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
    }
  });
  wrap.append(input);

  const tags = el('div', { 'data-qtags': '' });
  qSpecs.forEach((tag, i) => {
    tags.append(el('button', {
      type: 'button', 'data-qtag': '', text: `${tag} ✕`, 'aria-label': `Remove ${tag}`,
      on: { click: () => { qSpecs = qSpecs.filter((_, k) => k !== i); render(); } },
    }));
  });
  wrap.append(tags);
  wrap.append(el('p', { 'data-qnote': '', text: SPEC_NOTE }));
  return wrap;
}

function bodyGoals() {
  const wrap = el('div');

  const chips = el('div', { 'data-qtags': '' });
  QSUGG.forEach((s) => {
    chips.append(el('button', {
      type: 'button', 'data-qsugg': '', text: s,
      on: {
        click: () => {
          const slot = qGoals.findIndex((g) => !g.trim());
          if (slot === -1) return;              /* all five full — no-op */
          qGoals[slot] = s;
          reactPositive();
          render();
        },
      },
    }));
  });
  wrap.append(chips);

  qGoals.forEach((g, i) => {
    const input = el('input', {
      'data-qin': '', type: 'text', value: g,
      placeholder: i < 3 ? `goal ${i + 1} (required)` : `goal ${i + 1} (optional)`,
      'aria-label': `Semester goal ${i + 1}`,
    });
    input.value = g;
    input.addEventListener('input', () => { qGoals[i] = input.value; paintNext(); });
    wrap.append(input);
  });

  wrap.append(el('p', { 'data-qnote': '', 'data-err': qErr ? '1' : null, text: qErr || GOAL_NOTE }));
  return wrap;
}

function bodyIntl() {
  const wrap = el('div');
  QINTL.forEach(({ label, value }) => {
    wrap.append(option(label, qIntl === value, false, () => { qIntl = value; reactPositive(); render(); }));
  });
  wrap.append(el('p', { 'data-qnote': '', text: INTL_NOTE }));
  return wrap;
}

const BODIES = [bodyFields, bodySpecs, bodyGoals, bodyIntl];

/* --- shell ----------------------------------------------------------------- */

function paintNext() {
  const next = qov?.querySelector('[data-qnext]');
  if (!next) return;
  if (quizBlocked(qi)) next.setAttribute('data-off', '1');
  else next.removeAttribute('data-off');
}

function render() {
  if (!qov) return;
  const card = qov.querySelector('[data-quiz]');

  const dots = card.querySelector('[data-qdots]');
  dots.replaceChildren(...QCAP.map((_, i) => el('span', { 'data-qdot': i === qi ? '1' : '0' })));

  card.querySelector('[data-qcap]').textContent = QCAP[qi];
  card.querySelector('[data-qh]').textContent = QHEAD[qi];
  card.querySelector('[data-qbody]').replaceChildren(BODIES[qi]());

  const back = card.querySelector('[data-qback]');
  back.style.visibility = qi === 0 ? 'hidden' : 'visible';

  const next = card.querySelector('[data-qnext]');
  next.textContent = qBusy ? 'Saving…' : (qi === 3 ? 'Start →' : 'Next →');
  paintNext();
}

function qNext() {
  if (qBusy) return;
  if (quizBlocked(qi)) {
    if (qi === 2) { qErr = GOAL_ERR; reactNegative(); render(); }
    return;
  }
  qErr = '';
  if (qi < 3) { qi += 1; render(); return; }
  saveQuiz();
}

function qBack() {
  if (qi === 0) return;
  qErr = '';
  qi -= 1;
  render();
}

function saveQuiz() {
  qBusy = true;
  render();

  const answers = {
    fields: [...qFields],
    specifics: [...qSpecs],
    goals: qGoals.map((g) => g.trim()).filter(Boolean).slice(0, 5),
    intl: qIntl === true,          /* spec: `qIntl === true`, so null ⇒ false */
  };

  /* B: PATCH /me/profile { pigeon: answers }. Here: one localStorage write. */
  patchFlightplan({ quiz: answers, quizTerm: currentTermKey() });

  qBusy = false;
  reactExcited();
  speak(answers.goals.length);
  setTimeout(closeQuiz, 240);
}

/* B opens the pigeon's speech bubble with the confirmation for 7000 ms. A's
   bubble only exists on Home; elsewhere the save is silent, as in B. */
let bubbleTimer = null;
function speak(n) {
  const bubble = document.getElementById('pigeonBubble');
  if (!bubble) return;
  const msg = n === 0
    ? 'All set.'
    : `All set — I’ll check in on ${n} ${n === 1 ? 'goal' : 'goals'} this semester.`;
  if (bubble.dataset.fpOriginal === undefined) bubble.dataset.fpOriginal = bubble.textContent;
  bubble.textContent = msg;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { bubble.textContent = bubble.dataset.fpOriginal; }, 7000);
}

function buildQuiz() {
  const card = el('div', { 'data-quiz': '', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Onboarding' },
    el('button', { type: 'button', 'data-qx': '', text: '✕', 'aria-label': 'Close', on: { click: () => closeQuiz(true) } }),
    el('div', { 'data-qdots': '', 'aria-hidden': 'true' }),
    el('p', { 'data-qcap': '' }),
    el('h2', { 'data-qh': '' }),
    el('div', { 'data-qbody': '' }),
    el('div', { 'data-qfoot': '' },
      el('button', { type: 'button', 'data-qback': '', text: '←', 'aria-label': 'Previous question', on: { click: qBack } }),
      el('button', { type: 'button', 'data-qnext': '', text: 'Next →', on: { click: qNext } })),
    el('div', { 'data-qwrap': '', 'aria-hidden': 'true' },
      el('div', { id: 'pigeon-quiz' }),
      el('div', { id: 'pigeon-quiz-planet' })),
  );
  return el('div', { 'data-qov': '' }, card);
}

/* Spec §2.6: openQuiz pre-fills from the saved answers, so a new-term re-run is
   an edit rather than a blank slate, and pads the goal list to five. */
export function openQuiz() {
  if (qov) return;
  const saved = savedQuiz() || {};
  qi = 0;
  qErr = '';
  qBusy = false;
  qFields = Array.isArray(saved.fields) ? [...saved.fields] : [];
  qSpecs = Array.isArray(saved.specifics) ? [...saved.specifics] : [];
  qGoals = [...(Array.isArray(saved.goals) ? saved.goals : [])].slice(0, 5);
  while (qGoals.length < 5) qGoals.push('');
  qIntl = typeof saved.intl === 'boolean' ? saved.intl : null;

  qov = buildQuiz();
  document.body.append(qov);
  document.body.style.overflow = 'hidden';
  render();
  setFrame(0);
  document.addEventListener('keydown', quizKeys);
}

/* Closing with ✕ or Escape also stamps the term (spec, line 4701) — dismissing
   counts as "asked this term", otherwise the quiz would reopen on every hop. */
export function closeQuiz(stamp = false) {
  if (!qov) return;
  if (stamp) patchFlightplan({ quizTerm: currentTermKey() });
  clearInterval(pigeonTimer);
  document.removeEventListener('keydown', quizKeys);
  qov.remove();
  qov = null;
  document.body.style.overflow = '';
}

function quizKeys(e) {
  if (e.key === 'Escape') closeQuiz(true);
}

/* ===========================================================================
   § A's ORIGINAL INTAKE MODAL
   index.html still carries the four-question intake from js/home.js. B's quiz
   supersedes it, and js/home.js is not mine to edit, so it is neutralised from
   here — in both of the two ways it can appear:

     1. auto-open on first visit. js/home.js schedules that only when
        `onboarding.seen` and `onboarding.done` are both falsy, and it reads
        that at the bottom of its module body. app.js is loaded BEFORE home.js
        on every page that has both, so stamping `seen` here (below) runs first
        and the timer is never scheduled. Nothing is lost: `seen` is exactly
        the flag home.js writes the moment it shows the modal.

     2. the pigeon's speech bubble. home.js binds that click to
        `openModal('intake')` — imported from THIS module. openModal now routes
        the id `intake` to B's quiz, so the bubble still opens a quiz, just B's.

   The `#intake` markup stays in index.html, unopened and unreachable.
   =========================================================================== */

const SUPERSEDED_MODAL = 'intake';

function supersedeIntake() {
  const ob = store.all().onboarding || {};
  if (ob.seen) return;
  store.replace({ onboarding: { ...ob, seen: true, supersededBy: 'flightplan-quiz' } });
}

/* --- bookmarks ------------------------------------------------------------- */

function paintBookmark(el2, on) {
  el2.classList.toggle('is-on', on);
  el2.setAttribute('aria-pressed', String(on));
}

function initBookmarks(root) {
  root.querySelectorAll('[data-bookmark]').forEach((node) => {
    const id = node.dataset.bookmark;
    paintBookmark(node, store.get('bookmarks', id, false));
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      paintBookmark(node, store.toggle('bookmarks', id));
    });
  });
}

/* --- checkboxes ------------------------------------------------------------ */

function initChecks(root) {
  root.querySelectorAll('[data-check]').forEach((node) => {
    const id = node.dataset.check;
    node.checked = store.get('checks', id, false);
    node.closest('[data-check-row]')?.classList.toggle('is-done', node.checked);
    node.addEventListener('change', () => {
      store.set('checks', id, node.checked || undefined);
      node.closest('[data-check-row]')?.classList.toggle('is-done', node.checked);
    });
  });
}

/* --- text fields ----------------------------------------------------------- */

function initFields(root) {
  root.querySelectorAll('[data-field]').forEach((node) => {
    const id = node.dataset.field;
    const saved = store.get('fields', id);
    if (saved !== undefined) node.value = saved;
    node.addEventListener('input', () => {
      store.set('fields', id, node.value || undefined);
      autosize(node);
    });
    autosize(node);
  });
}

function autosize(node) {
  if (node.tagName !== 'TEXTAREA' || !node.hasAttribute('data-autosize')) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}

/* --- dismissible banners --------------------------------------------------- */

function initDismiss(root) {
  root.querySelectorAll('[data-dismiss]').forEach((node) => {
    const id = node.dataset.dismiss;
    const target = node.closest('[data-dismiss-target]') || node.parentElement;
    if (store.get('dismissed', id, false)) target.hidden = true;
    node.addEventListener('click', () => {
      store.set('dismissed', id, true);
      target.hidden = true;
    });
  });
}

/* --- modals ---------------------------------------------------------------- */

let lastFocus = null;

export function openModal(id) {
  /* B's onboarding quiz replaces A's intake — see § A's ORIGINAL INTAKE MODAL */
  if (id === SUPERSEDED_MODAL) { openQuiz(); return; }
  const node = document.getElementById(id);
  if (!node) return;
  lastFocus = document.activeElement;
  node.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  (node.querySelector('[autofocus]') || node.querySelector('button, input, textarea, a'))?.focus();
}

export function closeModal(el2) {
  const target = typeof el2 === 'string' ? document.getElementById(el2) : el2;
  if (!target) return;
  target.classList.remove('is-open');
  if (!document.querySelector('.modal-backdrop.is-open')) document.body.style.overflow = '';
  lastFocus?.focus();
}

function initModals(root) {
  root.querySelectorAll('[data-modal]').forEach((node) => {
    node.addEventListener('click', () => openModal(node.dataset.modal));
  });
  root.querySelectorAll('.modal-backdrop').forEach((back) => {
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) closeModal(back);
    });
    back.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(back));
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-backdrop.is-open').forEach(closeModal);
  });
}

/* ===========================================================================
   § SIGN OUT — injected into the sidebar footer, because the nine page files
   are not editable from here.
   =========================================================================== */

function initSignOut(root) {
  const foot = root.querySelector('.sidebar__foot');
  if (!foot || foot.querySelector('.signout')) return;
  const btn = el('button', {
    type: 'button', class: 'signout', text: 'SIGN OUT',
    title: 'Leave the prototype and return to the gate',
    on: { click: signOut },
  });
  foot.append(btn);
}

/* ===========================================================================
   § BOOT
   =========================================================================== */

/* The quiz overlay's stylesheet lives in css/login.css, which the nine pages do
   not link. Injected here at module time so it is loaded long before the quiz
   can open. Every rule in it is scoped to `.auth-page` or to a `[data-q*]`
   attribute, so it cannot touch anything already on the page. */
function injectQuizStyles() {
  if (document.querySelector('link[data-fp-quiz-css]')) return;
  const href = new URL('../css/login.css', import.meta.url).href;
  const link = el('link', { rel: 'stylesheet', href, 'data-fp-quiz-css': '' });
  document.head.append(link);
}

export function init(root = document) {
  initBookmarks(root);
  initChecks(root);
  initFields(root);
  initDismiss(root);
  initModals(root);
  initSignOut(root);
}

if (!gateRedirecting && !isLoginPage()) {
  supersedeIntake();          /* must run before js/home.js's module body */
  injectQuizStyles();

  document.addEventListener('DOMContentLoaded', () => {
    init();
    /* Spec §2.6 triggers (1) and (2): after entering the app, ask when there
       are no answers yet OR the stored term key is not this term. Dismissing
       stamps the term, so this fires at most once per term. */
    if (quizDue()) setTimeout(openQuiz, 450);
  });
}
