// 奥地利大饭店 · 规则引擎（纯函数：state + action → new state）
// 官方 2021 零售版规则；不碰 DOM / 网络 / 时间，洗牌用 Math.random
//
// 已明确的两处实现约定（不改变规则结果，只减少交互轮次）：
//  1) 新获得的餐饮自动优先铺到咖啡吧客人订单上（免费放置），剩余进厨房；玩家仍可付费从厨房补送。
//  2) 皇帝结算时的奖励/惩罚若含二选一，由引擎自动选择（付得起钱就付钱，否则扣分等），不打断全场节奏。

import {
  GUESTS, GUEST_BY_ID, STAFF, STAFF_BY_ID, OBJECTIVES, EMPERORS,
  ROOM_COLORS, ROOM_GROUPS, FLOOR_COST, IMMEDIATE_VP,
  BLUE_BONUS, OTHER_BONUS, EMPEROR_POINTS, EMPEROR_MAX,
  MARKET_COST, DICE_BY_PLAYERS, POLITICS_SPOTS, STAFF_ONCE
} from './hotel-data.js?v=4';

// ===== 通用工具 =====
const clone = o => JSON.parse(JSON.stringify(o));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export const COLOR_ZH = { blue: '蓝', red: '红', yellow: '黄', green: '绿' };
const FOOD_ZH = ['金', '粉', '红', '棕']; // 与餐饮色块颜色对应（金=苹果卷 粉=蛋糕 红=红酒 棕=咖啡）

function vec(idx, n) { const v = [0, 0, 0, 0]; v[idx] = n; return v; }
function sumVec(v) { return v[0] + v[1] + v[2] + v[3]; }
function foodText(v) {
  return v.map((n, i) => n > 0 ? `${n}${FOOD_ZH[i]}` : '').filter(Boolean).join('+') || '无';
}

// ===== 日志 =====
const LOG_MAX = 200;
function pushLog(s, seat, desc, type) {
  if (!Array.isArray(s.log)) s.log = [];
  s.log.push({
    round: s.round, seat,
    name: s.players && s.players[seat] ? s.players[seat].name : '',
    type: type || '', desc
  });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

// ===== 初始化 =====
export function initGame(playerNames) {
  if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 4) {
    throw new Error('玩家数必须是 2-4');
  }
  const n = playerNames.length;

  const guestDeck = shuffle(GUESTS.map(g => g.id));
  const queue = guestDeck.splice(0, 5);
  const staffDeck = shuffle(STAFF.map(x => x.id));

  const players = playerNames.map((name, i) => {
    const rooms = Array.from({ length: 20 }, () => ({ prepared: false, occupied: false }));
    return {
      seat: i, name: String(name), isAI: false,
      score: 0, money: 10, emperor: 0,
      rooms,
      kitchen: [1, 1, 1, 1],
      cafe: [],
      hotel: [],
      hand: staffDeck.splice(0, 6),
      hired: [],
      staffUsed: [],
      claims: [],
      numbersLeft: 2,
      passed: false,
      dieTaken: false,
      guestTaken: false,
      boosted: false
    };
  });

  // 目标卡：A/B/C 各随机 1 张；皇帝板块：A/B/C 各随机 1 张
  const objectives = ['A', 'B', 'C'].map(group => {
    const card = clone(pick(OBJECTIVES.filter(o => o.group === group)));
    card.spots = POLITICS_SPOTS.map(vp => ({ seat: null, vp }));
    return card;
  });
  const emperors = ['A', 'B', 'C'].map(group => clone(pick(EMPERORS.filter(e => e.group === group))));

  const s = {
    game: 'hotel',
    round: 1,
    phase: 'setup',
    currentPlayer: 0,
    startPlayer: 0,
    dice: [0, 0, 0, 0, 0, 0, 0],
    diceTotal: DICE_BY_PLAYERS[n],
    guestQueue: queue,
    guestDeck,
    staffDeck,
    objectives,
    emperors,
    players,
    pending: null,
    pendingTasks: [],
    setupPicks: [],
    setupRooms: [],
    log: [],
    winners: [],
    finalScores: null
  };

  // 开局接客：从尾家开始逆时针各免费接 1 位
  for (let i = n - 1; i >= 0; i--) s.setupPicks.push(i);
  s.currentPlayer = s.setupPicks[0];
  addTask(s, { type: 'guestPick', seat: s.setupPicks.shift(), count: 1, free: true, setup: true });
  flushPending(s);
  return s;
}

// ===== 基础查询 =====
export function diceTotal(s) {
  let t = 0;
  for (let i = 1; i <= 6; i++) t += (s.dice && s.dice[i]) || 0;
  return t;
}

export function hasHired(p, id) { return p.hired.includes(id); }

export function guestComplete(g) {
  const def = GUEST_BY_ID[g.gid];
  if (!def) return false;
  return def.order.every((need, i) => (g.items[i] || 0) >= need);
}

export function orderTotal(gid) {
  const def = GUEST_BY_ID[gid];
  return def ? def.order.reduce((a, b) => a + b, 0) : 0;
}

export function canPrepareIndex(p, idx, maxFloor = 3) {
  if (idx < 0 || idx > 19) return false;
  if (p.rooms[idx].prepared) return false;
  if (Math.floor(idx / 5) > maxFloor) return false;
  const anyPrepared = p.rooms.some(r => r.prepared);
  if (!anyPrepared) return idx === 0;
  const row = Math.floor(idx / 5), col = idx % 5;
  const nb = [];
  if (col > 0) nb.push(idx - 1);
  if (col < 4) nb.push(idx + 1);
  if (row > 0) nb.push(idx - 5);
  if (row < 3) nb.push(idx + 5);
  return nb.some(i => p.rooms[i].prepared);
}

export function prepareCostFor(p, idx, discount = 0) {
  const color = ROOM_COLORS[idx];
  const free = (color === 'blue' && hasHired(p, 9)) ||
               (color === 'red' && hasHired(p, 10)) ||
               (color === 'yellow' && hasHired(p, 11));
  if (free) return 0;
  return Math.max(0, FLOOR_COST[Math.floor(idx / 5)] - discount);
}

export function actionStrength(s, p, space, boost) {
  let st = (s.dice[space] || 0);
  if (boost) st += 1;
  if (hasHired(p, 13) && (space === 1 || space === 2)) st += 1;
  if (hasHired(p, 17) && space === 6) st += 1;
  return st;
}

// ===== 员工/目标查询 =====
function staffDef(id) { return STAFF_BY_ID[id] || { id, name: '员工#' + id, cost: 0, kind: 'permanent', text: '' }; }

function occupiedCount(p, color) {
  return p.rooms.reduce((n, r, i) => n + (r.occupied && ROOM_COLORS[i] === color ? 1 : 0), 0);
}
function preparedCount(p) { return p.rooms.filter(r => r.prepared).length; }
function occupiedTotal(p) { return p.rooms.filter(r => r.occupied).length; }
function fullRows(p) {
  let n = 0;
  for (let row = 0; row < 4; row++) {
    if ([0, 1, 2, 3, 4].every(c => p.rooms[row * 5 + c].occupied)) n++;
  }
  return n;
}
function fullCols(p) {
  let n = 0;
  for (let col = 0; col < 5; col++) {
    if ([0, 1, 2, 3].every(r => p.rooms[r * 5 + col].occupied)) n++;
  }
  return n;
}
function fullGroups(p) {
  return ROOM_GROUPS.reduce((n, g) => n + (g.every(i => p.rooms[i].occupied) ? 1 : 0), 0);
}

