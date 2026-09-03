/* Home page behaviour. Four small jobs, all of them about the home screen
   telling the truth:

     1. the goals panel renders the goals the onboarding quiz collected, because
        the quiz promises "these pin to your home page". Hardcoded goals made
        that a lie.
     2. it re-renders when the quiz saves (the quiz emits no event, so the
        overlay leaving the DOM is the signal) and when another tab writes.
     3. every [data-open-quiz] affordance — the goals-panel button and the
        pigeon's speech bubble — actually opens the quiz.
     4. [data-deadline] rows compute their own "N days left", so the date lives
        in exactly one place and the wording can never contradict it.

   The four-question modal controller that used to live here is gone: build B's
   pigeon quiz supersedes it (js/app.js § QUIZ) and its markup has been removed
   from index.html, so none of those elements exist any more. */

import { store } from './store.js';
import { openQuiz } from './app.js';

/* ===========================================================================
   § GOALS — render the quiz's answers into the panel
   =========================================================================== */

/* Ids are derived from the goal TEXT, not its position, so a student who
   retakes the quiz and reorders their goals keeps each goal's tick. */
function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');          /* the cap can leave a trailing hyphen */
}

/* A goal of "!!!" slugs to "" — fall back to a positional id so the row is
   still checkable, and let the seen-map below suffix any collisions. */
function goalId(text, seen) {
  const base = `goal-q-${slug(text) || 'goal'}`;
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function quizGoals() {
  const goals = (store.all().flightplan || {}).quiz?.goals;
  return Array.isArray(goals) ? goals.filter((g) => typeof g === 'string' && g.trim()) : [];
}

function goalRow(text, id) {
  const row = document.createElement('label');
  row.className = 'goal-row';
  row.setAttribute('data-check-row', '');

  const box = document.createElement('input');
  box.className = 'check';
  box.type = 'checkbox';
  box.setAttribute('data-check', id);
  box.checked = store.get('checks', id, false);

  const label = document.createElement('span');
  label.className = 'goal-row__label';
  label.textContent = text;      /* user-entered: never innerHTML */

  row.classList.toggle('is-done', box.checked);

  /* The same behaviour js/app.js's initChecks gives the seeded rows. This
     module runs at module-body time — before DOMContentLoaded, and therefore
     before initChecks sweeps the page — so initChecks will bind these rows a
     second time. That is harmless: both handlers read `node.checked` and write
     the same value, and both toggle the same class. Binding here anyway is what
     keeps rows re-rendered *after* a quiz retake working, since initChecks has
     long since run by then. */
  box.addEventListener('change', () => {
    store.set('checks', id, box.checked || undefined);
    row.classList.toggle('is-done', box.checked);
  });

  row.append(box, label);
  return row;
}

/* What the panel currently shows, so an unchanged re-render costs nothing. */
let renderedGoals = null;

function renderGoals() {
  const list = document.querySelector('[data-goals-list]');
  if (!list) return;

  const goals = quizGoals();
  /* No quiz answers ⇒ leave the seeded rows completely alone. That markup is
     the documented fallback (and the no-JS fallback), not a placeholder. */
  if (!goals.length) return;

  const key = JSON.stringify(goals);
  if (list.dataset.source === 'quiz' && renderedGoals === key) return;

  const seen = new Map();
  list.replaceChildren(...goals.map((g) => {
    const text = g.trim();
    return goalRow(text, goalId(text, seen));
  }));

  list.dataset.source = 'quiz';   /* a later pass can tell it owns this list */
  renderedGoals = key;
}

/* ===========================================================================
   § RE-RENDER — the quiz saves without telling anyone
   =========================================================================== */

/* js/app.js appends its quiz as <div data-qov><div data-quiz>…</div></div> on
   document.body and removes it after writing the answers. No event is emitted,
   so the overlay disappearing is the signal: watch body's direct children only
   (childList, no subtree) and re-render on the present → absent transition. */
let quizWasOpen = Boolean(document.querySelector('[data-quiz]'));

function watchQuiz() {
  if (typeof MutationObserver !== 'function' || !document.body) return;
  new MutationObserver(() => {
    const open = Boolean(document.querySelector('[data-quiz]'));
    if (quizWasOpen && !open) renderGoals();
    quizWasOpen = open;
  }).observe(document.body, { childList: true });
}

/* ===========================================================================
   § DEADLINES — the card computes its own countdown
   =========================================================================== */

/* Local midnights on both sides: comparing raw milliseconds would flip the
   number at whatever time of day the deadline's timestamp happened to be. */
function midnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysUntil(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due - midnight(new Date())) / 86400000);
}

function countdownText(days) {
  if (days < 0) return '';        /* past: "Apply by Oct 1" is still true alone */
  if (days === 0) return ' — due today';
  return ` — ${days} ${days === 1 ? 'day' : 'days'} left`;
}

function paintDeadlines(root = document) {
  root.querySelectorAll('[data-deadline]').forEach((node) => {
    const slot = node.querySelector('[data-deadline-left]');
    if (!slot) return;
    const days = daysUntil(node.dataset.deadline);
    if (days === null) return;    /* unparseable: say nothing rather than lie */
    slot.textContent = countdownText(days);
  });
}

/* ===========================================================================
   § BOOT — module bodies run deferred, i.e. before DOMContentLoaded.
   That ordering is deliberate for the goals list: the rows exist before
   js/app.js's initChecks sweeps the page, so the quiz's goals are hydrated by
   it exactly like the seeded ones.
   =========================================================================== */

renderGoals();
paintDeadlines();
watchQuiz();

/* Both affordances are real buttons and are styled by css/home.css — no inline
   styles here. Note that js/app.js's speak() temporarily replaces
   #pigeonBubble's textContent after a save and restores it from
   `dataset.fpOriginal`, so this module must never rewrite the bubble's text. */
document.querySelectorAll('[data-open-quiz]').forEach((node) => {
  node.addEventListener('click', () => openQuiz());
});

/* A second tab writing the store (a quiz taken over there) should show up here
   too. `storage` never fires in the tab that did the write, so this does not
   double up with the observer above. */
window.addEventListener('storage', () => {
  renderGoals();
});
