// 奥地利大饭店 · AI（启发式）
// 约束：永不返回非法动作、永不抛异常；无法决策时返回 PASS / END_TURN / 空选择

import {
  GUEST_BY_ID, STAFF_BY_ID, ROOM_COLORS, ROOM_GROUPS, IMMEDIATE_VP,
  MARKET_COST, EMPEROR_POINTS, POLITICS_SPOTS
} from './hotel-data.js';
import {
  guestComplete, canPrepareIndex, prepareCostFor, actionStrength,
  objectiveMet, validateAction, diceTotal, hasHired, orderTotal
} from './hotel-engine.js';

function staff(id) { return STAFF_BY_ID[id] || { cost: 0, kind: 'permanent', name: '?' }; }

function needsOf(p) {
  const need = [0, 0, 0, 0];
  for (const g of p.cafe) {
    const def = GUEST_BY_ID[g.gid];
    for (let f = 0; f < 4; f++) need[f] += Math.max(0, def.order[f] - (g.items[f] || 0));
  }
  return need;
}

function roomScore(s, p, idx) {
  const cost = prepareCostFor(p, idx, 0);
  let sc = 10 - cost * 2;
  sc += (IMMEDIATE_VP[idx] || 0) * 2;
  const color = ROOM_COLORS[idx];
  // 与咖啡吧里已完成/接近完成的客人颜色匹配
  for (const g of p.cafe) {
    const def = GUEST_BY_ID[g.gid];
    if (def.color === 'green' || def.color === color) {
      const done = def.order.reduce((a, n, f) => a + Math.min(n, g.items[f] || 0), 0);
      sc += done * 0.5 + (guestComplete(g) ? 6 : 0);
    }
  }
  // 半满的组优先补完
  const grp = ROOM_GROUPS.find(g => g.includes(idx)) || [];
  const inGrp = grp.filter(i => p.rooms[i].occupied || p.rooms[i].prepared).length;
  sc += inGrp * 1.5;
  return sc;
}

function legalRooms(p, limit, maxFloor = 3, discount = 0, budgetOverride = null) {
  const cands = p.rooms
    .map((_r, i) => i)
    .filter(i => canPrepareIndex(p, i, maxFloor))
    .map(i => ({ i, cost: prepareCostFor(p, i, discount), score: roomScore(null, p, i) }))
    .sort((a, b) => b.score - a.score || a.cost - b.cost);
  // 按累计预算选，避免单间都买得起但加起来超支
  const out = [];
  let budget = budgetOverride == null ? p.money : budgetOverride;
  for (const c of cands) {
    if (out.length >= limit) break;
    if (c.cost <= budget) { out.push(c.i); budget -= c.cost; }
  }
  return out;
}

// 取该行动区前要先付的固定克朗（6 区模仿费，厨房帮工可免）
function feeOf(p, space) {
  return (space === 6 && !hasHired(p, 17)) ? 1 : 0;
}

function findCheckIn(s, p) {
  const cands = [];
  p.cafe.forEach((g, gi) => {
    if (!guestComplete(g)) return;
    const def = GUEST_BY_ID[g.gid];
    const rooms = p.rooms.map((_r, i) => i).filter(i =>
      p.rooms[i].prepared && !p.rooms[i].occupied &&
      (def.color === 'green' || ROOM_COLORS[i] === def.color));
    for (const ri of rooms) {
      const grp = ROOM_GROUPS.find(gr => gr.includes(ri)) || [];
      const completes = grp.every(i => i === ri || p.rooms[i].occupied);
      cands.push({ guestIdx: gi, roomIndex: ri, score: def.vp + (completes ? 8 : 0) + orderTotal(g.gid) + (ROOM_COLORS[ri] === def.color ? 1 : 0) });
    }
  });
  cands.sort((a, b) => b.score - a.score);
  return cands[0] || null;
}

