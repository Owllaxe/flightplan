#!/usr/bin/env python3
"""Dev server for the site that never lets the browser cache anything.

`python -m http.server` sends Last-Modified and no Cache-Control, so browsers
heuristically cache HTML documents too — which meant edited pages kept serving
their old markup. This sends no-store on every response, so a reload always
gets the current file. Assets are additionally content-stamped by
tools/stamp-assets.py, which is what keeps them fresh anywhere else.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # site/


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_response(self, *args, **kwargs):           # drop Last-Modified too
        super().send_response(*args, **kwargs)

    def log_message(self, fmt, *args):
        pass                                            # quiet


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    handler = partial(NoCacheHandler, directory=str(ROOT))
    print(f'serving {ROOT} at http://localhost:{port}  (no-store)')
    ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()


if __name__ == '__main__':
    main()
