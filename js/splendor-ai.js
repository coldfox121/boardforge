// 璀璨宝石 AI（贪心策略）
import { listValidActions } from './splendor-engine.js?v=15';

// 评估动作"值不值"，分数越高越优先
function scoreAction(state, action, playerIndex) {
  const p = state.players[playerIndex];

  switch (action.type) {
    case 'BUY': {
      // 买卡是唯一得分手段，只要买得起就必须买，优先级远高于拿宝石
      let card;
      if (action.source === 'board') card = state.board[`tier${action.tier}`][action.cardIndex];
      else card = p.reserved.find(c => c.id === action.cardId);
      if (!card) return -9999;
      const cardOwned = p.ownedCards.filter(c => c.color === card.color).length;
      // 同一次能买多张时：vp 越高越优先，同色联动加分
      return 100 + (card.vp || 0) * 10 + cardOwned * 0.5;
    }
    case 'RESERVE': {
      // 预留一般不优先，除非紧急缺
      return 0.5;
    }
    case 'TAKE_DIFF':
    case 'TAKE_SAME': {
      // 只补"最接近买得起"的卡的缺口，避免盲囤
      const needed = computeNeeded(state, playerIndex);
      let score = 0;
      const takeColors = action.type === 'TAKE_DIFF' ? action.colors : [action.color];
      for (const c of takeColors) score += needed[c] || 0;
      return score * 0.5;
    }
  }
  return 0;
}

// 找当前最接近买得起的目标卡，只统计这些卡的缺口
function computeNeeded(state, playerIndex) {
  const p = state.players[playerIndex];
  const COLORS = ['white', 'blue', 'green', 'red', 'black'];
  const needed = {};
  for (const c of COLORS) needed[c] = 0;

  const candidates = [];
  for (const tier of [1, 2, 3]) {
    for (const card of state.board[`tier${tier}`]) {
      if (!card) continue;
      let deficit = 0;
      for (const c of COLORS) {
        const cost = card.cost[c] || 0;
        const have = (p.gems[c] || 0) + p.ownedCards.filter(o => o.color === c).length;
        deficit += Math.max(0, cost - have);
      }
      candidates.push({ card, deficit });
    }
  }
  candidates.sort((a, b) => a.deficit - b.deficit);

  // 只盯最接近的 2 张卡，集中财力
  for (const { card } of candidates.slice(0, 2)) {
    for (const c of COLORS) {
      const cost = card.cost[c] || 0;
      const have = (p.gems[c] || 0) + p.ownedCards.filter(o => o.color === c).length;
      needed[c] += Math.max(0, cost - have);
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
