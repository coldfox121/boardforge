// ===== Admin 编辑器 UI（通用） =====
// 设计：JSON 编辑器 + 自动校验 + 平衡性分析
// 未来加游戏只需：registerGame({ id, name, getDefaultData, validate })

import { saveAdminData, loadAdminData, clearAdminData, hasAdminData, getAdminSavedAt, BalanceStats } from './admin.js?v=35';
import { saveConfigToCloud, uploadCardImage, deleteCardImage } from './config-sync.js?v=35';

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
  },
  ticket: {
    id: 'ticket',
    name: '铁路环游 · Ticket to Ride USA',
    version: 1,
    validate(data) {
      const errors = [];
      const COLORS = ['purple', 'white', 'blue', 'yellow', 'orange', 'black', 'red', 'green'];
      if (!Array.isArray(data.CITIES)) errors.push('CITIES 不是数组');
      else {
        if (data.CITIES.length < 2) errors.push('CITIES 至少需要 2 座城市');
        data.CITIES.forEach((c, i) => {
          if (!c.id) errors.push(`CITIES[${i}] 缺少 id`);
          if (!c.zh) errors.push(`CITIES[${i}] 缺少中文名 zh`);
          if (typeof c.x !== 'number' || typeof c.y !== 'number') errors.push(`CITIES[${i}] 缺少坐标 x/y`);
        });
      }
      const ids = new Set((Array.isArray(data.CITIES) ? data.CITIES : []).map(c => c.id));
      if (!Array.isArray(data.ROUTES)) errors.push('ROUTES 不是数组');
      else data.ROUTES.forEach((r, i) => {
        if (!ids.has(r.a) || !ids.has(r.b)) errors.push(`ROUTES[${i}] 城市不存在：${r.a} / ${r.b}`);
        if (!(typeof r.len === 'number' && r.len >= 1 && r.len <= 6)) errors.push(`ROUTES[${i}] len 必须是 1-6`);
        if (r.color !== null && r.color !== undefined && !COLORS.includes(r.color)) errors.push(`ROUTES[${i}] color 非法：${r.color}`);
      });
      if (!Array.isArray(data.TICKETS)) errors.push('TICKETS 不是数组');
      else data.TICKETS.forEach((t, i) => {
        if (!ids.has(t.a) || !ids.has(t.b)) errors.push(`TICKETS[${i}] 城市不存在：${t.a} / ${t.b}`);
        if (typeof t.points !== 'number') errors.push(`TICKETS[${i}] 缺少 points`);
      });
      return errors;
    }
  }
};