function claimable(s, p) {
  let best = null;
  s.objectives.forEach((obj, i) => {
    if (p.claims.includes(i)) return;
    if (!obj.spots.some(sp => sp.seat == null)) return;
    if (!objectiveMet(p, obj)) return;
    const spot = obj.spots.find(sp => sp.seat == null);
    if (!best || spot.vp > best.vp) best = { index: i, vp: spot.vp };
  });
  return best;
}

function bestGuestSlot(s, p) {
  let best = null;
  const needSum = needsOf(p).reduce((a, b) => a + b, 0);
  s.guestQueue.forEach((gid, slot) => {
    const def = GUEST_BY_ID[gid];
    const cost = hasHired(p, 25) ? 0 : MARKET_COST[slot];
    if (cost > p.money) return;
    if (p.cafe.length >= 3) return;
    const need = def.order.reduce((a, b) => a + b, 0);
    // 咖啡吧已挤 2 位且手上订单都没做完时，不再接长单
    if (p.cafe.length >= 2 && needSum > 2 && need > 2) return;
    // 最后一轮：接了住不进去要倒扣 5 分，只接马上能完成的
    if (s.round >= 7 && !(need <= 1 || need <= needSum)) return;
    let sc = def.vp * 2 - cost * 2 - need * 1.5;
    if (def.color === 'green') sc += 1;
    else if (p.rooms.some((r, i) => (r.prepared && !r.occupied) && ROOM_COLORS[i] === def.color)) sc += 6;
    if (!best || sc > best.sc) best = { slot, sc };
  });
  return best ? best.slot : null;
}

function buildFoodAction(s, p, space, st) {
  const need = needsOf(p);
  if (space === 1) {
    let cake = Math.min(st, need[1], Math.floor(st / 2));
    // 优先补满蛋糕缺口再给苹果卷
    if (cake < Math.min(need[1], st) && cake + 1 <= Math.floor(st / 2)) cake += 0;
    const strudel = st - cake;
    return { strudel, cake };
  }
  let coffee = Math.min(st, need[3], Math.floor(st / 2));
  const wine = st - coffee;
  return { wine, coffee };
}

function buildAction(s, p, target, st, space) {
  const base = { type: 'TAKE_DIE', action: space };
  if (space === 6) base.target = target;
  const budget = p.money - feeOf(p, space);
  if (target === 1) {
    const f = buildFoodAction(s, p, 1, st);
    return { ...base, strudel: f.strudel, cake: f.cake };
  }
  if (target === 2) {
    const f = buildFoodAction(s, p, 2, st);
    return { ...base, wine: f.wine, coffee: f.coffee };
  }
  if (target === 3) {
    return { ...base, rooms: legalRooms(p, st, 3, 0, budget) };
  }
  if (target === 4) {
    if (hasHired(p, 15)) return { ...base, emperor: st, money: st };
    if (p.emperor < 4) return { ...base, emperor: st, money: 0 };
    if (p.money < 6) return { ...base, emperor: 0, money: st };
    return { ...base, emperor: Math.ceil(st / 2), money: Math.floor(st / 2) };
  }
  if (target === 5) {
    const discount = (space === 5 && hasHired(p, 18)) ? 2 : 0;
    const opts = p.hand
      .map(id => ({ id, cost: Math.max(0, staff(id).cost - st - discount) }))
      .filter(x => x.cost <= budget)
      .sort((a, b) => staff(b.id).cost - staff(a.id).cost);
    if (!opts.length) return null;
    // 优先能立刻起作用的员工
    const useful = opts.find(x => staff(x.id).kind === 'once') || opts[0];
    return { ...base, staffId: useful.id };
  }
  return null;
}

