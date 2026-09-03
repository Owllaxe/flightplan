/* Goals — build B's Personal-goals board (tools/buildB-spec.md §5) on build A's
   whiteboard engine.

   The engine below is A's, unchanged in substance. It is still written as a
   generic, exported whiteboard, but this page is now its only consumer — the
   product has one goals surface, and this is it.
   The board it carries is now B's: the §5.2 banner and the ten §5.8 modules,
   laid out on B's grid, dragged the way B drags them (a translate offset from
   the grid slot), persisted the way B persists them — but through A's store.

   WHERE THIS DELIBERATELY DIVERGES FROM B
   1. Pan deltas. B adds the raw screen delta to its pan offset AND divides
      module-drag deltas by the zoom, so panning drifts away from the cursor at
      any zoom but 1.0 while dragging does not. A's engine is correct at both:
      the pan moves `translate()`, which is applied outside `scale()`, so one
      screen pixel of cursor is one screen pixel of board at every zoom; the
      module drag divides by k because it writes board-space units. Kept.
   2. Pointer-anchored zoom. B has no wheel or pinch zoom at all — only two
      buttons that step a scalar, so the board slides under the cursor. A's
      zoom solves for the pan that keeps the board point under the pointer
      fixed. Kept. The buttons step by B's 0.1, from the centre of the view.
   3. Zoom limits. B clamps 0.6–1.3. A clamps 0.4–2.5, which is what lets the
      1400px board fit a small window and lets a card be inspected close up.
      Kept A's, so B's range sits inside it.
   4. A reset. B has neither pan bounds nor any way back once the board has
      been dragged off-screen. A's zoom pill doubles as "reset the view" and is
      kept. Hard pan bounds were NOT added — clamping the pan would break the
      1:1 cursor tracking that is the whole point of item 1.
   5. `animation:fpdrop` on the newest star jar star (B line 3413) names a
      keyframe that is never defined in B's bundle, so that star renders at
      opacity 0. Not ported: every star is simply drawn.
   6. B's dead `fp-dotted` / `fp-grow` classes have no CSS anywhere. Not ported.
   7. B's stat capsule hardcodes "· letter sealed ✉" whether or not a letter
      exists. Here it reflects the letter module's actual state. Every one of
      those states also has a way out, which B has for none of them: the sealed
      envelope and the delivered letter both re-open the editor, the editor can
      be left again without saving, and the delivery date cannot be set in the
      past — so no letter is ever locked into a state by a mistyped year.
   8. B's goals card advertises "Drag badges to re-rank", which B never
      implemented. The copy says only what the card does.
   9. B's module menu lists the goals card but the row does nothing. Here it
      shows and hides the goals card like every other row. The card still has no
      ✕ of its own — it is the page's anchor, so removing it should take the
      deliberate trip through the + menu — but a menu row that silently does
      nothing is worse than one that works, and the menu is then the card's one
      way back.
  10. The goal list is not private to this page. It is `flightplan.quiz.goals`,
      the same array the onboarding quiz writes and Home reads, so a goal added
      or renamed here shows up there. B kept the board's edits to itself.   */

import { store } from './store.js';
import { readIdentity, readTerm } from './sidebar.js';

/* ===========================================================================
   Whiteboard — pan, zoom, draw, erase, drag a panel, add a panel.

   One transform, one source of truth: `view = { x, y, k }` is written onto
   .wb-stage as `translate(x, y) scale(k)` with transform-origin 0 0. Everything
   in board space (the banner, the modules, the SVG ink layer, added panels) is
   a child of the stage, so it all moves together and nothing has to be kept in
   sync by hand.

       board -> screen :  s = b * k + xy
       screen -> board :  b = (s - xy) / k

   Zoom is anchored to the pointer by solving the second equation for xy with the
   board point held constant, so whatever is under the cursor stays under it.

   Panel drags happen in BOARD units: the screen delta is divided by k before it
   is added to the panel's board position, so the panel tracks the cursor exactly
   at any zoom and stays glued to its neighbours through a later pan or zoom.

   A panel marked `data-drag="offset"` keeps its place in the page's normal flow
   (B's model for the ten modules) and is moved with a `--dx/--dy` translate
   instead of `left/top`; everything else about the drag is identical.

   The tools, the zoom pill, the picker and the mascot live outside the stage and
   are `fixed`, which is what keeps them pinned and unscaled.
   =========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_K = 0.4;
const MAX_K = 2.5;
const ZOOM_STEP = 0.1;         // B's step size, on A's pointer-anchored zoom
const GRID = 18;               // B's dotted paper pitch, in BOARD px
const DOT_R = 1.2;             // B's dot radius, in BOARD px
const DOT_FEATHER = 1.4;       // B's transparent stop, in BOARD px
const STROKE_W = 2.6;          // board units, so ink scales with the cards

/* A pointerdown on any of these is the element's own business — neither a pan
   nor a panel drag. Checkboxes, buttons, links, fields and contenteditables all
   keep working exactly as they would without the whiteboard. (B's startModDrag
   bails on the same list.) */
const INTERACTIVE = 'a, button, input, textarea, select, label, [contenteditable=""], [contenteditable="true"]';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function isTyping(el) {
  return !!el && (el.isContentEditable
    || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName));
}

function debounce(fn, ms) {
  let t = 0;
  return () => { clearTimeout(t); t = setTimeout(fn, ms); };
}

/* --- panel templates for the + tool ----------------------------------------
   Each one is modelled on a module the board already has, so the picker adds
   more of the same vocabulary rather than a new one. */

const DOTS = Array.from({ length: 15 }, () =>
  '<button class="habit__dot wb-note__dot" type="button" aria-label="Toggle a day"></button>').join('');

const TEMPLATES = {
  note: {
    label: 'note', width: 236,
    body: '<div class="wb-note__text" contenteditable="true" data-placeholder="type here…"></div>',
  },
  checklist: {
    label: 'checklist', width: 248,
    body:
      '<div class="wb-note__row"><input type="checkbox"><span contenteditable="true" data-placeholder="a step…"></span></div>'
      + '<div class="wb-note__row"><input type="checkbox"><span contenteditable="true" data-placeholder="a step…"></span></div>'
      + '<div class="wb-note__row"><input type="checkbox"><span contenteditable="true" data-placeholder="a step…"></span></div>'
      + '<button class="wb-note__add" type="button" data-add="row">+ add a step</button>',
  },
  habit: {
    label: 'habit tracker', width: 262,
    body:
      '<div class="wb-note__habit"><div contenteditable="true" data-placeholder="habit name…"></div>'
      + `<div class="wb-note__dots">${DOTS}</div></div>`
      + '<p class="wb-note__foot">every tick = a star in the jar</p>',
  },
  people: {
    label: 'person', width: 236,
    body:
      '<div contenteditable="true" data-placeholder="who did you meet?"></div>'
      + '<div class="wb-note__row"><span contenteditable="true" data-placeholder="follow up…"></span></div>'
      + '<p class="wb-note__foot">(pigeon reminds)</p>',
  },
  wins: {
    label: 'wins log', width: 236,
    body:
      '<div class="wb-note__row"><span contenteditable="true" data-placeholder="what went well?"></span></div>'
      + '<button class="wb-note__add" type="button" data-add="win">+ add a win</button>'
      + '<p class="wb-note__foot">turns into resume bullets later</p>',
  },
};

