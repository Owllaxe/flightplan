"""Build jordandemo/ — the standalone copy of site/ used for the demo recording.

Run it from the repo root after any change to site/:

    python scripts/build-demo.py

It rebuilds jordandemo/ from scratch, so never edit jordandemo/ by hand; make
the change in site/ (where the real site lives) and run this again.

What the demo copy does differently:
  * no sign-in at all — login.html and js/login.js are dropped and nothing
    redirects to them;
  * it signs itself in as Jordan Lee, so the first thing on screen is the
    pigeon's onboarding quiz;
  * SIGN OUT becomes RESET DEMO: it clears what the browser remembers and
    starts again from the quiz, which is the one-click reset between takes.

jordandemo/ is listed in .gitignore, so it never reaches GitHub Pages.
"""
import io
import os
import shutil

SRC = 'site'
DST = 'jordandemo'

if os.path.exists(DST):
    shutil.rmtree(DST)
shutil.copytree(SRC, DST)

# the gate page and its module have no job here
os.remove(os.path.join(DST, 'login.html'))
os.remove(os.path.join(DST, 'js', 'login.js'))
# css/login.css stays: the quiz overlay's styles live in it, and app.js injects it

p = os.path.join(DST, 'js', 'app.js')
s = io.open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


rep("""export function signOut() {
  store.replace({ auth: undefined });   /* JSON.stringify drops the key */
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  location.replace(LOGIN_PAGE);
}""",
"""/* DEMO BUILD. There is no sign-in here, so this is "start the demo over":
   everything this browser remembers is dropped and the quiz runs again. */
export function signOut() {
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  location.replace('index.html');
}""")

rep("""function runGate() {
  if (isLoginPage()) {
    if (isSignedIn()) {
      const next = safeNext(new URLSearchParams(location.search).get('next')) || 'index.html';
      location.replace(next);
      return true;
    }
    return false;
  }
  if (!isSignedIn()) {
    document.documentElement.style.visibility = 'hidden';
    location.replace(`${LOGIN_PAGE}?next=${encodeURIComponent(currentPageRef())}`);
    return true;
  }
  return false;
}""",
"""/* DEMO BUILD. The gate is gone: instead of sending a signed-out visitor to
   login.html, the demo signs itself in as Jordan Lee on first load, so the very
   first thing on screen is the pigeon's quiz. Nothing ever redirects. */
const DEMO_STUDENT = 'Jordan Lee';

function runGate() {
  if (!isSignedIn()) {
    signIn({ email: 'jordan@andrew.cmu.edu', firstName: 'Jordan', lastName: 'Lee' });
  }
  store.replace({ identity: { name: DEMO_STUDENT, initials: 'JL' } });
  return false;
}""")

rep("type: 'button', class: 'signout', text: 'SIGN OUT',",
    "type: 'button', class: 'signout', text: 'RESET DEMO',")
rep("title: 'Leave the prototype and return to the gate',",
    "title: 'Clear this browser and start the demo from the quiz again',")

# comments that describe a gate this build does not have
s = s.replace("     · the prototype gate  (§ GATE)      — signed out ⇒ login.html",
              "     · the demo sign-in (§ GATE)      — always Jordan Lee, no login page")
s = s.replace("   relabelled — see login.html and js/login.js.",
              "   relabelled — the demo build sets it to Jordan Lee.")
s = s.replace("""     · not login.html + signed out  ⇒ go to login.html
     · login.html     + signed in   ⇒ go to ?next (validated) or index.html
   login.html is never gated; nothing ever redirects to the page it is on.""",
              """   DEMO BUILD: there is no gate. runGate below signs the demo student in and
   returns false, so no page ever redirects.""")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# nothing should link to the page that is gone
for name in sorted(os.listdir(DST)):
    if not name.endswith('.html'):
        continue
    q = os.path.join(DST, name)
    t = io.open(q, encoding='utf-8').read()
    if 'login.html' in t:
        t = t.replace('<a class="link" href="login.html">Sign in</a>', '')
        io.open(q, 'w', encoding='utf-8', newline='\n').write(t)

io.open(os.path.join(DST, 'README-demo.txt'), 'w', encoding='utf-8', newline='\n').write(
    """Flightplan - demo copy (jordandemo/)

A standalone copy of site/ for the demo recording. It is rebuilt by
scripts/build-demo.py, so make changes in site/ and run that script again
rather than editing anything in here.

What is different:
  * No sign-in. login.html is gone and nothing redirects to it.
  * It signs itself in as Jordan Lee, so the first thing on screen is the
    pigeon's onboarding quiz.
  * SIGN OUT in the menu is now RESET DEMO: it clears everything this browser
    remembers and starts again from the quiz - one click between takes.

Run it:
  python jordandemo/tools/serve.py 5175
  then open http://localhost:5175
""")
print('built', DST)
