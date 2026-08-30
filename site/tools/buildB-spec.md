# Build B ("Flightplan") — port spec

Source of every fact below: `buildB-source.js` (2,594,958 chars / 5,334 lines), extracted from
`design fixes/design fixes/Upated designs/flightplan-preview.html` by
`scratchpad/extract-bundle.py`. Line numbers in this document are **buildB-source.js** line
numbers. You should not need to open that file — everything needed to rebuild the pieces is
reproduced here verbatim.

Build B is one bundled SPA rendered by an internal template runtime. Its markup uses
`{{ name }}` interpolation, `<sc-if value="{{ flag }}">` and `<sc-for list="{{ rows }}" as="x">`,
and `sc-camel-on-click="{{ handler }}"` for events. **Every style in B is an inline `style="…"`
string** except one `<style>` block (lines 341–378) that holds the quiz CSS, the two
background-image data URIs and a handful of resets. When porting, translate `sc-*` to ordinary
DOM/CSS; the literal values below are what matter.

---

## 0. Architecture gap — read this first

| | Build A (`site/`) | Build B |
| --- | --- | --- |
| Shape | multi-page static, one `.html` per screen | one bundled SPA, client-side `screen` state |
| State | `localStorage` under `stellic-pathfinders` | **a real HTTP backend** + `localStorage` for per-device bits |
| Data | hand-authored in the pages | fetched from a catalog API at boot |
| Identity | none | account-gated; nothing renders until a user is signed in |

### 0.1 What B's backend actually is

`API_BASE` (lines 2364–2371) resolves to `http://localhost:8000` on localhost, otherwise
`window.location.origin + '/api'`. Nine endpoints are called:

| Method | Path | Auth | Body → Response |
| --- | --- | --- | --- |
| POST | `/auth/login` | none | `{email, password, remember, display_name}` → `{token, user}` |
| POST | `/auth/signup` | none | `{email, password, remember, display_name, program_id, first_name, last_name}` → `{token, user}` |
| GET | `/me` | Bearer | → `user` |
| PATCH | `/me/profile` | Bearer | partial user patch → full `user` |
| PATCH | `/me/password` | Bearer | `{current_password, new_password}` → ok; **server revokes all older tokens** |
| GET | `/me/plans` | Bearer | → `[{id, program_id, entries:[…]}]` |
| POST | `/me/plans` | Bearer | `{program_id, name}` → `{id}` |
| PUT | `/me/plans/{id}/entries` | Bearer | `[{course_code, term, status}]` → ok |
| GET | `/schools` | none | → `[{school, programs:[{id, tab}]}]` |
| GET | `/programs/{id}/coursemap` | none | → coursemap (see 0.3) |

Errors are read as `body.detail.message || body.detail.error` (a FastAPI-shaped `detail`).

The `user` object is consumed with these fields: `email`, `full_name`, `display_name`,
`first_name`, `initials`, `avatar` (a data: URL), `program_id`, `grad_year`, `pigeon`
(the onboarding-quiz answers, see §2).

Token storage (lines 2374–2401): key `compass.auth.v1`, value `JSON.stringify({token, user})`,
written to `localStorage` when "keep me signed in" is on and to `sessionStorage` otherwise
(and removed from the other store). Header is `Authorization: Bearer <token>`.

### 0.2 `backend-data-update.zip` is NOT an auth server

Verified contents of `design fixes/design fixes/backend-data-update.zip` (5 files, 16,517 bytes):

```
15,089  data/cmu-cs.json
15,238  data/cmu-ce.json
14,795  data/cmu-cheme.json
13,682  data/cmu-me.json
24,439  scripts/curricula.py
```

`curricula.py` is 372 lines of **course tuple tables plus derivation helpers**. It contains no
FastAPI/Flask/route/JWT/password/session/uvicorn/SQLAlchemy reference of any kind — I grepped for
all of them and got zero hits. It imports `app.graph`, which is not in the zip. Its own docstring
says "This file is DATA + shared derivation only." So the zip supplies curriculum seeds for
`/programs/{id}/coursemap` and nothing else. **There is no auth server anywhere in the delivery.**

### 0.3 Coursemap shape (from `data/cmu-cs.json`)

Top-level keys: `school, program, terms, groups, requirements, courses`. Note these seed files do
**not** carry the `meta`, `tiers` or `nodes` keys that `adaptCoursemap` (lines 2656–2677) reads —
the API evidently derives those before serving. `terms[i]` is
`{index, key, label, tag, status}`; `groups[i]` is
`{group, name, done, in_progress, total, count, missing[]}`.

### 0.4 Portability verdict, piece by piece

| Piece | Portable to A as-is? | Honest options |
| --- | --- | --- |
| **Login / signup (§1)** | **No.** | The screens are pure markup and port perfectly; the *function* does not. A has no server and can never authenticate. Options: (a) build the screens as a **visual shell** with no credential check — a name/email captured to `localStorage` and used to personalise the app, which is honest only if the UI never claims to be secure; (b) port the screens but leave them unreachable / demo-only; (c) skip them. **Do not** implement a client-side password check against a hardcoded value — it authenticates nothing and misleads whoever sees it. Whatever is chosen, the "Keep me signed in", "Change password" and "SYNCED" affordances must be dropped or relabelled: they are all statements about a server that does not exist. |
| **Pigeon quiz (§2)** | **Yes**, with one change. | Every question, option and rule is client-side. Only the *save* is server-backed (`PATCH /me/profile {pigeon:…}`, line 4744). Swap that for a `localStorage` write. The trigger condition also needs rewording (see §2.6). |
| **Sidebar + brand (§3)** | **Yes.** | Pure markup. The logo and the real `Pathfinder Hand` webfont are now extracted (§7), so A can stop substituting a lookalike face. |
| **THIS TERM block (§3.4)** | **Partly.** | The markup and typography port exactly. The *numbers* (`doneCr`, `totalCr`, `inProgCr`, `pct`) come from `/programs/{id}/coursemap`. A must hardcode or localStorage-seed them. |
| **Board / Semester toggle (§4)** | **Yes** for the control. | The pill pair is trivial. What each view *shows* is the fetched coursemap; A already has its own planner, so wire the pills to A's own two layouts rather than reproducing B's data flow. |
| **Personal-goals screen (§5)** | **Yes** — this is the most portable piece. | All ten modules, the zoom/pan, the drag and the doodle layer are 100% client-side with `localStorage` persistence already. Two caveats: goal *seeds* come from the quiz answers (which live on the account in B, on `localStorage` in A), and the "This week" module is filled from the fetched semester courses. |
| **Profile avatar (§6)** | **Yes.** | Already local: an uploaded file downscaled client-side to a 256px JPEG data URL. In B the data URL is stored on the account; in A store it in `localStorage`. **B ships no avatar image asset** — see §6.1. |

### 0.5 Bugs in B worth not porting

- `animation:fpdrop …` on the newest star jar star (line 3413) references **`@keyframes fpdrop`,
  which is never defined** — the only keyframe in the bundle is `omFinderIn` (line 344). The
  newest star therefore renders `opacity:0` and stays invisible until the next re-render.
- `class="fp-dotted"` (line 1657) and `class="fp-grow"` (lines 1476, 1499, 1799) have **no CSS rule
  anywhere** in the bundle. Dead classes.
- Two elements carry a duplicated `font-size` inside one style string (lines 1670, 1872, 1884);
  the second wins.

---

## 1. Login + signup

Markup: lines **2189–2255**. Logic: `submitAuth` lines **2403–2450**; token helpers **2374–2401**;
`restoreSession` **2530–2546**; `signOut` **2519–2528**; computed values **5166–5210** and
**5312–5325**.

### 1.1 Gating

```js
authGate  = !user && !sessionChecking          // line 5166 — full-viewport, z-index 400
booting   = (!coursemapLoaded || (user && !serverPlans)) && !apiError   // line 5070 — z-index 200
```

`sessionChecking` is seeded synchronously at construction (lines 2349–2352) from
`localStorage/sessionStorage['compass.auth.v1']` so a returning user never sees the gate flash.
`componentDidMount` (line 3568) calls `restoreSession()` then `loadCatalog()`.

Because `authGate` covers the viewport whenever there is no user, the "Log in" / "Sign up" buttons
in the Home header (lines 1918–1921) and the `authOpen` modal state are **unreachable dead code**.
Ignore them; the full-screen gate is the only auth UI.

### 1.2 Gate layout

Overlay: `position:fixed;inset:0;z-index:400;background:#F6F2E9;display:flex;align-items:center;
justify-content:center;padding:24px;overflow-y:auto`
Inner column: `width:100%;max-width:400px`.

