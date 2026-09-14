/* Alumni — coffee chats.

   Students find an alum who has already walked their path and ask for fifteen
   minutes. Three ways in, each powered by data Flightplan already holds:

     · MAJOR      — the programme picked at signup (auth.programId)
     · FIELD      — onboarding quiz question 1 (flightplan.quiz.fields)
     · MY COURSES — the student's own roster from the Planner

   There is no backend and no outbox, so nothing is ever sent from here: the
   composer copies or opens a mailto:, and the student marks each conversation
   sent / replied / scheduled / done themselves, because Flightplan cannot know.

   Everything the student does lives in store buckets that app.js's
   USER_BUCKETS wipe on a change of user — `lists` (requests, filters) and
   `fields` (notes, home country) — so outreach never leaks between people on a
   shared laptop. */

import { store } from './store.js';
import { openModal, closeModal } from './app.js';
import { readIdentity } from './sidebar.js';

/* --- the student's own roster ----------------------------------------------
   Mirrors the Planner's BASE_BOARD (tools/build-planner-new.py regenerates the
   planner from it). The planner keeps its state inside its own iframe bundle,
   so the roster is restated here rather than read across that boundary. */

const ROSTER = {
  current: [
    ['CS 210', 'Data Structures & Algorithms'], ['MATH 152', 'Calculus II'],
    ['PHYS 141', 'Mechanics'], ['ENGL 220', 'Writing'], ['PSY 10', 'Intro to Psych'],
  ],
  taken: [
    ['CS 110', 'Intro to Programming'], ['MATH 151', 'Calculus I'], ['ENGL 101', 'Writing & Rhetoric'],
    ['HIST 120', 'World History'], ['CS 120', 'Object-Oriented Design'], ['CS 230', 'Computer Systems'],
    ['COMM 110', 'Public Speaking'], ['ART 105', 'Visual Culture'], ['CS 235', 'Intro to Data Science'],
    ['PHIL 210', 'Ethics & Technology'], ['ECON 101', 'Microeconomics'], ['SPAN 101', 'Elementary Spanish'],
  ],
  planned: [
    ['MATH 240', 'Discrete Mathematics'], ['MATH 260', 'Linear Algebra'], ['STAT 210', 'Introductory Statistics'],
    ['WRIT 200', 'Technical Writing'], ['CS 310', 'Algorithms'], ['STAT 250', 'Probability & Statistics'],
    ['CS 320', 'Databases'], ['LING 200', 'Language & Mind'], ['CS 330', 'Operating Systems'],
    ['CS 340', 'Software Engineering'], ['CS 245', 'Human–Computer Interaction'], ['BIOL 105', 'Human Biology & Lab'],
    ['CS 425', 'Distributed Systems'], ['CS 360', 'Machine Learning'], ['SOC 101', 'Sociology'],
    ['ASTR 110', 'Astronomy & Lab'], ['CS 450', 'Senior Capstone'], ['CS 380', 'Deep Learning Lab'],
  ],
};
const COURSE_NAME = Object.fromEntries([...ROSTER.current, ...ROSTER.taken, ...ROSTER.planned]);
const COURSE_WHEN = {};
ROSTER.current.forEach(([c]) => { COURSE_WHEN[c] = 'this term'; });
ROSTER.taken.forEach(([c]) => { COURSE_WHEN[c] = 'taken'; });
ROSTER.planned.forEach(([c]) => { COURSE_WHEN[c] = 'planned'; });
/* courses the student has actually sat in — what "you both took" can honestly claim */
const SAT_IN = new Set([...ROSTER.current, ...ROSTER.taken].map(([c]) => c));

const MAJORS = {
  cs: 'Computer Science', ece: 'Electrical & Computer Eng.', stats: 'Statistics & Data Science',
  design: 'Design', is: 'Information Systems', me: 'Mechanical Engineering',
  ce: 'Civil Engineering', cheme: 'Chemical Engineering',
};
const PROGRAM_MAJOR = { 'cmu-cs': 'cs', 'cmu-ce': 'ce', 'cmu-cheme': 'cheme', 'cmu-me': 'me' };

/* Quiz question 1's own vocabulary, minus "Not sure yet". */
const FIELDS = [
  'Technology & Engineering', 'Business & Finance', 'Healthcare & Medicine', 'Arts & Design',
  'Science & Research', 'Education', 'Law & Public Policy', 'Media & Communications',
];

/* --- alumni -----------------------------------------------------------------
   Invented, and illustrative: names, employers and reply times are placeholders
   for a real opt-in directory. In a real build every card exists because that
   person agreed to be contacted, per topic. */

