// 铁路环游：欧洲版 · 游戏引擎（纯函数）
// initGame(state) → validateAction / applyAction（输入 state + action → 新 state）
// 不含 DOM / 网络 / 存储，可被 UI、AI、Node 模拟共用

import {
  TRAIN_COLORS, COLOR_NAMES, ROUTES, TICKETS, TICKET_MAP,
  TRAIN_CARS_PER_PLAYER, STATIONS_PER_PLAYER, CARDS_PER_COLOR, LOCOMOTIVES,
  STARTING_HAND, FACE_UP_COUNT, TICKETS_DRAWN_PER_ACTION, MIN_INITIAL_TICKETS,
  UNUSED_STATION_POINTS, LONGEST_PATH_BONUS, ROUTE_SCORES, STATION_COSTS,
  CITY_MAP, normalizeColor
} from './ticket-data.js?v=33';

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
    turnPhase: 'idle',         // idle | drawing | tunnel | tickets
    drawnThisTurn: 0,
    players: [],
    routeOwner: new Array(ROUTES.length).fill(null),
    cityStations: {},          // cityId -> playerIndex
    trainDeck: [],
    discard: [],
    faceUp: new Array(FACE_UP_COUNT).fill(null),
    ticketDeck: [],            // 普通票牌堆（id 列表）
    pendingTunnel: null,
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
    stations: STATIONS_PER_PLAYER,
    stationCities: [],
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

  // 任务牌：长程洗匀每人 1 张（多余移出游戏），普通洗匀每人 3 张
  const longDeck = shuffleInPlace(s, TICKETS.filter(t => t.long).map(t => t.id));
  const regularDeck = shuffleInPlace(s, TICKETS.filter(t => !t.long).map(t => t.id));

  s.initialTickets = s.players.map(() => []);
  for (const p of s.players) {
    const long = longDeck.pop();
    if (long) s.initialTickets[p.id].push(long);
  }
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
  const ferries = r.ferries || 0;

  const tryColor = (color) => {
    const colorCards = Math.min(hand[color] || 0, len - ferries);
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

// 目的地票连通判定（允许使用自己的火车站借用对手一段铁轨）
export function canConnect(state, playerIndex, from, to, maxStations = null) {
  if (from === to) return true;
  const p = state.players[playerIndex];
  const ownAdj = buildOwnAdj(state, playerIndex);

  // 对手的铁轨（按城市索引）
  const oppAdj = new Map();
  ROUTES.forEach((r, i) => {
    const owner = state.routeOwner[i];
    if (owner === null || owner === playerIndex) return;
    if (!oppAdj.has(r.a)) oppAdj.set(r.a, []);
    if (!oppAdj.has(r.b)) oppAdj.set(r.b, []);
    oppAdj.get(r.a).push(r.b);
    oppAdj.get(r.b).push(r.a);
  });

  const stationCities = p.stationCities.slice(0, maxStations == null ? p.stationCities.length : maxStations);
  const stationIdx = new Map(stationCities.map((c, i) => [c, i]));

  const seen = new Set();
  const queue = [[from, 0]];
  seen.add(`${from}#0`);

  while (queue.length) {
    const [city, mask] = queue.shift();
    if (city === to) return true;

    for (const nxt of ownAdj.get(city) || []) {
      const key = `${nxt}#${mask}`;
      if (!seen.has(key)) { seen.add(key); queue.push([nxt, mask]); }
    }

    const si = stationIdx.get(city);
    if (si !== undefined && !(mask & (1 << si))) {
      const newMask = mask | (1 << si);
      for (const nxt of oppAdj.get(city) || []) {
        const key = `${nxt}#${newMask}`;
        if (!seen.has(key)) { seen.add(key); queue.push([nxt, newMask]); }
      }
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
      if (state.turnPhase === 'tunnel') return '请先处理隧道';
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
      if (state.turnPhase === 'tunnel') return '请先处理隧道';
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
      const pay = claimPayment(p.hand, routeIdx, normalizeColor(action.color));
      if (!pay) return '车票不足，无法支付该路线';
      return null;
    }

    case 'PAY_TUNNEL': {
      if (state.turnPhase !== 'tunnel' || !state.pendingTunnel) return '当前没有待处理的隧道';
      const pt = state.pendingTunnel;
      const have = (p.hand[pt.color] || 0) + (p.hand.loco || 0);
      if (have < pt.extraNeeded) return `还需要 ${pt.extraNeeded - have} 张同色车票才能支付隧道额外费用`;
      return null;
    }

    case 'DECLINE_TUNNEL':
      if (state.turnPhase !== 'tunnel' || !state.pendingTunnel) return '当前没有待处理的隧道';
      return null;

    case 'DRAW_TICKETS': {
      if (state.turnPhase === 'tunnel') return '请先处理隧道';
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

    case 'BUILD_STATION': {
      if (state.turnPhase === 'tunnel') return '请先处理隧道';
      if (state.turnPhase === 'tickets') return '请先选择要保留的任务牌';
      if (state.turnPhase !== 'idle') return '本回合已抽过牌，不能建车站';
      if (p.stations <= 0) return '火车站已用完';
      const city = action.cityId;
      if (!CITY_MAP[city]) return '城市无效';
      if (state.cityStations[city] !== undefined) return '该城市已有火车站';
      const cost = STATION_COSTS[STATIONS_PER_PLAYER - p.stations];
      if (!bestStationColor(p.hand, cost)) return `需要 ${cost} 张同色车票才能建站`;
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

function canPayTunnel(hand, pt) {
  return (hand[pt.color] || 0) + (hand.loco || 0) >= pt.extraNeeded;
}

// 车站花费：找出可用同色（含车头兜底）的颜色
function bestStationColor(hand, cost) {
  let best = null;
  for (const c of TRAIN_COLORS) {
    if ((hand[c] || 0) >= cost) {
      if (!best || hand[c] > hand[best]) best = c;
    }
  }
  if (!best && (hand.loco || 0) >= cost) return 'loco';
  if (best) return best;
  // 颜色不够时可混合车头
  for (const c of TRAIN_COLORS) {
    if ((hand[c] || 0) + (hand.loco || 0) >= cost && (hand[c] || 0) > 0) return c;
  }
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
      s.log.push(`${p.name} 抽到 ${COLOR_NAMES[card] || card} 车票`);

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
      const pay = claimPayment(p.hand, routeIdx, normalizeColor(action.color));
      payCardsFromHand(p, pay);

      if (r.tunnel) {
        const revealed = [];
        for (let i = 0; i < 3; i++) {
          const c = drawFromDeck(s);
          if (c) revealed.push(c);
        }
        // 全车头支付时，以路线颜色作为“打出的颜色”；灰线则视为车头
        const declared = pay.colorCards === 0 ? (r.color || 'loco') : pay.color;
        const matched = revealed.filter(c => c === declared || c === 'loco').length;
        if (matched > 0) {
          s.pendingTunnel = {
            routeId: routeIdx,
            pay,
            color: declared,
            extraNeeded: matched,
            revealed
          };
          s.turnPhase = 'tunnel';
          s.log.push(`${p.name} 尝试通过隧道，需要额外支付 ${matched} 张${COLOR_NAMES[declared] || ''}车票`);
          break;
        }
        // 没有额外费用：直接占领，翻开的牌弃掉
        s.discard.push(...paymentToCards(pay));
        s.discard.push(...revealed);
        claimRoute(s, playerIndex, routeIdx, r);
        s.log.push(`${p.name} 占领 ${CITY_MAP[r.a].zh}–${CITY_MAP[r.b].zh}（隧道）`);
        finishTurn(s);
      } else {
        s.discard.push(...paymentToCards(pay));
        claimRoute(s, playerIndex, routeIdx, r);
        s.log.push(`${p.name} 占领 ${CITY_MAP[r.a].zh}–${CITY_MAP[r.b].zh}`);
        finishTurn(s);
      }
      break;
    }

    case 'PAY_TUNNEL': {
      const pt = s.pendingTunnel;
      const useColor = Math.min(p.hand[pt.color] || 0, pt.extraNeeded);
      const useLoco = pt.extraNeeded - useColor;
      if (useColor > 0) takeCard(p, pt.color, useColor);
      if (useLoco > 0) takeCard(p, 'loco', useLoco);

      s.discard.push(...pt.revealed);
      s.discard.push(...paymentToCards(pt.pay));
      for (let i = 0; i < useColor; i++) s.discard.push(pt.color);
      for (let i = 0; i < useLoco; i++) s.discard.push('loco');

      const r = ROUTES[pt.routeId];
      claimRoute(s, playerIndex, pt.routeId, r);
      s.log.push(`${p.name} 支付额外车票，通过隧道 ${CITY_MAP[r.a].zh}–${CITY_MAP[r.b].zh}`);
      s.pendingTunnel = null;
      finishTurn(s);
      break;
    }

    case 'DECLINE_TUNNEL': {
      const pt = s.pendingTunnel;
      // 收回已打出的基础车票
      for (const c of paymentToCards(pt.pay)) giveCard(p, c);
      s.discard.push(...pt.revealed);
      s.pendingTunnel = null;
      s.log.push(`${p.name} 放弃通过隧道`);
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

    case 'BUILD_STATION': {
      const cost = STATION_COSTS[STATIONS_PER_PLAYER - p.stations];
      const color = bestStationColor(p.hand, cost);
      let remain = cost;
      const useColor = Math.min(p.hand[color] || 0, remain);
      if (useColor > 0) { takeCard(p, color, useColor); remain -= useColor; }
      if (remain > 0) takeCard(p, 'loco', remain);
      for (let i = 0; i < cost; i++) s.discard.push(color);

      p.stations--;
      p.stationCities.push(action.cityId);
      s.cityStations[action.cityId] = playerIndex;
      s.log.push(`${p.name} 在 ${CITY_MAP[action.cityId].zh} 建造火车站`);
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
  s.pendingTunnel = null;
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
    const stationScore = p.stations * UNUSED_STATION_POINTS;
    const routeScore = p.score;
    const longest = longestPathLength(s, p.id);
    p.longestPath = longest;
    p.score = routeScore + ticketScore + stationScore;
    p.breakdown = {
      routeScore,
      ticketScore,
      stationScore,
      unusedStations: p.stations,
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

  if (state.turnPhase === 'tunnel') {
    if (canPayTunnel(p.hand, state.pendingTunnel)) actions.push({ type: 'PAY_TUNNEL' });
    actions.push({ type: 'DECLINE_TUNNEL' });
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
    for (const city of Object.keys(CITY_MAP)) {
      if (validateAction(state, playerIndex, { type: 'BUILD_STATION', cityId: city }) === null) {
        actions.push({ type: 'BUILD_STATION', cityId: city });
      }
    }
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
    else if (owner === null) w = r.len + (r.ferries || 0) * 0.5;
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