export function objectiveMet(p, obj) {
  switch (obj.test) {
    case 'money': return p.money >= 20;
    case 'prepared': return preparedCount(p) >= 12;
    case 'staff': return p.hired.length >= 6;
    case 'emperor': return p.emperor >= 10;
    case 'rows': return fullRows(p) >= 2;
    case 'groups': return fullGroups(p) >= 6;
    case 'cols': return fullCols(p) >= 2;
    case 'color': return ['blue', 'red', 'yellow'].some(c =>
      ROOM_COLORS.every((col, i) => col !== c || p.rooms[i].occupied));
    case 'rgb': return ['blue', 'red', 'yellow'].every(c => occupiedCount(p, c) >= 3);
    case 'ry': return occupiedCount(p, 'red') >= 4 && occupiedCount(p, 'yellow') >= 3;
    case 'yb': return occupiedCount(p, 'yellow') >= 4 && occupiedCount(p, 'blue') >= 3;
    case 'br': return occupiedCount(p, 'blue') >= 4 && occupiedCount(p, 'red') >= 3;
    default: return false;
  }
}

// ===== 皇帝轨 =====
function advanceEmperor(s, p, seat, n, silent) {
  if (n <= 0) return;
  const before = p.emperor;
  const after = before + n;
  if (after > EMPEROR_MAX) {
    p.score += after - EMPEROR_MAX;
    p.emperor = EMPEROR_MAX;
  } else {
    p.emperor = after;
  }
  if (!silent) {
    pushLog(s, seat, `🕊 皇帝轨 ${before} → ${p.emperor}${after > EMPEROR_MAX ? `（溢出 +${after - EMPEROR_MAX} 分）` : ''}`, 'emperor');
  }
}

// ===== 餐饮 =====
// 官方规则：获得餐饮时可立即放上客人订单（玩家自选放哪家），剩余进厨房。
// assign == null：自动铺放（客人奖励/员工效果等固定获得途径，保持旧行为）
// assign 为数组：按玩家分配严格放置（拿餐食/饮品行动），未分配的直接进厨房
function gainFood(s, p, seat, add, assign) {
  const placed = [0, 0, 0, 0];
  if (Array.isArray(assign)) {
    p.cafe.forEach((g, gi) => {
      const a = assign[gi];
      if (!a) return;
      const def = GUEST_BY_ID[g.gid];
      for (let f = 0; f < 4; f++) {
        const n = a[f] | 0;
        if (n < 0 || n > add[f] - placed[f]) throw new Error('分配数量超过获得量');
        if (n > Math.max(0, def.order[f] - (g.items[f] || 0))) throw new Error('超出客人剩余需求');
        if (n > 0) { g.items[f] = (g.items[f] || 0) + n; placed[f] += n; }
      }
    });
  } else {
    for (let f = 0; f < 4; f++) {
      let left = add[f] || 0;
      for (const g of p.cafe) {
        if (left <= 0) break;
        const def = GUEST_BY_ID[g.gid];
        const need = def.order[f] - (g.items[f] || 0);
        if (need > 0) {
          const put = Math.min(need, left);
          g.items[f] = (g.items[f] || 0) + put;
          left -= put;
          placed[f] += put;
        }
      }
    }
  }
  const rest = add.map((n, f) => (n || 0) - placed[f]);
  for (let f = 0; f < 4; f++) p.kitchen[f] += rest[f];
  if (sumVec(add) > 0) {
    let msg = `🍽 获得 ${foodText(add)}`;
    const hasPlaced = sumVec(placed) > 0, hasRest = sumVec(rest) > 0;
    if (hasPlaced || hasRest) {
      msg += '（';
      if (hasPlaced) msg += `${foodText(placed)} 放上客人订单`;
      if (hasPlaced && hasRest) msg += '，';
      if (hasRest) msg += `${foodText(rest)} 进厨房`;
      msg += '）';
    }
    pushLog(s, seat, msg, 'food');
  }
}

// 校验玩家自选分配：每个客人不超过其剩余需求，总数不超过获得量
function validateFoodAssign(p, assign, taken) {
  if (assign == null) return null;
  if (!Array.isArray(assign) || assign.length > p.cafe.length) return '分配数据无效';
  const tot = [0, 0, 0, 0];
  for (let gi = 0; gi < assign.length; gi++) {
    const a = assign[gi];
    if (a == null) continue;
    const def = GUEST_BY_ID[p.cafe[gi].gid];
    for (let f = 0; f < 4; f++) {
      const n = a[f] | 0;
      if (n < 0) return '分配数量无效';
      if (n > Math.max(0, def.order[f] - (p.cafe[gi].items[f] || 0))) return '超出客人剩余需求';
      tot[f] += n;
    }
  }
  for (let f = 0; f < 4; f++) if (tot[f] > (taken[f] || 0)) return '分配数量超过获得量';
  return null;
}

function drawStaff(s, p, seat, n) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (!s.staffDeck.length) break;
    const id = s.staffDeck.shift();
    p.hand.push(id);
    got.push(id);
  }
  if (got.length) pushLog(s, seat, `🃏 抽 ${got.length} 张员工牌进手牌`, 'staff');
}

// ===== 任务队列（需要玩家做选择的奖励）=====
function addTask(s, task) {
  if (!Array.isArray(s.pendingTasks)) s.pendingTasks = [];
  const last = s.pendingTasks[s.pendingTasks.length - 1];
  if (last && last.type === task.type && last.seat === task.seat &&
      last.discount === task.discount && last.maxFloor === task.maxFloor &&
      (task.type === 'prepare' || task.type === 'occupy' || task.type === 'guestPick')) {
    last.count += task.count;
    return;
  }
  s.pendingTasks.push(task);
}

function taskPossible(s, t) {
  const p = s.players[t.seat];
  if (!p) return false;
  switch (t.type) {
    case 'prepare': return p.rooms.some((r, i) => canPrepareIndex(p, i, t.maxFloor ?? 3));
    case 'occupy': return p.rooms.some(r => r.prepared && !r.occupied);
    case 'hire': return p.hand.length > 0;
    case 'offer': return (t.cards || []).length > 0;
    case 'guestPick': return p.cafe.length < 3 && s.guestQueue.length > 0;
    case 'complete': return p.cafe.some(g => !guestComplete(g));
    case 'prepareOccupy': return p.rooms.some((r, i) => canPrepareIndex(p, i, t.maxFloor ?? 3));
    case 'bonusDie': return diceTotal(s) > 0;
    case 'foodPick': return true;
    default: return true;
  }
}

function flushPending(s) {
  if (!Array.isArray(s.pendingTasks)) s.pendingTasks = [];
  if (s.pending) return;
  while (s.pendingTasks.length) {
    const t = s.pendingTasks.shift();
    if (!taskPossible(s, t)) continue;
    s.pending = t;
    s.currentPlayer = t.seat;
    return;
  }
}

// ===== 房间准备 / 入住 =====
function doPrepare(s, p, seat, idx, discount, maxFloor) {
  if (!canPrepareIndex(p, idx, maxFloor)) throw new Error('该房间不能准备');
  const cost = prepareCostFor(p, idx, discount);
  if (cost > p.money) throw new Error('克朗不足');
  p.money -= cost;
  p.rooms[idx].prepared = true;
  const bonus = IMMEDIATE_VP[idx] || 0;
  if (bonus) p.score += bonus;
  pushLog(s, seat, `🏨 准备 ${Math.floor(idx / 5) + 1} 层${COLOR_ZH[ROOM_COLORS[idx]]}房` +
    (cost ? `（-${cost} 克朗）` : '（免费）') + (bonus ? ` +${bonus} 分` : ''), 'room');
  return cost;
}

