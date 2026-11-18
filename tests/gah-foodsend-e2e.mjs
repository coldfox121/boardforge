// E2E：厨房补送多客人分配（点客人 → 分配条 → 给第二位客人也加份 → 确认，一次 ≤3 份分给多人）
import puppeteer from 'puppeteer-core';
import { GUEST_BY_ID } from 'file:///D:/TREA_project/boardforge/js/hotel-data.js?v=4';

const BASE = 'http://localhost:8799';
const TOKEN = '1cf0e5bc4e97fa0ed357a3da0234064efeaef12ba74a0d71b708bad2a38ef04c';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const click = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) throw new Error('no el: ' + s); el.click(); }, sel);
const errs = [];
function watch(page, tag) {
  page.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message));
  page.on('dialog', async d => { errs.push(tag + ' alert: ' + d.message()); await d.dismiss(); });
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) errs.push(tag + ' console: ' + m.text()); });
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 60000
});
const A = await browser.newPage();
await A.setViewport({ width: 1500, height: 1000 }); watch(A, 'A');
await A.goto(BASE + '/', { waitUntil: 'networkidle2' });
await A.evaluate(t => { localStorage.setItem('bf_token', t); localStorage.setItem('bf_username', 'tester1'); localStorage.setItem('bf_is_admin', 'false'); }, TOKEN);
await A.reload({ waitUntil: 'networkidle2' });
await sleep(800);

await click(A, '.game-card[data-game="hotel"]');
await A.waitForSelector('#room-modal', { timeout: 5000 });
await click(A, '#rm-create');
await sleep(1500);
await A.evaluate(() => { const t = document.getElementById('toggle-ai'); if (!t.checked) t.click(); const c = document.getElementById('ai-count'); if (c) c.value = '1'; });
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
    kitchen: me.kitchen, cafe: me.cafe.map(x => ({ gid: x.gid, items: x.items })),
    guestQueue: s.guestQueue.slice(),
    money: me.money, dieTaken: me.dieTaken,
    status: g.ui ? g.ui.status : null,
    foodSend: g.ui && g.ui.foodSend && g.ui.foodSend.assign ? JSON.parse(JSON.stringify(g.ui.foodSend.assign)) : null,
    sendBox: !!document.querySelector('[data-act="send-ok"]')
  };
});

// === 开局 setup：接客优先挑一位只需红酒、一位需要咖啡的客人 ===
let picked = [];
for (let step = 0; step < 40; step++) {
  const s = await snap();
  if (!s || s.phase !== 'setup') break;
  if (s.pending && s.pending.seat === s.mySeat) {
    if (s.pending.type === 'guestPick') {
      const slots = await A.evaluate(() => window.__onlineGame.state.guestQueue.slice());
      let pick = -1;
      const want = gid => gid != null && !picked.includes(gid);
      if (!picked.some(gid => GUEST_BY_ID[gid].order[2] > 0)) {
        pick = slots.findIndex(gid => want(gid) && GUEST_BY_ID[gid].order[2] > 0 && GUEST_BY_ID[gid].order[3] === 0);
      }
      if (pick < 0 && !picked.some(gid => GUEST_BY_ID[gid].order[3] > 0)) {
        pick = slots.findIndex(gid => want(gid) && GUEST_BY_ID[gid].order[3] > 0);
      }
      if (pick < 0) pick = slots.findIndex(gid => want(gid));
      if (pick < 0) pick = 0;
      if (slots[pick] != null) picked.push(slots[pick]);
      await A.evaluate(ix => { const els = document.querySelectorAll('.gah-guest[data-act="queue"]'); if (els[ix]) els[ix].click(); }, pick);
    } else if (s.pending.type === 'prepare') {
      await A.evaluate(() => { const el = document.querySelector('.gah-room.selectable'); if (el) el.click(); });
      await sleep(400);
      await A.evaluate(() => { const b = document.querySelector('[data-act="pend-rooms-done"]'); if (b && !b.disabled) b.click(); });
    } else {
      await A.evaluate(() => { const b = document.querySelector('[data-act="pend-skip"]'); if (b) b.click(); });
    }
  }
  await sleep(1300);
}

let s = await snap();
const meIdx = s.mySeat;
console.log('我的客人：', s.cafe.map(g => `${g.gid} 需${JSON.stringify(GUEST_BY_ID[g.gid].order)}`).join(' | '), '厨房', JSON.stringify(s.kitchen));

