// 拿取餐饮自选分配测试：官方规则"获得时可立即放上客人订单（自选），剩余进厨房"
import { initGame, applyAction, validateAction, canPrepareIndex } from 'file:///D:/TREA_project/boardforge/js/hotel-engine.js?v=8';
import { GUEST_BY_ID } from 'file:///D:/TREA_project/boardforge/js/hotel-data.js?v=4';

let fails = 0;
const check = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); fails++; } else console.log('PASS: ' + msg); };

// 跑完开局：接客（自动接队列首位）+ 备房（每次放第一个合法位置）
function finishSetup(s) {
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 200) {
    const t = s.pending;
    if (t.type === 'guestPick') s = applyAction(s, t.seat, { type: 'RESOLVE', choice: {} });
    else if (t.type === 'prepare') {
      const p = s.players[t.seat];
      const idx = p.rooms.findIndex((_, i) => canPrepareIndex(p, i, 3));
      s = applyAction(s, t.seat, { type: 'RESOLVE', choice: { rooms: [idx] } });
    } else s = applyAction(s, t.seat, { type: 'RESOLVE', choice: {} });
  }
  return s;
}

// 造一个"0 号玩家回合、2 区有 3 骰、咖啡吧有 3 位需要红酒的客人"的局面
function scenario(wineNeeds) {
  let s = finishSetup(initGame(['A', 'B']));
  s.currentPlayer = 0;
  s.dice[2] = 3;
  s.pending = null;
  const p = s.players[0];
  p.dieTaken = false;
  p.boosted = false;
  // 49 需 1 红酒、54 需 2 红酒
  p.cafe = wineNeeds.map(n => ({ gid: n === 2 ? 54 : 49, items: [0, 0, 0, 0] }));
  return s;
}

// ===== 用例 1：自选分配到指定客人（用户场景：两位有需求时可以选给谁）=====
{
  const s0 = scenario([1, 1]);           // 两位客人各需 1 红酒
  const act = { type: 'TAKE_DIE', action: 2, wine: 2, coffee: 1, assign: [[], [0, 0, 1, 0]] };
  const err = validateAction(s0, 0, act);
  check(err === null, '分配给第 2 位客人的动作校验通过');
  const s = applyAction(s0, 0, act);
  const p = s.players[0];
  check(p.cafe[0].items[2] === 0, '第 1 位客人没拿到红酒（没被动分配）');
  check(p.cafe[1].items[2] === 1, '第 2 位客人拿到 1 红酒');
  check(p.kitchen[2] === 2, '剩余 1 红酒进厨房（1 起点 + 1 剩余）');
  check(p.kitchen[3] === 2, '咖啡 1 份进厨房（起点 1 + 1）');
}

// ===== 用例 2：超过客人剩余需求被拒 =====
{
  const s0 = scenario([1]);
  const err = validateAction(s0, 0, { type: 'TAKE_DIE', action: 2, wine: 3, coffee: 0, assign: [[0, 0, 2, 0]] });
  check(err === '超出客人剩余需求', `超出需求的分配被拒（${err}）`);
}

// ===== 用例 3：分配总数超过获得量被拒 =====
{
  const s0 = scenario([1, 1]);
  s0.dice[2] = 1;
  const err = validateAction(s0, 0, { type: 'TAKE_DIE', action: 2, wine: 1, coffee: 0, assign: [[0, 0, 1, 0], [0, 0, 1, 0]] });
  check(err === '分配数量超过获得量', `总数超获得量的分配被拒（${err}）`);
}

// ===== 用例 4：不带 assign = 全部进厨房（不再默认铺到客人）=====
{
  const s0 = scenario([1, 1]);
  const s = applyAction(s0, 0, { type: 'TAKE_DIE', action: 2, wine: 2, coffee: 1 });
  const p = s.players[0];
  check(p.cafe.every(g => (g.items[2] || 0) === 0), '不带分配时客人订单不变');
  check(p.kitchen[2] === 3 && p.kitchen[3] === 2, '3 份红酒、1 份咖啡全部进厨房');
}

// ===== 用例 5：分配正好铺满客人（含 2 杯需求的客人）=====
{
  const s0 = scenario([2]);
  const s = applyAction(s0, 0, { type: 'TAKE_DIE', action: 2, wine: 2, coffee: 1, assign: [[0, 0, 2, 0]] });
  const p = s.players[0];
  check(p.cafe[0].items[2] === 2, '需 2 杯红酒的客人被铺满');
  check(p.kitchen[2] === 1, '多出的 1 杯进厨房');
}

// ===== 用例 6：吉萨先生（bonusDie）模仿拿饮品同样支持自选分配 =====
{
  const s0 = scenario([1, 1]);
  s0.dice[2] = 2;
  s0.pending = { type: 'bonusDie', seat: 0 };
  let s;
  try {
    s = applyAction(s0, 0, { type: 'RESOLVE', choice: { target: 2, wine: 1, coffee: 1, assign: [[], [0, 0, 1, 0]] } });
    check(s.players[0].cafe[1].items[2] === 1, 'bonusDie 分配给第 2 位客人成功');
    check(s.players[0].kitchen[3] === 2, 'bonusDie 未分配的咖啡进厨房');
  } catch (e) { check(false, 'bonusDie 分配异常：' + e.message); }
}

// ===== 用例 7：奖励类获得（foodPick 任选餐饮）仍自动铺放 =====
{
  const s0 = scenario([1]);
  s0.pending = { type: 'foodPick', seat: 0, count: 1 };
  const s = applyAction(s0, 0, { type: 'RESOLVE', choice: { foods: [0, 0, 1, 0] } });
  const p = s.players[0];
  check(p.cafe[0].items[2] === 1, '奖励获得的红酒自动铺到有需求的客人（官方：获得时可立即放置）');
  check(p.kitchen[2] === 1, '厨房存量不变');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
