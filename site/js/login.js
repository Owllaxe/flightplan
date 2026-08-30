/* Build B's auth gate (spec §1.3 / §1.4) — the screens, faithfully; the
   function, honestly.

   B's `submitAuth` POSTs to `/auth/login` or `/auth/signup`, reads back a
   Bearer token and a `user`, and stores both under `compass.auth.v1`. That
   server was never delivered. So this module keeps B's exact state machine —
   two modes, three steps, the same copy, the same validation order, the same
   Enter-to-submit — and replaces step 4 (the request) with a localStorage
   write through js/store.js. Nothing is sent anywhere and nothing is verified.

   What was dropped or relabelled, and why:

     · Password — kept in the markup so the card's composition is B's, but
       `disabled` and labelled as such. A client-side check against a hardcoded
       value would authenticate nothing while looking like it does, so there is
       no check at all, the field is never read, and nothing is ever stored
       from it. B's "Email and password are required." therefore becomes
       "Email is required." — the old copy would be asking for something the
       screen no longer takes.

     · "Keep me signed in on this device" → "Remember me on this device".
       B's own mechanism was local (localStorage vs sessionStorage), and that
       part ports exactly: on ⇒ the record survives the browser session, off ⇒
       it does not. Only the words "signed in" go, because there is no session
       on any server to keep.

     · The school/major list — B fetches `GET /schools`. There is no catalog
       service, so the four programs shipped in `backend-data-update.zip`
       (cmu-cs / cmu-ce / cmu-cheme / cmu-me, school "CMU") are inlined in
       login.html. With the list always present, B's "Loading programs…" /
       "Program list unavailable" / RETRY box and its matching submit error
       ("Cannot load the program list…") have nothing to describe and are gone.

     · "Change password" and the SYNCED badge live elsewhere in B and were not
       ported at all — both are statements about a server.

   Everything else — the brand lockup at 42px, the card, the two-step signup,
   the mode switch, the error banner, the ← Back step, Enter-to-submit — is B. */

import { signIn, isSignedIn } from './app.js';

/* app.js's gate has already redirected away if we are signed in; if it did,
   there is nothing to wire up. */
if (!isSignedIn()) {

  const form = document.getElementById('authForm');
  const titleEl = document.getElementById('authTitle');
  const subEl = document.getElementById('authSub');
  const stepName = document.getElementById('stepName');
  const stepAccount = document.getElementById('stepAccount');
  const firstEl = document.getElementById('authFirst');
  const lastEl = document.getElementById('authLast');
  const emailEl = document.getElementById('authEmail');
  const programBlock = document.getElementById('programBlock');
  const programEl = document.getElementById('authProgram');
  const rememberEl = document.getElementById('authRemember');
  const rememberLabel = document.getElementById('authRememberLabel');
  const submitEl = document.getElementById('authSubmit');
  const backEl = document.getElementById('authBack');
  const errorEl = document.getElementById('authError');
  const switchEl = document.getElementById('authSwitch');

  /* B's state (spec §1.3): authMode ∈ {login, signup} default login;
     authStep ∈ {name, account} default account; authRemember default on. */
  let mode = 'login';
  let step = 'account';
  let remember = true;
  let error = '';

  const COPY = {
    login:   { title: 'Welcome back',       sub: 'Sign in to open your plan.',                        submit: 'Sign in' },
    name:    { title: 'Tell us your name',  sub: 'First, what should we call you?',                    submit: 'Continue' },
    account: { title: 'Create your account', sub: 'Now pick your sign-in details and your program.',   submit: 'Create account' },
  };

  const stepIsName = () => mode === 'signup' && step === 'name';

  function render() {
    const copy = mode === 'login' ? COPY.login : (stepIsName() ? COPY.name : COPY.account);

    titleEl.textContent = copy.title;
    subEl.textContent = copy.sub;
    submitEl.textContent = copy.submit;

    stepName.hidden = !stepIsName();
    stepAccount.hidden = stepIsName();
    programBlock.hidden = mode !== 'signup';
    backEl.hidden = !(mode === 'signup' && step === 'account');

    switchEl.textContent = mode === 'signup'
      ? 'Already have an account? Sign in'
      : 'New here? Create an account';

    rememberEl.setAttribute('aria-checked', String(remember));

    errorEl.hidden = !error;
    errorEl.textContent = error;

    const focusEl = stepIsName() ? firstEl : emailEl;
    if (document.activeElement === document.body) focusEl.focus();
  }

  function fail(message) {
    error = message;
    render();
    errorEl.scrollIntoView({ block: 'nearest' });
  }

  /* B's submitAuth, minus the network. Same order, same messages, except the
     two that described things this build does not have (see the header). */
  function submitAuth() {
    error = '';

    if (stepIsName()) {
      if (!firstEl.value.trim() || !lastEl.value.trim()) {
        fail('Please enter your first and last name.');
        return;
      }
      step = 'account';
      render();
      emailEl.focus();
      return;
    }

    const email = emailEl.value.trim();
    if (!email) {
      fail('Email is required.');
      return;
    }

    signIn({
      email,
      displayName: email.split('@')[0],
      firstName: mode === 'signup' ? firstEl.value.trim() : '',
      lastName: mode === 'signup' ? lastEl.value.trim() : '',
      programId: mode === 'signup' ? programEl.value : undefined,
      sessionOnly: remember ? undefined : true,
    });

    /* B hands off to the app, which then decides whether to open the quiz.
       Here that decision lives in js/app.js and runs on the next page. */
    const next = new URLSearchParams(location.search).get('next');
    const safe = /^[A-Za-z0-9._-]+\.html(?:[?#][^\s]*)?$/.test(String(next || ''))
      && !/^login\.html/i.test(next);
    location.replace(safe ? next : 'index.html');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAuth();
  });

  /* Enter anywhere on the gate submits (B's onAuthKey, line 5323). The form's
     own submit handles it for the inputs; the select needs it spelled out. */
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'SELECT') {
      e.preventDefault();
      submitAuth();
    }
  });

  backEl.addEventListener('click', () => {
    step = 'name';
    error = '';
    render();
    firstEl.focus();
  });

  switchEl.addEventListener('click', () => {
    mode = mode === 'signup' ? 'login' : 'signup';
    step = mode === 'signup' ? 'name' : 'account';
    error = '';
    render();
    (stepIsName() ? firstEl : emailEl).focus();
  });

  const toggleRemember = () => { remember = !remember; render(); };
  rememberEl.addEventListener('click', toggleRemember);
  rememberLabel.addEventListener('click', toggleRemember);

  render();
  emailEl.focus();
}