function groupBonus(s, p, seat, idx) {
  const gi = ROOM_GROUPS.findIndex(g => g.includes(idx));
  if (gi < 0) return;
  const g = ROOM_GROUPS[gi];
  if (!g.every(i => p.rooms[i].occupied)) return;
  const color = ROOM_COLORS[idx];
  const size = g.length;
  if (color === 'blue') {
    const vp = BLUE_BONUS[size] || 0;
    p.score += vp;
    pushLog(s, seat, `🎉 蓝色房组（${size} 间）全部住满：+${vp} 分`, 'bonus');
  } else if (color === 'red') {
    const m = OTHER_BONUS[size] || 0;
    p.money += m;
    pushLog(s, seat, `🎉 红色房组（${size} 间）全部住满：+${m} 克朗`, 'bonus');
  } else {
    const n = OTHER_BONUS[size] || 0;
    advanceEmperor(s, p, seat, n);
    pushLog(s, seat, `🎉 黄色房组（${size} 间）全部住满：皇帝轨 +${n}`, 'bonus');
  }
}

function doOccupy(s, p, seat, idx) {
  const room = p.rooms[idx];
  if (!room.prepared || room.occupied) throw new Error('该房间不能入住');
  room.occupied = true;
  if (hasHired(p, 23)) p.money += 1;
  pushLog(s, seat, `🛏 ${Math.floor(idx / 5) + 1} 层${COLOR_ZH[ROOM_COLORS[idx]]}房标记为已入住`, 'room');
  groupBonus(s, p, seat, idx);
}

// ===== 奖励应用 =====
// 玩家向：遇到需要选择的奖励就排进任务队列
function applyRewards(s, p, seat, rewards) {
  for (const r of rewards || []) {
    switch (r.type) {
      case 'food': gainFood(s, p, seat, vec(r.food, r.n)); break;
      case 'anyFood': addTask(s, { type: 'foodPick', seat, count: r.n }); break;
      case 'money': p.money += r.n; pushLog(s, seat, `💰 +${r.n} 克朗`, 'money'); break;
      case 'favor': advanceEmperor(s, p, seat, r.n); break;
      case 'points': p.score += r.n; pushLog(s, seat, `⭐ +${r.n} 分`, 'score'); break;
      case 'draw': drawStaff(s, p, seat, r.n); break;
      case 'prepare':
        addTask(s, { type: 'prepare', seat, count: r.n || 1, discount: r.discount || 0, maxFloor: r.maxFloor ?? 3 });
        break;
      case 'hire':
        addTask(s, { type: 'hire', seat, discount: r.discount || 0 });
        break;
      case 'offer': {
        const cards = [];
        for (let i = 0; i < 3 && s.staffDeck.length; i++) cards.push(s.staffDeck.shift());
        if (cards.length) addTask(s, { type: 'offer', seat, discount: r.discount ?? 0, cards });
        break;
      }
      case 'guest':
        addTask(s, { type: 'guestPick', seat, count: r.n || 1, free: true });
        break;
      case 'occupy':
        addTask(s, { type: 'occupy', seat, count: r.n || 1 });
        break;
      case 'bonusDie':
        addTask(s, { type: 'bonusDie', seat });
        break;
      case 'complete':
        addTask(s, { type: 'complete', seat });
        break;
      case 'prepareOccupy':
        addTask(s, { type: 'prepareOccupy', seat, maxFloor: r.maxFloor ?? 3 });
        break;
      case 'staffPoints':
        p.score += r.n * p.hired.length;
        pushLog(s, seat, `⭐ 每名员工 ${r.n} 分：+${r.n * p.hired.length} 分`, 'score');
        break;
      default: break;
    }
  }
}

// 皇帝结算用：自动完成选择
function applyRewardsAuto(s, p, seat, rewards) {
  for (const r of rewards || []) {
    switch (r.type) {
      case 'food': gainFood(s, p, seat, vec(r.food, r.n)); break;
      case 'anyFood': {
        const need = [0, 0, 0, 0];
        for (const g of p.cafe) {
          const def = GUEST_BY_ID[g.gid];
          for (let f = 0; f < 4; f++) need[f] += Math.max(0, def.order[f] - (g.items[f] || 0));
        }
        let left = r.n;
        const add = [0, 0, 0, 0];
        for (let f = 0; f < 4 && left > 0; f++) {
          const take = Math.min(left, need[f] || 0);
          add[f] = take; left -= take;
        }
        if (left > 0) add[0] += left;
        gainFood(s, p, seat, add);
        break;
      }
      case 'money': p.money += r.n; pushLog(s, seat, `💰 +${r.n} 克朗`, 'money'); break;
      case 'favor': advanceEmperor(s, p, seat, r.n); break;
      case 'points': p.score += r.n; pushLog(s, seat, `⭐ +${r.n} 分`, 'score'); break;
      case 'staffPoints': {
        const v = r.n * p.hired.length;
        p.score += v;
        pushLog(s, seat, `⭐ 每名员工 ${r.n} 分：${v >= 0 ? '+' : ''}${v} 分`, 'score');
        break;
      }
      case 'draw': drawStaff(s, p, seat, r.n); break;
      case 'prepare': {
        const opts = p.rooms.map((_x, i) => i).filter(i => canPrepareIndex(p, i, r.maxFloor ?? 3))
          .sort((a, b) => (IMMEDIATE_VP[b] || 0) - (IMMEDIATE_VP[a] || 0) || prepareCostFor(p, a, r.discount) - prepareCostFor(p, b, r.discount));
        if (opts.length) { try { doPrepare(s, p, seat, opts[0], r.discount || 0, r.maxFloor ?? 3); } catch { } }
        break;
      }
      case 'hire':
      case 'offer': {
        const pool = r.type === 'offer'
          ? Array.from({ length: 3 }, () => s.staffDeck.shift()).filter(x => x != null)
          : p.hand.slice();
        const disc = r.discount ?? 0;
        const affordable = pool.filter(id => (staffDef(id).cost - disc) <= p.money);
        const best = affordable.sort((a, b) => staffDef(b).cost - staffDef(a).cost)[0];
        if (best != null) {
          const cost = Math.max(0, staffDef(best).cost - disc);
          p.money -= cost;
          if (r.type === 'offer') pool.filter(x => x !== best).forEach(x => s.staffDeck.push(x));
          playStaff(s, p, seat, best, cost, true);
        } else if (r.type === 'offer') {
          pool.forEach(x => s.staffDeck.push(x));
        }
        break;
      }
      case 'guest': {
        let left = r.n || 1;
        while (left-- > 0 && p.cafe.length < 3 && s.guestQueue.length) {
          takeGuestFromQueue(s, p, seat, 0, true);
        }
        break;
      }
      case 'occupy': {
        let left = r.n || 1;
        while (left-- > 0) {
          const idx = p.rooms.map((_x, i) => i).find(i => p.rooms[i].prepared && !p.rooms[i].occupied);
          if (idx == null) break;
          doOccupy(s, p, seat, idx);
        }
        break;
      }
      case 'complete': {
        const g = p.cafe.find(x => !guestComplete(x));
        if (g) {
          const def = GUEST_BY_ID[g.gid];
          for (let f = 0; f < 4; f++) g.items[f] = def.order[f];
          pushLog(s, seat, `🍽 用公共供应完成 1 位客人的订单`, 'guest');
        }
        break;
      }
      case 'prepareOccupy': {
        const opts = p.rooms.map((_x, i) => i).filter(i => canPrepareIndex(p, i, r.maxFloor ?? 3));
        if (opts.length) {
          const idx = opts[0];
          p.rooms[idx].prepared = true;
          p.rooms[idx].occupied = true;
          pushLog(s, seat, `🏨 免费放置并入住 ${Math.floor(idx / 5) + 1} 层${COLOR_ZH[ROOM_COLORS[idx]]}房`, 'room');
          if (hasHired(p, 23)) p.money += 1;
          groupBonus(s, p, seat, idx);
        }
        break;
      }
      default: break;
    }
  }
}

