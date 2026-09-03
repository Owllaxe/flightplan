#!/usr/bin/env python3
"""Build site/planner-new-app.html from the untouched root bundle.

Reads "Compass Planner.html" (never writes it), pulls the app source out of the
<script type="__bundler/template"> line with json.loads, applies the patches
below, re-encodes exactly the way the bundler does (json.dumps ensure_ascii=False
then "</" -> "<\\u002F") and writes the result to site/planner-new-app.html.
Every patch asserts it matched exactly once, so a drift in the upstream source is
a hard failure rather than a silent no-op.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve()
ROOT = Path(r"C:\Users\linfe\Desktop\careerplanner")
BUNDLE = ROOT / "Compass Planner.html"          # read-only
OUT = ROOT / "site" / "planner-new-app.html"     # our copy
MARKER = '<script type="__bundler/template">'

PATCHES = []


def patch_later(old, new, label):
    """Appended after the packing patches so anchors are matched in order."""
    PATCHES.append((old, new, label))


def patch(old, new, label):
    PATCHES.append((old, new, label))


# ------------------------------------------------------- 0. gutter + pill width ---
# The left meta column (year / semester / term / status / credits, plus an issue
# or blocked button when the term has one) was drawn for a 124px gutter and only
# gets META-30 = 94px of it. Widen the gutter and let the pills give the width
# back: the floor drops from 126 to 112 so PW can actually shrink.
# MH0/MHB are the measured heights of that column — 113px, and 145px when it
# carries a button — and they become the block's minimum height below.
patch(
    "const COLS = 5, META = 124, PADR = 16, CG = 18, PH = 66, RG = 14, "
    "PADT = 18, PADB = 18, GAPB = 58;",
    "const COLS = 5, META = 160, PADR = 16, CG = 18, PH = 66, RG = 14, "
    "PADT = 18, PADB = 18, GAPB = 58, MH0 = 113, MHB = 32;",
    "wider meta gutter",
)

patch(
    "const PW = Math.max(126, Math.floor((cw - META - PADR - (COLS - 1) * CG) / COLS));",
    "const PW = Math.max(112, Math.floor((cw - META - PADR - (COLS - 1) * CG) / COLS));",
    "narrower course pills",
)

# ---------------------------------------------------------------- 1. packing ---
# Courses sit in rows inside their block: one row whenever they fit, and when
# they do not, a brick wall. Long rows hold `top`, the rows between them hold one
# fewer, and every row is centred on the same span — so a course on the lower row
# centres over the gap between two courses above it. `rows` still drives coursesH
# and the block height, so a block that now needs one row instead of two gets
# shorter and the stack closes up behind it.
patch(
    "      const rows = Math.max(...tm.courses.map(c => c.row)) + 1;",
    "      const STEP = PW + CG;\n"
    "      const packed = tm.courses.map((c, k) => ({ c, k })).sort((p, q) => "
    "(p.c.row - q.c.row) || (p.c.col - q.c.col) || (p.k - q.k)).map(o => o.c);\n"
    "      const nC = packed.length;\n"
    "      const cap = (r, p) => Math.ceil(r / 2) * p + Math.floor(r / 2) * (p - 1);\n"
    "      let rows = 1, per = Math.min(COLS, nC);\n"
    "      while (cap(rows, per) < nC) {\n"
    "        rows += 1;\n"
    "        per = Math.max(2, Math.min(COLS, Math.ceil((nC + Math.floor(rows / 2)) / rows)));\n"
    "      }\n"
    "      const slots = Array.from({ length: rows }, (_, r) => r % 2 ? per - 1 : per);\n"
    "      const counts = slots.map(() => 0);\n"
    "      for (let left = nC, r = 0; left > 0; r = (r + 1) % rows) {\n"
    "        if (counts[r] < slots[r]) { counts[r] += 1; left -= 1; }\n"
    "      }",
    "brick rows",
)

# Placement follows those row counts. Each row is a run of adjacent cells on the
# one grid step (PW + CG), centred across the block's full column span; the
# one-fewer row therefore lands exactly half a step over, which is the offset.
patch(
    "      tm.courses.forEach(c => { const cy0 = y + PADT + c.row * (PH + RG); "
    "G[c.c] = { x: px(c.col), y: cy0, cx: px(c.col) + PW / 2, cy: cy0 + PH / 2, "
    "r: px(c.col) + PW, b: cy0 + PH, col: c.col, term: i }; });",
    "      const SPAN = COLS * STEP - CG;\n"
    "      const xEven = px(0) + (SPAN - (per * STEP - CG)) / 2;\n"
    "      let ci = 0;\n"
    "      counts.forEach((m, r) => {\n"
    "        const base = xEven + (r % 2 ? STEP / 2 : 0);\n"
    "        const x0 = base + Math.floor((slots[r] - m) / 2) * STEP;\n"
    "        const cy0 = y + PADT + r * (PH + RG);\n"
    "        for (let j = 0; j < m; j++, ci++) {\n"
    "          const c = packed[ci], cx0 = x0 + j * STEP;\n"
    "          G[c.c] = { x: cx0, y: cy0, cx: cx0 + PW / 2, cy: cy0 + PH / 2, "
    "r: cx0 + PW, b: cy0 + PH, col: j, term: i };\n"
    "        }\n"
    "      });",
    "brick placement",
)

# ------------------------------------------------------------ 3. block height ---
# A block is now the taller of what its course rows need and what the meta column
# needs, so a one-row block no longer clips the text on its left. The rows are
# then centred in whatever height the block ends up with, rather than hugging the
# top and leaving the slack at the bottom.
patch(
    "      const coursesH = rows * PH + (rows - 1) * RG;\n"
    "      const h = PADT + coursesH + warnH + PADB;",
    "      const coursesH = rows * PH + (rows - 1) * RG;\n"
    "      const metaH = MH0 + (iss.length || blk.length ? MHB : 0);\n"
    "      const boxH = Math.max(PADT + coursesH + PADB, PADT + metaH + PADB);\n"
    "      const yOff = (boxH - PADT - PADB - coursesH) / 2;\n"
    "      const h = boxH + warnH;",
    "block height fits the meta column",
)

patch(
    "        const cy0 = y + PADT + r * (PH + RG);\n",
    "        const cy0 = y + PADT + yOff + r * (PH + RG);\n",
    "centre the rows in the block",
)

patch(
    "warnTop: PADT + coursesH + 12 });",
    "warnTop: PADT + yOff + coursesH + 12 });",
    "warning panel follows the rows",
)

# ------------------------------------------------------------------ 2. edges ---
# At rest there is no strand, so not one route is built. `.sort` on the empty
# list keeps the rest of the routing code identical.
patch(
    "    const els = [];\n    this.EDGES.map((e, i) => ({ e, i }))",
    "    const strand = sel ? chainSet : null;\n"
    "    const els = [];\n"
    "    (strand ? this.EDGES.map((e, i) => ({ e, i })) : [])",
    "edges gated on selection",
)

# Only routes wholly inside the selected strand exist — the off-strand ones are
# not drawn faintly, they are never created. This is also what holds the error
# routes back: a broken/anti edge appears only once its course is in the strand.
patch(
    "      const on = !chainSet || (chainSet.has(e.f) && chainSet.has(e.t));\n"
    "      const op = chainSet ? (on ? 1 : 0.05) : 0.14;\n"
    "      const w = chainSet && on ? 2.2 : 1.2;",
    "      if (!(strand.has(e.f) && strand.has(e.t))) return;\n"
    "      const op = 1;\n"
    "      const w = 2.2;",
    "strand-only routes",
)

# No routes, no <svg> either, so the board carries no edge layer at rest.
patch(
    "    const bEdges = React.createElement('svg', { width:STACK_W, height:stackH, "
    "viewBox:`0 0 ${STACK_W} ${stackH}`, style:{ position:'absolute', left:0, top:0, "
    "pointerEvents:'none', zIndex: chainSet ? 2 : 1, overflow:'visible' } }, els);",
    "    const bEdges = els.length ? React.createElement('svg', { width:STACK_W, height:stackH, "
    "viewBox:`0 0 ${STACK_W} ${stackH}`, style:{ position:'absolute', left:0, top:0, "
    "pointerEvents:'none', zIndex:2, overflow:'visible' } }, els) : null;",
    "no edge layer at rest",
)

# ------------------------------------------------------------ 4. screen bridge ---
# The bundle ships five screens behind its own 198px nav rail, and site/planner.html
# hides that rail. The page's Board view / Semester view pills need the same switch
# the rail used — `setState({ screen })` — because the `defaultView` prop only
# decides the *initial* screen: `screen = this.state.screen ?? props.defaultView`,
# so the prop stops being read the moment anything inside the app sets the state
# (the timeline's "See alternatives →", the finder's "Ask an advisor", and the
# term overlay's "Ask about this term" all do). componentDidMount therefore
# publishes a two-function bridge on the iframe's own window; nothing else in the
# app reads it, and the app behaves identically when the host never calls it.
patch(
    "  componentDidMount() { this.measure();",
    "  componentDidMount() { window.__plannerScreenBridge = {"
    " get: () => this.state.screen ?? (this.props.defaultView ?? 'dashboard'),"
    " set: s => this.setState({ screen: s }) }; this.measure();",
    "screen bridge",
)

# And the reverse direction: the app can move itself between screens, so every
# render reports the screen it is about to draw and the host repaints the pills.
# Guarded and wrapped, so a host that never installs the hook — or one whose hook
# throws — changes nothing about the render.
patch(
    "    const screen = this.state.screen ?? (this.props.defaultView ?? 'dashboard');",
    "    const screen = this.state.screen ?? (this.props.defaultView ?? 'dashboard');\n"
    "    try { if (window.__plannerOnScreen) window.__plannerOnScreen(screen); } catch (e) {}",
    "screen reported to the host",
)


# ------------------------------------------------------------ 5. course search ---
# The search bar was a picture of a search bar: the "Search courses..." line was a
# <span>, so there was nothing to type into and the CMD-K badge was decoration.
# The template is parsed with innerHTML before it is turned into React elements,
# so a void <input> is legal here, and a controlled input needs value + onChange
# (React drops keystrokes if value is set without it). on-focus opens the finder
# so tabbing into the bar behaves like clicking it; the click handler on the
# wrapper div still fires from a click on the input, so the panel opens either
# way. The placeholder loses "try 'machine learning'" -- that advertised a phrase
# search the app never had, and the filter below is a plain substring match.
patch(
    '<span style="font-size:13.5px;color:#8F8779;flex:1;min-width:0;white-space:nowrap;'
    'overflow:hidden;text-overflow:ellipsis">Search courses, codes, or requirements '
    "— try “machine learning”</span>",
    '<input id="finder-q" type="text" value="{{ searchQ }}" '
    'sc-camel-on-change="{{ onSearchQ }}" sc-camel-on-focus="{{ openSearch }}" '
    'sc-camel-auto-complete="off" '
    'placeholder="Search courses, codes, or requirements…" '
    'style="font-size:13.5px;color:#1B1916;flex:1;min-width:0;background:transparent;'
    'border:none;outline:none;padding:0">',
    "real search input",
)

# An <input> does not inherit the page font, and ::placeholder cannot be reached
# from the inline style attribute the template dialect uses, so both live in the
# helmet stylesheet next to the existing button reset. #8F8779 is the grey the
# old placeholder <span> was painted in, and opacity:1 stops Firefox fading it.
patch(
    "button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}\n"
    "::selection{background:#F1E3D8}",
    "button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}\n"
    "input{font:inherit;color:inherit}\n"
    "#finder-q::placeholder{color:#8F8779;opacity:1}\n"
    "::selection{background:#F1E3D8}",
    "input font + placeholder colour",
)

# The query lives in state.q, beside the chip filters in state.filt. `qn` is the
# normalised needle -- trimmed, runs of whitespace collapsed, lower-cased -- and
# is '' for an empty box, which every test below reads as "match everything".
# `hay` is the same normalisation over the fields a student would actually type
# at: the code, the title, the area, the tag and the one-line blurb (which is
# where the prerequisites and meeting times are written). `anyF` is only used to
# word the empty state.
patch(
    "    const searchOpen = this.state.search ?? false;\n"
    "    const F = this.state.filt ?? {};",
    "    const searchOpen = this.state.search ?? false;\n"
    "    const F = this.state.filt ?? {};\n"
    "    const q = this.state.q ?? '';\n"
    "    const qn = q.trim().replace(/\\s+/g, ' ').toLowerCase();\n"
    "    const anyF = Object.keys(F).some(k => F[k]);\n"
    "    const hay = x => [x.c, x.n, x.area, x.tag || '', x.m].join(' ')"
    ".replace(/\\s+/g, ' ').toLowerCase();",
    "query state + haystack",
)

# The query joins the chip filters as one more conjunct on the same pool, so the
# two compose: chips narrow the catalog, the query narrows it again. finderCount
# and noResults already read pool.length, so both follow with no further change.
patch(
    "      (!F.avail || (F.avail === 'Eligible now' ? !!x.elig : "
    "F.avail === 'Seats open' ? !!x.open : !x.clash)));",
    "      (!F.avail || (F.avail === 'Eligible now' ? !!x.elig : "
    "F.avail === 'Seats open' ? !!x.open : !x.clash)) &&\n"
    "      (!qn || hay(x).includes(qn)));",
    "query filters the pool",
)

# The category grid is a browse affordance for someone with no query. While one
# is being typed it sits between the filters and the results and pushes the
# matches the student is aiming at below the fold, so it goes away.
patch(
    "      finderBrowse: !F.area,",
    "      finderBrowse: !F.area && !qn,",
    "browse grid hides while typing",
)

# "matches all of those filters" is a lie once a query is in the box -- the thing
# that excluded everything may well be the text. The message names whichever it
# was, and the button clears both, so "Clear them" is still true of what it does.
patch(
    "      noResults: pool.length === 0,\n"
    "      clearFilters: () => this.setState({ filt:{} }),",
    "      noResults: pool.length === 0,\n"
    "      noResultsMsg: qn\n"
    "        ? `Nothing in the catalog matches “${q.trim()}”"
    "${anyF ? ' with those filters' : ''}.`\n"
    "        : 'Nothing in the catalog matches all of those filters.',\n"
    "      clearLabel: qn && !anyF ? 'Clear the search' : 'Clear them',\n"
    "      clearFilters: () => this.setState({ filt:{}, q:'' }),",
    "truthful empty state",
)

patch(
    "Nothing in the catalog matches all of those filters. "
    '<button sc-camel-on-click="{{ clearFilters }}" '
    'style="color:#A2593A;font-weight:500">Clear them</button> to start over.',
    "{{ noResultsMsg }} "
    '<button sc-camel-on-click="{{ clearFilters }}" '
    'style="color:#A2593A;font-weight:500">{{ clearLabel }}</button> to start over.',
    "empty state uses the message",
)

# searchQ / onSearchQ are the pair the input above is bound to, and they sit with
# the other two search callbacks so the whole bar reads in one place.
patch(
    "      openSearch: () => this.setState({ search: true }),\n"
    "      closeSearch: () => this.setState({ search: false }),",
    "      openSearch: () => this.setState({ search: true }),\n"
    "      closeSearch: () => this.setState({ search: false }),\n"
    "      searchQ: q,\n"
    "      onSearchQ: e => this.setState({ q: e.target.value }),",
    "search query values",
)

# The badge finally means something. Cmd/Ctrl-K opens the finder and puts the
# caret in the box; preventDefault holds back the browser's own find bar -- but
# only on the Planner, because that is the only screen with a search bar and
# swallowing the shortcut on the other four would take something and give back
# nothing. The
# focus is deferred to a timeout because the input only exists after the setState
# re-render, and it is wrapped because a host page could unmount the board in
# between. Escape keeps doing what it did, and now also empties the box on the
# way out -- the finder reopening with a stale query and no results looked broken.
patch(
    "  onKey = e => {\n"
    "    if (e.key !== 'Escape') return;\n"
    "    if (this.state.search) this.setState({ search:false });",
    "  onKey = e => {\n"
    "    if ((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === 'k') {\n"
    "      if ((this.state.screen ?? (this.props.defaultView ?? 'dashboard')) "
    "!== 'board') return;\n"
    "      e.preventDefault();\n"
    "      this.setState({ search:true });\n"
    "      setTimeout(() => { try { const el = document.getElementById('finder-q');"
    " if (el) el.focus(); } catch (err) {} }, 0);\n"
    "      return;\n"
    "    }\n"
    "    if (e.key !== 'Escape') return;\n"
    "    if (this.state.search) this.setState({ search:false, q:'' });",
    "cmd-k opens and focuses the search",
)

# Switching school swaps the catalog out from under the finder, and that reset
# already drops every selection keyed to the old one. The query is the same kind
# of stale state, so it goes with them.
patch(
    "pathsOpen:false, pathApplied:null, search:false, rail:false }),",
    "pathsOpen:false, pathApplied:null, search:false, q:'', rail:false }),",
    "school switch clears the query",
)


# ------------------------------------------------------- 6. planner persistence ---
# Nothing in the planner survived a reload: the selected course, the applied
# catch-up path and every view toggle came back at their defaults. The catch-up
# panel says "Nothing is saved until you apply", which only reads as a promise if
# applying actually saves something, so the applied path in particular has to
# outlive the tab.
#
# The store is our own key, `flightplan-planner`, and NOT the site's shared
# `stellic-pathfinders` blob: that one is owned by js/store.js and the host page
# rewrites it whole on every view toggle, so a last-write-wins write from inside
# the iframe would clobber whatever the host had just put there.
#
# readSaved is the whole restore, and it is deliberately paranoid: the blob is a
# string a user can hand-edit, so it is parsed inside try/catch (private mode,
# quota, corrupt JSON all land here) and every key is both whitelisted and
# type-checked on the way in. A value that fails its check is dropped rather than
# restored, so a bad `tl` cannot leave the semester view rendering nothing.
# `sel: null` is a legal restored value and means "the student had explicitly
# deselected", which is why the check is `=== null ||` rather than a truthiness
# test. The path ids are spelled out because PATHS is a class field declared far
# below `state`, so it does not exist yet when this runs — if a fourth path is
# ever added, this list is what has to grow with it.
#
# saveNow is the mirror image, over the same six keys. `screen` is not among them
# on purpose: the host already stores the Board/Semester choice under
# fields.plannerScreen and drives it back in through __plannerScreenBridge, and a
# second copy in here would fight it. Nor are the transient ones — search, q,
# filt, fsel, expand, pathsOpen, pathPrev, focus — or cw/rw/sw/oh, which are
# measurements, not decisions. A key sitting at `undefined` is left out of the
# blob entirely, which is what keeps a first visit clean (see below).
# The stringify is compared against the last string written, held on the
# instance, because componentDidUpdate fires on every measure() pass; only a real
# change reaches localStorage. _saved is assigned *after* setItem so a throwing
# quota does not leave us believing the write landed.
patch(
    "  componentDidMount() { window.__plannerScreenBridge = {",
    "  readSaved() {\n"
    "    const V = {\n"
    "      sel: v => v === null || (typeof v === 'string' && v.length > 0),\n"
    "      pathApplied: v => v === null || v === 'A' || v === 'B' || v === 'C',\n"
    "      tl: v => v === 'grid' || v === 'river' || v === 'gantt',\n"
    "      map: v => v === 'graph' || v === 'list',\n"
    "      rail: v => typeof v === 'boolean',\n"
    "      wide: v => typeof v === 'boolean'\n"
    "    };\n"
    "    const out = {};\n"
    "    try {\n"
    "      const raw = JSON.parse(window.localStorage.getItem('flightplan-planner') || '{}');\n"
    "      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {\n"
    "        Object.keys(V).forEach(k => {\n"
    "          if (Object.prototype.hasOwnProperty.call(raw, k) && V[k](raw[k])) out[k] = raw[k];\n"
    "        });\n"
    "      }\n"
    "    } catch (e) {}\n"
    "    this._restored = out;\n"
    "    return out;\n"
    "  }\n"
    "\n"
    "  saveNow() {\n"
    "    try {\n"
    "      const out = {};\n"
    "      ['sel', 'pathApplied', 'tl', 'map', 'rail', 'wide'].forEach(k => {\n"
    "        if (this.state[k] !== undefined) out[k] = this.state[k];\n"
    "      });\n"
    "      const str = JSON.stringify(out);\n"
    "      if (str === this._saved) return;\n"
    "      window.localStorage.setItem('flightplan-planner', str);\n"
    "      this._saved = str;\n"
    "    } catch (e) {}\n"
    "  }\n"
    "\n"
    "  componentDidMount() { window.__plannerScreenBridge = {",
    "planner persistence read + write",
)

# The restore has to happen here, in the class-field initialiser, so the first
# paint is already the board the student left — anything later would flash the
# default board first. The spread order matters twice over: the defaults are the
# floor, and a key that was not found in storage is simply absent from the
# spread, so it keeps its default. That is what protects `sel`, which is read
# below as `this.state.sel === undefined ? <the panelState prop decides> : ...` —
# seeding it unconditionally would neutralise the host's panelState:'overview'.
patch(
    "  state = { school: 'nyu-cs', screen: null, tl: null, map: null, focus: null };",
    "  state = { school: 'nyu-cs', screen: null, tl: null, map: null, focus: null, "
    "...this.readSaved() };",
    "restore before the first paint",
)

# site/planner.html keeps the planner hidden until the app has booted *with
# nothing selected* — `applied && booted && selectedCount(doc) === 0` — and
# otherwise waits out a five-second failsafe. A restored course selection is
# exactly the case that never satisfies it, so the app says so once, on mount,
# and the host widens its condition to `(selectedCount(doc) === 0 ||
# win.__plannerRestoredSel)`. Only a genuinely restored non-null `sel` sets it;
# a selection the student makes later never does, because mount runs once. Like
# the __plannerScreenBridge patch above it is guarded and nothing in the app
# reads it back, so the app behaves identically if no host ever looks.
patch(
    "  componentDidMount() { window.__plannerScreenBridge = {",
    "  componentDidMount() { try { if (this._restored && this._restored.sel != null) "
    "window.__plannerRestoredSel = true; } catch (e) {} window.__plannerScreenBridge = {",
    "restored selection announced to the host",
)

# Every state change lands here, because measure() setStates on layout too. The
# guard against a redundant write lives inside saveNow, so this stays one call.
patch(
    "  componentDidUpdate() { this.measure(); }",
    "  componentDidUpdate() { this.measure(); this.saveNow(); }",
    "save on change",
)


# ------------------------------------------------------------ 7. dead controls ---
# Four buttons on the board were pictures of buttons: nothing was bound to them
# by id, class, data-* or a delegated listener. Three of them name an edit to the
# plan and are wired below; the two at the foot of the course detail panel are
# removed, because the product has no syllabus documents and no historical
# section records, and the only way to make those two do something would be to
# invent academic records. A control that is gone is honest; one that lies is not.
patch(
    "</sc-for>\n"
    "</div>\n"
    '<div style="display:flex;gap:8px">\n'
    '<button style="flex:1;border:1px solid #E4DED0;border-radius:7px;padding:10px;'
    'font-size:12.5px;color:#5C554A">Full syllabus</button>\n'
    '<button style="flex:1;border:1px solid #E4DED0;border-radius:7px;padding:10px;'
    'font-size:12.5px;color:#5C554A">Past sections</button>\n'
    "</div>",
    "</sc-for>\n"
    "</div>",
    "syllabus + past sections removed",
)

# That row was the last thing in the panel, so the 18px the meetings table was
# holding underneath itself is now trailing dead space against the panel's own
# 20px of bottom padding. The table is the last block, so it carries none.
patch(
    '<div style="border:1px solid #EFEADD;border-radius:8px;overflow:hidden;'
    'margin-bottom:18px">',
    '<div style="border:1px solid #EFEADD;border-radius:8px;overflow:hidden">',
    "meetings table closes the panel",
)

# The three remaining dead buttons all mean "change the plan", so they share one
# mechanism: a thin overlay of user edits layered on whatever buildPlan returned.
# `state.ins` holds inserted terms (each remembering the key of the term it
# follows), `state.adds` holds courses the student added to a term, and neither
# touches BASE_BOARD or the path builders -- so applying, previewing and
# reverting a catch-up path all keep working exactly as before, with the
# student's own edits re-layered on top of each result.
#
# Two guards earn their place. An insert whose `after` term is not on the current
# board is skipped rather than dropped from state: path C has no SUM26, and the
# insert has to come back when the path does. And an add whose code is already on
# the board is skipped, because the geometry pass keys course positions by code
# (`G[c.c]`) -- two courses sharing a code would render as two pills stacked in
# one place.
#
# The memo key is the part that has to be right. plan() cached on activeKey()
# alone, which does not change when a term is inserted, so the board would have
# gone on drawing the pre-edit plan forever. The key now carries a signature of
# both edit lists.
patch(
    "  plan() { const k = this.activeKey(); if (this._pk !== k || !this._plan) "
    "{ this._pk = k; this._plan = this.buildPlan(k); } return this._plan; }",
    "  applyEdits(plan) {\n"
    "    const ins = Array.isArray(this.state.ins) ? this.state.ins : [];\n"
    "    const adds = Array.isArray(this.state.adds) ? this.state.adds : [];\n"
    "    if (!ins.length && !adds.length) return plan;\n"
    "    const board = plan.board.map(t => ({ ...t, courses: t.courses.map(c => ({ ...c })), "
    "issues: (t.issues || []).map(i => ({ ...i })) }));\n"
    "    ins.forEach(t => {\n"
    "      const at = board.findIndex(b => b.k === t.after);\n"
    "      if (at < 0 || board.some(b => b.k === t.k)) return;\n"
    "      board.splice(at + 1, 0, { ...t, courses: [], issues: [] });\n"
    "    });\n"
    "    const seen = new Set(board.reduce((a, t) => a.concat(t.courses.map(c => c.c)), []));\n"
    "    adds.forEach(a => {\n"
    "      const t = board.find(b => b.k === a.k);\n"
    "      if (!t || seen.has(a.c)) return;\n"
    "      seen.add(a.c);\n"
    "      t.courses.push({ c:a.c, n:a.n, cr:a.cr, col:99, row:99 });\n"
    "    });\n"
    "    return { board, edges: plan.edges };\n"
    "  }\n"
    "\n"
    "  plan() {\n"
    "    const k = this.activeKey();\n"
    "    const memo = k + '|' + JSON.stringify(this.state.ins || null) + '|' + "
    "JSON.stringify(this.state.adds || null);\n"
    "    if (this._pk !== memo || !this._plan) { this._pk = memo; "
    "this._plan = this.applyEdits(this.buildPlan(k)); }\n"
    "    return this._plan;\n"
    "  }",
    "board edit overlay + memo key",
)

# The helpers the three controls share. nextTerm reads the term it is inserting
# after and names the one that would come next -- Spring 2027 -> Summer 2027,
# Fall 2027 -> Winter 2028 -- and walks on if that name is already on the board,
# which is what stops "+ INSERT FALL 2026" appearing beside Fall 2026 once path A
# has put a summer term in front of it. The tag follows buildPlan's own idiom
# ('ADDED BY PATH A'), so an inserted block says where it came from in the same
# place, in the same words.
patch(
    "    const rail = this.state.rail ?? false;\n",
    "    const rail = this.state.rail ?? false;\n"
    "    const insList = Array.isArray(this.state.ins) ? this.state.ins : [];\n"
    "    const addList = Array.isArray(this.state.adds) ? this.state.adds : [];\n"
    "    const isIns = t => !!t && insList.some(x => x.k === t.k);\n"
    "    const termNames = new Set(this.BOARD.map(t => t.term));\n"
    "    const SEAS = { Spring:['Summer', 0], Fall:['Winter', 1], Summer:['Fall', 0], "
    "Winter:['Spring', 0] };\n"
    "    const nextTerm = term => {\n"
    "      const m = /^([A-Za-z]+) (\\d{4})$/.exec(term || '');\n"
    "      if (!m || !SEAS[m[1]]) return { sem:'Extra', term:'an extra term' };\n"
    "      let s = m[1], y = +m[2];\n"
    "      for (let n = 0; n < 4; n++) {\n"
    "        const step = SEAS[s]; if (!step) break;\n"
    "        s = step[0]; y += step[1];\n"
    "        if (!termNames.has(s + ' ' + y)) break;\n"
    "      }\n"
    "      return { sem:s, term: s + ' ' + y };\n"
    "    };\n"
    "    const addIns = b => { const n = nextTerm(b.term); this.setState({ ins: [...insList,\n"
    "      { after:b.k, k:'INS-' + b.k, yr:b.yr, sem:n.sem, term:n.term, "
    "l:n.sem + ' · ' + n.term,\n"
    "        tag:'ADDED BY YOU', st:'plan', courses:[], issues:[] }] }); };\n"
    "    const dropIns = k => this.setState({ ins: insList.filter(x => x.k !== k) });\n",
    "insert helpers",
)

# Gap i sits between BOARD[i] and BOARD[i+1], so a pill can see both sides of
# itself. If either side is a term the student inserted, the pill is that term's
# undo; otherwise it inserts. That two-sided test is also the reason two inserts
# can never stack in one gap -- the moment one lands, both pills touching it turn
# into its remove. The add-a-term row under the last block is the same action
# with the same two states, so its label and handler are built here beside them.
patch(
    "      bInserts: gaps.map((g, i) => ({\n"
    "        style:`position:absolute;left:${META}px;top:${g.mid - 11}px;"
    "width:${STACK_W - META - PADR}px;height:22px;display:flex;align-items:center;"
    "justify-content:center;z-index:4;pointer-events:none`,\n"
    "        btnStyle:'pointer-events:auto;white-space:nowrap;display:flex;align-items:center;"
    "gap:6px;background:#FDFBF6;border:1px solid #E4DED0;border-radius:11px;padding:3px 11px;"
    "font-family:\\'JetBrains Mono\\',monospace;font-size:9.5px;letter-spacing:0.08em;"
    "color:#8F8779',\n"
    "        label:'+ INSERT TERM'\n"
    "      })),",
    "      bInserts: gaps.map((g, i) => {\n"
    "        const rm = isIns(blocks[i]) ? blocks[i] : isIns(blocks[i + 1]) ? blocks[i + 1] : null;\n"
    "        return {\n"
    "        style:`position:absolute;left:${META}px;top:${g.mid - 11}px;"
    "width:${STACK_W - META - PADR}px;height:22px;display:flex;align-items:center;"
    "justify-content:center;z-index:4;pointer-events:none`,\n"
    "        btnStyle:`pointer-events:auto;white-space:nowrap;display:flex;align-items:center;"
    "gap:6px;background:#FDFBF6;border:1px solid ${rm ? '#D99B84' : '#E4DED0'};"
    "border-radius:11px;padding:3px 11px;"
    "font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.08em;"
    "color:${rm ? '#8C3A1E' : '#8F8779'}`,\n"
    "        label: rm ? `− REMOVE ${rm.term.toUpperCase()}` : "
    "`+ INSERT ${nextTerm(blocks[i].term).term.toUpperCase()}`,\n"
    "        click: rm ? (() => dropIns(rm.k)) : (() => addIns(blocks[i]))\n"
    "        }; }),\n"
    "      addRowLabel: isIns(blocks[blocks.length - 1])\n"
    "        ? `− Remove ${blocks[blocks.length - 1].term} from the plan`\n"
    "        : `+ Add ${nextTerm(blocks[blocks.length - 1].term).term} after "
    "${blocks[blocks.length - 1].term} — a summer session, study abroad, "
    "or a fifth year`,\n"
    "      addRow: () => { const b = blocks[blocks.length - 1]; "
    "if (isIns(b)) dropIns(b.k); else addIns(b); },",
    "insert pills + add-a-term row wired",
)

patch(
    '<div style="{{ g.style }}"><button style="{{ g.btnStyle }}">'
    "{{ g.label }}</button></div>",
    '<div style="{{ g.style }}"><button sc-camel-on-click="{{ g.click }}" '
    'style="{{ g.btnStyle }}">{{ g.label }}</button></div>',
    "insert pill takes the handler",
)

# The row after the last block named META.gradTerm, which stops being true the
# moment a term is added after graduation. The label is a value now, so it says
# what the click will actually do in both states.
patch(
    '<button style="{{ addRowStyle }}">+ Add a term after {{ META.gradTerm }} '
    "(summer, study abroad, or a fifth year)</button>",
    '<button sc-camel-on-click="{{ addRow }}" style="{{ addRowStyle }}">'
    "{{ addRowLabel }}</button>",
    "add-a-term row takes the handler",
)

# "+ Add to a term" has three honest readings, and which one it carries depends
# on where the course already is. All three suggestions ship inside the default
# plan -- MATH 152 and CS 245 in Fall 2026, STAT 250 in Spring 2027 -- so on a
# fresh board the truthful action is not "add" but "show me where it is", which
# selects it and draws its chain. A suggestion the student added reads as its own
# undo. Only a course genuinely off the board gets the add, and it goes to the
# first draft term; path C is where that happens today, because it pulls STAT 250
# out of the plan and the card turns into "+ Add to Fall 2026". The name and
# credit count come from CATALOG rather than from the card, whose `n` is a
# headline ("Calculus II - summer session"), not a course title.
patch(
    "why:'Only needs CS 120, which you have. A safe way to keep making major "
    "progress while the math sequence catches up.', tag:'READY NOW' }\n"
    "    ];",
    "why:'Only needs CS 120, which you have. A safe way to keep making major "
    "progress while the math sequence catches up.', tag:'READY NOW' }\n"
    "    ].map(s => {\n"
    "      const cat = this.CATALOG.find(x => x.c === s.c) || null;\n"
    "      const host = this.BOARD.find(t => t.courses.some(c => c.c === s.c)) || null;\n"
    "      const mine = addList.some(a => a.c === s.c);\n"
    "      const target = this.BOARD.find(t => t.st === 'plan') || null;\n"
    "      if (host && mine) return { ...s, addLabel:`− Remove from ${host.term}`,\n"
    "        addAct: () => this.setState({ adds: addList.filter(a => a.c !== s.c) }) };\n"
    "      if (host) return { ...s, addLabel:`Show it in ${host.term} →`,\n"
    "        addAct: () => this.setState({ sel:s.c, rail:false, expand:null }) };\n"
    "      if (target) return { ...s, addLabel:`+ Add to ${target.term}`,\n"
    "        addAct: () => this.setState({ adds: [...addList, { k:target.k, c:s.c,\n"
    "          n: cat ? cat.n : (s.n || s.c), cr: cat ? cat.cr : 3 }] }) };\n"
    "      return { ...s, addLabel:'+ Find it in the catalog',\n"
    "        addAct: () => this.setState({ search:true, q:s.c }) };\n"
    "    });",
    "suggested cards know where the course is",
)

patch(
    '<button style="font-size:11.5px;font-weight:500;color:#A2593A">'
    "+ Add to a term</button>",
    '<button sc-camel-on-click="{{ s.addAct }}" '
    'style="font-size:11.5px;font-weight:500;color:#A2593A">{{ s.addLabel }}</button>',
    "suggested card button takes the handler",
)

# An inserted term that disappeared on reload would put the dead-button defect
# straight back, so both halves of the persistence patch grow by the two keys.
# The whitelist only asserts "is an array" here; the per-entry check is below,
# because one hand-edited entry should cost that entry, not the whole insert.
patch(
    "      rail: v => typeof v === 'boolean',\n"
    "      wide: v => typeof v === 'boolean'\n"
    "    };",
    "      rail: v => typeof v === 'boolean',\n"
    "      wide: v => typeof v === 'boolean',\n"
    "      ins: v => Array.isArray(v),\n"
    "      adds: v => Array.isArray(v)\n"
    "    };",
    "ins + adds are restorable",
)

# Every field applyEdits and the meta column read is required to be a non-empty
# string, `st` is pinned to 'plan' so a hand-edited blob cannot forge a completed
# term, and `cr` has to be a finite non-negative number because it is summed into
# the block's credit total and scaled into the est.-weekly-work figure. Anything
# that fails is dropped one entry at a time.
patch(
    "    this._restored = out;\n",
    "    const OBJ = x => !!x && typeof x === 'object' && !Array.isArray(x);\n"
    "    const STR = (x, f) => typeof x[f] === 'string' && x[f].length > 0;\n"
    "    if (out.ins) out.ins = out.ins.filter(x => OBJ(x) && "
    "['after', 'k', 'yr', 'sem', 'term', 'l', 'tag'].every(f => STR(x, f)) && x.st === 'plan');\n"
    "    if (out.adds) out.adds = out.adds.filter(x => OBJ(x) && "
    "['k', 'c', 'n'].every(f => STR(x, f)) && typeof x.cr === 'number' && "
    "isFinite(x.cr) && x.cr >= 0);\n"
    "    this._restored = out;\n",
    "per-entry validation on the way in",
)

patch(
    "      ['sel', 'pathApplied', 'tl', 'map', 'rail', 'wide'].forEach(k => {",
    "      ['sel', 'pathApplied', 'tl', 'map', 'rail', 'wide', 'ins', 'adds'].forEach(k => {",
    "ins + adds are saved",
)


# --------------------------------------------------- 39. the plan itself ---
# The board was the only screen still describing a different student: eight
# terms from Fall 2024 to Spring 2028, 11 credits in progress, and a roster that
# shared not one course with the five Home lists as in progress. Home, Profile,
# Career, Visa and Resume all agree on a spring-intake sophomore with 42 of 120
# credits banked, 18 in progress this Fall 2026, and a May 2029 graduation, so
# the board moves to them rather than the other way round: nine terms, Spring
# 2025 through Spring 2029, 42 + 18 + 60 = 120.
# The flagship break moves with it. MATH 152 and CS 210 are both on Home's
# in-progress list, and Fall 2026 is the term actually running, so the
# prerequisite that "sits in the same term" is no longer a hypothetical in a
# draft — it is a live registration mistake, and the only lever left is
# add/drop. That flips which course can move: you cannot re-schedule a course
# you are halfway through, but you can drop one, so CS 210 is what travels.
# `col`/`row` are only a sort order after the brick-placement patch above, so
# every course simply gets its reading position.
patch(
    """\
  BASE_BOARD = [
    { k:'F24', yr:'YEAR 1', sem:'Semester 1', term:'Fall 2024', l:'Semester 1 · Fall 2024', tag:'COMPLETE', st:'done',
      courses:[{c:'CS 110',n:'Intro to Programming',cr:4,col:0,row:0},{c:'MATH 151',n:'Calculus I',cr:4,col:2,row:0},{c:'ENGL 101',n:'Writing & Rhetoric',cr:3,col:4,row:0},{c:'HIST 120',n:'World History',cr:3,col:1,row:1}] },
    { k:'S25', yr:'YEAR 1', sem:'Semester 2', term:'Spring 2025', l:'Semester 2 · Spring 2025', tag:'COMPLETE', st:'done',
      courses:[{c:'CS 120',n:'Object-Oriented Design',cr:4,col:0,row:0},{c:'PHYS 141',n:'Mechanics',cr:4,col:2,row:0},{c:'COMM 110',n:'Public Speaking',cr:3,col:3,row:0},{c:'ART 105',n:'Visual Culture',cr:3,col:1,row:1}] },
    { k:'F25', yr:'YEAR 2', sem:'Semester 3', term:'Fall 2025', l:'Semester 3 · Fall 2025', tag:'COMPLETE', st:'done',
      courses:[{c:'CS 230',n:'Computer Systems',cr:4,col:0,row:0},{c:'PHIL 210',n:'Ethics & Technology',cr:3,col:2,row:0},{c:'ECON 101',n:'Microeconomics',cr:3,col:4,row:0},{c:'SPAN 101',n:'Elementary Spanish',cr:3,col:1,row:1}] },
    { k:'S26', yr:'YEAR 2', sem:'Semester 4', term:'Spring 2026', l:'Semester 4 · Spring 2026', tag:'IN PROGRESS', st:'current',
      courses:[{c:'CS 235',n:'Intro to Data Science',cr:3,col:0,row:0},{c:'STAT 210',n:'Introductory Statistics',cr:3,col:1,row:0,flag:'anti'},{c:'PSYC 101',n:'General Psychology',cr:3,col:3,row:0},{c:'MUS 120',n:'Music Theory',cr:2,col:4,row:1}],
      issues:[{k:'anti',t:'STAT 210 is an anti-requisite of STAT 250',d:'The catalog awards credit for only one of the two, and STAT 250 is the one CS 360 requires. Keeping both means STAT 210 counts as a free elective, not toward the major.',fix:'Swap to STAT 250 next term'}] },
    { k:'F26', yr:'YEAR 3', sem:'Semester 5', term:'Fall 2026', l:'Semester 5 · Fall 2026', tag:'DRAFT', st:'plan',
      courses:[{c:'MATH 152',n:'Calculus II',cr:4,col:0,row:0,flag:'key'},{c:'CS 210',n:'Data Structures & Algorithms',cr:4,col:2,row:0,flag:'error'},{c:'CS 245',n:'Human–Computer Interaction',cr:3,col:4,row:0},{c:'WRIT 200',n:'Technical Writing',cr:3,col:1,row:1},{c:'SOC 101',n:'Sociology',cr:3,col:3,row:1}],
      issues:[{k:'prereq',course:'CS 210',t:'Its prerequisite sits in the same term',d:'MATH 152 has to be finished before this term begins, so registration will block CS 210. Two clean fixes, both keeping the Spring 2028 graduation date.',fix:'Move CS 210 to Spring 2027',fixes:['Move CS 210 → Spring 2027','Move MATH 152 → Summer 2026 (six weeks, online)']}] },
    { k:'S27', yr:'YEAR 3', sem:'Semester 6', term:'Spring 2027', l:'Semester 6 · Spring 2027', tag:'DRAFT', st:'plan',
      courses:[{c:'MATH 240',n:'Discrete Mathematics',cr:3,col:0,row:0},{c:'MATH 260',n:'Linear Algebra',cr:3,col:1,row:0},{c:'STAT 250',n:'Probability & Statistics',cr:3,col:3,row:0},{c:'CS 320',n:'Databases',cr:3,col:4,row:1,flag:'clash'},{c:'LING 200',n:'Language & Mind',cr:3,col:2,row:1,flag:'clash'}],
      issues:[{k:'clash',t:'CS 320 and LING 200 meet at the same hour',d:'Both sections run Tuesday and Thursday, 2:00–3:15 pm. LING 200 also has a Wednesday evening section with seats open.',fix:'Switch LING 200 to the Wed section'}] },
    { k:'F27', yr:'YEAR 4', sem:'Semester 7', term:'Fall 2027', l:'Semester 7 · Fall 2027', tag:'DRAFT', st:'plan',
      courses:[{c:'CS 310',n:'Algorithms',cr:4,col:0,row:0},{c:'CS 330',n:'Operating Systems',cr:4,col:2,row:0},{c:'CS 340',n:'Software Engineering',cr:3,col:3,row:0},{c:'BIOL 105',n:'Human Biology & Lab',cr:4,col:4,row:1},{c:'CS 425',n:'Distributed Systems',cr:3,col:1,row:1,flag:'load'}],
      issues:[{k:'load',t:'18 credits, four of them 300-level CS',d:'Three credits over the recommended maximum, and the heaviest term in the plan. Moving CS 425 to spring keeps the same graduation date.',fix:'Move CS 425 to Spring 2028'}] },
    { k:'S28', yr:'YEAR 4', sem:'Semester 8', term:'Spring 2028', l:'Semester 8 · Spring 2028', tag:'DRAFT', st:'plan',
      courses:[{c:'CS 360',n:'Machine Learning',cr:3,col:0,row:0},{c:'CS 380',n:'Deep Learning Lab',cr:3,col:2,row:0},{c:'CS 450',n:'Senior Capstone',cr:4,col:3,row:0},{c:'ASTR 110',n:'Astronomy & Lab',cr:4,col:1,row:1}] }
  ];