export function initWhiteboard({ canvas, stage, ink, panels, board, tools, zoom, picker, clear, clearBtn, key }) {
  const view = { x: 0, y: 0, k: 1 };
  const strokes = [];            // { w, pts: [[x, y], …], el }
  let notes = [];                // { id, tpl, rot, el }
  let spaceDown = false;
  let seq = 0;
  let zTop = 4;

  const level = zoom?.querySelector('[data-zoom="home"]');
  const addBtn = tools.find((b) => b.dataset.tool === 'add');

  /* --- the transform ------------------------------------------------------ */

  /* The paper ground is painted on the viewport rather than inside the stage —
     an 18px pattern stretched over a board big enough to pan around would be a
     huge painted area — so the transform has to be applied to it by hand.

     BOTH halves of the pattern are board-space quantities and BOTH get k:
       · the pitch, via background-size — 18 board px between dots;
       · the dot itself, via the gradient's two radii — 1.2 board px of colour
         feathering out by 1.4. These are stops inside the tile, so they do NOT
         follow background-size; leaving them at their literal px was the bug
         that kept the dots one fixed screen size while their spacing moved,
         which reads as the dots swelling as you zoom out.
     background-position is the pan, i.e. the screen position of board (0, 0),
     so the tile is phase-locked to the board and a dot stays under the same
     board point through any pan. */
  function apply() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    const g = GRID * view.k;
    canvas.style.backgroundImage = `radial-gradient(var(--fp-dot) ${(DOT_R * view.k).toFixed(4)}px,`
      + ` transparent ${(DOT_FEATHER * view.k).toFixed(4)}px)`;
    canvas.style.backgroundSize = `${g}px ${g}px`;
    canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
    if (level) level.textContent = `${Math.round(view.k * 100)}%`;
  }

  function toBoard(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.x) / view.k,
      y: (clientY - r.top - view.y) / view.k,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const r = canvas.getBoundingClientRect();
    const b = toBoard(clientX, clientY);          // board point under the cursor
    const k = clamp(view.k * factor, MIN_K, MAX_K);
    if (k === view.k) return;
    view.k = k;
    view.x = (clientX - r.left) - b.x * k;        // …pinned back under the cursor
    view.y = (clientY - r.top) - b.y * k;
    apply();
    saveView();
  }

  function zoomCentre(factor) {
    const r = canvas.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  /* B steps the zoom by a flat 0.1 rather than a ratio; expressed as a factor so
     it goes through the one pointer-anchored code path. */
  function zoomNudge(dir) {
    const target = clamp(view.k + dir * ZOOM_STEP, MIN_K, MAX_K);
    if (Math.abs(target - view.k) < 1e-6) return;
    zoomCentre(target / view.k);
  }

  /* Home: the whole board width in view, its top edge at the top of the window.
     Returns false when the canvas has no geometry yet (a background tab, or a
     hidden ancestor). */
  function home() {
    const r = canvas.getBoundingClientRect();
    const w = board.offsetWidth || 1;
    if (r.width < 1) {
      view.k = 1; view.x = 0; view.y = 0;
      apply();
      return false;
    }
    view.k = clamp(Math.min(1, (r.width - 40) / w), MIN_K, MAX_K);
    view.x = Math.max(0, (r.width - w * view.k) / 2);
    view.y = 0;
    apply();
    saveView();
    return true;
  }

  /* --- persistence -------------------------------------------------------- */

  const saveView = debounce(() => store.set('lists', `${key}-view`, { ...view }), 250);
  const saveInk = debounce(
    () => store.set('lists', `${key}-ink`, strokes.map((s) => ({ w: s.w, pts: s.pts }))), 250);

  const isOffset = (el) => el.dataset.drag === 'offset';

  function boardPos(el) {
    if (isOffset(el)) {
      return {
        x: parseFloat(el.style.getPropertyValue('--dx')) || 0,
        y: parseFloat(el.style.getPropertyValue('--dy')) || 0,
      };
    }
    // an inline left/top is the moved position; otherwise the CSS (Figma) one,
    // which offsetLeft/Top report directly because every layer origin is (0, 0)
    if (el.style.left) return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
    return { x: el.offsetLeft, y: el.offsetTop };
  }

  function setBoardPos(el, x, y) {
    if (isOffset(el)) {
      el.style.setProperty('--dx', `${x}px`);
      el.style.setProperty('--dy', `${y}px`);
    } else {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }

  /* Board panels persist as a plain id -> {x, y} map, so a panel that has never
     been moved simply has no entry and keeps its layout position. */
  const savePos = debounce(() => {
    const map = {};
    board.querySelectorAll('[data-panel]').forEach((el) => {
      if (isOffset(el)) {
        const x = parseFloat(el.style.getPropertyValue('--dx'));
        if (Number.isFinite(x)) map[el.dataset.panel] = { x, y: parseFloat(el.style.getPropertyValue('--dy')) || 0 };
      } else if (el.style.left) {
        map[el.dataset.panel] = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
      }
    });
    store.set('lists', `${key}-pos`, Object.keys(map).length ? map : undefined);
  }, 250);

  function syncNote(el) {
    // `checked` is a property, not an attribute — reflect it so innerHTML keeps it
    el.querySelectorAll('input[type="checkbox"]').forEach((i) => {
      if (i.checked) i.setAttribute('checked', ''); else i.removeAttribute('checked');
    });
  }

  const saveNotes = debounce(() => store.set('lists', `${key}-notes`, notes.map((n) => {
    const body = n.el.querySelector('.wb-note__body');
    syncNote(body);
    return {
      id: n.id,
      tpl: n.tpl,
      rot: n.rot,
      x: parseFloat(n.el.style.left) || 0,
      y: parseFloat(n.el.style.top) || 0,
      html: body.innerHTML,
    };
  })), 250);

  /* --- tools -------------------------------------------------------------- */

  const tool = () => tools.find((b) => b.classList.contains('is-on'))?.dataset.tool || '';

  function setTool(name) {
    tools.forEach((b) => b.classList.toggle('is-on', b.dataset.tool === name));
    /* the add button is a popover trigger, not a toggle: it already carries
       aria-haspopup + an aria-expanded that setPicker keeps in sync, and a
       second conflicting state on it would only mislead a reader. */
    tools.forEach((b) => { if (b.dataset.tool !== 'add') b.setAttribute('aria-pressed', String(b.dataset.tool === name)); });
    canvas.dataset.tool = name || '';
    disarmClear();
    paintClear();
  }

  function setPicker(open) {
    if (!picker) return;
    picker.hidden = !open;
    addBtn?.setAttribute('aria-expanded', String(open));
    addBtn?.classList.toggle('is-on', open);
  }

  tools.forEach((btn) => btn.addEventListener('click', () => {
    const t = btn.dataset.tool;
    if (t === 'add') {
      setTool('');
      if (picker) setPicker(picker.hidden);       // the picker is the + tool's UI
      else addPanel('note');
      return;
    }
    setPicker(false);
    setTool(tool() === t ? '' : t);               // exactly one at a time
  }));

  picker?.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-tpl]');
    if (!opt) return;
    addPanel(opt.dataset.tpl);
    setPicker(false);
  });

  /* --- ink ---------------------------------------------------------------- */

  function pathData(pts) {
    if (pts.length === 1) {
      const [x, y] = pts[0];
      return `M${x.toFixed(1)} ${y.toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  }

  function addStroke(s) {
    const el = document.createElementNS(SVG_NS, 'path');
    el.setAttribute('class', 'wb-stroke');
    el.setAttribute('stroke-width', String(s.w));
    el.setAttribute('d', pathData(s.pts));
    ink.append(el);
    s.el = el;
    strokes.push(s);
    paintClear();
    return s;
  }

  function startStroke(e) {
    const p = toBoard(e.clientX, e.clientY);
    const s = addStroke({ w: STROKE_W, pts: [[p.x, p.y]] });
    drag((ev) => {
      const q = toBoard(ev.clientX, ev.clientY);
      const last = s.pts[s.pts.length - 1];
      if (Math.hypot(q.x - last[0], q.y - last[1]) < 1.2 / view.k) return;
      s.pts.push([q.x, q.y]);
      s.el.setAttribute('d', pathData(s.pts));
    }, saveInk);
  }

  function eraseAt(clientX, clientY) {
    const p = toBoard(clientX, clientY);
    const r = 14 / view.k;
    let hit = false;
    for (let i = strokes.length - 1; i >= 0; i -= 1) {
      const s = strokes[i];
      if (s.pts.some(([x, y]) => Math.hypot(x - p.x, y - p.y) <= r + s.w)) {
        s.el.remove();
        strokes.splice(i, 1);
        hit = true;
      }
    }
    if (hit) paintClear();                       // the last stroke going takes the button with it
    return hit;
  }

  function startErase(e) {
    eraseAt(e.clientX, e.clientY);
    drag((ev) => eraseAt(ev.clientX, ev.clientY), saveInk);
  }

  /* --- erase all ----------------------------------------------------------
     Optional chrome: the engine is generic, so every hook below no-ops when the
     host page has no clear control. */

  const CLEAR_IDLE = 'erase all doodles';
  const CLEAR_ARMED = 'erase all? tap again';
  let armTimer = 0;

  function clearInk() {
    strokes.forEach((s) => s.el?.remove());
    strokes.length = 0;                          // same array, so nothing else goes stale
    saveInk();
  }

  /* label, class and aria name move together, so the button can never say one
     thing and mean another */
  function armClear() {
    if (!clearBtn) return;
    clearTimeout(armTimer);
    clearBtn.textContent = CLEAR_ARMED;
    clearBtn.classList.add('is-armed');
    clearBtn.setAttribute('aria-label', 'Confirm — erase every doodle on the board');
    // wiping the ink cannot be undone, so an unanswered confirm expires itself
    armTimer = setTimeout(disarmClear, 4000);
  }

  function disarmClear() {
    if (!clearBtn) return;
    clearTimeout(armTimer);
    armTimer = 0;
    clearBtn.textContent = CLEAR_IDLE;
    clearBtn.classList.remove('is-armed');
    clearBtn.setAttribute('aria-label', 'Erase all doodles on the board');
  }

  const isArmed = () => !!clearBtn?.classList.contains('is-armed');

  function paintClear() {
    if (!clear) return;
    const show = tool() === 'erase' && strokes.length > 0;
    clear.hidden = !show;
    if (!show) disarmClear();                    // a hidden button must not stay armed
  }

  clearBtn?.addEventListener('click', () => {
    if (!isArmed()) { armClear(); return; }
    clearInk();
    disarmClear();
    paintClear();
  });

  /* --- added panels ------------------------------------------------------- */

  const ROTS = [-1.6, 1.2, -0.7, 2];

  function makeNote(n) {
    const t = TEMPLATES[n.tpl] || TEMPLATES.note;
    const el = document.createElement('section');
    el.className = `wb-note wb-note--${n.tpl}`;
    el.dataset.panel = n.id;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${t.width}px`;
    el.style.setProperty('--rot', `${n.rot}deg`);
    el.innerHTML = `
      <p class="wb-note__label">
        <span>${t.label}</span>
        <button class="wb-note__del" type="button" aria-label="Delete this panel">×</button>
      </p>
      <div class="wb-note__body">${n.html ?? t.body}</div>`;

    const body = el.querySelector('.wb-note__body');
    // one delegated set of listeners covers every template
    body.addEventListener('input', saveNotes);
    body.addEventListener('change', saveNotes);
    body.addEventListener('click', (e) => {
      const dot = e.target.closest('.wb-note__dot');
      if (dot) { dot.classList.toggle('is-on'); saveNotes(); return; }
      const add = e.target.closest('[data-add]');
      if (!add) return;
      const row = document.createElement('div');
      row.className = 'wb-note__row';
      row.innerHTML = add.dataset.add === 'win'
        ? '<span contenteditable="true" data-placeholder="what went well?"></span>'
        : '<input type="checkbox"><span contenteditable="true" data-placeholder="a step…"></span>';
      add.before(row);
      row.querySelector('[contenteditable]').focus();
      saveNotes();
    });
    el.querySelector('.wb-note__del').addEventListener('click', () => {
      el.remove();
      notes = notes.filter((o) => o !== n);
      saveNotes();
    });

    n.el = el;
    panels.append(el);
    notes.push(n);
    return n;
  }

  /* Drops into the centre of the current view, in board coordinates. */
  function addPanel(tpl = 'note') {
    const r = canvas.getBoundingClientRect();
    const c = toBoard(r.left + r.width / 2, r.top + r.height / 2);
    const t = TEMPLATES[tpl] || TEMPLATES.note;
    seq += 1;
    const n = makeNote({
      id: `n-${Date.now()}-${seq}`,
      tpl: TEMPLATES[tpl] ? tpl : 'note',
      x: Math.round(c.x - t.width / 2 + (seq % 4) * 18),
      y: Math.round(c.y - 80 + (seq % 4) * 18),
      rot: ROTS[seq % ROTS.length],
    });
    saveNotes();
    n.el.querySelector('[contenteditable]')?.focus();
    return n;
  }

  /* --- panel drag (board units) ------------------------------------------- */

  function startPanelDrag(e, el) {
    const o = boardPos(el);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    // No preventDefault: capturing the pointer or eating the default would kill
    // the compatibility click/dblclick the goal rows rely on.
    drag((ev) => {
      const dxs = ev.clientX - sx;
      const dys = ev.clientY - sy;
      if (!moved) {
        if (Math.hypot(dxs, dys) < 3) return;     // a click, not a drag
        moved = true;
        el.classList.add('is-dragging');
        canvas.classList.add('is-dragging');
        el.style.zIndex = String((zTop += 1));
        document.getSelection?.()?.removeAllRanges();
      }
      setBoardPos(el, o.x + dxs / view.k, o.y + dys / view.k);   // <- the /k
    }, () => {
      canvas.classList.remove('is-dragging');
      el.classList.remove('is-dragging');
      if (!moved) return;
      if (el.classList.contains('wb-note')) saveNotes(); else savePos();
    });
  }

  /* --- pan ---------------------------------------------------------------- */

  /* Window-level listeners rather than setPointerCapture: capture retargets the
     compatibility mouse events and would break click/dblclick on the cards. */
  function drag(onMove, onEnd) {
    const move = (ev) => onMove(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* The pan is added to `translate()`, which sits OUTSIDE `scale()`, so the
     board moves by exactly the cursor delta at every zoom. B adds the same raw
     delta to a transform whose translate is applied *before* its own scale, so
     its board drifts by delta*(1/k) — the drift bug that is not ported. */
  function startPan(e) {
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = view.x;
    const oy = view.y;
    let moved = false;
    drag((ev) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved) {
        if (Math.hypot(dx, dy) < 3) return;
        moved = true;
        canvas.classList.add('is-panning');
      }
      view.x = ox + dx;
      view.y = oy + dy;
      apply();
    }, () => {
      canvas.classList.remove('is-panning');
      if (moved) saveView();
    });
  }

  /* --- input -------------------------------------------------------------- */

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;                       // leave the context menu alone
    const t = e.target instanceof Element ? e.target : null;

    // middle-drag and space-drag always pan, even over a card
    if (e.button === 1 || spaceDown) { e.preventDefault(); startPan(e); return; }

    const active = tool();
    if (active === 'draw') { e.preventDefault(); startStroke(e); return; }
    if (active === 'erase') { e.preventDefault(); startErase(e); return; }

    // a checkbox, button, link, field or contenteditable keeps working normally —
    // checked BEFORE the panel drag, so an interactive hit never starts one
    if (t?.closest(INTERACTIVE)) return;

    const panel = t?.closest('[data-panel]');
    if (panel) { startPanelDrag(e, panel); return; }

    startPan(e);
  });

  // Chrome's middle-click autoscroll fires off mousedown, not pointerdown
  canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();                               // ctrl/cmd+wheel = trackpad pinch
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = clamp(e.deltaY * unit, -320, 320);
    zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.002));
  }, { passive: false });

  zoom?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zoom]');
    if (!btn) return;
    if (btn.dataset.zoom === 'in') zoomNudge(1);
    else if (btn.dataset.zoom === 'out') zoomNudge(-1);
    else home();
  });

  // clicking anywhere off the picker closes it
  window.addEventListener('pointerdown', (e) => {
    if (!picker || picker.hidden) return;
    if (e.target.closest('.wb-picker') || e.target.closest('[data-tool="add"]')) return;
    setPicker(false);
  }, true);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { setPicker(false); return; }
    if (isTyping(document.activeElement)) return;
    if (e.code === 'Space') { spaceDown = true; canvas.classList.add('is-grab'); e.preventDefault(); return; }
    if (e.key === '0') { home(); return; }
    if (e.key === '1') { zoomCentre(1 / view.k); return; }   // exactly 100%
    if (e.key === '=' || e.key === '+') { zoomNudge(1); return; }
    if (e.key === '-' || e.key === '_') zoomNudge(-1);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; canvas.classList.remove('is-grab'); }
  });
  window.addEventListener('blur', () => { spaceDown = false; canvas.classList.remove('is-grab'); });

  /* --- restore ------------------------------------------------------------ */

  (store.get('lists', `${key}-ink`, []) || [])
    .forEach((s) => { if (s?.pts?.length) addStroke({ w: s.w || STROKE_W, pts: s.pts }); });
  paintClear();

  (store.get('lists', `${key}-notes`, []) || [])
    .forEach((n) => { if (n) makeNote({ ...n, tpl: n.tpl || 'note', rot: n.rot ?? -1 }); });

  const savedPos = store.get('lists', `${key}-pos`, null);
  if (savedPos) {
    Object.entries(savedPos).forEach(([id, p]) => {
      const el = board.querySelector(`[data-panel="${CSS.escape(id)}"]`);
      if (el && Number.isFinite(p?.x)) setBoardPos(el, p.x, p.y);
    });
  }

  const saved = store.get('lists', `${key}-view`, null);
  if (saved && Number.isFinite(saved.k)) {
    view.k = clamp(saved.k, MIN_K, MAX_K);
    view.x = saved.x || 0;
    view.y = saved.y || 0;
    apply();
  } else if (!home()) {
    // No geometry at load (hidden ancestor / zero-sized frame). Retry as soon as
    // the canvas gets a size. rAF and ResizeObserver are not reliable in a hidden
    // document, so plain timers back them up.
    let tries = 0;
    const refit = () => {
      if (home() || (tries += 1) > 40) {
        ro.disconnect();
        clearInterval(timer);
        window.removeEventListener('resize', refit);
        canvas.removeEventListener('pointerdown', refit, true);
      }
    };
    const ro = new ResizeObserver(refit);
    ro.observe(canvas);
    const timer = setInterval(refit, 50);
    window.addEventListener('resize', refit);
    canvas.addEventListener('pointerdown', refit, true);
  }

  return {
    view, strokes, notes, home, zoomAt, zoomCentre, zoomNudge, toBoard, addPanel,
    setTool, tool, setPicker, clearInk,
    templates: Object.keys(TEMPLATES),
    limits: { min: MIN_K, max: MAX_K, step: ZOOM_STEP },
  };
}

