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
  const w = 52;
  const total = n * w;
  let x = (260 - total) / 2 + w / 2;
  return items.map(it => {
    const cx = x; x += w;
    const fg = TEXT_ON[it.color] || '#fff';
    return `<circle cx="${cx}" cy="${y}" r="21" fill="${HEX[it.color]}"/>` +
           `<text x="${cx}" y="${y + 7}" font-size="20" text-anchor="middle" fill="${fg}" font-weight="700">${it.n}</text>`;
  }).join('');
}

function cardSVG(card) {
  const gem = HEX[card.color] || '#888';
  const costs = GEM_COLORS.filter(c => (card.cost || {})[c] > 0).map(c => ({ color: c, n: card.cost[c] }));
  const vp = card.vp || 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360" viewBox="0 0 260 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#2b3140"/><stop offset="100%" stop-color="#141821"/>
</linearGradient></defs>
<rect width="260" height="360" rx="16" fill="url(#g)" stroke="${gem}" stroke-width="4"/>
<text x="20" y="38" font-size="15" fill="#8b93a7">等级 ${card.tier || 1}</text>
<circle cx="222" cy="30" r="21" fill="${HEX.gold}"/>
<text x="222" y="38" font-size="22" text-anchor="middle" fill="#1a1a1a" font-weight="700">${vp}</text>
<circle cx="130" cy="160" r="62" fill="${gem}" opacity="0.92"/>
<circle cx="130" cy="160" r="62" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/>
<text x="130" y="170" font-size="40" text-anchor="middle" fill="${TEXT_ON[card.color] || '#fff'}">◆</text>
<text x="130" y="252" font-size="15" text-anchor="middle" fill="#c9d1e3">${esc(GEM_NAMES[card.color] || card.color)}</text>
${costChips(costs, 305)}
</svg>`;
}

function nobleSVG(noble) {
  const reqs = GEM_COLORS.filter(c => (noble.req || {})[c] > 0).map(c => ({ color: c, n: noble.req[c] }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="360" viewBox="0 0 260 360">
<defs><linearGradient id="ng" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#3a2b52"/><stop offset="100%" stop-color="#1b1524"/>
</linearGradient></defs>
<rect width="260" height="360" rx="16" fill="url(#ng)" stroke="#7b4fa8" stroke-width="4"/>
<text x="20" y="38" font-size="15" fill="#a99cc4">贵族</text>
<circle cx="222" cy="30" r="21" fill="${HEX.gold}"/>
<text x="222" y="38" font-size="22" text-anchor="middle" fill="#1a1a1a" font-weight="700">3</text>
<circle cx="130" cy="150" r="58" fill="#7b4fa8" opacity="0.55"/>
<text x="130" y="170" font-size="48" text-anchor="middle" fill="#f0e6ff">♛</text>
<text x="130" y="240" font-size="14" text-anchor="middle" fill="#c9b8e0">所需发展卡</text>
${costChips(reqs, 300)}
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