const ALUMNI = [
  { id: 'priya', name: 'Priya Raman', year: 2023, major: 'cs', country: 'India',
    role: 'Software Engineer', company: 'Northgate Robotics', city: 'Pittsburgh, PA',
    path: 'CS → two robotics internships → return offer at Northgate',
    visa: 'F-1 → OPT → H-1B', fields: ['Technology & Engineering'],
    courses: ['CS 210', 'CS 120', 'CS 230', 'MATH 152', 'CS 310', 'CS 330'],
    topics: ['Breaking into robotics', 'OPT timing', 'New-grad interviews'], reply: 3, open: true,
    help: 'How I turned two robotics internships into a return offer, and how I timed OPT around a May graduation so there was no gap before my start date.',
    avoid: 'A referral in the first message — let’s talk first.',
    timeline: [['BS Computer Science, Carnegie Mellon', '2019 – 2023'], ['Intern, Northgate Robotics', 'Summer 2021'], ['Intern, Harborlight AI', 'Summer 2022'], ['Software Engineer, Northgate Robotics', '2023 – now']] },
  { id: 'daniel', name: 'Daniel Okafor', year: 2021, major: 'ece', country: 'Nigeria',
    role: 'Hardware Engineer', company: 'Allegheny Aerospace', city: 'Pittsburgh, PA',
    path: 'ECE → avionics co-op → full-time at Allegheny',
    visa: 'F-1 → STEM OPT → H-1B', fields: ['Technology & Engineering', 'Science & Research'],
    courses: ['CS 230', 'PHYS 141', 'MATH 152', 'MATH 260'],
    topics: ['Hardware vs software', 'STEM OPT extension', 'Aerospace'], reply: 5, open: true,
    help: 'Choosing hardware when everyone around you is going into software, and using the STEM OPT extension to get through the H-1B lottery.',
    avoid: 'Questions about specific salaries.',
    timeline: [['BS Electrical & Computer Eng., Carnegie Mellon', '2017 – 2021'], ['Avionics co-op, Allegheny Aerospace', 'Fall 2019'], ['Hardware Engineer, Allegheny Aerospace', '2021 – now']] },
  { id: 'linwei', name: 'Lin Wei Zhang', year: 2022, major: 'stats', country: 'China',
    role: 'Data Scientist', company: 'Lantern Health', city: 'Boston, MA',
    path: 'Statistics → research assistant → health data science',
    visa: 'F-1 → STEM OPT', fields: ['Science & Research', 'Healthcare & Medicine'],
    courses: ['CS 235', 'STAT 250', 'MATH 260', 'CS 360', 'PSY 10'],
    topics: ['Data science in healthcare', 'Stats vs CS', 'STEM OPT'], reply: 4, open: true,
    help: 'What data science actually looks like inside a hospital system, and whether a stats degree or a CS degree gets you there faster.',
    avoid: 'Asking me to review a whole project in the first chat.',
    timeline: [['BS Statistics & Data Science, Carnegie Mellon', '2018 – 2022'], ['Research assistant, Dept. of Statistics', '2020 – 2022'], ['Data Scientist, Lantern Health', '2022 – now']] },
  { id: 'marcus', name: 'Marcus Bell', year: 2020, major: 'cs', country: 'United States',
    role: 'Product Manager', company: 'Trellis Commerce', city: 'New York, NY',
    path: 'CS → two years engineering → moved into product',
    visa: null, fields: ['Business & Finance', 'Technology & Engineering'],
    courses: ['CS 210', 'CS 245', 'CS 340', 'ECON 101'],
    topics: ['Engineer to PM', 'Startup vs big company', 'Resume reviews'], reply: 2, open: true,
    help: 'Going from engineer to product manager without an MBA, and what to look for in your first startup.',
    avoid: 'Nothing off limits — just come with a question.',
    timeline: [['BS Computer Science, Carnegie Mellon', '2016 – 2020'], ['Software Engineer, Trellis Commerce', '2020 – 2022'], ['Product Manager, Trellis Commerce', '2022 – now']] },
  { id: 'sofia', name: 'Sofía Martínez', year: 2024, major: 'design', country: 'Mexico',
    role: 'UX Designer', company: 'Meridian Studio', city: 'Remote',
    path: 'Design → HCI minor → product design at Meridian',
    visa: 'F-1 → OPT', fields: ['Arts & Design', 'Technology & Engineering'],
    courses: ['CS 245', 'ART 105', 'PSY 10', 'COMM 110'],
    topics: ['Portfolios for CS students', 'HCI', 'Design internships'], reply: 4, open: true,
    help: 'Building a design portfolio when your background is technical, and how HCI courses translate into product work.',
    avoid: 'Portfolio critiques by email — I’m happy to do them on a call.',
    timeline: [['BDes Design, Carnegie Mellon', '2020 – 2024'], ['Design intern, Meridian Studio', 'Summer 2023'], ['UX Designer, Meridian Studio', '2024 – now']] },
  { id: 'arjun', name: 'Arjun Mehta', year: 2019, major: 'cs', country: 'India',
    role: 'ML Engineer', company: 'Harborlight AI', city: 'San Francisco, CA',
    path: 'CS → ML research → industry after a master’s',
    visa: 'F-1 → OPT → H-1B → green card', fields: ['Technology & Engineering', 'Science & Research'],
    courses: ['CS 210', 'CS 310', 'CS 360', 'CS 380', 'MATH 260', 'STAT 250'],
    topics: ['Machine learning careers', 'The H-1B lottery', 'Grad school vs industry'], reply: 9, open: false,
    help: 'Whether a master’s is worth it for ML, and the full visa path from F-1 to a green card — including the years it doesn’t go to plan.',
    avoid: 'Please don’t send your resume unprompted.',
    timeline: [['BS Computer Science, Carnegie Mellon', '2015 – 2019'], ['MS Machine Learning, Carnegie Mellon', '2019 – 2020'], ['ML Engineer, Harborlight AI', '2020 – now']] },
  { id: 'grace', name: 'Grace Owusu', year: 2022, major: 'is', country: 'Ghana',
    role: 'Consultant', company: 'Kettleman Capital', city: 'Chicago, IL',
    path: 'Information Systems → consulting club → strategy consulting',
    visa: 'F-1 → OPT → H-1B', fields: ['Business & Finance'],
    courses: ['CS 235', 'ECON 101', 'CS 320', 'COMM 110'],
    topics: ['Consulting recruiting', 'Case interviews', 'Finance for non-business majors'], reply: 3, open: true,
    help: 'How consulting recruiting runs a year ahead of everything else, and how to prepare for case interviews from a technical major.',
    avoid: 'Asking which firms sponsor visas — I’ll tell you what I know, but it changes yearly.',
    timeline: [['BS Information Systems, Carnegie Mellon', '2018 – 2022'], ['Summer analyst, Kettleman Capital', 'Summer 2021'], ['Consultant, Kettleman Capital', '2022 – now']] },
  { id: 'jaewon', name: 'Jae-won Park', year: 2021, major: 'me', country: 'South Korea',
    role: 'Robotics Engineer', company: 'Iron City Motion', city: 'Pittsburgh, PA',
    path: 'Mechanical → robotics club → autonomous systems',
    visa: 'F-1 → OPT → H-1B', fields: ['Technology & Engineering'],
    courses: ['PHYS 141', 'MATH 152', 'CS 110', 'MATH 260'],
    topics: ['Mechanical to robotics', 'Co-ops', 'Pittsburgh’s robotics scene'], reply: 5, open: true,
    help: 'Moving from mechanical engineering into robotics software, and which Pittsburgh companies hire co-ops.',
    avoid: 'Specific interview questions from my company.',
    timeline: [['BS Mechanical Engineering, Carnegie Mellon', '2017 – 2021'], ['Co-op, Iron City Motion', 'Spring 2020'], ['Robotics Engineer, Iron City Motion', '2021 – now']] },
  { id: 'ana', name: 'Ana Ribeiro', year: 2023, major: 'cs', country: 'Brazil',
    role: 'PhD student', company: 'Robotics Institute, Carnegie Mellon', city: 'Pittsburgh, PA',
    path: 'CS → undergraduate research → straight into a PhD',
    visa: 'F-1 (graduate)', fields: ['Science & Research', 'Education'],
    courses: ['CS 210', 'CS 360', 'MATH 240', 'CS 380'],
    topics: ['Applying to PhDs', 'Undergraduate research', 'Funding'], reply: 3, open: true,
    help: 'Getting into undergraduate research early, and what a PhD application actually weighs.',
    avoid: 'Asking me to introduce you to my advisor straight away.',
    timeline: [['BS Computer Science, Carnegie Mellon', '2019 – 2023'], ['Undergraduate researcher, Robotics Institute', '2021 – 2023'], ['PhD student, Robotics Institute', '2023 – now']] },
  { id: 'linh', name: 'Linh Tran', year: 2024, major: 'cs', country: 'Vietnam',
    role: 'Software Engineer, New Grad', company: 'Fielding Studio', city: 'Seattle, WA',
    path: 'CS → CPT internship → first new-grad offer',
    visa: 'F-1 → OPT', fields: ['Technology & Engineering', 'Media & Communications'],
    courses: ['CS 210', 'CS 120', 'CS 230', 'CS 340', 'WRIT 200'],
    topics: ['Your first job search', 'Offer negotiation', 'CPT internships'], reply: 2, open: true,
    help: 'The new-grad search from someone who just did it, including getting CPT approved for a junior-year internship.',
    avoid: 'Nothing — I remember how hard this was.',
    timeline: [['BS Computer Science, Carnegie Mellon', '2020 – 2024'], ['Intern (CPT), Fielding Studio', 'Summer 2023'], ['Software Engineer, Fielding Studio', '2024 – now']] },
  { id: 'ryan', name: 'Ryan Walsh', year: 2018, major: 'ce', country: 'United States',
    role: 'Transit Planner', company: 'Riverline Transit Partners', city: 'Pittsburgh, PA',
    path: 'Civil engineering → city planning master’s → public sector',
    visa: null, fields: ['Law & Public Policy', 'Technology & Engineering'],
    courses: ['PHYS 141', 'MATH 152', 'ECON 101'],
    topics: ['Civil to policy', 'Public-sector jobs', 'Grad school for planning'], reply: 6, open: true,
    help: 'Using an engineering degree in public policy, and what public-sector hiring looks like compared with industry.',
    avoid: 'Questions about private-sector salaries.',
    timeline: [['BS Civil Engineering, Carnegie Mellon', '2014 – 2018'], ['MS Urban Planning', '2018 – 2020'], ['Transit Planner, Riverline Transit Partners', '2020 – now']] },
  { id: 'mariam', name: 'Mariam Haddad', year: 2020, major: 'cheme', country: 'Jordan',
    role: 'Process Engineer', company: 'Sandcastle Bio', city: 'San Diego, CA',
    path: 'Chemical engineering → biotech internship → process engineering',
    visa: 'F-1 → OPT → H-1B', fields: ['Science & Research', 'Healthcare & Medicine'],
    courses: ['MATH 152', 'PHYS 141', 'BIOL 105', 'STAT 250'],
    topics: ['Biotech careers', 'Switching industries', 'H-1B for engineers'], reply: 7, open: true,
    help: 'Breaking into biotech from chemical engineering, and how the H-1B process worked at a mid-size company.',
    avoid: 'Asking me to forward your application internally.',
    timeline: [['BS Chemical Engineering, Carnegie Mellon', '2016 – 2020'], ['Intern, Sandcastle Bio', 'Summer 2019'], ['Process Engineer, Sandcastle Bio', '2020 – now']] },
];
const BY_ID = Object.fromEntries(ALUMNI.map((a) => [a.id, a]));