/* ===========================================================================
   Build B's Personal-goals board — the product's single goals surface. The
   engine above stays exported and generic, but this boot is the only caller.

   Everything B kept in `flightplan.*` localStorage keys is kept here in A's one
   JSON blob, under the existing `lists` bucket:

     lists['plan-pos']          {id: {x, y}}       module drag offsets
     lists['plan-hidden']       [id, …]            hidden modules
     lists['plan-goal-meta']    {goal text: {where, how}}
     lists['plan-habits']       {habit: [0|1, …]}  star-jar ticks (B never saved these)
     lists['plan-skills']       [{n, wks, p}]      skill bars
     lists['plan-letter']       {text, deliver}    the letter
     lists['plan-todo']         [{t, done}]
     lists['plan-long']         [text, …]
     lists['plan-people']       [{n, ctx, note}]
     lists['plan-wins']         [text, …]

   plus the engine's own lists['plan-view' | 'plan-ink' | 'plan-notes'] and the
   goal checkboxes in the shared `checks` bucket. No new store bucket was added.

   The goal list itself is NOT one of these. It lives in `flightplan.quiz.goals`
   as a flat array of strings — the array the onboarding quiz writes and Home
   reads — so the board and Home cannot disagree about what the goals are. The
   two keys that used to hold this page's private edits, lists['plan-goal-rename']
   and lists['plan-goal-extra'], are migrated into it once at boot and deleted.
   =========================================================================== */

