// 璀璨宝石 AI（贪心策略）
import { listValidActions } from './splendor-engine.js?v=13';

// 评估动作"值不值"，分数越高越优先
function scoreAction(state, action, playerIndex) {
  const p = state.players[playerIndex];

  switch (action.type) {
    case 'BUY': {
      // 能买卡优先，vp 越高越好
      let card;
      if (action.source === 'board') card = state.board[`tier${action.tier}`][action.cardIndex];
      else card = p.reserved.find(c => c.id === action.cardId);
      if (!card) return -9999;
      const costTotal = Object.values(card.cost).reduce((s, v) => s + v, 0);
      const cardOwned = p.ownedCards.filter(c => c.color === card.color).length;
      // 买卡的核心价值 = vp分数 + 宝石折扣价值（每买一张该色卡，未来该色花费-1） + 连锁效应
      const vpScore = (card.vp || 0) * 3;
      const discountValue = 3;       // 每张卡提供的宝石折扣基础价值
      const synergy = cardOwned * 0.5; // 已有同色卡越多，连锁越强
      const costPenalty = costTotal * 0.05; // 轻微的代价惩罚
      return vpScore + discountValue + synergy - costPenalty;
    }
    case 'RESERVE': {
      // 预留一般不优先，除非紧急缺
      return 0.5;
    }
    case 'TAKE_DIFF':
    case 'TAKE_SAME': {
      // 看当前最缺什么，拿什么补
      const needed = computeNeeded(state, playerIndex);
      let score = 0;
      const takeColors = action.type === 'TAKE_DIFF' ? action.colors : [action.color];
      for (const c of takeColors) score += needed[c] || 0;
      // 权重降低，让买卡更有竞争力
      return score * 0.2;
    }
  }
  return 0;
}

// 看买什么卡最急缺对应颜色
function computeNeeded(state, playerIndex) {
  const p = state.players[playerIndex];
  const needed = {};
  for (const c of ['white','blue','green','red','black']) needed[c] = 0;

  // 场上所有可买的卡，累计缺的颜色
  for (const tier of [1,2,3]) {
    for (const card of state.board[`tier${tier}`]) {
      if (!card) continue;
      for (const c of ['white','blue','green','red','black']) {
        const cost = card.cost[c] || 0;
        // 已有卡面产出
        const owned = p.ownedCards.filter(o => o.color === c).length;
        const have = (p.gems[c] || 0) + owned;
        needed[c] += Math.max(0, cost - have);
      }
    }
  }
  return needed;
}

// 返回最佳动作
export function pickAction(state, playerIndex) {
  const actions = listValidActions(state, playerIndex);
  if (actions.length === 0) return null;
  if (actions.length === 1) return actions[0];

  let bestA = actions[0];
  let bestScore = scoreAction(state, actions[0], playerIndex);
  for (let i = 1; i < actions.length; i++) {
    const s = scoreAction(state, actions[i], playerIndex);
    if (s > bestScore) { bestScore = s; bestA = actions[i]; }
  }
  return bestA;
}