// ===== 员工上场 =====
function playStaff(s, p, seat, id, costPaid, silent) {
  const i = p.hand.indexOf(id);
  if (i >= 0) p.hand.splice(i, 1);
  p.hired.push(id);
  const def = staffDef(id);
  if (!silent) {
    pushLog(s, seat, `👔 雇佣「${def.name}」（${costPaid > 0 ? `-${costPaid} 克朗` : '免费'}）`, 'staff');
  }
  if (def.kind === 'once') {
    applyRewards(s, p, seat, STAFF_ONCE[id] || []);
  }
}

// ===== 接客 =====
function takeGuestFromQueue(s, p, seat, slot, free) {
  if (p.cafe.length >= 3) throw new Error('咖啡吧已满');
  if (slot < 0 || slot >= s.guestQueue.length) throw new Error('队列位置无效');
  const cost = free || hasHired(p, 25) ? 0 : MARKET_COST[slot];
  if (cost > p.money) throw new Error('克朗不足');
  p.money -= cost;
  const gid = s.guestQueue.splice(slot, 1)[0];
  p.cafe.push({ gid, items: [0, 0, 0, 0] });
  if (s.guestDeck.length) s.guestQueue.unshift(s.guestDeck.shift());
  const def = GUEST_BY_ID[gid];
  pushLog(s, seat, `🚪 接待${COLOR_ZH[def.color]}色客人（${def.vp}分）` +
    (cost ? `，-${cost} 克朗` : '，免费') + `，订单 ${foodText(def.order)}`, 'guest');
  return gid;
}

// ===== 入住 =====
function checkIn(s, p, seat, guestIdx, roomIdx) {
  const g = p.cafe[guestIdx];
  if (!g) throw new Error('没有这位客人');
  const def = GUEST_BY_ID[g.gid];
  if (!guestComplete(g)) throw new Error('订单还没满足');
  const room = p.rooms[roomIdx];
  if (!room || !room.prepared || room.occupied) throw new Error('房间不可用');
  const rcolor = ROOM_COLORS[roomIdx];
  if (def.color !== 'green' && def.color !== rcolor) throw new Error('房型颜色不匹配');

  p.cafe.splice(guestIdx, 1);
  p.hotel.push(g.gid);
  room.occupied = true;
  p.score += def.vp;
  pushLog(s, seat, `✅ ${COLOR_ZH[def.color]}色客人入住 ${Math.floor(roomIdx / 5) + 1} 层${COLOR_ZH[rcolor]}房：+${def.vp} 分`, 'checkin');

  // 入住触发的员工效果
  if (def.color === 'red' && hasHired(p, 5)) { p.money += 2; pushLog(s, seat, '👔 门童：+2 克朗', 'staff'); }
  if (def.color === 'blue' && hasHired(p, 6)) { advanceEmperor(s, p, seat, 1); pushLog(s, seat, '👔 马夫：皇帝轨 +1', 'staff'); }
  if (def.color === 'yellow' && hasHired(p, 7)) { p.money += 1; pushLog(s, seat, '👔 按摩师：+1 克朗', 'staff'); }
  if (def.color === 'green' && hasHired(p, 8)) { p.score += 2; pushLog(s, seat, '👔 导游：+2 分', 'staff'); }
  if (orderTotal(g.gid) >= 4 && hasHired(p, 33)) { p.score += 4; pushLog(s, seat, '👔 男楼层管家：+4 分', 'staff'); }
  if (hasHired(p, 23)) { p.money += 1; pushLog(s, seat, '👔 管理员：+1 克朗', 'staff'); }

  groupBonus(s, p, seat, roomIdx);
  applyRewards(s, p, seat, def.rewards);
}

// ===== 皇帝结算 =====
function applyPenalty(s, p, seat, opt) {
  switch (opt.type) {
    case 'moneyOrVp':
      if (p.money >= opt.money) { p.money -= opt.money; pushLog(s, seat, `⚖️ 皇帝惩罚：-${opt.money} 克朗`, 'penalty'); }
      else { p.score -= opt.vp; pushLog(s, seat, `⚖️ 皇帝惩罚：-${opt.vp} 分`, 'penalty'); }
      break;
    case 'clearKitchen': {
      const lost = sumVec(p.kitchen);
      p.kitchen = [0, 0, 0, 0];
      pushLog(s, seat, `⚖️ 皇帝惩罚：厨房清空（${lost} 份）`, 'penalty');
      break;
    }
    case 'clearAllFood': {
      p.kitchen = [0, 0, 0, 0];
      p.cafe.forEach(g => { g.items = [0, 0, 0, 0]; });
      pushLog(s, seat, '⚖️ 皇帝惩罚：厨房与客人订单上的餐饮清空', 'penalty');
      break;
    }
    case 'discardHand': {
      if (p.hand.length >= opt.n) {
        const sorted = p.hand.slice().sort((a, b) => staffDef(a).cost - staffDef(b).cost);
        for (let i = 0; i < opt.n; i++) {
          const id = sorted[i];
          p.hand.splice(p.hand.indexOf(id), 1);
          s.staffDeck.push(id);
        }
        pushLog(s, seat, `⚖️ 皇帝惩罚：弃 ${opt.n} 张员工手牌`, 'penalty');
      } else {
        p.score -= opt.orVp;
        pushLog(s, seat, `⚖️ 皇帝惩罚：-${opt.orVp} 分`, 'penalty');
      }
      break;
    }
    case 'removeVacant': {
      let left = opt.n, removed = 0;
      for (let row = 3; row >= 0 && left > 0; row--) {
        for (let c = 0; c < 5 && left > 0; c++) {
          const idx = row * 5 + c;
          if (p.rooms[idx].prepared && !p.rooms[idx].occupied) {
            p.rooms[idx].prepared = false;
            left--; removed++;
          }
        }
      }
      if (removed > 0) pushLog(s, seat, `⚖️ 皇帝惩罚：移除 ${removed} 间空房`, 'penalty');
      if (left > 0) { p.score -= opt.orVp; pushLog(s, seat, `⚖️ 皇帝惩罚：-${opt.orVp} 分`, 'penalty'); }
      break;
    }
    case 'removeOccupied': {
      let left = opt.n, removed = 0;
      for (let row = 3; row >= 0 && left > 0; row--) {
        for (let c = 0; c < 5 && left > 0; c++) {
          const idx = row * 5 + c;
          if (p.rooms[idx].occupied) {
            p.rooms[idx].occupied = false;
            p.rooms[idx].prepared = false;
            left--; removed++;
          }
        }
      }
      if (removed) pushLog(s, seat, `⚖️ 皇帝惩罚：移除 ${removed} 间已入住房间`, 'penalty');
      break;
    }
    case 'points':
      p.score += opt.n;
      pushLog(s, seat, `⚖️ 皇帝惩罚：${opt.n} 分`, 'penalty');
      break;
    case 'vpPerStaff': {
      const v = opt.n * p.hired.length;
      p.score += v;
      pushLog(s, seat, `⚖️ 皇帝惩罚：每名员工 ${opt.n} 分，共 ${v} 分`, 'penalty');
      break;
    }
    case 'discardEndStaff': {
      const idx = p.hired.findIndex(id => staffDef(id).kind === 'end');
      if (idx >= 0) {
        const id = p.hired.splice(idx, 1)[0];
        s.staffDeck.push(id);
        pushLog(s, seat, `⚖️ 皇帝惩罚：移除终局员工「${staffDef(id).name}」`, 'penalty');
      } else {
        p.score -= opt.orVp;
        pushLog(s, seat, `⚖️ 皇帝惩罚：-${opt.orVp} 分`, 'penalty');
      }
      break;
    }
    default: break;
  }
}

