// 璀璨宝石 AI（贪心策略）
import { listValidActions } from './splendor-engine.js';

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
      // 高分 + 低代价
      const costTotal = Object.values(card.cost).reduce((s, v) => s + v, 0);
      const cardOwned = p.ownedCards.filter(c => c.color === card.color).length;
      // 优先补自己已有的宝石色（连锁效应）
      const synergy = cardOwned * 0.3;
      return (card.vp || 0) * 3 + (5 - costTotal) * 0.1 + synergy + (card.tier - 1) * 0.5;
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
      // 黄金只在必要时才拿（通过 reserve），这里不算
      return score * 0.5;
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