const MODULES = [
  ['goals',  'Semester goals'],
  ['cal',    'Calendar'],
  ['habits', 'Habit tracker & star jar'],
  ['week',   'This week'],
  ['todo',   'To do list'],
  ['letter', 'Letter to future self'],
  ['long',   'Long-term goals'],
  ['people', 'People I met'],
  ['wins',   'Wins log'],
  ['skill',  'Skill in progress'],
];

/* §5.9 — the module texts the cursor-following tip shows. */
const TIPS = {
  goals:  'your semester goals — tap one to add where + how, double-click to rename, tick the box when it’s done. drag any card to rearrange the page',
  cal:    'your live calendar — the arrows flip between months',
  habits: 'click a circle to tick a habit — every tick drops a star into the jar',
  week:   'this week’s classes, auto-filled from your semester courses',
  todo:   'your running to-do list — tick a box to finish a task, + adds a new one',
  letter: 'write a letter to future you — pick a date and the pigeon delivers it near graduation',
  long:   'big-picture goals past this semester — check one off when life catches up',
  people: 'people you meet — save them here so follow-ups don’t slip',
  wins:   'your wins log — + adds a win; these turn into resume bullets later',
  skill:  'skills you’re learning — click anywhere on a bar to set progress, + adds a skill, ✕ removes one',
};

/* The display-only fallback list, until the user's first goal edit. B's per-goal
   `rank` is gone: the list is a flat array of strings now, so a goal's rank is
   simply where it sits in it. */
const GOAL_SEED = [
  { t: 'find an on-campus job', where: 'LinkedIn & Handshake', how: 'apply to 3+ jobs, see who answers back' },
  { t: 'GPA 4.0', where: 'ace calc midterms ✓', how: 'A on english essay' },
  { t: 'apply to 3 internships', where: 'Career Match list', how: '1 per week' },
  { t: 'talk to one professor about research', where: '', how: '' },
];

const HABIT_SEED = [
  { k: 'sleep', n: 'sleep before 1am', filled: 6, total: 14 },
  { k: 'gym', n: 'gym x2 / week', filled: 4, total: 14 },
  { k: 'network', n: 'one networking msg', filled: 3, total: 12 },
];

