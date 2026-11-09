// 铁路环游：美国版 · 游戏引擎（纯函数）
// initGame(state) → validateAction / applyAction（输入 state + action → 新 state）
// 不含 DOM / 网络 / 存储，可被 UI、AI、Node 模拟共用

import {
  TRAIN_COLORS, COLOR_NAMES, ROUTES, TICKETS, TICKET_MAP,
  TRAIN_CARS_PER_PLAYER, CARDS_PER_COLOR, LOCOMOTIVES,
  STARTING_HAND, FACE_UP_COUNT, TICKETS_DRAWN_PER_ACTION, MIN_INITIAL_TICKETS,
  LONGEST_PATH_BONUS, ROUTE_SCORES,
  CITY_MAP, normalizeColor
} from './ticket-data.js?v=38';

// ===== 基础工具 =====
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function rand(s) {
  s._rng = (Math.imul(s._rng >>> 0, 1664525) + 1013904223) >>> 0;
  return s._rng / 4294967296;
}

function shuffleInPlace(s, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyHand() {
  const h = {};
  for (const c of TRAIN_COLORS) h[c] = 0;
  h.loco = 0;
  return h;
}

function countHand(hand) {
  return TRAIN_COLORS.reduce((sum, c) => sum + (hand[c] || 0), 0) + (hand.loco || 0);
}

function giveCard(p, color) {
  p.hand[color] = (p.hand[color] || 0) + 1;
  p.handCount = countHand(p.hand);
}

function takeCard(p, color, n = 1) {
  p.hand[color] = (p.hand[color] || 0) - n;
  p.handCount = countHand(p.hand);
}

// 同一条路的平行双线分组（key: 两城市 id 排序后拼接）
const DOUBLE_GROUPS = (() => {
  const map = new Map();
  ROUTES.forEach((r, i) => {
    if (r.parallel === null || r.parallel === undefined) return;
    const key = [r.a, r.b].sort().join('|');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  });
  return map;
})();

function doubleGroupOf(routeIdx) {
  const r = ROUTES[routeIdx];
  return DOUBLE_GROUPS.get([r.a, r.b].sort().join('|')) || null;
}

// ===== 发牌 / 牌堆 =====
function buildTrainDeck(s) {
  const deck = [];
  for (const c of TRAIN_COLORS) {
    for (let i = 0; i < CARDS_PER_COLOR; i++) deck.push(c);
  }
  for (let i = 0; i < LOCOMOTIVES; i++) deck.push('loco');
  return shuffleInPlace(s, deck);
}

function drawFromDeck(s) {
  if (s.trainDeck.length === 0) {
    if (s.discard.length === 0) return null;
    s.trainDeck = shuffleInPlace(s, s.discard);
    s.discard = [];
  }
  return s.trainDeck.pop() || null;
}

function checkFaceUpLocos(s) {
  // 翻开区一旦出现 3 张车头，5 张全部弃掉重发
  let guard = 0;
  while (s.faceUp.filter(c => c === 'loco').length >= 3 && guard++ < 20) {
    for (const c of s.faceUp) if (c) s.discard.push(c);
    s.faceUp = new Array(FACE_UP_COUNT).fill(null);
    refillFaceUp(s, true);
    if (s.trainDeck.length === 0 && s.discard.length === 0) break;
  }
}

function refillFaceUp(s, skipCheck = false) {
  if (s.trainDeck.length === 0 && s.discard.length > 0) {
    s.trainDeck = shuffleInPlace(s, s.discard);
    s.discard = [];
  }
  for (let i = 0; i < FACE_UP_COUNT; i++) {
    if (s.faceUp[i] == null) {
      const c = s.trainDeck.length > 0 ? s.trainDeck.pop() : null;
      s.faceUp[i] = c || null;
    }
  }
  if (!skipCheck) checkFaceUpLocos(s);
}

// ===== 初始化 =====
export function initGame(playerNames, opts = {}) {
  const n = playerNames.length;
  if (n < 2 || n > 5) throw new Error('玩家数必须为 2-5 人');

  const s = {
    version: 1,
    phase: 'setup',            // setup | playing | finalRound | ended
    currentPlayer: 0,
    turn: 0,
    turnPhase: 'idle',         // idle | drawing | tickets
    drawnThisTurn: 0,
    players: [],
    routeOwner: new Array(ROUTES.length).fill(null),
    trainDeck: [],
    discard: [],
    faceUp: new Array(FACE_UP_COUNT).fill(null),
    ticketDeck: [],            // 目的地票牌堆（id 列表）
    pendingTickets: null,
    initialTickets: [],        // 开局每人待选票
    finalTurnsRemaining: 0,
    endTriggeredBy: null,
    results: null,
    winners: [],
    log: [],
    _rng: (opts.seed == null ? Math.floor(Math.random() * 4294967296) : (opts.seed >>> 0))
  };

  s.players = playerNames.map((name, i) => ({
    id: i,
    name,
    isAI: false,
    hand: emptyHand(),
    handCount: 0,
    trains: TRAIN_CARS_PER_PLAYER,
    tickets: [],
    claimed: [],
    score: 0,
    longestPath: 0,
    breakdown: null
  }));

  // 车票牌堆
  s.trainDeck = buildTrainDeck(s);

  // 每人 4 张手牌
  for (let round = 0; round < STARTING_HAND; round++) {
    for (const p of s.players) {
      const c = drawFromDeck(s);
      if (c) giveCard(p, c);
    }
  }

  // 翻开 5 张
  refillFaceUp(s);

  // 开局任务牌：每人 3 张（美国版无长途票）
  const regularDeck = shuffleInPlace(s, TICKETS.map(t => t.id));

  s.initialTickets = s.players.map(() => []);
  for (let round = 0; round < 3; round++) {
    for (const p of s.players) {
      const t = regularDeck.pop();
      if (t) s.initialTickets[p.id].push(t);
    }
  }
  s.ticketDeck = regularDeck;

  s.log.push(`游戏开始：${n} 人局`);
  return s;
}

// ===== 支付计算 =====
// 返回 { color, colorCards, locos } 或 null（付不起）
// color: 实际使用的颜色（灰线由引擎择优）；全车头时 color = 'loco'
export function claimPayment(hand, routeIdx, preferredColor = null) {
  const r = ROUTES[routeIdx];
  if (!r) return null;
  const len = r.len;

  const tryColor = (color) => {
    const colorCards = Math.min(hand[color] || 0, len);
    const locos = len - colorCards;
    if (locos > (hand.loco || 0)) return null;
    return { color, colorCards, locos };
  };

  if (r.color) {
    return tryColor(r.color);
  }

  // 灰线：优先使用手上最多的颜色，最少消耗车头
  if (preferredColor && TRAIN_COLORS.includes(preferredColor)) {
    const pay = tryColor(preferredColor);
    if (pay) return pay;
  }
  let best = null;
  for (const c of TRAIN_COLORS) {
    const pay = tryColor(c);
    if (!pay) continue;
    if (!best || pay.locos < best.locos || (pay.locos === best.locos && pay.colorCards > best.colorCards)) {
      best = pay;
    }
  }
  return best;
}

// 列出所有合法支付组合（供玩家自选）；第一项为默认（最少车头、最多本色）
export function claimOptions(hand, routeIdx) {
  const r = ROUTES[routeIdx];
  if (!r) return [];
  const len = r.len;
  const locoInHand = hand.loco || 0;
  const colors = r.color ? [r.color] : TRAIN_COLORS;
  const out = [];

  for (const color of colors) {
    const have = hand[color] || 0;
    const maxLocos = Math.min(locoInHand, len - 1);
    for (let locos = maxLocos; locos >= 0; locos--) {
      const colorCards = len - locos;
      if (colorCards > have) continue;
      out.push({ color, colorCards, locos });
    }
  }
  if (locoInHand >= len) out.push({ color: 'loco', colorCards: 0, locos: len });

  out.sort((a, b) =>
    a.locos - b.locos ||
    b.colorCards - a.colorCards ||
    TRAIN_COLORS.indexOf(a.color) - TRAIN_COLORS.indexOf(b.color));
  return out;
}

// 解析玩家指定的支付方案；未指定时沿用自动择优（AI 兼容）
export function resolveClaimPayment(hand, routeIdx, action = {}) {
  if (!action || (action.color == null && action.locos == null)) {
    return claimPayment(hand, routeIdx);
  }
  const wantColor = action.color == null ? null
    : (action.color === 'loco' ? 'loco' : normalizeColor(action.color));
  const wantLocos = action.locos == null ? null : Number(action.locos);
  const hit = claimOptions(hand, routeIdx).find(o =>
    (wantColor == null || o.color === wantColor) &&
    (wantLocos == null || o.locos === wantLocos));
  return hit || null;
}

// ===== 图算法：连通性 / 最长路线 =====
function buildOwnAdj(state, playerIndex) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  };
  for (const rid of state.players[playerIndex].claimed) {
    const r = ROUTES[rid];
    add(r.a, r.b);
    add(r.b, r.a);
  }
  return adj;
}