function scoreTarget(s, p, target, st) {
  const need = needsOf(p);
  switch (target) {
    case 1: return Math.min(st, need[0] + need[1]) * 2 + st * 0.5;
    case 2: return Math.min(st, need[2] + need[3]) * 2 + st * 0.5;
    case 3: {
      const rooms = legalRooms(p, st);
      const demand = p.cafe.filter(g => guestComplete(g) || GUEST_BY_ID[g.gid].vp >= 4).length;
      return rooms.length * 1.5 + demand * 1.5 + (p.rooms.filter(r => r.prepared && !r.occupied).length < 2 ? 5 : 0);
    }
    case 4: return (p.money < 6 ? 4 : 1) + (p.emperor < 5 ? 3 : 0);
    case 5: {
      const discount = 0;
      const opts = p.hand.filter(id => Math.max(0, staff(id).cost - st - discount) <= p.money);
      return opts.length ? 3 + Math.min(4, st) : -1;
    }
    default: return -1;
  }
}

function pickDieAction(s, p) {
  let best = null;
  for (let a = 1; a <= 6; a++) {
    if ((s.dice[a] || 0) <= 0) continue;
    if (p.money < feeOf(p, a)) continue;
    const st = actionStrength(s, p, a, false);
    if (a === 6) {
      for (let t = 1; t <= 5; t++) {
        const act = buildAction(s, p, t, st, 6);
        if (!act) continue;
        const sc = scoreTarget(s, p, t, st) + 2;
        if (!best || sc > best.sc) best = { act, sc };
      }
    } else {
      const act = buildAction(s, p, a, st, a);
      if (!act) continue;
      const sc = scoreTarget(s, p, a, st) + (s.dice[a] || 0) * 0.4;
      if (!best || sc > best.sc) best = { act, sc };
    }
  }
  if (!best) return null;
  // 有余钱时加 1 点强度
  if (!p.boosted && p.money >= 3) {
    const boosted = { ...best.act, boost: true };
    // 加强度后参数可能不匹配（1/2/3/4 需要重新分配），只对 3/4/5 直接加
    if (best.act.action === 4) {
      const st = actionStrength(s, p, 4, true);
      boosted.emperor = Math.min(st, (best.act.emperor || 0) + 1);
      boosted.money = st - boosted.emperor;
    } else if (best.act.action === 3) {
      boosted.rooms = legalRooms(p, actionStrength(s, p, 3, true), 3, 0, p.money - 1);
    } else if (best.act.action === 6 && best.act.target === 3) {
      boosted.rooms = legalRooms(p, actionStrength(s, p, 6, true), 3, 0, p.money - feeOf(p, 6) - 1);
    } else if (best.act.action === 1) {
      const f = buildFoodAction(s, p, 1, actionStrength(s, p, 1, true));
      boosted.strudel = f.strudel; boosted.cake = f.cake;
    } else if (best.act.action === 2) {
      const f = buildFoodAction(s, p, 2, actionStrength(s, p, 2, true));
      boosted.wine = f.wine; boosted.coffee = f.coffee;
    }
    if (!validateAction(s, p.seat, boosted)) return boosted;
  }
  return best.act;
}

