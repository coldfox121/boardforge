// ===== Admin 编辑器 UI（通用） =====
// 设计：JSON 编辑器 + 自动校验 + 平衡性分析
// 未来加游戏只需：registerGame({ id, name, getDefaultData, validate })

import { saveAdminData, loadAdminData, clearAdminData, hasAdminData, getAdminSavedAt, BalanceStats } from './admin.js?v=17';

// === 游戏注册表（未来加新游戏只要 push 一个） ===
const GAMES = {
  splendor: {
    id: 'splendor',
    name: '璀璨宝石 · Splendor',
    version: 1,
    getDefaultData: () => {
      // 动态 import splendor-data，取 CARDS / NOBLES
      // （在 admin 页面用 import() 异步加载）
      return null; // 后面 .then 里补
    },
    validate(data) {
      const errors = [];
      if (!data.CARDS || typeof data.CARDS !== 'object') errors.push('缺少 CARDS');
      else {
        for (const tier of [1, 2, 3]) {
          if (!Array.isArray(data.CARDS[tier])) errors.push(`CARDS[${tier}] 不是数组`);
          else {
            data.CARDS[tier].forEach((c, i) => {
              if (!c.id) errors.push(`CARDS[${tier}][${i}] 缺少 id`);
              if (!c.color) errors.push(`CARDS[${tier}][${i}] 缺少 color`);
              if (typeof c.vp !== 'number') errors.push(`CARDS[${tier}][${i}] 缺少 vp`);
              if (!c.cost || typeof c.cost !== 'object') errors.push(`CARDS[${tier}][${i}] 缺少 cost`);
            });
          }
        }
      }
      if (!Array.isArray(data.NOBLES)) errors.push('NOBLES 不是数组');
      else data.NOBLES.forEach((n, i) => {
        if (!n.req) errors.push(`NOBLES[${i}] 缺少 req`);
      });
      return errors;
    },
    analyze(data) {
      return BalanceStats.analyzeSplendor(data.CARDS || {}, data.NOBLES || []);
    }
  }
};

// === Admin 入口 ===
export function mountAdminButton() {
  const isAdmin = localStorage.getItem('bf_is_admin') === 'true';
  // 大厅头部实际容器是 .user-info，兼容 .lobby-actions
  const host = document.querySelector('.lobby-actions') || document.querySelector('.lobby-header .user-info');
  if (!isAdmin || !host || document.getElementById('admin-entry')) return;
  const btn = document.createElement('button');
  btn.id = 'admin-entry';
  btn.className = 'btn ghost';
  btn.textContent = '🛠 Admin 牌库编辑';
  btn.style.cssText = 'background:linear-gradient(135deg,#ffd54f33,#ff980033);border-color:#ffd54f88;color:#ffd54f;font-size:12px;padding:4px 10px';
  btn.addEventListener('click', () => navigateToAdmin());
  host.insertBefore(btn, host.firstChild);
}

export function navigateToAdmin() {
  location.hash = '#/admin';
}

// === Admin 页面渲染 ===
export async function renderAdminPage() {
  const root = document.getElementById('admin-root');
  if (!root) return;
  root.innerHTML = '<div class="loading">加载默认牌库...</div>';

  // 动态加载 splendor-data 拿默认基线
  const mod = await import('./splendor-data.js').catch(() => null);
  if (!mod) { root.innerHTML = '<div class="error">无法加载数据模块</div>'; return; }

  const gameId = 'splendor';
  const baseData = {
    CARDS: mod.CARDS,
    NOBLES: mod.NOBLES,
    GEM_COLORS: mod.GEM_COLORS
  };
  const adminData = loadAdminData(gameId);
  const activeData = adminData || baseData;

  root.innerHTML = buildAdminHTML(gameId, baseData, activeData, adminData);
  bindAdminEvents(gameId, baseData);
}

