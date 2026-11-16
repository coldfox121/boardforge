// 璀璨宝石 · 游戏引擎（纯函数，输入 state + action → 输出 newState）
// 不含网络 / 渲染 / IO — 好测、好挂联机
//
// 规则常量全部从 DEFAULT_RULES 读取，即官方规则，不支持任何自定义覆盖。
// 牌库数据默认用官方基线，管理员可通过后台维护牌面（admin 覆盖），规则本身不可改。

import { CARDS, NOBLES, GEM_COLORS } from './splendor-data.js';
import { loadAdminData } from './admin.js';

// ===== 官方默认规则常量 =====
export const DEFAULT_RULES = {
  // 玩家数范围
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  // 初始设置（按玩家数）
  SETUP: {
    2: { gemsPerColor: 4, nobles: 3 },
    3: { gemsPerColor: 5, nobles: 4 },
    4: { gemsPerColor: 7, nobles: 5 }
  },
  GOLD_POOL: 5,
  // 宝石与行动
  MAX_GEMS: 10,           // 最大宝石数（黄金 + 彩色）
  SAME_GEM_REQUIREMENT: 4, // 同色拿宝石最低库存
  RESERVED_MAX: 3,        // 预留槽上限
  BOARD_CARDS_PER_TIER: 4,
  // 贵族
  NOBLE_SCORE_FALLBACK: 3, // 贵族牌无 vp 字段时的默认值
  // 终局
  END_SCORE: 15,
  // 拿宝石数量
  TAKE_DIFF_MIN: 1,
  TAKE_DIFF_MAX: 3
};

// ===== 应用 admin 覆盖（引擎模块加载时一次性） =====
const _admin = (typeof localStorage !== 'undefined') ? loadAdminData('splendor') : null;
const E_CARDS = _admin?.CARDS || CARDS;
const E_NOBLES = (_admin?.NOBLES || NOBLES).map(n => ({ vp: DEFAULT_RULES.NOBLE_SCORE_FALLBACK, ...n }));
const E_GEM_COLORS = _admin?.GEM_COLORS || GEM_COLORS;

// ===== 辅助函数 =====
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function countGems(gems) {
  return GEM_COLORS.reduce((s, c) => s + (gems[c] || 0), 0) + (gems.gold || 0);
}

// ===== 行动记录 =====
// 记录写在 state.log 里随对局同步，联机双方（含非房主）看到的完全一致。
// 老存档没有 log 字段 → 首次写日志时自动初始化，读不到时 UI 显示“暂无记录”，不影响对局。
const LOG_MAX = 120;
const GEM_SHORT = { white: '白', blue: '蓝', green: '绿', red: '红', black: '黑', gold: '金' };
function gemLabel(c) { return GEM_SHORT[c] || c; }