""",
    """\
  BASE_BOARD = [
    { k:'S25', yr:'YEAR 1', sem:'Semester 1', term:'Spring 2025', l:'Semester 1 · Spring 2025', tag:'COMPLETE', st:'done',
      courses:[{c:'CS 110',n:'Intro to Programming',cr:4,col:0,row:0},{c:'MATH 151',n:'Calculus I',cr:4,col:1,row:0},{c:'ENGL 101',n:'Writing & Rhetoric',cr:3,col:2,row:0},{c:'HIST 120',n:'World History',cr:3,col:3,row:0}] },
    { k:'F25', yr:'YEAR 1', sem:'Semester 2', term:'Fall 2025', l:'Semester 2 · Fall 2025', tag:'COMPLETE', st:'done',
      courses:[{c:'CS 120',n:'Object-Oriented Design',cr:4,col:0,row:0},{c:'CS 230',n:'Computer Systems',cr:4,col:1,row:0},{c:'COMM 110',n:'Public Speaking',cr:3,col:2,row:0},{c:'ART 105',n:'Visual Culture',cr:3,col:3,row:0}] },
    { k:'S26', yr:'YEAR 2', sem:'Semester 3', term:'Spring 2026', l:'Semester 3 · Spring 2026', tag:'COMPLETE', st:'done',
      courses:[{c:'CS 235',n:'Intro to Data Science',cr:4,col:0,row:0},{c:'PHIL 210',n:'Ethics & Technology',cr:3,col:1,row:0},{c:'ECON 101',n:'Microeconomics',cr:3,col:2,row:0},{c:'SPAN 101',n:'Elementary Spanish',cr:4,col:3,row:0}] },
    { k:'F26', yr:'YEAR 2', sem:'Semester 4', term:'Fall 2026', l:'Semester 4 · Fall 2026', tag:'IN PROGRESS', st:'current',
      courses:[{c:'CS 210',n:'Data Structures & Algorithms',cr:4,col:0,row:0,flag:'error'},{c:'MATH 152',n:'Calculus II',cr:4,col:1,row:0,flag:'key'},{c:'PHYS 141',n:'Mechanics',cr:4,col:2,row:0},{c:'ENGL 220',n:'Writing',cr:3,col:3,row:0},{c:'PSY 10',n:'Intro to Psych',cr:3,col:4,row:0}],
      issues:[{k:'prereq',course:'CS 210',t:'Its prerequisite is running alongside it, not before it',d:'Registration let both through, but nothing on your transcript satisfies CS 210 — MATH 152 is still in progress, in this same term. Add/drop is the last point where fixing it costs nothing, and both fixes keep the Spring 2029 graduation date.',fix:'Move CS 210 to Spring 2027',fixes:['Move CS 210 → Spring 2027','Move CS 210 → Summer 2027 (six weeks, online)']}] },
    { k:'S27', yr:'YEAR 3', sem:'Semester 5', term:'Spring 2027', l:'Semester 5 · Spring 2027', tag:'DRAFT', st:'plan',
      courses:[{c:'MATH 240',n:'Discrete Mathematics',cr:3,col:0,row:0},{c:'MATH 260',n:'Linear Algebra',cr:3,col:1,row:0},{c:'STAT 210',n:'Introductory Statistics',cr:3,col:2,row:0,flag:'anti'},{c:'WRIT 200',n:'Technical Writing',cr:3,col:3,row:0}],
      issues:[{k:'anti',t:'STAT 210 is an anti-requisite of STAT 250',d:'The catalog awards credit for only one of the two, and STAT 250 is the one CS 360 requires. Keeping both means STAT 210 counts as a free elective, not toward the major.',fix:'Swap to STAT 250 next term'}] },
    { k:'F27', yr:'YEAR 3', sem:'Semester 6', term:'Fall 2027', l:'Semester 6 · Fall 2027', tag:'DRAFT', st:'plan',
      courses:[{c:'CS 310',n:'Algorithms',cr:4,col:0,row:0},{c:'STAT 250',n:'Probability & Statistics',cr:3,col:1,row:0},{c:'CS 320',n:'Databases',cr:3,col:2,row:0,flag:'clash'},{c:'LING 200',n:'Language & Mind',cr:3,col:3,row:0,flag:'clash'}],
      issues:[{k:'clash',t:'CS 320 and LING 200 meet at the same hour',d:'Both sections run Tuesday and Thursday, 2:00–3:15 pm. LING 200 also has a Wednesday evening section with seats open.',fix:'Switch LING 200 to the Wed section'}] },
    { k:'S28', yr:'YEAR 4', sem:'Semester 7', term:'Spring 2028', l:'Semester 7 · Spring 2028', tag:'DRAFT', st:'plan',
      courses:[{c:'CS 330',n:'Operating Systems',cr:4,col:0,row:0},{c:'CS 340',n:'Software Engineering',cr:4,col:1,row:0},{c:'CS 245',n:'Human–Computer Interaction',cr:3,col:2,row:0},{c:'BIOL 105',n:'Human Biology & Lab',cr:4,col:3,row:0},{c:'CS 425',n:'Distributed Systems',cr:3,col:4,row:0,flag:'load'}],
      issues:[{k:'load',t:'18 credits, with three 300-level CS courses',d:'Three credits over the recommended maximum, and the heaviest term in the plan. Moving CS 425 to the final spring keeps the same graduation date.',fix:'Move CS 425 to Spring 2029'}] },
    { k:'F28', yr:'YEAR 4', sem:'Semester 8', term:'Fall 2028', l:'Semester 8 · Fall 2028', tag:'DRAFT', st:'plan',
      courses:[{c:'CS 360',n:'Machine Learning',cr:3,col:0,row:0},{c:'SOC 101',n:'Sociology',cr:3,col:1,row:0},{c:'ASTR 110',n:'Astronomy & Lab',cr:4,col:2,row:0}] },
    { k:'S29', yr:'YEAR 4', sem:'Semester 9', term:'Spring 2029', l:'Semester 9 · Spring 2029', tag:'DRAFT', st:'plan',
      courses:[{c:'CS 450',n:'Senior Capstone',cr:4,col:0,row:0},{c:'CS 380',n:'Deep Learning Lab',cr:3,col:1,row:0}] }
  ];
