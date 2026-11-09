// 铁路环游：美国版 · AI（启发式策略 + 最短路规划）
// 目标：能完整打完一局，行为合理（优先完成目的地票、按需补牌、必要时抽票）

import { ROUTES, TICKET_MAP, TRAIN_COLORS, ROUTE_SCORES } from './ticket-data.js?v=35';
import { listValidActions, canConnect } from './ticket-engine.js?v=35';

const COLOR_LIST = TRAIN_COLORS;

function handCount(p) {
  return COLOR_LIST.reduce((s, c) => s + (p.hand[c] || 0), 0) + (p.hand.loco || 0);
}

// 自己路线 0 费，空地按张数，对手路线不可用
function shortestPlan(state, playerIndex, a, b) {
  const adj = new Map();
  const add = (x, y, w, rid) => {
    if (!adj.has(x)) adj.set(x, []);
    adj.get(x).push({ to: y, w, rid });
  };
  ROUTES.forEach((r, rid) => {
    const owner = state.routeOwner[rid];
    if (owner !== null && owner !== playerIndex) return;
    const w = owner === playerIndex ? 0 : r.len + (r.ferries || 0) * 0.4;
    add(r.a, r.b, w, rid);
    add(r.b, r.a, w, rid);
  });

  const dist = new Map([[a, 0]]);
  const prev = new Map();
  const done = new Set();
  while (true) {
    let node = null;
    let best = Infinity;
    for (const [k, v] of dist) {
      if (!done.has(k) && v < best) { best = v; node = k; }
    }
    if (node === null) break;
    done.add(node);
    if (node === b) break;
    for (const e of adj.get(node) || []) {
      const nd = best + e.w;
      if (nd < (dist.get(e.to) ?? Infinity) - 1e-9) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: node, rid: e.rid });
      }
    }
  }

  const distVal = dist.get(b);
  if (distVal === undefined) return { dist: Infinity, edges: [] };
  const edges = [];
  let cur = b;
  let guard = 0;
  while (cur !== a && guard++ < 100) {
    const step = prev.get(cur);
    if (!step) break;
    edges.push(step.rid);
    cur = step.from;
  }
  return { dist: distVal, edges: edges.reverse() };
}

// 所有未完成票的规划（每回合只算一次，供占领评估复用）
function ticketPlans(state, playerIndex) {
  const p = state.players[playerIndex];
  const out = [];
  for (const id of p.tickets) {
    const t = TICKET_MAP[id];
    if (!t) continue;
    if (canConnect(state, playerIndex, t.a, t.b)) continue;
    const plan = shortestPlan(state, playerIndex, t.a, t.b);
    out.push({ ticket: t, plan });
  }
  return out;
}

function bestGrayColor(p) {
  let color = COLOR_LIST[0];
  let best = -1;
  for (const c of COLOR_LIST) {
    const v = p.hand[c] || 0;
    if (v > best) { best = v; color = c; }
  }
  return color;
}

// 需求向量：优先关注最容易完成的几张票
function demandVector(state, playerIndex, plans) {
  const demand = {};
  const p = state.players[playerIndex];
  for (const c of COLOR_LIST) demand[c] = 0;
  let locoDemand = 0;

  const sorted = plans
    .filter(x => x.plan.dist !== Infinity)
    .map(x => ({ ...x, ratio: x.ticket.points / (x.plan.dist + 1) }))
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, 2);

  for (const { plan } of sorted) {
    for (const rid of plan.edges) {
      if (state.routeOwner[rid] === playerIndex) continue;
      const r = ROUTES[rid];
      const ferries = r.ferries || 0;
      locoDemand += ferries;
      const color = r.color || bestGrayColor(p);
      demand[color] += Math.max(0, r.len - ferries);
    }
  }

  for (const c of COLOR_LIST) demand[c] = Math.min(demand[c], 7);
  return { demand, locoDemand: Math.min(locoDemand, 6) };
}

// 占领一条路线的价值（plans 预计算，避免逐条跑最短路）
function routeValue(state, playerIndex, routeId, plans) {
  const r = ROUTES[routeId];
  let value = ROUTE_SCORES[r.len] || 0;
  let onPlan = false;

  for (const { ticket, plan } of plans) {
    if (plan.edges.includes(routeId)) {
      onPlan = true;
      value += 10 + ticket.points * 0.4;
    }
  }
  if (r.len >= 5) value += 2;
  if (onPlan) value += 3;
  return value;
}

// 抽牌选择
function pickDraw(state, playerIndex, plans) {
  const options = listValidActions(state, playerIndex).filter(a => a.type === 'DRAW_CARDS');
  if (options.length === 0) return null;

  const { demand, locoDemand } = demandVector(state, playerIndex, plans);
  let best = null;
  let bestScore = -1;

  for (const opt of options) {
    let score;
    if (opt.source === 'deck') {
      let total = 0;
      for (const c of COLOR_LIST) total += Math.min(demand[c], 4);
      score = 2.4 + total * 0.22 + locoDemand * 0.5;
    } else {
      const card = state.faceUp[opt.index];
      if (!card) continue;
      if (card === 'loco') score = 4.5 + locoDemand * 2.2;
      else score = (demand[card] || 0) * 2.2 + 1;
    }
    if (score > bestScore) { bestScore = score; best = opt; }
  }
  return best || options[0];
}