function emperorScoring(s) {
  const idx = s.round === 3 ? 0 : s.round === 5 ? 1 : 2;
  const back = s.round === 3 ? 3 : s.round === 5 ? 5 : 7;
  const tile = s.emperors[idx];
  s.players.forEach((p, seat) => {
    const vp = EMPEROR_POINTS[p.emperor] || 0;
    p.score += vp;
    pushLog(s, seat, `👑 皇帝结算：位置 ${p.emperor} → +${vp} 分，后退 ${back} 格`, 'emperor');
    p.emperor = Math.max(0, p.emperor - back);

    if (p.emperor >= 3) {
      applyRewardsAuto(s, p, seat, tile.bonus);
      if (hasHired(p, 42)) { p.score += 5; pushLog(s, seat, '👔 园丁：皇帝奖励额外 +5 分', 'staff'); }
      pushLog(s, seat, `👑 皇帝奖励（${tile.id}）：${tile.reward}`, 'emperor');
    } else if (p.emperor === 0) {
      if (hasHired(p, 26) && p.money >= 1) {
        p.money -= 1;
        pushLog(s, seat, '👔 会议经理：支付 1 克朗免除皇帝惩罚', 'staff');
      } else {
        applyPenalty(s, p, seat, pick(tile.penaltyOpts));
        pushLog(s, seat, `👑 皇帝惩罚（${tile.id}）：${tile.penalty}`, 'emperor');
      }
    } else {
      pushLog(s, seat, `👑 位置 ${p.emperor}：不奖不罚`, 'emperor');
    }
  });
}

// ===== 终局结算 =====
function endStaffValue(s, p, id) {
  switch (id) {
    case 27: return occupiedCount(p, 'red') * 3;
    case 28: return occupiedCount(p, 'blue') * 3;
    case 30: return occupiedCount(p, 'yellow') * 3;
    case 31: return occupiedTotal(p) * 1;
    case 32: return p.hired.length * 2;
    case 34: return preparedCount(p) * 1;
    case 37: return fullGroups(p) * 2;
    case 40: return p.claims.length * 5;
    case 41: return p.emperor * 2;
    case 46: return fullRows(p) * 5;
    case 47: return fullCols(p) * 5;
    case 48: return Math.min(occupiedCount(p, 'red'), occupiedCount(p, 'blue'), occupiedCount(p, 'yellow')) * 4;
    default: return 0;
  }
}

function finalScoring(s) {
  const detail = [];
  s.players.forEach((p, seat) => {
    let total = 0;
    const parts = [];

    for (const id of p.hired) {
      if (id === 29) continue;
      const v = endStaffValue(s, p, id);
      if (v) { total += v; parts.push(`${staffDef(id).name} +${v}`); }
    }
    // 秘书：复制一名对手的终局员工（按自己的酒店计算）
    if (hasHired(p, 29)) {
      let best = 0, bestName = '';
      s.players.forEach((o, oi) => {
        if (oi === seat) return;
        for (const id of o.hired) {
          if (id === 29) continue;
          const v = endStaffValue(s, p, id);
          if (v > best) { best = v; bestName = staffDef(id).name; }
        }
      });
      if (best > 0) { total += best; parts.push(`秘书复制${bestName} +${best}`); }
    }

    let roomVp = 0;
    p.rooms.forEach((r, i) => { if (r.occupied) roomVp += Math.floor(i / 5) + 1; });
    total += roomVp;
    parts.push(`住人房间 +${roomVp}`);

    const moneyVp = p.money;
    const foodVp = sumVec(p.kitchen);
    total += moneyVp + foodVp;
    parts.push(`克朗 ${moneyVp} + 厨房 ${foodVp}`);

    const cafePenalty = p.cafe.length * 5;
    total -= cafePenalty;
    if (cafePenalty) parts.push(`咖啡吧滞留 -${cafePenalty}`);

    p.score += total;
    detail.push({ seat, name: p.name, gained: total, parts });
    pushLog(s, seat, `🏁 终局结算：${parts.join('，')} = +${total} 分`, 'final');
  });

  // 排名：分数 > 剩余钱+餐食
  const tie = p => p.money + sumVec(p.kitchen);
  const ranked = s.players.slice().sort((a, b) => b.score - a.score || tie(b) - tie(a));
  const top = ranked[0];
  s.winners = s.players.filter(p => p.score === top.score && tie(p) === tie(top)).map(p => p.seat);
  s.finalScores = detail;
  s.phase = 'ended';
  pushLog(s, null, `🏆 游戏结束：${s.players.filter(p => s.winners.includes(p.seat)).map(p => p.name).join('、')} 获胜`, 'final');
}

// ===== 回合推进 =====
function resetTurnFlags(p) {
  p.dieTaken = false;
  p.guestTaken = false;
  p.boosted = false;
}

function rollAllDice(s) {
  const total = s.diceTotal;
  s.dice = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < total; i++) s.dice[1 + Math.floor(Math.random() * 6)]++;
}

function rerollDice(s) {
  const total = diceTotal(s);
  if (total <= 1) { s.dice = [0, 0, 0, 0, 0, 0, 0]; return 0; }
  const remain = total - 1;
  s.dice = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < remain; i++) s.dice[1 + Math.floor(Math.random() * 6)]++;
  return remain;
}

function endRound(s) {
  s.players.forEach(p => { p.staffUsed = []; });
  if (s.round === 3 || s.round === 5 || s.round === 7) emperorScoring(s);
  if (s.round >= 7) { finalScoring(s); return; }

  s.round += 1;
  s.startPlayer = (s.startPlayer + 1) % s.players.length;
  s.players.forEach(p => {
    p.numbersLeft = 2;
    p.passed = false;
    resetTurnFlags(p);
  });
  rollAllDice(s);
  s.currentPlayer = s.startPlayer;
  pushLog(s, null, `—— 第 ${s.round} 轮开始（起始玩家 ${s.players[s.startPlayer].name}，${s.diceTotal} 颗骰子已掷）——`, 'round');
}

// 官方蛇形回合顺序：回合牌正面数字 1..n（起始玩家顺时针），背面 n+1..2n（逆时针）。
// 玩家相对起始玩家偏移 k：正面可见数字=k+1，已取过一次骰后背面可见数字=2n-k。
// 因正面最大 n < 背面最小 n+1，第一圈必先于第二圈 → 实际序列 1→2→3→3→2→1。
function turnPriority(s, seat) {
  const n = s.players.length;
  const k = (seat - s.startPlayer + n) % n;
  const taken = 2 - s.players[seat].numbersLeft;
  return taken === 0 ? k + 1 : 2 * n - k;
}