**Brand lockup** (`text-align:center;margin-bottom:26px`):
- `<div id="brand-rock-b">` — `width:62px;height:57px;background-size:62px 57px;margin-bottom:14px`
- wordmark `Flightplan` — `font-family:'Pathfinder Hand',Caveat,cursive;font-size:42px;
  font-weight:600;line-height:1;color:#1B1916`
- tagline `DEGREE&nbsp;+&nbsp;CAREER` — `font-family:'JetBrains Mono',monospace;font-size:9px;
  letter-spacing:0.16em;color:#8F8779;margin-top:6px`

**Card**: `background:#FDFBF6;border:1px solid #E4DED0;border-radius:14px;padding:26px 24px;
box-shadow:0 12px 36px rgba(27,25,22,0.08)`

- Title (line 2199) — `font-family:'Pathfinder Hand',Newsreader,serif;font-size:23px;line-height:1.2;margin-bottom:4px`
- Subtitle — `font-size:12.5px;color:#8F8779;margin-bottom:18px;text-wrap:pretty`

**Shared input style** (every text input on the gate):
`width:100%;background:#FFFFFF;border:1px solid #E4DED0;border-radius:8px;padding:11px 12px;
font-family:'Instrument Sans',system-ui,sans-serif;font-size:13.5px;color:#1B1916`
(first of a stacked pair adds `margin-bottom:9px`).

**Submit button**: `width:100%;margin-top:17px;background:#A2593A;color:#FDFBF6;border-radius:8px;
padding:12px;font-size:13.5px;font-weight:600`

**Error banner** (only when `authError`): `margin-top:13px;font-size:12.5px;color:#8C3A1E;
background:#FBE9E4;border:1px solid #D99B84;border-radius:7px;padding:9px 11px`

**Mode switch** (below the card, `text-align:center;margin-top:16px`):
`font-size:12.5px;color:#A2593A`.

### 1.3 The three steps

State: `authMode ∈ {'login','signup'}` (default `'login'`), `authStep ∈ {'name','account'}`
(default `'account'`).

```
stepName    = authMode==='signup' && authStep==='name'
stepAccount = !stepName
```

Copy table (lines 5175–5190):

| | `authTitle` | `authSubtitle` | `authSubmitLabel` |
| --- | --- | --- | --- |
| login | `Welcome back` | `Sign in to open your plan.` | `Sign in` |
| signup / name | `Tell us your name` | `First, what should we call you?` | `Continue` |
| signup / account | `Create your account` | `Now pick your sign-in details and your program.` | `Create account` |

While `authBusy`, `authSubmitLabel` is `Working…` (with a horizontal ellipsis, U+2026).
`authSwitchLabel` is `Already have an account? Sign in` in signup mode, else
`New here? Create an account`.

**Step `name`** — two inputs, placeholders `First name` and `Last name`; first has `autofocus`.

**Step `account`** — in order:
1. `Username or email`, `type="email"`, `autofocus`, `margin-bottom:9px`
2. `Password`, `type="password"`
3. *(signup only)* section label `YOUR SCHOOL & MAJOR` —
   `font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:0.12em;color:#B4AC9C;margin:15px 0 6px`
   then a `<select>` (same input style plus `cursor:pointer`) grouped as
   `schoolGroups = schools.map(sc => ({label: sc.school, opts: sc.programs.map(p => ({k:p.id, label:p.tab}))}))`
   (line 5068) rendered as `<optgroup label>` + `<option value=k>`.
   If `schools` is empty, a pending box replaces the select:
   `width:100%;background:#FBF7EF;border:1px dashed #DFC2AC;border-radius:8px;padding:11px 12px;
   font-size:12.5px;color:#7E3F22;display:flex;align-items:center;gap:10px` containing
   `Loading programs…` — or `Program list unavailable — the catalog service is not reachable.`
   when `apiError` — plus a `RETRY` button
   (`font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.1em;color:#7E3F22;
   border:1px solid #E6CDB8;border-radius:6px;padding:5px 9px;background:#FDFBF6`).
4. Remember-me row — `display:flex;align-items:center;gap:9px;margin-top:15px`.
   Box (line 5197): `flex:none;width:16px;height:16px;border-radius:4px;display:flex;
   align-items:center;justify-content:center;font-size:10px;cursor:pointer;color:#FDFBF6` plus
   `background:#5A7355;border:1.5px solid #5A7355` when on, `background:transparent;
   border:1.5px solid #C9C0AE` when off. Glyph is `✓` (U+2713) when on, empty when off.
   Label `Keep me signed in on this device` — `font-size:12.5px;color:#5C554A;cursor:pointer`;
   both box and label toggle. **Default is on** (`authRemember !== false`).
5. *(signup only)* `← Back` under the submit button —
   `width:100%;margin-top:9px;font-size:12px;color:#A9A192` → sets `authStep:'name'`.

`Enter` in any gate input calls `submitAuth` (`onAuthKey`, line 5323).

### 1.4 `submitAuth` (lines 2403–2450)

1. If signup + step `name`: require both names, else error
   `Please enter your first and last name.`; on success advance to step `account` and default
   `authProgram` to the current `school`. **Return — no request is made on this step.**
2. Require email and password, else `Email and password are required.`
3. Signup only: if `schools` is empty, error
   `Cannot load the program list — check the catalog service, then retry.`
4. `POST {API_BASE}/auth/{signup|login}`, `Content-Type: application/json`, body:
   ```json
   { "email": "…", "password": "…", "remember": true,
     "display_name": "<the part of the email before @>",
     "program_id": "…", "first_name": "…", "last_name": "…" }
   ```
   The last three are `undefined` (i.e. omitted by `JSON.stringify`) on login.
5. Not ok → `authError = body.detail.message || body.detail.error || 'Sign in failed.'`
6. Ok → `writeToken({token, user}, remember)`; clear `authPassword`, `authFirst`, `authLast`;
   `authStep:'account'`; adopt `user.program_id` as the active `school`.
7. Then: if `!user.pigeon`, **or** `localStorage['flightplan.quizTerm'] !== currentTermKey`,
   `setTimeout(openQuiz, 450)`.
8. Then `syncPlansFromServer()`.
9. Network failure → `Could not reach the server.`

`restoreSession` (2530–2546) does the same post-login work after a successful `GET /me`, and on
failure clears the token and drops to the gate.

`signOut` (2519–2528) clears the token, **wipes the local edit blob** (so one account's plan cannot
leak into the next account on the same device), and resets to `authMode:'login'`.

### 1.5 Boot and catalog-error overlays

`booting` (lines 2257–2264): full-screen `#F6F2E9`, z-index 200, centred; `#brand-rock-c` at
`58×54` with `margin-bottom:2px`; wordmark at `font-size:40px;font-weight:600`; then
`{{ loadingLabel }}` — the literal string `Loading catalog…` (line 5073) — at
`font-size:13.5px;color:#8F8779;margin-top:8px`.

`apiError` (lines 2265–2273): z-index 420, `max-width:460px;text-align:center`; heading
`Can't reach the catalog` — `font-family:'Pathfinder Hand',Newsreader,serif;font-size:25px;
font-weight:400;color:#8C3A1E;margin-bottom:10px`; message body `font-size:14px;color:#5C554A;
line-height:1.55`; `Retry` button `background:#A2593A;color:#FDFBF6;border-radius:8px;
padding:10px 20px;font-size:13px;font-weight:500`.

---

## 2. Pigeon onboarding quiz

Markup **2133–2187**. CSS **349–375** (the only real stylesheet in the bundle). Logic
**4675–4757**. Computed values **5092–5142**.

### 2.1 Container

```css
[data-qov]{position:fixed;inset:0;background:rgba(60,45,35,.45);z-index:430;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto}
[data-quiz]{background:#FFFDF8;border-radius:20px;padding:30px 42px 34px;width:720px;max-width:92vw;position:relative;overflow:hidden;min-height:430px}
[data-qx]{position:absolute;top:14px;right:18px;color:#9A8F7D;font-size:16px;z-index:3}
```

### 2.2 Progress + heading

```css
[data-qdots]{display:flex;gap:9px;margin-bottom:8px;justify-content:center}
[data-qdot]{width:8px;height:8px;border-radius:50%;background:#E2D9C9;display:inline-block}
[data-qdot="1"]{background:#A2593A;width:10px;height:10px}
[data-qcap]{font-size:11px;letter-spacing:1.5px;color:#736657;text-transform:uppercase;margin-bottom:18px;text-align:center}
[data-qh]{font-family:'Pathfinder Hand',Newsreader,Georgia,serif;font-weight:600;color:#242019;font-size:27px;margin:0 0 20px;max-width:430px;line-height:1.22}
```

