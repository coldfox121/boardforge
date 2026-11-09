// 璀璨宝石 AI（启发式贪心 + 拿取数量感知）
// 关键改进：拿宝石的评分要随"实际拿到几颗"上升，否则会和只看有用颜色数量的旧版打平，
// 导致平局时选到动作列表里靠前的单颗动作。
import { listValidActions } from './splendor-engine.js?v=35';
import { GEM_COLORS } from './splendor-data.js?v=35';

const COLORS = GEM_COLORS;

function totalGems(p) {
  return COLORS.reduce((s, c) => s + (p.gems[c] || 0), 0) + (p.gems.gold || 0);
}

// 某色的有效资源 = 宝石 + 同色卡面加成
function effective(p, color) {
  return (p.gems[color] || 0) + p.ownedCards.reduce((s, c) => s + (c.color === color ? 1 : 0), 0);
}

// 买这张卡还差几颗宝石（不折算黄金）
function gemDeficit(p, card) {
  let d = 0;
  for (const c of COLORS) d += Math.max(0, (card.cost[c] || 0) - effective(p, c));
  return d;
}

// 所有可买目标：场上 + 自己预留
function targetCards(state, p) {
  const out = [];
  for (const tier of [1, 2, 3]) {
    for (const card of state.board[`tier${tier}`] || []) {
      if (card) out.push(card);
    }
  }
  for (const card of p.reserved) out.push(card);
  return out;
}

// 需求向量：只盯最接近买得起的 3 张卡，统计各色还缺多少
function demandVector(state, p) {
  const demand = {};
  for (const c of COLORS) demand[c] = 0;

  const focus = targetCards(state, p)
    .map(card => ({ card, deficit: gemDeficit(p, card) }))
    .sort((a, b) => a.deficit - b.deficit)
    .slice(0, 3);

  for (const { card } of focus) {
    for (const c of COLORS) {
      demand[c] += Math.max(0, (card.cost[c] || 0) - effective(p, c));
    }
  }
  // 单色需求按 3 封顶（一回合最多拿 2 同色，囤更多没意义）
  for (const c of COLORS) demand[c] = Math.min(demand[c], 3);
  return demand;
}

// 买这张卡能推进多少贵族进度
function nobleValue(state, p, card) {
  if (!state.nobles || state.nobles.length === 0) return 0;
  let value = 0;
  for (const noble of state.nobles) {
    const req = noble.req || noble;
    let met = 0, total = 0, newlyMet = false;
    for (const c of COLORS) {
      if (!req[c]) continue;
      total++;
      const before = effective(p, c);
      const after = before + (card.color === c ? 1 : 0);
      if (after >= req[c]) {
        met++;
        if (before < req[c]) newlyMet = true;
      }
    }
    if (total === 0) continue;
    if (met === total) value += 12;               // 买完直接拿贵族
    else value += (met / total) * 2 + (newlyMet ? 1 : 0);
  }
  return value;
}

// 对手分数越高，越值得针对
function opponentWeight(op) {
  return 1 + Math.max(0, op.score || 0) / 12;
}

// 对手"就差一点能买"的卡，用于抢买 / 预留封锁
function opponentHotCards(state, playerIndex) {
  const hot = [];
  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIndex) continue;
    const op = state.players[i];
    const weight = opponentWeight(op);
    for (const card of targetCards(state, op)) {
      const deficit = gemDeficit(op, card);
      const payable = deficit <= (op.gems.gold || 0);   // 对手现在就能买
      if (deficit > 3 && !payable) continue;
      hot.push({ card, deficit, payable, weight, opponentIndex: i });
    }
  }
  return hot;
}

