// E2E：万能行动（6 区）选模仿目标后选项必须带上 target，不再报"模仿行动必须是 1-5"
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:8799';
const TOKENS = {
  tester1: '1cf0e5bc4e97fa0ed357a3da0234064efeaef12ba74a0d71b708bad2a38ef04c'
};

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

console.log('=== 建房（1 人 + 1 AI）===');
await click(A, '.game-card[data-game="hotel"]');
await A.waitForSelector('#room-modal', { timeout: 5000 });
await click(A, '#rm-create');
await sleep(1500);
// 勾上 AI 并设 1 个
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
  return {
    phase: s.phase, round: s.round,
    pending: s.pending ? { type: s.pending.type, seat: s.pending.seat } : null,
    mySeat: g.humanIndex,
    cur: s.currentPlayer,
    isAI: s.players[s.currentPlayer] && s.players[s.currentPlayer].isAI,
    die6: s.dice[6] || 0, dieTaken: s.players[g.humanIndex].dieTaken,
    wine: s.players[g.humanIndex].kitchen[2],
    money: s.players[g.humanIndex].money,
    status: g.ui ? g.ui.status : null
  };
});

// === 处理开局 setup ===
for (let step = 0; step < 30; step++) {
  const s = await snap();
  if (!s || s.phase !== 'setup') break;
  if (s.pending && s.pending.seat === s.mySeat) {
    if (s.pending.type === 'guestPick') {
      await A.evaluate(() => { const el = document.querySelector('.gah-guest[data-act="queue"]'); if (el) el.click(); });
    } else if (s.pending.type === 'prepare') {
      await A.evaluate(() => {
        const el = document.querySelector('.gah-room.selectable');
        if (el) el.click();
      });
      await sleep(500);
      await A.evaluate(() => { const b = document.querySelector('[data-act="pend-rooms-done"]'); if (b && !b.disabled) b.click(); });
    }
  }
  await sleep(1500);
}
let s = await snap();
console.log('setup 完成:', JSON.stringify({ phase: s.phase, wine: s.wine }));

// === 主循环：等自己回合且有 6 区骰子 → 万能行动 → 模仿拿饮品 ===
let done = false;
for (let turn = 0; turn < 30 && !done; turn++) {
  s = await snap();
  if (!s || s.phase !== 'playing') break;
  if (s.pending) { await sleep(1500); continue; }
  if (s.cur !== s.mySeat || s.isAI) { await sleep(1500); continue; }   // 等 AI
  if (s.dieTaken) { // 已取骰（不该发生），结束回合
    await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
    await sleep(1500); continue;
  }
  if (s.die6 <= 0) { // 没有万 able 骰：随便执行一个行动再结束回合
    const acted = await A.evaluate(() => {
      const cols = [...document.querySelectorAll('.gah-action.clickable')];
      const c = cols.find(x => x.dataset.space !== '6');
      if (!c) return false; c.click(); return true;
    });
    await sleep(600);
    // 面板里若有选项直接点第一个
    await A.evaluate(() => {
      const b = document.querySelector('#gah-actionpanel [data-act="food1"], #gah-actionpanel [data-act="food2"], #gah-actionpanel [data-act="split4"], #gah-actionpanel [data-act="prep"]');
      if (b) b.click();
    });
    await sleep(600);
    await A.evaluate(() => { const b = document.querySelector('[data-act="pend-rooms-done"]'); if (b && !b.disabled) b.click(); });
    await sleep(800);
    await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
    await sleep(1800);
    continue;
  }
  // ★ 关键场景：万能行动 → 选模仿目标 2（拿饮品）→ 点一个分配选项
  console.log(`turn${turn}: 我的回合，6 区骰子 ${s.die6}，执行万能行动`);
  await A.evaluate(() => { document.querySelector('.gah-action[data-space="6"]').click(); });
  await sleep(500);
  await A.evaluate(() => { const b = document.querySelector('[data-act="wild"][data-target="2"]'); if (!b) throw new Error('no wild target btn'); b.click(); });
  await sleep(500);
  const wineBefore = (await snap()).wine;
  await A.evaluate(() => { const b = document.querySelector('#gah-actionpanel [data-act="food2"]'); if (!b) throw new Error('no food2 option'); b.click(); });
  await sleep(1200);
  s = await snap();
  console.log('结果:', JSON.stringify({ dieTaken: s.dieTaken, wineBefore, wineAfter: s.wine, status: s.status }));
  if (s.status) { console.log('★ 仍有状态错误:', s.status); break; }
  if (s.dieTaken && s.wine > wineBefore) done = true;
  // 收尾：结束回合让 AI 走
  await A.evaluate(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b) b.click(); });
  await sleep(1800);
}

console.log(done ? '✅ 万能行动→模仿拿饮品 流程通过' : '❌ 未完成验证');
console.log('=== 页面错误 ===');
console.log(errs.length ? errs.join('\n') : '(无)');
await browser.close();
process.exit(done && !errs.length ? 0 : 1);