// === Admin 入口 ===
export function mountAdminButton() {
  // 先清掉上一次登录残留的入口（登出/换号后 DOM 不会自动刷新）
  document.getElementById('admin-entry')?.remove();

  const isAdmin = localStorage.getItem('bf_is_admin') === 'true';
  // 大厅头部实际容器是 .user-info，兼容 .lobby-actions
  const host = document.querySelector('.lobby-actions') || document.querySelector('.lobby-header .user-info');
  if (!isAdmin || !host) return;
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
// 可编辑牌库的游戏（ready=false 表示暂无牌库编辑）
const ADMIN_GAMES = [
  { id: 'splendor', name: '💎 璀璨宝石', ready: true },
  { id: 'catan', name: '🗺️ 卡坦岛', ready: false },
  { id: 'ticket', name: '🚂 铁路环游', ready: true },
  { id: 'hotel', name: '🏨 奥地利大饭店', ready: false }
];

export async function renderAdminPage(gameId = 'splendor') {
  const root = document.getElementById('admin-root');
  if (!root) return;

  const optionsHTML = ADMIN_GAMES.map(g =>
    `<option value="${g.id}"${g.id === gameId ? ' selected' : ''}${g.ready ? '' : ' disabled'}>${g.name}${g.ready ? '' : '（未开放）'}</option>`
  ).join('');

  root.innerHTML = `<select class="admin-game-select" id="admin-game-select">${optionsHTML}</select><div id="admin-editor"></div>`;
  localStorage.setItem('bf_admin_game', gameId);

  document.getElementById('admin-game-select').addEventListener('change', (e) => {
    renderAdminPage(e.target.value);
  });

  const editor = document.getElementById('admin-editor');
  if (!editor) return;

  if (!ADMIN_GAMES.find(g => g.id === gameId && g.ready)) {
    editor.innerHTML = '<div class="admin-placeholder">该游戏的牌库编辑尚未开放</div>';
    return;
  }

  editor.innerHTML = '<div class="loading">加载默认数据...</div>';

  let baseData;
  if (gameId === 'ticket') {
    const mod = await import('./ticket-data.js').catch(() => null);
    if (!mod) { editor.innerHTML = '<div class="error">无法加载数据模块</div>'; return; }
    baseData = { CITIES: mod.CITIES, ROUTES: mod.ROUTES, TICKETS: mod.TICKETS };
  } else {
    // 动态加载 splendor-data 拿默认基线
    const mod = await import('./splendor-data.js').catch(() => null);
    if (!mod) { editor.innerHTML = '<div class="error">无法加载数据模块</div>'; return; }
    baseData = {
      CARDS: mod.CARDS,
      NOBLES: mod.NOBLES,
      GEM_COLORS: mod.GEM_COLORS
    };
  }
  const adminData = loadAdminData(gameId);

  // 铁路环游使用专用可视化编辑器（城市 / 线路 / 任务票），不暴露 JSON
  if (gameId === 'ticket') {
    const { renderTicketEditor } = await import('./admin-ticket.js?v=4');
    renderTicketEditor(editor, baseData, adminData);
    return;
  }

  // 深拷贝，避免直接修改原始基线数据
  const activeData = JSON.parse(JSON.stringify(adminData || baseData));

  editor.innerHTML = buildAdminHTML(gameId, baseData, activeData, adminData);
  bindAdminEvents(gameId, baseData, activeData);
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
      <div class="admin-head-right">
        <div class="admin-status">
          ${hasOverride ? `⚠️ 当前有 admin 覆盖数据（保存于 ${savedStr}）` : 'ℹ️ 当前使用官方基线数据'}
        </div>
        <button class="btn" id="admin-back">← 返回大厅</button>
      </div>
    </div>

    <div class="admin-tabs">
      <button class="tab active" data-tab="viz">🎴 可视化编辑</button>
      <button class="tab" data-tab="balance">平衡性分析</button>
      <button class="tab" data-tab="diff">对比基线</button>
      <button class="tab" data-tab="json">JSON（高级）</button>
    </div>

    <div class="admin-panel" id="panel-viz">
      ${buildVisualHTML(activeData)}
    </div>

    <div class="admin-panel hidden" id="panel-balance">
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

function bindAdminEvents(gameId, baseData, activeData) {
  const backBtn = document.getElementById('admin-back');
  if (backBtn) backBtn.addEventListener('click', () => { location.hash = '#/lobby'; });

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

  bindVisualEvents(gameId, activeData);

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

// ===== 可视化牌库编辑器 =====
const VIZ_COLORS = ['white', 'blue', 'green', 'red', 'black'];
const VIZ_HEX = { white: '#d0d0d0', blue: '#5b9bd5', green: '#70ad47', red: '#e06666', black: '#4a4a4a' };
const VIZ_NAME = { white: '钻石', blue: '蓝宝石', green: '祖母绿', red: '红宝石', black: '玛瑙' };

function buildVisualHTML(data) {
  let html = `
    <div class="viz-toolbar">
      <button class="btn primary" id="viz-save">💾 保存覆盖</button>
      <button class="btn" id="viz-reset">↺ 恢复基线</button>
      <span class="viz-status" id="viz-status"></span>
    </div>
    <div class="viz-hint">点击任意卡牌 / 贵族即可修改，改完点「保存覆盖」，刷新游戏生效</div>`;

  for (const t of [1, 2, 3]) {
    const cards = (data.CARDS && data.CARDS[t]) || [];
    html += `
      <div class="viz-tier">
        <div class="viz-tier-head">
          <span>等级 ${t} · <b>${cards.length}</b> 张</span>
          <button class="btn small" data-add-card="${t}">+ 新增卡</button>
        </div>
        <div class="viz-grid">${cards.map((c, i) => vizCardHTML(c, t, i)).join('')}</div>
      </div>`;
  }

  const nobles = data.NOBLES || [];
  html += `
    <div class="viz-tier">
      <div class="viz-tier-head">
        <span>👑 贵族 · <b>${nobles.length}</b> 张（固定 3 分）</span>
        <button class="btn small" data-add-noble="1">+ 新增贵族</button>
      </div>
      <div class="viz-grid">${nobles.map((n, i) => vizNobleHTML(n, i)).join('')}</div>
    </div>
    <div id="viz-modal-mount"></div>`;
  return html;
}

function vizCardHTML(card, tier, index) {
  // 有卡图时只展示卡图，避免与文字/费用圆片重叠
  if (card.image) {
    return `
    <div class="viz-card viz-has-img" data-card="${tier}:${index}">
      <img class="viz-thumb" src="${card.image}" alt="">
    </div>`;
  }
  const costs = Object.entries(card.cost || {})
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `<span class="viz-cost">${colorDot(c)}${n}</span>`)
    .join('');
  return `
    <div class="viz-card" data-card="${tier}:${index}" style="border-left-color:${VIZ_HEX[card.color] || '#888'}">
      <div class="viz-card-top">
        <span class="viz-vp">${card.vp || 0}分</span>
        <span class="viz-color">${VIZ_NAME[card.color] || card.color}</span>
      </div>
      <div class="viz-costs">${costs || '<span class="viz-free">无费用</span>'}</div>
    </div>`;
}

function vizNobleHTML(noble, index) {
  if (noble.image) {
    return `<div class="viz-card viz-noble viz-has-img" data-noble="${index}">
      <img class="viz-thumb" src="${noble.image}" alt="">
    </div>`;
  }
  const reqs = Object.entries(noble.req || {})
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `<span class="viz-cost">${colorDot(c)}${n}</span>`)
    .join('');
  return `<div class="viz-card viz-noble" data-noble="${index}">
    <div class="viz-card-top"><span class="viz-vp">👑 3分</span></div>
    <div class="viz-costs">${reqs}</div>
  </div>`;
}

function renderVisualPanel(gameId, data) {
  const panel = document.getElementById('panel-viz');
  if (panel) panel.innerHTML = buildVisualHTML(data);
}

function bindVisualEvents(gameId, data) {
  const panel = document.getElementById('panel-viz');
  if (!panel) return;

  // 用 onclick 赋值，避免多次渲染后监听器叠加；同时兼容面板内部重渲染
  panel.onclick = async (e) => {
    const status = document.getElementById('viz-status');

    if (e.target.closest('#viz-save')) {
      if (status) { status.textContent = '⏳ 保存中...'; status.style.color = ''; }
      try {
        saveAdminData(gameId, data); // 本地缓存，离线也能用
        await saveConfigToCloud(gameId, data);
        if (status) { status.textContent = '✅ 已保存到云端，所有人可见'; status.style.color = '#70ad47'; }
      } catch (err) {
        if (status) { status.textContent = '❌ ' + err.message; status.style.color = '#e06666'; }
      }
      return;
    }

    if (e.target.closest('#viz-reset')) {
      if (!confirm('确定恢复基线？当前 admin 覆盖数据会被清空')) return;
      clearAdminData(gameId);
      renderAdminPage(gameId);
      return;
    }

    const addCard = e.target.closest('[data-add-card]');
    if (addCard) { addCardToData(data, Number(addCard.dataset.addCard)); renderVisualPanel(gameId, data); return; }

    const addNoble = e.target.closest('[data-add-noble]');
    if (addNoble) {
      data.NOBLES = data.NOBLES || [];
      let n = data.NOBLES.length + 1;
      while (data.NOBLES.some(x => x.id === 'N' + n)) n++;
      data.NOBLES.push({ id: 'N' + n, req: { white: 3, blue: 3, green: 3 } });
      renderVisualPanel(gameId, data);
      return;
    }

    const cardEl = e.target.closest('[data-card]');
    if (cardEl) {
      const [t, i] = cardEl.dataset.card.split(':').map(Number);
      openCardEditor(gameId, data, t, i);
      return;
    }

    const nobleEl = e.target.closest('[data-noble]');
    if (nobleEl) openNobleEditor(gameId, data, Number(nobleEl.dataset.noble));
  };
}

function addCardToData(data, tier) {
  if (!data.CARDS) data.CARDS = {};
  if (!data.CARDS[tier]) data.CARDS[tier] = [];
  const list = data.CARDS[tier];
  let n = list.length + 1;
  let id = `${tier}-${String(n).padStart(2, '0')}`;
  while (list.some(c => c.id === id)) { n++; id = `${tier}-${String(n).padStart(2, '0')}`; }
  list.push({ id, color: 'white', cost: {}, tier, vp: 0 });
}

function openCardEditor(gameId, data, tier, index) {
  const card = data.CARDS[tier][index];
  const mount = document.getElementById('viz-modal-mount');
  if (!mount) return;

  mount.innerHTML = `
    <div class="viz-backdrop">
      <div class="viz-modal">
        <h3>编辑卡牌 <span class="viz-id">${card.id}</span></h3>
        <div class="viz-field">
          <label>卡牌图片</label>
          <div class="viz-image-row">
            <div class="viz-image-preview">${card.image ? `<img src="${card.image}" alt="">` : '<span class="viz-free">未设置</span>'}</div>
            <div class="viz-image-actions">
              <button class="btn small" id="ve-upload">${card.image ? '更换图片' : '上传图片'}</button>
              ${card.image ? '<button class="btn small" id="ve-img-clear">移除图片</button>' : ''}
              <input type="file" id="ve-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            </div>
          </div>
        </div>
        <div class="viz-field">
          <label>产出颜色</label>
          <select id="ve-color">
            ${VIZ_COLORS.map(c => `<option value="${c}"${card.color === c ? ' selected' : ''}>${VIZ_NAME[c]}</option>`).join('')}
          </select>
        </div>
        <div class="viz-field">
          <label>胜利点数</label>
          <input type="number" id="ve-vp" min="0" max="5" value="${card.vp || 0}">
        </div>
        <div class="viz-cost-grid">
          ${VIZ_COLORS.map(c => `
            <div class="viz-field">
              <label>${colorDot(c)} ${VIZ_NAME[c]}</label>
              <input type="number" id="ve-cost-${c}" min="0" max="7" value="${(card.cost && card.cost[c]) || 0}">
            </div>`).join('')}
        </div>
        <div class="viz-modal-actions">
          <button class="btn primary" id="ve-ok">完成</button>
          <button class="btn danger" id="ve-del">删除此卡</button>
          <button class="btn" id="ve-cancel">取消</button>
        </div>
      </div>
    </div>`;

  const applyFormToCard = () => {
    card.color = document.getElementById('ve-color').value;
    card.vp = Number(document.getElementById('ve-vp').value) || 0;
    const cost = {};
    for (const c of VIZ_COLORS) {
      const v = Number(document.getElementById('ve-cost-' + c).value) || 0;
      if (v > 0) cost[c] = v;
    }
    card.cost = cost;
  };

  mount.onclick = (e) => {
    if (e.target.id === 've-cancel' || e.target.classList.contains('viz-backdrop')) { mount.innerHTML = ''; return; }

    if (e.target.id === 've-upload') { document.getElementById('ve-file').click(); return; }

    if (e.target.id === 've-img-clear') {
      delete card.image;
      deleteCardImage(gameId, card.id);
      renderVisualPanel(gameId, data);
      openCardEditor(gameId, data, tier, index);
      return;
    }

    if (e.target.id === 've-ok') {
      applyFormToCard();
      mount.innerHTML = '';
      renderVisualPanel(gameId, data);
      return;
    }

    if (e.target.id === 've-del') {
      if (!confirm('确定删除这张卡？')) return;
      data.CARDS[tier].splice(index, 1);
      mount.innerHTML = '';
      renderVisualPanel(gameId, data);
    }
  };

  mount.onchange = async (e) => {
    if (e.target.id !== 've-file') return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    applyFormToCard(); // 上传前保留当前表单输入
    const btn = document.getElementById('ve-upload');
    if (btn) { btn.disabled = true; btn.textContent = '上传中...'; }

    try {
      const r = await uploadCardImage(gameId, card.id, file);
      card.image = r.url;
      renderVisualPanel(gameId, data);
      openCardEditor(gameId, data, tier, index);
    } catch (err) {
      alert('图片上传失败：' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = '上传图片'; }
    }
  };
}

function openNobleEditor(gameId, data, index) {
  const noble = data.NOBLES[index];
  const mount = document.getElementById('viz-modal-mount');
  if (!mount) return;

  mount.innerHTML = `
    <div class="viz-backdrop">
      <div class="viz-modal">
        <h3>编辑贵族 <span class="viz-id">${noble.id}</span></h3>
        <div class="viz-hint">贵族固定 3 分，只需设置所需卡牌数量</div>
        <div class="viz-cost-grid">
          ${VIZ_COLORS.map(c => `
            <div class="viz-field">
              <label>${colorDot(c)} ${VIZ_NAME[c]}</label>
              <input type="number" id="vn-req-${c}" min="0" max="5" value="${(noble.req && noble.req[c]) || 0}">
            </div>`).join('')}
        </div>
        <div class="viz-modal-actions">
          <button class="btn primary" id="vn-ok">完成</button>
          <button class="btn danger" id="vn-del">删除此贵族</button>
          <button class="btn" id="vn-cancel">取消</button>
        </div>
      </div>
    </div>`;

  mount.onclick = (e) => {
    if (e.target.id === 'vn-cancel' || e.target.classList.contains('viz-backdrop')) { mount.innerHTML = ''; return; }

    if (e.target.id === 'vn-ok') {
      const req = {};
      for (const c of VIZ_COLORS) {
        const v = Number(document.getElementById('vn-req-' + c).value) || 0;
        if (v > 0) req[c] = v;
      }
      noble.req = req;
      mount.innerHTML = '';
      renderVisualPanel(gameId, data);
      return;
    }

    if (e.target.id === 'vn-del') {
      if (!confirm('确定删除这个贵族？')) return;
      data.NOBLES.splice(index, 1);
      mount.innerHTML = '';
      renderVisualPanel(gameId, data);
    }
  };
}

function loadEditorJSON(gameId, baseData, presetData) {
  const editor = document.getElementById('json-editor');
  if (!editor) return;
  const data = presetData || loadAdminData(gameId) || baseData;
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
    status.textContent = '✅ 已保存，正在同步云端...';
    saveConfigToCloud(gameId, data)
      .then(() => { status.textContent = '✅ 已保存并同步云端，玩家下一局生效'; })
      .catch(() => { status.textContent = '⚠️ 已保存到本机，云端同步失败'; });
    // 刷新平衡性分析（仅璀璨宝石有牌库分析）
    if (gameId === 'splendor') {
      const analysis = BalanceStats.analyzeSplendor(data.CARDS, data.NOBLES);
      console.log('[Admin] 保存成功，分析:', analysis);
    }
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