/* Routed through one alias, so no alum's personal address is ever published. */
const RELAY = 'alumni-chats@andrew.cmu.edu';

const PURPOSES = {
  career: { label: 'Career path', about: 'how you got from where I am to where you are' },
  day: { label: 'Day-in-the-life', about: 'what your work actually looks like day to day' },
  visa: { label: 'Visa & work authorisation', about: 'how you handled work authorisation as an international student' },
  grad: { label: 'Grad school', about: 'how you decided on grad school versus going straight into work' },
};

const QUESTIONS = {
  career: [
    'What do you wish you had done differently in your sophomore year?',
    'Which course or project turned out to matter most for getting hired?',
    'How did you find your first internship?',
  ],
  day: [
    'What does a normal week look like in your role?',
    'What part of the job surprised you most?',
    'What skills do you use that you didn’t learn in class?',
  ],
  visa: [
    'When did you start planning for OPT, and what would you do earlier?',
    'How did you bring up sponsorship with employers?',
    'Did CPT for an internship affect your OPT later?',
  ],
  grad: [
    'What made you decide for or against grad school?',
    'How early should I start research if I might apply to PhDs?',
    'Did a master’s change what roles you could get?',
  ],
};

const STATES = ['draft', 'sent', 'replied', 'scheduled', 'done'];
const STATE_LABEL = { draft: 'Draft', sent: 'Sent', replied: 'Replied', scheduled: 'Scheduled', done: 'Done' };
const OPEN_CAP = 3;
const NUDGE_DAYS = 7;
const DAY = 86400000;

