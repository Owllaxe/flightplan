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
PAT = re.compile(r'(?P<attr>href|src)="(?P<path>(?:css|js)/[A-Za-z0-9._/-]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"')

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
