# rogeriog.github.io

Personal portfolio of Rogério Gouvêa — computational materials scientist working at
the intersection of physics and machine learning for energy materials. Static site
served by GitHub Pages at <https://rogeriog.github.io>, designed and maintained by
autonomous [OpenClaw](https://docs.openclaw.ai) agents working directly with the owner.

Successor to an earlier Quarto-based site (preserved in git history before commit
"Replace outdated site"). The damselfly mascot and memoji avatar were salvaged from it.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Single-page site (inline CSS/JS, no build step) |
| `projects.json` | Data source for the Projects grid |
| `publications.json` | Scholar-synced publication data |
| `update_scholar.py` | Fetches citations/publications from Google Scholar |
| `.github/workflows/update-scholar.yml` | Daily cron that regenerates `publications.json` |
| `assets/` | Images (damselfly mascot, memoji avatar, profile photo) |
| `garden/` | Salvaged learning notes — seed of a future digital-garden section |

## Editing model

- Content edits: modify `index.html`, `projects.json`, or profile data — the page
  renders both JSON files client-side at load time.
- Publications: set `SCHOLAR_ID` in the workflow env, then run the action once via
  `workflow_dispatch` to seed `publications.json`.
- Deploy: push to `main`. GitHub Pages serves the repo root automatically.

See `AGENTS.md` for agent working conventions.