/* --- small helpers ---------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

/* Every piece of text goes in through textContent; nothing is parsed as HTML. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c); });
  return el;
}

const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const firstName = (name) => name.trim().split(/\s+/)[0];
const ago = (t) => {
  const d = Math.floor((Date.now() - t) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/* --- the student ------------------------------------------------------------ */

function me() {
  const state = store.all();
  const quiz = (state.flightplan || {}).quiz || {};
  const auth = state.auth || {};
  return {
    name: readIdentity().name,
    major: PROGRAM_MAJOR[auth.programId] || 'cs',
    intl: quiz.intl !== false,
    fields: (quiz.fields || []).filter((f) => FIELDS.includes(f)),
    country: store.get('fields', 'al-country', ''),
  };
}

/* What the student and one alum genuinely have in common. */
function shared(a, m = me()) {
  const out = [];
  const both = a.courses.filter((c) => SAT_IN.has(c));
  if (both.length) out.push({ k: 'courses', text: `You both took ${both.slice(0, 2).join(' & ')}${both.length > 2 ? ` +${both.length - 2}` : ''}`, courses: both });
  if (m.country && a.country === m.country) out.push({ k: 'country', text: `Also from ${a.country}` });
  if (a.major === m.major) out.push({ k: 'major', text: `Also studied ${MAJORS[a.major]}` });
  if (m.intl && a.visa && a.visa.includes('OPT')) out.push({ k: 'visa', text: 'Went through OPT, as you will' });
  const f = a.fields.filter((x) => m.fields.includes(x));
  if (f.length) out.push({ k: 'field', text: `Works in ${f[0]}, a field you picked` });
  return out;
}

/* --- filters ---------------------------------------------------------------- */

function defaultFilters() {
  const m = me();
  const f = { q: '', flags: { visa: false, country: false, open: false }, majors: [m.major], fields: m.fields.slice(), courses: [] };
  /* Opening already filtered is the point — but never onto an empty page. */
  if (!matches(f).length) f.fields = [];
  if (!matches(f).length) f.majors = [];
  return f;
}

function loadFilters() {
  const saved = store.get('lists', 'al-filters');
  if (!saved) return defaultFilters();
  return {
    q: saved.q || '',
    flags: { visa: false, country: false, open: false, ...(saved.flags || {}) },
    majors: saved.majors || [], fields: saved.fields || [], courses: saved.courses || [],
  };
}

let F = null;
const saveFilters = () => store.set('lists', 'al-filters', F);