// 开局选票：保留长途票 + 两张最容易完成的普通票
function pickInitialTickets(state, playerIndex) {
  const pool = state.initialTickets[playerIndex] || [];
  const longs = pool.filter(id => TICKET_MAP[id]?.long);
  const regulars = pool
    .filter(id => !TICKET_MAP[id]?.long)
    .map(id => {
      const t = TICKET_MAP[id];
      const plan = shortestPlan(state, playerIndex, t.a, t.b);
      return { id, cost: plan.dist === Infinity ? 40 : plan.dist };
    })
    .sort((a, b) => a.cost - b.cost);

  const ids = [...longs, ...regulars.slice(0, 2).map(r => r.id)];
  // 不足 2 张时补齐
  for (const id of pool) {
    if (ids.length >= 2) break;
    if (!ids.includes(id)) ids.push(id);
  }
  return { type: 'KEEP_INITIAL_TICKETS', ids };
}

function pickKeptTickets(state, playerIndex) {
  const drawn = state.pendingTickets.drawn;
  const scored = drawn.map(id => {
    const t = TICKET_MAP[id];
    const plan = shortestPlan(state, playerIndex, t.a, t.b);
    const cost = plan.dist === Infinity ? 30 : plan.dist;
    return { id, value: t.points - cost * 0.9, points: t.points };
  }).sort((a, b) => b.value - a.value);

  const keep = scored.filter(s => s.value > 0).map(s => s.id);
  if (keep.length === 0) keep.push(scored[0].id);
  return { type: 'KEEP_TICKETS', ids: keep };
}

function pickTunnel(state, playerIndex) {
  const actions = listValidActions(state, playerIndex);
  const pay = actions.find(a => a.type === 'PAY_TUNNEL');
  if (!pay) return { type: 'DECLINE_TUNNEL' };

  const pt = state.pendingTunnel;
  const value = routeValue(state, playerIndex, pt.routeId, ticketPlans(state, playerIndex));
  // 额外花费很高且路线价值低时才放弃
  if (pt.extraNeeded >= 3 && value < 6) return { type: 'DECLINE_TUNNEL' };
  return pay;
}

export function pickAction(state, playerIndex) {
  const p = state.players[playerIndex];
  if (!p) return null;

  if (state.phase === 'setup') return pickInitialTickets(state, playerIndex);
  if (state.turnPhase === 'tunnel') return pickTunnel(state, playerIndex);
  if (state.turnPhase === 'tickets') return pickKeptTickets(state, playerIndex);

  const actions = listValidActions(state, playerIndex);
  if (actions.length === 0) return null;

  const plans = ticketPlans(state, playerIndex);
  const claimActions = actions.filter(a => a.type === 'CLAIM_ROUTE');
  const stationActions = actions.filter(a => a.type === 'BUILD_STATION');
  const drawTicket = actions.find(a => a.type === 'DRAW_TICKETS');
  const hand = handCount(p);

  let bestClaim = null;
  let bestValue = -Infinity;
  for (const a of claimActions) {
    const v = routeValue(state, playerIndex, a.routeId, plans);
    if (v > bestValue) { bestValue = v; bestClaim = a; }
  }

  // 还有未完成的任务票：优先沿计划推进
  if (plans.length > 0) {
    if (bestClaim && bestValue >= 12) return bestClaim;
    if (bestClaim && hand >= 14) return bestClaim;

    // 票被堵死且建得起车站
    if (stationActions.length > 0) {
      const blocked = plans.find(x => x.plan.dist === Infinity);
      if (blocked) {
        const preferred = stationActions.find(a => a.cityId === blocked.ticket.a || a.cityId === blocked.ticket.b);
        if (preferred) return preferred;
      }
    }

    const draw = pickDraw(state, playerIndex, plans);
    if (draw) return draw;
    if (bestClaim) return bestClaim;
    if (drawTicket) return drawTicket;
    if (stationActions.length > 0) return stationActions[0];
    return actions[0];
  }

  // 任务票全部完成：继续拿分 / 补票
  if (bestClaim && bestValue >= 4) return bestClaim;
  if (drawTicket && p.tickets.length < 6 && hand < 12) return drawTicket;
  if (bestClaim) return bestClaim;
  if (stationActions.length > 0 && p.stations > 1) return stationActions[0];
  const draw = pickDraw(state, playerIndex, plans);
  if (draw) return draw;
  if (drawTicket) return drawTicket;
  return actions[0];
}

export { pickInitialTickets, pickKeptTickets, shortestPlan };
