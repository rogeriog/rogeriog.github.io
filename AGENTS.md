# AGENTS.md — rogeriog.github.io

Working agreement for OpenClaw agents editing this repository.

## What this is

Rogério's personal GitHub Pages site (`rogeriog.github.io`, **Pages source = `main` / `/docs`**).
Static single-file site — **no build step, no dependencies**. Architecture follows
`ABnano/abnano.github.io`: one `index.html` (inline CSS/JS) + JSON data files rendered
client-side + a scheduled workflow that syncs `publications.json` from Google Scholar.
All published files live under `docs/` — the Jekyll build is skipped via `docs/.nojekyll`.

## Owner & authority

- Owner: Rogério (Telegram `rogeriogem`, GitHub `rogeriog`). Content decisions are his —
  bio text, project selection, skills list, contact links, Scholar ID.
- Placeholders are marked `TODO(agents)`. Filling them requires his input; ask via the
  active channel rather than inventing biographical facts.
- Deploy = push to `main`. Every push is live within ~1 minute. Treat `main` as
  production: verify the page renders before pushing (`python3 -m http.server` and check,
  or open the HTML and sanity-check the JSON files parse).

## Conventions

- Keep the single-file architecture. New sections go inside `docs/index.html`; new data
  goes in `docs/projects.json`/`docs/publications.json` — no frameworks or bundlers.
- `projects.json` schema: `{name, description, tags[], url, logo?, links?[{label,url}]}` —
  `url`/`logo` may be `""`/absent; `links` renders labeled card links (internal = same tab).
- `docs/garden/skills.json` schema: `{skills:[{slug,title,summary,file}]}` — agent-facing
  directives shown in the garden's “Field notes for agents” block; markdown bodies live
  in `docs/garden/skills/<file>` and render client-side (lazy-fetched on expand).
- `publications.json` is machine-owned by `update_scholar.py` — do not hand-edit entries;
  badges may be curated via `BADGE_MAP` in the script.
- Digital garden lives in `docs/garden/`: one self-contained `<slug>.html` per post
  (copy `_template.html`) plus a matching entry in `docs/garden/posts.json`
  (`{slug,title,date,summary,tags[],source_url,x_url}` — `source_url`/`x_url` may be
  `""`). The damselfly branding (`assets/garden-damselfly.jpg`) belongs to the garden
  only — never use it as the main-site identity. Posts are short notes on a paper or
  idea: 3–8 paragraphs, one idea, his voice. `x_url` is filled in after the X version
  is approved and published (see `social/` in the agent workspace).
- Images go in `docs/assets/`; keep them < 500 KB and referenced with relative paths.
- Commit style: short imperative summary (`add projects section`, `update bio`). The
  scholar workflow commits as `chore: auto-update ... [skip ci]` — don't replicate that
  pattern for normal work.
- Git identity for agent commits: `Rogério <rogeriog@users.noreply.github.com>` — already
  configured at repo level.

## Git access

Pushes use the repo's SSH deploy key via the `github-rogeriog` SSH host alias
(remote: `git@github-rogeriog:rogeriog/rogeriog.github.io.git`). The key is write-scoped
to this repo only. If a push fails, report it — never swap in a different credential.
(New repos: Rogério creates them himself; `bin/gh-setup.sh` issues a per-repo
deploy key — see workspace `social/README.md`.)
