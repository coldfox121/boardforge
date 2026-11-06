// 璀璨宝石完整数据
// 基于官方牌库，每张卡：产出宝石色、消耗五色宝石量、等级、分数
// 数据来源：Splendor-AI (GitHub) + Splendor Explorer (kafagoz.com)

// 宝石色常量
export const GEM_COLORS = ['white', 'blue', 'green', 'red', 'black'];
export const GEM_NAMES = {
  white: '钻石',
  blue: '蓝宝石',
  green: '祖母绿',
  red: '红宝石',
  black: '玛瑙',
  gold: '黄金'
};

// 90张发展卡（按等级分组，顺序即为牌堆顺序）
export const CARDS = {
  1: [
    // 等级1（40张）
    { id: '1-01', color: 'black', cost: { green: 1, white: 1, red: 1, blue: 1 }, tier: 1, vp: 0 },
    { id: '1-02', color: 'black', cost: { green: 1, white: 1, red: 1, blue: 2 }, tier: 1, vp: 0 },
    { id: '1-03', color: 'black', cost: { blue: 2, red: 1, white: 2 }, tier: 1, vp: 0 },
    { id: '1-04', color: 'black', cost: { green: 2, red: 1 }, tier: 1, vp: 0 },
    { id: '1-05', color: 'black', cost: { white: 2, green: 2 }, tier: 1, vp: 0 },
    { id: '1-06', color: 'black', cost: { green: 3 }, tier: 1, vp: 0 },
    { id: '1-07', color: 'black', cost: { red: 3, black: 1, green: 1 }, tier: 1, vp: 0 },
    { id: '1-08', color: 'black', cost: { blue: 4 }, tier: 1, vp: 1 },

    { id: '1-09', color: 'blue', cost: { red: 1, white: 1, black: 1, green: 1 }, tier: 1, vp: 0 },
    { id: '1-10', color: 'blue', cost: { white: 1, black: 2 }, tier: 1, vp: 0 },
    { id: '1-11', color: 'blue', cost: { green: 1, red: 1, black: 1, green: 1 }, tier: 1, vp: 0 }, // fix duplicate
    { id: '1-12', color: 'blue', cost: { green: 1, red: 1, black: 2 }, tier: 1, vp: 0 },
    { id: '1-13', color: 'blue', cost: { white: 2, red: 2 }, tier: 1, vp: 0 },
    { id: '1-14', color: 'blue', cost: { white: 2, black: 2 }, tier: 1, vp: 0 },
    { id: '1-15', color: 'blue', cost: { white: 2, blue: 2 }, tier: 1, vp: 0 },
    { id: '1-16', color: 'blue', cost: { black: 4 }, tier: 1, vp: 1 },

    { id: '1-17', color: 'white', cost: { blue: 1, red: 1, black: 1, green: 1 }, tier: 1, vp: 0 },
    { id: '1-18', color: 'white', cost: { red: 1, black: 1, green: 2 }, tier: 1, vp: 0 },
    { id: '1-19', color: 'white', cost: { red: 2, green: 2 }, tier: 1, vp: 0 },
    { id: '1-20', color: 'white', cost: { red: 2, blue: 1 }, tier: 1, vp: 0 },
    { id: '1-21', color: 'white', cost: { red: 3, blue: 1 }, tier: 1, vp: 0 },
    { id: '1-22', color: 'white', cost: { blue: 2, black: 2 }, tier: 1, vp: 0 },
    { id: '1-23', color: 'white', cost: { red: 3 }, tier: 1, vp: 0 },
    { id: '1-24', color: 'white', cost: { red: 4 }, tier: 1, vp: 1 },

    { id: '1-25', color: 'green', cost: { white: 1, blue: 1, red: 1, black: 1 }, tier: 1, vp: 0 },
    { id: '1-26', color: 'green', cost: { blue: 1, black: 1, red: 2 }, tier: 1, vp: 0 },
    { id: '1-27', color: 'green', cost: { blue: 2, black: 2 }, tier: 1, vp: 0 },
    { id: '1-28', color: 'green', cost: { blue: 2, white: 1 }, tier: 1, vp: 0 },
    { id: '1-29', color: 'green', cost: { black: 2, white: 1 }, tier: 1, vp: 0 },
    { id: '1-30', color: 'green', cost: { red: 2, white: 2 }, tier: 1, vp: 0 },
    { id: '1-31', color: 'green', cost: { blue: 3 }, tier: 1, vp: 0 },
    { id: '1-32', color: 'green', cost: { blue: 4 }, tier: 1, vp: 1 },

    { id: '1-33', color: 'red', cost: { white: 1, blue: 1, green: 1, black: 1 }, tier: 1, vp: 0 },
    { id: '1-34', color: 'red', cost: { white: 1, green: 1, blue: 2 }, tier: 1, vp: 0 },
    { id: '1-35', color: 'red', cost: { white: 2, blue: 2 }, tier: 1, vp: 0 },
    { id: '1-36', color: 'red', cost: { white: 2, green: 1 }, tier: 1, vp: 0 },
    { id: '1-37', color: 'red', cost: { white: 3, black: 1 }, tier: 1, vp: 0 },
    { id: '1-38', color: 'red', cost: { black: 2, green: 2 }, tier: 1, vp: 0 },
    { id: '1-39', color: 'red', cost: { white: 3 }, tier: 1, vp: 0 },
    { id: '1-40', color: 'red', cost: { white: 4 }, tier: 1, vp: 1 }
  ],

  2: [
    // 等级2（30张）
    { id: '2-01', color: 'black', cost: { white: 2, blue: 2, green: 3 }, tier: 2, vp: 1 },
    { id: '2-02', color: 'black', cost: { red: 3, blue: 2, green: 3 }, tier: 2, vp: 1 },
    { id: '2-03', color: 'black', cost: { green: 4, red: 2, blue: 1 }, tier: 2, vp: 2 },
    { id: '2-04', color: 'black', cost: { green: 5, red: 3 }, tier: 2, vp: 2 },
    { id: '2-05', color: 'black', cost: { white: 5, green: 3 }, tier: 2, vp: 2 },
    { id: '2-06', color: 'black', cost: { red: 6 }, tier: 2, vp: 3 },

    { id: '2-07', color: 'blue', cost: { green: 2, white: 2, black: 3 }, tier: 2, vp: 1 },
    { id: '2-08', color: 'blue', cost: { red: 3, white: 2, black: 3 }, tier: 2, vp: 1 },
    { id: '2-09', color: 'blue', cost: { white: 5, green: 3 }, tier: 2, vp: 2 },
    { id: '2-10', color: 'blue', cost: { white: 4, black: 1, red: 2 }, tier: 2, vp: 2 },
    { id: '2-11', color: 'blue', cost: { black: 5 }, tier: 2, vp: 2 },
    { id: '2-12', color: 'blue', cost: { white: 6 }, tier: 2, vp: 3 },

    { id: '2-13', color: 'white', cost: { black: 2, blue: 3, red: 2 }, tier: 2, vp: 1 },
    { id: '2-14', color: 'white', cost: { green: 3, black: 3, red: 2 }, tier: 2, vp: 1 },
    { id: '2-15', color: 'white', cost: { black: 4, green: 2, red: 1 }, tier: 2, vp: 2 },
    { id: '2-16', color: 'white', cost: { black: 5, blue: 3 }, tier: 2, vp: 2 },
    { id: '2-17', color: 'white', cost: { black: 5 }, tier: 2, vp: 2 },
    { id: '2-18', color: 'white', cost: { black: 6 }, tier: 2, vp: 3 },

    { id: '2-19', color: 'green', cost: { blue: 2, red: 2, black: 3 }, tier: 2, vp: 1 },
    { id: '2-20', color: 'green', cost: { red: 2, black: 3, blue: 2 }, tier: 2, vp: 1 },
    { id: '2-21', color: 'green', cost: { blue: 3, black: 3, red: 1 }, tier: 2, vp: 2 },
    { id: '2-22', color: 'green', cost: { red: 5, black: 3 }, tier: 2, vp: 2 },
    { id: '2-23', color: 'green', cost: { red: 5 }, tier: 2, vp: 2 },
    { id: '2-24', color: 'green', cost: { red: 6 }, tier: 2, vp: 3 },

    { id: '2-25', color: 'red', cost: { black: 3, blue: 2, white: 2 }, tier: 2, vp: 1 },
    { id: '2-26', color: 'red', cost: { black: 3, blue: 3, white: 2 }, tier: 2, vp: 1 },
    { id: '2-27', color: 'red', cost: { white: 4, black: 2, blue: 1 }, tier: 2, vp: 2 },
    { id: '2-28', color: 'red', cost: { white: 5, green: 3 }, tier: 2, vp: 2 },
    { id: '2-29', color: 'red', cost: { white: 5 }, tier: 2, vp: 2 },
    { id: '2-30', color: 'red', cost: { white: 6 }, tier: 2, vp: 3 }
  ],

  3: [
    // 等级3（20张）
    { id: '3-01', color: 'black', cost: { white: 3, blue: 5, red: 3, green: 3 }, tier: 3, vp: 3 },
    { id: '3-02', color: 'black', cost: { blue: 7 }, tier: 3, vp: 4 },
    { id: '3-03', color: 'black', cost: { white: 3, blue: 3, green: 6 }, tier: 3, vp: 4 },
    { id: '3-04', color: 'black', cost: { white: 3, red: 7 }, tier: 3, vp: 5 },

    { id: '3-05', color: 'blue', cost: { green: 5, white: 3, black: 3, red: 3 }, tier: 3, vp: 3 },
    { id: '3-06', color: 'blue', cost: { green: 7 }, tier: 3, vp: 4 },
    { id: '3-07', color: 'blue', cost: { black: 3, green: 3, red: 6 }, tier: 3, vp: 4 },
    { id: '3-08', color: 'blue', cost: { red: 3, black: 7 }, tier: 3, vp: 5 },

    { id: '3-09', color: 'white', cost: { black: 3, blue: 3, green: 3, red: 5 }, tier: 3, vp: 3 },
    { id: '3-10', color: 'white', cost: { red: 7 }, tier: 3, vp: 4 },
    { id: '3-11', color: 'white', cost: { red: 3, black: 3, green: 6 }, tier: 3, vp: 4 },
    { id: '3-12', color: 'white', cost: { red: 3, green: 7 }, tier: 3, vp: 5 },

    { id: '3-13', color: 'green', cost: { blue: 3, black: 3, red: 3, white: 5 }, tier: 3, vp: 3 },
    { id: '3-14', color: 'green', cost: { black: 7 }, tier: 3, vp: 4 },
    { id: '3-15', color: 'green', cost: { black: 6, red: 3, blue: 3 }, tier: 3, vp: 4 },
    { id: '3-16', color: 'green', cost: { black: 3, blue: 7 }, tier: 3, vp: 5 },

    { id: '3-17', color: 'red', cost: { white: 3, green: 5, black: 3, blue: 3 }, tier: 3, vp: 3 },
    { id: '3-18', color: 'red', cost: { white: 7 }, tier: 3, vp: 4 },
    { id: '3-19', color: 'red', cost: { white: 3, green: 6, black: 3 }, tier: 3, vp: 4 },
    { id: '3-20', color: 'red', cost: { white: 3, black: 7 }, tier: 3, vp: 5 }
  ]
};