function matches(f) {
  const m = me();
  const q = f.q.trim().toLowerCase();
  return ALUMNI.filter((a) => {
    if (f.flags.visa && !(a.visa && /OPT|H-1B/.test(a.visa))) return false;
    if (f.flags.country && (!m.country || a.country !== m.country)) return false;
    if (f.flags.open && !a.open) return false;
    if (f.majors.length && !f.majors.includes(a.major)) return false;
    if (f.fields.length && !a.fields.some((x) => f.fields.includes(x))) return false;
    if (f.courses.length && !a.courses.some((c) => f.courses.includes(c))) return false;
    if (q) {
      /* A student types "visa" or "sponsorship", not "F-1 → OPT", so an alum
         with a visa path is also findable by the words people actually use. */
      const visaWords = a.visa ? 'visa international student f-1 opt cpt stem h-1b sponsorship work authorization' : '';
      const hay = [a.name, a.role, a.company, a.city, a.country, MAJORS[a.major], a.path, a.visa || '', visaWords,
        ...a.topics, ...a.fields, ...a.courses, ...a.courses.map((c) => COURSE_NAME[c] || '')].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const anyFilter = () => Boolean(F.q.trim() || F.flags.visa || F.flags.country || F.flags.open ||
  F.majors.length || F.fields.length || F.courses.length);

/* --- conversations ---------------------------------------------------------- */

const requests = () => store.get('lists', 'al-requests', {}) || {};
function setRequest(id, patch) {
  const all = requests();
  all[id] = { ...(all[id] || {}), ...patch, updatedAt: Date.now() };
  store.set('lists', 'al-requests', all);
}
function dropRequest(id) {
  const all = requests();
  delete all[id];
  store.set('lists', 'al-requests', Object.keys(all).length ? all : undefined);
}
const openCount = () => Object.values(requests()).filter((r) => ['sent', 'replied', 'scheduled'].includes(r.state)).length;

/* --- rendering: chips ------------------------------------------------------- */

function chip(label, on, onClick, extra = {}) {
  return h('button', { class: 'al-chip', type: 'button', 'aria-pressed': String(on), onclick: onClick, ...extra }, label);
}

function toggleIn(list, v) {
  const i = list.indexOf(v);
  if (i === -1) list.push(v); else list.splice(i, 1);
}

function renderChips() {
  const m = me();
  const count = (pred) => ALUMNI.filter(pred).length;

  const majors = Object.keys(MAJORS).filter((k) => ALUMNI.some((a) => a.major === k));
  $('alMajors').replaceChildren(...majors.map((k) => chip(
    [MAJORS[k], k === m.major ? ' (yours)' : '', ' ', h('span', { class: 'al-chip__count', text: String(count((a) => a.major === k)) })],
    F.majors.includes(k), () => { toggleIn(F.majors, k); update(); })));

  const fields = FIELDS.filter((x) => ALUMNI.some((a) => a.fields.includes(x)));
  $('alFields').replaceChildren(...fields.map((x) => chip(
    [x, m.fields.includes(x) ? ' ✓' : '', ' ', h('span', { class: 'al-chip__count', text: String(count((a) => a.fields.includes(x))) })],
    F.fields.includes(x), () => { toggleIn(F.fields, x); update(); },
    { title: m.fields.includes(x) ? 'You picked this field in onboarding' : null })));

  /* Only the student's own courses that at least one alum also took, this
     term's first — "alumni who took CS 210" is the whole idea. */
  const order = [...ROSTER.current, ...ROSTER.taken, ...ROSTER.planned].map(([c]) => c);
  const courses = order.filter((c) => ALUMNI.some((a) => a.courses.includes(c)));
  $('alCourses').replaceChildren(...courses.map((c) => chip(
    [c, ' ', h('span', { class: 'al-chip__count', text: String(count((a) => a.courses.includes(c))) })],
    F.courses.includes(c), () => { toggleIn(F.courses, c); update(); },
    { title: `${COURSE_NAME[c]} — ${COURSE_WHEN[c]}` })));

  document.querySelectorAll('[data-flag]').forEach((b) => b.setAttribute('aria-pressed', String(F.flags[b.dataset.flag])));

  const sel = $('alCountry');
  if (sel.options.length === 1) {
    [...new Set(ALUMNI.map((a) => a.country))].sort().forEach((c) => sel.append(h('option', { value: c, text: c })));
  }
  sel.value = m.country;
}

/* --- rendering: grid -------------------------------------------------------- */

let openId = null;

function card(a) {
  const req = requests()[a.id];
  const common = shared(a);
  const saved = Boolean(store.get('bookmarks', `al-${a.id}`, false));
  const slow = a.reply >= NUDGE_DAYS;

  const el = h('article', {
    class: `al-card${openId === a.id ? ' is-selected' : ''}`, tabindex: '0', 'data-id': a.id,
    'aria-label': `${a.name}, ${a.role} at ${a.company}`,
    onclick: (e) => { if (!e.target.closest('button, a')) openDetail(a.id); },
    onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); openDetail(a.id); } },
  },
    h('div', { class: 'al-card__top' },
      h('span', { class: 'al-avatar', 'aria-hidden': 'true', text: initials(a.name) }),
      h('div', {}, h('p', { class: 'al-card__name', text: a.name }), h('p', { class: 'al-card__year', text: `Class of ${a.year} · ${MAJORS[a.major]}` })),
      req ? h('span', { class: `al-state al-state--${req.state}`, text: STATE_LABEL[req.state].toUpperCase() }) : null),
    h('p', { class: 'al-card__now', text: `${a.role} · ${a.company} · ${a.city}` }),
    h('p', { class: 'al-card__path' }, h('b', { text: 'Then: ' }), a.path),
    a.visa ? h('span', { class: 'al-card__visa', text: a.visa }) : null,
    h('div', { class: 'al-topics' }, a.topics.map((t) => h('span', { class: 'al-topic', text: t }))),
    common.length ? h('p', { class: 'al-card__shared', text: common[0].text }) : null,
    h('p', { class: `al-card__reply${slow ? ' al-card__reply--slow' : ''}`,
      text: `${a.open ? '' : 'Not taking new chats right now · '}${slow ? `Slow to reply — about ${a.reply} days` : `Usually replies in ~${a.reply} days`}` }),
    h('div', { class: 'al-card__actions' },
      h('button', { class: 'btn btn--sm al-card__ask', type: 'button', disabled: !a.open && !req,
        onclick: () => (req && req.state !== 'draft' ? openDetail(a.id) : compose(a.id)) },
        req ? (req.state === 'draft' ? 'Finish your draft' : 'Open conversation') : 'Ask for a chat'),
      h('button', { class: 'al-bookmark', type: 'button', 'aria-pressed': String(saved), 'aria-label': saved ? `Unsave ${a.name}` : `Save ${a.name}`,
        onclick: () => { store.toggle('bookmarks', `al-${a.id}`); update(); }, text: saved ? '★' : '☆' })),
  );
  return el;
}

function renderGrid() {
  const list = matches(F);
  const grid = $('alGrid');
  if (!list.length) {
    grid.replaceChildren(h('div', { class: 'al-empty' },
      F.q.trim() ? `Nothing matches “${F.q.trim()}” with these filters. ` : 'No alumni match all of these filters. ',
      h('button', { type: 'button', onclick: clearAll, text: 'Clear all' }), ' to see everyone.'));
  } else {
    grid.replaceChildren(...list.map(card));
  }

  const parts = [];
  if (F.majors.length) parts.push(F.majors.map((k) => MAJORS[k]).join(' or '));
  if (F.fields.length) parts.push(F.fields.join(' or '));
  if (F.courses.length) parts.push(`took ${F.courses.join(' or ')}`);
  if (F.flags.visa) parts.push('OPT / H-1B');
  if (F.flags.country) parts.push(me().country ? `from ${me().country}` : 'from your country');
  if (F.flags.open) parts.push('open to chat');
  if (F.q.trim()) parts.push(`“${F.q.trim()}”`);
  $('alResult').textContent = `Showing ${list.length} of ${ALUMNI.length} alumni${parts.length ? ` · ${parts.join(' + ')}` : ''}`;
  $('alClear').disabled = !anyFilter();
}

/* --- rendering: header stats ------------------------------------------------ */

function renderStats() {
  const r = Object.values(requests());
  const n = (s) => r.filter((x) => x.state === s).length;
  const past = (s) => r.filter((x) => STATES.indexOf(x.state) >= STATES.indexOf(s)).length;
  const stat = (num, label) => h('button', { type: 'button', onclick: () => $('alConvos').scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    h('b', { text: String(num) }), ` ${label}`);
  $('alStats').replaceChildren(stat(n('draft'), n('draft') === 1 ? 'draft' : 'drafts'), stat(past('sent'), 'sent'),
    stat(past('replied'), 'replied'), stat(past('scheduled'), 'booked'));
}

/* --- rendering: conversations rail ------------------------------------------ */

function nextAction(a, r) {
  if (r.state === 'draft') return ['Finish draft', () => compose(a.id)];
  if (r.state === 'sent') {
    if (Date.now() - (r.sentAt || 0) >= NUDGE_DAYS * DAY) return ['Send a nudge', () => compose(a.id, { nudge: true }), 'al-convo__nudge'];
    return ['They replied', () => { setRequest(a.id, { state: 'replied' }); update(); }];
  }
  if (r.state === 'replied') return ['Booked a time', () => { setRequest(a.id, { state: 'scheduled' }); update(); }];
  if (r.state === 'scheduled') return ['Mark done', () => { setRequest(a.id, { state: 'done', doneAt: Date.now() }); update(); }];
  if (Date.now() - (r.doneAt || 0) < DAY) return ['Send thanks', () => compose(a.id, { thanks: true })];
  return ['Notes', () => openDetail(a.id)];
}

function metaLine(r) {
  if (r.state === 'draft') return `Draft saved ${ago(r.updatedAt)}`;
  if (r.state === 'sent') return `Sent ${ago(r.sentAt || r.updatedAt)} · waiting`;
  if (r.state === 'replied') return 'Replied — pick a time';
  if (r.state === 'scheduled') return 'Coffee chat booked';
  return `Done ${ago(r.doneAt || r.updatedAt)}`;
}

function renderConvos() {
  const all = requests();
  const ids = Object.keys(all).filter((id) => BY_ID[id]);
  const box = $('alConvoList');
  if (!ids.length) {
    box.replaceChildren(h('p', { class: 'al-convo-empty', text:
      'No conversations yet. Most students start with someone from their own major who graduated two to four years ago — close enough to remember, far enough to have answers.' }));
    return;
  }
  const groups = [
    ['NEEDS YOU', (r) => r.state === 'replied'],
    ['WAITING', (r) => r.state === 'sent'],
    ['BOOKED', (r) => r.state === 'scheduled'],
    ['DRAFTS', (r) => r.state === 'draft'],
    ['DONE', (r) => r.state === 'done'],
  ];
  const out = [];
  groups.forEach(([label, pred]) => {
    const rows = ids.filter((id) => pred(all[id])).sort((x, y) => (all[y].updatedAt || 0) - (all[x].updatedAt || 0));
    if (!rows.length) return;
    out.push(h('div', { class: 'al-convo-group' },
      h('p', { class: 'al-convo-group__label', text: label }),
      rows.map((id) => {
        const a = BY_ID[id]; const r = all[id];
        const [lbl, fn, cls] = nextAction(a, r);
        return h('div', { class: 'al-convo' },
          h('span', { class: 'al-avatar', 'aria-hidden': 'true', text: initials(a.name) }),
          h('div', { class: 'al-convo__who' },
            h('button', { type: 'button', class: 'al-convo__name', onclick: () => openDetail(id), text: a.name }),
            h('p', { class: 'al-convo__meta', text: metaLine(r) })),
          h('button', { type: 'button', class: `al-convo__next${cls ? ` ${cls}` : ''}`, onclick: fn, text: lbl }));
      })));
  });
  box.replaceChildren(...out);
}

/* --- rendering: question bank ----------------------------------------------- */

function renderBank() {
  const hint = h('p', { class: 'al-convo__meta', id: 'alBankHint', text: 'Tap a question to add it to your message.' });
  $('alBank').replaceChildren(
    ...Object.entries(QUESTIONS).map(([k, qs]) => [
      h('p', { class: 'al-bank__label', text: PURPOSES[k].label.toUpperCase() }),
      ...qs.map((q) => h('button', { type: 'button', class: 'al-bank__q', text: q, onclick: () => {
        if (composeId) { insertQuestion(q); return; }
        if (openId) { compose(openId, { question: q }); return; }
        hint.textContent = 'Open someone’s card first, then tap a question to add it.';
      } })),
    ]).flat(),
    hint);
}

/* --- detail pane ------------------------------------------------------------ */

function openDetail(id) {
  openId = id;
  const a = BY_ID[id];
  const r = requests()[id];
  const common = shared(a);
  const saved = Boolean(store.get('bookmarks', `al-${a.id}`, false));

  const pane = $('alDetail');
  /* replaceChildren stringifies anything that is not a Node — an array becomes
     "[object HTMLElement]" and a skipped section becomes the text "null" — so
     the optional sections are flattened and filtered first, as h() does. */
  const parts = [
    h('button', { class: 'al-detail__close', type: 'button', 'aria-label': 'Close', onclick: closeDetail, text: '×' }),
    h('div', { class: 'al-detail__head' },
      h('span', { class: 'al-avatar', 'aria-hidden': 'true', text: initials(a.name) }),
      h('div', {}, h('p', { class: 'al-detail__name', text: a.name }),
        h('p', { class: 'al-detail__now', text: `${a.role} · ${a.company} · ${a.city}` }))),
    a.visa ? h('span', { class: 'al-card__visa', text: a.visa }) : null,

    h('p', { class: 'al-detail__label', text: 'THEIR PATH' }),
    h('ol', { class: 'al-timeline' }, a.timeline.map(([what, when]) => h('li', {}, what, h('span', { text: when })))),

    h('p', { class: 'al-detail__label', text: 'WHAT I CAN HELP WITH' }),
    h('p', { text: a.help }),
    h('p', { class: 'al-detail__label', text: 'PLEASE DON’T ASK FIRST' }),
    h('p', { class: 'al-detail__avoid', text: a.avoid }),

    common.length ? [h('p', { class: 'al-detail__label', text: 'WHAT YOU SHARE' }),
      h('ul', { class: 'al-shared-list' }, common.map((c) => h('li', { text: c.text })))] : null,

    r ? [
      h('p', { class: 'al-detail__label', text: 'YOUR CONVERSATION' }),
      h('div', { class: 'al-flow', role: 'group', 'aria-label': 'Conversation status' },
        STATES.map((s) => h('button', { type: 'button', 'aria-pressed': String(r.state === s), text: STATE_LABEL[s],
          onclick: () => {
            const patch = { state: s };
            if (s === 'sent' && !r.sentAt) patch.sentAt = Date.now();
            if (s === 'done') patch.doneAt = Date.now();
            setRequest(id, patch); update(); openDetail(id);
          } }))),
      h('textarea', { class: 'al-notes', 'aria-label': `Private notes about ${a.name}`, placeholder: 'Private notes — what you talked about, what to follow up on',
        oninput: (e) => store.set('fields', `al-note-${id}`, e.target.value || undefined) }),
    ] : null,

    h('div', { class: 'al-detail__actions' },
      a.open || r ? h('button', { class: 'btn btn--sm', type: 'button', onclick: () => compose(id),
        text: !r ? 'Ask for a chat' : r.state === 'draft' ? 'Finish your draft' : 'Write again' })
        : h('p', { class: 'al-convo__meta', text: `${firstName(a.name)} isn’t taking new chats right now.` }),
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-pressed': String(saved),
        onclick: () => { store.toggle('bookmarks', `al-${a.id}`); update(); openDetail(id); }, text: saved ? '★ Saved' : '☆ Save' }),
      r ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: 'Remove conversation',
        onclick: () => { dropRequest(id); update(); openDetail(id); } }) : null),
  ];
  pane.replaceChildren(...parts.flat().filter(Boolean));
  const notes = pane.querySelector('.al-notes');
  if (notes) notes.value = store.get('fields', `al-note-${id}`, '');

  $('alConvos').hidden = true;
  $('alPrep').hidden = true;
  pane.hidden = false;
  renderGrid();
  pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeDetail() {
  openId = null;
  $('alDetail').hidden = true;
  $('alConvos').hidden = false;
  $('alPrep').hidden = false;
  renderGrid();
}

