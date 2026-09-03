/* Profile — the parts of the page the student can actually change.

   Everything on profile.html ships as real markup: the seeded goals, skill
   chips, experience rows and advisor cards are all in the HTML, so the page
   reads correctly with no JS at all. This module only ever RE-paints — it
   replaces the seeded goals when the onboarding quiz has better answers, and
   appends whatever the student has added since. Nothing here renders an empty
   state over working markup.

   Three things changed from the first pass:
   1. Every "+ Add …" used prompt(). Raw browser dialogs look nothing like the
      rest of the product (and experiences fired TWO of them back to back), so
      they are inline inputs now, the same shape as plan.js's wireAdd.
   2. Added contacts were built into the DOM and never stored, so they vanished
      on reload. They persist under `lists`/`contacts` like everything else.
   3. The identity rows were bare labels with no editable values. They are
      persisted fields now, under `fields`/`pf-address` | `pf-phone` | `pf-email`.

   User text is only ever written with textContent / element properties — a
   contact called `<img onerror=…>` is a contact called `<img onerror=…>`. */

import { store } from './store.js';

/* --- small shared helpers -------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const getList = (id) => {
  const v = store.get('lists', id, undefined);
  return Array.isArray(v) ? v : [];
};

/* One place builds tel:/mailto: so the load path and the save path cannot
   drift apart. A bare 10-digit number is a US number; anything else (an
   extension, an international prefix, a typo) is passed through untouched
   rather than mangled. */
function contactHref(kind, value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (kind === 'email') return `mailto:${v}`;
  const digits = v.replace(/\D/g, '');
  return digits.length === 10 ? `tel:+1${digits}` : `tel:${v}`;
}

/* --- goals ----------------------------------------------------------------- */

/* Same source plan.js reads (js/app.js files the quiz under `flightplan`).
   No quiz answers means the four seeded <li>s in the HTML are still the best
   thing we have, so they are left exactly as they are. */
function renderGoals() {
  const list = $('pfGoals');
  if (!list) return;

  const fromQuiz = store.all().flightplan?.quiz?.goals;
  if (!Array.isArray(fromQuiz)) return;

  const goals = fromQuiz
    .map((g) => String(g ?? '').trim())
    .filter(Boolean);
  if (!goals.length) return;

  list.textContent = '';
  goals.forEach((text, i) => {
    const item = el('li', 'pf-goals__item');
    item.append(el('span', 'pf-goals__rank', String(i + 1)));
    item.append(el('span', 'pf-goals__text', text));
    list.append(item);
  });
}

/* --- student details ------------------------------------------------------- */

const IDENT_KEYS = ['address', 'phone', 'email'];

function paintIdent(view, key, value) {
  view.textContent = value;
  if (key === 'phone' || key === 'email') {
    const href = contactHref(key === 'email' ? 'email' : 'phone', value);
    if (href && 'href' in view) view.href = href;
  }
}

function wireIdentity() {
  const root = $('pfIdent');
  if (!root) return;

  const rows = IDENT_KEYS
    .map((key) => ({
      key,
      view: root.querySelector(`[data-ident-view="${key}"]`),
      input: root.querySelector(`[data-ident-input="${key}"]`),
    }))
    .filter((r) => r.view && r.input);
  if (!rows.length) return;

  /* stored values win over the seeded ones; nothing stored, nothing touched */
  rows.forEach(({ key, view }) => {
    const saved = store.get('fields', `pf-${key}`, undefined);
    if (typeof saved === 'string' && saved.trim()) paintIdent(view, key, saved.trim());
  });

  const editBtn = $('identEdit');
  if (!editBtn) return;   // values still repaint above; there is just no editor

  let editing = false;

  function setEditing(on) {
    editing = on;
    root.classList.toggle('is-editing', on);
    editBtn.setAttribute('aria-expanded', String(on));
    editBtn.textContent = on ? 'Save' : 'Edit';
    rows.forEach(({ view, input }) => {
      if (on) input.value = view.textContent.trim();
      view.hidden = on;
      input.hidden = !on;
    });
    if (on) rows[0].input.focus();
    else editBtn.focus();
  }

  /* A field left empty keeps whatever it had — clearing a box is far more
     often a slip than a request to blank out your own phone number. */
  function commit() {
    rows.forEach(({ key, view, input }) => {
      const value = input.value.trim();
      if (!value) return;
      store.set('fields', `pf-${key}`, value);
      paintIdent(view, key, value);
    });
    setEditing(false);
  }

  editBtn.addEventListener('click', () => (editing ? commit() : setEditing(true)));

  rows.forEach(({ input }) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);       // nothing written, seeded/stored text stands
      }
    });
  });
}

/* --- skills ---------------------------------------------------------------- */

