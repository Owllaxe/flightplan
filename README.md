# Flightplan

A career and academic planner for international students, built from the
[Stellic FrontEnd Design](https://www.figma.com/design/Bg342a4k8osKHaxsL09w5q/Stellic-FrontEnd-Design)
Figma file. Plain HTML, CSS and ES modules — no build step, no dependencies,
no backend.

## Run

```bash
python site/tools/serve.py 5173
```

Then open <http://localhost:5173>. Use this rather than `python -m http.server`:
it sends `Cache-Control: no-store` on every response, so edits always show up
without a hard refresh.

## Layout

| Path | What it is |
| --- | --- |
| `site/` | The site. Start at `site/login.html`; `index.html` is the home dashboard. |
| `site/tools/` | Dev server, asset cache-stamper, and the planner build script. |
| `site/assets/` | Images, icons and the Pathfinder Hand webfont. |
| `Compass Planner.html` | Original single-file course planner this project grew out of. |
| `build/`, `scripts/` | Upstream artefacts inherited from the original repo. |

See [`site/README.md`](site/README.md) for the page-by-page breakdown and which
Figma frame each one came from.

## History

Forked from the Pathfinders Challenge project at
[Oninelol/Stellic-Pathfinders](https://github.com/Oninelol/Stellic-Pathfinders),
kept as the `stellic` remote. That repository is unchanged; all work continues
here.