function buildAdminHTML(gameId, baseData, activeData, adminData) {
  const savedAt = getAdminSavedAt(gameId);
  const savedStr = savedAt ? new Date(savedAt).toLocaleString() : null;
  const hasOverride = hasAdminData(gameId);

  // 平衡性分析（用 activeData 计算）
  const analysis = BalanceStats.analyzeSplendor(activeData.CARDS, activeData.NOBLES);

  let tiersAnalysisHTML = '';
  for (const [tier, s] of Object.entries(analysis.tiers)) {
    const vpBar = Array.from({length: 7}, (_, i) => {
      const n = s.vpCounts[i] || 0;
      const pct = s.count ? Math.round(n / s.count * 100) : 0;
      return `<div class="vpbar-seg" style="width:${pct}%;background:${i === 0 ? '#666' : i >= 3 ? '#ffd54f' : '#888'}" title="VP${i}:${n}张 ${pct}%">${n > 0 ? n : ''}</div>`;
    }).join('');
    const costs = Object.entries(s.costByColor).filter(([, n]) => n > 0).map(([c, n]) => {
      const totalByColor = Object.values(s.costByColor).reduce((a, b) => a + b, 0);
      const pct = Math.round(n / totalByColor * 100);
      return `<span>${colorDot(c)}${n}(${pct}%)</span>`;
    }).join(' ');
    tiersAnalysisHTML += `
      <div class="tier-stat">
        <div class="tier-head">等级 ${tier} · ${s.count} 张 · 平均费用 ${s.avgCost} · 性价比 ${s.avgVpPerCost}</div>
        <div class="vpbar">${vpBar}</div>
        <div class="vpbar-label">VP:0→1→2→3→4→5→6</div>
        <div class="tier-foot">费用颜色分布: ${costs || '无'}</div>
      </div>`;
  }

  return `
    <div class="admin-header">
      <h2>🛠 Admin 牌库编辑器</h2>
      <div class="admin-status">
        ${hasOverride ? `⚠️ 当前有 admin 覆盖数据（保存于 ${savedStr}）` : 'ℹ️ 当前使用官方基线数据'}
      </div>
    </div>

    <div class="admin-tabs">
      <button class="tab active" data-tab="balance">平衡性分析</button>
      <button class="tab" data-tab="json">JSON 编辑器</button>
      <button class="tab" data-tab="diff">对比基线</button>
    </div>

    <div class="admin-panel" id="panel-balance">
      <div class="balance-grid">${tiersAnalysisHTML}</div>
      <div class="balance-legend">
        <strong>平衡性指标说明：</strong><br>
        · 性价比 = 总VP / 总费用 — 越高越好（3级应该最高，1级最低）<br>
        · 费用颜色分布应该大致均匀 — 某色超过 30% 说明偏科<br>
        · VP 分布应该金字塔形 — 高VP卡少、低VP卡多
      </div>
    </div>

    <div class="admin-panel hidden" id="panel-json">
      <div class="json-toolbar">
        <button class="btn primary" id="json-save">💾 保存覆盖</button>
        <button class="btn" id="json-reset">↺ 恢复基线</button>
        <span class="json-status" id="json-status"></span>
      </div>
      <textarea id="json-editor" spellcheck="false"></textarea>
      <div class="json-validate" id="json-validate"></div>
    </div>

    <div class="admin-panel hidden" id="panel-diff">
      <div id="diff-content">对比中...</div>
    </div>
  `;
}

function colorDot(color) {
  const map = { white: '#d0d0d0', blue: '#5b9bd5', green: '#70ad47', red: '#e06666', black: '#333', gold: '#ffd54f' };
  return `<span class="cdot" style="background:${map[color] || '#888'}"></span>`;
}

function bindAdminEvents(gameId, baseData) {
  // Tab 切换
  document.querySelectorAll('.admin-tabs .tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.admin-tabs .tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(x => x.classList.add('hidden'));
      t.classList.add('active');
      document.getElementById('panel-' + t.dataset.tab).classList.remove('hidden');
      if (t.dataset.tab === 'json') loadEditorJSON(gameId, baseData);
      if (t.dataset.tab === 'diff') showDiff(gameId, baseData);
    });
  });

  // JSON 编辑的保存按钮等
  const saveBtn = document.getElementById('json-save');
  const resetBtn = document.getElementById('json-reset');
  if (saveBtn) saveBtn.addEventListener('click', () => saveJSONEditor(gameId, baseData));
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (confirm('确定恢复基线？当前 admin 覆盖数据会被清空')) {
      clearAdminData(gameId);
      document.getElementById('json-status').textContent = '✅ 已恢复基线，请刷新游戏生效';
    }
  });
}

function loadEditorJSON(gameId, baseData) {
  const editor = document.getElementById('json-editor');
  if (!editor) return;
  const data = loadAdminData(gameId) || baseData;
  editor.value = JSON.stringify(data, null, 2);
  editor.addEventListener('input', debounce(() => validateJSON(gameId), 400));
  validateJSON(gameId);
}

