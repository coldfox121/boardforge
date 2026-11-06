// 璀璨宝石 · 游戏引擎（纯函数，输入 state + action → 输出 newState）
// 不含网络 / 渲染 / IO — 好测、好挂联机

import { CARDS, NOBLES, GEM_COLORS } from './splendor-data.js';
import { loadAdminData } from './admin.js';

// 应用 admin 覆盖（引擎模块加载时一次性）
const _admin = (typeof localStorage !== 'undefined') ? loadAdminData('splendor') : null;
const E_CARDS = _admin?.CARDS || CARDS;
const E_NOBLES = _admin?.NOBLES || NOBLES;
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
function canAfford(gems, cost, cardBonus) {
  // 用黄金补缺口，cardBonus 是已持有的卡面宝石（可抵对应颜色）
  let needGold = 0;
  for (const color of GEM_COLORS) {
    const need = cost[color] || 0;
    const have = (gems[color] || 0) + (cardBonus[color] || 0);
    if (have < need) needGold += (need - have);
  }
  // 检查黄金够不够 + 手牌上限（预留槽）
  if (needGold > (gems.gold || 0)) return false;
  // 买卡后宝石总数减 needGold + 剩余 ≤ 10（回合结束检查）
  return true;
}

// ===== 游戏初始化 =====
// playerNames: ['P1','P2'] 或 ['P1','P2','P3','P4']
export function initGame(playerNames) {
  const n = playerNames.length;
  if (n < 2 || n > 4) throw new Error('玩家数必须 2-4');

  // 初始设置（按官方规则）
  const setup = {
    2: { gemsPerColor: 4, nobles: 3 },
    3: { gemsPerColor: 5, nobles: 4 },
    4: { gemsPerColor: 7, nobles: 5 }
  }[n];

  // 洗牌
  const tier1 = shuffle(E_CARDS[1].map(c => ({ ...c })));
  const tier2 = shuffle(E_CARDS[2].map(c => ({ ...c })));
  const tier3 = shuffle(E_CARDS[3].map(c => ({ ...c })));

  // 场上各翻 4 张
  const board = {
    tier1: tier1.splice(0, 4),
    tier2: tier2.splice(0, 4),
    tier3: tier3.splice(0, 4)
  };

  // 宝石堆
  const gemPool = {};
  for (const c of GEM_COLORS) gemPool[c] = setup.gemsPerColor;
  gemPool.gold = 5;

  // 贵族翻出
  const nobleDeck = shuffle(E_NOBLES.map(n => ({ ...n })));
  const nobles = nobleDeck.splice(0, setup.nobles);

  // 玩家
  const players = playerNames.map((name, i) => ({
    id: i,
    name,
    isAI: false,
    // 手里的宝石
    gems: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
    // 持有（购买）的卡：从这里永久产出宝石
    ownedCards: [],
    // 预留槽（最多 3 张）
    reserved: [],
    // 已获得贵族
    nobles: [],
    // 当前分数（卡 vp + 贵族 vp）
    score: 0
  }));

  return {
    version: 1,
    phase: 'playing', // playing | finalRound | ended
    currentPlayer: 0,
    lastAction: null,
    turn: 1,
    gameOver: false,
    winners: [],
    // 牌堆（剩余）
    decks: { tier1, tier2, tier3 },
    // 场上翻出的
    board,
    // 宝石堆
    gemPool,
    // 贵族图板
    nobles,
    // 玩家
    players,
    // 触发终局的玩家 index（触发后其他人走最后一轮）
    endTriggeredBy: null,
    endLastRound: false,
    _endCountdown: 0,
    _justTriggeredEnd: false
  };
}

