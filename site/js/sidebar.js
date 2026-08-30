/* Sidebar hydration — the one script every page loads for the shared aside.

   The markup in each page already carries the seeded values, so the sidebar is
   correct with JavaScript off; this module only re-paints it from the store so
   a change made on one screen shows up on all of them.

   Build B drives THIS TERM from `GET /programs/{id}/coursemap`. A has no
   backend, so the numbers come from the `term` bucket in js/store.js, seeded to
   match Home ("Spring 2026, 15 credits in progress") and Profile (42 of 120
   credits earned, 35% major progress). */

import { store } from './store.js';

const SEED_TERM = {
  label: 'Spring 2026',
  doneCr: 42,
  totalCr: 120,
  inProgCr: 15,
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
}

document.addEventListener('DOMContentLoaded', () => paintSidebar());