/* B's FP_JAR pile is a fixed 31-slot layout; the spec records its bounds
   (x 14–161, y 60–221, rotation −30°…24°) rather than the array itself, so this
   is a reconstruction. Rather than scatter slots inside that bounding box —
   which puts stars through the glass wherever the jar is narrower than the box,
   i.e. the whole shoulder and base — the slots were solved against the jar's
   actual silhouette, read out of star-jar-front.png: for every row the left and
   right edges of the ink were measured, inset 7px for the glass wall, and each
   slot placed so that the star's ROTATED bounding box (37x36 turned by r, so up
   to 50x50) still fits between them over its full vertical extent.

   Each entry is [left, top, rotationDeg] in the jar's 210x280 space, for a
   37x36 star rotated about its centre. Seven rows, filled bottom-up, so the
   pile grows off the base of the jar as stars are earned. Resulting bounds:
   left 23–152, top 60–210, rotation −26°…24° — inside the spec's box, and
   inside the glass, which the box alone would not have guaranteed. */
const JAR_PILE = [
  [50, 208, -6], [72, 210, 10], [97, 209, -18], [121, 207, 4],
  [30, 182, 14], [54, 183, -10], [88, 184, 20], [111, 183, -2], [144, 185, 8],
  [24, 161, -22], [52, 163, 6], [85, 162, 16], [116, 158, -8], [150, 159, 22],
  [23, 134, 2], [54, 136, -14], [83, 136, 12], [116, 133, 24], [150, 137, -4],
  [23, 110, 18], [63, 111, -20], [110, 113, 8], [152, 110, -2],
  [29, 87, -12], [65, 88, 22], [104, 89, 4], [146, 86, -26],
  [43, 60, 16], [73, 60, -8], [102, 63, 20], [128, 64, 6],
];

/* §5.8 module 4 — "courses come from the fetched semester plan" in B. A has no
   catalog service, so the week is filled from the courses A's own Home and
   Profile screens already show for this term. */
