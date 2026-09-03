/* Resume editor — sections, entries, skill chips, editor/preview, export.

   This page owns its own persistence. It used to piggyback on app.js's generic
   [data-field] wiring, which stored `node.value || undefined`; store.set()
   deletes on undefined, so emptying a seeded input erased the key and the seed
   came straight back on reload. The markup now says [data-rz-field], app.js no
   longer touches these nodes, and everything below writes ONE document instead:

       store.get('lists', 'rz-doc')  /  store.set('lists', 'rz-doc', doc)

   `lists` — not a new top-level key — because app.js's USER_BUCKETS wipes
   `lists` when a different student signs in. A bespoke bucket would leak one
   student's resume into the next one's session.

   The rule that makes the seed bug impossible: doc.fields distinguishes
   "" (deliberately cleared, must be applied over the seeded value) from an
   absent key (never touched, leave the markup's seed alone). Nothing here may
   coerce '' to undefined or delete a key because it went empty. */

import { store } from './store.js';
import { readIdentity } from './sidebar.js';

const page = document.body;

const DOC_BUCKET = 'lists';
const DOC_KEY = 'rz-doc';

const ENTRY_KINDS = ['experience', 'education', 'certs'];
const ENTRY_PREFIX = { experience: 'exp', education: 'edu', certs: 'cert' };
const ENTRY_NOUN = { experience: 'Experience', education: 'Education', certs: 'Certification' };

/* --- tiny dom helpers ------------------------------------------------------ */

function qs(sel, root = document) {
  return root.querySelector?.(sel) || null;
}

function qsa(sel, root = document) {
  return [...(root.querySelectorAll?.(sel) || [])];
}

/* Includes `scope` itself when it matches, so wiring a freshly built node works
   whether the node is a container or the field. */
function scoped(scope, sel) {
  const out = [];
  if (scope?.matches?.(sel)) out.push(scope);
  return out.concat(qsa(sel, scope));
}

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === false || v === null || v === undefined) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  });
  kids.filter(Boolean).forEach((k) => node.append(k));
  return node;
}

function escape(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function colEl(which) {
  const cols = qsa('.rz-cols .rz-col');
  return which === 'right' ? cols[1] || null : cols[0] || null;
}

function colOf(card) {
  const col = card.closest('.rz-col');
  return col && col === colEl('right') ? 'right' : 'left';
}

function cardsIn(col) {
  return col ? qsa(':scope > .rz-card[data-section]', col) : [];
}

function allCards() {
  return qsa('.rz-cols .rz-card[data-section]');
}

function cardById(id) {
  return allCards().find((c) => c.dataset.section === id) || null;
}

function entryHost(kind) {
  return qs(`[data-entries="${kind}"]`);
}

function cardTitle(card) {
  return qs('[data-card-title]', card)?.textContent.trim() || 'section';
}

/* --- the document ---------------------------------------------------------- */

function domSections() {
  const out = [];
  ['left', 'right'].forEach((which) => {
    cardsIn(colEl(which)).forEach((card) => out.push({ id: card.dataset.section, col: which }));
  });
  return out;
}

function domEntries() {
  const out = {};
  ENTRY_KINDS.forEach((kind) => {
    out[kind] = qsa('[data-entry]', entryHost(kind)).map((n) => n.dataset.entry);
  });
  return out;
}

function freshDoc() {
  return { v: 1, seq: 0, fields: {}, entries: domEntries(), sections: domSections(), collapsed: {} };
}

/* Anything missing or the wrong shape falls back to what the markup seeds, so a
   half-written record can never blank the page. */
function normalise(raw) {
  const seed = freshDoc();
  const doc = {
    v: 1,
    seq: Number.isFinite(raw.seq) ? raw.seq : 0,
    fields: raw.fields && typeof raw.fields === 'object' ? { ...raw.fields } : {},
    entries: {},
    /* An empty stored list means "the student deleted them all", so only a
       missing/corrupt one falls back to the markup's seed. */
    sections: Array.isArray(raw.sections)
      ? raw.sections.filter((s) => s && s.id).map((s) => ({
        id: String(s.id),
        col: s.col === 'right' ? 'right' : 'left',
        ...(s.title ? { title: String(s.title) } : {}),
        ...(s.custom ? { custom: true } : {}),
      }))
      : seed.sections,
    collapsed: raw.collapsed && typeof raw.collapsed === 'object' ? { ...raw.collapsed } : {},
    migrated: raw.migrated === true,
  };
  ENTRY_KINDS.forEach((kind) => {
    const list = raw.entries && Array.isArray(raw.entries[kind]) ? raw.entries[kind] : seed.entries[kind];
    doc.entries[kind] = list.map(String);
  });
  return doc;
}

const stored = store.get(DOC_BUCKET, DOC_KEY, null);
const doc = stored && typeof stored === 'object' && !Array.isArray(stored)
  ? normalise(stored)
  : freshDoc();

let saveTimer = null;

function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  store.set(DOC_BUCKET, DOC_KEY, doc);
}