function advanceTurn(s) {
  if (s.phase === 'ended') return;
  if (diceTotal(s) <= 0) { endRound(s); return; }

  // 下一位 = 未跳过且还有行动次数中「可见数字最小」者（跳过者顺延，等收骰重掷后再上桌）
  let next = -1, best = Infinity;
  for (let seat = 0; seat < s.players.length; seat++) {
    const p = s.players[seat];
    if (p.numbersLeft > 0 && !p.passed) {
      const pr = turnPriority(s, seat);
      if (pr < best) { best = pr; next = seat; }
    }
  }
  if (next >= 0) {
    s.currentPlayer = next;
    resetTurnFlags(s.players[next]);
    return;
  }

  // 其他人都已行动两次或已跳过 → 「可见数字最小」者收走剩余骰子、弃 1、重掷后继续（官方 Passing 规则）
  if (s.players.every(p => p.numbersLeft <= 0)) { endRound(s); return; }
  let roller = -1; best = Infinity;
  for (let seat = 0; seat < s.players.length; seat++) {
    const p = s.players[seat];
    if (p.numbersLeft > 0) {
      const pr = turnPriority(s, seat);
      if (pr < best) { best = pr; roller = seat; }
    }
  }
  if (roller < 0) { endRound(s); return; }

  const remain = rerollDice(s);
  s.players.forEach(p => { p.passed = false; });
  s.currentPlayer = roller;
  resetTurnFlags(s.players[roller]);
  pushLog(s, roller, `🎲 收走剩余骰子，弃 1 颗，重掷 ${remain} 颗`, 'dice');
  if (diceTotal(s) <= 0) endRound(s);
}

// ===== 校验 =====
export function validateAction(s, seat, action) {
  if (!s || s.phase === 'ended') return '游戏已结束';
  if (seat == null || !s.players[seat]) return '座位无效';
  if (!action || !action.type) return '动作无效';

  if (s.pending) {
    if (action.type !== 'RESOLVE') return '请先处理当前的选择';
    if (s.pending.seat !== seat) return '等待其他玩家处理选择';
    return null;
  }
  if (s.phase === 'setup') {
    if (action.type !== 'RESOLVE') return '开局准备阶段（接客/备房）';
  }
  if (seat !== s.currentPlayer) return '还没轮到你';
  const p = s.players[seat];

  switch (action.type) {
    case 'TAKE_GUEST': {
      if (s.phase !== 'playing') return '对局尚未开始';
      if (p.guestTaken) return '本回合已经接过客人';
      if (p.cafe.length >= 3) return '咖啡吧已满（3 位）';
      if (action.slot == null || action.slot < 0 || action.slot >= s.guestQueue.length) return '队列位置无效';
      const cost = hasHired(p, 25) ? 0 : MARKET_COST[action.slot];
      if (cost > p.money) return '克朗不足';
      return null;
    }
    case 'TAKE_DIE': return validateTakeDie(s, p, action);
    case 'CHECK_IN': {
      const g = p.cafe[action.guestIdx];
      if (!g) return '没有这位客人';
      if (!guestComplete(g)) return '该客人订单未满足';
      const room = p.rooms[action.roomIndex];
      if (!room || !room.prepared || room.occupied) return '该房间不可用';
      const def = GUEST_BY_ID[g.gid];
      if (def.color !== 'green' && ROOM_COLORS[action.roomIndex] !== def.color) return '房型颜色不匹配';
      return null;
    }
    case 'MOVE_FOOD': {
      const moves = action.moves || [];
      if (!moves.length) return '请选择要送的餐饮';
      let total = 0;
      for (const m of moves) {
        const g = p.cafe[m.g];
        if (!g) return '没有这位客人';
        const def = GUEST_BY_ID[g.gid];
        for (let f = 0; f < 4; f++) {
          const n = (m.items || [])[f] || 0;
          if (n <= 0) continue;
          total += n;
          if (n > (def.order[f] - (g.items[f] || 0))) return '该客人不需要这么多同类餐饮';
          if (n > p.kitchen[f]) return '厨房餐饮不足';
        }
      }
      if (total > 3) return '一次最多送 3 份';
      if (!hasHired(p, 24) && p.money < 1) return '克朗不足';
      return null;
    }
    case 'CLAIM_POLITICS': {
      const obj = s.objectives[action.index];
      if (!obj) return '目标卡无效';
      if (p.claims.includes(action.index)) return '这张卡你已经放过标记';
      if (!objectiveMet(p, obj)) return '尚未满足该目标卡条件';
      if (!obj.spots.some(sp => sp.seat == null)) return '该卡分位已被抢完';
      return null;
    }
    case 'USE_STAFF': {
      if (!p.hired.includes(action.staffId)) return '还没有雇佣这名员工';
      if (staffDef(action.staffId).kind !== 'round') return '该员工不是每轮一次效果';
      if (p.staffUsed.includes(action.staffId)) return '该员工本回合已经用过';
      return null;
    }
    case 'PASS':
      if (p.dieTaken) return '已经取过骰子，不能跳过';
      return null;
    case 'END_TURN':
      if (!p.dieTaken && diceTotal(s) > 0) return '必须先取一颗骰子执行行动';
      return null;
    case 'RESOLVE': return null;
    default: return '未知动作';
  }
}

function validateTakeDie(s, p, action) {
  if (s.phase !== 'playing') return '对局尚未开始';
  if (p.dieTaken) return '本回合已经取过骰子';
  const a = action.action;
  if (!(a >= 1 && a <= 6)) return '行动区无效';
  if ((s.dice[a] || 0) <= 0) return '该行动区没有骰子';
  if (action.boost && p.boosted) return '本回合已经加过强度';
  let need = 0;
  if (action.boost) need += 1;
  if (a === 6 && !hasHired(p, 17)) need += 1;
  if (p.money < need) return '克朗不足';

  const st = actionStrength(s, p, a, !!action.boost);
  const target = a === 6 ? action.target : a;

  if (a === 6) {
    if (!(target >= 1 && target <= 5)) return '模仿行动必须是 1-5';
  }
  switch (target) {
    case 1: {
      const sd = action.strudel | 0, ck = action.cake | 0;
      if (sd + ck !== st) return `需要分配 ${st} 份餐饮`;
      if (ck > sd) return '蛋糕不能多于苹果卷';
      const aerr = validateFoodAssign(p, action.assign, [sd, ck, 0, 0]);
      if (aerr) return aerr;
      return null;
    }
    case 2: {
      const wi = action.wine | 0, cf = action.coffee | 0;
      if (wi + cf !== st) return `需要分配 ${st} 份饮品`;
      if (cf > wi) return '咖啡不能多于红酒';
      const aerr = validateFoodAssign(p, action.assign, [0, 0, wi, cf]);
      if (aerr) return aerr;
      return null;
    }
    case 3: {
      const rooms = action.rooms || [];
      if (rooms.length > st) return `最多准备 ${st} 间房`;
      let money = p.money - need;
      const seen = new Set();
      for (const idx of rooms) {
        if (seen.has(idx)) return '房间重复';
        seen.add(idx);
        if (!canPrepareIndex(p, idx, 3)) return '该房间不能准备';
        const cost = prepareCostFor(p, idx, 0);
        if (cost > money) return '克朗不足';
        money -= cost;
      }
      return null;
    }
    case 4: {
      if (hasHired(p, 15)) return null;
      const em = action.emperor | 0, mo = action.money | 0;
      if (em + mo !== st) return `需要分配 ${st} 点`;
      return null;
    }
    case 5: {
      if (!action.staffId) return '请选择要雇佣的员工';
      if (!p.hand.includes(action.staffId)) return '该员工不在手牌';
      const cost = Math.max(0, staffDef(action.staffId).cost - st - (a === 5 && hasHired(p, 18) ? 2 : 0));
      if (cost > p.money - need) return '克朗不足';
      return null;
    }
    default: return '行动区无效';
  }
}

