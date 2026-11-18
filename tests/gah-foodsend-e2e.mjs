// E2E：厨房送餐手动分配（点咖啡吧客人 → 加减份数 → 确认送餐）
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8799';
const TOKENS = { tester1: '1cf0e5bc4e97fa0ed357a3da0234064efeaef12ba74a0d71b708bad2a38ef04c' };

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 60000
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error('no el: ' + s); el.click(); }, sel);
const errs = [];
function watch(page, tag) {
  page.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
  page.on('dialog', async d => { errs.push(tag + ' alert: ' + d.message()); await d.dismiss(); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) errs.push(tag + ' console: ' + m.text()); });
}

const ctxA = await browser.createBrowserContext();
const A = await ctxA.newPage(); await A.setViewport({ width: 1500, height: 1000 }); watch(A, 'A');
await A.goto(BASE + '/', { waitUntil: 'networkidle2' });
await A.evaluate(([u, t]) => {
  localStorage.setItem('bf_token', t); localStorage.setItem('bf_username', u); localStorage.setItem('bf_is_admin', 'false');
}, ['tester1', TOKENS.tester1]);
await A.reload({ waitUntil: 'networkidle2' });
await sleep(800);

await click(A, '.game-card[data-game="hotel"]');
await A.waitForSelector('#room-modal', { timeout: 5000 });
await click(A, '#rm-create');
await sleep(1500);
await A.evaluate(() => {
  const t = document.getElementById('toggle-ai');
  if (!t.checked) t.click();
  const c = document.getElementById('ai-count');
  if (c) c.value = '1';
});
await click(A, '#btn-start-game');
await sleep(4000);

const snap = () => A.evaluate(() => {
  const g = window.__onlineGame;
  if (!g || !g.state) return null;
  const s = g.state;
  const me = s.players[g.humanIndex];
  return {
    phase: s.phase, pending: s.pending ? { type: s.pending.type, seat: s.pending.seat } : null,
    mySeat: g.humanIndex, cur: s.currentPlayer,
    isAI: s.players[s.currentPlayer] && s.players[s.currentPlayer].isAI,
    kitchen: me.kitchen, cafe: me.cafe.map(x => x.items), money: me.money, dieTaken: me.dieTaken,
    status: g.ui ? g.ui.status : null,
    foodSend: g.ui && g.ui.foodSend ? { guestIdx: g.ui.foodSend.guestIdx, items: g.ui.foodSend.items } : null,
    sendBox: !!document.querySelector('[data-act="send-ok"]')
  };
});

// === 开局 setup ===
for (let step = 0; step < 30; step++) {
  const s = await snap();
  if (!s || s.phase !== 'setup') break;
  if (s.pending && s.pending.seat === s.mySeat) {
    if (s.pending.type === 'guestPick') await A.evaluate(() => { const el = document.querySelector('.gah-guest[data-act="queue"]'); if (el) el.click(); });
    else if (s.pending.type === 'prepare') {
      await A.evaluate(() => { const el = document.querySelector('.gah-room.selectable'); if (el) el.click(); });
      await sleep(400);
      await A.evaluate(() => { const b = document.querySelector('[data-act="pend-rooms-done"]'); if (b && !b.disabled) b.click(); });
    }
  }
  await sleep(1500);
}
console.log('setup 完成:', JSON.stringify((await snap())));

// === 等自己回合（可能先取骰/做别的，回合内点击咖啡吧客人做手动送餐） ===
let ok = false;
for (let turn = 0; turn < 40 && !ok; turn++) {
  let s = await snap();
  if (!s || s.phase !== 'playing') break;
  if (s.pending) { await sleep(1500); continue; }
  if (s.cur !== s.mySeat || s.isAI) { await sleep(1500); continue; }

  // 找一位订单未满足、厨房有货的客人
  const target = await A.evaluate(() => {
    const g = window.__onlineGame, me = g.state.players[g.humanIndex];
    for (let i = 0; i < me.cafe.length; i++) {
      const gg = me.cafe[i];
      const need = [0, 1, 2, 3].some(f => gg.items[f] < (window.__hotelOrder(gg.gid, f) ?? 0));
      if (need) return i;
    }
    return -1;
  }).catch(() => -1);

  // 直接点第一个未完成的客人卡（引擎校验兜底）
  const clicked = await A.evaluate(() => {
    const cards = [...document.querySelectorAll('.gah-cafeguest[data-act="cafe"]')];
    const card = cards.find(c => !c.classList.contains('done'));
    if (!card) return 'no undone guest';
    card.click();
    return 'clicked';
  });
  await sleep(600);
  s = await snap();
  if (!s.foodSend) {
    // 没弹分配条（客人订单已满足或厨房无货）→ 结束回合换 AI
    await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
    await sleep(1800);
    continue;
  }
  console.log(`turn${turn}: 分配条已弹出 预填=${JSON.stringify(s.foodSend.items)} kitchen=${JSON.stringify(s.kitchen)}`);

  // 调整：对第一个可减的餐饮点一次 −
  const adjusted = await A.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-act="send-minus"]')].find(b => !b.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  });
  await sleep(400);
  s = await snap();
  const afterMinus = s.foodSend.items;
  console.log('  减 1 后:', JSON.stringify(afterMinus));
  // 若减到全 0，加回 1
  if (afterMinus.reduce((a, b) => a + b, 0) === 0) {
    await A.evaluate(() => { const b = [...document.querySelectorAll('[data-act="send-plus"]')].find(x => !x.disabled); if (b) b.click(); });
    await sleep(400);
    s = await snap();
    console.log('  加回 1:', JSON.stringify(s.foodSend.items));
  }
  const moneyBefore = s.money, kitchenBefore = s.kitchen.slice();
  await A.evaluate(() => { const b = document.querySelector('[data-act="send-ok"]'); if (!b) throw new Error('no send-ok'); b.click(); });
  await sleep(1200);
  s = await snap();
  const totalSent = afterMinus.reduce((a, b) => a + b, 0);
  const kitchenDelta = kitchenBefore.reduce((a, b, i) => a + (b - s.kitchen[i]), 0);
  console.log('  送餐结果:', JSON.stringify({ status: s.status, money: s.money, kitchenAfter: s.kitchen, kitchenDelta, moneyBefore }));
  const costFreeOr1 = s.money === moneyBefore || s.money === moneyBefore - 1;
  if (!s.status && s.foodSend === null && costFreeOr1 && kitchenDelta === totalSent) ok = true;
  else { console.log('★ 校验失败'); break; }
  await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
  await sleep(1800);
}

console.log(ok ? '✅ 手动分配送餐流程通过' : '❌ 未完成验证');
console.log('=== 页面错误 ===');
console.log(errs.length ? errs.join('\n') : '(无)');
await browser.close();
process.exit(ok && !errs.length ? 0 : 1);
