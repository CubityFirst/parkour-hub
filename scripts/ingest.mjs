// Adds parkour-bench packages to games.mjs (or replaces an existing entry with the same slug).
//   node scripts/ingest.mjs ../parkour-bench/packages/<slug> [...]
// Then build with `node scripts/build.mjs <slug>`. Nothing is deployed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gamesFile = join(root, 'games.mjs');
const { games } = await import('../games.mjs');
const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('usage: node scripts/ingest.mjs <package dir> [...]');
  process.exit(1);
}

// Storage keys of packages already in the hub; source-built games aren't covered.
const takenKeys = new Map();
for (const g of games.filter((g) => g.pkg)) {
  const file = join(resolve(root, g.pkg), 'manifest.json');
  if (existsSync(file)) for (const k of JSON.parse(readFileSync(file, 'utf8')).storageKeys) takenKeys.set(k, g.slug);
}

let text = readFileSync(gamesFile, 'utf8');
let failed = 0;
for (const arg of dirs) {
  const dir = resolve(arg);
  const problems = [];
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) { console.error(`skip ${arg}: no manifest.json`); failed++; continue; }
  const m = JSON.parse(readFileSync(file, 'utf8'));
  if (m.schemaVersion !== 1) problems.push(`unsupported schemaVersion ${m.schemaVersion}`);
  if (m.status === 'failed') problems.push('status is failed');
  if (!existsSync(join(dir, 'dist', 'index.html'))) problems.push('dist/index.html missing');
  if (m.verification?.grounded == null || m.verification?.moves == null) problems.push('not verified yet (run tools/verdict.mjs in parkour-bench)');
  // Shared key names are fine: build.mjs namespaces every game's localStorage by slug.
  for (const k of m.storageKeys ?? []) {
    if (takenKeys.has(k) && takenKeys.get(k) !== m.slug) console.log(`  note: ${m.slug} shares storage key "${k}" with ${takenKeys.get(k)} (isolated per game)`);
  }
  if (problems.length) { console.error(`skip ${m.slug}: ${problems.join('; ')}`); failed++; continue; }

  const pkg = relative(root, dir).replaceAll('\\', '/');
  const entry = `  {\n    slug: '${m.slug}',\n    pkg: '${pkg}',\n  },`;
  // Entries are formatted one field per line, so an existing one can be found by its slug line.
  const existing = new RegExp(`\\n  \\{\\n    slug: '${m.slug}',\\n[\\s\\S]*?\\n  \\},`);
  if (existing.test(text)) {
    text = text.replace(existing, `\n${entry}`);
    console.log(`replaced ${m.slug} -> ${pkg}`);
  } else {
    text = text.replace(/\n\];\s*$/, `\n${entry}\n];\n`);
    console.log(`added ${m.slug} -> ${pkg}`);
  }
  console.log(`  ${m.model.family} (${m.model.effort}): ${m.title}, ${m.status}${m.fixRounds.length ? `, ${m.fixRounds.length} fix round(s)` : ''}`);
}
writeFileSync(gamesFile, text);
if (failed) process.exitCode = 1;