// 对手在各色上的"渴求值"，用于抢宝石卡位
function opponentNeedColors(state, playerIndex) {
  const need = {};
  for (const c of COLORS) need[c] = 0;

  for (let i = 0; i < state.players.length; i++) {
    if (i === playerIndex) continue;
    const op = state.players[i];
    const weight = opponentWeight(op);
    for (const card of targetCards(state, op)) {
      const deficit = gemDeficit(op, card);
      if (deficit > 3) continue;
      const urgency = (4 - deficit) * Math.max(1, card.vp || 0) * weight;
      for (const c of COLORS) {
        if ((card.cost[c] || 0) > effective(op, c)) need[c] += urgency;
      }
    }
  }
  return need;
}

function scoreAction(state, action, playerIndex, ctx) {
  const p = state.players[playerIndex];

  switch (action.type) {
    case 'BUY': {
      let card;
      if (action.source === 'board') card = state.board[`tier${action.tier}`][action.cardIndex];
      else card = p.reserved.find(c => c.id === action.cardId);
      if (!card) return -99999;

      const sameColor = p.ownedCards.reduce((s, c) => s + (c.color === card.color ? 1 : 0), 0);
      // 抢走对手马上能买的牌 = 直接卡位
      const hot = ctx.hot.find(h => h.card.id === card.id);
      const deny = hot ? (hot.payable ? 160 : 40) * hot.weight : 0;

      // 买卡是唯一得分手段，远高于拿宝石
      return 1000
        + (card.vp || 0) * 80
        + sameColor * 6
        + nobleValue(state, p, card) * 10
        + deny;
    }

    case 'RESERVE': {
      if (action.source === 'top') return 3;      // 盲抽牌堆最不优先

      const card = state.board[`tier${action.tier}`][action.cardIndex];
      if (!card) return -99999;

      const deficit = gemDeficit(p, card);
      // VP 权重不能太高，否则开局会连着锁 3 张大牌、完全不拿宝石
      let score = 6 + (card.vp || 0) * 4;

      if (deficit <= 2) score += 16;                                  // 快买得起了，先锁
      else if (deficit <= 4) score += 6;

      // 封锁：对手马上能买的牌，留给自己/断他财路
      const hot = ctx.hot.find(h => h.card.id === card.id);
      if (hot) score += (hot.payable ? 55 : 18) * hot.weight;

      if ((p.gems.gold || 0) < 3) score += 4;                         // 顺带拿黄金

      // 预留槽是稀缺资源（最多 3 个），已经锁了就别再乱锁
      if (p.reserved.length >= 2) score -= 15;
      if (p.reserved.length >= 3) score -= 40;

      return score;
    }

    case 'TAKE_DIFF':
    case 'TAKE_SAME': {
      const take = action.type === 'TAKE_DIFF'
        ? action.colors.slice()
        : [action.color, action.color];

      const remaining = { ...ctx.demand };
      let score = 0;
      for (const c of take) {
        if (remaining[c] > 0) { score += 11; remaining[c]--; }
        else score += 1.5;   // 需求外的宝石仍有保值 / 卡位价值
        // 卡位：抢走对手急需的颜色
        score += Math.min(9, (ctx.opponentNeed[c] || 0) * 0.5);
      }
      // 数量奖励：能拿 3 颗就尽量拿 3 颗（10 颗上限由引擎保证）
      score += take.length * 5;

      // 快到 10 颗了，别拿太满，留空间给黄金
      if (totalGems(p) + take.length > 9) score -= 6;

      return score;
    }
  }
  return 0;
}

// 返回最佳动作
export function pickAction(state, playerIndex) {
  const actions = listValidActions(state, playerIndex);
  if (actions.length === 0) return null;
  if (actions.length === 1) return actions[0];

  const p = state.players[playerIndex];
  const ctx = {
    demand: demandVector(state, p),
    hot: opponentHotCards(state, playerIndex),
    opponentNeed: opponentNeedColors(state, playerIndex),
  };

  let bestA = actions[0];
  let bestScore = scoreAction(state, actions[0], playerIndex, ctx);
  for (let i = 1; i < actions.length; i++) {
    const s = scoreAction(state, actions[i], playerIndex, ctx);
    if (s > bestScore) { bestScore = s; bestA = actions[i]; }
  }
  return bestA;
}
