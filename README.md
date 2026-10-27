# Parkour hub

One site at **https://parkour.cubityfir.st** that serves every version of the
Mirror's Edge-inspired parkour game, each built from the same `prompt.txt` by a
different model:

| Path | Project folder | Model |
| --- | --- | --- |
| `/opus/` | `games/mirrors-edge-opus-55-high` | Opus 5.5 (high) |
| `/opus-low/`, `/opus-medium/`, `/opus-xhigh/`, `/opus-max/` | `../parkour-bench/packages/opus-*` | Opus 5.5 (low, medium, xhigh, max) |
| `/sonnet-low/` … `/sonnet-max/` | `../parkour-bench/packages/sonnet-*` | Sonnet 5.5 (low, medium, high, xhigh, max) |
| `/haiku-low/` … `/haiku-max/` | `../parkour-bench/packages/haiku-*` | Haiku 5.5 (low, medium, high, xhigh, max) |
| `/astra-med/` | `games/prebuilt/astra-med` | Astra (medium), prebuilt |
| `/astra-max/` | `games/prebuilt/astra-max` | Astra (max), prebuilt |
| `/glm-low/`, `/glm-max/` | `../parkour-bench/packages/glm-*` | GLM-5.3-Flash (low, max) |
| `/glm/` | `games/mirrors-edge-glm53-flash-high` | GLM-5.3-Flash (high) |
| `/qwen/` | `games/mirrors-edge-qwen38-flash-xhigh` | Qwen3.8 Flash (xhigh), unfinished |
| `/kimi/` | `games/mirrors-edge-kimi-k3-max` | Kimi K3 (max) |
| `/deepseek/` | `games/mirrors-edge-deepseek41-flash-high` | DeepSeek V4.1 Flash (high) |
| `/luna-low/` | `games/mirrors-edge-luna6-low` | GPT-6-Luna (low) |
| `/luna-medium/` | `games/mirrors-edge-luna6-medium` | GPT-6-Luna (medium) |
| `/luna-high/` | `games/mirrors-edge-luna6-high` | GPT-6-Luna (high) |
| `/luna-xhigh/` | `games/mirrors-edge-luna6-xhigh` | GPT-6-Luna (xhigh) |
| `/luna-max/` | `../parkour-bench/packages/luna-max` | GPT-6-Luna (max) |
| `/terra-low/` … `/terra-max/` | `../parkour-bench/packages/terra-*` | GPT-5.6-Terra (low, medium, high, xhigh, max) |
| `/terra61-low/` … `/terra61-max/` | `../parkour-bench/packages/terra61-*` | GPT-6.1-Terra (low, medium, high, xhigh, max) |
| `/grok-low/` … `/grok-xhigh/` | `../parkour-bench/packages/grok-*` | Grok 4.7 (low, medium, high, xhigh; it has no max) |

The `../parkour-bench/packages/*` games come from
[parkour-bench](https://github.com/CubityFirst/parkour-bench), which runs the same brief
against each model and effort level and packages the result. Clone it next to this repo:

```bash
git clone https://github.com/CubityFirst/parkour-bench.git
git clone https://github.com/CubityFirst/parkour-hub.git
```

The root `/` is a landing page (`site/index.html`) linking to each game. The original
`/haiku/` and `/sonnet/` builds (15 October) were replaced by the bench runs: the worker
redirects them to `/haiku-high/` and `/sonnet-high/`, and the old builds are kept in
`../parkour-hub-archive/`.

## How it works

- `games.mjs` lists the games (slug, source folder and card text).
- `games/` holds the source folders for the `dir` entries. It also holds
  `mirrors-edge-gemini4-argon-high`, an unfinished Gemini run that isn't on the site.
- `games/prebuilt/` holds finished builds whose source is gone (the two Astra games,
  recovered from the live site on 27 October). `prebuilt` entries are copied in as-is.
- `companies.mjs` maps model names to companies. The landing page has one section per
  company, in that file's order, with jump links at the top. Builds of the same model
  share a card with an effort picker. A new company only needs a line there; an entry
  can also set `company` directly. Unmatched models go under "Other".
- `scripts/build.mjs` runs each project's own Vite with `--base /<slug>/` into
  `dist/<slug>/`, then copies `site/` into `dist/` and injects the game cards.
  The game source folders are not modified.
- `worker/index.ts` serves `dist/` through Workers Static Assets and adds cache
  and security headers. Hashed files under `/<slug>/assets/` are cached forever.
- The Worker is named `rooftop-flow`, the name of the original Opus deploy, so it
  keeps the `parkour.cubityfir.st` custom domain.

All games share one origin, and several models picked the same localStorage key
names. The build therefore adds a small script to the top of each game's `index.html`
that namespaces its localStorage under `<slug>:`. A game only sees, overwrites and
clears its own saves. This covers `getItem`, `setItem`, `removeItem`, `key`, `length`
and `clear`. Direct property access such as `localStorage.foo` isn't covered:
`terra-low` saves its best time as `localStorage.rooftopBest`, un-namespaced (no other game
uses that key). parkour-bench records such keys as `storageDirect` and fails a package
whose direct key clashes with another's.

## Commands

Each `dir` game folder needs its own `npm install` first (the build uses its local Vite).
Bench packages and `prebuilt` entries are already built and need nothing.

```bash
npm install
npm run build              # build every game and the landing page
node scripts/build.mjs haiku   # rebuild one game (plus the landing page) only
npm run dev                # build, then serve locally with npx wrangler dev
npm run deploy             # build, then npx wrangler deploy
```

## Adding a game

**From parkour-bench (preferred):** run `node scripts/ingest.mjs ../parkour-bench/packages/<slug>`,
then `node scripts/build.mjs <slug>`. Ingest checks the package (verified, not failed,
no localStorage key clash with other packages) and adds or replaces a
`{ slug, pkg }` entry in `games.mjs`. The build copies the package's prebuilt `dist/` and
`thumbnail.webp`, and takes the card's family, effort, title and blurb from its
`manifest.json`. Any of those fields set on the entry override the manifest.

**From a source folder:** add an entry to `games.mjs`, and optionally a 640x360 `site/shots/<slug>.webp`
thumbnail, then rebuild. The landing page's counts and card numbers follow
`games.mjs`, so nothing else needs editing.

Games with the same `model` share one landing-page card, with an effort picker
(low, medium, high, xhigh, max) that switches its screenshot, text and Play link.
The card starts on the highest effort. Give every build in a family its own `effort`.
To build only the landing page, pass a slug that matches no game, e.g.
`node scripts/build.mjs landing`.