function resolveChoice(s, seat) {
  const t = s.pending;
  const p = s.players[seat];
  if (!t) return { type: 'RESOLVE', choice: {} };

  switch (t.type) {
    case 'prepare':
      return { type: 'RESOLVE', choice: { rooms: legalRooms(p, t.count, t.maxFloor ?? 3, t.discount || 0) } };
    case 'prepareOccupy': {
      const opts = p.rooms.map((_r, i) => i).filter(i => canPrepareIndex(p, i, t.maxFloor ?? 3));
      if (!opts.length) return { type: 'RESOLVE', choice: {} };
      const scored = opts.map(i => {
        const grp = ROOM_GROUPS.find(g => g.includes(i)) || [];
        const finish = grp.filter(x => x !== i && p.rooms[x].occupied).length;
        return { i, sc: (IMMEDIATE_VP[i] || 0) + finish * 3 };
      }).sort((a, b) => b.sc - a.sc);
      return { type: 'RESOLVE', choice: { roomIndex: scored[0].i } };
    }
    case 'occupy': {
      const rooms = p.rooms.map((_r, i) => i)
        .filter(i => p.rooms[i].prepared && !p.rooms[i].occupied)
        .slice(0, t.count);
      return { type: 'RESOLVE', choice: { rooms } };
    }
    case 'hire': {
      const opts = p.hand
        .map(id => ({ id, cost: Math.max(0, staff(id).cost - (t.discount || 0)) }))
        .filter(x => x.cost <= p.money)
        .sort((a, b) => staff(b.id).cost - staff(a.id).cost);
      if (!opts.length) return { type: 'RESOLVE', choice: {} };
      return { type: 'RESOLVE', choice: { staffId: opts[0].id } };
    }
    case 'offer': {
      const cards = t.cards || [];
      const opts = cards
        .map(id => ({ id, cost: Math.max(0, staff(id).cost - (t.discount || 0)) }))
        .filter(x => x.cost <= p.money)
        .sort((a, b) => staff(b.id).cost - staff(a.id).cost);
      if (!opts.length) return { type: 'RESOLVE', choice: {} };
      return { type: 'RESOLVE', choice: { staffId: opts[0].id } };
    }
    case 'guestPick': {
      const slot = bestGuestSlot(s, p);
      return { type: 'RESOLVE', choice: slot == null ? {} : { slot } };
    }
    case 'foodPick': {
      const need = needsOf(p);
      const foods = [0, 0, 0, 0];
      let left = t.count;
      for (let f = 0; f < 4 && left > 0; f++) {
        const take = Math.min(left, need[f] || 0);
        foods[f] = take; left -= take;
      }
      if (left > 0) foods[0] += left;
      return { type: 'RESOLVE', choice: { foods } };
    }
    case 'bonusDie': {
      const avail = [1, 2, 3, 4, 5].filter(i => (s.dice[i] || 0) > 0);
      if (!avail.length) return { type: 'RESOLVE', choice: {} };
      const need = needsOf(p);
      const scoreFor = t => {
        if (t === 1) return need[0] + need[1];
        if (t === 2) return need[2] + need[3];
        if (t === 3) return legalRooms(p, s.dice[3]).length * 2;
        if (t === 4) return p.money < 6 ? 3 : 1;
        if (t === 5) return p.hand.some(id => Math.max(0, staff(id).cost - s.dice[5]) <= p.money) ? 2 : 0;
        return 0;
      };
      const target = avail.slice().sort((a, b) =>
        (scoreFor(b) + (s.dice[b] || 0) * 0.3) - (scoreFor(a) + (s.dice[a] || 0) * 0.3))[0];
      const st = s.dice[target];
      if (target === 1) {
        const f = buildFoodAction(s, p, 1, st);
        return { type: 'RESOLVE', choice: { target: 1, strudel: f.strudel, cake: f.cake } };
      }
      if (target === 2) {
        const f = buildFoodAction(s, p, 2, st);
        return { type: 'RESOLVE', choice: { target: 2, wine: f.wine, coffee: f.coffee } };
      }
      if (target === 3) {
        return { type: 'RESOLVE', choice: { target: 3, rooms: legalRooms(p, st) } };
      }
      if (target === 5) {
        const opts = p.hand
          .map(id => ({ id, cost: Math.max(0, staff(id).cost - st) }))
          .filter(x => x.cost <= p.money)
          .sort((a, b) => staff(b.id).cost - staff(a.id).cost);
        if (opts.length) return { type: 'RESOLVE', choice: { target: 5, staffId: opts[0].id } };
      }
      // 其余情况走 4 区：有钱先补钱，否则推皇帝
      if ((s.dice[4] || 0) > 0) {
        const s4 = s.dice[4];
        return { type: 'RESOLVE', choice: { target: 4, money: p.money < 6 ? s4 : 0, emperor: p.money < 6 ? 0 : s4 } };
      }
      // 4 区没骰子 → 退到 1 区按苹果卷/蛋糕分配
      const t1 = [1, 2].find(i => (s.dice[i] || 0) > 0);
      if (t1) {
        const n1 = s.dice[t1];
        const f = buildFoodAction(s, p, t1, n1);
        return t1 === 1
          ? { type: 'RESOLVE', choice: { target: 1, strudel: f.strudel, cake: f.cake } }
          : { type: 'RESOLVE', choice: { target: 2, wine: f.wine, coffee: f.coffee } };
      }
      return { type: 'RESOLVE', choice: {} };
    }
    case 'complete': {
      if (!p.cafe.length) return { type: 'RESOLVE', choice: {} };
      let best = 0, bestSc = -1;
      p.cafe.forEach((g, i) => {
        const def = GUEST_BY_ID[g.gid];
        const placed = def.order.reduce((a, n, f) => a + Math.min(n, g.items[f] || 0), 0);
        const sc = def.vp + placed;
        if (sc > bestSc) { bestSc = sc; best = i; }
      });
      return { type: 'RESOLVE', choice: { guestIdx: best } };
    }
    default:
      return { type: 'RESOLVE', choice: {} };
  }
}