/* --- composer --------------------------------------------------------------- */

let composeId = null;
let purpose = 'career';
let touched = false;

function draftFor(a, p, opts = {}) {
  const m = me();
  const mine = firstName(m.name);
  const them = firstName(a.name);
  if (opts.nudge) return `Hi ${them} — just floating this back up in case it got buried. Totally understand if now isn’t a good time.\n\nThanks,\n${mine}`;
  if (opts.thanks) return `Hi ${them} — thank you for making time to talk. It helped a lot, especially what you said about ${a.topics[0].toLowerCase()}. I’ll let you know how it goes.\n\nThanks again,\n${mine}`;
  const common = shared(a, m);
  const c = common.find((x) => x.k === 'courses');
  const hook = c
    ? `I saw you also took ${c.courses[0]} and are now at ${a.company}.`
    : common.find((x) => x.k === 'country')
      ? `I saw you’re also from ${a.country} and are now at ${a.company}.`
      : `I came across your path to ${a.company}.`;
  const qs = QUESTIONS[p].slice(0, 2).map((q) => `• ${q}`).join('\n');
  return `Hi ${them} — I’m ${mine}, a sophomore studying ${MAJORS[m.major]} at Carnegie Mellon. ${hook} Would you have 15 minutes to talk about ${PURPOSES[p].about}?\n\nA couple of things I’m curious about:\n${qs}\n\nNo pressure if you’re busy — thank you either way.\n${mine}`;
}