// ===== 动作校验（返回错误信息或 null）=====
// actions:
// { type: 'TAKE_DIFF', colors: ['red','green','blue'] }
// { type: 'TAKE_SAME', color: 'red' }
// { type: 'RESERVE', source: 'board'|'top', tier: 1, cardIndex: 0|null }
// { type: 'BUY', source: 'board'|'reserved', tier: 1, cardIndex: 0|null, cardId: null }
export function validateAction(state, playerIndex, action) {
  const p = state.players[playerIndex];
  if (!p) return '玩家不存在';
  if (state.gameOver) return '游戏已结束';
  if (state.currentPlayer !== playerIndex) return '不是你的回合';

  switch (action.type) {
    case 'TAKE_DIFF': {
      if (!action.colors || action.colors.length < 1 || action.colors.length > 3) return '不同色最多拿 3 颗';
      const set = new Set(action.colors);
      if (set.size !== action.colors.length) return '不能有重复颜色';
      if (action.colors.some(c => !GEM_COLORS.includes(c))) return '颜色无效';
      if (action.colors.some(c => state.gemPool[c] < 1)) return '某颜色宝石不足';
      // 回合结束必须 ≤10 颗
      const after = countGems(p.gems) + action.colors.length;
      if (after > 10) return `拿完会超 10 颗（当前 ${countGems(p.gems)}，拿 ${action.colors.length} 颗后 ${after}）`;
      return null;
    }
    case 'TAKE_SAME': {
      if (!GEM_COLORS.includes(action.color)) return '颜色无效';
      if (state.gemPool[action.color] < 4) return '该色剩余不足 4 颗';
      // 回合结束必须 ≤10 颗
      const after = countGems(p.gems) + 2;
      if (after > 10) return `拿完会超 10 颗（当前 ${countGems(p.gems)}，拿 2 颗后 ${after}）`;
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
      if (p.reserved.length >= 3) return '预留槽已满（最多 3 张）';
      const after = countGems(p.gems) + 1;
      if (after > 10) return `拿完黄金会超 10 颗（当前 ${countGems(p.gems)}）`;
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
      // 检查能不能买
      const cardBonus = {};
      for (const c of GEM_COLORS) cardBonus[c] = countColorInCards(p.ownedCards, c);
      // 模拟：用宝石+卡面+黄金能否覆盖
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
    default:
      return `未知动作类型: ${action.type}`;
  }
}

function countColorInCards(cards, color) {
  return cards.reduce((s, c) => s + (c.color === color ? 1 : 0), 0);
}

// ===== 执行动作（纯函数，返回新 state）=====
export function applyAction(state, playerIndex, action) {
  const err = validateAction(state, playerIndex, action);
  if (err) throw new Error(err);

  const s = deepClone(state);
  const p = s.players[playerIndex];
  p.isAI = p.isAI; // 保持标记

  switch (action.type) {
    case 'TAKE_DIFF':
      action.colors.forEach(c => { s.gemPool[c]--; p.gems[c]++; });
      break;

    case 'TAKE_SAME':
      s.gemPool[action.color] -= 2;
      p.gems[action.color] += 2;
      break;

    case 'RESERVE': {
      let card;
      if (action.source === 'board') {
        card = s.board[`tier${action.tier}`][action.cardIndex];
        s.board[`tier${action.tier}`].splice(action.cardIndex, 1);
        // 补一张（如果牌堆还有）
        const deckKey = `tier${action.tier}`;
        if (s.decks[deckKey].length > 0) {
          s.board[deckKey].push(s.decks[deckKey].shift());
        }
      } else {
        card = s.decks[`tier${action.tier}`].shift();
      }
      // 标记预留卡（后续移走时用）
      card._reservedSource = action.source;
      p.reserved.push(card);
      // 拿 1 颗黄金
      s.gemPool.gold--;
      p.gems.gold++;
      break;
    }

    case 'BUY': {
      let card;
      if (action.source === 'board') {
        card = s.board[`tier${action.tier}`][action.cardIndex];
        s.board[`tier${action.tier}`].splice(action.cardIndex, 1);
        // 补一张
        const deckKey = `tier${action.tier}`;
        if (s.decks[deckKey].length > 0) {
          s.board[deckKey].push(s.decks[deckKey].shift());
        }
      } else {
        // reserved → 从玩家预留区移除
        const idx = p.reserved.findIndex(c => c.id === action.cardId);
        card = p.reserved[idx];
        p.reserved.splice(idx, 1);
      }

      // 支付（卡面宝石先抵 → 玩家宝石 → 黄金补缺口）
      // 注意：卡面宝石是玩家永久资产，不归还公共池
      const payBack = { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 };
      const cardBonus = {};
      for (const c of GEM_COLORS) cardBonus[c] = countColorInCards(p.ownedCards, c);

      for (const color of GEM_COLORS) {
        const need = card.cost[color] || 0;
        if (need === 0) continue;
        // 1. 卡面宝石先抵（不归还池，已是玩家资产）
        const payFromBonus = Math.min(cardBonus[color] || 0, need);
        const gemNeed = need - payFromBonus;
        // 2. 玩家宝石补
        const payFromGems = Math.min(p.gems[color] || 0, gemNeed);
        p.gems[color] -= payFromGems;
        payBack[color] += payFromGems;
        // 3. 黄金补最后缺口
        const goldNeed = gemNeed - payFromGems;
        if (goldNeed > 0) {
          p.gems.gold -= goldNeed;
          payBack.gold += goldNeed;
        }
      }

      // === 关键：支付的宝石全部归还公共资源池 ===
      for (const color of GEM_COLORS) s.gemPool[color] += payBack[color];
      s.gemPool.gold += payBack.gold;

      // 卡加入手牌
      p.ownedCards.push(card);

      // 更新分数（卡 vp）
      p.score += (card.vp || 0);

      // 贵族检查（是否满足条件）
      const noblesGained = [];
      for (let i = s.nobles.length - 1; i >= 0; i--) {
        const n = s.nobles[i];
        if (canGetNoble(p, n)) {
          s.nobles.splice(i, 1);
          p.nobles.push(n);
          p.score += 3;
          noblesGained.push(n);
        }
      }
      if (noblesGained.length > 0) s._lastNoblesGained = { playerIndex, nobles: noblesGained };
      break;
    }
  }

  // ===== 回合结束：检查终局 =====
  // 公平轮规则：有人达 15 分后，其他人各补走一轮（触发者本轮已走完）→ 所有人总轮数相同才结束
  let nextPlayer = (playerIndex + 1) % s.players.length;
  let nextTurn = s.turn;
  if (nextPlayer === 0) nextTurn = s.turn + 1;

  // 本轮刚触发终局（新有人到 15 分）
  const pScoreNow = p.score;
  if (pScoreNow >= 15 && !s.endTriggeredBy) {
    s.endTriggeredBy = playerIndex;
    // 触发者本轮已走完，其他人各补一轮 = players.length - 1 步
    s._endCountdown = s.players.length - 1;
    s._justTriggeredEnd = true;
  }

  // 公平轮倒计时：**只有非触发者**走完才 -1（触发者本轮的步已算进去）
  if (s.endTriggeredBy !== null && playerIndex !== s.endTriggeredBy) {
    s._endCountdown = (s._endCountdown || 0) - 1;
    if (s._endCountdown <= 0) {
      s.gameOver = true;
      s.phase = 'ended';
      const sorted = [...s.players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.ownedCards.length - a.ownedCards.length;
      });
      const top = sorted[0].score;
      s.winners = sorted.filter(p => p.score === top).map(p => p.id);
    }
  }

  if (s.gameOver) {
    s.currentPlayer = -1;
  } else {
    s.currentPlayer = nextPlayer;
    s.turn = nextTurn;
  }
  s.lastAction = { player: playerIndex, type: action.type, at: Date.now() };
  return s;
}