function validateJSON(gameId) {
  const editor = document.getElementById('json-editor');
  const box = document.getElementById('json-validate');
  if (!editor || !box) return;
  try {
    const data = JSON.parse(editor.value);
    const errors = GAMES[gameId].validate(data);
    box.innerHTML = errors.length === 0
      ? '<span style="color:#70ad47">✅ JSON 格式正确 + 业务校验通过</span>'
      : errors.map(e => `<div style="color:#e06666">❌ ${e}</div>`).join('');
    return errors.length === 0;
  } catch (e) {
    box.innerHTML = `<div style="color:#e06666">❌ JSON 语法错误: ${e.message}</div>`;
    return false;
  }
}

function saveJSONEditor(gameId, baseData) {
  const editor = document.getElementById('json-editor');
  const status = document.getElementById('json-status');
  if (!editor || !status) return;
  const valid = validateJSON(gameId);
  if (!valid) { status.textContent = '❌ 校验未通过，无法保存'; return; }
  try {
    const data = JSON.parse(editor.value);
    saveAdminData(gameId, data);
    status.textContent = `✅ 已保存！刷新游戏后生效`;
    // 刷新平衡性分析
    const analysis = BalanceStats.analyzeSplendor(data.CARDS, data.NOBLES);
    console.log('[Admin] 保存成功，分析:', analysis);
  } catch (e) {
    status.textContent = '❌ 保存失败: ' + e.message;
  }
}

function showDiff(gameId, baseData) {
  const root = document.getElementById('diff-content');
  if (!root) return;
  const admin = loadAdminData(gameId);
  if (!admin) { root.innerHTML = '<div style="opacity:0.6">当前没有 admin 覆盖数据，无法对比（去 JSON 编辑器 tab 保存一份再来）</div>'; return; }

  const diffs = [];
  // 卡数量差异
  for (const t of [1, 2, 3]) {
    const b = baseData.CARDS[t]?.length || 0;
    const a = admin.CARDS?.[t]?.length || 0;
    if (b !== a) diffs.push(`等级${t} 卡数: 基线 ${b} → admin ${a}（${a > b ? '+' : ''}${a - b}）`);
  }
  // 贵族数量
  const bn = baseData.NOBLES?.length || 0;
  const an = admin.NOBLES?.length || 0;
  if (bn !== an) diffs.push(`贵族数量: 基线 ${bn} → admin ${an}`);

  // 具体卡级差异
  const cardChanges = [];
  for (const t of [1, 2, 3]) {
    const adminCards = admin.CARDS?.[t] || [];
    const baseCards = baseData.CARDS[t] || [];
    const adminMap = Object.fromEntries(adminCards.map(c => [c.id, c]));
    const baseMap = Object.fromEntries(baseCards.map(c => [c.id, c]));
    // admin 有但基线没有
    adminCards.forEach(ac => { if (!baseMap[ac.id]) cardChanges.push(`🆕 等级${t} 新增卡 ${ac.id}`); });
    // 基线有但 admin 没有
    baseCards.forEach(bc => { if (!adminMap[bc.id]) cardChanges.push(`🗑 等级${t} 删除卡 ${bc.id}`); });
    // 同 id 但属性变了
    adminCards.forEach(ac => {
      const bc = baseMap[ac.id];
      if (bc && JSON.stringify(ac) !== JSON.stringify(bc)) cardChanges.push(`✏️ 等级${t} 修改卡 ${ac.id}`);
    });
  }
  // 贵族差异
  const nobleChanges = [];
  (admin.NOBLES || []).forEach((an, i) => {
    const bn = baseData.NOBLES?.[i];
    if (!bn) nobleChanges.push(`🆕 新增贵族 ${i}`);
    else if (JSON.stringify(an) !== JSON.stringify(bn)) nobleChanges.push(`✏️ 修改贵族 ${i}`);
  });

  root.innerHTML = `
    <div class="diff-section">
      <h4>📊 总量差异</h4>
      ${diffs.length ? diffs.map(d => `<div>${d}</div>`).join('') : '<div style="opacity:0.6">无数量差异</div>'}
    </div>
    ${cardChanges.length ? `
    <div class="diff-section">
      <h4>🃏 卡牌修改记录</h4>
      ${cardChanges.slice(0, 50).map(c => `<div>${c}</div>`).join('')}
      ${cardChanges.length > 50 ? `<div style="opacity:0.6">...还有 ${cardChanges.length - 50} 条</div>` : ''}
    </div>` : ''}
    ${nobleChanges.length ? `
    <div class="diff-section">
      <h4>👑 贵族修改记录</h4>
      ${nobleChanges.map(c => `<div>${c}</div>`).join('')}
    </div>` : ''}
  `;
}

function debounce(fn, ms) {
  let t; return function() { clearTimeout(t); t = setTimeout(() => fn.apply(this, arguments), ms); };
}
