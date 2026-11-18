import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:8799';
const TOKEN = '1cf0e5bc4e97fa0ed357a3da0234064efeaef12ba74a0d71b708bad2a38ef04c';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 60000 });
const A = await browser.newPage();
await A.setViewport({ width: 1500, height: 1000 });
const errors = [];
A.on('pageerror', e => errors.push(String(e)));
await A.goto(BASE + '/', { waitUntil: 'networkidle2' });
await A.evaluate(t => { localStorage.setItem('bf_token', t); localStorage.setItem('bf_username', 'tester1'); localStorage.setItem('bf_is_admin', 'false'); }, TOKEN);
await A.reload({ waitUntil: 'networkidle2' });
await sleep(800);
await A.evaluate(() => document.querySelector('.game-card[data-game="hotel"]').click());
await A.waitForSelector('#room-modal', { timeout: 5000 });
await A.evaluate(() => document.getElementById('rm-create').click());
await sleep(1200);
await A.evaluate(() => { const t = document.getElementById('toggle-ai'); if (!t.checked) t.click(); const c = document.getElementById('ai-count'); if (c) c.value = '1'; });
await A.evaluate(() => document.getElementById('btn-start-game').click());
await sleep(3500);
// 若开局接客阶段直接处理掉，进入第 1 轮看行动板块
for (let i = 0; i < 30; i++) {
  const st = await A.evaluate(() => { const g = window.__onlineGame; return g && g.state ? g.state.phase : null; });
  if (st !== 'setup') break;
  const mine = await A.evaluate(() => { const g = window.__onlineGame; const s = g.state; return s.pending && s.pending.seat === g.humanIndex ? s.pending.type : null; });
  if (mine === 'guestPick') await A.evaluate(() => { const el = document.querySelector('.gah-guest[data-act="queue"]'); if (el) el.click(); });
  else if (mine === 'prepare') {
    await A.evaluate(() => { const el = document.querySelector('.gah-room.selectable'); if (el) el.click(); });
    await sleep(400);
    await A.evaluate(() => { const b = document.querySelector('[data-act="pend-rooms-done"]'); if (b && !b.disabled) b.click(); });
  }
  await sleep(1400);
}
await sleep(1000);
// 截图行动板块
const board = await A.$('#gah-actions');
if (board) await board.screenshot({ path: 'D:/TREA_project/boardforge/_tmp/rule-sym-board.png' });
// 点 2 区（拿饮品）截规则提示
await A.evaluate(() => { const c = document.querySelector('.gah-action[data-space="2"].clickable'); if (c) c.click(); });
await sleep(600);
const panel = await A.$('#gah-actionpanel');
if (panel) await panel.screenshot({ path: 'D:/TREA_project/boardforge/_tmp/rule-sym-panel.png' });
const has = await A.evaluate(() => document.querySelector('#gah-actionpanel')?.textContent.includes('规则') || false);
console.log(JSON.stringify({ errors, panelShown: has }));
await browser.close();