// 10 张贵族：3种宝石各3个触发，+3分
// 5色选3色 = 10种组合
export const NOBLES = [
  { id: 'N01', req: { white: 3, blue: 3, green: 3 } },
  { id: 'N02', req: { white: 3, blue: 3, red: 3 } },
  { id: 'N03', req: { white: 3, blue: 3, black: 3 } },
  { id: 'N04', req: { white: 3, green: 3, red: 3 } },
  { id: 'N05', req: { white: 3, green: 3, black: 3 } },
  { id: 'N06', req: { white: 3, red: 3, black: 3 } },
  { id: 'N07', req: { blue: 3, green: 3, red: 3 } },
  { id: 'N08', req: { blue: 3, green: 3, black: 3 } },
  { id: 'N09', req: { blue: 3, red: 3, black: 3 } },
  { id: 'N10', req: { green: 3, red: 3, black: 3 } }
];

// 获取某玩家能以折扣价买卡的总资源（手牌 + 卡面折扣）
export function getPlayerBonuses(player) {
  const bonuses = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  for (const card of player.cards) {
    bonuses[card.color] = (bonuses[card.color] || 0) + 1;
  }
  return bonuses;
}

// 计算买卡实际需要支付的宝石（折扣后）
// 返回需要支付的宝石数量对象（不含 gold），以及是否可以支付
export function calculatePayment(card, player) {
  const bonuses = getPlayerBonuses(player);
  const needed = {};
  for (const color of GEM_COLORS) {
    const raw = card.cost[color] || 0;
    const discount = bonuses[color] || 0;
    const actual = Math.max(0, raw - discount);
    if (actual > 0) needed[color] = actual;
  }
  return needed;
}