// ===== 执行 =====
export function applyAction(state, seat, action) {
  const err = validateAction(state, seat, action);
  if (err) throw new Error(err);

  const s = clone(state);
  if (!Array.isArray(s.log)) s.log = [];
  if (!Array.isArray(s.pendingTasks)) s.pendingTasks = [];

  if (s.pending) {
    resolvePending(s, seat, action.choice || {});
    flushPending(s);
    return s;
  }

  const p = s.players[seat];

  switch (action.type) {
    case 'TAKE_GUEST': {
      takeGuestFromQueue(s, p, seat, action.slot, false);
      p.guestTaken = true;
      break;
    }
    case 'TAKE_DIE': {
      execTakeDie(s, p, seat, action);
      break;
    }
    case 'CHECK_IN': {
      checkIn(s, p, seat, action.guestIdx, action.roomIndex);
      break;
    }
    case 'MOVE_FOOD': {
      const free = hasHired(p, 24);
      if (!free) p.money -= 1;
      for (const m of action.moves) {
        const g = p.cafe[m.g];
        for (let f = 0; f < 4; f++) {
          const n = (m.items || [])[f] || 0;
          if (n > 0) { g.items[f] += n; p.kitchen[f] -= n; }
        }
      }
      pushLog(s, seat, `🍽 从厨房送餐${free ? '（领班免费）' : '（-1 克朗）'}`, 'food');
      break;
    }
    case 'CLAIM_POLITICS': {
      const obj = s.objectives[action.index];
      const spot = obj.spots.find(sp => sp.seat == null);
      spot.seat = seat;
      p.claims.push(action.index);
      p.score += spot.vp;
      pushLog(s, seat, `📜 达成目标「${obj.text}」：+${spot.vp} 分`, 'politics');
      break;
    }
    case 'USE_STAFF': {
      const def = staffDef(action.staffId);
      p.staffUsed.push(action.staffId);
      pushLog(s, seat, `👔 发动「${def.name}」每轮一次效果`, 'staff');
      if (action.staffId === 1) gainFood(s, p, seat, [1, 0, 0, 0]);
      if (action.staffId === 2) gainFood(s, p, seat, [0, 1, 0, 0]);
      if (action.staffId === 3) gainFood(s, p, seat, [0, 0, 1, 0]);
      if (action.staffId === 4) gainFood(s, p, seat, [0, 0, 0, 1]);
      break;
    }
    case 'PASS': {
      p.passed = true;
      pushLog(s, seat, '⏭ 跳过（等待重掷）', 'pass');
      advanceTurn(s);
      break;
    }
    case 'END_TURN': {
      advanceTurn(s);
      break;
    }
    default: break;
  }

  flushPending(s);
  return s;
}

function execTakeDie(s, p, seat, action) {
  const a = action.action;
  const space = a;
  const st = actionStrength(s, p, a, !!action.boost);
  const target = a === 6 ? action.target : a;

  if (action.boost) { p.money -= 1; p.boosted = true; }
  if (a === 6 && !hasHired(p, 17)) p.money -= 1;
  s.dice[space] -= 1;
  p.dieTaken = true;
  p.numbersLeft -= 1;

  const boostTxt = action.boost ? '（+1 强度 -1 克朗）' : '';
  pushLog(s, seat, `🎲 取走点数 ${a} 的骰子，强度 ${st}${boostTxt}` + (a === 6 ? ` → 模仿行动 ${target}` : ''), 'dice');

  switch (target) {
    case 1:
      gainFood(s, p, seat, [action.strudel | 0, action.cake | 0, 0, 0], action.assign || []);
      break;
    case 2:
      gainFood(s, p, seat, [0, 0, action.wine | 0, action.coffee | 0], action.assign || []);
      break;
    case 3: {
      const rooms = (action.rooms || []).slice();
      for (const idx of rooms) doPrepare(s, p, seat, idx, 0, 3);
      if (!rooms.length) pushLog(s, seat, '（未准备房间）', 'room');
      break;
    }
    case 4: {
      if (hasHired(p, 15)) {
        p.money += st;
        advanceEmperor(s, p, seat, st);
        pushLog(s, seat, `👔 擦鞋匠：+${st} 克朗并皇帝轨 +${st}`, 'staff');
      } else {
        if (action.money) { p.money += action.money | 0; pushLog(s, seat, `💰 +${action.money | 0} 克朗`, 'money'); }
        if (action.emperor) advanceEmperor(s, p, seat, action.emperor | 0);
      }
      break;
    }
    case 5: {
      const discount = (a === 5 && hasHired(p, 18)) ? 2 : 0;
      const cost = Math.max(0, staffDef(action.staffId).cost - st - discount);
      p.money -= cost;
      playStaff(s, p, seat, action.staffId, cost);
      break;
    }
    default: break;
  }

  // 骰子点数触发的永久员工效果
  if (space === 3 || space === 4) {
    if (hasHired(p, 12)) { p.score += 2; pushLog(s, seat, '👔 行政房务主管：+2 分', 'staff'); }
  }
  if (space === 3) {
    if (hasHired(p, 19)) { p.score += 5; pushLog(s, seat, '👔 室内设计师：+5 分', 'staff'); }
    if (hasHired(p, 22)) addTask(s, { type: 'hire', seat, discount: 0 });
  }
  if (space === 4 && hasHired(p, 16)) { p.score += 4; pushLog(s, seat, '👔 洗衣工：+4 分', 'staff'); }
  if (space === 5 && hasHired(p, 20)) { advanceEmperor(s, p, seat, 2); pushLog(s, seat, '👔 侦探：皇帝轨 +2', 'staff'); }
  if ((space === 1 || space === 2) && hasHired(p, 14)) {
    addTask(s, { type: 'prepare', seat, count: 1, discount: 0, maxFloor: 3 });
  }
}

