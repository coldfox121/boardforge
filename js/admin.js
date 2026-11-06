// ===== Admin 数据层：所有游戏通用 =====
// 设计：默认引擎数据（xxx-data.js export 的常量）是"基线"，
// admin 编辑器把改后的版本存 localStorage，
// 游戏加载时优先读 admin 覆盖版本。
// 好处：单机够用，不需要服务端 CRUD；以后 DO 联机再升级。

const LS_PREFIX = 'bf_admin_data_';

/**
 * 保存某游戏的 admin 覆盖数据
 * @param {string} gameId 如 'splendor'
 * @param {object} data  { CARDS, NOBLES, SETUP, GEM_POOL } 等
 */
export function saveAdminData(gameId, data) {
  const key = LS_PREFIX + gameId;
  localStorage.setItem(key, JSON.stringify({
    savedAt: Date.now(),
    data
  }));
}

export function loadAdminData(gameId) {
  const key = LS_PREFIX + gameId;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.data || null;
  } catch { return null; }
}

export function clearAdminData(gameId) {
  localStorage.removeItem(LS_PREFIX + gameId);
}

export function hasAdminData(gameId) {
  return loadAdminData(gameId) !== null;
}

export function getAdminSavedAt(gameId) {
  const key = LS_PREFIX + gameId;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw).savedAt || null; } catch { return null; }
}

/**
 * 通用深度合并：admin 覆盖数据覆盖基线数据
 * 基线数据里的函数/Symbol 会被保留（admin 数据只存 JSON 可序列化部分）
 */
export function mergeAdmin(base, override) {
  if (!override) return base;
  if (Array.isArray(base)) return override; // 数组直接替换（卡列表就是数组）
  if (typeof base !== 'object' || base === null) return override;
  const out = { ...base };
  for (const k of Object.keys(override)) {
    if (k in base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = mergeAdmin(base[k], override[k]);
    } else {
      out[k] = override[k];
    }
  }
  return out;
}

/**
 * 平衡性统计工具（通用，游戏间复用）
 */
export const BalanceStats = {
  // Splendor 专属分析：每级卡 VP 分布 / cost 分布 / 性价比
  analyzeSplendor(cards, nobles) {
    const tiers = [1, 2, 3];
    const stats = {};
    for (const t of tiers) {
      const tierCards = cards[t] || [];
      const vpCounts = [0, 0, 0, 0, 0, 0, 0]; // vp 0-6
      let totalCost = 0, totalVp = 0;
      const colorCount = {};
      const costByColor = {};
      for (const c of tierCards) {
        vpCounts[c.vp || 0]++;
        const cost = Object.values(c.cost || {}).reduce((s, n) => s + n, 0);
        totalCost += cost;
        totalVp += c.vp || 0;
        colorCount[c.color] = (colorCount[c.color] || 0) + 1;
        for (const [clr, n] of Object.entries(c.cost || {})) {
          if (!costByColor[clr]) costByColor[clr] = 0;
          costByColor[clr] += n;
        }
      }
      stats[t] = {
        count: tierCards.length,
        vpCounts,
        totalCost,
        totalVp,
        avgCost: tierCards.length ? (totalCost / tierCards.length).toFixed(1) : 0,
        avgVpPerCost: totalCost ? (totalVp / totalCost).toFixed(2) : 0, // 性价比
        colorCount,
        costByColor,
      };
    }
    return { tiers: stats, nobleCount: nobles?.length || 0 };
  }
};