""",
    "nine terms, spring intake through Spring 2029",
)


# Every path advertised a Spring 2028 graduation, which was the old plan's last
# term and is now the seventh of nine. The subs also described the old fix —
# moving Calculus II — so they say what actually happens now: CS 210 leaves the
# current term and comes back later. The internship year moves with the plan.
patch(
    """\
  PATHS = [
    { id:'A', rec:true, name:'Summer bridge',
      sub:'Calculus II online over six weeks this summer, then Data Structures in Fall 2026 as planned. Distributed Systems slides to spring to keep senior year even.',
      rows:[['GRADUATES','Spring 2028 — on time','good'],['ADDED COST','One 4-credit summer course','plain'],['ML TRACK','Fully intact, plus a 2027 internship','good'],['WATCH FOR','Calculus II compressed into six weeks','warn']] },
    { id:'B', name:'Heavier junior year',
      sub:'Keep Calculus II in Fall 2026 and push Data Structures to spring. Databases and Distributed Systems shift with it. No summer term, no extra tuition.',
      rows:[['GRADUATES','Spring 2028 — on time','plain'],['ADDED COST','None','good'],['ML TRACK','Intact, but ML lands in the final term','plain'],['WATCH FOR','Two heavy terms next to the capstone','warn']] },
    { id:'C', name:'Shift the concentration',
      sub:'Move from Machine Learning to Software Engineering. Linear Algebra and Probability leave the plan, so the math sequence stops driving everything.',
      rows:[['GRADUATES','Spring 2028 — on time','good'],['ADDED COST','None','good'],['ML TRACK','Dropped — math becomes self-study','warn'],['WATCH FOR','Pivoting back later costs a summer','warn']] }
  ];
""",
    """\
  PATHS = [
    { id:'A', rec:true, name:'Summer bridge',
      sub:'Drop Data Structures at add/drop and retake it online over six weeks in Summer 2027, once Calculus II is genuinely finished. Distributed Systems slides to the final spring to keep senior year even.',
      rows:[['GRADUATES','Spring 2029 — on time','good'],['ADDED COST','One 4-credit summer course','plain'],['ML TRACK','Fully intact, plus a 2028 internship','good'],['WATCH FOR','Data Structures compressed into six weeks','warn']] },
    { id:'B', name:'Heavier junior year',
      sub:'Drop Data Structures now and retake it in Spring 2027, on top of the math sequence. Databases and Distributed Systems shift a term to make room. No summer term, no extra tuition.',
      rows:[['GRADUATES','Spring 2029 — on time','plain'],['ADDED COST','None','good'],['ML TRACK','Intact, but the whole track lands in senior year','plain'],['WATCH FOR','A 19-credit junior spring, then an 18-credit senior spring','warn']] },
    { id:'C', name:'Shift the concentration',
      sub:'Move from Machine Learning to Software Engineering. Linear Algebra and Probability leave the plan, so the math sequence stops driving everything.',
      rows:[['GRADUATES','Spring 2029 — on time','good'],['ADDED COST','None','good'],['ML TRACK','Dropped — math becomes self-study','warn'],['WATCH FOR','Pivoting back later costs a summer','warn']] }
  ];
""",
    "paths graduate in Spring 2029",
)


# The three paths move courses by term key, and every key they named has been
# renumbered, so each one had to be retargeted or it would have moved nothing at
# all. The prelude above still drops the `prereq` issue on F26 and clears CS
# 210's flag, which is now the right key by luck of the renumbering — but the
# course each path lifts out of that term is CS 210, not MATH 152.
# Path A's summer term is a year later than it was, and lands after Spring 2027
# rather than after the term in progress. Path C's concentration swap now spans
# two terms, because Machine Learning and the Deep Learning lab no longer share
# one: CS 360 sits in Fall 2028 and CS 380 in Spring 2029.
patch(
    """\
    if (id === 'A') {
      const m = pull('MATH 152');
      Object.assign(m, { col:1, row:0, flag:'key' });
      board.splice(board.findIndex(b => b.k === 'S26') + 1, 0,
        { k:'SUM26', yr:'YEAR 2', sem:'Summer', term:'Summer 2026', l:'Summer · Summer 2026', tag:'ADDED BY PATH A', st:'plan', courses:[m], issues:[] });
      move('CS 425', 'S28', 4, 1);
      drop('F27', 'load');
    }
    if (id === 'B') {
      move('CS 425', 'S28', 4, 1);
      move('LING 200', 'F26', 2, 0);
      move('CS 210', 'S27', 0, 1);
      move('CS 320', 'F27', 1, 1);
      drop('S27', 'clash');
    }
    if (id === 'C') {
      pull('MATH 260'); pull('STAT 250');
      move('CS 425', 'S28', 4, 1);
      move('CS 210', 'S27', 1, 0);
      move('CS 320', 'F27', 1, 1);
      move('BIOL 105', 'S27', 3, 1);
      drop('S27', 'clash'); drop('F27', 'load');
      const s28 = T('S28');
      s28.courses = s28.courses.map(c =>
        c.c === 'CS 360' ? { c:'CS 415', n:'Software Architecture', cr:3, col:0, row:0 } :
        c.c === 'CS 380' ? { c:'CS 460', n:'Cloud & Deployment', cr:3, col:2, row:0 } : c);
    }
