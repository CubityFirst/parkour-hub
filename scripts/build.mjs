// Builds every game into dist/<slug>/ with the matching Vite base path, then
// renders the landing page into dist/index.html. Entries with `pkg` are parkour-bench
// packages: their prebuilt dist/ is copied in and their card text comes from the manifest.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { companies, companyOf, OTHER } from '../companies.mjs';
import { games as entries } from '../games.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const only = process.argv.slice(2);

const games = entries
  .map((g) => {
    if (!g.pkg) return g;
    const pkg = resolve(root, g.pkg);
    const m = JSON.parse(readFileSync(join(pkg, 'manifest.json'), 'utf8'));
    // Fields set in games.mjs win, so a card's text can be overridden without repackaging.
    return { model: m.model.family, effort: m.model.effort, title: m.title, blurb: m.blurb, status: m.status, ...g, pkg };
  })
  .filter((g) => g.status !== 'failed');

mkdirSync(dist, { recursive: true });
// Clear dist's contents rather than dist itself: on Windows a running `wrangler dev` holds the folder open.
if (only.length === 0) {
  for (const entry of readdirSync(dist)) rmSync(join(dist, entry), { recursive: true, force: true });
}

// Every game shares one origin, and models pick similar localStorage keys ("rooftop-flow.settings").
// This runs first on each game's page and namespaces its localStorage under "<slug>:", so games
// can't read, overwrite or clear each other's saves. Direct property access (localStorage.foo)
// isn't covered; the games here use getItem/setItem.
const storageShim = (slug) => `<script>/* parkour-hub: per-game localStorage */(()=>{try{
const L=localStorage,P=${JSON.stringify(slug + ':')},S=Storage.prototype;
const get=S.getItem,set=S.setItem,del=S.removeItem,key=S.key,len=Object.getOwnPropertyDescriptor(S,'length').get;
const mine=()=>{const o=[];for(let i=0,n=len.call(L);i<n;i++){const k=key.call(L,i);if(k!==null&&k.startsWith(P))o.push(k)}return o};
S.getItem=function(k){return get.call(this,this===L?P+k:k)};
S.setItem=function(k,v){return set.call(this,this===L?P+k:k,v)};
S.removeItem=function(k){return del.call(this,this===L?P+k:k)};
S.key=function(i){if(this!==L)return key.call(this,i);const k=mine()[i];return k===undefined?null:k.slice(P.length)};
S.clear=(c=>function(){if(this!==L)return c.call(this);for(const k of mine())del.call(L,k)})(S.clear);
Object.defineProperty(S,'length',{configurable:true,get(){return this===L?mine().length:len.call(this)}});
}catch(e){}})();</script>`;