// 目的地票连通判定（只算自己的铁轨）
export function canConnect(state, playerIndex, from, to) {
  if (from === to) return true;
  const ownAdj = buildOwnAdj(state, playerIndex);
  const seen = new Set([from]);
  const queue = [from];

  while (queue.length) {
    const city = queue.shift();
    if (city === to) return true;
    for (const nxt of ownAdj.get(city) || []) {
      if (!seen.has(nxt)) { seen.add(nxt); queue.push(nxt); }
    }
  }
  return false;
}

export function isTicketComplete(state, playerIndex, ticketId) {
  const t = TICKET_MAP[ticketId];
  if (!t) return false;
  return canConnect(state, playerIndex, t.a, t.b);
}

// 最长连续路线（只算自己的铁轨，火车站不计）
export function longestPathLength(state, playerIndex) {
  const adj = new Map();
  const add = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push([b, w]);
  };
  for (const rid of state.players[playerIndex].claimed) {
    const r = ROUTES[rid];
    add(r.a, r.b, r.len);
    add(r.b, r.a, r.len);
  }

  let best = 0;
  let steps = 0;
  const visited = new Set();

  function dfs(node, total) {
    steps++;
    if (total > best) best = total;
    if (steps > 300000) return;
    for (const [to, w] of adj.get(node) || []) {
      if (visited.has(to)) continue;
      visited.add(to);
      dfs(to, total + w);
      visited.delete(to);
    }
  }

  for (const start of adj.keys()) {
    visited.clear();
    visited.add(start);
    dfs(start, 0);
  }
  return best;
}