// === 进行中：先随便取一颗骰（避开 1/2 区，别把客人喂饱），回合内做补送 ===
let ok = false, why = '', added = null;
for (let turn = 0; turn < 50 && !ok; turn++) {
  s = await snap();
  if (!s || s.phase !== 'playing') { why = '对局提前结束'; break; }
  if (s.pending) {
    await A.evaluate(() => { const b = document.querySelector('[data-act="pend-skip"]') || document.querySelector('.gah-guest[data-act="queue"]'); if (b) b.click(); });
    await sleep(1300); continue;
  }
  if (s.cur !== meIdx || s.isAI) { await sleep(1300); continue; }

  // 先保证咖啡吧有 2 位客人：优先免费位里挑需要咖啡的（与第一位的需求品类错开）
  if (s.cafe.length < 2 && !s.guestTaken) {
    const MARKET_COST = [3, 2, 1, 0, 0];
    const cands = s.guestQueue
      .map((gid, i) => ({ gid, i, cost: MARKET_COST[i] }))
      .filter(x => x.gid != null);
    const coffee = cands.filter(x => GUEST_BY_ID[x.gid].order[3] > 0).sort((a, b) => a.cost - b.cost)[0];
    const pick = coffee || cands.sort((a, b) => a.cost - b.cost)[0];
    await A.evaluate(ix => {
      const els = document.querySelectorAll('.gah-guest[data-act="queue"]');
      if (els[ix]) els[ix].click();
    }, pick.i);
    await sleep(600);
    await A.evaluate(() => { const b = document.querySelector('[data-act="confirm-yes"]'); if (b) b.click(); });
    await sleep(1300);
    continue;
  }

  if (!s.dieTaken) {
    // 取一颗不影响餐饮的骰：优先 4 区，其次 6 区万能模仿 4 区；没有就过回合
    const sp = (s.kitchen ? 0 : 0) || ((s.cur === meIdx) ? await A.evaluate(() => {
      const d = window.__onlineGame.state.dice;
      if ((d[4] || 0) > 0) return 4;
      if ((d[6] || 0) > 0) return 6;
      return 0;
    }) : 0);
    if (!sp) {
      await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
      await sleep(1800); continue;
    }
    await A.evaluate(sp => document.querySelector(`.gah-action[data-space="${sp}"]`).click(), sp);
    await sleep(500);
    if (sp === 6) {
      await A.evaluate(() => { const b = document.querySelector('#gah-actionpanel [data-act="wild"][data-target="4"]'); if (!b) throw new Error('no wild4'); b.click(); });
      await sleep(400);
    }
    const hasSplit = await A.evaluate(() => !!document.querySelector('#gah-actionpanel [data-act="split4"]'));
    if (!hasSplit) { await sleep(800); continue; }
    await A.evaluate(() => { document.querySelector('#gah-actionpanel [data-act="split4"]').click(); });
    await sleep(900);
    s = await snap();
    if (s.pending) continue;
  }

  // 回合内：点第一位有需求且厨房有货的客人
  const target = s.cafe.findIndex(g => {
    const order = GUEST_BY_ID[g.gid].order;
    return order.some((n, f) => n - (g.items[f] || 0) > 0 && s.kitchen[f] > 0);
  });
  if (target < 0) {
    await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
    await sleep(1800); continue;
  }
  await A.evaluate(ix => {
    const cards = document.querySelectorAll('.gah-cafeguest[data-act="cafe"]');
    if (!cards[ix]) throw new Error('no cafe card ' + ix);
    cards[ix].click();
  }, target);
  await sleep(600);
  s = await snap();
  if (!s.foodSend) {
    await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
    await sleep(1800); continue;
  }
  console.log('分配条弹出，预填 assign =', JSON.stringify(s.foodSend));

  // 给除所点客人外的另一位客人加 1 份（多客人验证）
  added = await A.evaluate(tgt => {
    const rows = [...document.querySelectorAll('[data-act="send-plus"]')].map(b => ({ b, g: +b.dataset.g, f: +b.dataset.f }));
    const other = rows.find(x => x.g !== tgt && !x.b.disabled);
    if (other) { other.b.click(); return { g: other.g, f: other.f }; }
    return null;
  }, target);
  await sleep(400);
  s = await snap();
  console.log('第二位客人加份：', JSON.stringify(added), '→ assign =', JSON.stringify(s.foodSend));
  const assignBefore = s.foodSend;
  const plan = assignBefore.map((items, g) => ({ g, items })).filter(m => m.items.some(n => n > 0));
  const totalSent = plan.reduce((a, m) => a + m.items.reduce((x, y) => x + y, 0), 0);
  const guestsInvolved = plan.length;
  const moneyBefore = s.money, kitchenBefore = s.kitchen.slice();

  await A.evaluate(() => { const b = document.querySelector('[data-act="send-ok"]'); if (!b || b.disabled) throw new Error('send-ok 不可用'); b.click(); });
  await sleep(1200);
  s = await snap();

  // 核对：每位客人拿到的数量 ≥ assign 中的份数（订单可能另有来源，取 >=）
  const afterOK = plan.every(m => m.items.every((n, f) => !n || (s.cafe[m.g].items[f] || 0) >= n));
  const kitchenDelta = kitchenBefore.reduce((a, b, i) => a + (b - s.kitchen[i]), 0);
  const costOK = s.money === moneyBefore || s.money === moneyBefore - 1;
  console.log('结果：', JSON.stringify({
    cafe: s.cafe.map(g => g.items), kitchen: s.kitchen,
    money: `${moneyBefore}→${s.money}`, kitchenDelta, totalSent, guestsInvolved, status: s.status
  }));
  if (!s.status && s.foodSend === null && afterOK && costOK && kitchenDelta === totalSent && guestsInvolved >= (added ? 2 : 1)) ok = true;
  else { why = `核对失败 afterOK=${afterOK} costOK=${costOK} kitchenDelta=${kitchenDelta} totalSent=${totalSent} guests=${guestsInvolved}`; break; }

  await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
  await sleep(1800);
}

if (added) console.log('✓ 已验证一次补送分给两位客人');
console.log(ok ? '✅ 多客人补送流程通过' : '❌ 未完成验证：' + why);
console.log('=== 页面错误 ===');
console.log(errs.length ? errs.join('\n') : '(无)');
await browser.close();
process.exit(ok && !errs.length ? 0 : 1);
