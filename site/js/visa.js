/* International Student Visa — Figma 421:276.

   Everything that persists goes through the shared helpers in app.js:
   the seven roadmap lessons and the five quick-question chips are all
   [data-check] inputs, so app.js restores and stores them. This module only
   adds the derived bits the frame draws as static text:

     · the "N of 7 done" line and the roadmap progress bar
     · the "Continue: …" link, which points at the first unfinished lesson
     · the OIE mail link, built from whichever question chips are lit
     · the SSN step-2 letter link, an OIE mail naming the signed-in student
     · the "Needs your attention" count, and each alert's OIE mail link
     · opening the folded roadmap when "Continue" or a lesson link needs it

   NOTE ON ORDER: this module's body runs before app.js's DOMContentLoaded
   handler (both are deferred modules, and app.js registers its listener when
   its body runs). That is deliberate — the default two ticked lessons are
   seeded into the store here, so initChecks picks them up. */

import { store } from './store.js';
import { readIdentity } from './sidebar.js';

/* --- one-time seed: the frame ships with the first two lessons done -------- */

if (!store.get('fields', 'visa-seeded')) {
  store.set('checks', 'visa-lesson-1', true);
  store.set('checks', 'visa-lesson-2', true);
  store.set('fields', 'visa-seeded', '1');
}

/* --- derived UI ------------------------------------------------------------ */

const OIE = 'oie@andrew.cmu.edu';

const lessons  = [...document.querySelectorAll('#lessons .vs-check')];
const lede     = document.getElementById('roadmapLede');
const bar      = document.getElementById('roadmapBar');
const cont     = document.getElementById('roadmapContinue');
const chips    = [...document.querySelectorAll('#quickQuestions input[data-check]')];
const send     = document.getElementById('sendQuestion');
const letter   = document.getElementById('requestLetter');
const fold     = document.getElementById('roadmapFold');
const alerts   = [...document.querySelectorAll('.vs-alert input[data-check]')];
const alertCt  = document.getElementById('alertCount');

/* Every OIE mail on this page is composed here, so the address lives once.
   A body-less call keeps the plain `mailto:…?subject=…` the chips have always
   produced — the audit liked that link exactly as it is. */
function oieMailto(subject, body) {
  const qs = `subject=${encodeURIComponent(subject)}`;
  return `mailto:${OIE}?${body ? `${qs}&body=${encodeURIComponent(body)}` : qs}`;
}

function titleOf(input) {
  return input.closest('.vs-lesson').querySelector('.vs-lesson__title').textContent;
}

function paintRoadmap() {
  const done = lessons.filter((el) => el.checked).length;
  lede.textContent = `10-minute lessons, in plain language. ${done} of ${lessons.length} done.`;
  bar.style.width = `${(done / lessons.length) * 100}%`;

  const next = lessons.find((el) => !el.checked);
  cont.textContent = next
    ? `Continue: ${titleOf(next)} →`
    : 'Every lesson done — Pigeon is impressed →';
}

function paintQuestion() {
  const picked = chips
    .filter((el) => el.checked)
    .map((el) => el.closest('.vs-chip').textContent.trim());
  const subject = picked.length ? picked.join(', ') : 'Question about my F-1 status';
  send.href = oieMailto(subject);
}

/* Step 2 of "Getting your SSN" promises one click, so the link ships a working
   plain mailto in the markup and is upgraded here with the student's name. */
function paintLetter() {
  const { name } = readIdentity();
  const body =
    `Hello OIE,\n\n` +
    `My name is ${name}. I have accepted a job offer and would like to request ` +
    `an enrolment / SSN support letter so that I can apply for a Social Security ` +
    `number.\n\nPlease let me know if you need anything else from me.\n\n` +
    `Thank you,\n${name}`;
  letter?.setAttribute('href', oieMailto(`SSN support letter request — ${name}`, body));
}

/* app.js restores the stored values on DOMContentLoaded; this listener is
   registered later, so it runs after that and sees the restored state. */
/* The alert strip's count reads what is still open; a ticked alert folds down
   to its title so the ones left keep the attention. */
function paintAlerts() {
  const open = alerts.filter((el) => !el.checked).length;
  alertCt.textContent = open ? `${open} to do` : 'All done — nice work';
  alertCt.classList.toggle('is-clear', !open);
}

document.querySelectorAll('[data-oie-subject]').forEach((a) => {
  a.href = oieMailto(a.dataset.oieSubject);
});

document.addEventListener('DOMContentLoaded', () => {
  paintAlerts();
  paintRoadmap();
  paintQuestion();
  paintLetter();
});

lessons.forEach((el) => el.addEventListener('change', paintRoadmap));
chips.forEach((el) => el.addEventListener('change', paintQuestion));
alerts.forEach((el) => el.addEventListener('change', paintAlerts));

/* --- "Continue" opens the folded course at the next lesson ------------------ */

cont?.addEventListener('click', (e) => {
  e.preventDefault();
  if (fold) fold.open = true;
  const next = lessons.find((el) => !el.checked);
  next?.closest('.vs-lesson').scrollIntoView({ block: 'center', behavior: 'smooth' });
});