// ===== 校验 =====
export function validateAction(state, playerIndex, action) {
  const p = state.players[playerIndex];
  if (!p) return '玩家不存在';
  if (state.phase === 'ended') return '游戏已结束';
  if (state.currentPlayer !== playerIndex) return '不是你的回合';
  if (!action || typeof action.type !== 'string') return '无效动作';

  if (state.phase === 'setup') {
    if (action.type !== 'KEEP_INITIAL_TICKETS') return '开局阶段只能选择任务牌';
    return validateInitialTickets(state, playerIndex, action);
  }

  switch (action.type) {
    case 'DRAW_CARDS': {
      if (state.turnPhase === 'tickets') return '请先选择要保留的任务牌';
      if (state.turnPhase !== 'idle' && state.turnPhase !== 'drawing') return '当前不能抽牌';
      if (state.drawnThisTurn >= 2) return '本回合已抽满 2 张';
      if (action.source === 'faceup') {
        if (typeof action.index !== 'number' || action.index < 0 || action.index >= FACE_UP_COUNT) return '位置无效';
        const c = state.faceUp[action.index];
        if (!c) return '该位置没有牌';
        if (c === 'loco' && state.drawnThisTurn > 0) return '面朝上的车头只能作为本回合唯一一张抽取';
        return null;
      }
      if (action.source === 'deck') {
        if (state.trainDeck.length === 0 && state.discard.length === 0) return '抽牌堆与弃牌堆都已空，无法抽牌';
        return null;
      }
      return 'source 必须是 faceup 或 deck';
    }

    case 'CLAIM_ROUTE': {
      if (state.turnPhase === 'tickets') return '请先选择要保留的任务牌';
      if (state.turnPhase !== 'idle') return '本回合已抽过牌，不能再占路线';
      const routeIdx = action.routeId;
      if (typeof routeIdx !== 'number' || !ROUTES[routeIdx]) return '路线无效';
      if (state.routeOwner[routeIdx] !== null) return '该路线已被占领';

      const group = doubleGroupOf(routeIdx);
      if (group) {
        if (group.some(i => state.routeOwner[i] === playerIndex)) return '不能同时占领同一对城市的两条线路';
        if (state.players.length <= 3 && group.some(i => state.routeOwner[i] !== null)) {
          return '2-3 人局中该双线只能使用一条';
        }
      }

      const r = ROUTES[routeIdx];
      if (p.trains < r.len) return '车厢不足';
      const pay = resolveClaimPayment(p.hand, routeIdx, action);
      if (!pay) {
        return claimPayment(p.hand, routeIdx) ? '所选支付组合不可行' : '车票不足，无法支付该路线';
      }
      return null;
    }

    case 'DRAW_TICKETS': {
      if (state.turnPhase === 'tickets') return '请先选择要保留的任务牌';
      if (state.turnPhase !== 'idle') return '本回合已抽过牌，不能再抽任务牌';
      if (state.ticketDeck.length === 0) return '任务牌堆已空';
      return null;
    }

    case 'KEEP_TICKETS': {
      if (state.turnPhase !== 'tickets' || !state.pendingTickets) return '当前没有待选的任务牌';
      const drawn = state.pendingTickets.drawn;
      if (!Array.isArray(action.ids) || action.ids.length < 1) return '至少要保留 1 张任务牌';
      if (action.ids.some(id => !drawn.includes(id))) return '只能保留本次抽到的任务牌';
      if (new Set(action.ids).size !== action.ids.length) return '任务牌重复选择';
      return null;
    }

    default:
      return `未知动作类型: ${action.type}`;
  }
}