/* Keystrokes debounce; structural edits call saveNow() directly. */
function saveSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; store.set(DOC_BUCKET, DOC_KEY, doc); }, 200);
}

window.addEventListener('beforeunload', saveNow);

/* --- migration ------------------------------------------------------------- */

/* Everything this page ever wrote through app.js lived in the `fields` bucket
   under an `rz-` prefix. Adopt those values once, then delete them all: left
   behind they are orphans that no live input owns, and they would resurrect
   values the student has since deleted. The `migrated` flag is what keeps this
   from re-running after the very cleanup it performs. */
function migrateLegacyFields() {
  if (doc.migrated) return;
  const bucket = store.all().fields || {};
  const cleaned = {};
  let hadLegacy = false;
  Object.keys(bucket).forEach((key) => {
    if (key.startsWith('rz-')) {
      hadLegacy = true;
      if (!(key in doc.fields)) doc.fields[key] = String(bucket[key] ?? '');
    } else {
      cleaned[key] = bucket[key];
    }
  });
  doc.migrated = true;
  if (hadLegacy) store.replace({ fields: cleaned });
}

/* --- fields ---------------------------------------------------------------- */

function autosize(node) {
  if (node.tagName !== 'TEXTAREA' || !node.hasAttribute('data-autosize')) return;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight}px`;
}

/* Tracked out-of-band rather than with a marker attribute, so nothing this
   module adds shows up in the markup a student might inspect or print. */
const wiredFields = new WeakSet();
const wiredCards = new WeakSet();

function wireFields(scope) {
  scoped(scope, '[data-rz-field]').forEach((node) => {
    if (wiredFields.has(node)) return;
    wiredFields.add(node);
    const id = node.dataset.rzField;
    /* `in`, not a truthiness check: '' is a real, stored, user-made choice. */
    if (id in doc.fields) node.value = doc.fields[id];
    node.addEventListener('input', () => {
      doc.fields[id] = node.value;
      autosize(node);
      saveSoon();
    });
    autosize(node);
  });
}

/* Drops keys no live input owns any more — the orphan sweep that keeps deleted
   entries and sections from lingering in storage. Only safe once the DOM has
   been reconciled to the document. */
function pruneFields() {
  const live = new Set(qsa('[data-rz-field]').map((n) => n.dataset.rzField));
  Object.keys(doc.fields).forEach((key) => {
    if (!live.has(key)) delete doc.fields[key];
  });
}

/* --- entry templates ------------------------------------------------------- */

function inputField(id, slot, placeholder, label, extra = '') {
  return el('input', {
    class: `rz-input${extra ? ` ${extra}` : ''}`,
    type: 'text',
    'data-rz-field': `rz-${id}-${slot}`,
    placeholder,
    'aria-label': label,
  });
}

function buildEntry(kind, id, n) {
  const noun = ENTRY_NOUN[kind];

  if (kind === 'certs') {
    return el(
      'div',
      { class: 'cert-row', 'data-entry': id },
      el('span', { class: 'cert-row__grip', 'aria-hidden': 'true', text: '⋮⋮' }),
      inputField(id, 'name', 'Certification name', `${noun} ${n} name`),
      inputField(id, 'date', 'Date', `${noun} ${n} date`),
      el('button', { class: 'cert-row__remove', 'data-remove': true, type: 'button', 'aria-label': 'Remove certification', text: '×' }),
    );
  }

  const fields = el('div', { class: 'rz-fields' });
  if (kind === 'experience') {
    fields.append(
      inputField(id, 'title', 'Job title', `${noun} ${n} job title`),
      inputField(id, 'company', 'Company name', `${noun} ${n} company`),
      inputField(id, 'place', 'City, State', `${noun} ${n} location`),
      inputField(id, 'dates', 'Start – End', `${noun} ${n} dates`),
      el('textarea', {
        class: 'rz-textarea rz-span2',
        'data-rz-field': `rz-${id}-bullets`,
        'aria-label': `${noun} ${n} accomplishments`,
        placeholder: '• Describe your impact — start with an action verb...',
      }),
    );
  } else {
    fields.append(
      inputField(id, 'school', 'University name', `${noun} ${n} school`, 'rz-span2'),
      inputField(id, 'degree', 'Degree', `${noun} ${n} degree`),
      inputField(id, 'dates', 'Expected', `${noun} ${n} dates`),
      inputField(id, 'notes', 'Honours, GPA, activities', `${noun} ${n} honours, GPA and activities`, 'rz-span2'),
    );
  }

  return el(
    'div',
    { class: 'rz-entry', 'data-entry': id },
    el('span', { class: 'rz-entry__grip', 'aria-hidden': 'true', text: '⋮⋮' }),
    el('button', { class: 'rz-entry__remove', 'data-remove': true, type: 'button', 'aria-label': 'Remove entry', text: '×' }),
    fields,
  );
}

/* --- custom section cards -------------------------------------------------- */

function buildCard(id, title, badge, body) {
  const head = el(
    'div',
    { class: 'rz-card__head' },
    el('span', { class: 'rz-grip', 'data-grip': true, 'aria-hidden': 'true', text: '⋮⋮' }),
    el('h2', { class: 'rz-card__title', 'data-card-title': true, text: title }),
    el('span', { class: 'rz-card__badge', text: badge }),
    el(
      'span',
      { class: 'rz-card__menu-wrap' },
      el('button', {
        class: 'rz-card__menu',
        'data-menu': true,
        type: 'button',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        'aria-label': `Options for ${title} section`,
        text: '⋮',
      }),
    ),
    el('button', {
      class: 'rz-card__collapse',
      'data-collapse': true,
      type: 'button',
      'aria-label': `Collapse ${title} section`,
      text: '⌄',
    }),
  );
  return el('section', { class: 'rz-card', 'data-card': true, 'data-section': id }, head, el('hr', { class: 'divider' }), body);
}

function buildCustomCard(rec) {
  const title = rec.title || 'Section';
  const body = el(
    'div',
    { class: 'rz-card__body' },
    el('textarea', {
      class: 'rz-textarea rz-textarea--tall',
      'data-rz-field': `rz-${rec.id}`,
      'data-autosize': true,
      'aria-label': `${title} details`,
      placeholder: 'Add the details for this section...',
    }),
  );
  return buildCard(rec.id, title, 'TEXT', body);
}

/* --- collapse -------------------------------------------------------------- */

function applyCollapse(card, on) {
  const btn = qs('[data-collapse]', card);
  card.classList.toggle('is-collapsed', on);
  if (!btn) return;
  btn.textContent = on ? '›' : '⌄';
  btn.setAttribute('aria-label', `${on ? 'Expand' : 'Collapse'} ${cardTitle(card)} section`);
}

function wireCollapse(card) {
  const btn = qs('[data-collapse]', card);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const on = !card.classList.contains('is-collapsed');
    applyCollapse(card, on);
    if (on) doc.collapsed[card.dataset.section] = true;
    else delete doc.collapsed[card.dataset.section];
    saveNow();
  });
}

/* --- section record helpers ------------------------------------------------ */

function sectionRec(id) {
  return doc.sections.find((s) => s.id === id) || null;
}

/* The DOM is the source of truth for order after a move or a drag; titles and
   the custom flag are carried over from the previous records. */
function syncSectionsFromDom() {
  const prev = new Map(doc.sections.map((s) => [s.id, s]));
  const next = [];
  ['left', 'right'].forEach((which) => {
    cardsIn(colEl(which)).forEach((card) => {
      const id = card.dataset.section;
      next.push({ ...(prev.get(id) || { id }), id, col: which });
    });
  });
  doc.sections = next;
}

function setSectionTitle(card, title) {
  const h2 = qs('[data-card-title]', card);
  if (h2) h2.textContent = title;
  qs('[data-menu]', card)?.setAttribute('aria-label', `Options for ${title} section`);
  const collapse = qs('[data-collapse]', card);
  if (collapse) {
    const on = card.classList.contains('is-collapsed');
    collapse.setAttribute('aria-label', `${on ? 'Expand' : 'Collapse'} ${title} section`);
  }
  const rec = sectionRec(card.dataset.section);
  if (rec) {
    rec.title = title;
    /* A custom card's only input is named after the section. */
    if (rec.custom) qs(`[data-rz-field="rz-${rec.id}"]`, card)?.setAttribute('aria-label', `${title} details`);
  }
}

/* --- reconcile DOM to the document ----------------------------------------- */

function reconcileSections() {
  const known = new Set(doc.sections.map((s) => s.id));
  /* In the document's world a card that is not listed was deleted. */
  allCards().forEach((card) => { if (!known.has(card.dataset.section)) card.remove(); });

  doc.sections.forEach((rec) => {
    let card = cardById(rec.id);
    if (!card) {
      if (!rec.custom) return;      /* a built-in card the markup no longer ships */
      card = buildCustomCard(rec);
    }
    const col = colEl(rec.col);
    if (!col) return;
    /* The + Add Category wrapper is always the column's last child. */
    col.insertBefore(card, qs(':scope > .rz-addcat', col));
    if (rec.title) setSectionTitle(card, rec.title);
    applyCollapse(card, !!doc.collapsed[rec.id]);
  });

  /* Drop records whose card could not be produced, so Move up/down never
     indexes past the end of a column. */
  doc.sections = doc.sections.filter((s) => cardById(s.id));
}

function reconcileEntries() {
  ENTRY_KINDS.forEach((kind) => {
    const host = entryHost(kind);
    if (!host) return;
    const want = doc.entries[kind] || [];
    const wanted = new Set(want);
    const have = new Map(qsa('[data-entry]', host).map((n) => [n.dataset.entry, n]));
    have.forEach((node, id) => { if (!wanted.has(id)) node.remove(); });
    /* Appending in stored order both adds the missing ones and reorders the rest. */
    want.forEach((id, i) => host.append(have.get(id) || buildEntry(kind, id, i + 1)));
  });
}

/* --- entries: add and remove ----------------------------------------------- */

const wiredEntries = new WeakSet();

function wireEntry(node) {
  if (wiredEntries.has(node)) return;
  wiredEntries.add(node);
  qsa('[data-remove]', node).forEach((btn) => {
    btn.addEventListener('click', () => {
      /* [data-entry], not .rz-entry: certification rows are .cert-row and the
         old closest('.rz-entry') returned null for them, which threw. */
      const row = btn.closest('[data-entry]');
      if (!row) return;
      const kind = row.closest('[data-entries]')?.dataset.entries;
      const id = row.dataset.entry;
      row.remove();
      if (kind && doc.entries[kind]) doc.entries[kind] = doc.entries[kind].filter((x) => x !== id);
      pruneFields();
      saveNow();
    });
  });
}

qsa('[data-add-entry]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.addEntry;
    const host = entryHost(kind);
    if (!host || !ENTRY_PREFIX[kind]) return;
    doc.seq += 1;
    const id = `${ENTRY_PREFIX[kind]}-${doc.seq}`;
    doc.entries[kind] = [...(doc.entries[kind] || []), id];
    const node = buildEntry(kind, id, doc.entries[kind].length);
    host.append(node);
    wireEntry(node);
    wireFields(node);
    saveNow();
    qs('input, textarea', node)?.focus();
  });
});

/* --- inline text widget (replaces the two prompt() calls) ------------------- */

function inlineWidget({ label, placeholder, okText = 'Add', extraClass = '', keepOpen = false, onCommit, onClose }) {
  const input = el('input', { class: 'rz-input rz-inline__input', type: 'text', placeholder, 'aria-label': label });
  const ok = el('button', { class: 'btn btn--sm rz-inline__ok', type: 'button', text: okText });
  const cancel = el('button', { class: 'btn btn--sm btn--ghost rz-inline__cancel', type: 'button', text: 'Cancel' });
  const box = el('div', { class: `rz-inline${extraClass ? ` ${extraClass}` : ''}` }, input, ok, cancel);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    box.remove();
    onClose?.();
  }
  function commit() {
    const value = input.value.trim();
    if (!value) return;              /* never produce a blank section or chip */
    onCommit?.(value);
    if (keepOpen) { input.value = ''; input.focus(); } else close();
  }

  ok.addEventListener('click', commit);
  cancel.addEventListener('click', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  return { box, input, close };
}

/* --- add category ---------------------------------------------------------- */

function addCategory(which, name) {
  const col = colEl(which);
  if (!col) return;
  doc.seq += 1;
  const rec = { id: `cat-${doc.seq}`, col: which, title: name, custom: true };
  doc.sections.push(rec);
  const card = buildCustomCard(rec);
  col.insertBefore(card, qs(':scope > .rz-addcat', col));
  wireCard(card);
  wireFields(card);
  syncSectionsFromDom();
  saveNow();
  qs('textarea', card)?.focus();
}

qsa('[data-add-category]').forEach((btn) => {
  const wrap = btn.closest('.rz-addcat') || btn.parentElement;
  if (!wrap) return;
  btn.addEventListener('click', () => {
    if (qs('.rz-inline', wrap)) return;
    btn.hidden = true;
    const widget = inlineWidget({
      label: 'New section name',
      placeholder: 'Section name',
      okText: 'Add',
      extraClass: 'rz-inline--cat',
      onCommit: (name) => addCategory(btn.dataset.addCategory === 'right' ? 'right' : 'left', name),
      onClose: () => { btn.hidden = false; btn.focus(); },
    });
    wrap.append(widget.box);
    widget.input.focus();
  });
});

/* --- section menu ---------------------------------------------------------- */

const MENU_ITEMS = [
  { act: 'rename', text: 'Rename section' },
  { act: 'up', text: 'Move up' },
  { act: 'down', text: 'Move down' },
  { act: 'col', text: 'Move to right column' },
  { sep: true },
  { act: 'delete', text: 'Delete section', danger: true },
];

const DELETE_LABEL = 'Delete section';
const DELETE_ARMED = 'Click again to delete';

let openMenuCard = null;

function buildMenu() {
  const menu = el('div', { class: 'rz-menu', role: 'menu', hidden: true });
  MENU_ITEMS.forEach((item) => {
    if (item.sep) { menu.append(el('hr', { class: 'rz-menu__sep' })); return; }
    menu.append(el('button', {
      class: `rz-menu__item${item.danger ? ' rz-menu__item--danger' : ''}`,
      role: 'menuitem',
      type: 'button',
      'data-act': item.act,
      text: item.text,
    }));
  });
  return menu;
}

function menuOf(card) {
  return qs('.rz-card__menu-wrap .rz-menu', card);
}

function disarmDelete(card) {
  const item = qs('[data-act="delete"]', menuOf(card) || card);
  if (!item) return;
  item.classList.remove('rz-menu__item--armed');
  item.textContent = DELETE_LABEL;
}

function closeMenu() {
  if (!openMenuCard) return;
  const card = openMenuCard;
  openMenuCard = null;
  const menu = menuOf(card);
  if (menu) menu.hidden = true;
  disarmDelete(card);
  qs('[data-menu]', card)?.setAttribute('aria-expanded', 'false');
}

function openMenu(card) {
  closeMenu();
  const menu = menuOf(card);
  if (!menu) return;

  const col = card.closest('.rz-col');
  const siblings = cardsIn(col);
  const i = siblings.indexOf(card);
  const up = qs('[data-act="up"]', menu);
  const down = qs('[data-act="down"]', menu);
  if (up) up.disabled = i <= 0;
  if (down) down.disabled = i < 0 || i >= siblings.length - 1;

  const here = colOf(card);
  const colItem = qs('[data-act="col"]', menu);
  if (colItem) colItem.textContent = here === 'left' ? 'Move to right column' : 'Move to left column';

  disarmDelete(card);
  menu.hidden = false;
  openMenuCard = card;
  qs('[data-menu]', card)?.setAttribute('aria-expanded', 'true');
}

function startRename(card) {
  const h2 = qs('[data-card-title]', card);
  if (!h2 || qs('.rz-card__title-input', card)) return;
  const input = el('input', {
    class: 'rz-input rz-card__title-input',
    type: 'text',
    'aria-label': 'Section name',
  });
  input.value = h2.textContent.trim();
  h2.hidden = true;
  h2.after(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.remove();
    h2.hidden = false;
    /* A blank name would leave a headerless card, so it cancels instead. */
    if (commit && name) {
      setSectionTitle(card, name);
      saveNow();
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function moveCard(card, delta) {
  const col = card.closest('.rz-col');
  const siblings = cardsIn(col);
  const i = siblings.indexOf(card);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  if (delta < 0) col.insertBefore(card, siblings[j]);
  else col.insertBefore(card, siblings[j].nextSibling);
  syncSectionsFromDom();
  saveNow();
}

function moveCardToColumn(card, which) {
  const col = colEl(which);
  if (!col) return;
  col.insertBefore(card, qs(':scope > .rz-addcat', col));
  syncSectionsFromDom();
  saveNow();
}

function deleteSection(card) {
  const id = card.dataset.section;
  /* Entry lists live per kind, and a kind lives in exactly one card. */
  ENTRY_KINDS.forEach((kind) => {
    if (qs(`[data-entries="${kind}"]`, card)) doc.entries[kind] = [];
  });
  card.remove();
  doc.sections = doc.sections.filter((s) => s.id !== id);
  delete doc.collapsed[id];
  pruneFields();
  saveNow();
}

function wireMenu(card) {
  const wrap = qs('.rz-card__menu-wrap', card);
  const btn = qs('[data-menu]', card);
  if (!wrap || !btn) return;
  let menu = menuOf(card);
  if (!menu) { menu = buildMenu(); wrap.append(menu); }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openMenuCard === card) closeMenu();
    else openMenu(card);
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-act]');
    if (!item || item.disabled) return;
    e.stopPropagation();
    const act = item.dataset.act;

    if (act !== 'delete') disarmDelete(card);

    if (act === 'rename') { closeMenu(); startRename(card); return; }
    if (act === 'up') { moveCard(card, -1); closeMenu(); btn.focus(); return; }
    if (act === 'down') { moveCard(card, 1); closeMenu(); btn.focus(); return; }
    if (act === 'col') { moveCardToColumn(card, colOf(card) === 'left' ? 'right' : 'left'); closeMenu(); btn.focus(); return; }
    if (act === 'delete') {
      /* Two clicks instead of confirm(): a blocking browser dialog is the
         pattern this page is meant to be getting rid of. */
      if (!item.classList.contains('rz-menu__item--armed')) {
        item.classList.add('rz-menu__item--armed');
        item.textContent = DELETE_ARMED;
        return;
      }
      openMenuCard = null;
      deleteSection(card);
    }
  });
}

document.addEventListener('click', (e) => {
  if (!openMenuCard) return;
  const wrap = qs('.rz-card__menu-wrap', openMenuCard);
  if (wrap && wrap.contains(e.target)) return;
  closeMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !openMenuCard) return;
  const card = openMenuCard;
  closeMenu();
  qs('[data-menu]', card)?.focus();
});

/* --- drag to reorder sections ---------------------------------------------- */

/* `draggable` is switched on only while the grip is held: leaving it on would
   make every text selection inside the card start a drag instead. */
let dragCard = null;
let armedCard = null;

function endDrag() {
  qsa('.rz-col').forEach((c) => c.classList.remove('is-drop-zone'));
  if (!dragCard) return;
  const card = dragCard;
  dragCard = null;
  card.classList.remove('is-dragging');
  card.draggable = false;
  card.classList.add('is-drop-target');
  setTimeout(() => card.classList.remove('is-drop-target'), 400);
  syncSectionsFromDom();
  saveNow();
}

function insertionRef(col, y) {
  const others = cardsIn(col).filter((c) => c !== dragCard);
  return others.find((c) => {
    const box = c.getBoundingClientRect();
    return y < box.top + box.height / 2;
  }) || null;
}

function wireDrag(card) {
  const grip = qs('[data-grip]', card);
  if (!grip) return;
  const arm = () => { card.draggable = true; armedCard = card; };
  grip.addEventListener('pointerdown', arm);
  grip.addEventListener('mousedown', arm);

  card.addEventListener('dragstart', (e) => {
    if (!card.draggable) return;
    dragCard = card;
    card.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      /* Firefox refuses to start a drag without a payload. */
      try { e.dataTransfer.setData('text/plain', card.dataset.section || ''); } catch { /* ignore */ }
    }
  });
  card.addEventListener('dragend', endDrag);
}

document.addEventListener('pointerup', () => {
  if (armedCard && armedCard !== dragCard) armedCard.draggable = false;
  armedCard = null;
});

qsa('.rz-cols .rz-col').forEach((col) => {
  col.addEventListener('dragover', (e) => {
    if (!dragCard) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    col.classList.add('is-drop-zone');
    const ref = insertionRef(col, e.clientY) || qs(':scope > .rz-addcat', col);
    if (ref && ref !== dragCard.nextSibling) col.insertBefore(dragCard, ref);
    else if (!ref && dragCard.parentElement !== col) col.append(dragCard);
  });
  col.addEventListener('dragleave', (e) => {
    if (!col.contains(e.relatedTarget)) col.classList.remove('is-drop-zone');
  });
  col.addEventListener('drop', (e) => {
    if (!dragCard) return;
    e.preventDefault();
    endDrag();
  });
});

/* --- per-card wiring ------------------------------------------------------- */

function wireCard(card) {
  if (wiredCards.has(card)) return;
  wiredCards.add(card);
  wireCollapse(card);
  wireMenu(card);
  wireDrag(card);
}

/* --- skill chips ----------------------------------------------------------- */

const chipsHost = document.getElementById('rzChips');
const addSkillBtn = document.getElementById('rzAddSkill');
const DEFAULT_SKILLS = ['Python', 'React', 'SQL', 'Figma', 'Git', 'Communication'];

function skills() {
  const list = store.get('lists', 'rz-skills', DEFAULT_SKILLS);
  return Array.isArray(list) ? list : DEFAULT_SKILLS;
}

function renderChips() {
  if (!chipsHost) return;
  chipsHost.innerHTML = '';
  skills().forEach((name, i) => {
    const label = el('span', { text: name });
    const remove = el('button', { type: 'button', 'aria-label': `Remove skill ${name}`, text: '×' });
    remove.addEventListener('click', () => {
      store.set('lists', 'rz-skills', skills().filter((_, j) => j !== i));
      renderChips();
    });
    chipsHost.append(el('span', { class: 'chip' }, label, remove));
  });
}

if (addSkillBtn) {
  addSkillBtn.addEventListener('click', () => {
    const host = addSkillBtn.parentElement;
    if (!host || qs('.rz-inline', host)) return;
    addSkillBtn.hidden = true;
    const widget = inlineWidget({
      label: 'New skill',
      placeholder: 'Skill name',
      okText: 'Add',
      keepOpen: true,       /* several skills in a row is the normal case */
      onCommit: (name) => {
        store.set('lists', 'rz-skills', [...skills(), name]);
        renderChips();
      },
      onClose: () => { addSkillBtn.hidden = false; addSkillBtn.focus(); },
    });
    host.insertBefore(widget.box, addSkillBtn);
    widget.input.focus();
  });
}

/* --- editor / preview ------------------------------------------------------ */

const paper = document.getElementById('rzPaper');

function val(id) {
  return (qs(`[data-rz-field="${id}"]`)?.value || '').trim();
}

function rowValues(sel) {
  return qsa(sel)
    .map((row) => qsa('[data-rz-field]', row).map((f) => f.value.trim()))
    .filter((v) => v.some(Boolean));
}

function bullets(text) {
  const items = text.split('\n').map((l) => l.replace(/^[•\-\s]+/, '').trim()).filter(Boolean);
  return items.length ? `<ul>${items.map((i) => `<li>${escape(i)}</li>`).join('')}</ul>` : '';
}

function renderPreview() {
  if (!paper) return;

  /* The printed page is generated here rather than marked up, so it cannot use
     the [data-identity-name] hook the rest of the product uses. */
  const parts = [`<h1>${escape(readIdentity().name)}</h1>`];

  const summary = val('rz-summary');
  if (summary) parts.push(`<h2>Summary</h2><p>${escape(summary)}</p>`);

  const exps = rowValues('[data-entries="experience"] .rz-entry');
  if (exps.length) {
    parts.push('<h2>Experience</h2>');
    exps.forEach(([title, company, place, dates, body]) => {
      parts.push(`<p class="rz-paper__role">${escape(title)}${company ? ` · ${escape(company)}` : ''}</p>`);
      if (place || dates) parts.push(`<p>${escape([place, dates].filter(Boolean).join(' · '))}</p>`);
      if (body) parts.push(bullets(body));
      parts.push('<div style="height:14px"></div>');
    });
  }

  const edus = rowValues('[data-entries="education"] .rz-entry');
  if (edus.length) {
    parts.push('<h2>Education</h2>');
    edus.forEach(([school, degree, dates, notes]) => {
      parts.push(`<p class="rz-paper__role">${escape(school)}</p>`);
      parts.push(`<p>${escape([degree, dates].filter(Boolean).join(' · '))}</p>`);
      if (notes) parts.push(`<p>${escape(notes)}</p>`);
      parts.push('<div style="height:14px"></div>');
    });
  }

  /* Skills come from the store rather than the DOM, so they need an explicit
     check that the section still exists — a deleted card must not still print. */
  if (cardById('skills') && skills().length) {
    parts.push('<h2>Skills</h2>');
    parts.push(`<p>${skills().map(escape).join(' · ')}</p>`);
  }

  const certs = rowValues('[data-entries="certs"] .cert-row');
  if (certs.length) {
    parts.push('<h2>Certifications</h2>');
    certs.forEach(([name, date]) => parts.push(`<p>${escape(name)}${date ? ` — ${escape(date)}` : ''}</p>`));
  }

  doc.sections.filter((s) => s.custom).forEach((s) => {
    const text = val(`rz-${s.id}`);
    if (!text) return;
    parts.push(`<h2>${escape(s.title || 'Section')}</h2><p>${escape(text)}</p>`);
  });

  paper.innerHTML = parts.join('');
}

function setMode(preview) {
  qsa('#rzMode button').forEach((b) => {
    const on = (b.dataset.mode === 'preview') === preview;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  });
  page.classList.toggle('is-preview', preview);
  if (preview) renderPreview();
}

document.getElementById('rzMode')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  setMode(btn.dataset.mode === 'preview');
});

document.getElementById('rzExport')?.addEventListener('click', () => {
  setMode(true);
  window.print();
});

/* --- boot ------------------------------------------------------------------ */

migrateLegacyFields();
reconcileSections();
reconcileEntries();
allCards().forEach(wireCard);
qsa('[data-entry]').forEach(wireEntry);
wireFields(document);
pruneFields();          /* only meaningful once the DOM matches the document */
renderChips();
saveNow();