Four dots, one per question; `data-qdot="1"` on the current index only.

### 2.3 The four questions (in order, `qi` 0→3)

`quizCap` / `quizHead` (lines 5095–5096):

| `qi` | Caption | Heading |
| --- | --- | --- |
| 0 | `Question 1 of 4 — pick as many as you like` | `Which career fields are you drawn to?` |
| 1 | `Question 2 of 4 — optional, type your own` | `Anything more specific in mind?` |
| 2 | `Question 3 of 4 — at least 3, up to 5` | `Set your semester goals` |
| 3 | `Question 4 of 4 — this shapes your site` | `Are you an international student?` |

**Q1 — career fields.** Multi-select. `QFIELDS` (lines 4676–4678), exactly this order:

```
Technology & Engineering
Business & Finance
Healthcare & Medicine
Arts & Design
Science & Research
Education
Law & Public Policy
Media & Communications
Not sure yet
```

`qToggleField` (4703–4712): picking **`Not sure yet` clears every other selection and becomes the
sole answer**; picking anything else removes `Not sure yet` first, then toggles. Each pick fires a
positive pigeon reaction. Rendered as `[data-qopt]` buttons with a **square** indicator
(`[data-radio][data-multi="1"]`).

**Q2 — specifics.** Free-text tags, optional. Input placeholder:
`e.g. UX design, machine learning, immigration law — press Enter to add`.
`Enter` commits the trimmed value and clears the field; `Escape` clears the field without
committing; **no other key commits** (line 5108–5115). Committed tags render as `[data-qtag]`
chips reading `<label> ✕`; clicking a chip removes it. Note: `qSpecs` is a plain array and
**duplicates are not deduped**. Note under the input:
`Add as many as you want — you can change these later in Settings.`

**Q3 — semester goals.** Five text inputs, always five (`openQuiz` pads to length 5, line 4688).
Placeholders: `goal 1 (required)` … `goal 3 (required)`, then `goal 4 (optional)`,
`goal 5 (optional)`. Above them, six one-click suggestion chips `QSUGG` (lines 4679–4680), in order:

```
Apply to 3 internships
Get an on-campus job
Raise my GPA
Join a club or org
Talk to 2 upperclassmen
Build my resume
```

Clicking a suggestion writes it into the **first empty** goal slot (no-op when all five are full)
and fires a positive reaction. Note line is `quizGoalNote`: the error when one is set, otherwise
`These pin to your home page — the pigeon will check in on them all semester.`

**Q4 — international student.** Single-select, **round** indicator, two options (line 5135):

```
Yes — I study on a visa (F-1 / J-1)   → intl true
No — domestic student                 → intl false
```

Note: `Answering yes keeps the Visa tab front and centre — CPT/OPT timeline, documents and deadlines.`

### 2.4 Option / input / chip styles

```css
[data-qopt]{display:flex;align-items:center;gap:12px;border:1.4px solid #3A352D;border-radius:14px;padding:13px 16px;margin:10px 0;cursor:pointer;font-size:14.5px;background:#fff;max-width:440px;width:100%;text-align:left}
[data-qopt]:hover{background:#FBE9E4}
[data-qopt][data-sel="1"]{border-color:#A2593A;background:#FBE9E4}
[data-radio]{width:18px;height:18px;border:1.6px solid #B7A998;border-radius:50%;flex:none;position:relative}
[data-radio][data-multi="1"]{border-radius:5px}
[data-qopt][data-sel="1"] [data-radio]:after{content:'';position:absolute;inset:3px;border-radius:50%;background:#A2593A}
[data-qopt][data-sel="1"] [data-radio][data-multi="1"]:after{content:'\2713';inset:0;background:none;color:#A2593A;font-size:12px;text-align:center;line-height:15px;border-radius:0}
[data-qtags]{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;max-width:440px}
[data-qtag]{background:#FBE9E4;border:1px solid #A2593A;color:#A2593A;border-radius:14px;padding:5px 12px;font-size:12.5px}
[data-qsugg]{background:#fff;border:1px dashed #C9BDA9;color:#736657;border-radius:14px;padding:5px 12px;font-size:12.5px}
[data-qsugg]:hover{background:#FBE9E4}
[data-qin]{width:100%;max-width:440px;border:1.4px solid #3A352D;border-radius:12px;padding:11px 14px;font-size:14px;margin:6px 0;display:block;background:#fff;font-family:inherit;color:#1B1916}
[data-qnote]{font-size:11.5px;color:#736657;max-width:440px;margin-top:6px}
```

### 2.5 Footer, pigeon, and gating

```css
[data-qfoot]{display:flex;justify-content:space-between;align-items:center;margin-top:22px;max-width:440px}
[data-qback]{width:44px;height:44px;border-radius:50%;border:1.4px solid #CFC5B4;background:#fff;font-size:16px;color:#736657}
[data-qnext]{background:#A2593A;color:#fff;border:0;border-radius:24px;padding:13px 46px;font-size:14.5px}
[data-qnext][data-off="1"]{opacity:.45}
[data-qwrap]{position:absolute;right:10px;bottom:6px;pointer-events:none}
@media (max-width:860px){[data-qwrap]{display:none}}
```

Back button is `←`; next button label is `Next →`, or `Start →` on `qi === 3`, or `Saving…`
while busy (line 5138).

`quizBlocked(i)` (lines 4728–4734) → sets `data-off="1"` (opacity only; **the button is not
actually disabled**):

- `qi 0` — blocked when no field is selected
- `qi 1` — never blocked
- `qi 2` — blocked with fewer than 3 non-blank goals
- `qi 3` — blocked until `intl` is `true` or `false`

`qNext` (4714–4726) additionally, on `qi === 2` with fewer than 3 goals, fires a **negative**
pigeon reaction and sets the error
`Pick at least three goals — the pigeon checks in on these all semester.`

The pigeon sits bottom-right inside the card, hidden below 860px:
`<div id="pigeon-quiz" style="width:186px;height:197px;background-size:2046px 2167px;background-position:0px 0px;position:relative;z-index:2">`
over
`<div id="pigeon-quiz-planet" style="width:205px;height:189px;margin-top:-32px;background-size:205px 189px;position:relative;z-index:1">`
(both wrapped in `display:flex;flex-direction:column;align-items:center`).
`#pigeon-quiz` uses `pigeon-stage.webp` as an **11 × 11 sprite sheet** — 121 frames, each
186 × 197 at this scale — driven by `background-position`. `#pigeon-quiz-planet` uses
`brand-rock.webp`.

### 2.6 Answer shape, storage, and trigger

`saveQuiz` (4736–4757) builds:

```js
{ fields:    string[],   // Q1
  specifics: string[],   // Q2
  goals:     string[],   // Q3, trimmed, blanks dropped, capped at 5
  intl:      boolean }   // Q4 — note: `qIntl === true`, so null coerces to false
```

and `PATCH /me/profile { pigeon: answers }`. **This is the one server call in the quiz; replace it
with a `localStorage` write when porting.** On success it also writes
`localStorage['flightplan.quizTerm'] = currentTermKey`, plays the `excited` pigeon animation, and
opens the bubble with
`All set — I’ll check in on N goals this semester.` (singular `goal` when N is 1;
`All set.` when N is 0), auto-dismissed after 7000 ms. On failure:
`Could not save your answers.`

Closing the quiz with `✕` also stamps `flightplan.quizTerm` (line 4701), so dismissing counts as
"asked this term".

**Triggers** (three places):
1. after a successful login/signup (line 2445)
2. after a successful session restore (line 2541)
3. first click on the pigeon when `user.pigeon` is absent (line 5157)

(1) and (2) share the same condition, worth stating precisely:

```js
if (!user.pigeon || (currentTermKey && localStorage['flightplan.quizTerm'] !== currentTermKey))
    setTimeout(openQuiz, 450);
```

i.e. **the quiz re-runs at the start of every new term**, not only on first sign-up. `openQuiz`
(4685–4699) pre-fills the form from the saved answers, so a re-run is an edit rather than a blank
slate.

Answers feed the app in two places: `intl === false` **removes the Visa nav item and screen**
(lines 4856–4859, 3319), and non-empty `goals` **replace the seeded semester goals** on the
Personal-goals and Home screens (line 3028).

---

## 3. Sidebar / menu bar

Markup lines **382–429**. `navStyle` **3593–3600**. `nav` **4858–4861**.

### 3.1 Shell

App root (line 382):
`min-height:100vh;background:#F6F2E9;color:#1B1916;font-family:'Instrument Sans',system-ui,sans-serif;font-size:14px;line-height:1.5;display:flex;align-items:flex-start`

