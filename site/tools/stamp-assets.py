#!/usr/bin/env python3
"""Content-stamp every local css/js reference so a stale file cannot be served.

Rewrites  href="css/base.css"  ->  href="css/base.css?v=1a2b3c4d"
where the token is the first 8 hex of the file's md5. Re-run after any edit:
changed files get a new token, unchanged files keep theirs, so the browser
re-fetches exactly what changed and nothing else.
"""
import hashlib, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # site/
# CSS only — deliberately NOT js.
#
# A browser keys an ES module by its full resolved URL, query string included.
# Stamping a <script src="js/app.js?v=..."> while js/home.js still imports the
# bare "./app.js" makes those two different keys, so app.js is instantiated
# TWICE and its module body runs twice — which opened two onboarding quizzes
# on index.html and double-bound every handler init() installs.
#
# Stylesheets have no import graph and cannot duplicate this way, so they keep
# their stamps. JS freshness comes from the server instead: tools/serve.py
# sends no-store locally, and GitHub Pages revalidates via ETag.
# The existing-token group is deliberately `[^"]*` rather than `[0-9a-f]+`.
# With the strict version, a hand-written token like `?v=career2` matched
# nothing, so the whole ref was skipped -- and the script still reported
# success, leaving a stale stylesheet pinned forever behind a token that
# never changes. Accepting any token means anything already there is
# replaced by the real hash.
PAT = re.compile(r'(?P<attr>href|src)="(?P<path>css/[A-Za-z0-9._/-]+\.css)(?:\?v=[^"]*)?"')

def stamp(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()[:8]

cache, changed, refs = {}, [], 0
for page in sorted(ROOT.glob('*.html')):
    if page.name.startswith('planner-'):                # bundled artifacts, no local refs
        continue
    src = page.read_text(encoding='utf-8')

    def sub(m):
        global refs
        rel = m.group('path')
        target = ROOT / rel
        if not target.exists():
            print(f'  !! {page.name}: missing {rel}')
            return m.group(0)
        if rel not in cache:
            cache[rel] = stamp(target)
        refs += 1
        return f'{m.group("attr")}="{rel}?v={cache[rel]}"'

    out = PAT.sub(sub, src)
    if out != src:
        page.write_text(out, encoding='utf-8')
        changed.append(page.name)

print(f'stamped {refs} refs across {len(changed)} page(s)')
for n in changed:
    print('  ', n)