""",
    """\
    if (id === 'A') {
      const m = pull('CS 210');
      Object.assign(m, { col:0, row:0 });
      board.splice(board.findIndex(b => b.k === 'S27') + 1, 0,
        { k:'SUM27', yr:'YEAR 3', sem:'Summer', term:'Summer 2027', l:'Summer · Summer 2027', tag:'ADDED BY PATH A', st:'plan', courses:[m], issues:[] });
      move('CS 425', 'S29', 2, 0);
      drop('S28', 'load');
    }
    if (id === 'B') {
      move('CS 425', 'S29', 2, 0);
      move('CS 210', 'S27', 4, 0);
      move('LING 200', 'S27', 5, 0);
      move('CS 320', 'S28', 5, 0);
      drop('F27', 'clash');
    }
    if (id === 'C') {
      pull('MATH 260'); pull('STAT 250');
      move('CS 425', 'S29', 2, 0);
      move('CS 210', 'S27', 4, 0);
      move('BIOL 105', 'S27', 5, 0);
      move('CS 320', 'S28', 5, 0);
      drop('F27', 'clash'); drop('S28', 'load');
      const f28 = T('F28');
      f28.courses = f28.courses.map(c =>
        c.c === 'CS 360' ? { c:'CS 415', n:'Software Architecture', cr:3, col:0, row:0 } : c);
      const s29 = T('S29');
      s29.courses = s29.courses.map(c =>
        c.c === 'CS 380' ? { c:'CS 460', n:'Cloud & Deployment', cr:3, col:1, row:0 } : c);
    }
""",
    "catch-up paths retargeted to the new keys",
)


# CS 120 is the course that moved furthest in the renumbering: it was the first
# spring, and is now the first fall.
patch(
    """\
      req:[['MATH 152','same term — not satisfied','bad'],['CS 120','completed Spring 2025','good']],
""",
    """\
      req:[['MATH 152','same term — not satisfied','bad'],['CS 120','completed Fall 2025','good']],
