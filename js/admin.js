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
        avgVpPerCost: totalCost ? (totalVp / totalCost).toFixed(2) : 0,
        colorCount,
        costByColor,
      };
    }
    return { tiers: stats, nobleCount: nobles?.length || 0 };
  }
};

// ===== 魔改版（variant）云端 CRUD =====
// 联机时必须统一版本，所以 variant 存 D1 而非 localStorage
const LS_VARIANT_EDIT = 'bf_variant_edit_';  // 编辑中暂存

function _headers() {
  const token = localStorage.getItem('bf_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function _fetchJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);  // 5s 超时，本地 dev 没有后端也能 fallback
  let res;
  try {
    res = await fetch(url, { ...opts, headers: { ..._headers(), ...(opts.headers || {}) }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const VariantAPI = {
  // 列出某游戏的基础版 + 所有魔改版
  async list(gameId) {
    const data = await _fetchJSON(`/api/variant?game=${encodeURIComponent(gameId)}`);
    return data; // { base: {...}, variants: [...] }
  },
  // 读取单个完整配置
  async get(id) {
    const data = await _fetchJSON(`/api/variant?id=${encodeURIComponent(id)}`);
    return data.variant;
  },
  async create(baseGame, name) {
    return _fetchJSON('/api/variant', { method: 'POST', body: JSON.stringify({ action: 'create', base_game: baseGame, name }) });
  },
  async fork(baseGame, name, forkFromId) {
    return _fetchJSON('/api/variant', { method: 'POST', body: JSON.stringify({ action: 'fork', base_game: baseGame, name, fork_from_id: forkFromId }) });
  },
  async update(id, patch) {
    return _fetchJSON('/api/variant', { method: 'POST', body: JSON.stringify({ action: 'update', id, ...patch }) });
  },
  async rename(id, name) {
    return _fetchJSON('/api/variant', { method: 'POST', body: JSON.stringify({ action: 'rename', id, name }) });
  },
  async delete(id) {
    return _fetchJSON('/api/variant', { method: 'POST', body: JSON.stringify({ action: 'delete', id }) });
  }
};

// ===== 魔改编辑器本地暂存（未保存时的草稿） =====
export function saveVariantDraft(variantId, patch) {
  const key = LS_VARIANT_EDIT + variantId;
  localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), ...patch }));
}
export function loadVariantDraft(variantId) {
  const key = LS_VARIANT_EDIT + variantId;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export function clearVariantDraft(variantId) {
  localStorage.removeItem(LS_VARIANT_EDIT + variantId);
}