function isolateStorage(outDir, slug) {
  const index = join(outDir, 'index.html');
  const html = readFileSync(index, 'utf8');
  if (html.includes('parkour-hub: per-game localStorage')) return;
  const shim = storageShim(slug);
  writeFileSync(index, /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}\n${shim}`) : shim + html);
}

for (const game of games) {
  if (only.length && !only.includes(game.slug)) continue;
  const outDir = join(dist, game.slug);
  if (game.pkg) {
    console.log(`\n=== ${game.slug} (package ${game.pkg})`);
    rmSync(outDir, { recursive: true, force: true });
    cpSync(join(game.pkg, 'dist'), outDir, { recursive: true });
  } else if (game.prebuilt) {
    // A finished build whose source folder no longer exists, copied in as-is.
    console.log(`\n=== ${game.slug} (prebuilt ${game.prebuilt})`);
    rmSync(outDir, { recursive: true, force: true });
    cpSync(resolve(root, game.prebuilt), outDir, { recursive: true });
  } else {
    const cwd = resolve(root, game.dir);
    const vite = join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!existsSync(vite)) {
      throw new Error(`${game.slug}: no Vite install in ${cwd} - run npm install there first`);
    }
    console.log(`\n=== ${game.slug} (${cwd})`);
    const run = spawnSync(
      process.execPath,
      [vite, 'build', '--base', `/${game.slug}/`, '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'],
      { cwd, stdio: 'inherit' },
    );
    if (run.status !== 0) throw new Error(`${game.slug}: vite build failed`);
  }
  // Cloudflare only honours _headers at the asset root; the worker sets headers instead.
  rmSync(join(outDir, '_headers'), { force: true });
}
// Also covers games that weren't rebuilt this time (a partial build, or a missing source folder).
for (const game of games) {
  if (existsSync(join(dist, game.slug, 'index.html'))) isolateStorage(join(dist, game.slug), game.slug);
}

// Landing page: site/ is copied as-is, with the game cards injected into index.html.
cpSync(join(root, 'site'), dist, { recursive: true });
for (const g of games) {
  if (g.pkg && existsSync(join(g.pkg, 'thumbnail.webp'))) cpSync(join(g.pkg, 'thumbnail.webp'), join(dist, 'shots', `${g.slug}.webp`));
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Games from the same model share one card, with an effort picker to switch between builds.
const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
const rank = (e) => (efforts.includes(e) ? efforts.indexOf(e) : efforts.length);
const families = [];
for (const g of games) {
  let family = families.find((f) => f.model === g.model);
  if (!family) families.push((family = { model: g.model, games: [] }));
  family.games.push(g);
}
for (const f of families) f.games.sort((a, b) => rank(a.effort) - rank(b.effort));

const shotImg = (g) =>
  existsSync(join(dist, 'shots', `${g.slug}.webp`))
    ? `<img src="/shots/${g.slug}.webp" alt="" loading="lazy" width="640" height="360">`
    : '';
const info = (g) => `
          <h3>${esc(g.title)}</h3>
          <p>${esc(g.blurb)}</p>
          <span class="play">Play <span aria-hidden="true">&rarr;</span></span>`;
// Each picker option reveals its own shot and text; the rules are generated per build.
const variantCss = [];
function card(f, i) {
  const num = `<span class="num">${String(i + 1).padStart(2, '0')}</span>`;
  if (f.games.length === 1) {
    const [g] = f.games;
    return `
      <a class="card" href="/${g.slug}/">
        <div class="shot">${shotImg(g)}${num}</div>
        <div class="body">
          <div class="model">${esc(g.model)}${g.effort ? ` <span>${esc(g.effort)}</span>` : ''}</div>${info(g)}
        </div>
      </a>`;
  }
  const picked = f.games.at(-1).slug; // start on the highest effort
  for (const g of f.games) {
    const on = `.family:has(#pick-${g.slug}:checked)`;
    variantCss.push(`${on} .v-shot[data-v="${g.slug}"] { display: block; }`);
    variantCss.push(`${on} .v-info[data-v="${g.slug}"] { display: flex; }`);
  }
  const shots = f.games
    .map((g) => `<a class="v-shot" data-v="${g.slug}" href="/${g.slug}/" tabindex="-1" aria-hidden="true">${shotImg(g)}</a>`)
    .join('');
  const options = f.games
    .map(
      (g) => `
          <input type="radio" name="effort-${i}" id="pick-${g.slug}"${g.slug === picked ? ' checked' : ''}><label for="pick-${g.slug}">${esc(g.effort ?? g.slug)}</label>`,
    )
    .join('');
  const infos = f.games.map((g) => `
        <a class="v-info" data-v="${g.slug}" href="/${g.slug}/">${info(g)}
        </a>`).join('');
  return `
      <article class="card family">
        <div class="shot">${shots}${num}</div>
        <div class="body">
          <div class="model">${esc(f.model)}</div>
          <fieldset class="efforts">
            <legend>${esc(f.model)} effort level</legend>${options}
          </fieldset>${infos}
        </div>
      </article>`;
}

// One section per company, in companies.mjs order; families keep their games.mjs order inside.
// data-span lets small companies share a row of the page grid (see .sections in site/index.html).
const sections = [...companies.map((c) => c.name), OTHER]
  .map((name) => ({ name, families: families.filter((f) => companyOf(f.games[0]) === name) }))
  .filter((s) => s.families.length);
const anchor = (name) => 'co-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
let n = 0;
const cards = sections
  .map((s) => {
    const builds = s.families.reduce((sum, f) => sum + f.games.length, 0);
    return `
    <section class="company" id="${anchor(s.name)}" aria-labelledby="${anchor(s.name)}-h" data-span="${Math.min(s.families.length, 3)}">
      <div class="company-head">
        <h2 id="${anchor(s.name)}-h">${esc(s.name)}</h2>
        <span>${plural(s.families.length, 'model')} · ${plural(builds, 'build')}</span>
      </div>
      <div class="grid">${s.families.map((f) => card(f, n++)).join('')}
      </div>
    </section>`;
  })
  .join('');
const nav = sections.map((s) => `<a href="#${anchor(s.name)}">${esc(s.name)}</a>`).join('');
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty'];
const word = (n) => words[n] ?? (n < 40 ? tens[Math.floor(n / 10)] + (n % 10 ? `-${words[n % 10]}` : '') : String(n));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const indexPath = join(dist, 'index.html');
writeFileSync(
  indexPath,
  readFileSync(indexPath, 'utf8')
    .replace('<!-- GAMES -->', cards)
    .replace('<!-- COMPANY-NAV -->', nav)
    .replace('/* VARIANTS */', variantCss.join('\n        '))
    .replaceAll('<!-- count -->', word(games.length))
    .replaceAll('<!-- Count -->', cap(word(games.length)))
    .replaceAll('<!-- models -->', word(families.length))
    .replaceAll('<!-- Models -->', cap(word(families.length)))
    .replaceAll('<!-- companies -->', word(sections.length)),
);
console.log('\nBuilt hub into', dist);