""",
    "CS 120 finished in Fall 2025",
)


# The catalog is what the finder checks a course against, so a term list that
# disagrees with the board reads as a bug in the board. Two courses changed
# season in the new plan and their entries follow: Operating Systems is the
# spring section, Machine Learning the fall one. The summer-section pitch moves
# from Calculus II — which is in progress, not something to register for — to
# Data Structures, which is what path A actually buys. CS 340 is 4 credits on
# the board and now says so here too.
patch(
    """\
  CATALOG = [
    {c:'MATH 152',n:'Calculus II',cr:4,area:'Math & stats',lvl:100,terms:'Summer · Fall · Spring',elig:1,open:1,when:'Online',tag:'UNBLOCKS 4',m:'Requires MATH 151 ✓ · six-week summer section, fully online'},
    {c:'CS 245',n:'Human–Computer Interaction',cr:3,area:'CS elective',lvl:200,terms:'Fall · Spring',elig:1,open:1,when:'Afternoons',tag:'ELIGIBLE NOW',m:'Requires CS 120 ✓ · TTh 2:00 · 18 seats left'},
    {c:'WRIT 200',n:'Technical Writing',cr:3,area:'University core',lvl:200,terms:'Summer · Fall · Spring',elig:1,open:1,when:'Online',tag:'ELIGIBLE NOW',m:'No prerequisites · satisfies the upper-level writing core'},
    {c:'LING 200',n:'Language & Mind',cr:3,area:'Free elective',lvl:200,terms:'Fall · Spring',elig:1,open:1,clash:1,when:'Evenings',tag:'WED SECTION OPEN',m:'The Wednesday evening section avoids your CS 320 clash'},
    {c:'BIOL 105',n:'Human Biology & Lab',cr:4,area:'University core',lvl:100,terms:'Fall · Spring',elig:1,open:0,when:'Mornings',tag:'WAITLIST',m:'Lab science requirement · three students ahead of you'},
    {c:'CS 210',n:'Data Structures & Algorithms',cr:4,area:'CS core',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'BLOCKED',m:'Requires CS 120 ✓ and MATH 152 ✗ · gate into the 300 level'},
    {c:'MATH 240',n:'Discrete Mathematics',cr:3,area:'Math & stats',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Afternoons',tag:'NEEDS MATH 152',m:'Required by CS 310 · offered every term'},
    {c:'MATH 260',n:'Linear Algebra',cr:3,area:'Math & stats',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'NEEDS MATH 152',m:'Required by CS 360 · anti-requisite of MATH 265'},
    {c:'STAT 250',n:'Probability & Statistics',cr:3,area:'Math & stats',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'FIXES A CONFLICT',m:'Replaces STAT 210 for major credit · required by CS 360'},
    {c:'CS 310',n:'Algorithms',cr:4,area:'CS core',lvl:300,terms:'Fall',elig:0,open:1,when:'Mornings',tag:'NEEDS CS 210',m:'Requires CS 210 and MATH 240 · Fall only'},
    {c:'CS 320',n:'Databases',cr:3,area:'CS core',lvl:300,terms:'Fall · Spring',elig:0,open:1,clash:1,when:'Afternoons',tag:'CLASHES',m:'Requires CS 210 · TTh 2:00 overlaps LING 200 in your draft'},
    {c:'CS 330',n:'Operating Systems',cr:4,area:'CS core',lvl:300,terms:'Fall',elig:0,open:0,when:'Afternoons',tag:'WAITLIST',m:'Requires CS 210 and CS 230 ✓ · one section a year'},
    {c:'CS 340',n:'Software Engineering',cr:3,area:'CS core',lvl:300,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'FEEDS CAPSTONE',m:'Requires CS 210 · prerequisite for CS 450'},
    {c:'CS 360',n:'Machine Learning',cr:3,area:'CS elective',lvl:300,terms:'Spring',elig:0,open:1,when:'Mornings',tag:'TRACK CORE',m:'Requires CS 310, MATH 260, STAT 250 · Spring only'},
    {c:'CS 380',n:'Deep Learning Lab',cr:3,area:'CS elective',lvl:300,terms:'Spring',elig:0,open:1,when:'Afternoons',tag:'',m:'Requires CS 360 · project-based, Spring only'},
    {c:'CS 425',n:'Distributed Systems',cr:3,area:'CS elective',lvl:300,terms:'Fall · Spring',elig:0,open:1,when:'Evenings',tag:'',m:'Requires CS 330 · Tuesday evening seminar'},
    {c:'DATA 340',n:'Applied Machine Learning',cr:3,area:'CS elective',lvl:300,terms:'Fall · Spring',elig:0,open:1,when:'Evenings',tag:'ANTI-REQUISITE',m:'Cannot be combined with CS 360 — the catalog credits one only',warn:1}
  ];
""",
    """\
  CATALOG = [
    {c:'MATH 152',n:'Calculus II',cr:4,area:'Math & stats',lvl:100,terms:'Summer · Fall · Spring',elig:1,open:1,when:'Mornings',tag:'UNBLOCKS 4',m:'Requires MATH 151 ✓ · in progress this term, not on the transcript yet'},
    {c:'CS 245',n:'Human–Computer Interaction',cr:3,area:'CS elective',lvl:200,terms:'Fall · Spring',elig:1,open:1,when:'Afternoons',tag:'ELIGIBLE NOW',m:'Requires CS 120 ✓ · TTh 2:00 · 18 seats left'},
    {c:'WRIT 200',n:'Technical Writing',cr:3,area:'University core',lvl:200,terms:'Summer · Fall · Spring',elig:1,open:1,when:'Online',tag:'ELIGIBLE NOW',m:'No prerequisites · satisfies the upper-level writing core'},
    {c:'LING 200',n:'Language & Mind',cr:3,area:'Free elective',lvl:200,terms:'Fall · Spring',elig:1,open:1,clash:1,when:'Evenings',tag:'WED SECTION OPEN',m:'The Wednesday evening section avoids your CS 320 clash'},
    {c:'BIOL 105',n:'Human Biology & Lab',cr:4,area:'University core',lvl:100,terms:'Fall · Spring',elig:1,open:0,when:'Mornings',tag:'WAITLIST',m:'Lab science requirement · three students ahead of you'},
    {c:'CS 210',n:'Data Structures & Algorithms',cr:4,area:'CS core',lvl:200,terms:'Summer · Fall · Spring',elig:0,open:1,when:'Mornings',tag:'BLOCKED',m:'Requires CS 120 ✓ and MATH 152 ✗ · gate into the 300 level, also runs as a six-week summer section'},
    {c:'MATH 240',n:'Discrete Mathematics',cr:3,area:'Math & stats',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Afternoons',tag:'NEEDS MATH 152',m:'Required by CS 310 · offered every term'},
    {c:'MATH 260',n:'Linear Algebra',cr:3,area:'Math & stats',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'NEEDS MATH 152',m:'Required by CS 360 · anti-requisite of MATH 265'},
    {c:'STAT 250',n:'Probability & Statistics',cr:3,area:'Math & stats',lvl:200,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'FIXES A CONFLICT',m:'Replaces STAT 210 for major credit · required by CS 360'},
    {c:'CS 310',n:'Algorithms',cr:4,area:'CS core',lvl:300,terms:'Fall',elig:0,open:1,when:'Mornings',tag:'NEEDS CS 210',m:'Requires CS 210 and MATH 240 · Fall only'},
    {c:'CS 320',n:'Databases',cr:3,area:'CS core',lvl:300,terms:'Fall · Spring',elig:0,open:1,clash:1,when:'Afternoons',tag:'CLASHES',m:'Requires CS 210 · TTh 2:00 overlaps LING 200 in your draft'},
    {c:'CS 330',n:'Operating Systems',cr:4,area:'CS core',lvl:300,terms:'Spring',elig:0,open:0,when:'Afternoons',tag:'WAITLIST',m:'Requires CS 210 and CS 230 ✓ · one section a year, in spring'},
    {c:'CS 340',n:'Software Engineering',cr:4,area:'CS core',lvl:300,terms:'Fall · Spring',elig:0,open:1,when:'Mornings',tag:'FEEDS CAPSTONE',m:'Requires CS 210 · prerequisite for CS 450'},
    {c:'CS 360',n:'Machine Learning',cr:3,area:'CS elective',lvl:300,terms:'Fall',elig:0,open:1,when:'Mornings',tag:'TRACK CORE',m:'Requires CS 310, MATH 260, STAT 250 · Fall only'},
    {c:'CS 380',n:'Deep Learning Lab',cr:3,area:'CS elective',lvl:300,terms:'Spring',elig:0,open:1,when:'Afternoons',tag:'',m:'Requires CS 360 · project-based, Spring only'},
    {c:'CS 425',n:'Distributed Systems',cr:3,area:'CS elective',lvl:300,terms:'Fall · Spring',elig:0,open:1,when:'Evenings',tag:'',m:'Requires CS 330 · Tuesday evening seminar'},
    {c:'DATA 340',n:'Applied Machine Learning',cr:3,area:'CS elective',lvl:300,terms:'Fall · Spring',elig:0,open:1,when:'Evenings',tag:'ANTI-REQUISITE',m:'Cannot be combined with CS 360 — the catalog credits one only',warn:1}
  ];
""",
    "catalog agrees with the new terms",
)


# Nine terms, so nine notes, keyed to the new keys. The old set described a plan
# that no longer exists — an eleven-credit term in progress, a Calculus II that
# "arrives late" — and the expanded-semester sheet is the one place a student
# reads a term in full, so a stale note there is worse than none.
patch(
    """\
  TNOTES = {
    F24: { b:'Your first term, and the one that set the pace: Programming and Calculus I both finished cleanly.', n:'A strong start. CS 110 with a B+ was enough to place you straight into the design sequence.' },
    S25: { b:'Object-Oriented Design landed here, which is why most 200-level CS is already open to you.', n:'CS 120 is the prerequisite doing the most work in your plan — four courses sit directly on top of it.' },
    F25: { b:'Computer Systems finished, and the University Core moved close to complete.', n:'CS 230 is banked, so Operating Systems only waits on Data Structures now.' },
    S26: { b:'In progress. Eleven credits, and one of them will not count toward the major as scheduled.', n:'Finish STAT 210 for the credit, but plan on STAT 250 next year — the catalog will only award one of the two.' },
    F26: { b:'The pressure term of the draft: Calculus II arrives late, and Data Structures is sitting on top of it.', n:'Decide this before 19 August. A summer section of MATH 152 is the cleanest fix; an override for CS 210 is possible but rarely granted.' },
    S27: { b:'The math sequence catches up here — three courses that everything in senior year depends on.', n:'Watch the Tuesday/Thursday 2:00 hour. Two courses want it, and only LING 200 has an alternative section.' },
    F27: { b:'Eighteen credits with four 300-level CS courses. The heaviest term in the plan by some distance.', n:'If you take one thing from this draft, move CS 425 to spring. Same graduation date, three fewer credits in the hardest term.' },
    S28: { b:'The finish: Machine Learning, the Deep Learning lab, and the capstone in one term.', n:'Capstone and CS 380 both carry heavy project loads. Keep the fourth slot to a lab science and nothing more.' }
  };
""",
    """\
  TNOTES = {
    S25: { b:'Your first term — a spring intake — and the one that set the pace: Programming and Calculus I both finished cleanly.', n:'A strong start. CS 110 with a B+ was enough to place you straight into the design sequence.' },
    F25: { b:'Object-Oriented Design and Computer Systems in the same term, which is why most 200-level CS is already open to you.', n:'CS 120 is the prerequisite doing the most work in your plan — four courses sit directly on top of it.' },
    S26: { b:'Data Science finished, and the University Core moved close to complete.', n:'CS 235 is where your first portfolio project should come from. The work is already done; it needs a weekend of writing up.' },
    F26: { b:'In progress. Eighteen credits, and the one term in the plan carrying a prerequisite it has not actually met.', n:'CS 210 is running alongside MATH 152 rather than behind it. Decide before add/drop closes on 11 September — after that, dropping it costs a W.' },
    S27: { b:'The math sequence catches up here: Discrete and Linear Algebra, which most of senior year sits on.', n:'STAT 210 counts as a free elective, not toward the major. STAT 250 in the fall is the one CS 360 actually requires.' },
    F27: { b:'The first term built around 300-level CS, with Algorithms leading it.', n:'Watch the Tuesday/Thursday 2:00 hour. Two courses want it, and only LING 200 has an alternative section.' },
    S28: { b:'Eighteen credits and three 300-level CS courses. The heaviest term in the plan by some distance.', n:'If you take one thing from this draft, move CS 425 to the final spring. Same graduation date, three fewer credits in the hardest term.' },
    F28: { b:'A deliberately light term: Machine Learning, plus the last of the University Core.', n:'Ten credits leaves room for the capstone proposal and a full return-offer process.' },
    S29: { b:'The finish: the capstone and the Deep Learning lab, and deliberately nothing else.', n:'Seven credits, both of them project-heavy. That is the point — the capstone is the term.' }
  };
""",
    "one note per term, nine of them",
)


# Both advisers offered appointments in early August, which is before the term
# the board says is in progress. The decision point is add/drop, so the slots
# are the first week of the term instead — real 2026 weekdays, and clear of the
# 11 September deadline the rest of the copy now names.
patch(
    """\
    const advPeople = [
      { init:'RA', role:'ACADEMIC ADVISOR', name:'Dr. Renata Adeyemi', sub:'Computer Science · Kemp Hall 318', primary:1,
        note:'Registration holds, prerequisite overrides, degree-audit exceptions, and which term a course really belongs in.',
        rows:[['EMAIL','r.adeyemi@university.edu'],['PHONE','(215) 555-0142'],['DROP-IN HOURS','Tue & Thu, 1:00–3:00 pm'],['TYPICAL REPLY','Within one business day']],
        slots:['Thu 6 Aug · 10:30','Fri 7 Aug · 2:00','Mon 10 Aug · 9:15'], bookLabel:'Book a 30-minute meeting' },
      { init:'MB', role:'CAREER COUNSELOR', name:'Marcus Bell', sub:'Career Center · Whitmore 120',
        note:'Internship timing, ML portfolio review, résumé passes, and mock interviews with engineers from the alumni network.',
        rows:[['EMAIL','m.bell@university.edu'],['PHONE','(215) 555-0198'],['DROP-IN HOURS','Wed, 11:00 am–1:00 pm'],['TYPICAL REPLY','Two to three days']],
        slots:['Wed 12 Aug · 11:00','Thu 13 Aug · 3:30','Tue 18 Aug · 10:00'], bookLabel:'Book a career session' }
""",
    """\
    const advPeople = [
      { init:'RA', role:'ACADEMIC ADVISOR', name:'Dr. Renata Adeyemi', sub:'Computer Science · Kemp Hall 318', primary:1,
        note:'Registration holds, prerequisite overrides, degree-audit exceptions, and which term a course really belongs in.',
        rows:[['EMAIL','r.adeyemi@university.edu'],['PHONE','(215) 555-0142'],['DROP-IN HOURS','Tue & Thu, 1:00–3:00 pm'],['TYPICAL REPLY','Within one business day']],
        slots:['Thu 3 Sep · 10:30','Fri 4 Sep · 2:00','Tue 8 Sep · 9:15'], bookLabel:'Book a 30-minute meeting' },
      { init:'MB', role:'CAREER COUNSELOR', name:'Marcus Bell', sub:'Career Center · Whitmore 120',
        note:'Internship timing, ML portfolio review, résumé passes, and mock interviews with engineers from the alumni network.',
        rows:[['EMAIL','m.bell@university.edu'],['PHONE','(215) 555-0198'],['DROP-IN HOURS','Wed, 11:00 am–1:00 pm'],['TYPICAL REPLY','Two to three days']],
        slots:['Wed 9 Sep · 11:00','Thu 10 Sep · 3:30','Tue 15 Sep · 10:00'], bookLabel:'Book a career session' }
""",
    "advising slots land inside the term",
)


# The advising screen is where the student acts on the board, so every figure on
# it has to be the board's. The agenda pointed at an eighteen-credit Fall 2027
# that is now Spring 2028, at a registration deadline that has already passed,
# and at a fix — the summer Calculus II section — that stopped being available
# the moment Calculus II went in progress. The draft email said "my draft has",
# which is the one word that no longer applies: it is not a draft, it is this
# term's registration.
patch(
    """\
    const advPrompts = [
      'Can I get an override for CS 210?',
      'Is the summer MATH 152 section a good idea?',
      'Will STAT 210 count for anything?',
      'Am I still on track for a 2027 internship?'
    ].map((l, i) => ({ l, style:`text-align:left;font-size:12px;border-radius:7px;padding:8px 12px;background:${i === 0 ? '#F1E3D8' : '#F8F4EA'};border:1px solid ${i === 0 ? '#DFC2AC' : '#EFEADD'};color:${i === 0 ? '#7E3F22' : '#5C554A'}` }));

    const advAgenda = [
      { t:'Decide between the summer MATH 152 section and a CS 210 override', s:'BEFORE 19 AUGUST', tone:'bad' },
      { t:'Confirm STAT 250 replaces STAT 210 for major credit', s:'SPRING 2027 REGISTRATION', tone:'warn' },
      { t:'Move CS 425 out of the 18-credit Fall 2027 term', s:'CAN WAIT UNTIL SPRING', tone:'warn' },
      { t:'Sign off on the Machine Learning concentration form', s:'DUE END OF JUNIOR YEAR', tone:'ok' }
    ].map(a => ({ ...a, dotStyle:`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:${a.tone === 'bad' ? '#B4552F' : a.tone === 'warn' ? '#96742E' : '#5A7355'}` }));

    const advResources = [
      { n:'Math Learning Center', tag:'DROP-IN, NO APPOINTMENT', d:'Calculus tutors in Rand 118 until 8:00 pm on weekdays — the standard support if you take MATH 152 over six weeks.' },
      { n:'CS peer mentors', tag:'WEEKLY, BY REQUEST', d:'Juniors and seniors who have finished CS 210. Useful for a preview of what the course actually asks of you.' },
      { n:'Registrar', tag:'HOLDS & PETITIONS', d:'Files the prerequisite petition once Dr. Adeyemi signs it. Allow five business days before registration.' },
      { n:'Student Accessibility Services', tag:'ACCOMMODATIONS', d:'Extended-time and reduced-load arrangements, including how a lighter term affects your projected graduation.' }
    ];

    const advDraft = 'Hi Dr. Adeyemi — my draft has MATH 152 and CS 210 in the same term (Fall 2026), which I know will not register. I would rather take Calculus II in the six-week summer session than push Data Structures to Spring 2027, but I wanted to check whether the compressed section is a reasonable idea before I commit. My plan is attached. Could we talk it through on Thursday?';
""",
    """\
    const advPrompts = [
      'Can I get an override for CS 210?',
      'Should I drop CS 210 and take it next summer?',
      'Will STAT 210 count for anything?',
      'Am I still on track for a 2028 internship?'
    ].map((l, i) => ({ l, style:`text-align:left;font-size:12px;border-radius:7px;padding:8px 12px;background:${i === 0 ? '#F1E3D8' : '#F8F4EA'};border:1px solid ${i === 0 ? '#DFC2AC' : '#EFEADD'};color:${i === 0 ? '#7E3F22' : '#5C554A'}` }));

    const advAgenda = [
      { t:'Decide between dropping CS 210 and petitioning for a retroactive override', s:'BEFORE 11 SEPTEMBER', tone:'bad' },
      { t:'Confirm STAT 250 replaces STAT 210 for major credit', s:'SPRING 2027 REGISTRATION', tone:'warn' },
      { t:'Move CS 425 out of the 18-credit Spring 2028 term', s:'CAN WAIT UNTIL NEXT YEAR', tone:'warn' },
      { t:'Sign off on the Machine Learning concentration form', s:'DUE END OF JUNIOR YEAR', tone:'ok' }
    ].map(a => ({ ...a, dotStyle:`width:7px;height:7px;border-radius:50%;flex:none;margin-top:5px;background:${a.tone === 'bad' ? '#B4552F' : a.tone === 'warn' ? '#96742E' : '#5A7355'}` }));

    const advResources = [
      { n:'Math Learning Center', tag:'DROP-IN, NO APPOINTMENT', d:'Calculus tutors in Rand 118 until 8:00 pm on weekdays — the standard support while MATH 152 is in progress.' },
      { n:'CS peer mentors', tag:'WEEKLY, BY REQUEST', d:'Juniors and seniors who have already finished CS 210. The fastest read on whether you can hold the course without Calculus II behind you.' },
      { n:'Registrar', tag:'HOLDS & PETITIONS', d:'Files the prerequisite petition once Dr. Adeyemi signs it. Allow five business days before the add/drop deadline.' },
      { n:'Student Accessibility Services', tag:'ACCOMMODATIONS', d:'Extended-time and reduced-load arrangements, including how a lighter term affects your projected graduation.' }
    ];

    const advDraft = 'Hi Dr. Adeyemi — I am registered for CS 210 and MATH 152 in the same term this fall, and CS 210 lists MATH 152 as a prerequisite. Registration let it through, but nothing on my transcript satisfies it. I would rather drop CS 210 now and take the six-week online section next summer than carry a course I am not prepared for, but I wanted to check that with you before add/drop closes on 11 September. My plan is attached. Could we talk it through on Thursday?';
""",
    "advising copy points at this term's decision",
)


# The top suggestion was a summer section of Calculus II, which is now a course
# the student is halfway through — the card would have offered to fix a problem
# by scheduling something already on the timetable. The course that can still
# move is CS 210. (The "+ Add to a term" patch above still describes the old
# rosters in its comment: the three cards now resolve to Fall 2026, Fall 2027
# and Spring 2028, and path C's empty-handed case targets Spring 2027.)
patch(
    """\
      { c:'MATH 152', n:'Calculus II — summer session', why:'Six weeks online. Clears the block under Data Structures a full year early and keeps every later term at 15–16 credits.', tag:'HIGHEST IMPACT' },
      { c:'STAT 250', n:'Probability & Statistics', why:'Replaces STAT 210 for major credit and is required by Machine Learning. Offered every term, so it slots in easily.', tag:'FIXES A CONFLICT' },
      { c:'CS 245', n:'Human–Computer Interaction', why:'Only needs CS 120, which you have. A safe way to keep making major progress while the math sequence catches up.', tag:'READY NOW' }
""",
    """\
      { c:'CS 210', n:'Data Structures — summer session', why:'The one course in this term with nothing behind it. Dropping it now and retaking it over six weeks next summer costs you a term and keeps the whole 300-level sequence on schedule.', tag:'HIGHEST IMPACT' },
      { c:'STAT 250', n:'Probability & Statistics', why:'Replaces STAT 210 for major credit and is required by Machine Learning. Offered every term, so it slots in easily.', tag:'FIXES A CONFLICT' },
      { c:'CS 245', n:'Human–Computer Interaction', why:'Only needs CS 120, which you have. A safe way to keep making major progress while the prerequisite question gets settled.', tag:'READY NOW' }
""",
    "the suggestion that can still be acted on",
)


# Four issues, four rows, and each row names the term its issue lives in — so
# all four keys and all four labels move with the plan. The first one gains
# "in progress", because that is what makes it the urgent one.
patch(
    """\
      { k:'F26', tone:'bad', t:'CS 210 blocked by MATH 152', s:'Fall 2026' },
      { k:'S26', tone:'warn', t:'STAT 210 / STAT 250 anti-requisite', s:'Spring 2026' },
      { k:'S27', tone:'warn', t:'CS 320 and LING 200 clash', s:'Spring 2027' },
      { k:'F27', tone:'warn', t:'18-credit overload', s:'Fall 2027' }
""",
    """\
      { k:'F26', tone:'bad', t:'CS 210 blocked by MATH 152', s:'Fall 2026 — in progress' },
      { k:'S27', tone:'warn', t:'STAT 210 / STAT 250 anti-requisite', s:'Spring 2027' },
      { k:'F27', tone:'warn', t:'CS 320 and LING 200 clash', s:'Fall 2027' },
      { k:'S28', tone:'warn', t:'18-credit overload', s:'Spring 2028' }
""",
    "the four things to sort out name the right terms",
)


# The path strip colours path A's inserted term differently from the drafts
# around it, and it looks the term up by key.
patch(
    """\
          return { l: t.k.slice(0, 3), barStyle: stripBar(cr, t.st === 'done' ? 'past' : t.k === 'SUM26' ? 'new' : cr > 17 ? 'heavy' : 'plan') };
""",
    """\
          return { l: t.k.slice(0, 3), barStyle: stripBar(cr, t.st === 'done' ? 'past' : t.k === 'SUM27' ? 'new' : cr > 17 ? 'heavy' : 'plan') };
""",
    "path A's summer term still reads as new",
)


# The finder's term filter matches on the season word alone, so what these three
# chips really have to be is honest: the terms a student sitting in Fall 2026
# can still register for.
patch(
    """\
      ['term',  'TERM',  ['Summer 2026','Fall 2026','Spring 2027']],
""",
    """\
      ['term',  'TERM',  ['Spring 2027','Summer 2027','Fall 2027']],
""",
    "term filter offers terms you can still register for",
)


# The finder's add button named the first draft term, and that term is now in
# progress — offering to add a course to a term four weeks old.
patch(
    """\
      fdAddLabel: fPlanned ? `Already in ${fPlanned.term}` : unmet.length ? 'Add anyway and flag it' : 'Add to Fall 2026',
""",
    """\
      fdAddLabel: fPlanned ? `Already in ${fPlanned.term}` : unmet.length ? 'Add anyway and flag it' : 'Add to Spring 2027',
""",
    "finder adds to the first draft term",
)


# Both dated milestones assumed Data Structures was already banked. It is in
# progress at best and dropped at worst on every path, so the first hiring cycle
# it can honestly support is a year later — which is also the first one where
# Algorithms is on the transcript rather than merely scheduled.
patch(
    """\
    const milestones = [
      { d:'Sep 2026', t:'Summer 2027 internship applications open', s:'ML teams look for Data Structures on the transcript — Path A is the only route that has it by then.' },
      { d:'Feb 2027', t:'Research assistantship, Adeyemi Lab', s:'Opens to students who have finished CS 210 and one statistics course.' },
      { d:'Ongoing', t:'Two portfolio projects', s:'CS 235 coursework can become the first one with about a weekend of extra work.' }
    ];
""",
    """\
    const milestones = [
      { d:'Sep 2027', t:'Summer 2028 internship applications open', s:'ML teams look for Data Structures and Algorithms on the transcript, and every path has both behind you by then.' },
      { d:'Feb 2028', t:'Research assistantship, Adeyemi Lab', s:'Opens to students who have finished CS 210 and one statistics course.' },
      { d:'Ongoing', t:'Two portfolio projects', s:'CS 235 coursework can become the first one with about a weekend of extra work.' }
    ];
""",
    "career milestones wait for the transcript",
)


# The timeline header counted the old eight terms and described Spring 2026 as
# the last completed one.
patch(
    """\
<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.13em;color:#8F8779;margin-bottom:11px">EIGHT TERMS · 120 CREDITS</div>
<h1 style="font-family:Newsreader,serif;font-size:34px;line-height:1.15;font-weight:400;margin:0 0 8px;letter-spacing:-0.015em">Your plan, term by term</h1>
<p style="margin:0;font-size:14.5px;color:#5C554A;max-width:600px">Everything after Spring 2026 is a draft. Fall 2026 is where the missed prerequisite shows up — Data Structures has to wait a term.</p>
""",
    """\
<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.13em;color:#8F8779;margin-bottom:11px">NINE TERMS · 120 CREDITS</div>
<h1 style="font-family:Newsreader,serif;font-size:34px;line-height:1.15;font-weight:400;margin:0 0 8px;letter-spacing:-0.015em">Your plan, term by term</h1>
<p style="margin:0;font-size:14.5px;color:#5C554A;max-width:600px">Fall 2026 is in progress; everything after it is a draft. The missed prerequisite is in this term, not a future one — Data Structures is running without Calculus II behind it.</p>
""",
    "nine terms on the timeline header",
)


# Registration for this term is over — the student is in it. What is still open,
# and what the whole advising screen is for, is add/drop.
patch(
    """\
<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.13em;color:#8F8779;margin-bottom:11px">YOUR SUPPORT TEAM · REGISTRATION OPENS 19 AUGUST</div>
<h1 style="font-family:Newsreader,serif;font-size:34px;line-height:1.15;font-weight:400;margin:0 0 10px;letter-spacing:-0.015em;text-wrap:pretty">Two people already know this plan. Both are easier to reach than you'd think.</h1>
<p style="margin:0;font-size:14.5px;color:#5C554A;text-wrap:pretty">Dr. Adeyemi signs registration overrides and degree-audit exceptions. Marcus Bell handles internship timing and portfolio review. The Fall 2026 prerequisite question belongs to Dr. Adeyemi, and it needs an answer before registration opens.</p>
""",
    """\
<div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.13em;color:#8F8779;margin-bottom:11px">YOUR SUPPORT TEAM · ADD/DROP CLOSES 11 SEPTEMBER</div>
<h1 style="font-family:Newsreader,serif;font-size:34px;line-height:1.15;font-weight:400;margin:0 0 10px;letter-spacing:-0.015em;text-wrap:pretty">Two people already know this plan. Both are easier to reach than you'd think.</h1>
<p style="margin:0;font-size:14.5px;color:#5C554A;text-wrap:pretty">Dr. Adeyemi signs registration overrides and degree-audit exceptions. Marcus Bell handles internship timing and portfolio review. The Fall 2026 prerequisite question belongs to Dr. Adeyemi, and it needs an answer before add/drop closes.</p>
""",
    "advising deadline is add/drop, not registration",
)


# The plan attached to that email is the board, and the board is nine terms.
patch(
    "ATTACHED · YOUR 8-TERM PLAN",
    "ATTACHED · YOUR 9-TERM PLAN",
    "the attached plan is nine terms",
)


# ---------------------------------------------- 12. one institution, one degree ---
# The Semester view, the Course map and the Overview dashboard are driven by
# SCHOOLS[state.school], not by BASE_BOARD — and that pointer was still on
# 'nyu-cs'. Three whole screens therefore described an NYU BA (CSCI-UA course
# codes, 48 of 128 credits, a Fall 2024 start and a Spring 2028 graduation)
# while the board, Home, Profile and Career all described Carnegie Mellon.
# The patches below rewrite the 'cmu-cs' program out of BASE_BOARD and
# BASE_EDGES so the two datasets finally describe one plan, then point the app
# at it and take the NYU programs out of the picker.
#
# Deliberate: the roster keeps the board's generic course codes (CS 210,
# MATH 152, PHYS 141) rather than CMU's real numbering (15-122, 21-127). Home,
# Profile and Career all print CS 210; renumbering here would fix the
# institution and break the agreement with every other page. Removing NYU is
# what makes the institution right — the numbering scheme is a product-wide
# convention, and this page has to speak it.
patch(
    """\
  META: {
    school:'CMU', program:'CS BS · SCS', tab:'Computer Science',
    unitLabel:'units', unitAbbr:'u', doneCr:104, totalCr:360, inProgCr:33, behindCr:24, pct:29,
    gradTerm:'Spring 2028', classYear:'SOPHOMORE',
    keyCode:'15-251', keyName:'Great Ideas in Theoretical Computer Science',
    headline:'Register for 15-251 — Algorithm Design and Complexity Theory are both waiting on it.',
    blurb:'Great Ideas is the gate into the theory sequence. Until it clears, 15-451 will not register, and the complexity elective stacked behind it has nowhere to go.',
    snapshot:"104 of 360 units are in the bank with 33 more in progress. The gap isn't effort, it's sequencing: Great Ideas in Theoretical Computer Science never made it onto a schedule, and the courses above it are still waiting."
  },
""",
    """\
  META: {
    school:'CMU', program:'CS BS · SCS', tab:'Computer Science',
    unitLabel:'credits', unitAbbr:'cr', doneCr:42, totalCr:120, inProgCr:18, behindCr:3, pct:35,
    gradTerm:'Spring 2029', classYear:'SOPHOMORE',
    keyCode:'MATH 152', keyName:'Calculus II',
    headline:'MATH 152 is the course everything is waiting on — and CS 210 is being taken beside it, not after it.',
    blurb:'Calculus II is the one prerequisite of Data Structures & Algorithms, and both are on your schedule this term. Registration let it through, but nothing on your transcript satisfies CS 210 — and the rest of the math sequence is stacked behind Calculus II as well.',
    snapshot:"42 of 120 credits are in the bank with 18 more in progress. The gap isn't effort, it's sequencing: CS 210 is running in the same term as MATH 152, the course it lists as a prerequisite, and add/drop is the last point where fixing that costs nothing."
  },
""",
    "cmu-cs META describes the board's degree",
)


# behindCr is only ever printed as "N credits behind a 4-year pace" on the
# dashboard. A four-year pace is 120 credits over eight terms, so three finished
# terms should have banked 45; this plan banked 42. Three credits — "a little
# behind pace", which is exactly what the headline above it already claims.
#
# All nine programs carry a byte-identical TERMS array, so TERMS on its own
# matches nine times. TIERS sits directly above it and its labels are unique to
# cmu-cs, so the two are replaced together and the anchor stays singular.
# The tier labels are rewritten because the old ones name CMU unit-system
# courses; the new five are the dependency depths of this roster, which is what
# the graph actually lays out in columns.
patch(
    """\
  TIERS: ['IMPERATIVE START','CORE SEQUENCE','SYSTEMS & MATRICES','THEORY & ALGORITHMS','ADVANCED ELECTIVES'],

  TERMS: [
    {k:'F24', l:'Fall 2024', short:'F24', tag:'FIRST YEAR', st:'done'},
    {k:'S25', l:'Spring 2025', short:'S25', tag:'FIRST YEAR', st:'done'},
    {k:'F25', l:'Fall 2025', short:'F25', tag:'SOPHOMORE', st:'done'},
    {k:'S26', l:'Spring 2026', short:'S26', tag:'IN PROGRESS', st:'current'},
    {k:'F26', l:'Fall 2026', short:'F26', tag:'JUNIOR · DRAFT', st:'plan'},
    {k:'S27', l:'Spring 2027', short:'S27', tag:'JUNIOR · DRAFT', st:'plan'},
    {k:'F27', l:'Fall 2027', short:'F27', tag:'SENIOR · DRAFT', st:'plan'},
    {k:'S28', l:'Spring 2028', short:'S28', tag:'SENIOR · DRAFT', st:'plan'}
  ],
""",
    """\
  TIERS: ['FOUNDATIONS','PROGRAMMING & CALCULUS','SYSTEMS, DATA & MATH','300-LEVEL CS CORE','ELECTIVES & CAPSTONE'],

  TERMS: [
    {k:'S25', l:'Spring 2025', short:'S25', tag:'FIRST YEAR', st:'done'},
    {k:'F25', l:'Fall 2025', short:'F25', tag:'FIRST YEAR', st:'done'},
    {k:'S26', l:'Spring 2026', short:'S26', tag:'SOPHOMORE', st:'done'},
    {k:'F26', l:'Fall 2026', short:'F26', tag:'IN PROGRESS', st:'current'},
    {k:'S27', l:'Spring 2027', short:'S27', tag:'JUNIOR · DRAFT', st:'plan'},
    {k:'F27', l:'Fall 2027', short:'F27', tag:'JUNIOR · DRAFT', st:'plan'},
    {k:'S28', l:'Spring 2028', short:'S28', tag:'SENIOR · DRAFT', st:'plan'},
    {k:'F28', l:'Fall 2028', short:'F28', tag:'SENIOR · DRAFT', st:'plan'},
    {k:'S29', l:'Spring 2029', short:'S29', tag:'SENIOR · DRAFT', st:'plan'}
  ],
""",
    "cmu-cs tiers and nine terms",
)


# The five degree-audit bars, recounted against the new 35-course roster so the
# arithmetic closes: 14 + 5 + 3 + 12 + 1 = 35 courses, of which 12 are complete
# (the three finished terms) and 5 are in progress (Fall 2026) — exactly what
# BASE_BOARD holds. STAT 210 is booked as a free elective rather than as
# mathematics because the board's own anti-requisite issue says the catalog will
# not count it toward the major. Nothing in this plan is unscheduled, so
# `missing` lists what is still ahead of you rather than what has no home — an
# empty chip list under every bar would say less, not more.
patch(
    """\
  REQS: [
    { name:'Major sequence', d:4, p:2, tot:13, count:'4 of 13 courses', missing:['15-251','15-451','15-410','10-315','15-411'] },
    { name:'Mathematics', d:3, p:0, tot:5, count:'3 of 5 courses', missing:['21-241','15-259'] },
    { name:'Science', d:1, p:0, tot:2, count:'1 of 2 courses', missing:['09-105'] },
    { name:'Humanities & social sciences', d:2, p:1, tot:5, count:'2 of 5 courses', missing:['73-102','76-271'] },
    { name:'Free electives', d:1, p:0, tot:1, count:'1 of 1 courses', missing:[] }
  ],
""",
    """\
  REQS: [
    { name:'Major sequence', d:4, p:1, tot:14, count:'4 of 14 courses', missing:['CS 310','CS 330','CS 340','CS 360','CS 450'] },
    { name:'Mathematics', d:1, p:1, tot:5, count:'1 of 5 courses', missing:['MATH 240','MATH 260','STAT 250'] },
    { name:'Science', d:0, p:1, tot:3, count:'0 of 3 courses', missing:['BIOL 105','ASTR 110'] },
    { name:'Humanities & social sciences', d:7, p:2, tot:12, count:'7 of 12 courses', missing:['WRIT 200','LING 200','SOC 101'] },
    { name:'Free electives', d:0, p:0, tot:1, count:'0 of 1 courses', missing:['STAT 210'] }
  ],
""",
    "cmu-cs degree audit recounted",
)


# The roster itself, one row per course on the board, in board order. `c`, `n`
# and `cr` are copied from BASE_BOARD verbatim — that identity is the whole
# point of the exercise — and `req` is read straight off BASE_EDGES, minus the
# anti edge, which becomes `anti` on both STAT 210 and STAT 250 the way the
# upstream data writes anti pairs.
#
# `gen:1` marks the fifteen courses outside the major. They are dropped from the
# Gantt and from the dependency graph, which is the only reason either stays
# readable at 35 courses. `tier` 0-4 is the dependency depth of the twenty major
# courses and matches the five TIERS labels; every requirement therefore points
# one or more columns to the left, so no edge in the graph runs backwards.
# DATA 340 rides along as the one alternative: the board's CATALOG already
# carries it as an anti-requisite of CS 360, so the map can show the choice.
patch(
    """\
  COURSES: [
    {c:'15-112', n:'Fundamentals of Programming and CS', cr:12, t:0, s:'done', tier:0, req:[], anti:[]},
    {c:'21-120', n:'Differential and Integral Calculus', cr:10, t:0, s:'done', tier:0, req:[], anti:[]},
    {c:'76-101', n:'Interpretation and Argument', cr:9, t:0, s:'done', gen:1},
    {c:'99-101', n:'Computing @ Carnegie Mellon', cr:3, t:0, s:'done', gen:1},
    {c:'15-122', n:'Principles of Imperative Computation', cr:12, t:1, s:'done', tier:1, req:['15-112'], anti:[]},
    {c:'21-122', n:'Integration and Approximation', cr:10, t:1, s:'done', tier:1, req:['21-120'], anti:[]},
    {c:'15-128', n:'Freshman Immigration Course', cr:3, t:1, s:'done', gen:1},
    {c:'79-104', n:'Global Histories', cr:9, t:1, s:'done', gen:1},
    {c:'15-150', n:'Principles of Functional Programming', cr:12, t:2, s:'done', tier:2, req:['15-122'], anti:[]},
    {c:'21-127', n:'Concepts of Mathematics', cr:12, t:2, s:'done', tier:1, req:[], anti:['15-151']},
    {c:'33-121', n:'Physics I for Science Students', cr:12, t:2, s:'done', gen:1},
    {c:'15-213', n:'Introduction to Computer Systems', cr:12, t:3, s:'current', tier:2, req:['15-122'], anti:[]},
    {c:'15-210', n:'Parallel and Sequential Data Structures and Algorithms', cr:12, t:3, s:'current', tier:3, req:['15-150','15-122'], anti:[]},
    {c:'76-270', n:'Writing for the Professions', cr:9, t:3, s:'current', gen:1},
    {c:'15-251', n:'Great Ideas in Theoretical Computer Science', cr:12, t:4, s:'todo', tier:3, req:['15-122','21-127'], anti:[], key:1},
    {c:'21-241', n:'Matrices and Linear Transformations', cr:11, t:4, s:'plan', tier:2, req:['21-122'], anti:[]},
    {c:'09-105', n:'Introduction to Modern Chemistry I', cr:10, t:4, s:'plan', gen:1},
    {c:'15-451', n:'Algorithm Design and Analysis', cr:12, t:4, s:'blocked', ghost:1, note:'DEFERRED — NEEDS 15-251 FIRST'},
    {c:'15-451', n:'Algorithm Design and Analysis', cr:12, t:5, s:'plan', tier:4, req:['15-210','15-251'], anti:[]},
    {c:'15-259', n:'Probability and Computing', cr:12, t:5, s:'plan', tier:3, req:['21-127'], anti:['36-218']},
    {c:'73-102', n:'Principles of Microeconomics', cr:9, t:5, s:'plan', gen:1},
    {c:'15-410', n:'Operating System Design and Implementation', cr:15, t:6, s:'plan', tier:4, req:['15-213','15-210'], anti:[]},
    {c:'10-315', n:'Introduction to Machine Learning (SCS majors)', cr:12, t:6, s:'plan', tier:4, req:['21-241','15-259'], anti:[]},
    {c:'76-271', n:'Minor Elective', cr:9, t:6, s:'plan', gen:1},
    {c:'15-411', n:'Compiler Design', cr:15, t:7, s:'plan', tier:4, req:['15-213','15-210'], anti:[]},
    {c:'15-455', n:'Undergraduate Complexity Theory', cr:12, t:7, s:'plan', tier:4, req:['15-251'], anti:[]},
    {c:'15-462', n:'Computer Graphics', cr:12, t:7, s:'plan', tier:4, req:['15-213'], anti:[]},
    {c:'15-151', n:'Mathematical Foundations for Computer Science', cr:12, t:-1, s:'alt', tier:1, req:[], anti:['21-127'], alt:1},
    {c:'36-218', n:'Probability Theory for Computer Scientists', cr:9, t:-1, s:'alt', tier:3, req:['21-122'], anti:['15-259'], alt:1}
  ]
""",
    """\
  COURSES: [
    {c:'CS 110', n:'Intro to Programming', cr:4, t:0, s:'done', tier:0, req:[], anti:[]},
    {c:'MATH 151', n:'Calculus I', cr:4, t:0, s:'done', tier:0, req:[], anti:[]},
    {c:'ENGL 101', n:'Writing & Rhetoric', cr:3, t:0, s:'done', gen:1},
    {c:'HIST 120', n:'World History', cr:3, t:0, s:'done', gen:1},
    {c:'CS 120', n:'Object-Oriented Design', cr:4, t:1, s:'done', tier:1, req:['CS 110'], anti:[]},
    {c:'CS 230', n:'Computer Systems', cr:4, t:1, s:'done', tier:2, req:['CS 120'], anti:[]},
    {c:'COMM 110', n:'Public Speaking', cr:3, t:1, s:'done', gen:1},
    {c:'ART 105', n:'Visual Culture', cr:3, t:1, s:'done', gen:1},
    {c:'CS 235', n:'Intro to Data Science', cr:4, t:2, s:'done', tier:2, req:['CS 120'], anti:[]},
    {c:'PHIL 210', n:'Ethics & Technology', cr:3, t:2, s:'done', gen:1},
    {c:'ECON 101', n:'Microeconomics', cr:3, t:2, s:'done', gen:1},
    {c:'SPAN 101', n:'Elementary Spanish', cr:4, t:2, s:'done', gen:1},
    {c:'CS 210', n:'Data Structures & Algorithms', cr:4, t:3, s:'current', tier:2, req:['MATH 152'], anti:[]},
    {c:'MATH 152', n:'Calculus II', cr:4, t:3, s:'current', tier:1, req:['MATH 151'], anti:[], key:1},
    {c:'PHYS 141', n:'Mechanics', cr:4, t:3, s:'current', gen:1},
    {c:'ENGL 220', n:'Writing', cr:3, t:3, s:'current', gen:1},
    {c:'PSY 10', n:'Intro to Psych', cr:3, t:3, s:'current', gen:1},
    {c:'MATH 240', n:'Discrete Mathematics', cr:3, t:4, s:'plan', tier:2, req:['MATH 152'], anti:[]},
    {c:'MATH 260', n:'Linear Algebra', cr:3, t:4, s:'plan', tier:2, req:['MATH 152'], anti:[]},
    {c:'STAT 210', n:'Introductory Statistics', cr:3, t:4, s:'plan', tier:2, req:[], anti:['STAT 250']},
    {c:'WRIT 200', n:'Technical Writing', cr:3, t:4, s:'plan', gen:1},
    {c:'CS 310', n:'Algorithms', cr:4, t:5, s:'plan', tier:3, req:['CS 210'], anti:[]},
    {c:'STAT 250', n:'Probability & Statistics', cr:3, t:5, s:'plan', tier:2, req:['MATH 152'], anti:['STAT 210']},
    {c:'CS 320', n:'Databases', cr:3, t:5, s:'plan', tier:3, req:['CS 210'], anti:[]},
    {c:'LING 200', n:'Language & Mind', cr:3, t:5, s:'plan', gen:1},
    {c:'CS 330', n:'Operating Systems', cr:4, t:6, s:'plan', tier:3, req:['CS 230'], anti:[]},
    {c:'CS 340', n:'Software Engineering', cr:4, t:6, s:'plan', tier:3, req:['CS 210'], anti:[]},
    {c:'CS 245', n:'Human–Computer Interaction', cr:3, t:6, s:'plan', tier:3, req:[], anti:[]},
    {c:'BIOL 105', n:'Human Biology & Lab', cr:4, t:6, s:'plan', gen:1},
    {c:'CS 425', n:'Distributed Systems', cr:3, t:6, s:'plan', tier:4, req:[], anti:[]},
    {c:'CS 360', n:'Machine Learning', cr:3, t:7, s:'plan', tier:4, req:['CS 310','STAT 250'], anti:['DATA 340']},
    {c:'SOC 101', n:'Sociology', cr:3, t:7, s:'plan', gen:1},
    {c:'ASTR 110', n:'Astronomy & Lab', cr:4, t:7, s:'plan', gen:1},
    {c:'CS 450', n:'Senior Capstone', cr:4, t:8, s:'plan', tier:4, req:['CS 340'], anti:[]},
    {c:'CS 380', n:'Deep Learning Lab', cr:3, t:8, s:'plan', tier:4, req:[], anti:[]},
    {c:'DATA 340', n:'Applied Machine Learning', cr:3, t:-1, s:'alt', tier:4, req:[], anti:['CS 360'], alt:1}
  ]
""",
    "cmu-cs roster copied off the board",
)


# The one line that was finding #5. Everything above is inert until the app
# reads it.
patch(
    "state = { school: 'nyu-cs', screen: null,",
    "state = { school: 'cmu-cs', screen: null,",
    "the planner opens on the CMU degree",
)


# The program picker is built from Object.entries(SCHOOLS), so it offered seven
# NYU degrees to a student who signed in at CMU. One filter, read by both the
# sidebar select and the Course map select.
patch(
    """\
  get TIERS()   { return this.SCHOOLS[this.state.school].TIERS; }
""",
    """\
  get TIERS()   { return this.SCHOOLS[this.state.school].TIERS; }
  // The picker offers only what the login screen offers, which is CMU. The
  // seven NYU programs stay in SCHOOLS as unreachable sample data rather than
  // being cut out of the upstream bundle.
  get SCHOOL_OPTS() { return Object.entries(this.SCHOOLS).filter(([k]) => k.startsWith('cmu-')); }
""",
    "one filter for the program picker",
)

patch(
    "      schoolOpts: Object.entries(this.SCHOOLS).map(([k, v]) =>",
    "      schoolOpts: this.SCHOOL_OPTS.map(([k, v]) =>",
    "flat picker list is CMU only",
)

patch(
    "      schoolGroups: Object.entries(this.SCHOOLS).reduce((acc, [k, v]) => {",
    "      schoolGroups: this.SCHOOL_OPTS.reduce((acc, [k, v]) => {",
    "grouped picker list is CMU only",
)


# The Gantt divides its track into a hard-coded eight columns. There are nine
# terms now, so every bar sat a ninth too far right and the last term fell off
# the end. Take the count from the same data that draws the header row.
patch(
    "    const colW = 100 / 8;",
    "    const colW = 100 / this.TERMS.length;",
    "gantt columns follow the term count",
)


# The catch-up paths all move CS 210, not Calculus II — which is a course you
# are halfway through and cannot reschedule.
patch(
    "Three ways to clear {{ META.keyName }}. Pick one to see it on the board.",
    "Three ways to clear the CS 210 prerequisite. Pick one to see it on the board.",
    "the paths clear the course that can move",
)


# The 18-credit term is Spring 2028, and it carries four CS courses — one of
# them the Distributed Systems the board's own issue offers to move.
patch(
    """\
<div style="flex:1"><span style="font-size:14px;font-weight:500">Fall 2027 is an 18-credit term with four 300-level CS courses.</span> <span style="font-size:13.5px;color:#5C554A">That's the pressure point in this draft — a consequence of Data Structures starting a year late. Two of the three catch-up paths remove it.</span></div>
""",
    """\
<div style="flex:1"><span style="font-size:14px;font-weight:500">Spring 2028 is an 18-credit term with four CS courses.</span> <span style="font-size:13.5px;color:#5C554A">That's the pressure point in this draft, and Distributed Systems is the one that can move out of it. Two of the three catch-up paths remove it.</span></div>
""",
    "the overloaded term is Spring 2028",
)


# STAT 210 is a Spring 2027 draft, not something you are sitting in.
patch(
    """\
<p style="margin:0 0 12px;font-size:13px;color:#5C554A;text-wrap:pretty">You're enrolled in STAT 210 this term, but the CS BS requires STAT 250 — and the catalog grants credit for only one of the two. STAT 250 is the one that feeds CS 360.</p>
""",
    """\
<p style="margin:0 0 12px;font-size:13px;color:#5C554A;text-wrap:pretty">STAT 210 sits in your Spring 2027 draft, but the CS BS requires STAT 250 — and the catalog grants credit for only one of the two. STAT 250 is the one that feeds CS 360.</p>
""",
    "STAT 210 is a draft, not this term",
)


# The gen-ed note counted ten University Core courses that no longer exist. The
# humanities bar directly above it now reads 7 of 12, with two more in progress.
patch(
    """\
<div style="font-size:14.5px;font-weight:500;margin-bottom:7px">Your gen-ed load is nearly done</div>
<p style="margin:0 0 12px;font-size:13px;color:#5C554A;text-wrap:pretty">Six of ten University Core courses are finished, which means junior and senior year can be almost entirely major work. That's the flexibility that makes a summer bridge or a heavier fall realistic.</p>
""",
    """\
<div style="font-size:14.5px;font-weight:500;margin-bottom:7px">Most of your gen-eds are behind you</div>
<p style="margin:0 0 12px;font-size:13px;color:#5C554A;text-wrap:pretty">Seven of the twelve humanities and social science courses are finished and two more are in progress, which means junior and senior year can be almost entirely major work. That's the flexibility that makes a summer bridge or a heavier fall realistic.</p>
""",
    "the gen-ed note counts the new roster",
)


# ============================================================================
# 13. the semester block is an object you can edit, not a picture of one
# ============================================================================
# Six things were wrong with the block, and they share one root: the board was
# a rendering of a fixed list. Adding a term turned the add control into a
# remove control (so you could add exactly one), there was no way to remove a
# block that was not the one you had just added, nothing on the board could be
# moved, and the prerequisite error was a `flag:'error'` baked into the data —
# which meant it said the same thing no matter where the courses actually sat.
#
# The fix is one idea applied six times: the board is BASE_BOARD plus a stack
# of user edits, and everything derived from the board (the arrows, the pill
# colours, the term's issue list) is recomputed from the result. The edits are
# `ins` (semesters added), `dels` (removed), `order` (the block order),
# `moves` (a course's term), `rename` (a block's semester) and `adds` (courses
# from the finder). All six persist.

# The remove control lives on the block's right edge, and PADR is the only
# space there is on that edge — 16px is not enough for a 22px button without
# it landing on the last course pill. 38 = 16 + 22, so the pills keep their
# old clearance and the button sits in the space that opens up. PW is derived
# from PADR, so the pills give the width back rather than the stack growing.
patch(
    "const COLS = 5, META = 160, PADR = 16, CG = 18, PH = 66, RG = 14, "
    "PADT = 18, PADB = 18, GAPB = 58, MH0 = 113, MHB = 32;",
    "const COLS = 5, META = 160, PADR = 38, CG = 18, PH = 66, RG = 14, "
    "PADT = 18, PADB = 18, GAPB = 58, MH0 = 113, MHB = 32;",
    "right gutter for the remove button",
)

# The broken edge stops being a property of the data. MATH 152 -> CS 210 is
# drawn dashed and red because of where the two courses are *now*; recheck()
# below owns `kind` and `col` for every non-anti edge, and it re-derives them
# on every rebuild from a fresh copy of BASE_EDGES. #5A7355 is the colour
# buildPlan already restored to this edge whenever a catch-up path fixed it.
patch(
    "{ f:'MATH 152', t:'CS 210',   col:'#B4552F', kind:'broken' },",
    "{ f:'MATH 152', t:'CS 210',   col:'#5A7355' },",
    "the broken edge is derived, not declared",
)

# The course-detail panel had the same defect in a second place: DETAIL['CS 210']
# spells its prerequisite rows out by hand, so the panel went on saying
# "same term — not satisfied" after the course had been dragged clear of the
# clash. detailFor already knows how to compute those rows against the current
# board (that branch runs for every other course); DETAIL becomes the fallback
# for a course the roster has no requirements for, rather than an override.
patch(
    "    const req = cur ? cur.req : reqs.map(r => {",
    "    const req = reqs.length ? reqs.map(r => {",
    "the panel computes its prerequisite rows",
)

patch(
    "      return [r, `planned for ${this.BOARD[rt].term}`, 'good'];\n"
    "    });",
    "      return [r, `planned for ${this.BOARD[rt].term}`, 'good'];\n"
    "    }) : (cur ? cur.req : []);",
    "DETAIL is the fallback for a course with no roster requirements",
)

# CS 210's roster row listed only MATH 152, because the hand-written DETAIL
# entry was carrying CS 120. Now that the rows are computed, the roster has to
# hold both or the panel loses a row it has always shown. CS 120 is tier 1 and
# CS 210 tier 2, so the dependency graph gains an edge that points left, which
# is the direction every other edge in it already points.
patch(
    "{c:'CS 210', n:'Data Structures & Algorithms', cr:4, t:3, s:'current', "
    "tier:2, req:['MATH 152'], anti:[]},",
    "{c:'CS 210', n:'Data Structures & Algorithms', cr:4, t:3, s:'current', "
    "tier:2, req:['CS 120','MATH 152'], anti:[]},",
    "CS 210 sits behind CS 120 as well",
)

# ---- the edit stack, the validity pass, and the board they produce ----------
# recheck() is the acceptance test made executable. It knows nothing about
# which course was "the" broken one: it indexes every course by the *position*
# of the block it is in and calls an edge broken when its target is not
# strictly after its source. So dragging a block two later breaks every
# dependant that used to sit behind it, and dragging it back clears them —
# without either case being written down anywhere.
#
# It owns three things, which is what keeps them consistent with each other:
# the edge's `kind`/`col` (dashed red vs. its own colour), the pill's
# `flag:'error'`, and the term's `prereq` issue — which is what draws the
# "CS 210 blocked" button on the block and fills the panel's red banner.
#
# The one baked issue in BASE_BOARD is kept rather than regenerated *while its
# violation is still the one it describes* — every prerequisite named by it is
# in the same term as the course, which is the situation its prose describes.
# The moment that stops being true the generated row replaces it, so the copy
# on screen can never contradict the board.
patch(
    "  applyEdits(plan) {\n"
    "    const ins = Array.isArray(this.state.ins) ? this.state.ins : [];\n"
    "    const adds = Array.isArray(this.state.adds) ? this.state.adds : [];\n"
    "    if (!ins.length && !adds.length) return plan;\n"
    "    const board = plan.board.map(t => ({ ...t, courses: t.courses.map(c => ({ ...c })), "
    "issues: (t.issues || []).map(i => ({ ...i })) }));\n"
    "    ins.forEach(t => {\n"
    "      const at = board.findIndex(b => b.k === t.after);\n"
    "      if (at < 0 || board.some(b => b.k === t.k)) return;\n"
    "      board.splice(at + 1, 0, { ...t, courses: [], issues: [] });\n"
    "    });\n"
    "    const seen = new Set(board.reduce((a, t) => a.concat(t.courses.map(c => c.c)), []));\n"
    "    adds.forEach(a => {\n"
    "      const t = board.find(b => b.k === a.k);\n"
    "      if (!t || seen.has(a.c)) return;\n"
    "      seen.add(a.c);\n"
    "      t.courses.push({ c:a.c, n:a.n, cr:a.cr, col:99, row:99 });\n"
    "    });\n"
    "    return { board, edges: plan.edges };\n"
    "  }\n"
    "\n"
    "  plan() {\n"
    "    const k = this.activeKey();\n"
    "    const memo = k + '|' + JSON.stringify(this.state.ins || null) + '|' + "
    "JSON.stringify(this.state.adds || null);\n"
    "    if (this._pk !== memo || !this._plan) { this._pk = memo; "
    "this._plan = this.applyEdits(this.buildPlan(k)); }\n"
    "    return this._plan;\n"
    "  }",
    r"""  // The six edit lists, normalised in one place so every reader — applyEdits,
  // the memo key, the drop handlers, the block controls — sees the same shapes
  // and a hand-edited storage blob cannot make any of them throw.
  edits() {
    const s = this.state, O = v => (!!v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    const A = v => Array.isArray(v) ? v : [];
    return { ins: A(s.ins), adds: A(s.adds), order: A(s.order), dels: A(s.dels),
      moves: O(s.moves), rename: O(s.rename) };
  }

  // Prerequisite validity is a function of the current term ordering and of
  // nothing else. A course is broken when something it requires shares its
  // term or comes after it, so this is what has to run again after every move.
  recheck(board, edges) {
    const at = {}, done = board.map(t => t.st === 'done');
    board.forEach((t, i) => t.courses.forEach(c => { at[c.c] = i; }));
    const bad = {};
    edges.forEach(e => {
      if (e.kind === 'anti') return;
      const a = at[e.f], z = at[e.t];
      // A finished term is a transcript, not a plan. CS 120 and CS 230 share
      // Fall 2025 and the registrar allowed it; re-litigating a term the
      // student has already passed would be an error nobody can act on.
      if (a !== undefined && z !== undefined && z <= a && !done[z]) {
        (bad[e.t] = bad[e.t] || []).push(e.f);
        e.kind = 'broken'; e.col = '#B4552F';
      } else if (e.kind === 'broken') delete e.kind;
    });
    board.forEach(t => {
      const here = c => t.courses.some(x => x.c === c);
      t.courses.forEach(c => {
        if (bad[c.c]) c.flag = 'error';
        else if (c.flag === 'error') delete c.flag;
      });
      const keep = (t.issues || []).filter(is => is.k !== 'prereq' ||
        (bad[is.course] && here(is.course) && bad[is.course].every(f => at[f] === at[is.course])));
      Object.keys(bad).forEach(code => {
        if (!here(code) || keep.some(is => is.k === 'prereq' && is.course === code)) return;
        const m = bad[code], same = m.filter(f => at[f] === at[code]);
        keep.push({ k:'prereq', course:code,
          t: `${code} is scheduled before ${m.join(' and ')}, not after`,
          d: `${m.join(' and ')} ${m.length > 1 ? 'are' : 'is'} ${same.length === m.length
            ? 'in this same term'
            : 'no earlier than this term'}, so nothing on your transcript satisfies ` +
            `${code} when ${t.term} begins. Move ${code} later, or move ` +
            `${m.join(' and ')} earlier.`,
          fix: `Move ${code} after ${m.join(' and ')}` });
      });
      t.issues = keep;
    });
  }

  // The edit stack, applied in the order a student would describe it: add the
  // semesters, put the blocks where they were dragged, take out the deleted
  // ones, move the courses, add the catalog courses, name the semesters — then
  // recheck the whole thing. Every step is written so that an edit naming
  // something this plan does not have is skipped rather than destructive: a
  // catch-up path can remove a course or a term from under any of them, and
  // reverting the path has to bring the student's edits back intact.
  applyEdits(plan) {
    const E = this.edits();
    const board = plan.board.map(t => ({ ...t, courses: t.courses.map(c => ({ ...c })),
      issues: (t.issues || []).map(i => ({ ...i })) }));
    const edges = plan.edges.map(e => ({ ...e }));

    E.ins.forEach(t => {
      const at = board.findIndex(b => b.k === t.after);
      if (at < 0 || board.some(b => b.k === t.k)) return;
      board.splice(at + 1, 0, { ...t, courses: [], issues: [] });
    });

    // The saved order is reconciled rather than trusted: keys this plan does
    // not have are dropped, and a block the order never mentioned keeps its
    // natural position instead of falling to the end of the plan.
    const keys = board.map(b => b.k);
    const ord = E.order.filter((k, i) => keys.indexOf(k) >= 0 && E.order.indexOf(k) === i);
    keys.forEach((k, i) => { if (ord.indexOf(k) < 0) ord.splice(Math.min(i, ord.length), 0, k); });
    let out = ord.map(k => board[keys.indexOf(k)]);

    // A deleted semester does not take its courses with it — they move to the
    // neighbouring block, so the plan still totals the credits it did before.
    E.dels.forEach(k => {
      const i = out.findIndex(b => b.k === k);
      if (i < 0 || out.length < 2) return;
      const host = out[i + 1] || out[i - 1];
      host.courses = host.courses.concat(out[i].courses);
      host.issues = host.issues.concat(out[i].issues);
      out.splice(i, 1);
    });

    const live = {}; out.forEach(b => { live[b.k] = b; });
    out.forEach(b => {
      b.courses = b.courses.filter(c => {
        const k = E.moves[c.c];
        if (!k || k === b.k || !live[k]) return true;
        live[k].courses.push(c);
        return false;
      });
    });

    const seen = new Set(out.reduce((a, t) => a.concat(t.courses.map(c => c.c)), []));
    E.adds.forEach(a => {
      const t = live[E.moves[a.c] && live[E.moves[a.c]] ? E.moves[a.c] : a.k];
      if (!t || seen.has(a.c)) return;
      seen.add(a.c);
      t.courses.push({ c:a.c, n:a.n, cr:a.cr, col:99, row:99 });
    });

    // The term a block names is the student's to change; the number in front
    // of it is not. "Semester 6" has to mean the sixth block after an insert,
    // a delete or a drag, so the count is re-derived from the position rather
    // than carried along with the block.
    out = out.map((b, i) => {
      const r = E.rename[b.k], term = typeof r === 'string' && r ? r : b.term;
      const sem = `Semester ${i + 1}`;
      return { ...b, term, sem, l: `${sem} · ${term}` };
    });

    this.recheck(out, edges);
    return { board: out, edges };
  }

  plan() {
    const E = this.edits();
    const memo = this.activeKey() + '|' +
      JSON.stringify([E.ins, E.adds, E.order, E.dels, E.moves, E.rename]);
    if (this._pk !== memo || !this._plan) { this._pk = memo; this._plan = this.applyEdits(this.buildPlan(this.activeKey())); }
    return this._plan;
  }""",
    "edit stack + prerequisite recheck",
)

# ---- dragging ---------------------------------------------------------------
# Pointer events rather than the HTML5 drag-and-drop API. Three reasons, in
# order of weight: HTML5 dnd does not fire on touch at all; it needs a drop
# target listening on every candidate, where the board already knows every
# block's `top` and `h` from the geometry pass and can answer "what is under
# this y" with arithmetic; and a synthetic pointer sequence is a real drag,
# which means this is testable.
#
# _geo is that geometry, republished on every render of the board. The
# listeners go on `window` in capture, not on the element, because the pointer
# leaves the element it started on immediately and pointer capture on a
# synthesised pointerId is not reliable. A press that never moves 5px is not a
# drag: it falls through to the element's own click, which is what keeps a
# course pill selectable and the block background clearing the selection.
patch(
    "  readSaved() {",
    r"""  // Which block is under this y, in stack coordinates. A course lands in the
  // nearest block so a drop in the gap between two blocks still means
  // something; a block lands in a gap, so the answer is an index in 0..n.
  dropAt(kind, y) {
    const g = this._geo || [];
    if (!g.length) return null;
    if (kind === 'course') {
      let best = 0, bd = Infinity;
      g.forEach((b, i) => {
        const d = y < b.top ? b.top - y : y > b.top + b.h ? y - b.top - b.h : 0;
        if (d < bd) { bd = d; best = i; }
      });
      return g[best].k;
    }
    const at = g.findIndex(b => y < b.top + b.h / 2);
    return at < 0 ? g.length : at;
  }

  startDrag(kind, id, e) {
    if (e.button != null && e.button !== 0) return;
    const wrap = document.getElementById('board-stack');
    if (!wrap) return;
    const st = { x0: e.clientX, y0: e.clientY, top: wrap.getBoundingClientRect().top, moved: false };
    const move = ev => {
      if (!st.moved && Math.abs(ev.clientY - st.y0) + Math.abs(ev.clientX - st.x0) < 5) return;
      st.moved = true;
      if (ev.cancelable) ev.preventDefault();
      const at = this.dropAt(kind, ev.clientY - st.top);
      const d = this.state.drag;
      if (!d || d.kind !== kind || d.id !== id || d.at !== at) this.setState({ drag: { kind, id, at } });
    };
    const up = ev => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (!st.moved) { if (this.state.drag) this.setState({ drag:null }); return; }
      this._noClick = Date.now();
      this.drop(kind, id, this.dropAt(kind, ev.clientY - st.top));
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  }

  // A drag ends as a click on whatever was under the pointer, and that click
  // would select the course it just moved or clear the selection behind it.
  swallowClick() { return Date.now() - (this._noClick || 0) < 350; }

  drop(kind, id, at) {
    if (at == null) { this.setState({ drag:null }); return; }
    if (kind === 'course') {
      const host = this.BOARD.find(t => t.courses.some(c => c.c === id));
      if (!host || host.k === at) { this.setState({ drag:null }); return; }
      this.setState({ drag:null, menu:null, moves: { ...this.edits().moves, [id]: at } });
      return;
    }
    const ord = this.BOARD.map(b => b.k), from = ord.indexOf(id);
    const to = at > from ? at - 1 : at;
    if (from < 0 || to === from) { this.setState({ drag:null }); return; }
    const next = ord.slice();
    next.splice(from, 1);
    next.splice(to, 0, id);
    this.setState({ drag:null, menu:null, order: next });
  }

  readSaved() {""",
    "pointer drag + drop resolution",
)

# The semester menu closes the way the finder does — on a press anywhere that
# is not the menu or the two controls that open it.
patch(
    "  onDocDown = e => {\n"
    "    if (this.state.search && !e.target.closest('[data-search=\"1\"]')) "
    "this.setState({ search:false });\n"
    "  };",
    "  onDocDown = e => {\n"
    "    if (this.state.search && !e.target.closest('[data-search=\"1\"]')) "
    "this.setState({ search:false });\n"
    "    if (this.state.menu && !e.target.closest('[data-menu=\"1\"]')) "
    "this.setState({ menu:null });\n"
    "  };",
    "a press outside closes the semester menu",
)

# Escape unwinds the same stack it always did, with the menu on top of it: it
# is the newest and shallowest thing on screen.
patch(
    "    if (e.key !== 'Escape') return;\n"
    "    if (this.state.search) this.setState({ search:false, q:'' });",
    "    if (e.key !== 'Escape') return;\n"
    "    if (this.state.menu) this.setState({ menu:null });\n"
    "    else if (this.state.search) this.setState({ search:false, q:'' });",
    "escape closes the semester menu first",
)

# Four more keys over the wire, validated the way the first eight are. `order`
# and `dels` are lists of block keys and `moves`/`rename` are maps of string to
# string, so each is checked to the leaf — a blob that fails is dropped whole
# rather than reaching applyEdits, which trusts what it is given.
patch(
    "      ins: v => Array.isArray(v),\n"
    "      adds: v => Array.isArray(v)\n"
    "    };",
    "      ins: v => Array.isArray(v),\n"
    "      adds: v => Array.isArray(v),\n"
    "      order: v => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length > 0),\n"
    "      dels: v => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length > 0),\n"
    "      moves: v => !!v && typeof v === 'object' && !Array.isArray(v) && "
    "Object.keys(v).every(x => typeof v[x] === 'string' && v[x].length > 0),\n"
    "      rename: v => !!v && typeof v === 'object' && !Array.isArray(v) && "
    "Object.keys(v).every(x => typeof v[x] === 'string' && v[x].length > 0)\n"
    "    };",
    "block order, deletions, course moves and renames are restorable",
)

patch(
    "      ['sel', 'pathApplied', 'tl', 'map', 'rail', 'wide', 'ins', 'adds'].forEach(k => {",
    "      ['sel', 'pathApplied', 'tl', 'map', 'rail', 'wide', 'ins', 'adds', "
    "'order', 'dels', 'moves', 'rename'].forEach(k => {",
    "the four new keys are saved",
)

# ---- the block's own controls ----------------------------------------------
# The insert helpers are rewritten rather than extended, because two of the
# three things they did were the defects.
#
# `nextTerm` walked the seasonal cycle Spring -> Summer -> Fall -> Winter and
# then skipped forward past any name already on the board, so inserting under
# Fall 2026 offered "Summer 2027" — the next *unused* name rather than the next
# semester. The cycle that matters to a student is the academic one, Spring ->
# Fall -> Spring, and a duplicate name is now a legitimate thing to have on the
# board for as long as it takes to rename it, so the skip goes.
#
# `isIns`/`dropIns` are gone with the toggle they served. The add control adds,
# every time; removing a semester is the button on that semester's own edge.
# An added block writes its key straight into the display order, because the
# order is what the board is drawn from — an insert that only wrote `ins` would
# land wherever the pre-drag board had put its neighbour.
patch(
    "    const insList = Array.isArray(this.state.ins) ? this.state.ins : [];\n"
    "    const addList = Array.isArray(this.state.adds) ? this.state.adds : [];\n"
    "    const isIns = t => !!t && insList.some(x => x.k === t.k);\n"
    "    const termNames = new Set(this.BOARD.map(t => t.term));\n"
    "    const SEAS = { Spring:['Summer', 0], Fall:['Winter', 1], Summer:['Fall', 0], "
    "Winter:['Spring', 0] };\n"
    "    const nextTerm = term => {\n"
    "      const m = /^([A-Za-z]+) (\\d{4})$/.exec(term || '');\n"
    "      if (!m || !SEAS[m[1]]) return { sem:'Extra', term:'an extra term' };\n"
    "      let s = m[1], y = +m[2];\n"
    "      for (let n = 0; n < 4; n++) {\n"
    "        const step = SEAS[s]; if (!step) break;\n"
    "        s = step[0]; y += step[1];\n"
    "        if (!termNames.has(s + ' ' + y)) break;\n"
    "      }\n"
    "      return { sem:s, term: s + ' ' + y };\n"
    "    };\n"
    "    const addIns = b => { const n = nextTerm(b.term); this.setState({ ins: [...insList,\n"
    "      { after:b.k, k:'INS-' + b.k, yr:b.yr, sem:n.sem, term:n.term, "
    "l:n.sem + ' · ' + n.term,\n"
    "        tag:'ADDED BY YOU', st:'plan', courses:[], issues:[] }] }); };\n"
    "    const dropIns = k => this.setState({ ins: insList.filter(x => x.k !== k) });\n",
    r"""    const insList = Array.isArray(this.state.ins) ? this.state.ins : [];
    const addList = Array.isArray(this.state.adds) ? this.state.adds : [];
    const ED = this.edits();
    const drag = this.state.drag || null;
    const menuK = this.state.menu || null;
    // The academic cycle, not the calendar one: the semester after Fall 2026 is
    // Spring 2027, which is what a semester inserted under it should default to.
    const SEAS = { Spring:['Fall', 0], Fall:['Spring', 1], Summer:['Fall', 0], Winter:['Spring', 0] };
    const nextTerm = term => {
      const m = /^([A-Za-z]+) (\d{4})$/.exec(term || '');
      if (!m || !SEAS[m[1]]) return { sem:'Extra', term:'an extra term' };
      const s = SEAS[m[1]];
      return { sem:s[0], term: s[0] + ' ' + (+m[2] + s[1]) };
    };
    const addIns = (b, i) => {
      const n = nextTerm(b.term);
      const key = 'INS-' + Date.now().toString(36) + '-' + insList.length;
      const ord = this.BOARD.map(x => x.k);
      ord.splice(i + 1, 0, key);
      this.setState({ menu:null, order: ord, ins: [...insList,
        { after:b.k, k:key, yr:b.yr, sem:n.sem, term:n.term, l:n.sem + ' · ' + n.term,
          tag:'ADDED BY YOU', st:'plan', courses:[], issues:[] }] });
    };
    // Removing a semester the student added is an undo of the insert; removing
    // one that came with the plan is an edit that has to be remembered. Both
    // reach here from the same button, on the block's own right edge.
    const removeBlock = b => this.setState({ menu:null, drag:null,
      ins: insList.filter(x => x.k !== b.k),
      dels: insList.some(x => x.k === b.k)
        ? ED.dels.filter(x => x !== b.k)
        : (ED.dels.indexOf(b.k) < 0 ? [...ED.dels, b.k] : ED.dels) });
    const renameBlock = (b, term) => this.setState({ menu:null,
      rename: { ...ED.rename, [b.k]: term } });
    // What the semester menu offers: every term in the span the plan covers,
    // plus the year after it, so a block dragged past graduation has somewhere
    // to be renamed to. Summer and Winter are in the list because the add
    // control can put a block anywhere and those are the two a student is
    // most likely to want next.
    const spanYrs = this.BOARD.map(t => { const m = /(\d{4})$/.exec(t.term || ''); return m ? +m[1] : 0; })
      .filter(Boolean);
    const yLo = spanYrs.length ? Math.min(...spanYrs) : 2025;
    const yHi = spanYrs.length ? Math.max(...spanYrs) : 2029;
    const TERM_OPTS = [];
    for (let y = yLo; y <= yHi + 1; y++) ['Spring', 'Summer', 'Fall', 'Winter'].forEach(s => TERM_OPTS.push(s + ' ' + y));
""",
    "insert, remove and rename helpers",
)

# The geometry pass is where the drop targets come from, so it publishes them.
# boxH is the block without its expanded warning panel, which is what the
# remove button centres on — otherwise opening a term's issues would slide the
# button down past the courses it belongs to.
patch(
    "      blocks.push({ ...tm, top:y, h, cr, rows, open, iss, blk, "
    "warnTop: PADT + yOff + coursesH + 12 });",
    "      blocks.push({ ...tm, top:y, h, boxH, cr, rows, open, iss, blk, "
    "warnTop: PADT + yOff + coursesH + 12 });",
    "the block remembers its box height",
)

patch(
    "    const stackH = y;",
    "    const stackH = y;\n"
    "    // republished every render: dropAt() answers \"what is under this y\" from it\n"
    "    this._geo = blocks.map(b => ({ k:b.k, top:b.top, h:b.h }));",
    "the drop geometry is published for the drag handlers",
)

# The block gains four states it did not have: being dragged, being the block
# a course is about to land in, carrying a remove button, and carrying an open
# menu. `hot` and `dragging` are read by blockStyle below.
patch(
    "      const bk = b.blk[0] || null;\n"
    "      return { ...b,\n"
    "        expand: () => this.setState({ expand: b.k }),",
    r"""      const bk = b.blk[0] || null;
      const dragging = !!drag && drag.kind === 'block' && drag.id === b.k;
      const hot = !!drag && drag.kind === 'course' && drag.at === b.k;
      return { ...b,
        expand: () => this.setState({ expand: b.k, menu:null }),
        grab: e => this.startDrag('block', b.k, e),
        rmStyle: `position:absolute;left:${STACK_W - 30}px;top:${b.top + b.boxH / 2 - 11}px;width:22px;height:22px;border-radius:6px;z-index:7;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;background:#FDFBF6;border:1px solid #E4DED0;color:#A9A192`,
        remove: () => removeBlock(b),
        menuOpen: menuK === b.k,
        openMenu: () => this.setState({ menu: menuK === b.k ? null : b.k }),
        menuStyle: `position:absolute;left:16px;top:${Math.min(b.top + PADT + 44, Math.max(0, stackH - 272))}px;width:198px;max-height:264px;overflow-y:auto;z-index:40;background:#FDFBF6;border:1px solid #E4DED0;border-radius:9px;box-shadow:0 16px 38px rgba(27,25,22,0.18);padding:7px`,
        menuItems: TERM_OPTS.filter(t => t !== b.term).map(t => ({ t,
          style:'display:block;width:100%;text-align:left;font-size:12px;color:#3A362F;padding:6px 8px;border-radius:6px;white-space:nowrap',
          click: () => renameBlock(b, t) })),
        delStyle: 'display:block;width:100%;text-align:left;font-size:12px;font-weight:500;color:#8C3A1E;padding:6px 8px;border-radius:6px;white-space:nowrap',""",
    "block drag, remove and menu values",
)

# The background div is the drag surface — it is the one element that covers the
# whole block and sits under the pills, the meta column and the warning panel,
# so a press anywhere the student is not already pressing something starts the
# drag. touch-action:none is what stops the browser scrolling instead.
patch(
    "        blockStyle: `position:absolute;left:0;top:${b.top}px;width:${STACK_W}px;"
    "height:${b.h}px;border-radius:11px;background:${active ? '#FBF3E9' : "
    "b.st === 'done' ? '#FAF8F1' : '#FDFBF6'};border:1px solid "
    "${active ? '#DFC2AC' : '#E7E1D4'}`,",
    "        blockStyle: `position:absolute;left:0;top:${b.top}px;width:${STACK_W}px;"
    "height:${b.h}px;border-radius:11px;background:${hot ? '#F7EFE4' : active ? '#FBF3E9' : "
    "b.st === 'done' ? '#FAF8F1' : '#FDFBF6'};border:1px solid "
    "${hot ? '#A2593A' : dragging ? '#D9B893' : active ? '#DFC2AC' : '#E7E1D4'};"
    "opacity:${dragging ? 0.5 : 1};cursor:grab;touch-action:none`,",
    "the block background is the drag surface",
)

# The semester name stops being a second copy of the expand button and becomes
# the menu trigger, which is what the ⤢ beside it is now for on its own.
patch(
    "        semStyle: 'font-size:14px;font-weight:600;letter-spacing:-0.005em;"
    "white-space:nowrap',",
    "        semStyle: 'display:flex;align-items:baseline;gap:4px;font-size:14px;"
    "font-weight:600;letter-spacing:-0.005em;white-space:nowrap;border-radius:5px;"
    "margin:0 -4px;padding:0 4px',",
    "the semester name is a menu trigger",
)

patch(
    "        termStyle: 'font-size:12.5px;color:#8F8779;white-space:nowrap;"
    "margin-top:-4px',",
    "        termStyle: 'font-size:12.5px;color:#8F8779;white-space:nowrap;"
    "text-align:left;border-radius:5px;margin:-4px -4px 0;padding:0 4px',",
    "the term label opens the same menu",
)

# The pill picks up the same press-then-move contract as the block. The click
# that ends a drag is swallowed, so a course that was dragged is not also
# selected — and a course that was merely pressed still is.
patch(
    "        click: () => this.setState({ sel: sel === c.c ? null : c.c }),",
    "        dragging: !!drag && drag.kind === 'course' && drag.id === c.c,\n"
    "        grab: e => this.startDrag('course', c.c, e),\n"
    "        click: () => { if (this.swallowClick()) return; "
    "this.setState({ sel: sel === c.c ? null : c.c, menu:null }); },",
    "course pills are draggable",
)

patch(
    "        style: `position:absolute;left:${g.x}px;top:${g.y}px;width:${PW}px;"
    "height:${PH}px;z-index:${dim ? 1 : isSel ? 6 : 5};",
    "        style: `position:absolute;left:${g.x}px;top:${g.y}px;width:${PW}px;"
    "height:${PH}px;touch-action:none;cursor:grab;"
    "z-index:${this.state.drag && this.state.drag.id === c.c ? 8 : dim ? 1 : isSel ? 6 : 5};",
    "the dragged pill rides above the board",
)

# A press that turned into a drag must not also clear the selection behind it,
# and any press on the board closes an open menu.
patch(
    "      clearSel: e => { if (!e.target.closest('button')) this.setState({ sel:null }); },",
    "      clearSel: e => { if (this.swallowClick()) return; "
    "if (!e.target.closest('button')) this.setState({ sel:null, menu:null }); },",
    "a drag does not clear the selection",
)

# The insert pill says one thing and does one thing. The label is deliberately
# not the term it will create: it is a control that is always available, and a
# label that changed with the block above it read as a different control in
# each gap.
patch(
    "      bInserts: gaps.map((g, i) => {\n"
    "        const rm = isIns(blocks[i]) ? blocks[i] : isIns(blocks[i + 1]) ? blocks[i + 1] : null;\n"
    "        return {\n"
    "        style:`position:absolute;left:${META}px;top:${g.mid - 11}px;"
    "width:${STACK_W - META - PADR}px;height:22px;display:flex;align-items:center;"
    "justify-content:center;z-index:4;pointer-events:none`,\n"
    "        btnStyle:`pointer-events:auto;white-space:nowrap;display:flex;align-items:center;"
    "gap:6px;background:#FDFBF6;border:1px solid ${rm ? '#D99B84' : '#E4DED0'};"
    "border-radius:11px;padding:3px 11px;"
    "font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.08em;"
    "color:${rm ? '#8C3A1E' : '#8F8779'}`,\n"
    "        label: rm ? `− REMOVE ${rm.term.toUpperCase()}` : "
    "`+ INSERT ${nextTerm(blocks[i].term).term.toUpperCase()}`,\n"
    "        click: rm ? (() => dropIns(rm.k)) : (() => addIns(blocks[i]))\n"
    "        }; }),\n"
    "      addRowLabel: isIns(blocks[blocks.length - 1])\n"
    "        ? `− Remove ${blocks[blocks.length - 1].term} from the plan`\n"
    "        : `+ Add ${nextTerm(blocks[blocks.length - 1].term).term} after "
    "${blocks[blocks.length - 1].term} — a summer session, study abroad, "
    "or a fifth year`,\n"
    "      addRow: () => { const b = blocks[blocks.length - 1]; "
    "if (isIns(b)) dropIns(b.k); else addIns(b); },",
    r"""      bInserts: gaps.map((g, i) => ({
        style:`position:absolute;left:${META}px;top:${g.mid - 11}px;width:${STACK_W - META - PADR}px;height:22px;display:flex;align-items:center;justify-content:center;z-index:4;pointer-events:none`,
        btnStyle:"pointer-events:auto;white-space:nowrap;display:flex;align-items:center;gap:6px;background:#FDFBF6;border:1px solid #E4DED0;border-radius:11px;padding:3px 11px;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:0.08em;color:#8F8779",
        label:'+ ADD SEMESTER',
        click: () => addIns(blocks[i], i)
      })),
      hasDropLine: !!drag && drag.kind === 'block' && drag.at != null,
      dropLineStyle: (!!drag && drag.kind === 'block' && drag.at != null)
        ? `position:absolute;left:${META}px;top:${(drag.at >= blocks.length ? stackH : blocks[drag.at].top) - 2}px;width:${STACK_W - META - PADR}px;height:3px;border-radius:2px;background:#A2593A;z-index:9`
        : 'display:none',
      addRowLabel: `+ Add a semester after ${blocks[blocks.length - 1].term} — a summer session, study abroad, or a fifth year`,
      addRow: () => addIns(blocks[blocks.length - 1], blocks.length - 1),""",
    "the add control always adds",
)

# ---- the template ----------------------------------------------------------
# The stack needs an id because startDrag converts clientY into stack
# coordinates against it, which is the frame every block `top` is measured in.
patch(
    '<div sc-camel-on-click="{{ clearSel }}" style="{{ stackStyle }}">',
    '<div id="board-stack" sc-camel-on-click="{{ clearSel }}" style="{{ stackStyle }}">',
    "the stack is the drag coordinate frame",
)

patch(
    '<div style="{{ b.blockStyle }}"></div>',
    '<div data-block="{{ b.k }}" sc-camel-on-pointer-down="{{ b.grab }}" '
    'style="{{ b.blockStyle }}"></div>',
    "pressing a block starts a block drag",
)

# The meta column's one button became three: the semester name and the term
# label both open the menu (a student aims at either), and ⤢ keeps the
# expanded-term sheet it always opened. data-menu="1" is what onDocDown reads
# to tell "a press that should close the menu" from "the press that opened it".
patch(
    '<button sc-camel-on-click="{{ b.expand }}" style="{{ b.bannerStyle }}" '
    'style-hover="background:#F1E3D8">\n'
    '<span style="display:flex;align-items:baseline;gap:6px">'
    '<span style="{{ b.semStyle }}">{{ b.sem }}</span>'
    '<span style="font-size:10px;color:#A2593A">⤢</span></span>\n'
    '<span style="{{ b.termStyle }}">{{ b.term }}</span>\n'
    "</button>",
    '<div style="{{ b.bannerStyle }}">\n'
    '<span style="display:flex;align-items:baseline;gap:6px">\n'
    '<button data-menu="1" data-sem-menu="{{ b.k }}" sc-camel-on-click="{{ b.openMenu }}" '
    'style="{{ b.semStyle }}" style-hover="background:#F1E3D8">'
    "<span>{{ b.sem }}</span>"
    '<span style="font-size:9px;color:#A2593A">▾</span></button>\n'
    '<button sc-camel-on-click="{{ b.expand }}" '
    'style="font-size:10px;color:#A2593A;border-radius:4px;padding:0 3px" '
    'style-hover="background:#F1E3D8">⤢</button>\n'
    "</span>\n"
    '<button data-menu="1" sc-camel-on-click="{{ b.openMenu }}" style="{{ b.termStyle }}" '
    'style-hover="background:#F1E3D8">{{ b.term }}</button>\n'
    "</div>",
    "the semester name opens the menu, the glyph opens the term",
)

# The remove button and the menu are drawn at stack level rather than inside
# the meta column: the button belongs to the block's right edge, 160px of
# gutter away, and a 198px menu would be clipped by a 130px column.
patch(
    '<sc-for list="{{ bTerms }}" as="b" hint-placeholder-count="1">\n'
    '<div style="{{ b.warnStyle }}">',
    '<sc-for list="{{ bTerms }}" as="b" hint-placeholder-count="8">\n'
    '<button data-remove="{{ b.k }}" sc-camel-on-click="{{ b.remove }}" '
    'style="{{ b.rmStyle }}" title="Remove this semester" '
    'style-hover="background:#FBE9E4">✕</button>\n'
    '<sc-if value="{{ b.menuOpen }}" hint-placeholder-val="{{ false }}">\n'
    '<div data-menu="1" data-sem-popover="{{ b.k }}" style="{{ b.menuStyle }}">\n'
    "<div style=\"font-family:'JetBrains Mono',monospace;font-size:8.5px;"
    'letter-spacing:0.13em;color:#A9A192;padding:4px 8px 6px">CHANGE THIS SEMESTER TO</div>\n'
    '<sc-for list="{{ b.menuItems }}" as="m" hint-placeholder-count="6">\n'
    '<button sc-camel-on-click="{{ m.click }}" style="{{ m.style }}" '
    'style-hover="background:#F1E3D8">{{ m.t }}</button>\n'
    "</sc-for>\n"
    '<div style="height:1px;background:#EFEADD;margin:6px 4px"></div>\n'
    '<button data-delete-sem="{{ b.k }}" sc-camel-on-click="{{ b.remove }}" '
    'style="{{ b.delStyle }}" style-hover="background:#FBE9E4">Delete this semester</button>\n'
    "</div>\n"
    "</sc-if>\n"
    "</sc-for>\n"
    '<sc-for list="{{ bTerms }}" as="b" hint-placeholder-count="1">\n'
    '<div style="{{ b.warnStyle }}">',
    "remove button + semester menu",
)

patch(
    '<button sc-camel-on-click="{{ c.click }}" '
    'sc-camel-on-mouse-enter="{{ c.enter }}" sc-camel-on-mouse-leave="{{ c.leave }}" '
    'style="{{ c.style }}">',
    '<button data-course="{{ c.c }}" sc-camel-on-click="{{ c.click }}" '
    'sc-camel-on-pointer-down="{{ c.grab }}" '
    'sc-camel-on-mouse-enter="{{ c.enter }}" sc-camel-on-mouse-leave="{{ c.leave }}" '
    'style="{{ c.style }}">',
    "pressing a course pill starts a course drag",
)

# Where a dragged block will land. It is drawn in the gap rather than on the
# blocks, so it reads as an insertion point and not as a selection.
patch(
    '<sc-for list="{{ bInserts }}" as="g" hint-placeholder-count="7">\n'
    '<div style="{{ g.style }}"><button sc-camel-on-click="{{ g.click }}" '
    'style="{{ g.btnStyle }}">{{ g.label }}</button></div>\n'
    "</sc-for>",
    '<sc-for list="{{ bInserts }}" as="g" hint-placeholder-count="7">\n'
    '<div style="{{ g.style }}"><button sc-camel-on-click="{{ g.click }}" '
    'style="{{ g.btnStyle }}">{{ g.label }}</button></div>\n'
    "</sc-for>\n"
    '<sc-if value="{{ hasDropLine }}" hint-placeholder-val="{{ false }}">\n'
    '<div data-drop-line="1" style="{{ dropLineStyle }}"></div>\n'
    "</sc-if>",
    "the drop indicator",
)


def main():
    lines = BUNDLE.read_text(encoding="utf-8").split("\n")
    idx = next(i for i, l in enumerate(lines) if MARKER in l) + 1
    src = json.loads(lines[idx])
    before = len(src)

    for old, new, label in PATCHES:
        n = src.count(old)
        if n != 1:
            sys.exit(f"FAIL [{label}]: anchor matched {n} times, expected 1")
        src = src.replace(old, new)
        print(f"ok   [{label}]")

    lines[idx] = json.dumps(src, ensure_ascii=False).replace("</", "<\\u002F")
    OUT.write_text("\n".join(lines), encoding="utf-8")

    # round-trip: the file we just wrote must parse back to exactly what we meant
    check = OUT.read_text(encoding="utf-8").split("\n")
    j = next(i for i, l in enumerate(check) if MARKER in l) + 1
    assert json.loads(check[j]) == src, "round-trip mismatch"
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes); template {before} -> {len(src)} chars; round-trip ok")


if __name__ == "__main__":
    main()