function pushLog(s, seat, desc, type) {
  if (!Array.isArray(s.log)) s.log = [];
  const name = s.players[seat] ? s.players[seat].name : '';
  s.log.push({ turn: s.turn, seat, name, type: type || '', desc });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

// 弃宝石是逐颗执行的，连续同回合同玩家的弃牌合并成一条
function pushDiscardLog(s, seat, color) {
  if (!Array.isArray(s.log)) s.log = [];
  const last = s.log[s.log.length - 1];
  if (last && last.type === 'discard' && last.seat === seat && last.turn === s.turn && Array.isArray(last.parts)) {
    const hit = last.parts.find(x => x.color === color);
    if (hit) hit.n += 1; else last.parts.push({ color, n: 1 });
    last.desc = '弃掉 ' + last.parts.map(x => `${x.n}${gemLabel(x.color)}`).join('+');
    return;
  }
  s.log.push({
    turn: s.turn, seat, name: s.players[seat] ? s.players[seat].name : '',
    type: 'discard', parts: [{ color, n: 1 }], desc: '弃掉 1' + gemLabel(color)
  });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

// 卡面成本展示：1白+2蓝
function costLabel(cost) {
  if (!cost) return '无';
  const parts = E_GEM_COLORS.filter(c => (cost[c] || 0) > 0).map(c => `${cost[c]}${gemLabel(c)}`);
  return parts.length ? parts.join('+') : '无';
}

// 卡面描述：2级蓝卡（3VP）
function cardLabel(card) {
  if (!card) return '一张卡';
  return `${card.tier || '?'}级${gemLabel(card.color)}卡（${card.vp || 0}VP）`;
}

// ===== 游戏初始化 =====
// playerNames: ['P1','P2'] 或 ['P1','P2','P3','P4']
// 规则固定为官方规则；牌库用官方基线 + 管理员后台维护的牌面
export function initGame(playerNames) {
  const R = { ...DEFAULT_RULES };
  const n = playerNames.length;
  if (n < R.MIN_PLAYERS || n > R.MAX_PLAYERS) throw new Error(`玩家数必须 ${R.MIN_PLAYERS}-${R.MAX_PLAYERS}`);

  const cards = E_CARDS;
  const nobles = E_NOBLES.map(nob => ({ vp: R.NOBLE_SCORE_FALLBACK, ...nob }));
  const gemColors = E_GEM_COLORS;

  const setup = R.SETUP[n] || R.SETUP[R.MAX_PLAYERS];

  const tier1 = shuffle(cards[1].map(c => ({ ...c })));
  const tier2 = shuffle(cards[2].map(c => ({ ...c })));
  const tier3 = shuffle(cards[3].map(c => ({ ...c })));

  const board = {
    tier1: tier1.splice(0, R.BOARD_CARDS_PER_TIER),
    tier2: tier2.splice(0, R.BOARD_CARDS_PER_TIER),
    tier3: tier3.splice(0, R.BOARD_CARDS_PER_TIER)
  };

  const gemPool = {};
  for (const c of gemColors) gemPool[c] = setup.gemsPerColor;
  gemPool.gold = R.GOLD_POOL;

  const nobleDeck = shuffle(nobles.map(n => ({ ...n })));
  const drawnNobles = nobleDeck.splice(0, setup.nobles);

  const players = playerNames.map((name, i) => {
    const gems = { gold: 0 };
    for (const c of gemColors) gems[c] = 0;
    return {
      id: i,
      name,
      isAI: false,
      gems,
      ownedCards: [],
      reserved: [],
      nobles: [],
      score: 0
    };
  });

  return {
    version: 1,
    _rules: { ...R },        // 规则参数快照（联机时双方版本一致的凭证之一）
    _gemColors: [...gemColors],
    phase: 'playing',
    currentPlayer: 0,
    lastAction: null,
    turn: 1,
    gameOver: false,
    winners: [],
    decks: { tier1, tier2, tier3 },
    board,
    gemPool,
    nobles: drawnNobles,
    players,
    endTriggeredBy: null,
    _endCountdown: 0,
    _justTriggeredEnd: false,
    pendingDiscard: null,
    log: []                  // 行动记录（随对局同步，联机双方一致）
  };
}

// ===== 动作校验 =====
export function validateAction(state, playerIndex, action) {
  const R = state._rules || DEFAULT_RULES;
  const GEM_COLORS = state._gemColors || E_GEM_COLORS;
  const p = state.players[playerIndex];
  if (!p) return '玩家不存在';
  if (state.gameOver) return '游戏已结束';
  if (state.currentPlayer !== playerIndex) return '不是你的回合';

  switch (action.type) {
    case 'TAKE_DIFF': {
      const min = R.TAKE_DIFF_MIN, max = R.TAKE_DIFF_MAX;
      if (!action.colors || action.colors.length < min || action.colors.length > max) return `不同色最多拿 ${max} 颗`;
      const set = new Set(action.colors);
      if (set.size !== action.colors.length) return '不能有重复颜色';
      if (action.colors.some(c => !GEM_COLORS.includes(c))) return '颜色无效';
      if (action.colors.some(c => state.gemPool[c] < 1)) return '某颜色宝石不足';
      return null;
    }
    case 'TAKE_SAME': {
      if (!GEM_COLORS.includes(action.color)) return '颜色无效';
      if (state.gemPool[action.color] < R.SAME_GEM_REQUIREMENT) return `该色剩余不足 ${R.SAME_GEM_REQUIREMENT} 颗`;
      return null;
    }
    case 'RESERVE': {
      if (action.source === 'board') {
        if (![1,2,3].includes(action.tier)) return '等级无效';
        if (typeof action.cardIndex !== 'number') return '需要 cardIndex';
        const card = state.board[`tier${action.tier}`][action.cardIndex];
        if (!card) return '卡片不存在';
      } else if (action.source === 'top') {
        if (![1,2,3].includes(action.tier)) return '等级无效';
        if (state.decks[`tier${action.tier}`].length === 0) return '该等级牌堆已空';
      } else {
        return 'source 必须是 board 或 top';
      }
      if (p.reserved.length >= R.RESERVED_MAX) return `预留槽已满（最多 ${R.RESERVED_MAX} 张）`;
      if (state.gemPool.gold < 1) return '黄金不足';
      return null;
    }
    case 'BUY': {
      let card;
      if (action.source === 'board') {
        if (![1,2,3].includes(action.tier)) return '等级无效';
        card = state.board[`tier${action.tier}`][action.cardIndex];
      } else if (action.source === 'reserved') {
        card = p.reserved.find(c => c.id === action.cardId);
      } else {
        return 'source 必须是 board 或 reserved';
      }
      if (!card) return '卡片不存在';
      const cardBonus = {};
      for (const c of GEM_COLORS) cardBonus[c] = countColorInCards(p.ownedCards, c);
      let needGold = 0;
      for (const color of GEM_COLORS) {
        const need = card.cost[color] || 0;
        const payFromBonus = Math.min(cardBonus[color], need);
        const needGems = Math.max(0, need - payFromBonus);
        const payFromGems = Math.min(p.gems[color] || 0, needGems);
        if (payFromGems < needGems) needGold += (needGems - payFromGems);
      }
      if (needGold > (p.gems.gold || 0)) return '宝石不足，无法支付';
      return null;
    }
    case 'PASS':
      return null;
    default:
      return `未知动作类型: ${action.type}`;
  }
}

function countColorInCards(cards, color) {
  return cards.reduce((s, c) => s + (c.color === color ? 1 : 0), 0);
}

// ===== 执行动作 =====
export function applyAction(state, playerIndex, action) {
  const R = state._rules || DEFAULT_RULES;
  const GEM_COLORS = state._gemColors || E_GEM_COLORS;
  const err = validateAction(state, playerIndex, action);
  if (err) throw new Error(err);

  const s = deepClone(state);
  const p = s.players[playerIndex];
  p.isAI = p.isAI;
  s._justTriggeredEnd = false;

  switch (action.type) {
    case 'TAKE_DIFF': {
      action.colors.forEach(c => { s.gemPool[c]--; p.gems[c]++; });
      const counts = {};
      action.colors.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
      const takeParts = E_GEM_COLORS.filter(c => counts[c]).map(c => `${counts[c]}${gemLabel(c)}`);
      pushLog(s, playerIndex, `拿了 ${takeParts.join('+')}`, 'take');
      break;
    }

    case 'TAKE_SAME':
      s.gemPool[action.color] -= 2;
      p.gems[action.color] += 2;
      pushLog(s, playerIndex, `拿了 2${gemLabel(action.color)}`, 'take');
      break;

    case 'PASS':
      pushLog(s, playerIndex, '跳过回合', 'pass');
      break;

    case 'RESERVE': {
      let card;
      if (action.source === 'board') {
        const deckKey = `tier${action.tier}`;
        const slots = s.board[deckKey];
        card = slots[action.cardIndex];
        slots[action.cardIndex] = s.decks[deckKey].length > 0 ? s.decks[deckKey].shift() : null;
      } else {
        card = s.decks[`tier${action.tier}`].shift();
      }
      p.reserved.push(card);
      s.gemPool.gold--;
      p.gems.gold++;
      // 预留牌拿到后即正面朝上，属于公开信息，写明是哪张牌
      const fromTop = action.source === 'top';
      pushLog(
        s, playerIndex,
        `${fromTop ? '从牌库顶预留了' : '预留了'} ${cardLabel(card)}，需 ${costLabel(card && card.cost)}，另得 1金`,
        'reserve'
      );
      break;
    }

    case 'BUY': {
      let card;
      if (action.source === 'board') {
        const deckKey = `tier${action.tier}`;
        const slots = s.board[deckKey];
        card = slots[action.cardIndex];
        slots[action.cardIndex] = s.decks[deckKey].length > 0 ? s.decks[deckKey].shift() : null;
      } else {
        const idx = p.reserved.findIndex(c => c.id === action.cardId);
        card = p.reserved[idx];
        p.reserved.splice(idx, 1);
      }

      const payBack = {};
      for (const c of GEM_COLORS) payBack[c] = 0;
      payBack.gold = 0;

      const cardBonus = {};
      for (const c of GEM_COLORS) cardBonus[c] = countColorInCards(p.ownedCards, c);

      for (const color of GEM_COLORS) {
        const need = card.cost[color] || 0;
        if (need === 0) continue;
        const payFromBonus = Math.min(cardBonus[color] || 0, need);
        const gemNeed = need - payFromBonus;
        const payFromGems = Math.min(p.gems[color] || 0, gemNeed);
        p.gems[color] -= payFromGems;
        payBack[color] += payFromGems;
        const goldNeed = gemNeed - payFromGems;
        if (goldNeed > 0) {
          p.gems.gold -= goldNeed;
          payBack.gold += goldNeed;
        }
      }

      for (const color of GEM_COLORS) s.gemPool[color] += payBack[color];
      s.gemPool.gold += payBack.gold;

      p.ownedCards.push(card);
      p.score += (card.vp || 0);

      // 记录：卡面 + 实际付出去的宝石（已扣卡面折扣，黄金顶替的部分单列）
      const payParts = GEM_COLORS.filter(c => (payBack[c] || 0) > 0).map(c => `${payBack[c]}${gemLabel(c)}`);
      if (payBack.gold > 0) payParts.push(`${payBack.gold}金`);
      pushLog(
        s, playerIndex,
        `买了 ${cardLabel(card)}，${payParts.length ? '付 ' + payParts.join('+') : '未付宝石（卡面折扣全抵）'}`,
        'buy'
      );

      // 贵族：按贵族牌自身 vp 字段得分，兼容老数据无 vp 时用规则默认
      const noblesGained = [];
      for (let i = s.nobles.length - 1; i >= 0; i--) {
        const n = s.nobles[i];
        if (canGetNoble(p, n, GEM_COLORS)) {
          s.nobles.splice(i, 1);
          p.nobles.push(n);
          p.score += (n.vp ?? R.NOBLE_SCORE_FALLBACK);
          noblesGained.push(n);
        }
      }
      for (const n of noblesGained) {
        const req = n.req || n;
        const reqDesc = E_GEM_COLORS.filter(c => (req[c] || 0) > 0).map(c => `${req[c]}${gemLabel(c)}`).join('+');
        pushLog(s, playerIndex, `👑 达成 ${reqDesc}，获得贵族卡 +${n.vp ?? R.NOBLE_SCORE_FALLBACK} 分`, 'noble');
      }
      if (noblesGained.length > 0) s._lastNoblesGained = { playerIndex, nobles: noblesGained };
      break;
    }
  }

  // 弃宝石检查（超 MAX_GEMS 进入待弃状态）
  const totalAfter = countGems(p.gems);
  if (totalAfter > R.MAX_GEMS && (action.type === 'TAKE_DIFF' || action.type === 'TAKE_SAME' || action.type === 'RESERVE')) {
    s.pendingDiscard = { playerIndex, count: totalAfter - R.MAX_GEMS };
    s.lastAction = { player: playerIndex, type: action.type, at: Date.now() };
    return s;
  }

  return _advanceTurn(s, playerIndex, action.type, R);
}

function _advanceTurn(s, playerIndex, actionType, R) {
  const p = s.players[playerIndex];

  let nextPlayer = (playerIndex + 1) % s.players.length;
  let nextTurn = s.turn;
  if (nextPlayer === 0) nextTurn = s.turn + 1;

  if (p.score >= R.END_SCORE && !s.endTriggeredBy) {
    s.endTriggeredBy = playerIndex;
    s._endCountdown = s.players.length - 1;
    s._justTriggeredEnd = true;
  }

  if (s.endTriggeredBy !== null && playerIndex !== s.endTriggeredBy) {
    s._endCountdown = (s._endCountdown || 0) - 1;
    if (s._endCountdown <= 0) {
      s.gameOver = true;
      s.phase = 'ended';
      const sorted = [...s.players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.ownedCards.length !== b.ownedCards.length) return a.ownedCards.length - b.ownedCards.length;
        return a.reserved.length - b.reserved.length;
      });
      const topScore = sorted[0].score;
      const topCards = sorted[0].ownedCards.length;
      const topReserved = sorted[0].reserved.length;
      s.winners = sorted
        .filter(p => p.score === topScore && p.ownedCards.length === topCards && p.reserved.length === topReserved)
        .map(p => p.id);
    }
  }

  if (s.gameOver) {
    s.currentPlayer = -1;
  } else {
    s.currentPlayer = nextPlayer;
    s.turn = nextTurn;
  }
  s.lastAction = { player: playerIndex, type: actionType, at: Date.now() };
  return s;
}

