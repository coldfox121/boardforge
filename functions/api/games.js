// 游戏目录：返回所有已支持游戏 + 规则摘要
import { json } from '../_shared.js';

const GAMES = {
  splendor: {
    name: '璀璨宝石',
    minPlayers: 2,
    maxPlayers: 4,
    setup: {
      2: { gemsPerColor: 4, nobles: 3 },
      3: { gemsPerColor: 5, nobles: 4 },
      4: { gemsPerColor: 7, nobles: 5 }
    },
    cardsPerLevel: 4,
    rounds: 0,
    pointsToWin: 15,
    duration: '约 30 分钟',
    // 规则摘要（前端渲染用）
    rules: {
      objective: '第一个先达到 15 分的玩家触发终局，其他人走最后一轮后比较总分',
      turn: '每回合四选一：①拿 3 颗不同色宝石 ②拿 2 颗同色（该色剩≥4） ③预留一张卡（占一手+拿1黄金） ④支付宝石买一张卡',
      cards: '90 张资源卡，分一/二/三级。买了卡之后卡面宝石永久可用，无需再用宝石支付',
      gems: '每回合结束手牌 ≤10 颗，超出需归还',
      nobles: '场上翻出 3-5 张贵族图板，满足条件自动获得，+3 分',
      purchase: '买卡时卡面宝石自动抵对应颜色，剩余缺口用手牌里的宝石支付（黄金可抵任意颜色）。支付的宝石全部归还公共资源池',
      notes: '黄金是万能宝石，每手牌最多有 3 个；预留卡放在个人区，买卡时黄金可抵任意颜色'
    }
  },
  ticket: {
    name: '铁路环游·美国版',
    minPlayers: 2,
    maxPlayers: 5,
    duration: '约 60 分钟',
    rules: {
      objective: '连接城市完成任务票，未完成任务扣分，总分最高者获胜',
      turn: '每回合三选一：①抽 2 张车票 ②占领路线 ③抽 3 张任务票（至少留 1 张）',
      cards: '8 色各 12 张 + 14 张彩虹票（车头），车头可当任意颜色',
      route: '打出与路线格数、颜色一致的车票；灰色路线可用任意单一颜色；2-3 人局双线只能用一条',
      end: '有人剩余车厢 ≤2 触发终局，其余玩家最后一回合；最长连续路线 +10'
    }
  }
};

// 公开导出（供 rooms.js 引用，避免重复定义）
export { GAMES };

export async function onRequestGet() {
  const list = Object.entries(GAMES).map(([id, g]) => ({
    id,
    name: g.name,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    duration: g.duration
  }));
  return json({ games: list });
}
