// 旧档兼容测试：65f55cf 之前的开局存档（固定 3 房、无 setupRooms 字段）在新引擎下必须能打完开局
import { initGame, applyAction } from 'file:///D:/TREA_project/boardforge/js/hotel-engine.js';

let fails = 0;
const check = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); fails++; } else console.log('PASS: ' + msg); };

// 把新档改造成 65f55cf 之前的旧档形态：
// - rooms 0/1/2 固定已备（老规则）
// - 删除 setupRooms 字段
function makeLegacy(n) {
  const s = initGame(Array.from({ length: n }, (_, i) => 'P' + i));
  s.players.forEach(p => { for (let i = 0; i < 3; i++) p.rooms[i].prepared = true; });
  delete s.setupRooms;
  return s;
}

// 场景 1：旧档从开局一路接客 → 直接进第 1 轮（老规则，无自选备房）
{
  const s = makeLegacy(2);
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 20) {
    check(s.pending && s.pending.type === 'guestPick', `旧档 pending 应为 guestPick（轮次 ${guard}）`);
    if (!s.pending || s.pending.type !== 'guestPick') break;
    const ns = applyAction(s, s.pending.seat, { type: 'RESOLVE', choice: { slot: 0 } });
    Object.assign(s, ns);
  }
  check(s.phase === 'playing', '旧档接完客后直接进入 playing（不崩、不进入备房）');
  check(s.players.every(p => p.cafe.length === 1), '旧档每人咖啡吧有 1 位客人');
  check(s.players.every(p => p.rooms.filter(r => r.prepared).length === 3), '旧档每人仍保留固定 3 间已备房');
  check(s.diceTotal > 0, '旧档开局骰子已掷');
}

// 场景 2：用户实际卡死的形态——setupPicks 已空、pending guestPick、无 setupRooms
{
  const s = makeLegacy(2);
  s.setupPicks = [];
  check(s.pending && s.pending.type === 'guestPick', '卡死档 pending=guestPick');
  const before = s.pending.seat;
  let ok = true;
  try {
    const ns = applyAction(s, s.pending.seat, { type: 'RESOLVE', choice: { slot: 1 } });
    Object.assign(s, ns);
  } catch (e) {
    ok = false;
    console.error('FAIL: 卡死档接客仍抛错 → ' + e.message);
    fails++;
  }
  check(ok, '卡死档最后一位接客不再抛 push 错误');
  check(ok && s.phase === 'playing', '卡死档接客后进入 playing');
  check(ok && s.players[before].cafe.length === 1, '最后一位玩家的客人已入咖啡吧');
}

// 场景 3：回归——新档（自选备房）流程不受影响
{
  const s = initGame(['甲', '乙']);
  let guard = 0;
  while (s.phase === 'setup' && guard++ < 60) {
    const t = s.pending;
    if (!t) break;
    const choice = t.type === 'guestPick' ? { slot: 0 }
      : t.type === 'prepare' ? { rooms: [s.players[t.seat].rooms.map((_r, i) => i).filter(i => !s.players[t.seat].rooms[i].prepared)
        .sort((a, b) => (Math.floor(a / 5) - Math.floor(b / 5)) || (a - b))[0]] } : {};
    const ns = applyAction(s, t.seat, { type: 'RESOLVE', choice });
    Object.assign(s, ns);
  }
  check(s.phase === 'playing', '新档：接客 2 + 备房 6 步后进入 playing');
  check(s.players.every(p => p.rooms.filter(r => r.prepared).length === 3), '新档：每人自选备 3 间');
  check(s.players.every(p => p.cafe.length === 1), '新档：每人接 1 位客人');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