function validateInitialTickets(state, playerIndex, action) {
  const pool = state.initialTickets[playerIndex] || [];
  const ids = action.ids;
  if (!Array.isArray(ids) || ids.length < MIN_INITIAL_TICKETS) return `开局至少要保留 ${MIN_INITIAL_TICKETS} 张任务牌`;
  if (ids.some(id => !pool.includes(id))) return '只能保留发给你的任务牌';
  if (new Set(ids).size !== ids.length) return '任务牌重复选择';
  return null;
}

// ===== 执行动作 =====
export function applyAction(state, playerIndex, action) {
  const err = validateAction(state, playerIndex, action);
  if (err) throw new Error(err);

  const s = deepClone(state);
  const p = s.players[playerIndex];
  s.log = s.log || [];

  if (s.phase === 'setup') {
    applyInitialTickets(s, playerIndex, action);
    return s;
  }

  switch (action.type) {
    case 'DRAW_CARDS': {
      const card = takeTrainCard(s, action);
      giveCard(p, card);
      s.drawnThisTurn++;
      // 盲抽不公开颜色，面朝上抽牌公开
      s.log.push(action.source === 'deck'
        ? `${p.name} 盲抽 1 张车票`
        : `${p.name} 抽到 ${COLOR_NAMES[card] || card} 车票`);

      const single = (action.source === 'faceup' && card === 'loco');
      if (single || s.drawnThisTurn >= 2) {
        finishTurn(s);
      } else {
        s.turnPhase = 'drawing';
      }
      break;
    }

    case 'CLAIM_ROUTE': {
      const routeIdx = action.routeId;
      const r = ROUTES[routeIdx];
      const pay = resolveClaimPayment(p.hand, routeIdx, action);
      payCardsFromHand(p, pay);
      s.discard.push(...paymentToCards(pay));
      claimRoute(s, playerIndex, routeIdx, r);
      s.log.push(`${p.name} 占领 ${CITY_MAP[r.a].zh}–${CITY_MAP[r.b].zh}`);
      finishTurn(s);
      break;
    }

    case 'DRAW_TICKETS': {
      const drawn = [];
      const count = Math.min(TICKETS_DRAWN_PER_ACTION, s.ticketDeck.length);
      for (let i = 0; i < count; i++) drawn.push(s.ticketDeck.pop());
      s.pendingTickets = { drawn };
      s.turnPhase = 'tickets';
      s.log.push(`${p.name} 抽取 ${drawn.length} 张任务牌`);
      break;
    }

    case 'KEEP_TICKETS': {
      const drawn = s.pendingTickets.drawn;
      const keep = action.ids.slice();
      p.tickets.push(...keep);
      const back = drawn.filter(id => !keep.includes(id));
      // 弃掉的任务牌放回牌堆底部
      s.ticketDeck.unshift(...back);
      s.ticketDeck = shuffleInPlace(s, s.ticketDeck);
      s.pendingTickets = null;
      s.log.push(`${p.name} 保留 ${keep.length} 张任务牌`);
      finishTurn(s);
      break;
    }

    default:
      throw new Error(`未实现的动作: ${action.type}`);
  }

  return s;
}