Sidebar (line 384) — **198px wide**, not 217 like A's:
`flex:none;width:198px;position:sticky;top:0;height:100vh;background:#FDFBF6;border-right:1px solid #E4DED0;display:flex;flex-direction:column;padding:24px 14px 20px;z-index:20`

### 3.2 Brand lockup

Wrapper `padding:0 8px 24px` (line 385), inner `display:flex;flex-direction:column;align-items:flex-start` (line 386):

```html
<div id="brand-rock-a" style="width:40px;height:37px;background-size:40px 37px;margin-bottom:12px"></div>
<div style="font-family:'Pathfinder Hand',Caveat,cursive;font-size:32px;font-weight:600;letter-spacing:0.005em;line-height:0.95">Flightplan</div>
<div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.14em;color:#8F8779;margin-top:6px">DEGREE&nbsp;+&nbsp;CAREER</div>
```

`#brand-rock-a/b/c` and `#pigeon-planet`/`#pigeon-quiz-planet` all share one rule (line 347) whose
`background-image` is the webp now extracted as `assets/b/brand-rock.webp`. The three sizes used
are 40×37 (sidebar), 62×57 (auth gate), 58×54 (boot screen); the planet variants are 160×148 and
205×189. Native is 600×554, so every use is a downscale.

### 3.3 Nav

`display:flex;flex-direction:column;gap:3px` (lines 389–393). Items (line 4858) — **note the label/key mismatch:
`jobs` is labelled "Career" and `career` is labelled "Personal goals"**:

```js
[['home','Home'], ['dashboard','Overview'], ['board','Planner'],
 ['jobs','Career'], ['career','Personal goals'], ['visa','Visa']]
```

`visa` is filtered out when the quiz answered `intl === false`; if the user is already on the visa
screen when that happens they are bounced to `home` (line 4857).

`navStyle(active)`:

```
base:     display:block;width:100%;text-align:left;padding:7px 12px 8px;border-radius:7px;
          font-family:'Pathfinder Hand',Caveat,cursive;font-size:21px;line-height:1.1;letter-spacing:0.01em
active:   base + background:#F1E3D8;color:#7E3F22;font-weight:700
inactive: base + color:#5C554A;font-weight:600
```

`board` reads as active for both `screen === 'board'` and `screen === 'timeline'` (line 4860).

### 3.4 THIS TERM stats block

Sits **immediately after the nav**, before the account/profile footers.
Lines **394–404**. Wrapper: `margin-top:26px;padding:0 8px`. Four rows, in order:

```html
<!-- 1. label -->
<div style="font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:0.14em;color:#B4AC9C;margin-bottom:10px">THIS TERM</div>

<!-- 2. term + in-progress line -->
<div style="font-size:12.5px;color:#5C554A;line-height:1.45">{{ curTermLabel }} · {{ META.inProgCr }} {{ META.unitLabel }} in progress</div>

<!-- 3. percent -->
<div style="display:flex;align-items:baseline;gap:6px;margin-top:12px;flex-wrap:nowrap">
  <span style="font-family:'Pathfinder Hand',Newsreader,serif;font-size:19px;line-height:1;flex:none">{{ pctLabel }}</span>
  <span style="font-size:11px;color:#8F8779;white-space:nowrap">of the degree</span>
</div>

<!-- 4. two-segment bar -->
<div style="height:6px;border-radius:3px;background:#EDE7DA;margin-top:8px;overflow:hidden;display:flex;gap:1px">
  <div style="{{ barDoneStyle }}"></div><div style="{{ barProgStyle }}"></div>
</div>
```

Values (lines 5029, 5055–5057):

```js
curTermLabel  = TERMS.find(t => t.st === 'current').l     // e.g. "Spring 2026"
pctLabel      = `${META.pct}%`
barDoneStyle  = `width:${Math.round(META.doneCr   / META.totalCr * 100)}%;background:#5A7355`
barProgStyle  = `width:${Math.round(META.inProgCr / META.totalCr * 100)}%;background:#A2593A;opacity:0.45`
```

`META.unitLabel` is `'credits'` or `'units'` depending on the program (`unitAbbr` is `'cr'`/`'u'`).
All of `doneCr / totalCr / inProgCr / pct` come from the coursemap API — **A must supply them
locally.** The placeholder shape (lines 2621–2624) defaults to `totalCr:120`, everything else 0.

### 3.5 Sidebar footers

Two stacked blocks below THIS TERM, both `margin-top:auto`-ish:

**Sync strip** — signed in (lines 405–413): `display:flex;align-items:center;gap:9px;
padding:10px 8px 0;margin-top:auto;border-top:1px solid #EFEADD`; a 22px initial circle
(`background:#E9EDE2;border:1px solid #C9D2C0;font-size:10px;color:#3F5139`), the email at
`font-size:10.5px;color:#5C554A` ellipsised, the word `SYNCED` at
`font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:0.08em;color:#5A7355`, and an
`OUT` button (`…color:#A9A192`).
Signed out (414–418): `Plans stay in this browser. Sign up on the home page to sync them.` at
`font-size:9.5px;color:#A9A192;line-height:1.4`. **Both of these are claims about the backend —
drop or rewrite them in A.**

**Profile strip** (lines 419–430) — clickable, opens the profile screen:
`display:flex;align-items:center;gap:10px;padding:14px 8px 0;margin-top:12px;
border-top:1px solid #EFEADD;cursor:pointer`, containing the 32px avatar (§6), then
`studentFullName` at `font-size:12.5px;font-weight:500;white-space:nowrap` and `META.program` at
`font-family:'JetBrains Mono',monospace;font-size:9px;color:#8F8779;letter-spacing:0.05em`.

`studentFullName = user.full_name || user.display_name || user.email` (line 3499).

---

## 4. Board view / Semester view toggle

Rendered twice — once inside the board screen (lines 435–439) and once inside the timeline screen
(lines 1042–1046) — as an identical fixed pill pair:

```html
<div style="position:fixed;top:14px;right:26px;z-index:60;display:flex;gap:6px;background:#F6F2E9;border:1px solid #E5E0D7;border-radius:999px;padding:4px">
  <button style="{{ pt.st }}">{{ pt.label }}</button>   <!-- ×2 -->
</div>
```

Definition (lines 3456–3459):

```js
plannerToggle = [['Board view','board'], ['Semester view','timeline']].map(([label,k]) => ({
  label,
  st: `border:1px solid ${screen===k ? '#A2593A' : 'transparent'};`
    + `background:${screen===k ? '#F0D9C8' : 'transparent'};`
    + `color:${screen===k ? '#7E3F22' : '#8F8779'};`
    + `font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.1em;`
    + `padding:6px 12px;cursor:pointer;border-radius:999px`,
  onPick: () => setState({ screen: k })
}));
```

So: **selected** = 1px `#A2593A` border, `#F0D9C8` fill, `#7E3F22` text; **unselected** =
transparent border and fill, `#8F8779` text. Everything else is identical between states — same
padding, same radius, no weight change.

### What each view shows

**Board view (`screen: 'board'`, markup from line 440).** The dependency/strand board.
Above it a course finder row (`⌘K` search shell with filter chip groups and a split results pane),
then a **`READ ONLY` banner** (lines 594–597):

> `READ ONLY` · `This board mirrors your `**`Semester plan`**` — drag, add, or remove courses there.`

Badge style: `font-family:'JetBrains Mono',monospace;font-size:8.5px;letter-spacing:0.12em;
color:#8F8779;border:1px solid #E4DED0;border-radius:5px;padding:3px 8px`; the sentence is
`font-size:12.5px;color:#8F8779` with `Semester plan` as an inline `#A2593A` weight-500 button
that switches views. The board draws term blocks with year/semester banners, credit labels,
prerequisite edges, blocked-course warnings, and a detail side panel; course pills open details but
**cannot be dragged**.

**Semester view (`screen: 'timeline'`, markup from line 1047).** The editable plan.
Header: `termCountLabel` (`"8 TERMS · 120 CREDITS"`, line 5046) at
`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.13em;color:#8F8779`;
`<h1>Your plan, term by term</h1>` at
`font-family:'Pathfinder Hand',Newsreader,serif;font-size:34px;line-height:1.15;font-weight:400;
letter-spacing:-0.015em`; then `planIntro` (line 5047):
`Everything after <current term> is a draft.` plus, when a ghost course exists,
` <next term> is where the missed prerequisite shows up — <course> has to wait a term.`

Right-hand controls: a conditional `RESET PLAN` button (`font-family:'JetBrains Mono',monospace;
font-size:9px;letter-spacing:0.1em;color:#7E3F22;background:#FAF0E7;border:1px solid #E6CDB8;
border-radius:7px;padding:7px 11px`), then a **second, nested** layout tab group
`tlTabs = [['grid','Grid'],['river','River'],['gantt','Gantt']]` (line 5066) in a
`display:flex;gap:3px;background:#EDE7DA;border-radius:8px;padding:3px` rail, styled by
`tabStyle(active)` (3597–3600):

