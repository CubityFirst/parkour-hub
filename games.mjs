// The games bundled into the hub, served at https://parkour.cubityfir.st/<slug>/.
// `dir` entries are built from their project folder; `pkg` entries are parkour-bench
// packages (added with scripts/ingest.mjs) whose card text comes from their manifest;
// `prebuilt` entries are finished builds copied in as-is.
export const games = [
  // The original /opus/ build (15 October, source in games/mirrors-edge-opus-55-high) was
  // replaced by the bench runs; the worker redirects /opus/ to /opus-high/, and the old
  // build is in ../parkour-hub-archive.
  // The original /sonnet/ build (15 October) was replaced by the bench runs; the worker
  // redirects /sonnet/ to /sonnet-high/, and the old build is in ../parkour-hub-archive.
  {
    slug: 'sonnet-low',
    pkg: '../parkour-bench/packages/sonnet-low',
  },
  // The original /haiku/ build (15 October) was replaced by the bench runs below; the
  // worker redirects /haiku/ to /haiku-high/, and the old build is in ../parkour-hub-archive.
  {
    slug: 'haiku-low',
    pkg: '../parkour-bench/packages/haiku-low',
  },
  // The Astra source folders (../mirrors-edge2-astra-med, ../mirrors-edge3-astra-max) are
  // gone; these builds were recovered from the live site on 27 October.
  {
    slug: 'astra-med',
    prebuilt: 'games/prebuilt/astra-med',
    model: 'Astra',
    effort: 'medium',
    title: 'ASTRA',
    blurb: 'A 720 m route in six sections, from First Light to Home Straight.',
  },
  {
    slug: 'astra-max',
    prebuilt: 'games/prebuilt/astra-max',
    model: 'Astra',
    effort: 'max',
    title: 'ASTRAMAX',
    blurb: 'The Highline: a 750 m, six-sector course. A clean run is about 61 seconds.',
  },
  {
    slug: 'glm',
    dir: 'games/mirrors-edge-glm53-flash-high',
    model: 'GLM-5.3-Flash',
    effort: 'high',
    title: 'Rooftop Flow',
    blurb: 'A 200 m route in six sections, with a 12 m gap you can only cross by wall-running.',
  },
  {
    slug: 'qwen',
    dir: 'games/mirrors-edge-qwen38-flash-xhigh',
    model: 'Qwen3.8 Flash',
    effort: 'xhigh',
    title: 'Rooftop Flow',
    blurb: 'A one-minute run across the white city. Unfinished: cut off twice by provider errors.',
  },
  {
    slug: 'kimi',
    dir: 'games/mirrors-edge-kimi-k3-max',
    model: 'Kimi K3',
    effort: 'max',
    title: 'Rooftop Flow',
    blurb: 'Six sections and about 230 m of rooftops, including a 10.5 m wall-run gap.',
  },
  {
    slug: 'deepseek',
    dir: 'games/mirrors-edge-deepseek41-flash-high',
    model: 'DeepSeek V4.1 Flash',
    effort: 'high',
    title: 'Rooftop Flow',
    blurb: 'City Route 01: six sections from Warm Up to Final Sprint, with a flow meter.',
  },
  {
    slug: 'luna-low',
    dir: 'games/mirrors-edge-luna6-low',
    model: 'GPT-6-Luna',
    effort: 'low',
    title: 'Rooftop Flow',
    blurb: 'City Transit Route 07: a compact one-file build with a live speed readout.',
  },
  {
    slug: 'luna-medium',
    dir: 'games/mirrors-edge-luna6-medium',
    model: 'GPT-6-Luna',
    effort: 'medium',
    title: 'Rooftop Flow',
    blurb: 'A 300 m rooftop course with a wall-run section, checkpoints and a saved best time.',
  },
  {
    slug: 'luna-high',
    dir: 'games/mirrors-edge-luna6-high',
    model: 'GPT-6-Luna',
    effort: 'high',
    title: 'SKYLINE',
    blurb: 'A six-section route with wall-runs, vaults and the only zipline in the hub.',
  },
  {
    slug: 'luna-xhigh',
    dir: 'games/mirrors-edge-luna6-xhigh',
    model: 'GPT-6-Luna',
    effort: 'xhigh',
    title: 'Rooftop Flow',
    blurb: 'City Runner: wall-runs, ledge recovery and checkpoints, with synthesised audio.',
  },
  {
    slug: 'luna-max',
    pkg: '../parkour-bench/packages/luna-max',
  },
  {
    slug: 'haiku-medium',
    pkg: '../parkour-bench/packages/haiku-medium',
  },
  {
    slug: 'haiku-high',
    pkg: '../parkour-bench/packages/haiku-high',
  },
  {
    slug: 'haiku-xhigh',
    pkg: '../parkour-bench/packages/haiku-xhigh',
  },
  {
    slug: 'haiku-max',
    pkg: '../parkour-bench/packages/haiku-max',
  },
  {
    slug: 'sonnet-medium',
    pkg: '../parkour-bench/packages/sonnet-medium',
  },
  {
    slug: 'sonnet-high',
    pkg: '../parkour-bench/packages/sonnet-high',
  },
  {
    slug: 'terra-low',
    pkg: '../parkour-bench/packages/terra-low',
  },
  {
    slug: 'terra-medium',
    pkg: '../parkour-bench/packages/terra-medium',
  },
  {
    slug: 'terra-high',
    pkg: '../parkour-bench/packages/terra-high',
  },
  {
    slug: 'terra-xhigh',
    pkg: '../parkour-bench/packages/terra-xhigh',
  },
  {
    slug: 'terra-max',
    pkg: '../parkour-bench/packages/terra-max',
  },
  {
    slug: 'grok-low',
    pkg: '../parkour-bench/packages/grok-low',
  },
  {
    slug: 'grok-medium',
    pkg: '../parkour-bench/packages/grok-medium',
  },
  {
    slug: 'grok-high',
    pkg: '../parkour-bench/packages/grok-high',
  },
  {
    slug: 'grok-xhigh',
    pkg: '../parkour-bench/packages/grok-xhigh',
  },
  {
    slug: 'sonnet-xhigh',
    pkg: '../parkour-bench/packages/sonnet-xhigh',
  },
  {
    slug: 'sonnet-max',
    pkg: '../parkour-bench/packages/sonnet-max',
  },
  {
    slug: 'terra61-high',
    pkg: '../parkour-bench/packages/terra61-high',
  },
  {
    slug: 'terra61-low',
    pkg: '../parkour-bench/packages/terra61-low',
  },
  {
    slug: 'terra61-xhigh',
    pkg: '../parkour-bench/packages/terra61-xhigh',
  },
  {
    slug: 'glm-low',
    pkg: '../parkour-bench/packages/glm-low',
  },
  {
    slug: 'terra61-medium',
    pkg: '../parkour-bench/packages/terra61-medium',
  },
  {
    slug: 'opus-low',
    pkg: '../parkour-bench/packages/opus-low',
  },
  {
    slug: 'terra61-max',
    pkg: '../parkour-bench/packages/terra61-max',
  },
  {
    slug: 'glm-max',
    pkg: '../parkour-bench/packages/glm-max',
  },
  {
    slug: 'opus-medium',
    pkg: '../parkour-bench/packages/opus-medium',
  },
  {
    slug: 'opus-max',
    pkg: '../parkour-bench/packages/opus-max',
  },
  {
    slug: 'opus-xhigh',
    pkg: '../parkour-bench/packages/opus-xhigh',
  },
  {
    slug: 'opus-high',
    pkg: '../parkour-bench/packages/opus-high',
  },
  {
    slug: 'minimax-xhigh',
    pkg: '../parkour-bench/packages/minimax-xhigh',
  },
  {
    slug: 'minimax-max',
    pkg: '../parkour-bench/packages/minimax-max',
  },
];