function moveFoodAction(s, p) {
  if (!p.cafe.length) return null;
  if (!hasHired(p, 24) && p.money < 2) return null;
  for (let gi = 0; gi < p.cafe.length; gi++) {
    const g = p.cafe[gi];
    if (guestComplete(g)) continue;
    const def = GUEST_BY_ID[g.gid];
    const items = [0, 0, 0, 0];
    let left = 3;
    for (let f = 0; f < 4 && left > 0; f++) {
      const need = def.order[f] - (g.items[f] || 0);
      const take = Math.min(need, p.kitchen[f], left);
      if (take > 0) { items[f] = take; left -= take; }
    }
    if (items.some(n => n > 0) && (hasHired(p, 24) || p.money >= 1)) {
      // 只差这几份就能入住时才值得花钱
      const after = def.order.every((n, f) => (g.items[f] || 0) + items[f] >= n);
      if (after || hasHired(p, 24) || p.money >= 6) {
        return { type: 'MOVE_FOOD', moves: [{ g: gi, items }] };
      }
    }
  }
  return null;
}

export function pickAction(state, seat) {
  const s = state;
  if (!s || s.phase === 'ended') return null;
  const p = s.players[seat];
  if (!p) return null;

  if (s.pending) return s.pending.seat === seat ? resolveChoice(s, seat) : null;
  if (s.currentPlayer !== seat) return null;

  // 1) 入住（免费得分 + 奖励）
  const ci = findCheckIn(s, p);
  if (ci) return { type: 'CHECK_IN', guestIdx: ci.guestIdx, roomIndex: ci.roomIndex };

  // 2) 目标卡
  const pol = claimable(s, p);
  if (pol) return { type: 'CLAIM_POLITICS', index: pol.index };

  // 3) 每轮一次员工
  for (const id of p.hired) {
    if (staff(id).kind !== 'round' || p.staffUsed.includes(id)) continue;
    if (id === 1 && p.kitchen[0] >= 4) continue;
    if (id === 2 && p.kitchen[1] >= 4) continue;
    if (id === 3 && p.kitchen[2] >= 4) continue;
    if (id === 4 && p.kitchen[3] >= 4) continue;
    return { type: 'USE_STAFF', staffId: id };
  }

  // 4) 本回合接客
  if (!p.guestTaken && s.phase === 'playing' && p.cafe.length < 3) {
    const slot = bestGuestSlot(s, p);
    if (slot != null) return { type: 'TAKE_GUEST', slot };
  }

  // 5) 取骰子
  if (!p.dieTaken) {
    const act = pickDieAction(s, p);
    if (act) return act;
    if (diceTotal(s) <= 0) return { type: 'END_TURN' };
    return { type: 'PASS' };
  }

  // 6) 厨房补送
  const mf = moveFoodAction(s, p);
  if (mf) return mf;

  return { type: 'END_TURN' };
}