function applyInitialTickets(s, playerIndex, action) {
  const p = s.players[playerIndex];
  const pool = s.initialTickets[playerIndex] || [];
  const keep = action.ids.slice();
  p.tickets = keep;
  // 弃掉的开局票移出游戏（不回到牌堆）
  s.log.push(`${p.name} 保留 ${keep.length} 张开局任务牌`);
  s.initialTickets[playerIndex] = pool.filter(id => keep.includes(id));

  const next = s.currentPlayer + 1;
  if (next >= s.players.length) {
    s.phase = 'playing';
    s.currentPlayer = 0;
    s.turn = 1;
    s.turnPhase = 'idle';
    s.log.push('开局任务牌选择完成，游戏开始');
  } else {
    s.currentPlayer = next;
  }
}

function takeTrainCard(s, action) {
  if (action.source === 'faceup') {
    const card = s.faceUp[action.index];
    s.faceUp[action.index] = null;
    refillFaceUp(s);
    return card;
  }
  const card = drawFromDeck(s);
  return card;
}

function payCardsFromHand(p, pay) {
  if (pay.colorCards > 0) takeCard(p, pay.color, pay.colorCards);
  if (pay.locos > 0) takeCard(p, 'loco', pay.locos);
}

function paymentToCards(pay) {
  const out = [];
  for (let i = 0; i < pay.colorCards; i++) out.push(pay.color);
  for (let i = 0; i < pay.locos; i++) out.push('loco');
  return out;
}

function claimRoute(s, playerIndex, routeIdx, r) {
  const p = s.players[playerIndex];
  s.routeOwner[routeIdx] = playerIndex;
  p.claimed.push(routeIdx);
  p.trains -= r.len;
  p.score += ROUTE_SCORES[r.len] || 0;
}

function finishTurn(s) {
  const p = s.players[s.currentPlayer];
  s.turnPhase = 'idle';
  s.drawnThisTurn = 0;
  s.pendingTickets = null;

  if (s.phase === 'playing' && p.trains <= 2) {
    s.phase = 'finalRound';
    s.finalTurnsRemaining = s.players.length - 1;
    s.endTriggeredBy = s.currentPlayer;
    s.log.push(`${p.name} 剩余车厢 ≤ 2，触发终局，其余玩家各走最后一回合`);
  } else if (s.phase === 'finalRound') {
    s.finalTurnsRemaining--;
    if (s.finalTurnsRemaining <= 0) {
      s.phase = 'ended';
      scoreGame(s);
      return;
    }
  }

  s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
  s.turn++;
}

// ===== 终局结算 =====
function scoreGame(s) {
  s.results = [];
  for (const p of s.players) {
    const ticketResults = p.tickets.map(id => {
      const t = TICKET_MAP[id];
      const ok = canConnect(s, p.id, t.a, t.b);
      return { id, ok, points: ok ? t.points : -t.points };
    });
    const ticketScore = ticketResults.reduce((sum, r) => sum + r.points, 0);
    const routeScore = p.score;
    const longest = longestPathLength(s, p.id);
    p.longestPath = longest;
    p.score = routeScore + ticketScore;
    p.breakdown = {
      routeScore,
      ticketScore,
      tickets: ticketResults
    };
  }

  // 最长连续路线奖励（并列都拿）
  const maxLen = Math.max(...s.players.map(p => p.longestPath));
  s.longestWinners = [];
  if (maxLen > 0) {
    for (const p of s.players) {
      if (p.longestPath === maxLen) {
        p.score += LONGEST_PATH_BONUS;
        p.breakdown.longestBonus = LONGEST_PATH_BONUS;
        s.longestWinners.push(p.id);
      }
    }
  }

  const maxScore = Math.max(...s.players.map(p => p.score));
  s.winners = s.players.filter(p => p.score === maxScore).map(p => p.id);
  s.results = s.players.map(p => ({
    id: p.id,
    name: p.name,
    score: p.score,
    breakdown: p.breakdown,
    longestPath: p.longestPath,
    trainsLeft: p.trains
  }));
  s.log.push(`游戏结束，最高分 ${maxScore}：${s.players.filter(p => s.winners.includes(p.id)).map(p => p.name).join('、')}`);
}