function canGetNoble(player, noble) {
  // 统计玩家持有的各颜色卡数
  const ownedCounts = {};
  for (const c of GEM_COLORS) ownedCounts[c] = countColorInCards(player.ownedCards, c);
  // 满足贵族条件（注意数据结构是 noble.req）
  const req = noble.req || noble; // 兼容老数据
  for (const c of GEM_COLORS) {
    const need = req[c] || 0;
    if (ownedCounts[c] < need) return false;
  }
  return true;
}

// ===== 便捷：生成所有合法动作（供 AI 使用）=====
export function listValidActions(state, playerIndex) {
  const actions = [];
  const p = state.players[playerIndex];

  // 1) TAKE_DIFF：3 种不同色宝石
  const availableColors = GEM_COLORS.filter(c => state.gemPool[c] > 0);
  const combos = get3Combos(availableColors);
  for (const combo of combos) {
    const a = { type: 'TAKE_DIFF', colors: combo };
    if (!validateAction(state, playerIndex, a)) actions.push(a);
  }

  // 2) TAKE_SAME：某色剩余 ≥4
  for (const c of GEM_COLORS) {
    if (state.gemPool[c] >= 4) {
      const a = { type: 'TAKE_SAME', color: c };
      if (!validateAction(state, playerIndex, a)) actions.push(a);
    }
  }

  // 3) RESERVE（如果还有槽且有黄金）
  if (p.reserved.length < 3 && state.gemPool.gold >= 1) {
    for (const tier of [1, 2, 3]) {
      // top of deck
      const topA = { type: 'RESERVE', source: 'top', tier };
      if (!validateAction(state, playerIndex, topA) && state.decks[`tier${tier}`].length > 0) actions.push(topA);
      // board cards
      state.board[`tier${tier}`].forEach((card, idx) => {
        const a = { type: 'RESERVE', source: 'board', tier, cardIndex: idx };
        if (!validateAction(state, playerIndex, a)) actions.push(a);
      });
    }
  }

  // 4) BUY
  // from board
  for (const tier of [1, 2, 3]) {
    state.board[`tier${tier}`].forEach((card, idx) => {
      const a = { type: 'BUY', source: 'board', tier, cardIndex: idx };
      if (!validateAction(state, playerIndex, a)) actions.push(a);
    });
  }
  // from reserved
  for (const card of p.reserved) {
    const a = { type: 'BUY', source: 'reserved', cardId: card.id };
    if (!validateAction(state, playerIndex, a)) actions.push(a);
  }

  return actions;
}

function get3Combos(arr) {
  const result = [];
  for (let i = 0; i < arr.length - 2; i++)
    for (let j = i + 1; j < arr.length - 1; j++)
      for (let k = j + 1; k < arr.length; k++)
        result.push([arr[i], arr[j], arr[k]]);
  return result;
}