function wireSkills() {
  const host = $('skills');
  if (!host) return;

  const addChip = (text) => host.append(el('span', 'skill', text));

  getList('skills').forEach((s) => {
    const text = String(s ?? '').trim();
    if (text) addChip(text);
  });

  const btn = $('addSkill');
  const input = $('skillInput');
  if (!btn || !input) return;

  const setOpen = (open) => {
    input.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else input.value = '';
  };

  btn.addEventListener('click', () => setOpen(input.hidden));

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btn.focus();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    addChip(value);
    store.set('lists', 'skills', [...getList('skills'), value]);
    input.value = '';
    input.focus();   // stays open: skills come in handfuls, not one at a time
  });
}

/* --- experience ------------------------------------------------------------ */

function wireExperience() {
  const list = $('expList');
  if (!list) return;

  function addItem({ role, meta }) {
    const item = el('div', 'pf-exp__item');
    item.append(el('h3', 'pf-exp__role', role));
    item.append(el('p', 'pf-exp__meta', meta || ''));
    list.append(item);
  }

  getList('experiences').forEach((x) => {
    const role = String(x?.role ?? '').trim();
    if (role) addItem({ role, meta: String(x?.meta ?? '').trim() });
  });

  const btn = $('addExperience');
  const form = $('expForm');
  if (!btn || !form) return;

  const roleInput = form.querySelector('[name="role"]');

  const setOpen = (open) => {
    form.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) roleInput?.focus();
    else {
      form.reset();
      btn.focus();
    }
  };

  btn.addEventListener('click', () => setOpen(form.hidden));
  form.querySelector('[data-cancel]')?.addEventListener('click', () => setOpen(false));

  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    setOpen(false);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const role = String(data.get('role') ?? '').trim();
    const meta = String(data.get('meta') ?? '').trim();
    if (!role) {
      roleInput?.focus();
      return;
    }
    addItem({ role, meta });
    store.set('lists', 'experiences', [...getList('experiences'), { role, meta }]);
    setOpen(false);
  });
}

/* --- contacts -------------------------------------------------------------- */

/* First letter of up to the first two words: "Career Center" -> CC. */
function initialsOf(name) {
  const letters = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return letters || '?';
}

/* Matches the two hand-written advisor cards. A field the student skipped is
   simply absent — a label with an em-dash under it is the exact bug this page
   is being rebuilt to remove. */
function contactCard({ name, role, email, phone, office }) {
  const card = el('article', 'advisor');

  const left = el('div', 'advisor__left');
  left.append(el('p', 'eyebrow advisor__eyebrow', role || 'Contact'));
  const avatar = el('div', 'advisor__avatar', initialsOf(name));
  avatar.setAttribute('aria-hidden', 'true');
  left.append(avatar);
  left.append(el('h3', 'advisor__name', name));

  const fields = el('div', 'advisor__fields');
  const addField = (label, node) => {
    fields.append(el('p', 'advisor__label', label));
    const value = el('p', 'advisor__value');
    value.append(node);
    fields.append(value);
  };

  if (email) {
    const link = el('a', 'link', email);
    link.href = contactHref('email', email);
    addField('EMAIL', link);
  }
  if (phone) {
    const link = el('a', null, phone);
    link.href = contactHref('phone', phone);
    addField('PHONE', link);
  }
  if (office) addField('OFFICE', document.createTextNode(office));

  card.append(left, fields);
  return card;
}

function wireContacts() {
  const addCard = $('addContactCard');
  const row = addCard?.parentElement;
  if (!addCard || !row) return;

  /* every card goes in front of the add-card, so "+" stays last in the row */
  const place = (contact) => row.insertBefore(contactCard(contact), addCard);

  getList('contacts').forEach((c) => {
    const name = String(c?.name ?? '').trim();
    if (!name) return;
    place({
      name,
      role: String(c?.role ?? '').trim(),
      email: String(c?.email ?? '').trim(),
      phone: String(c?.phone ?? '').trim(),
      office: String(c?.office ?? '').trim(),
    });
  });

  const btn = $('addContact');
  const form = $('contactForm');
  if (!btn || !form) return;

  const nameInput = form.querySelector('[name="name"]');

  const setOpen = (open) => {
    form.hidden = !open;
    addCard.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (open) nameInput?.focus();
    else {
      form.reset();
      btn.focus();
    }
  };

  btn.addEventListener('click', () => setOpen(form.hidden));
  form.querySelector('[data-cancel]')?.addEventListener('click', () => setOpen(false));

  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    setOpen(false);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const field = (key) => String(data.get(key) ?? '').trim();
    const contact = {
      name: field('name'),
      role: field('role'),
      email: field('email'),
      phone: field('phone'),
      office: field('office'),
    };
    if (!contact.name) {
      nameInput?.focus();
      return;
    }
    store.set('lists', 'contacts', [...getList('contacts'), contact]);
    place(contact);            // same builder the load path uses
    setOpen(false);
  });
}

/* --- boot ------------------------------------------------------------------ */

function init() {
  renderGoals();
  wireIdentity();
  wireSkills();
  wireExperience();
  wireContacts();
}

/* Module scripts are deferred, so the document is parsed by the time this
   runs — but the guard costs nothing and survives a stray non-module include. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
