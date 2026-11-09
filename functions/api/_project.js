// 对局状态按座位裁剪（隐藏信息只发给本人）
//
// projectState：GET /api/room 返回前，按请求者座位裁剪
// mergeState：POST push 接收客户端状态时，用数据库中保存的真实值补回被裁字段
//
// 重要约束：本项目的规则引擎跑在客户端（玩家在本机执行动作后上传完整状态），
// 因此客户端执行动作时必须读取的数据（如铁路环游的抽牌堆）不能裁剪，否则盲抽会拿到占位符。
// 目前只裁剪"纯展示、不参与客户端计算"的隐藏信息。

function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

const GAMES = {
  // 铁路环游：任务票是隐藏信息，其他人类玩家的票只保留张数（用占位符代替 id）
  ticket: {
    project(state, seat) {
      const st = clone(state);
      (st.players || []).forEach((p, i) => {
        if (i !== seat && !p.isAI && Array.isArray(p.tickets)) {
          p.tickets = p.tickets.map(() => '?');
        }
      });
      return st;
    },
    merge(stored, incoming, seat) {
      const st = clone(incoming);
      const old = (stored && stored.players) || [];
      (st.players || []).forEach((p, i) => {
        const prev = old[i];
        if (prev && i !== seat && !prev.isAI && Array.isArray(prev.tickets)) {
          p.tickets = clone(prev.tickets);
        }
      });
      return st;
    }
  }

  // 璀璨宝石：手牌、宝石、已购卡均为公开信息，牌堆客户端抽牌时必须读取 → 不裁剪
};

export function projectState(gameId, state, seat) {
  const g = GAMES[gameId];
  if (!g || !g.project || !state || seat === null || seat === undefined) return state;
  try { return g.project(state, seat); } catch { return state; }
}

export function mergeState(gameId, stored, incoming, seat) {
  const g = GAMES[gameId];
  if (!g || !g.merge || !incoming) return incoming;
  try { return g.merge(stored, incoming, seat); } catch { return incoming; }
}
