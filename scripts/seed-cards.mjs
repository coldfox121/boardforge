// 批量生成卡图并写入 D1（card_images + game_configs）
// 用法：set CF_API_TOKEN=xxx && node scripts/seed-cards.mjs
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../js/splendor-data.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'));
const { CARDS, NOBLES, GEM_COLORS, GEM_NAMES } = mod;

const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = 'd581be8903c61299eaa2d551e3a0f56d';
const DB = 'fbd65a6a-32c1-4ea2-ab20-0fcb9db4dc42';

if (!TOKEN) { console.error('缺少 CF_API_TOKEN 环境变量'); process.exit(1); }

const HEX = {
  white: '#e8e8e8',
  blue: '#4a90d9',
  green: '#3fa34d',
  red: '#d9483b',
  black: '#3a3a3a',
  gold: '#f0c419'
};
const TEXT_ON = { white: '#1a1a1a', black: '#f2f2f2' };

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function costChips(items, y) {
  const n = items.length;
  if (!n) return '';
  const w = 64;
  const total = n * w;
  let x = (260 - total) / 2 + w / 2;
  return items.map(it => {
    const cx = x; x += w;
    const fg = TEXT_ON[it.color] || '#fff';
    return `<circle cx="${cx}" cy="${y}" r="30" fill="${HEX[it.color]}" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>` +
           `<text x="${cx}" y="${y + 11}" font-size="34" text-anchor="middle" fill="${fg}" font-weight="700">${it.n}</text>`;
  }).join('');
}

function cardSVG(card) {
  const gem = HEX[card.color] || '#888';
  const costs = GEM_COLORS.filter(c => (card.cost || {})[c] > 0).map(c => ({ color: c, n: card.cost[c] }));
  const vp = card.vp || 0;
  // 设计目标：缩到 80px 宽仍可辨认，因此只用大字号，不放小字
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360" viewBox="0 0 260 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#2b3140"/><stop offset="100%" stop-color="#141821"/>
</linearGradient></defs>
<rect width="260" height="360" rx="18" fill="url(#g)" stroke="${gem}" stroke-width="7"/>
<circle cx="126" cy="146" r="82" fill="${gem}" opacity="0.92"/>
<circle cx="126" cy="146" r="82" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="4"/>
<text x="126" y="168" font-size="76" text-anchor="middle" fill="${TEXT_ON[card.color] || '#fff'}">◆</text>
<circle cx="204" cy="52" r="40" fill="${HEX.gold}" stroke="#1a1a1a" stroke-opacity="0.25" stroke-width="2"/>
<text x="204" y="70" font-size="52" text-anchor="middle" fill="#1a1a1a" font-weight="700">${vp}</text>
${costChips(costs, 304)}
</svg>`;
}

function nobleSVG(noble) {
  const reqs = GEM_COLORS.filter(c => (noble.req || {})[c] > 0).map(c => ({ color: c, n: noble.req[c] }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360" viewBox="0 0 260 360">
<defs><linearGradient id="ng" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#3f2f58"/><stop offset="100%" stop-color="#191322"/>
</linearGradient></defs>
<rect width="260" height="360" rx="18" fill="url(#ng)" stroke="#9b6fd0" stroke-width="7"/>
<circle cx="126" cy="140" r="76" fill="#7b4fa8" opacity="0.6"/>
<text x="126" y="172" font-size="86" text-anchor="middle" fill="#f3e8ff">♛</text>
<circle cx="204" cy="52" r="40" fill="${HEX.gold}" stroke="#1a1a1a" stroke-opacity="0.25" stroke-width="2"/>
<text x="204" y="70" font-size="52" text-anchor="middle" fill="#1a1a1a" font-weight="700">3</text>
${costChips(reqs, 304)}
</svg>`;
}

async function d1(sql, params, attempt = 1) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params })
    });
    const j = await res.json();
    if (!j.success) throw new Error(JSON.stringify(j.errors));
    return j.result;
  } catch (err) {
    if (attempt >= 4) throw err;
    await new Promise(r => setTimeout(r, 800 * attempt));
    return d1(sql, params, attempt + 1);
  }
}

const now = Date.now();
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

const flatCards = [];
for (const tier of [1, 2, 3]) for (const c of CARDS[tier]) flatCards.push(c);

const jobs = [];
for (const c of flatCards) {
  const url = `/api/image/splendor/${c.id}?v=${now}`;
  jobs.push({ id: c.id, svg: cardSVG(c), url });
}
for (const n of NOBLES) {
  const url = `/api/image/splendor/${n.id}?v=${now}`;
  jobs.push({ id: n.id, svg: nobleSVG(n), url });
}

console.log(`生成 ${jobs.length} 张卡图...`);

let done = 0;
const BATCH = 5;
for (let i = 0; i < jobs.length; i += BATCH) {
  const batch = jobs.slice(i, i + BATCH);
  const values = batch.map(() => '(?,?,?,?,?,?)').join(',');
  const params = [];
  for (const job of batch) {
    params.push(`splendor:${job.id}`, 'splendor', job.id, 'image/svg+xml', b64(job.svg), now);
  }
  await d1(
    `INSERT INTO card_images (id, game_id, card_id, mime, data, updated_at) VALUES ${values} ` +
    'ON CONFLICT(id) DO UPDATE SET mime=excluded.mime, data=excluded.data, updated_at=excluded.updated_at',
    params
  );
  done += batch.length;
  console.log(`  已写入 ${done}/${jobs.length}`);
}

// 牌库配置带上 image 字段
const urlOf = id => `/api/image/splendor/${id}?v=${now}`;
const CARDS_OUT = {};
for (const tier of [1, 2, 3]) {
  CARDS_OUT[tier] = CARDS[tier].map(c => ({ ...c, image: urlOf(c.id) }));
}
const NOBLES_OUT = NOBLES.map(n => ({ ...n, image: urlOf(n.id) }));

const config = { CARDS: CARDS_OUT, NOBLES: NOBLES_OUT };

await d1(
  'INSERT INTO game_configs (game_id, data, updated_at, updated_by) VALUES (?,?,?,?) ' +
  'ON CONFLICT(game_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, updated_by=excluded.updated_by',
  ['splendor', JSON.stringify(config), now, 'seed-script']
);

console.log(`完成：${jobs.length} 张卡图 + 牌库配置已写入 D1`);
