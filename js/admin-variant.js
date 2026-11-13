// ===== 魔改版（variant）编辑器 =====
// 管理动线：
//   游戏 tab → 版本选择页（基础版 + 魔改版列表 + 创建/fork）
//     → 选中后进入对应编辑器
//     → 保存时版本号 +1，联机强制同一版本
import { VariantAPI, saveVariantDraft, loadVariantDraft, clearVariantDraft, getAdminSavedAt, hasAdminData } from './admin.js?v=36';

// 事件委托 handler（全局只绑定一次，container 复用同一 DOM 节点）
let _variantClickHandler = null;
function bindVariantClickOnce(container, getState) {
  if (_variantClickHandler) {
    container.removeEventListener('click', _variantClickHandler);
  }
  _variantClickHandler = async (e) => {
    const { gameId, onPick, baseData, adminData } = getState();
    if (!gameId) return;

    // fork 对话框
    const showForkPicker = () => {
      const dialog = document.createElement('div');
      dialog.className = 'dialog-mask';
      dialog.innerHTML = `
        <div class="dialog-box">
          <h4>从哪个版本派生？</h4>
          <div class="fork-source-list">
            <div class="fork-source" data-id="__base__">官方基础版</div>
          </div>
          <button class="btn ghost dialog-close">取消</button>
        </div>
      `;
      document.body.appendChild(dialog);
      dialog.addEventListener('click', async (de) => {
        if (de.target.classList.contains('dialog-close') || de.target === dialog) { dialog.remove(); return; }
        const src = de.target.closest('.fork-source');
        if (!src) return;
        dialog.remove();
        const srcId = src.dataset.id;
        const name = prompt('魔改版名字', srcId === '__base__' ? '我的魔改版' : '我的魔改版');
        if (!name) return;
        try {
          const { variant } = await VariantAPI.fork(gameId, name, srcId === '__base__' ? null : srcId);
          toast(`已创建 ${variant.name}（v${variant.version}）`);
          renderVariantChooser(container, gameId, onPick, baseData, adminData);
        } catch (err) { toast(err.message, true); }
      });
    };

    const act = e.target.dataset.act;
    const id = e.target.dataset.id;

    if (e.target.id === 'variant-back-lobby') { location.hash = '#/lobby'; return; }

    if (e.target.id === 'variant-create-from-base') {
      const name = prompt('魔改版名字', '我的魔改版');
      if (!name) return;
      try {
        const { variant } = await VariantAPI.create(gameId, name);
        toast(`已创建 ${variant.name}（v${variant.version}）`);
        renderVariantChooser(container, gameId, onPick, baseData, adminData);
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (e.target.id === 'variant-show-fork') { showForkPicker(); return; }

    if (act === 'variant-edit-base') {
      onPick({ kind: 'base', baseData, adminData });
      return;
    }
    if (act === 'variant-edit') {
      try {
        const v = await VariantAPI.get(id);
        onPick({ kind: 'variant', variant: v });
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (act === 'variant-fork') { showForkPicker(); return; }
    if (act === 'variant-delete') {
      if (!confirm('确定删除此魔改版？此操作不可恢复。')) return;
      try {
        await VariantAPI.delete(id);
        toast('已删除');
        renderVariantChooser(container, gameId, onPick, baseData, adminData);
      } catch (err) { toast(err.message, true); }
      return;
    }
    // 点击卡片主体 = 进入编辑（仅点卡片本身，不点内部按钮）
    const card = e.target.closest('.variant-card');
    if (card && e.target === card) {
      const cid = card.dataset.id;
      if (cid === '__base__') { onPick({ kind: 'base', baseData, adminData }); return; }
      try {
        const v = await VariantAPI.get(cid);
        onPick({ kind: 'variant', variant: v });
      } catch (err) { toast(err.message, true); }
      return;
    }
  };
  container.addEventListener('click', _variantClickHandler);
}

// ===== 游戏规则参数定义（每个游戏一份；粗粒度，支持 variant 覆盖）=====
// 类型: number / string / boolean
// 引擎通过 mergeRules 合并 DEFAULT_RULES 与 variant.rules
export const GAME_RULES = {
  splendor: [
    { key: 'MAX_GEMS', label: '最大宝石数', type: 'number', min: 5, max: 20, default: 10, step: 1,
      hint: '同时持有的彩色+黄金宝石总数上限' },
    { key: 'END_SCORE', label: '终局触发分数', type: 'number', min: 5, max: 30, default: 15, step: 1,
      hint: '玩家分数达到此值后触发终局倒计时' },
    { key: 'RESERVED_MAX', label: '预留槽上限', type: 'number', min: 1, max: 6, default: 3, step: 1,
      hint: '同时可预留的发展卡数量' },
    { key: 'BOARD_CARDS_PER_TIER', label: '场上每级翻出张数', type: 'number', min: 2, max: 6, default: 4, step: 1,
      hint: '牌桌每层同时可见的发展卡张数' },
    { key: 'SAME_GEM_REQUIREMENT', label: '同色拿宝石最低库存', type: 'number', min: 2, max: 6, default: 4, step: 1,
      hint: '同色连拿时该色至少剩余几颗才允许' },
    { key: 'NOBLE_SCORE_FALLBACK', label: '贵族牌默认得分', type: 'number', min: 1, max: 6, default: 3, step: 1,
      hint: '牌库中某贵族牌未单独设 vp 时使用此默认值' },
    { key: 'GOLD_POOL', label: '黄金池数量', type: 'number', min: 1, max: 10, default: 5, step: 1 }
  ],
  ticket: [
    { key: 'END_SCORE', label: '终点分', type: 'number', min: 5, max: 30, default: 10, step: 1,
      hint: '完成所有初始任务后额外获得的终点分' },
    { key: 'TRAINS_START', label: '初始车厢数', type: 'number', min: 20, max: 50, default: 45, step: 1 }
  ]
};

// ===== 命名覆盖定义（只改显示层，引擎内部 token 不变）=====
// 结构：{ 分组名: { key: { label, default } } }
// variant.labels = { gemNames: { white: '白云', ... }, buttonTake: '拾取', ... }
export const GAME_LABELS = {
  splendor: [
    {
      title: '宝石名称',
      group: 'gemNames',
      fields: [
        { key: 'white', default: '白宝石' },
        { key: 'blue', default: '蓝宝石' },
        { key: 'green', default: '绿宝石' },
        { key: 'red', default: '红宝石' },
        { key: 'black', default: '黑宝石' },
        { key: 'gold', default: '黄金' }
      ]
    },
    {
      title: '按钮与动作',
      group: 'button',
      fields: [
        { key: 'take', default: '拿宝石' },
        { key: 'buy', default: '购买' },
        { key: 'reserve', default: '预留' },
        { key: 'confirm', default: '确认' },
        { key: 'cancel', default: '取消' }
      ]
    }
  ]
};

// ===== 版本选择页（先显示，再进入编辑器）=====
export async function renderVariantChooser(container, gameId, onPick, baseData, adminData) {
  // 先清空，显示加载
  container.innerHTML = '<div class="loading">加载版本列表...</div>';

  let listData;
  let backendOk = true;
  try {
    listData = await VariantAPI.list(gameId);
  } catch (e) {
    // 后端不可用（超时/404/未部署）→ 本地 fallback，只显示基础版
    backendOk = false;
    listData = {
      base: { id: null, base_game: gameId, name: '官方基础版（离线）', version: 0, isBase: true },
      variants: []
    };
  }

  const { base, variants } = listData;
  const savedAt = getAdminSavedAt(gameId);
  const savedStr = savedAt ? new Date(savedAt).toLocaleString() : null;
  const hasOverride = hasAdminData(gameId);

  const variantCards = variants.length ? variants.map(v => `
    <div class="variant-card" data-id="${v.id}">
      <div class="variant-card-head">
        <strong class="variant-card-name">${esc(v.name)}</strong>
        <span class="variant-card-tag">v${v.version}</span>
      </div>
      <div class="variant-card-meta">创建者：${esc(v.creator)} · 更新于 ${new Date(v.updated_at).toLocaleString()}</div>
      <div class="variant-card-actions">
        <button class="btn btn-primary" data-act="variant-edit" data-id="${v.id}">进入编辑</button>
        ${backendOk ? `<button class="btn ghost" data-act="variant-fork" data-id="${v.id}">从此派生</button>
        <button class="btn ghost danger" data-act="variant-delete" data-id="${v.id}">删除</button>` : ''}
      </div>
    </div>
  `).join('') : `<div class="empty-tip">${backendOk ? '还没有魔改版，点"新建魔改版"创建第一个' : '（后端不可用，离线模式仅支持基础版编辑）'}</div>`;

  container.innerHTML = `
    ${!backendOk ? '<div class="deck-notice">⚠️ 魔改版后端暂不可用，当前为离线模式，仅基础版可编辑。部署 variant.js 后刷新即可启用魔改版管理。</div>' : ''}
    <div class="variant-toolbar">
      <h3>🗂 ${gameId === 'splendor' ? '璀璨宝石' : gameId === 'ticket' ? '铁路环游' : gameId} · 版本管理</h3>
      <div>
        <button class="btn ghost" id="variant-back-lobby">← 返回大厅</button>
        ${backendOk ? `<button class="btn" id="variant-create-from-base">＋ 从基础版新建魔改版</button>
        ${variants.length ? `<button class="btn ghost" id="variant-show-fork">＋ 从现有魔改版派生</button>` : ''}` : ''}
      </div>
    </div>

    <div class="variant-section">
      <h4>官方基础版</h4>
      <div class="variant-card base" data-id="__base__">
        <div class="variant-card-head">
          <strong class="variant-card-name">${base.name}</strong>
          <span class="variant-card-tag base">官方</span>
        </div>
        <div class="variant-card-meta">
          引擎内置基线 · ${hasOverride ? `本地已覆盖（保存于 ${savedStr}）` : '未覆盖'} · 不可删除
        </div>
        <div class="variant-card-actions">
          <button class="btn btn-primary" data-act="variant-edit-base">进入编辑</button>
        </div>
      </div>
    </div>

    <div class="variant-section">
      <h4>魔改版（${variants.length}）</h4>
      <div class="variant-cards">${variantCards}</div>
    </div>
  `;

  // 事件委托：只绑定一次（重绘 innerHTML 不会丢监听器，container 是同一个 DOM 节点）
  bindVariantClickOnce(container, () => ({ gameId, onPick, baseData, adminData }));
}

// ===== 魔改编辑器（进入后：牌库 tab + 规则参数 tab + 命名覆盖 tab + 版本号显示）=====
export async function renderVariantEditor(container, gameId, variant, baseData, goBack) {
  const draft = loadVariantDraft(variant.id);
  const rules = draft?.rules ?? variant.rules ?? {};
  const labels = draft?.labels ?? variant.labels ?? {};
  const deck = draft?.deck ?? variant.deck ?? {};
  const hasUnsaved = !!draft;

  container.innerHTML = `
    <div class="variant-toolbar">
      <h3>
        <button class="btn ghost" id="variant-back">← 版本列表</button>
        🎨 ${esc(variant.name)} · 魔改版 v${variant.version}
        ${hasUnsaved ? '<span class="unsaved-dot" title="有未保存的草稿">●</span>' : ''}
      </h3>
      <div>
        <button class="btn" id="variant-save">💾 保存到云端（版本 +1）</button>
        <button class="btn ghost" id="variant-reset">重置为上次保存</button>
        <button class="btn ghost" id="variant-back-lobby">← 返回大厅</button>
      </div>
    </div>

    <div class="admin-tabs" id="variant-tabs">
      <button class="tab active" data-tab="deck">🎴 牌库</button>
      <button class="tab" data-tab="rules">⚙️ 规则参数</button>
      <button class="tab" data-tab="labels">✏️ 命名覆盖</button>
      <button class="tab" data-tab="info">ℹ️ 版本信息</button>
    </div>

    <div id="variant-panel-deck" class="variant-panel"></div>
    <div id="variant-panel-rules" class="variant-panel hidden"></div>
    <div id="variant-panel-labels" class="variant-panel hidden"></div>
    <div id="variant-panel-info" class="variant-panel hidden"></div>
  `;

  document.getElementById('variant-back').addEventListener('click', () => { clearVariantDraft(variant.id); goBack(); });
  document.getElementById('variant-back-lobby').addEventListener('click', () => {
    if (loadVariantDraft(variant.id) && !confirm('有未保存的草稿，确定离开？')) return;
    location.hash = '#/lobby';
  });
  document.getElementById('variant-reset').addEventListener('click', () => {
    if (confirm('丢弃所有草稿，恢复到上次保存的版本？')) {
      clearVariantDraft(variant.id);
      renderVariantEditor(container, gameId, variant, baseData, goBack);
    }
  });
  document.getElementById('variant-save').addEventListener('click', async () => {
    try {
      const { variant: updated } = await VariantAPI.update(variant.id, { rules, labels, deck });
      clearVariantDraft(variant.id);
      toast(`已保存 · 新版本 v${updated.version}`);
      variant = updated;
      renderVariantEditor(container, gameId, updated, baseData, goBack);
    } catch (err) { toast(err.message, true); }
  });

  // Tab 切换
  container.querySelectorAll('#variant-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('#variant-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      container.querySelectorAll('.variant-panel').forEach(p => p.classList.add('hidden'));
      document.getElementById('variant-panel-' + name).classList.remove('hidden');
      if (name === 'deck') renderDeckPanel(gameId, variant, deck, baseData, rules, labels);
      if (name === 'rules') renderRulesPanel(gameId, rules, (k, v) => { rules[k] = v; autoSave(); });
      if (name === 'labels') renderLabelsPanel(gameId, labels, (g, k, v) => { (labels[g] = labels[g] || {})[k] = v; autoSave(); });
      if (name === 'info') renderInfoPanel(variant);
    });
  });

  // 默认渲染第一个 tab
  renderDeckPanel(gameId, variant, deck, baseData, rules, labels);

  // 自动暂存：任何改动都写入 draft
  function autoSave() { saveVariantDraft(variant.id, { rules, labels, deck }); }

  return { getDeck: () => deck, getRules: () => rules, getLabels: () => labels };
}

function renderDeckPanel(gameId, variant, deck, baseData, rules, labels) {
  const panel = document.getElementById('variant-panel-deck');
  panel.dataset.variantId = variant.id || '';
  if (!baseData) { panel.innerHTML = '<div class="error">基础数据不可用</div>'; return; }

  // 合并 variant.deck 覆盖到 baseData → 可编辑的完整数据
  const merged = JSON.parse(JSON.stringify(baseData));
  for (const k of Object.keys(deck)) merged[k] = JSON.parse(JSON.stringify(deck[k]));

  // 复用 admin-ui.js 的可视化编辑器（带图片上传）
  import('./admin-ui.js?v=37').then(({ renderVisualPanel, bindVisualEvents }) => {
    // 把面板伪装成 viz panel（但要隐藏 viz-save/viz-reset，因为 variant 有自己的顶栏保存）
    renderVisualPanel(gameId, merged, 'variant-panel-deck');
    // 隐藏 viz-save/viz-reset 按钮（variant 走顶栏"💾 保存到云端"）
    const saveBtn = document.getElementById('viz-save');
    const resetBtn = document.getElementById('viz-reset');
    if (saveBtn) { saveBtn.style.display = 'none'; }
    if (resetBtn) { resetBtn.style.display = 'none'; }
    const hint = document.querySelector('#variant-panel-deck .viz-hint');
    if (hint) hint.textContent = '点击卡牌 / 贵族即可编辑，支持上传卡图 · 改完点顶栏「💾 保存到云端」';

    // 事件绑定：autoSaveCallback 把 merged 写回 variant.deck 草稿
    bindVisualEvents(gameId, merged, 'variant-panel-deck', () => {
      // 计算 variant.deck = merged 与 base 差异的完整快照（简单起见存完整）
      deck.CARDS = JSON.parse(JSON.stringify(merged.CARDS));
      deck.NOBLES = JSON.parse(JSON.stringify(merged.NOBLES));
      if (merged.GEM_COLORS) deck.GEM_COLORS = JSON.parse(JSON.stringify(merged.GEM_COLORS));
      saveVariantDraft(variant.id, { rules, labels, deck });
    }, { hideSaveReset: true });
  });
}

function renderSplendorDeckEditor(base, merged, onChange) {
  // 简化：每层卡牌做可编辑表格，支持删改加；贵族表同理
  const GEM_DOT = { white: '⬜', blue: '🟦', green: '🟩', red: '🟥', black: '⬛' };
  // 卡牌：两行表头——上面分组，下面每列宝石名+色点
  const tiers = [1, 2, 3].map(t => {
    const rows = merged.CARDS[t] || [];
    const gemHeadCells = GEM_KEYS.map(k =>
      `<th class="th-gem-col" data-gem="${k}">${GEM_DOT[k]} ${LABEL_GEM[k]}</th>`
    ).join('');
    const head = `<h4>等级 ${t} 卡牌（共 ${rows.length} 张）</h4>
      <table class="deck-table"><thead>
        <tr class="th-group-row">
          <th rowspan="2">ID</th><th rowspan="2">颜色</th><th rowspan="2">VP</th>
          <th colspan="5">费用（宝石）</th>
          <th rowspan="2"></th>
        </tr>
        <tr class="th-gem-row">${gemHeadCells}</tr>
      </thead><tbody>`;
    const body = rows.map((c, i) => `
      <tr data-tier="${t}" data-idx="${i}">
        <td><input value="${esc(c.id)}" class="inp" data-f="id"></td>
        <td><select class="inp" data-f="color">${PCOLOR_OPTS.map(o => `<option value="${o.value}"${o.value===c.color?' selected':''}>${o.label}</option>`).join('')}</select></td>
        <td><input value="${c.vp ?? 0}" class="inp num" data-f="vp" type="number" min="0" max="6"></td>
        ${GEM_KEYS.map(k => `<td><input value="${c.cost?.[k] ?? 0}" class="inp num" data-f="cost.${k}" type="number" min="0" max="9"></td>`).join('')}
        <td><button class="btn-ghost danger" data-act="del-card">✕</button></td>
      </tr>`).join('');
    return head + body + `</tbody></table>
      <button class="btn ghost" data-act="add-card" data-tier="${t}">＋ 添加卡</button>`;
  }).join('');

  const nobleRows = (merged.NOBLES || []).map((n, i) => `
    <tr data-idx="${i}">
      <td><input value="${esc(n.id)}" class="inp" data-f="id"></td>
      <td><input value="${n.vp ?? 3}" class="inp num" data-f="vp" type="number" min="1" max="6"></td>
      ${GEM_KEYS.map(k => `<td><input value="${n.req?.[k] ?? 0}" class="inp num" data-f="req.${k}" type="number" min="0" max="9"></td>`).join('')}
      <td><button class="btn-ghost danger" data-act="del-noble">✕</button></td>
    </tr>`).join('');
  const nobleTable = `
    <h4>贵族牌（共 ${merged.NOBLES?.length || 0} 张）</h4>
    <table class="deck-table"><thead><tr>
      <th>ID</th><th>VP</th>
      ${GEM_KEYS.map(k => `<th>${LABEL_GEM[k]}</th>`).join('')}<th></th>
    </tr></thead><tbody>${nobleRows}</tbody></table>
    <button class="btn ghost" data-act="add-noble">＋ 添加贵族</button>`;

  const colorsNote = `<div class="deck-notice">颜色/费用改了会影响引擎——如果引擎有新颜色要先改 splendor-data.js 的 GEM_COLORS；贵族分数会直接用每张卡上的 vp 字段（支持 +4 等自定义分值）</div>`;
  return colorsNote + tiers + nobleTable;
}

const PCOLOR_OPTS = [
  { value: 'white', label: '白' }, { value: 'blue', label: '蓝' },
  { value: 'green', label: '绿' }, { value: 'red', label: '红' },
  { value: 'black', label: '黑' }
];
const GEM_KEYS = ['white', 'blue', 'green', 'red', 'black'];
const LABEL_GEM = { white: '白', blue: '蓝', green: '绿', red: '红', black: '黑' };

function bindSplendorDeckEditor(gameId, deck, baseData, variantId, rules, labels) {
  const panel = document.getElementById('variant-panel-deck');
  panel.addEventListener('input', (e) => {
    const inp = e.target.closest('input,select');
    if (!inp) return;
    const tr = inp.closest('tr');
    if (!tr) return;
    const tier = tr.dataset.tier;
    const idx = Number(tr.dataset.idx);
    const f = inp.dataset.f;
    if (!tier || idx < 0 || !f) return;
    deck.CARDS = deck.CARDS || { 1: [], 2: [], 3: [] };
    deck.CARDS[tier] = deck.CARDS[tier] || [];
    const card = deck.CARDS[tier][idx] = deck.CARDS[tier][idx] || JSON.parse(JSON.stringify(baseData.CARDS[tier][idx]));
    if (f.includes('.')) {
      const [parent, child] = f.split('.');
      card[parent] = card[parent] || {};
      card[parent][child] = Number(inp.value) || 0;
    } else {
      card[f] = (f === 'id' || f === 'color') ? inp.value : (Number(inp.value) || 0);
    }
    saveVariantDraft(variantId, { rules, labels, deck });
  });

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const currentRules = JSON.parse(JSON.stringify(rules));
    const currentLabels = JSON.parse(JSON.stringify(labels));
    if (act === 'add-card') {
      const tier = Number(btn.dataset.tier);
      deck.CARDS = deck.CARDS || { 1: [], 2: [], 3: [] };
      const newCard = { id: `NEW_${Date.now()}`, color: 'white', vp: 0, cost: {}, tier };
      GEM_KEYS.forEach(k => newCard.cost[k] = 0);
      deck.CARDS[tier].push(newCard);
      renderDeckPanel(gameId, { id: variantId }, deck, baseData, currentRules, currentLabels);
      return;
    }
    if (act === 'del-card') {
      const tr = btn.closest('tr');
      const tier = Number(tr.dataset.tier), idx = Number(tr.dataset.idx);
      deck.CARDS[tier].splice(idx, 1);
      renderDeckPanel(gameId, { id: variantId }, deck, baseData, currentRules, currentLabels);
      return;
    }
    if (act === 'add-noble') {
      deck.NOBLES = deck.NOBLES || [];
      const newNoble = { id: `NN_${Date.now()}`, vp: 3, req: {} };
      GEM_KEYS.forEach(k => newNoble.req[k] = 0);
      deck.NOBLES.push(newNoble);
      renderDeckPanel(gameId, { id: variantId }, deck, baseData, currentRules, currentLabels);
      return;
    }
    if (act === 'del-noble') {
      const tr = btn.closest('tr');
      const idx = Number(tr.dataset.idx);
      deck.NOBLES.splice(idx, 1);
      renderDeckPanel(gameId, { id: variantId }, deck, baseData, currentRules, currentLabels);
      return;
    }
  });
}