const words = (s) => (s.trim().match(/\S+/g) || []).length;

function paintMeter() {
  const n = words($('alBody').value);
  const meter = $('alMeter');
  meter.textContent = n > 120 ? `${n} words — long. The best first notes are under 120.` : `${n} words — a good length.`;
  meter.classList.toggle('is-long', n > 120);
  const a = BY_ID[composeId];
  const subject = `Coffee chat request for ${a.name}`;
  $('alMail').href = `mailto:${RELAY}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent($('alBody').value)}`;
}

function renderPurposes(a, opts) {
  $('alPurposes').replaceChildren(...Object.entries(PURPOSES).map(([k, v]) => chip(v.label, purpose === k, () => {
    purpose = k;
    if (!touched) $('alBody').value = draftFor(a, purpose, opts);
    renderPurposes(a, opts); renderSuggest(); paintMeter();
  })));
}

function renderSuggest() {
  $('alSuggest').replaceChildren(...QUESTIONS[purpose].map((q) => h('button', { type: 'button', text: `+ ${q}`, onclick: () => insertQuestion(q) })));
}

function insertQuestion(q) {
  const body = $('alBody');
  const line = `• ${q}`;
  if (body.value.includes(line)) return;
  const lines = body.value.split('\n');
  let at = -1;
  lines.forEach((l, i) => { if (l.startsWith('• ')) at = i; });
  if (at === -1) lines.splice(Math.max(1, lines.length - 2), 0, '', line); else lines.splice(at + 1, 0, line);
  body.value = lines.join('\n');
  touched = true;
  paintMeter();
  flash('Question added.');
}