const WEEK_COURSES = [
  ['Mon', ['CS 210', 'PHYS']],
  ['Tue', ['ENGL', 'MATH']],
  ['Wed', ['CS 210', 'PSY']],
  ['Thu', ['ENGL', 'MATH']],
  ['Fri', ['CS 210', 'PHYS']],
];
const COURSE_TINT = {
  'CS 210': 'var(--c-cs)', PHYS: 'var(--c-phys)', ENGL: 'var(--c-engl)',
  MATH: 'var(--c-math)', PSY: 'var(--c-psy)',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const getList = (id, fallback) => {
  const v = store.get('lists', id, undefined);
  return Array.isArray(v) ? v : fallback;
};
const getMap = (id) => {
  const v = store.get('lists', id, undefined);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};
const setList = (id, v) => store.set('lists', id, v && (Array.isArray(v) ? v.length : Object.keys(v).length) ? v : undefined);

function bootPlanBoard() {
  /* --- banner (§5.2) ------------------------------------------------------ */

  /* the same helpers the sidebar hydrates from, so the name and the term here
     can never disagree with the aside next to them */
  const firstName = String(readIdentity().name || '').trim().split(/\s+/)[0] || 'Your';
  const termLabel = String(readTerm().label || '').trim();
  /* the nav calls this page Goals, so the heading does too; the board's
     career-plan identity moves down into the subtitle rather than being lost */
  $('fpTitle').textContent = `${firstName}’s goals`;
  $('fpDate').textContent = termLabel ? `${termLabel} · career plan board` : 'career plan board';

  function refreshBanner() {
    const n = $('fpGoalList').querySelectorAll('.fp-goal').length;
    $('fpGoalCount').textContent = `${n} goal${n === 1 ? '' : 's'}`;
  }

  /* --- module show / hide (§5.5, §5.3) ------------------------------------ */

  let hidden = getList('plan-hidden', []);
  const menu = $('wbModules');

  function paintModules() {
    document.querySelectorAll('.fp-card[data-panel]').forEach((card) => {
      card.hidden = hidden.includes(card.dataset.panel);
    });
    menu.querySelectorAll('[data-mod]').forEach((row) => {
      row.classList.toggle('is-off', hidden.includes(row.dataset.mod));
    });
  }

  MODULES.forEach(([id, label]) => {
    const row = el('button', 'wb-picker__mod');
    row.type = 'button';
    row.dataset.mod = id;
    row.append(el('span', 'wb-picker__dot'), el('span', null, label));
    /* every row toggles its card, goals included — the goals card has no ✕ of
       its own because it is the page's anchor, which makes this menu its only
       control rather than a reason to leave the row dead. */
    row.addEventListener('click', () => {
      hidden = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
      setList('plan-hidden', hidden);
      paintModules();
    });
    menu.append(row);
  });

  document.querySelectorAll('.fp-card__x').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.hide;
      if (!hidden.includes(id)) hidden = [...hidden, id];
      setList('plan-hidden', hidden);
      paintModules();
    });
  });

  /* --- 1. semester goals (§5.8) ------------------------------------------- */

  const goalList = $('fpGoalList');
  const metas = getMap('plan-goal-meta');

  /* the seed's where/how has to survive the list becoming flat strings, so it is
     looked up by goal text like every other per-goal detail. */
  const SEED_META = Object.fromEntries(
    GOAL_SEED.map((g) => [g.t, { where: g.where, how: g.how }]));

  /* the checkbox key is derived from the text rather than stored, which is why a
     rename has to carry the tick across by hand (see renameGoal). */
  const goalKey = (text) =>
    `pl-goal-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

  /* B line 3028: goals from the pigeon quiz replace the seed entirely. That quiz
     lives in js/app.js here and files its answers under the store's `flightplan`
     key — and Home reads the same array, so this board writes back to it instead
     of keeping its edits private. app.js's flightplan()/patchFlightplan() are not
     exported, so the same spread is repeated locally. */
  function readSharedGoals() {
    const raw = store.all().flightplan?.quiz?.goals;
    if (!Array.isArray(raw)) return null;
    const clean = raw.map((t) => String(t).trim()).filter(Boolean);
    return clean.length ? clean : null;
  }

  function writeSharedGoals() {
    const fp = store.all().flightplan || {};
    store.replace({ flightplan: { ...fp, quiz: { ...(fp.quiz || {}), goals: [...goals] } } });
  }

  /* one-time migration. The list used to be assembled at render time from three
     places: the shared array (or the seed), lists['plan-goal-rename'] and
     lists['plan-goal-extra']. Returning users have real work in those last two,
     so it is folded in once and the keys are cleared — without this a renamed or
     added goal would silently disappear the first time this build loads, and
     leaving them in place would let the two copies drift apart again. */
  function mergeLegacy(base) {
    const renames = getMap('plan-goal-rename');
    const extra = getList('plan-goal-extra', []);
    const merged = [];
    const push = (t) => { if (t && !merged.includes(t)) merged.push(t); };
    // duplicates are dropped: two identical strings would share one check key
    base.forEach((t) => {
      const next = renames[t] ? String(renames[t]).trim() : t;
      /* the where/how map and the tick are keyed by text, and the old build kept
         keying them by the ORIGINAL text while showing the rename — so both have
         to be carried over here or a renamed goal arrives stripped of its detail */
      if (next && next !== t) {
        if (metas[t] && !metas[next]) { metas[next] = metas[t]; delete metas[t]; }
        const oldKey = goalKey(t);
        const newKey = goalKey(next);
        if (oldKey !== newKey && store.get('checks', oldKey, false)) {
          store.set('checks', newKey, true);
          store.set('checks', oldKey, undefined);
        }
      }
      push(next);
    });
    extra.forEach((t) => push(String(t).trim()));
    const had = Object.keys(renames).length > 0 || extra.length > 0;
    if (had) setList('plan-goal-meta', metas);
    return { merged, had };
  }

  const sharedGoals = readSharedGoals();
  const legacy = mergeLegacy(sharedGoals || GOAL_SEED.map((g) => g.t));
  let goals = legacy.merged;

  /* the bare seed stays a display-only fallback — writing it to the shared array
     would tell Home the user had chosen goals they never chose. Only a real edit
     (or a migration) materialises the whole list, seed texts included. */
  if (sharedGoals || legacy.had) writeSharedGoals();
  if (legacy.had) {
    store.set('lists', 'plan-goal-rename', undefined);
    store.set('lists', 'plan-goal-extra', undefined);
  }

  function renameGoal(i, oldText, newText) {
    // the where/how map and the check are both keyed by text, so both move with
    // the rename or the row silently loses them
    if (metas[oldText]) {
      metas[newText] = metas[oldText];
      delete metas[oldText];
      setList('plan-goal-meta', metas);
    }
    const oldKey = goalKey(oldText);
    const newKey = goalKey(newText);
    if (oldKey !== newKey) {
      store.set('checks', newKey, store.get('checks', oldKey, false) || undefined);
      store.set('checks', oldKey, undefined);
    }
    goals[i] = newText;
    writeSharedGoals();
    renderGoals();
  }

  function makeGoal(text, i) {
    const key = goalKey(text);
    const meta = metas[text] || SEED_META[text] || { where: '', how: '' };
    const row = el('article', 'fp-goal');
    row.dataset.goal = text;

    const badge = el('span', 'fp-goal__badge');
    const card = el('div', 'fp-goal__card');
    const line = el('div', 'fp-goal__row');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'fp-check';
    box.checked = store.get('checks', key, false);
    // the row's only text is a button next to it, not a label, so the control
    // would otherwise reach a screen reader unnamed
    box.setAttribute('aria-label', `Mark "${text}" as done`);

    const name = el('button', 'fp-goal__name', text);
    name.type = 'button';

    const rank = el('span', 'fp-goal__rank', String(i + 1));

    line.append(box, name, rank);
    const summary = el('p', 'fp-goal__sum');
    card.append(line, summary);
    row.append(badge, card);

    /* the where / how sub-editor */
    const editor = el('div', 'fp-goal__edit');
    editor.hidden = true;
    const fields = {};
    [['where', 'where?'], ['how', 'how?']].forEach(([k, label]) => {
      const f = el('div', 'fp-goal__field');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = meta[k] || '';
      input.addEventListener('input', () => {
        metas[text] = { where: fields.where.value.trim(), how: fields.how.value.trim() };
        if (!metas[text].where && !metas[text].how) delete metas[text];
        setList('plan-goal-meta', metas);
        paintSummary();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        e.preventDefault();
        editor.hidden = true;
        paintSummary();          // the read-only summary takes the editor's place
      });
      fields[k] = input;
      f.append(el('span', null, label), input);
      editor.append(f);
    });
    card.append(editor);

    function paintSummary() {
      const m = metas[text] || { where: '', how: '' };
      const bits = [m.where, m.how].filter(Boolean);
      summary.textContent = bits.join(' · ');
      summary.hidden = bits.length === 0 || !editor.hidden;
    }

    function paintDone() {
      row.classList.toggle('is-done', box.checked);
      badge.textContent = box.checked ? '✓' : String(i + 1);
    }

    box.addEventListener('change', () => {
      store.set('checks', key, box.checked || undefined);
      paintDone();
    });

    /* single click toggles the sub-editor; a second click inside 380 ms
       (B's window) cancels that and opens the inline rename instead. */
    let timer = 0;
    name.addEventListener('click', () => {
      if (timer) {
        clearTimeout(timer);
        timer = 0;
        startRename();
        return;
      }
      timer = setTimeout(() => {
        timer = 0;
        editor.hidden = !editor.hidden;
        paintSummary();
        if (!editor.hidden) fields.where.focus();
      }, 380);
    });

    function startRename() {
      const input = el('input', 'fp-goal__rename');
      input.type = 'text';
      input.value = name.textContent;
      name.replaceWith(input);
      input.focus();
      input.select();
      /* committing re-renders the list, which detaches this input and fires its
         own blur — so the commit runs once and only once. */
      let settled = false;
      const finish = (commit) => {
        if (settled) return;
        settled = true;
        const next = input.value.trim();
        input.replaceWith(name);
        if (!commit || !next || next === text) return;
        // a duplicate would give two rows one check key; the old name stands
        if (goals.some((other, j) => j !== i && other === next)) return;
        renameGoal(i, text, next);
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
    }

    paintDone();
    paintSummary();
    return row;
  }

  function renderGoals() {
    goalList.textContent = '';
    goals.forEach((t, i) => goalList.append(makeGoal(t, i)));
    refreshBanner();
  }

  const goalInput = $('fpGoalInput');
  $('fpGoalAdd').addEventListener('click', () => {
    goalInput.hidden = !goalInput.hidden;
    if (!goalInput.hidden) goalInput.focus();
  });
  goalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { goalInput.value = ''; goalInput.hidden = true; return; }
    if (e.key !== 'Enter') return;
    const v = goalInput.value.trim();
    if (!v) return;
    // a duplicate would share the existing row's check key, so the typed text is
    // left in the field to be edited rather than added a second time
    if (goals.includes(v)) return;
    goals = [...goals, v];
    writeSharedGoals();
    goalInput.value = '';
    renderGoals();
  });

  renderGoals();

  /* --- 2. calendar (§5.8) ------------------------------------------------- */

  const calGrid = $('fpCalGrid');
  const calTitle = $('fpCalTitle');
  let calOff = 0;

  function renderCal() {
    const now = new Date();
    const view = new Date(now.getFullYear(), now.getMonth() + calOff, 1);
    calTitle.textContent = `${MONTHS[view.getMonth()]} ${view.getFullYear()}`;
    calGrid.textContent = '';
    const lead = view.getDay();
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const prev = new Date(view.getFullYear(), view.getMonth(), 0).getDate();
    const cells = [];
    for (let i = lead - 1; i >= 0; i -= 1) cells.push({ n: prev - i, out: true });
    for (let d = 1; d <= days; d += 1) {
      cells.push({
        n: d,
        today: calOff === 0 && d === now.getDate(),
      });
    }
    while (cells.length % 7) cells.push({ n: cells.length - lead - days + 1, out: true });
    cells.forEach((c) => {
      const cell = el('div', 'fp-cal__day' + (c.out ? ' is-out' : '') + (c.today ? ' is-today' : ''), String(c.n));
      calGrid.append(cell);
    });
  }

  document.querySelectorAll('[data-cal]').forEach((btn) => btn.addEventListener('click', () => {
    calOff += Number(btn.dataset.cal);
    renderCal();
  }));
  renderCal();

  /* --- 3. habits + star jar (§5.8) ---------------------------------------- */

  const habitHost = $('fpHabitList');
  const jar = $('fpJar');
  const jarFront = jar.querySelector('.fp-jar__front');
  const jarLabel = $('fpJarLabel');
  const ticks = getMap('plan-habits');

  $('fpHabitTitle').textContent = `habits — ${MONTHS[new Date().getMonth()].toLowerCase()}`;

  HABIT_SEED.forEach((h) => {
    if (!Array.isArray(ticks[h.k]) || ticks[h.k].length !== h.total) {
      // an untouched habit falls back to its seeded run, so the card looks lived-in
      ticks[h.k] = Array.from({ length: h.total }, (_, i) => (i < h.filled ? 1 : 0));
    }
  });

  function starCount() {
    return HABIT_SEED.reduce((n, h) => n + ticks[h.k].reduce((a, b) => a + (b ? 1 : 0), 0), 0);
  }

  function renderJar() {
    jar.querySelectorAll('.fp-jar__star').forEach((s) => s.remove());
    const n = starCount();
    for (let i = 0; i < Math.min(n, JAR_PILE.length); i += 1) {
      const [x, y, r] = JAR_PILE[i];
      const img = document.createElement('img');
      img.className = 'fp-jar__star';
      img.src = 'assets/b/star.png';
      img.alt = '';
      img.width = 37;
      img.height = 36;
      img.style.left = `${x}px`;
      img.style.top = `${y}px`;
      img.style.transform = `rotate(${r}deg)`;
      jar.insertBefore(img, jarFront);
    }
    jarLabel.textContent = `${n} star${n === 1 ? '' : 's'} in the jar — fill it up`;
    $('fpStarCount').textContent = String(n);
  }

  HABIT_SEED.forEach((h) => {
    const block = el('div', 'fp-habit');
    block.append(el('p', 'fp-habit__name', h.n));
    const dots = el('div', 'fp-habit__dots');
    ticks[h.k].forEach((on, i) => {
      const dot = el('button', 'fp-habit__dot' + (on ? ' is-on' : ''));
      dot.type = 'button';
      dot.title = on ? 'Ticked — click to clear' : 'Tick this day';
      dot.setAttribute('aria-label', `${h.n}, day ${i + 1}`);
      dot.addEventListener('click', () => {
        ticks[h.k][i] = ticks[h.k][i] ? 0 : 1;
        dot.classList.toggle('is-on', !!ticks[h.k][i]);
        dot.title = ticks[h.k][i] ? 'Ticked — click to clear' : 'Tick this day';
        store.set('lists', 'plan-habits', ticks);
        renderJar();
      });
      dots.append(dot);
    });
    block.append(dots);
    habitHost.append(block);
  });
  renderJar();

  /* --- 4. this week (§5.8) ------------------------------------------------ */

  const weekGrid = $('fpWeekGrid');
  const weekTitle = $('fpWeekTitle');
  let weekOff = 0;

  function mondayOf(offset) {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }

  function renderWeek() {
    weekTitle.textContent = weekOff === 0
      ? 'this week — classes auto-filled'
      : `week of ${mondayOf(weekOff).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    weekGrid.textContent = '';
    WEEK_COURSES.forEach(([day, courses]) => {
      const col = el('div');
      col.append(el('p', 'fp-week__day', day));
      courses.forEach((c) => {
        const chip = el('div', 'fp-week__chip', c);
        chip.style.background = COURSE_TINT[c] || 'var(--sunken)';
        col.append(chip);
      });
      weekGrid.append(col);
    });
  }

  document.querySelectorAll('[data-week]').forEach((btn) => btn.addEventListener('click', () => {
    weekOff += Number(btn.dataset.week);
    renderWeek();
  }));
  renderWeek();

  /* --- 5. to do list (§5.8) ----------------------------------------------- */

  $('fpTodoDate').textContent = new Date()
    .toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });

  const todoHost = $('fpTodoList');
  let todo = getList('plan-todo', [
    { t: `finish ${WEEK_COURSES[0][1][0]} pset`, done: false },
    { t: 'send 1 networking msg', done: false },
  ]);

  function renderTodo() {
    todoHost.textContent = '';
    todo.forEach((item, i) => {
      const row = el('label', 'fp-todo__row' + (item.done ? ' is-done' : ''));
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'fp-check';
      box.checked = !!item.done;
      box.addEventListener('change', () => {
        todo[i].done = box.checked;
        store.set('lists', 'plan-todo', todo);
        row.classList.toggle('is-done', box.checked);
      });
      row.append(box, el('span', null, item.t));
      todoHost.append(row);
    });
  }

  wireAdd($('fpTodoAdd'), $('fpTodoInput'), (v) => {
    todo = [...todo, { t: v, done: false }];
    store.set('lists', 'plan-todo', todo);
    renderTodo();
  });
  renderTodo();

  /* --- 6. letter to future self (§5.8) ------------------------------------ */

  const letterHost = $('fpLetter');
  let letter = store.get('lists', 'plan-letter', null);
  if (!letter || typeof letter !== 'object') letter = null;
  let letterMode = null;                    // null | 'editing'
  let letterOpen = false;

  const today = () => new Date().toISOString().slice(0, 10);

  function letterState() {
    if (letterMode === 'editing') return 'editing';
    if (!letter || !letter.text) return 'none';
    return letter.deliver && today() >= letter.deliver ? 'ready' : 'sealed';
  }

  function prettyDate(iso) {
    if (!iso) return 'the day you chose';
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso
      : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function renderLetter() {
    const state = letterState();
    letterHost.textContent = '';

    if (state === 'none' || state === 'sealed') {
      const btn = el('button', 'fp-letter__none');
      btn.type = 'button';
      const img = document.createElement('img');
      img.src = 'assets/b/letter-closed.png';
      img.alt = 'A sealed envelope';
      img.width = 340;
      img.height = 197;
      btn.append(img);
      btn.append(el('p', 'fp-letter__cap', state === 'none'
        ? 'write a letter — the pigeon delivers it near graduation'
        : `sealed — pigeon delivers it on ${prettyDate(letter.deliver)}`));
      // B offers no way back out of the sealed state; this one re-opens the editor.
      btn.addEventListener('click', () => { letterMode = 'editing'; renderLetter(); });
      letterHost.append(btn);
    } else if (state === 'editing') {
      const ta = el('textarea', 'fp-letter__text');
      ta.placeholder = 'Dear future me…';
      ta.value = letter?.text || '';
      const when = el('p', 'fp-letter__when', 'DELIVER ON');
      const date = el('input', 'fp-letter__date');
      date.type = 'date';
      date.value = letter?.deliver || '';
      /* A past date would make letterState() jump straight to 'ready', so the
         floor is set on the control itself — the picker greys out the days that
         would seal a letter into a state it was never meant to start in. The
         seal handler re-checks it, because a typed date ignores `min`. */
      date.min = today();

      /* One line, spoken by the live region rather than swallowed: B's seal
         button just re-focused the textarea and left the reader guessing why
         nothing happened. */
      const err = el('p', 'fp-letter__err');
      err.setAttribute('role', 'status');
      err.setAttribute('aria-live', 'polite');
      err.hidden = true;
      const fail = (msg, field) => {
        err.textContent = msg;
        err.hidden = false;
        field.focus();
      };
      const clearErr = () => {
        if (err.hidden) return;
        err.textContent = '';
        err.hidden = true;
      };
      /* The complaint is about the value as it stood, so any edit retires it. */
      ta.addEventListener('input', clearErr);
      date.addEventListener('input', clearErr);

      const seal = el('button', 'fp-letter__seal', 'Seal it ✉');
      seal.type = 'button';
      seal.addEventListener('click', () => {
        const text = ta.value.trim();
        const deliver = date.value;
        if (!text) { fail('write something first — the pigeon needs words to carry.', ta); return; }
        if (!deliver) { fail('pick a delivery date so the pigeon knows when to fly.', date); return; }
        if (deliver < today()) { fail('that date has already passed — pick a day in the future.', date); return; }
        clearErr();
        letter = { text, deliver };
        store.set('lists', 'plan-letter', letter);
        letterMode = null;
        renderLetter();
      });

      const actions = el('div', 'fp-letter__actions');
      actions.append(seal);
      /* Only when there is something to go back TO: with no saved letter the
         editor is the module's resting state and cancelling would strand it. */
      if (letter && letter.text) {
        const cancel = el('button', 'fp-letter__cancel', 'cancel');
        cancel.type = 'button';
        cancel.setAttribute('aria-label', 'Discard these edits and keep the letter as it was');
        cancel.addEventListener('click', () => { letterMode = null; renderLetter(); });
        actions.append(cancel);
      }

      letterHost.append(ta, when, date, err, actions);
      ta.focus();
    } else {
      const stack = el('div', 'fp-letter__stack' + (letterOpen ? ' is-open' : ''));
      const open = document.createElement('img');
      open.className = 'fp-letter__open';
      open.src = 'assets/b/letter-open.png';
      open.alt = '';
      const closed = document.createElement('img');
      closed.className = 'fp-letter__closed';
      closed.src = 'assets/b/letter-closed.png';
      closed.alt = '';
      const body = el('div', 'fp-letter__body', letter.text);
      stack.append(open, closed, body);
      stack.addEventListener('click', () => {
        letterOpen = !letterOpen;
        stack.classList.toggle('is-open', letterOpen);
        cap.textContent = letterOpen ? 'click to tuck it back in' : 'your letter has arrived — click to open';
      });
      const cap = el('p', 'fp-letter__cap', letterOpen
        ? 'click to tuck it back in'
        : 'your letter has arrived — click to open');
      /* Sits outside the stack, whose own click toggles the envelope open and
         shut: this is the only exit from 'ready', and arriving is not the same
         as being finished with it. */
      const edit = el('button', 'fp-letter__edit', 'rewrite this letter ✎');
      edit.type = 'button';
      edit.setAttribute('aria-label', 'Rewrite this letter and choose a new delivery date');
      edit.addEventListener('click', () => { letterMode = 'editing'; renderLetter(); });
      letterHost.append(stack, cap, edit);
    }

    const label = { none: '· no letter yet ✉', editing: '· writing a letter ✉', sealed: '· letter sealed ✉', ready: '· letter delivered ✉' };
    $('fpLetterState').textContent = label[state];
  }
  renderLetter();

  /* --- 7. long-term goals (§5.8) ------------------------------------------ */

  const longHost = $('fpLongList');
  let long = getList('plan-long', ['UX research', 'work with kids', 'drawing / visual work', 'space industry']);

  function renderLong() {
    longHost.textContent = '';
    long.forEach((t, i) => {
      const chip = el('span', 'fp-chip', t);
      const x = el('button', 'fp-chip__x', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${t}`);
      x.addEventListener('click', () => {
        long = long.filter((_, j) => j !== i);
        store.set('lists', 'plan-long', long);
        renderLong();
      });
      chip.append(x);
      longHost.append(chip);
    });
  }

  wireAdd($('fpLongAdd'), $('fpLongInput'), (v) => {
    long = [...long, v];
    store.set('lists', 'plan-long', long);
    renderLong();
  });
  renderLong();

  /* --- 8. people I met (§5.8) --------------------------------------------- */

  const peopleHost = $('fpPeopleList');
  let people = getList('plan-people', [{ n: 'Sarah', ctx: 'career fair', note: 'follow up Thu' }]);

  function renderPeople() {
    peopleHost.textContent = '';
    people.forEach((p) => {
      const row = el('div', 'fp-person');
      row.append(el('p', 'fp-person__name', p.ctx ? `${p.n} — ${p.ctx}` : p.n));
      if (p.note) {
        const note = el('p', 'fp-person__note', p.note);
        note.append(el('small', null, '(pigeon reminds)'));
        row.append(note);
      }
      peopleHost.append(row);
    });
  }

  wireAdd($('fpPeopleAdd'), $('fpPeopleInput'), (v) => {
    people = [...people, { n: v, ctx: '', note: '' }];
    store.set('lists', 'plan-people', people);
    renderPeople();
  });
  renderPeople();

  /* --- 9. wins log (§5.8) ------------------------------------------------- */

  const winsHost = $('fpWinsList');
  let wins = getList('plan-wins', ['shipped my first website']);

  function renderWins() {
    winsHost.textContent = '';
    wins.forEach((w) => winsHost.append(el('p', 'fp-win', w)));
  }

  wireAdd($('fpWinsAdd'), $('fpWinsInput'), (v) => {
    wins = [...wins, v];
    store.set('lists', 'plan-wins', wins);
    renderWins();
  });
  renderWins();

  /* --- 10. skill in progress (§5.8) --------------------------------------- */

  const skillHost = $('fpSkillList');
  let skills = getList('plan-skills', [{ n: 'Figma', wks: '3 wks', p: 62 }, { n: 'Python', wks: 'new', p: 18 }]);

  function renderSkills() {
    skillHost.textContent = '';
    skills.forEach((s, i) => {
      const row = el('div', 'fp-skill__row');
      row.append(el('span', 'fp-skill__name', s.n));

      const bar = el('button', 'fp-skill__bar');
      bar.type = 'button';
      bar.setAttribute('aria-label', `${s.n} progress, ${s.p}%`);
      const fill = el('span', 'fp-skill__fill');
      fill.style.width = `${s.p}%`;
      bar.append(fill);
      bar.addEventListener('click', (e) => {
        const r = bar.getBoundingClientRect();
        // r.width is already the on-screen width at the current zoom, so the
        // ratio is zoom-independent without any extra maths
        const pct = Math.round(((e.clientX - r.left) / r.width) * 100);
        skills[i].p = Math.max(4, Math.min(100, pct));
        store.set('lists', 'plan-skills', skills);
        renderSkills();
      });

      const x = el('button', 'fp-skill__x', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', `Remove ${s.n}`);
      x.addEventListener('click', () => {
        skills = skills.filter((_, j) => j !== i);
        store.set('lists', 'plan-skills', skills);
        renderSkills();
      });

      row.append(bar, el('span', 'fp-skill__wks', s.wks || ''), x);
      skillHost.append(row);
    });
  }

  wireAdd($('fpSkillAdd'), $('fpSkillInput'), (v) => {
    skills = [...skills, { n: v, wks: 'new', p: 4 }];
    store.set('lists', 'plan-skills', skills);
    renderSkills();
  });
  renderSkills();

  /* --- shared "+ add …" reveal-an-input pattern ---------------------------- */

  function wireAdd(button, input, commit) {
    button.addEventListener('click', () => {
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.value = ''; input.hidden = true; return; }
      if (e.key !== 'Enter') return;
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      commit(v);
    });
  }

  /* --- §5.9 cursor-following tip ------------------------------------------ */

  const tip = el('div', 'fp-tip');
  document.body.append(tip);
  let tipCard = null;

  document.addEventListener('pointermove', (e) => {
    if (document.querySelector('.wb-canvas.is-panning, .wb-canvas.is-dragging')) {
      tip.classList.remove('is-on');
      tipCard = null;
      return;
    }
    const card = e.target instanceof Element ? e.target.closest('[data-fp-card]') : null;
    const id = card?.dataset.fpCard || null;
    if (id !== tipCard) {
      tipCard = id;
      tip.textContent = id ? TIPS[id] || '' : '';
      tip.classList.toggle('is-on', !!id);
    }
    if (!id) return;
    tip.style.left = `${Math.min(window.innerWidth - 270, e.clientX + 18)}px`;
    tip.style.top = `${Math.max(8, e.clientY - 52)}px`;
  });

  /* --- the board becomes a whiteboard ------------------------------------- */

  paintModules();

  window.whiteboard = initWhiteboard({
    canvas: document.getElementById('wbCanvas'),
    stage:  document.getElementById('wbStage'),
    ink:    document.getElementById('wbInk'),
    panels: document.getElementById('wbPanels'),
    board:  document.getElementById('board'),
    zoom:   document.getElementById('wbZoom'),
    picker: document.getElementById('wbPicker'),
    clear:  document.getElementById('wbClear'),
    clearBtn: document.getElementById('wbClearBtn'),
    // [data-tool] so a future sibling button in the rail is never taken for a tool
    tools:  [...document.querySelectorAll('.pl-tools button[data-tool]')],
    key:    'plan',
  });
}

if (document.body.classList.contains('page-plan')) bootPlanBoard();