function renderRulesPanel(gameId, rules, onChange) {
  const panel = document.getElementById('variant-panel-rules');
  const defs = GAME_RULES[gameId] || [];
  if (!defs.length) { panel.innerHTML = '<div class="empty-tip">该游戏暂未开放规则参数化</div>'; return; }
  panel.innerHTML = defs.map(def => {
    const val = rules[def.key] ?? def.default;
    return `
      <div class="rule-row">
        <label class="rule-label">${def.label}</label>
        <input type="number" class="inp num" min="${def.min}" max="${def.max}" step="${def.step}"
          value="${val}" data-key="${def.key}">
        <span class="rule-hint">${def.hint}</span>
      </div>`;
  }).join('') + `<button class="btn ghost" id="rules-reset">↺ 全部重置为默认值</button>`;
  panel.querySelectorAll('input[data-key]').forEach(inp => {
    inp.addEventListener('input', () => onChange(inp.dataset.key, Number(inp.value)));
  });
  const btn = document.getElementById('rules-reset');
  if (btn) btn.addEventListener('click', () => {
    defs.forEach(def => onChange(def.key, def.default));
    renderRulesPanel(gameId, rules, onChange);
  });
}

function renderLabelsPanel(gameId, labels, onChange) {
  const panel = document.getElementById('variant-panel-labels');
  const defs = GAME_LABELS[gameId] || [];
  if (!defs.length) { panel.innerHTML = '<div class="empty-tip">该游戏暂未开放命名覆盖</div>'; return; }
  panel.innerHTML = defs.map(group => `
    <div class="label-group">
      <h5>${group.title}</h5>
      <div class="label-rows">
        ${group.fields.map(f => `
          <div class="label-row">
            <label>${f.default}</label>
            <input class="inp" value="${labels[group.group]?.[f.key] ?? f.default}"
              data-group="${group.group}" data-key="${f.key}">
          </div>`).join('')}
      </div>
    </div>
  `).join('');
  panel.querySelectorAll('input[data-group]').forEach(inp => {
    inp.addEventListener('input', () => {
      const g = inp.dataset.group, k = inp.dataset.key;
      onChange(g, k, inp.value);
    });
  });
}

function renderInfoPanel(variant) {
  const panel = document.getElementById('variant-panel-info');
  panel.innerHTML = `
    <div class="info-box">
      <h4>版本 v${variant.version}</h4>
      <p><strong>创建者</strong>：${esc(variant.creator)}</p>
      <p><strong>创建时间</strong>：${new Date(variant.created_at).toLocaleString()}</p>
      <p><strong>最近更新</strong>：${new Date(variant.updated_at).toLocaleString()}</p>
      <p>修改保存后版本号会自动 +1，加入房间的其他玩家版本号不一致时会被服务器拒绝。</p>
      <p><em>不可以删除正在被对局使用的魔改版。</em></p>
    </div>
  `;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}