function flash(text) {
  const done = $('alDone');
  done.textContent = text;
  done.hidden = false;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { done.hidden = true; }, 2200);
}

function compose(id, opts = {}) {
  const a = BY_ID[id];
  const r = requests()[id];
  composeId = id;
  const m = me();
  purpose = (r && r.purpose) || (m.intl && a.visa ? 'visa' : 'career');
  touched = false;

  $('alComposeTitle').textContent = opts.nudge ? `Nudge ${firstName(a.name)}` : opts.thanks ? `Thank ${firstName(a.name)}` : a.name;
  $('alComposeMeta').textContent = `${a.role} · ${a.company} · via Alumni Relations`;
  const body = $('alBody');
  if (!opts.nudge && !opts.thanks && r && r.body) { body.value = r.body; touched = true; } else body.value = draftFor(a, purpose, opts);
  if (opts.question) insertQuestion(opts.question);

  const cap = openCount() >= OPEN_CAP && (!r || r.state === 'draft');
  $('alComposeNote').textContent = (cap
    ? `You already have ${openCount()} open conversations. Alumni reply more often when students wait for one to wrap up before starting another. `
    : '') + 'Flightplan has no outbox, so nothing is sent from here. Copy the message or open it in your mail app — it goes through Alumni Relations’ chat alias, so no one’s personal address is shown — then mark it sent.';
  $('alSend').textContent = r && r.state !== 'draft' ? 'Update' : 'Mark as sent';

  renderPurposes(a, opts);
  renderSuggest();
  paintMeter();
  $('alDone').hidden = true;
  openModal('alCompose');
  body.focus();
  body.setSelectionRange(0, 0);
}

function wireComposer() {
  $('alBody').addEventListener('input', () => { touched = true; paintMeter(); });

  $('alSave').addEventListener('click', () => {
    const r = requests()[composeId];
    setRequest(composeId, { state: r ? r.state : 'draft', purpose, body: $('alBody').value });
    flash('Draft saved.');
    update();
  });

  $('alCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('alBody').value); flash('Copied — paste it into your email.'); }
    catch { $('alBody').select(); flash('Selected — press Ctrl+C to copy.'); }
  });

  $('alSend').addEventListener('click', () => {
    const r = requests()[composeId];
    const patch = { purpose, body: $('alBody').value };
    if (!r || r.state === 'draft') { patch.state = 'sent'; patch.sentAt = Date.now(); }
    else if (r.state === 'sent' && Date.now() - (r.sentAt || 0) >= NUDGE_DAYS * DAY) patch.sentAt = Date.now();
    setRequest(composeId, patch);
    closeModal('alCompose');
    const id = composeId;
    composeId = null;
    update();
    if (openId === id) openDetail(id);
  });

  /* closing the modal any other way leaves the composer un-targeted */
  $('alCompose').addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) composeId = null; });
  $('alCompose').querySelector('[data-modal-close]').addEventListener('click', () => { composeId = null; });
}

/* --- top-level -------------------------------------------------------------- */

function clearAll() {
  F = { q: '', flags: { visa: false, country: false, open: false }, majors: [], fields: [], courses: [] };
  $('alQ').value = '';
  update();
}

function update() {
  saveFilters();
  renderChips();
  renderGrid();
  renderStats();
  renderConvos();
}

function boot() {
  F = loadFilters();
  $('alQ').value = F.q;

  $('alQ').addEventListener('input', (e) => { F.q = e.target.value; saveFilters(); renderGrid(); });
  $('alClear').addEventListener('click', clearAll);
  $('alFind').addEventListener('click', () => { $('alQ').focus(); $('alQ').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  document.querySelectorAll('[data-flag]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.flag;
    if (k === 'country' && !me().country) { $('alCountry').focus(); return; }
    F.flags[k] = !F.flags[k];
    update();
  }));
  $('alCountry').addEventListener('change', (e) => {
    store.set('fields', 'al-country', e.target.value || undefined);
    F.flags.country = Boolean(e.target.value);
    update();
  });

  /* Escape closes the detail pane when no modal is open. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openId && !document.querySelector('.modal-backdrop.is-open')) closeDetail();
  });

  wireComposer();
  renderBank();
  update();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
