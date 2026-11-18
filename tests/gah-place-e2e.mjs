// 拿取餐饮自选放置 E2E：规则提示 + 放置面板 + 手动分配到客人 + 状态核对
import puppeteer from 'puppeteer-core';
import { GUEST_BY_ID } from 'file:///D:/TREA_project/boardforge/js/hotel-data.js?v=4';

const BASE = 'http://localhost:8799';
const TOKEN = '1cf0e5bc4e97fa0ed357a3da0234064efeaef12ba74a0d71b708bad2a38ef04c';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 60000
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('dialog', async d => { errors.push('alert: ' + d.message()); await d.dismiss(); });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
await page.evaluate(t => { localStorage.setItem('bf_token', t); localStorage.setItem('bf_username', 'tester1'); localStorage.setItem('bf_is_admin', 'false'); }, TOKEN);
await page.reload({ waitUntil: 'networkidle2' });
await sleep(800);

const click = sel => page.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error('no el: ' + s); el.click(); }, sel);
const state = () => page.evaluate(() => { const g = window.__onlineGame; return g && g.state ? JSON.parse(JSON.stringify(g.state)) : null; });

await page.evaluate(() => document.querySelector('.game-card[data-game="hotel"]').click());
await page.waitForSelector('#room-modal', { timeout: 5000 });
await page.evaluate(() => document.getElementById('rm-create').click());
await sleep(1500);
await page.evaluate(() => { const t = document.getElementById('toggle-ai'); if (!t.checked) t.click(); const c = document.getElementById('ai-count'); if (c) c.value = '1'; });
await page.evaluate(() => document.getElementById('btn-start-game').click());
await sleep(4000);

// ===== 开局：接客尽量挑爱喝饮品的客人，备房点第一个可选项 =====
for (let i = 0; i < 40; i++) {
  const s = await state();
  if (!s || s.phase !== 'setup') break;
  const pend = s.pending;
  if (pend && pend.seat === s.players.findIndex(p => !p.isAI)) {
    if (pend.type === 'guestPick') {
      const slot = await page.evaluate(() => {
        const g = window.__onlineGame; const q = g.state.guestQueue;
        return q.findIndex(gid => gid == null ? false : true);
      });
      // 在页面里挑需要饮品（红酒/咖啡）的客人：按 slot 找 gid 后由 node 侧判断
      const slots = await page.evaluate(() => window.__onlineGame.state.guestQueue.slice());
      const drinkSlot = slots.findIndex(gid => gid != null && (GUEST_BY_ID[gid].order[2] > 0 || GUEST_BY_ID[gid].order[3] > 0));
      const pick = drinkSlot >= 0 ? drinkSlot : 0;
      await page.evaluate(ix => {
        const els = document.querySelectorAll('.gah-guest[data-act="queue"]');
        if (els[ix]) els[ix].click();
      }, pick);
    } else if (pend.type === 'prepare') {
      await page.evaluate(() => { const el = document.querySelector('.gah-room.selectable'); if (el) el.click(); });
      await sleep(400);
      await page.evaluate(() => { const b = document.querySelector('[data-act="pend-rooms-done"]'); if (b && !b.disabled) b.click(); });
    } else {
      await page.evaluate(() => { const b = document.querySelector('[data-act="pend-skip"]'); if (b) b.click(); });
    }
  }
  await sleep(1300);
}

let s = await state();
const meIdx = s.players.findIndex(p => !p.isAI);
const myCafe = s.players[meIdx].cafe.map(g => ({ gid: g.gid, items: g.items }));
console.log('我的客人：', myCafe.map(g => `${g.gid} 需求${JSON.stringify(GUEST_BY_ID[g.gid].order)} 已上${JSON.stringify(g.items || [])}`).join(' | '));

// ===== 进行中对局：等到 2 区有骰子时拿饮品 =====
let result = null;
const drinkSum = st => st.players[meIdx].cafe.reduce((a, g) => a + (g.items ? g.items[2] + g.items[3] : 0), 0);
const kitchenSum = st => st.players[meIdx].kitchen[2] + st.players[meIdx].kitchen[3];