// ===== 处理选择 =====
function resolvePending(s, seat, choice) {
  const t = s.pending;
  if (!t) return;
  const p = s.players[t.seat];
  s.pending = null;

  switch (t.type) {
    case 'prepare': {
      const rooms = (choice.rooms || []).slice(0, t.count);
      if (t.setupRooms && !rooms.length) throw new Error('开局必须放置房间（不可跳过）');
      for (const idx of rooms) doPrepare(s, p, seat, idx, t.discount || 0, t.maxFloor ?? 3);
      if (!rooms.length) pushLog(s, seat, '（放弃准备房间）', 'room');
      break;
    }
    case 'prepareOccupy': {
      if (choice.roomIndex != null) {
        const idx = choice.roomIndex;
        if (!canPrepareIndex(p, idx, t.maxFloor ?? 3)) throw new Error('该房间不能放置');
        p.rooms[idx].prepared = true;
        p.rooms[idx].occupied = true;
        pushLog(s, seat, `🏨 免费放置并入住 ${Math.floor(idx / 5) + 1} 层${COLOR_ZH[ROOM_COLORS[idx]]}房`, 'room');
        if (hasHired(p, 23)) p.money += 1;
        groupBonus(s, p, seat, idx);
      }
      break;
    }
    case 'occupy': {
      const rooms = (choice.rooms || []).slice(0, t.count);
      for (const idx of rooms) doOccupy(s, p, seat, idx);
      break;
    }
    case 'hire': {
      if (choice.staffId == null) { pushLog(s, seat, '（放弃雇佣）', 'staff'); break; }
      if (!p.hand.includes(choice.staffId)) throw new Error('该员工不在手牌');
      const cost = Math.max(0, staffDef(choice.staffId).cost - (t.discount || 0));
      if (cost > p.money) throw new Error('克朗不足');
      p.money -= cost;
      playStaff(s, p, seat, choice.staffId, cost);
      break;
    }
    case 'offer': {
      const cards = t.cards || [];
      if (choice.staffId == null || !cards.includes(choice.staffId)) {
        cards.forEach(id => s.staffDeck.push(id));
        pushLog(s, seat, '（放弃抽到的员工，放回牌堆底）', 'staff');
        break;
      }
      const cost = Math.max(0, staffDef(choice.staffId).cost - (t.discount || 0));
      if (cost > p.money) throw new Error('克朗不足');
      p.money -= cost;
      cards.filter(id => id !== choice.staffId).forEach(id => s.staffDeck.push(id));
      playStaff(s, p, seat, choice.staffId, cost);
      break;
    }
    case 'guestPick': {
      let left = t.count || 1;
      if (choice.slot != null) {
        takeGuestFromQueue(s, p, seat, choice.slot, t.free !== false);
        left -= 1;
      }
      while (left-- > 0 && p.cafe.length < 3 && s.guestQueue.length) {
        takeGuestFromQueue(s, p, seat, 0, true);
      }
      break;
    }
    case 'foodPick': {
      const foods = choice.foods || [0, 0, 0, 0];
      let total = 0;
      for (let f = 0; f < 4; f++) {
        const n = Math.max(0, foods[f] | 0);
        foods[f] = n; total += n;
      }
      if (total !== t.count) throw new Error(`需要选择 ${t.count} 份餐饮`);
      gainFood(s, p, seat, foods);
      break;
    }
    case 'bonusDie': {
      if (choice.target == null) break;
      const target = choice.target | 0;
      if (target < 1 || target > 5) throw new Error('模仿行动无效');
      const st = s.dice[target] || 0;
      if (st <= 0) throw new Error('该行动区没有骰子');
      pushLog(s, seat, `👤 吉萨先生：不取骰子执行行动 ${target}（强度 ${st}）`, 'guest');
      if (target === 1) {
        const taken1 = [choice.strudel | 0, choice.cake | 0, 0, 0];
        const err1 = validateFoodAssign(p, choice.assign, taken1);
        if (err1) throw new Error(err1);
        gainFood(s, p, seat, taken1, choice.assign || []);
      }
      if (target === 2) {
        const taken2 = [0, 0, choice.wine | 0, choice.coffee | 0];
        const err2 = validateFoodAssign(p, choice.assign, taken2);
        if (err2) throw new Error(err2);
        gainFood(s, p, seat, taken2, choice.assign || []);
      }
      if (target === 3) for (const idx of (choice.rooms || [])) doPrepare(s, p, seat, idx, 0, 3);
      if (target === 4) {
        if (hasHired(p, 15)) { p.money += st; advanceEmperor(s, p, seat, st); }
        else {
          if (choice.money) p.money += choice.money | 0;
          if (choice.emperor) advanceEmperor(s, p, seat, choice.emperor | 0);
        }
      }
      if (target === 5) {
        const id = choice.staffId;
        if (id == null || !p.hand.includes(id)) throw new Error('该员工不在手牌');
        const cost = Math.max(0, staffDef(id).cost - st);
        if (cost > p.money) throw new Error('克朗不足');
        p.money -= cost;
        playStaff(s, p, seat, id, cost);
      }
      break;
    }
    case 'complete': {
      if (choice.guestIdx == null) break;
      const g = p.cafe[choice.guestIdx];
      if (!g) throw new Error('没有这位客人');
      const def = GUEST_BY_ID[g.gid];
      for (let f = 0; f < 4; f++) g.items[f] = def.order[f];
      pushLog(s, seat, `🍽 用公共供应完成 1 位客人的订单`, 'guest');
      break;
    }
    default: break;
  }

  // 开局流程：先接客（官方第 11 步），全员接完后自选备 3 房（官方第 12 步，轮转进行）
  // 旧档兼容：65f55cf 之前的对局存档没有 setupRooms 字段（开局固定备好底层 3 间、无自选备房阶段），
  // 这类老对局接完客直接进入第 1 轮，按老规则打完，绝不因缺字段崩溃
  if (t.setup && s.phase === 'setup') {
    const legacySetup = !Array.isArray(s.setupRooms);
    if (t.type === 'guestPick') {
      if (Array.isArray(s.setupPicks) && s.setupPicks.length) {
        addTask(s, { type: 'guestPick', seat: s.setupPicks.shift(), count: 1, free: true, setup: true });
      } else if (legacySetup) {
        startPlaying(s);
      } else {
        for (let r = 0; r < 3; r++) {
          for (let i = 0; i < s.players.length; i++) s.setupRooms.push(i);
        }
        addTask(s, { type: 'prepare', seat: s.setupRooms.shift(), count: 1, setup: true, setupRooms: true });
      }
    } else if (!legacySetup && s.setupRooms.length) {
      addTask(s, { type: 'prepare', seat: s.setupRooms.shift(), count: 1, setup: true, setupRooms: true });
    } else {
      startPlaying(s);
    }
  }
}

// 进入第 1 轮对局
function startPlaying(s) {
  s.phase = 'playing';
  s.currentPlayer = s.startPlayer;
  rollAllDice(s);
  s.players.forEach(resetTurnFlags);
  pushLog(s, null, `—— 第 1 轮开始（${s.players[s.startPlayer].name} 先行动，${s.diceTotal} 颗骰子已掷）——`, 'round');
}

// ===== 供 UI / AI 使用的小工具 =====
export function listValidActions(s, seat) {
  if (!s || s.phase === 'ended') return [];
  const p = s.players[seat];
  if (!p) return [];
  if (s.pending) {
    if (s.pending.seat !== seat) return [];
    return [{ type: 'RESOLVE', choice: {} }];
  }
  if (seat !== s.currentPlayer) return [];
  const out = [];
  if (p.dieTaken) out.push({ type: 'END_TURN' });
  for (let a = 1; a <= 6; a++) {
    if ((s.dice[a] || 0) <= 0) continue;
    const st = actionStrength(s, p, a, false);
    if (a === 1) out.push({ type: 'TAKE_DIE', action: 1, strudel: st, cake: 0 });
    if (a === 2) out.push({ type: 'TAKE_DIE', action: 2, wine: st, coffee: 0 });
    if (a === 3) out.push({ type: 'TAKE_DIE', action: 3, rooms: [] });
    if (a === 4) out.push({ type: 'TAKE_DIE', action: 4, emperor: st, money: 0 });
    if (a === 5 && p.hand.length) out.push({ type: 'TAKE_DIE', action: 5, staffId: p.hand[0] });
    if (a === 6) out.push({ type: 'TAKE_DIE', action: 6, target: 4, emperor: 0, money: st });
  }
  out.push({ type: 'PASS' });
  return out;
}

export function roomGroupsOf(idx) {
  return ROOM_GROUPS.find(g => g.includes(idx)) || [];
}