// ===== 合法动作枚举 =====
export function listValidActions(state, playerIndex) {
  const actions = [];
  if (state.phase === 'ended' || state.currentPlayer !== playerIndex) return actions;
  const p = state.players[playerIndex];

  if (state.phase === 'setup') {
    const pool = state.initialTickets[playerIndex] || [];
    // 所有 >= 2 张的保留组合
    actions.push({ type: 'KEEP_INITIAL_TICKETS', ids: pool.slice() });
    for (const id of pool) {
      const rest = pool.filter(x => x !== id);
      if (rest.length >= MIN_INITIAL_TICKETS) actions.push({ type: 'KEEP_INITIAL_TICKETS', ids: rest });
    }
    return actions;
  }

  if (state.turnPhase === 'tickets') {
    const drawn = state.pendingTickets.drawn;
    actions.push({ type: 'KEEP_TICKETS', ids: drawn.slice() });
    for (const id of drawn) actions.push({ type: 'KEEP_TICKETS', ids: [id] });
    return actions;
  }

  // 抽牌
  if (state.turnPhase === 'idle' || state.turnPhase === 'drawing') {
    for (let i = 0; i < FACE_UP_COUNT; i++) {
      if (state.faceUp[i]) {
        if (!(state.faceUp[i] === 'loco' && state.drawnThisTurn > 0)) {
          actions.push({ type: 'DRAW_CARDS', source: 'faceup', index: i });
        }
      }
    }
    if (state.trainDeck.length > 0 || state.discard.length > 0) {
      actions.push({ type: 'DRAW_CARDS', source: 'deck' });
    }
  }

  if (state.turnPhase === 'idle') {
    for (let i = 0; i < ROUTES.length; i++) {
      if (validateAction(state, playerIndex, { type: 'CLAIM_ROUTE', routeId: i }) === null) {
        actions.push({ type: 'CLAIM_ROUTE', routeId: i });
      }
    }
    if (state.ticketDeck.length > 0) actions.push({ type: 'DRAW_TICKETS' });
  }

  return actions;
}

// ===== AI / UI 辅助导出 =====
export function getRouteOwner(state, routeIdx) {
  return state.routeOwner[routeIdx];
}

export function distanceForPlayer(state, playerIndex, from, to, opts = {}) {
  // Dijkstra：自己的路线 0 费，空地按车票张数，对手路线可选是否禁止
  const ignoreOpponent = opts.ignoreOpponent !== false;
  const extra = opts.hypotheticalRouteIdx;
  const adj = new Map();
  const add = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push([b, w]);
  };
  ROUTES.forEach((r, i) => {
    const owner = state.routeOwner[i];
    let w;
    if (owner === playerIndex) w = 0;
    else if (owner === null) w = r.len;
    else if (ignoreOpponent) w = Infinity;
    else w = r.len + 2;
    if (i === extra) { w = 0; }
    if (w === Infinity) return;
    add(r.a, r.b, w);
    add(r.b, r.a, w);
  });

  const dist = new Map([[from, 0]]);
  const done = new Set();
  while (true) {
    let node = null;
    let best = Infinity;
    for (const [k, v] of dist) {
      if (!done.has(k) && v < best) { best = v; node = k; }
    }
    if (node === null) break;
    done.add(node);
    for (const [to, w] of adj.get(node) || []) {
      const nd = best + w;
      if (nd < (dist.get(to) ?? Infinity)) dist.set(to, nd);
    }
  }
  return dist.get(to) ?? Infinity;
}

export { ROUTES, TICKETS, TICKET_MAP, TRAIN_COLORS, CITY_MAP };