for (let i = 0; i < 60 && !result; i++) {
  s = await state();
  if (!s || s.phase === 'ended') break;
  if (s.pending) {
    await page.evaluate(() => { const b = document.querySelector('[data-act="pend-skip"]') || document.querySelector('.gah-guest[data-act="queue"]'); if (b) b.click(); });
    await sleep(1200); continue;
  }
  if (s.currentPlayer !== meIdx) { await sleep(1200); continue; }
  const me = s.players[meIdx];
  if (me.dieTaken) { await click('[data-act="end-turn"]').catch(() => {}); await sleep(1000); continue; }
  if ((s.dice[2] || 0) <= 0) {
    // 没有 2 区骰子：随便拿 4 区推皇帝或直接过回合
    const took = await page.evaluate(() => {
      const c = [...document.querySelectorAll('.gah-action.clickable')].find(el => el.dataset.space === '4' || el.dataset.space === '6');
      if (c) { c.click(); return true; } return false;
    });
    await sleep(500);
    if (took) {
      await page.evaluate(() => {
        const b = document.querySelector('#gah-actionpanel [data-act="split4"]') || document.querySelector('#gah-actionpanel [data-act="wild"][data-target="4"]');
        if (b) b.click();
      });
      await sleep(800);
    }
    await click('[data-act="end-turn"]').catch(() => {});
    await sleep(1000);
    continue;
  }
  // === 拿饮品 ===
  await page.evaluate(() => document.querySelector('.gah-action[data-space="2"]').click());
  await sleep(500);
  const hint = await page.evaluate(() => {
    const h = document.querySelector('#gah-actionpanel .gah-hint');
    return h ? h.textContent.trim() : null;
  });
  console.log('面板规则提示：', hint);
  if (!hint || !hint.includes('咖啡数量不能多于')) { result = { ok: false, why: '规则提示缺失' }; break; }
  const before = { drink: drinkSum(s), kitchen: kitchenSum(s), st: JSON.parse(JSON.stringify(s)) };
  await page.evaluate(() => { const b = document.querySelector('#gah-actionpanel [data-act="food2"]'); if (!b) throw new Error('no food2 option'); b.click(); });
  await sleep(600);
  const place = await page.evaluate(() => {
    const pl = document.querySelector('.gah-place');
    if (!pl) return null;
    return {
      rows: pl.querySelectorAll('.gah-plrow').length,
      plus: !!document.querySelector('.gah-place [data-act="pl-plus"]:not([disabled])'),
      pool: pl.querySelector('.gah-plrow') ? pl.querySelector('.gah-plrow').textContent.replace(/\s+/g, '') : ''
    };
  });
  if (!place) { result = { ok: false, why: '有爱喝饮品的客人却没出现放置面板' }; break; }
  console.log('放置面板出现：行数', place.rows, '可点＋', place.plus);
  if (!place.plus) { result = { ok: false, why: '没有可点的 ＋（池子或需求异常）' }; break; }
  await page.evaluate(() => document.querySelector('.gah-place [data-act="pl-plus"]:not([disabled])').click());
  await sleep(300);
  await page.evaluate(() => { const b = document.querySelector('[data-act="pl-ok"]'); if (!b) throw new Error('no pl-ok'); b.click(); });
  await sleep(1000);
  s = await state();
  const afterDrink = drinkSum(s), afterKitchen = kitchenSum(s);
  const dTake = (before.st.dice[2] || 0) - ((s.dice[2] || 0));
  console.log(`拿取前 餐饮上单${before.drink} 厨房${before.kitchen} → 拿取后 上单${afterDrink} 厨房${afterKitchen}`);
  if (afterDrink <= before.drink) { result = { ok: false, why: '确认后客人订单没有增加（分配未生效）' }; break; }
  if (errors.length) { result = { ok: false, why: '页面报错：' + errors[0] }; break; }
  result = { ok: true, hint, rows: place.rows };
}
if (!result) result = { ok: false, why: '60 轮内未完成拿饮品流程' };

console.log(result.ok ? 'E2E PASS' : 'E2E FAIL: ' + result.why);
console.log('页面错误：', errors.length ? errors.slice(0, 3) : '无');
await page.screenshot({ path: 'D:/TREA_project/boardforge/_tmp/place-e2e.png' }).catch(() => {});
await browser.close();
process.exit(result.ok && !errors.length ? 0 : 1);