export function discardGems(state, playerIndex, color) {
  const R = state._rules || DEFAULT_RULES;
  const s = deepClone(state);
  const p = s.players[playerIndex];
  if (!s.pendingDiscard || s.pendingDiscard.playerIndex !== playerIndex) {
    throw new Error('无需弃宝石');
  }
  if ((p.gems[color] || 0) <= 0) throw new Error('该颜色没有宝石');

  p.gems[color]--;
  s.gemPool[color]++;
  s.pendingDiscard.count--;
  pushDiscardLog(s, playerIndex, color);

  if (s.pendingDiscard.count <= 0) {
    delete s.pendingDiscard;
    return _advanceTurn(s, playerIndex, 'DISCARD', R);
  }
  return s;
}

function canGetNoble(player, noble, gemColors) {
  const ownedCounts = {};
  for (const c of gemColors) ownedCounts[c] = countColorInCards(player.ownedCards, c);
  const req = noble.req || noble;
  for (const c of gemColors) {
    const need = req[c] || 0;
    if (ownedCounts[c] < need) return false;
  }
  return true;
}

// ===== 便捷：生成所有合法动作 =====
export function listValidActions(state, playerIndex) {
  const R = state._rules || DEFAULT_RULES;
  const GEM_COLORS = state._gemColors || E_GEM_COLORS;
  const actions = [];
  const p = state.players[playerIndex];

  const availableColors = GEM_COLORS.filter(c => state.gemPool[c] > 0);
  const combos = [];
  for (let k = R.TAKE_DIFF_MIN; k <= R.TAKE_DIFF_MAX; k++) {
    combos.push(...getCombos(availableColors, k));
  }
  for (const combo of combos) {
    const a = { type: 'TAKE_DIFF', colors: combo };
    if (!validateAction(state, playerIndex, a)) actions.push(a);
  }

  for (const c of GEM_COLORS) {
    if (state.gemPool[c] >= R.SAME_GEM_REQUIREMENT) {
      const a = { type: 'TAKE_SAME', color: c };
      if (!validateAction(state, playerIndex, a)) actions.push(a);
    }
  }

  if (p.reserved.length < R.RESERVED_MAX && state.gemPool.gold >= 1) {
    for (const tier of [1, 2, 3]) {
      const topA = { type: 'RESERVE', source: 'top', tier };
      if (!validateAction(state, playerIndex, topA) && state.decks[`tier${tier}`].length > 0) actions.push(topA);
      state.board[`tier${tier}`].forEach((card, idx) => {
        const a = { type: 'RESERVE', source: 'board', tier, cardIndex: idx };
        if (!validateAction(state, playerIndex, a)) actions.push(a);
      });
    }
  }

  for (const tier of [1, 2, 3]) {
    state.board[`tier${tier}`].forEach((card, idx) => {
      const a = { type: 'BUY', source: 'board', tier, cardIndex: idx };
      if (!validateAction(state, playerIndex, a)) actions.push(a);
    });
  }
  for (const card of p.reserved) {
    const a = { type: 'BUY', source: 'reserved', cardId: card.id };
    if (!validateAction(state, playerIndex, a)) actions.push(a);
  }

  return actions;
}

function getCombos(arr, k) {
  const result = [];
  const n = arr.length;
  if (k > n || k < 1) return result;
  const indices = Array.from({ length: k }, (_, i) => i);
  while (true) {
    result.push(indices.map(i => arr[i]));
    let i = k - 1;
    while (i >= 0 && indices[i] === n - k + i) i--;
    if (i < 0) break;
    indices[i]++;
    for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
  }
  return result;
}