```
active:   padding:8px 15px;border-radius:6px;background:#FDFBF6;color:#1B1916;font-size:12.5px;font-weight:600;box-shadow:0 1px 2px rgba(27,25,22,0.08)
inactive: padding:8px 15px;border-radius:6px;color:#7A7264;font-size:12.5px;font-weight:500
```

Below that, a status legend (line 5330):
`Complete #5A7355 · In progress #A2593A · Planned #B4AC9C · Blocked #96742E`, each a 9px dot plus
an `11.5px #8F8779` label.

Grid layout is a horizontally scrolling row of term columns (172px each), each with a header
(`term label` + `{cr}{unitAbbr}` + tag), draggable course chips (`draggable="true"`,
drag to another term, click to replace), and a dashed `+ ADD COURSE` button. Column tint:
`#F6EDE3` while a drag hovers, `#FBF3E9` for the current term, else `#FDFBF6`.

---

## 5. Personal-goals screen (`screen: 'career'`, nav label "Personal goals")

Markup **1639–1900**. Data **3021–3075** and **3300–3314**. Handlers **4541–4614**.
Computed values **3351–3512**.

### 5.1 How it fills the screen

The screen is **not** inside the usual `data-screen-label` wrapper padding. Its own wrapper
(line 1657) is the pan/zoom surface:

```js
careerWrapStyle =
  `max-width:1400px;margin:0 auto;padding:30px 30px 130px;position:relative;`
+ `background-image:radial-gradient(#D8CDB4 1.2px, transparent 1.4px);background-size:18px 18px;`
+ `transform:translate(${pgPan.x}px, ${pgPan.y}px) scale(${pgZoom});transform-origin:top center`
```

So: a 1400px-max centred column on an 18px dotted grid, 130px of bottom padding to clear the
floating toolbar, transformed as a whole. The page background behind it stays `#F6F2E9`.

### 5.2 Top banner

`display:flex;align-items:center;gap:16px;margin-bottom:22px;flex-wrap:wrap`:

1. **Title** — `{{ careerTitle }}` = `` `${firstName || 'Your'}’s career plan` `` (line 3505),
   styled `font-family:'Pathfinder Hand',Caveat,cursive;font-weight:600;font-size:38px;
   line-height:1;color:#1B1916`
2. **Date** — `{{ careerDate }}` = the current term label, `font-size:13px;color:#8F8779`
3. **Stat capsule**, pushed right with `margin-left:auto` —
   `display:flex;align-items:center;gap:14px;background:#FDFBF6;border:1px solid #E4DED0;
   border-radius:20px;padding:8px 16px;font-size:12.5px;color:#5C554A`, containing three spans:
   - `{{ careerGoalCount }}` = `` `${n} goals` `` (line 3512)
   - `★ {{ starCount }}` in `color:#C9A24A`
   - `· letter sealed ✉` in `color:#A9A192` — **hardcoded, never reflects letter state**

### 5.3 Floating toolbar and module menu

Toolbar (line 1648), fixed: `left:238px;bottom:22px;z-index:120;display:flex;gap:8px;
align-items:center;background:#FDFBF6;border:1px solid #E5E0D7;border-radius:999px;padding:7px 12px;
box-shadow:0 4px 14px rgba(27,25,22,.08)`. Contents, left to right:

| Glyph | Title | Action |
| --- | --- | --- |
| `+` (19px, `#8C4535`) | Add or remove modules | toggles the module menu |
| `✎` | Doodle on your page — draw arrows, circle things | toggles `doodleOn` |
| `◌` (16px, `#8F8779`) | Erase all doodles | clears `flightplan.doodles` and turns the pen off |
| 1×18px `#E5E0D7` divider | | |
| `−` (15px, `#5C554A`) | Zoom out | |
| `{{ zoomLabel }}` | | `font-family:'JetBrains Mono',monospace;font-size:9px;color:#8F8779;min-width:32px;text-align:center` |
| `+` (15px, `#5C554A`) | Zoom in | |

`penBtnStyle` (line 3383): `border:0;cursor:pointer;font-size:16px;line-height:1;border-radius:6px;
padding:3px 6px` plus `background:#F0D9C8;color:#7E3F22` when the pen is on, else
`background:none;color:#8F8779`.

Module menu (lines 1641–1646), fixed `left:238px;bottom:72px;z-index:130`:
`background:#FDFBF6;border:1px solid #E5E0D7;border-radius:12px;padding:12px 14px;
box-shadow:0 8px 24px rgba(27,25,22,.12);min-width:230px`. Header
`YOUR MODULES — CLICK TO SHOW · HIDE` at `font-family:'JetBrains Mono',monospace;font-size:8.5px;
letter-spacing:0.13em;color:#8F8779;margin-bottom:9px`. One row per module: an 8px dot
(`#5A7355` visible / `#D9CFBB` hidden) plus the label at `font-size:13px;color:#3A362F`.

### 5.4 Zoom and pan

```js
// line 3388-3390
zoomIn   : () => setState({ pgZoom: Math.min(1.3, (pgZoom||1) + 0.1) })
zoomOut  : () => setState({ pgZoom: Math.max(0.6, (pgZoom||1) - 0.1) })
zoomLabel: Math.round((pgZoom||1) * 100) + '%'
```

**Limits: 0.6 → 1.3 in 0.1 steps.** No wheel/pinch zoom, buttons only. Because these are float
additions, `zoomLabel` can read `110.00000000000001%` before rounding — the `Math.round` handles it.

`startPan(e)` (lines 4566–4576), bound to `pointerdown` on the wrapper:

```js
if (doodleOn) return;                                    // pen mode wins
if (e.target.closest('button,input,textarea,a,select,label,[data-fp-card]')) return;
const sx = e.clientX, sy = e.clientY, base = pgPan || {x:0,y:0};
move = ev => setState({ pgPan: { x: base.x + ev.clientX - sx, y: base.y + ev.clientY - sy } });
// listeners on window, removed on pointerup
```

Notes that matter for a port:
- Pan is stored as `{x, y}` in **component state only** — `pgPan` is **not persisted**, unlike
  zoom (also not persisted) and module positions (persisted).
- Pan deltas are **not divided by zoom**, so panning while zoomed out moves the content faster than
  the cursor. Module dragging *does* divide by zoom (§5.5). This inconsistency is in B as shipped.
- There are **no pan bounds** — the board can be dragged entirely off-screen with no reset control.
- **What pans:** everything inside the wrapper, i.e. the banner and all ten modules and the doodle
  canvas. **What stays pinned:** the sidebar, the floating toolbar (`position:fixed`), the module
  menu, and the pigeon dock — all outside the transformed subtree.

### 5.5 Dragging modules

`startModDrag(e)` (lines 4541–4564), bound to `pointerdown` on each card:

```js
const id = el.getAttribute('data-fp-card');   if (!id) return;
if (e.target.closest('button,input,textarea,a,select,label')) return;   // controls stay clickable
e.stopPropagation();                                                    // so the card does not pan
const z = pgZoom || 1;
const base = (modPos)[id] || {x:0, y:0};
move = ev => {
  const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
  if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;           // 4px dead-zone
  moved = true;
  const next = { ...cur, [id]: { x: Math.round(base.x+dx), y: Math.round(base.y+dy) } };
  localStorage['flightplan.modPos'] = JSON.stringify(next);             // written on every move
  setState({ modPos: next });
};
```

Each card carries `data-fp-card="<id>"`, `touch-action:none`, `position:relative`, and
`transform:translate({{ mp<id> }})` where `mp(id)` renders `"<x>px, <y>px"` (line 3308).
Cards keep their place in the CSS grid — the translate is an offset **from** the grid slot, so
neighbours do not reflow. Persisted to `localStorage['flightplan.modPos']` as
`{ [id]: {x, y} }`; there is no reset-positions control.

Hiding: `display:{{ md<id> }}` where `md(id)` is `'none'` when the id is in `hiddenMods`, else
`'block'` (line 3309). `hiddenMods` persists to `localStorage['flightplan.hiddenMods']`.
Every card except `goals` has a `✕` at `position:absolute;top:10px;right:12px;color:#A9A192;
font-size:12px;z-index:6` titled `Remove from your page (+ brings it back)`.
The goals card instead says (line 1736, `font-size:10.5px;color:#B4AC9C;margin-top:14px`):
`Goals card can't be deleted — everything else can. Drag badges to re-rank.`
(the badge-drag it advertises is **not implemented**).

### 5.6 Doodle layer

`<canvas id="fp-doodle">` is the wrapper's first child (line 1658), styled
`position:absolute;inset:0;z-index:${doodleOn ? 40 : -1};pointer-events:${doodleOn ? 'auto' : 'none'};
cursor:crosshair` (line 3382).

`startDoodle` (4579–4598) / `redrawDoodles` (4600–4613): stroke colour `#8C4535`, `lineWidth 2.5`,
round cap and join. The canvas is sized to the host's `scrollWidth × scrollHeight` on redraw, and
pointer coords are scaled by `cv.width/rect.width` so strokes land correctly under zoom. Strokes
are stored as arrays of `{x, y}` in `localStorage['flightplan.doodles']` — appended on pointerup,
replayed on redraw. `redrawDoodles` is kicked by a `setTimeout(…, 40)` on every render (line 3301)
because `requestAnimationFrame` is not used.

### 5.7 Layout of the ten modules

Three rows inside the wrapper:

- **Row 1** — `display:grid;grid-template-columns:1.15fr 1fr 0.85fr;gap:18px;align-items:start;margin-bottom:18px`
  1. `goals` (col 1)
  2. a `display:flex;flex-direction:column;gap:18px` column holding `cal` then `week` (col 2)
  3. a `display:flex;flex-direction:column;gap:18px` column holding `todo` then `habits` (col 3)
- **Row 2** — `display:grid;grid-template-columns:repeat(3,1fr);gap:18px;align-items:start`
  1. `letter`
  2. `long`
  3. `people`
  4. a nested `display:flex;flex-direction:column;gap:18px` column holding `wins` then `skill`
     — **note this is a 4th child in a 3-column grid, so it wraps onto a second grid row**

Default card chrome: `background:#FDFBF6;border:1px solid #E4DED0;border-radius:14px;
padding:18px 20px` (the `goals` card uses `padding:20px 22px`). Exceptions:
`habits` = `#FBF3E7` on `#EAD9B6`; `wins` = `#FDFAF0` on `#EDE3C9`; `letter` = `#FDFBF6` on `#EDE7DA`.

`MODULES` (line 3306), which is also the module-menu order:

```js
[['goals','Semester goals'], ['cal','Calendar'], ['habits','Habit tracker & star jar'],
 ['week','This week'], ['todo','To do list'], ['letter','Letter to future self'],
 ['long','Long-term goals'], ['people','People I met'], ['wins','Wins log'],
 ['skill','Skill in progress']]
```

### 5.8 What each module contains

**1. `goals` — Semester goals.** Header row: `SEMESTER GOALS`
(`font-family:'JetBrains Mono',monospace;letter-spacing:0.13em;color:#8F8779;font-size:10px`) and
`tap a goal to add where + how` (`font-size:11px;color:#A9A192`). Rows are
`display:flex;flex-direction:column;gap:16px`.

Each goal row: a 22px circular left badge (`bs2`, line 3193 — `#5A7355` with `✓` when checked, else
a running number on `#B7AFA3`), then a white inner card
(`background:#FFFFFF;border:1px solid #E5E0D7;border-radius:10px;padding:10px 12px`) holding a
checkbox, the goal text as a button in
`font-family:'Pathfinder Hand',Caveat,cursive;font-size:16px;color:#1B1916`, and a 20px rank pill
(`background:#F1E3D8;border:1px solid #DFC2AC;font-family:'JetBrains Mono',monospace;font-size:10px;
color:#7E3F22`, line 3029).

Interactions (lines 3166–3190): **single click** toggles a where/how sub-editor;
**double click within 380 ms** opens an inline rename input. The sub-editor is
`margin:8px 0 0 27px;padding-left:14px;border-left:2px solid #DFC2AC` with `where?` / `how?` labels
in `font-size:12px;color:#A2593A` and small inputs; `Enter` or `Escape` closes it. When closed and
non-empty, a read-only summary shows both values at `font-size:12px;color:#8F8779` above a
`1px solid #EFEADD` rule. Renames persist to `localStorage['flightplan.goalRename']` as
`{originalText: newText}`. Footer button `+ add a goal`
(`margin-top:16px;font-size:13px;color:#A2593A;font-weight:500`) reveals an input with placeholder
`New goal — press Enter`.

Seed (lines 3021–3026), used **only when the quiz produced no goals**:

```js
{rank:1,    t:'find an on-campus job',                  where:'LinkedIn & Handshake',  how:'apply to 3+ jobs, see who answers back'}
{rank:2,    t:'GPA 4.0',                                where:'ace calc midterms ✓',   how:'A on english essay'}
{rank:3,    t:'apply to 3 internships',                 where:'Career Match list',     how:'1 per week'}
{rank:null, t:'talk to one professor about research',   where:'',                      how:''}
```

When quiz goals exist they replace the seed entirely, ranked 1..n with empty where/how (line 3028).

**2. `cal` — Calendar.** A live month grid. Header: `←` / `→` circular buttons
(`background:#F6F2E9;border:1px solid #E5E0D7;border-radius:50%;width:26px;height:26px;
color:#8C4535;font-size:13px`) around `{{ calTitle }}` in
`font-family:'Pathfinder Hand',Caveat,cursive;font-weight:600;font-size:20px;color:#8F8779`.
Weekday strip `S M T W T F S` as a `repeat(7,1fr)` grid, `gap:4px`,
`font-family:'JetBrains Mono',monospace;font-size:8px;color:#B4AC9C;text-align:center`, then the
day cells in the same grid. Arrows step `calOff` by ±1 month.

**3. `habits` — Habit tracker & star jar.** Title `habits — September` in
`font-family:'Pathfinder Hand',Caveat,cursive;font-weight:600;font-size:19px;color:#7A5C1E`.
Three habits (lines 3031–3035), each a name at `font-size:13px;color:#5C554A` over a wrapped row of
9px circular buttons:

```js
{n:'sleep before 1am',      filled:6, total:14}
{n:'gym x2 / week',         filled:4, total:14}
{n:'one networking msg',    filled:3, total:12}
```

Dot style (line 3048): `width:9px;height:9px;padding:0;border-radius:50%;cursor:pointer;
transition:background .15s,border-color .15s,transform .15s` plus, when lit,
`transform:scale(1.15);border:1px solid #C9A24A;background:#E9C877` — else
`transform:none;border:1px solid #E4DED0;background:transparent`. Title is
`Ticked — click to clear` / `Tick this day`. An untouched habit falls back to its seeded run so the
card looks lived-in. Ticking (not un-ticking) fires a positive pigeon reaction.
**`habitTicks` lives in component state only — it is not persisted.**

Caption `every tick = a star in the jar` (`font-size:11px;color:#B49A5E;margin-top:16px`).

**Star jar**: a `position:relative;width:210px;height:280px` stack — `star-jar-back.png` (z-index 1),
then `starCount` copies of `star.png` at `position:absolute;width:37px` on the fixed 31-slot
`FP_PILE` layout (line 3315; x 14–161, y 60–221, rotation −30°..24°), then
`star-jar-front.png` (z-index 3). `starCount` is the total of all ticked days across all three
habits (line 3058), so the jar caps visually at 31. Label:
`` `${n} star(s) in the jar — fill it up` ``.
**Do not port `animation:fpdrop`** — see §0.5.

**4. `week` — This week.** `←` / `→` (24px circles) around `{{ weekLabel }}`
(`'this week — classes auto-filled'`, or `'week of Mar 3'` when offset, line 3368) in
`Pathfinder Hand, Caveat` 19px `#8F8779`. Body is a `repeat(5,1fr)` grid, `gap:6px`, one column per
weekday `Mon…Fri`: the day name at `font-family:'JetBrains Mono',monospace;font-size:8.5px;
color:#A9A192;text-align:center`, then up to 2 course chips at
`font-family:'JetBrains Mono',monospace;font-size:8.5px;padding:3px 5px;border-radius:4px` with a
rotating pastel background. **Courses come from the fetched semester plan** (line 3059) — the one
module in this screen that needs A to supply data.

**5. `todo` — To do list.** Title `TO DO LIST` in
`font-family:'Pathfinder Hand',Caveat,cursive;font-weight:600;color:#3A362F;font-size:22px;
letter-spacing:0.05em` beside `{{ todayDate }}`
(`new Date().toLocaleDateString('en-US',{month:'long',day:'2-digit',year:'numeric'})`, line 3365) in
`JetBrains Mono` 9px `#8F8779`. A `1px #EDE7DA` rule, then checkable rows at
`font-size:13px;color:#5C554A`, then `+ add task`
(`margin-top:12px;font-size:12.5px;color:#A2593A;font-weight:500`) revealing an input placeholder
`New task — press Enter`. Seed (line 3062):
`finish <first course code> pset` and `send 1 networking msg`.

**6. `letter` — Letter to future self.** Title `letter to future self...` in
`Pathfinder Hand, Caveat` 19px `#5C554A`. Four mutually exclusive states:

- *none* — clickable `letter-closed.png` at `width:300px;max-width:100%` above
  `write a letter — the pigeon delivers it near graduation` (`font-size:12px;color:#8F8779`)
- *editing* — a `<textarea>` placeholder `Dear future me...` styled
  `background:#FFFDF7;border:1px solid #E5E0D7;border-radius:8px;padding:10px 12px;font-size:13px;
  min-height:110px;resize:vertical;font-family:'Pathfinder Hand',Caveat,cursive`, then a
  `DELIVER ON` label (`JetBrains Mono` 8px, `letter-spacing:0.1em`, `#8F8779`), a `<input type="date">`,
  and a `Seal it ✉` button (`background:#8C4535;color:#FDFBF6;border-radius:8px;padding:7px 14px;
  font-size:12px;font-weight:600`)
- *sealed* — `letter-closed.png` plus `sealed — pigeon delivers it on {{ letterWhen }}`
- *ready* (today ≥ the deliver date, line 3300) — a `width:340px;height:352px;perspective:1200px`
  stack: `letter-open.png` at `top:0` with `transform-origin:50% 20%`, `letter-closed.png` at
  `top:78px` with `transform-origin:50% 80%`, both transitioning
  `transform .55s cubic-bezier(.5,-0.2,.3,1.2), opacity .4s ease`. Closed →
  `transform:rotateX(70deg) scale(.95);opacity:0`; open → `transform:rotateX(0) scale(1);opacity:1`
  (lines 3361–3362). The letter text overlays at `left:14%;top:9%;width:72%;max-height:170px;
  font-family:'Pathfinder Hand',Caveat,cursive;font-size:13.5px;line-height:1.45;color:#3A362F;
  white-space:pre-wrap`. Caption toggles between
  `your letter has arrived — click to open` and `click to tuck it back in`.

Persists to `localStorage['flightplan.letter']` as `{text, deliver}` (`deliver` is `YYYY-MM-DD`).

**7. `long` — Long-term goals.** Title `long-term goals` (`Pathfinder Hand, Caveat` 19px `#5C554A`),
then `where you're headed after graduation. interests count — clearer goals + better job matches.`
at `font-size:11.5px;color:#A9A192;margin-bottom:14px;text-wrap:pretty`. Body is a wrapped row of
chips at `font-size:12.5px;background:#FDFBF6;border:1px solid #E4DED0;border-radius:8px;
padding:7px 12px;color:#5C554A;white-space:nowrap`. Button `+ add a goal or interest`, input
placeholder `New interest — press Enter`. Seed (line 3063):
`UX research`, `work with kids`, `drawing / visual work`, `space industry`.

**8. `people` — People I met.** Title `people I met`. Rows at `font-size:13.5px;color:#1B1916`
reading `{name} — {context}`, with a second line `{note}` at `font-size:12px;color:#A2593A` followed
by `(pigeon reminds)` in `#A9A192`. Button `+ add a person`, input placeholder `Name — press Enter`.
Seed (line 3064): `{n:'Sarah', ctx:'career fair', note:'follow up Thu'}`.

**9. `wins` — Wins log.** Header `★` (`#C9A24A`) plus `WINS LOG` in
`font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.13em;color:#B49A5E`. Items at
`font-size:13.5px;color:#5C554A`. Button `+ add a win`, input placeholder `New win — press Enter`,
footnote `turns into resume bullets later` (`font-size:10.5px;color:#C3BBA9;margin-top:10px`).
Seed (line 3065): `shipped my first website`.

**10. `skill` — Skill in progress.** Header `SKILL IN PROGRESS…` in
`font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.13em;color:#8F8779`. Each row:
a 64px truncated name at `font-size:13px;color:#1B1916`, then a clickable bar
`flex:1;height:7px;border-radius:4px;background:#EDE7DA;overflow:hidden;cursor:pointer` with a fill
`width:{p}%;height:100%;background:#A2593A`, plus a `✕` remove. Clicking anywhere on a bar sets
progress from the click x, clamped to **4–100** (lines 3072–3074). Button `+ add a skill`, input
placeholder `Skill name — press Enter`, footnote `feeds your job matches`.
Seed (line 3066): `{n:'Figma', wks:'3 wks', p:62}`, `{n:'Python', wks:'new', p:18}`.
Persists to `localStorage['flightplan.skillbars']`.

### 5.9 Cursor-following tips

`installWidgetTips()` (lines 4763–4800) appends one floating div to `<body>`:
`position:fixed;z-index:400;background:#8C4535;color:#FDFBF6;font-size:11.5px;line-height:1.5;
padding:8px 12px;border-radius:10px;max-width:250px;pointer-events:none;font-family:system-ui,sans-serif;
box-shadow:0 6px 18px rgba(27,25,22,.18);opacity:0;transition:opacity .25s ease`, repositioned on
`pointermove` to `left: min(innerWidth-270, clientX+18)`, `top: max(8, clientY-52)`. It keys off
`data-fp-card` for the ten module texts below, and otherwise **steals the element's `title`
attribute** (removing it so the native tooltip stays away) and shows that instead.

```
goals  your semester goals — tap one to add where + how, double-click to rename, tick the box when it's done. drag any card to rearrange the page
cal    your live calendar — the arrows flip between months
habits click a circle to tick a habit — every tick drops a star into the jar
week   this week's classes, auto-filled from your semester courses
todo   your running to-do list — tick a box to finish a task, + adds a new one
letter write a letter to future you — pick a date and the pigeon delivers it near graduation
long   big-picture goals past this semester — check one off when life catches up
people people you meet — save them here so follow-ups don't slip
wins   your wins log — + adds a win; these turn into resume bullets later
skill  skills you're learning — click anywhere on a bar to set progress, + adds a skill, ✕ removes one
```

(The source uses curly apostrophes throughout; several cards also carry a `data-fp-tip` attribute
with the same text, which the tip code does **not** read — it is redundant.)

### 5.10 localStorage keys this screen owns

All go through `lsGet`/`lsSet` (lines 3213–3214), which prefix `flightplan.`:

| Key | Shape |
| --- | --- |
| `flightplan.modPos` | `{ [cardId]: {x, y} }` |
| `flightplan.hiddenMods` | `string[]` of card ids |
| `flightplan.doodles` | `Array<Array<{x, y}>>` |
| `flightplan.goalRename` | `{ [originalGoalText]: newText }` |
| `flightplan.skillbars` | `[{n, wks, p}]` |
| `flightplan.letter` | `{text, deliver}` |
| `flightplan.quizTerm` | term key string (see §2.6) |

Also written elsewhere in B: `flightplan.contacts`, `.exps`, `.skills`, `.savedJobs`, `.resume`.
Not `flightplan.`-prefixed: `compass.auth.v1` (token), `compass.edits.v1` (plan edits),
`compass.pigeon.pos.v1` (pigeon dock position, default `{right:22, bottom:20}`).

---

## 6. Profile avatar treatment

Two style factories (lines 2455–2468) cover **every** appearance:

```js
avatarStyle(size, font, family)   // the initials circle
  `width:${size}px;height:${size}px;flex:none;border-radius:50%;display:flex;`
+ `align-items:center;justify-content:center;font-family:${family};font-size:${font}px;`
+ `color:#7E3F22;background:#F1E3D8;border:1px solid #DFC2AC`

avatarImgStyle(size)              // the picture
  `width:${size}px;height:${size}px;flex:none;border-radius:50%;`
+ `object-fit:cover;border:1px solid #DFC2AC;display:block`
```

Three registered sizes (lines 5219–5224):

| Name | Size | Initials font | Used at |
| --- | --- | --- | --- |
| `Sm` | 32px | `Newsreader,serif` 14px | sidebar profile strip (line 420) |
| `Md` | 34px | `'JetBrains Mono',monospace` 12px | Home account pill (line 1925) |
| `Lg` | 74px | `Newsreader,serif` 26px | Home header (1907), Career header (1451), Profile header (1523), Settings (2059) |

Rendering is always the same pair of branches — `hasAvatar` → `<img src="{{ userAvatar }}"
style="{{ avatarImg<Size> }}">`, `noAvatar` → `<div style="{{ avatar<Size> }}">{{ avatarText }}</div>`
— where `userAvatar = user.avatar` (a data URL), `avatarText = user.initials` (empty string
whenever a picture is set).

There is a **deliberate reason the picture is a separate `<img>`** rather than a
`background-image` — the source comments it at line 2456: the template runtime parses a style
string by splitting on `;` and `:`, which mangles a `data:` URL no matter how it is quoted. A port
that uses real CSS is free to use `background-image` instead.

### 6.1 There is no shipped avatar asset

**Correction to the brief:** Build B ships **no profile/student avatar image**. Every one of the 7
image data URIs in the bundle is accounted for in §7, and none is an avatar. The circle is either
the user's own uploaded picture or an initials fallback. The upload path (`readAvatarFile`,
lines 2483–2502) reads the chosen file, **centre-crops it to a square, downscales to 256×256, and
re-encodes as `image/jpeg` quality 0.85** via a canvas, then `PATCH /me/profile {avatar: dataUrl}`.
`Remove` sends `{avatar: ''}`.

Settings UI (lines 2054–2075): label `PROFILE PICTURE`
(`JetBrains Mono` 8.5px, `letter-spacing:0.13em`, `#B4AC9C`), the 74px avatar, a `Choose image`
`<label>` wrapping a hidden `<input type="file" accept="image/*">` styled
`font-size:12.5px;font-weight:500;color:#7E3F22;background:#FAF0E7;border:1px solid #E6CDB8;
border-radius:7px;padding:8px 13px;cursor:pointer`, a conditional `Remove` button
(`font-size:12.5px;color:#8C3A1E;border:1px solid #E4DED0;border-radius:7px;padding:8px 13px`), and
the hint `Shown everywhere your initials appear. Square images look best.`
(`font-size:11px;color:#A9A192;line-height:1.4`).

This whole flow ports to A unchanged except for swapping the `PATCH` for a `localStorage` write.

---

## 7. Extracted assets — `site/assets/b/`

All eight files below were decoded from base64 in the bundle, written in their **native format at
native size** (no re-encoding, no resizing), and header-validated: every RIFF length matches the
file length exactly, every PNG has a valid `IHDR`, and the woff2 has a valid TrueType flavor.

| File | Bytes | Pixels | Format | Source line | What it is |
| --- | ---: | --- | --- | ---: | --- |
| `brand-rock.webp` | 26,308 | 600 × 554 | WebP (VP8X) | 347 | **The brand rock/planet logo.** Shared by `#brand-rock-a/b/c` and `#pigeon-planet` / `#pigeon-quiz-planet`. Displayed at 40×37, 62×57, 58×54, 160×148, 205×189 — all downscales of this one file. |
| `pigeon-stage.webp` | 1,417,228 | 3080 × 3267 | WebP (VP8X) | 346 | The pigeon **sprite sheet**: 11 × 11 = 121 frames, each 280 × 297 native. Shared by `#pigeon-stage` (drawn at sheet 1650×1738 / frame 150×158) and `#pigeon-quiz` (sheet 2046×2167 / frame 186×197). Animate with `background-position`. |
| `letter-open.png` | 58,838 | 340 × 347 | PNG RGBA | 3310 | `FP_LETTER_OPEN` — the opened letter. |
| `letter-closed.png` | 52,600 | 340 × 197 | PNG RGBA | 3311 | `FP_LETTER_CLOSED` — the sealed envelope. Drawn at 300px wide in the none/sealed states, 340px in the ready state. |
| `star-jar-back.png` | 5,930 | 210 × 280 | PNG RGBA | 3312 | `FP_JAR_BACK` — jar rear, z-index 1. |
| `star-jar-front.png` | 48,473 | 210 × 280 | PNG RGBA | 3313 | `FP_JAR_FRONT` — jar front glass, z-index 3. |
| `star.png` | 1,566 | 37 × 36 | PNG RGBA | 3314 | `FP_STAR` — one star, drawn at `width:37px`. |
| `PathfinderHand.woff2` | 37,152 | — | WOFF2 (TrueType) | 345 | **The real `Pathfinder Hand` webfont**, `font-weight:normal;font-style:normal;font-display:swap`. |

No asset appears at more than one native size in the bundle, so there was nothing to choose between
— each file above is the only copy that exists.

### 7.1 The font is the notable find

`site/README.md` currently says Pathfinder Hand "is not a distributable webfont" and defines
`--font-hand` as a substitution stack. **B embeds the real face** as a 37KB base64 woff2 (line 345),
now saved as `assets/b/PathfinderHand.woff2`. A can drop the substitution:

```css
@font-face{
  font-family:'Pathfinder Hand';
  src:url('../assets/b/PathfinderHand.woff2') format('woff2');
  font-weight:normal;font-style:normal;font-display:swap;
}
```

Two caveats. First, the face has **one weight only** — every `font-weight:600`/`700` in B's markup
is therefore synthetic bold, so a port that loads the real font will look slightly different from
one that falls back to Caveat. Second, whether it may be redistributed is a licensing question I
cannot answer from the bundle; flag it before shipping publicly.

### 7.2 B's other fonts

`Caveat`, `Instrument Sans`, `JetBrains Mono` and `Newsreader` are Google Fonts, inlined as
`@font-face` blocks (lines 10–339) whose `src:` URLs the bundler rewrote to opaque UUIDs — the
actual woff2 payloads are **not recoverable** from the extracted source. Load them from Google
Fonts as A already does. B's three stacks are:

```
body / UI     'Instrument Sans', system-ui, sans-serif
hand / brand  'Pathfinder Hand', Caveat, cursive        (nav, wordmark, module titles)
hand / serif  'Pathfinder Hand', Newsreader, serif      (page headings, big numbers)
mono / label  'JetBrains Mono', monospace               (all-caps micro-labels)
```

A fourth, `'Pathfinder Hand', Georgia, cursive`, is the `.pgh` class (line 348) used by the pigeon
speech bubble.

### 7.3 B's colour tokens

Declared once at line 2355 as `this.C`, though most of the markup hardcodes the hex anyway:

```js
ink:'#1B1916'  ink2:'#5C554A'  ink3:'#8F8779'  faint:'#A9A192'  rule:'#E4DED0'
panel:'#FDFBF6'  accent:'#A2593A'  green:'#5A7355'  amber:'#96742E'
```

Page background is `#F6F2E9`; `body` also sets `-webkit-font-smoothing:antialiased` (line 342).
Other recurring values not in the token list: `#F1E3D8` (active nav / avatar fill / `::selection`),
`#7E3F22` (active nav text), `#8C4535` (pigeon + doodle ink), `#FBE9E4` / `#D99B84` / `#8C3A1E`
(error), `#EFEADD` (hairline), `#B4AC9C` (dim label), `#C9A24A` / `#E9C877` (stars).

---

## 8. Corrections to the working summary

| Claim | Correction |
| --- | --- |
| "the wordmark … 32px in the sidebar (line ~386), 42px and 40px on the auth screens (~2194, ~2260)" | Right. Precisely: sidebar 32px at line 385, auth gate 42px at line 2194, **boot screen** 40px at line 2260 — the 40px one is the loading overlay, not a second auth screen. |
| "`#brand-rock-a/b/c` divs — a webp data-URI logo" | Right, and the same rule also drives `#pigeon-planet` and `#pigeon-quiz-planet` (line 347). One image, five ids. |
| "A 'THIS TERM' stats block at line ~395" | The block runs lines **393–403**; the label is at 394. It sits **after** the nav (`margin-top:26px`), before the sync and profile footers. |
| "Personal-goals screen … 10 draggable modules at ~line 3306" | `MODULES` is exactly line 3306. But only **nine** are removable — the `goals` card has no `✕` and its own copy says it can't be deleted. |
| "Persists `flightplan.modPos` and `flightplan.doodles`" | Also `flightplan.hiddenMods`, `.goalRename`, `.skillbars`, `.letter`, `.quizTerm` — see §5.10. Note `pgPan` and `pgZoom` are **not** persisted, and neither are the habit ticks. |
| "a pigeon onboarding quiz (`openQuiz`, `pigeonAnswers`, `flightplan.quizTerm`)" | Right. Worth adding: it is not one-time — the `quizTerm` check **re-runs it every new term**, pre-filled with the previous answers. |
| Sidebar width | Not stated in the summary: it is **198px**, vs A's canonical 217px. |
| "a login/signup gate" | It is a **hard** gate: `authGate = !user && !sessionChecking` covers the viewport at z-index 400, so nothing in B is reachable signed-out. The "Log in"/"Sign up" buttons in the Home header and the `authOpen` modal state are unreachable dead code. |
| Nav list | Confirmed verbatim at line 4858, with one addition: `visa` is **filtered out** when the quiz answered "domestic student". |
| `plannerToggle` at ~3456 | Confirmed, lines 3456–3459. |
