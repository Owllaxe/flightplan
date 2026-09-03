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

  /* Onboarding Q4 promises "answering yes keeps the Visa tab front and centre",
     so answering *no* has to mean something. A domestic student loses the nav
     entry; the page itself stays reachable by URL, and the entry is left alone
     when it is the page you are currently on, so the item you navigated to
     never vanishes under you. Absent or unanswered ⇒ shown, because the visa
     track is the product's reason for existing. */
  const quiz = (store.all().flightplan || {}).quiz;
  if (quiz && quiz.intl === false) {
    root.querySelectorAll('.sidebar__link[href="visa.html"]').forEach((el) => {
      if (!el.classList.contains('is-active')) el.hidden = true;
    });
  }
}

document.addEventListener('DOMContentLoaded', () => paintSidebar());
