// 奥地利大饭店 · 后台可视化编辑器
// 只维护卡面数据（名称/费用/点单/分值/描述）；效果逻辑按编号固定，不可在后台改
import { saveAdminData, loadAdminData, clearAdminData, getAdminSavedAt } from './admin.js?v=37';
import { saveConfigToCloud } from './config-sync.js?v=36';
import { BASE_DATA, ROOM_COLORS, ROOM_GROUPS, FLOOR_COST, FOOD_KEYS, FOOD_NAMES, COLOR_NAMES } from './hotel-data.js';

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TABS = [
  { id: 'staff', label: '👔 员工卡' },
  { id: 'guests', label: '🚪 房客卡' },
  { id: 'objectives', label: '📜 目标卡' },
  { id: 'emperors', label: '👑 皇帝板块' },
  { id: 'board', label: '🏨 房间布局' }
];

const KIND_LABEL = { once: '一次性', round: '每轮一次', permanent: '永久', end: '终局' };

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function normalize(admin) {
  const data = admin ? clone(admin) : {};
  data.STAFF = (data.STAFF || clone(BASE_DATA.STAFF)).map(s => ({ ...s }));
  data.GUESTS = (data.GUESTS || clone(BASE_DATA.GUESTS)).map(g => ({ ...g }));
  data.OBJECTIVES = (data.OBJECTIVES || clone(BASE_DATA.OBJECTIVES)).map(o => ({ ...o }));
  data.EMPERORS = (data.EMPERORS || clone(BASE_DATA.EMPERORS)).map(e => ({ ...e }));
  return data;
}

export function renderHotelEditor(container, baseData, presetData) {
  let data = normalize(loadAdminData('hotel') || presetData);
  let tab = 'staff';
  let selected = { staff: data.STAFF[0]?.id, guests: data.GUESTS[0]?.id, objectives: 0, emperors: 0 };

  const savedAt = getAdminSavedAt('hotel');
  container.innerHTML = `
    <div class="admin-header">
      <h2>🛠 奥地利大饭店 · 卡牌编辑器</h2>
      <div class="admin-head-right">
        <div class="admin-status">${savedAt ? `⚠️ 已有覆盖数据（${new Date(savedAt).toLocaleString()}）` : 'ℹ️ 当前使用官方基线数据'}</div>
        <button class="btn primary" id="gah-save">保存并同步</button>
        <button class="btn" id="gah-reset">恢复官方基线</button>
      </div>
    </div>
    <p class="hint" style="margin:6px 0 10px">
      只改卡面数据（名称 / 费用 / 点单 / 分值 / 描述）。效果逻辑按卡牌编号固定，不提供修改；房间布局为官方固定正面，仅展示。
    </p>
    <div class="gah-admin">
      <div class="gah-admin-tabs" id="gah-tabs">
        ${TABS.map(t => `<button class="gah-admin-tab ${t.id === tab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
      </div>
      <div class="gah-admin-body">
        <div class="gah-admin-list" id="gah-list"></div>
        <div class="gah-admin-form" id="gah-form"></div>
      </div>
    </div>
    <div class="gah-admin-status" id="gah-admin-status"></div>`;

  const listEl = container.querySelector('#gah-list');
  const formEl = container.querySelector('#gah-form');
  const statusEl = container.querySelector('#gah-admin-status');

  function flash(msg, ok = true) {
    statusEl.textContent = msg;
    statusEl.style.color = ok ? '#70ad47' : '#e06666';
    setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, 2600);
  }

  function renderList() {
    if (tab === 'staff') {
      listEl.innerHTML = data.STAFF.map(s => `<button class="gah-admin-item ${selected.staff === s.id ? 'active' : ''}" data-id="${s.id}">
        <b>#${s.id} ${esc(s.name)}</b><span>${s.cost} 元 · ${KIND_LABEL[s.kind] || s.kind}</span></button>`).join('');
    } else if (tab === 'guests') {
      listEl.innerHTML = data.GUESTS.map(g => `<button class="gah-admin-item ${selected.guests === g.id ? 'active' : ''}" data-id="${g.id}">
        <b>#${g.id} ${esc(g.name)}</b><span>${COLOR_NAMES[g.color] || g.color} · ${g.vp} 分 · ${g.order.join('/')}</span></button>`).join('');
    } else if (tab === 'objectives') {
      listEl.innerHTML = data.OBJECTIVES.map((o, i) => `<button class="gah-admin-item ${selected.objectives === i ? 'active' : ''}" data-id="${i}">
        <b>${o.group} 组 #${o.id}</b><span>${esc(o.text)}</span></button>`).join('');
    } else if (tab === 'emperors') {
      listEl.innerHTML = data.EMPERORS.map((e, i) => `<button class="gah-admin-item ${selected.emperors === i ? 'active' : ''}" data-id="${i}">
        <b>${e.id}</b><span>${esc(e.reward)}</span></button>`).join('');
    } else {
      listEl.innerHTML = `<div class="gah-admin-note">官方固定正面布局：20 个房间位、10 个颜色组。<br>
        满组奖励：蓝 2/5/9/15 分，红 1/3/6/10 克朗，黄 1/3/6/10 皇帝格。<br>
        楼层费用：${FLOOR_COST.join(' / ')} 克朗。</div>`;
    }
  }

  function renderForm() {
    if (tab === 'staff') {
      const s = data.STAFF.find(x => x.id === selected.staff) || data.STAFF[0];
      if (!s) { formEl.innerHTML = '<div class="gah-admin-note">没有员工卡</div>'; return; }
      selected.staff = s.id;
      formEl.innerHTML = `
        <div class="gah-field"><label>编号</label><input value="#${s.id} ${esc(s.key || '')}" disabled></div>
        <div class="gah-field"><label>名称</label><input id="f-name" value="${esc(s.name)}" maxlength="20"></div>
        <div class="gah-field"><label>雇佣费用（克朗）</label><input id="f-cost" type="number" min="0" max="12" value="${s.cost}"></div>
        <div class="gah-field"><label>类型</label>
          <select id="f-kind">${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="gah-field"><label>效果描述</label><textarea id="f-text" rows="5">${esc(s.text)}</textarea></div>
        <div class="gah-admin-actions">
          <button class="btn primary" id="f-apply">应用修改</button>
          <button class="btn danger" id="f-del">删除此卡</button>
        </div>`;
      formEl.querySelector('#f-apply').onclick = () => {
        const name = formEl.querySelector('#f-name').value.trim();
        if (!name) return flash('名称不能为空', false);
        const cost = Number(formEl.querySelector('#f-cost').value);
        if (!(cost >= 0 && cost <= 12)) return flash('费用需在 0-12 之间', false);
        s.name = name;
        s.cost = cost;
        s.kind = formEl.querySelector('#f-kind').value;
        s.text = formEl.querySelector('#f-text').value.trim();
        renderList(); flash('已应用，记得点右上角保存');
      };
      formEl.querySelector('#f-del').onclick = () => {
        if (!confirm('删除后本局牌堆少一张员工卡，确定？')) return;
        data.STAFF = data.STAFF.filter(x => x.id !== s.id);
        selected.staff = data.STAFF[0]?.id;
        renderList(); renderForm(); flash('已删除，记得保存');
      };
      return;
    }

    if (tab === 'guests') {
      const g = data.GUESTS.find(x => x.id === selected.guests) || data.GUESTS[0];
      if (!g) { formEl.innerHTML = '<div class="gah-admin-note">没有房客卡</div>'; return; }
      selected.guests = g.id;
      formEl.innerHTML = `
        <div class="gah-field"><label>编号</label><input value="#${g.id} ${esc(g.key || '')}" disabled></div>
        <div class="gah-field"><label>名称</label><input id="f-name" value="${esc(g.name)}" maxlength="20"></div>
        <div class="gah-field"><label>颜色（桌布）</label>
          <select id="f-color">${Object.entries(COLOR_NAMES).map(([k, v]) => `<option value="${k}" ${g.color === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <div class="gah-field"><label>订单（0-4 份）</label>
          <div class="gah-order-grid">
            ${FOOD_KEYS.map((k, i) => `<div><span>${FOOD_NAMES[k]}</span><input id="f-o${i}" type="number" min="0" max="4" value="${g.order[i] || 0}"></div>`).join('')}
          </div>
        </div>
        <div class="gah-field"><label>胜利分（0-12）</label><input id="f-vp" type="number" min="0" max="12" value="${g.vp}"></div>
        <div class="gah-field"><label>奖励（逻辑按编号固定）</label><div class="gah-admin-readonly">${esc(g.rewards.map(r => r.type + (r.n ? '×' + r.n : '')).join(' · ') || '无')}</div></div>
        <div class="gah-admin-actions">
          <button class="btn primary" id="f-apply">应用修改</button>
          <button class="btn danger" id="f-del">删除此卡</button>
        </div>`;
      formEl.querySelector('#f-apply').onclick = () => {
        const name = formEl.querySelector('#f-name').value.trim();
        if (!name) return flash('名称不能为空', false);
        const order = FOOD_KEYS.map((_k, i) => Number(formEl.querySelector('#f-o' + i).value) || 0);
        if (order.some(n => n < 0 || n > 4)) return flash('订单每项需在 0-4 之间', false);
        if (order.reduce((a, b) => a + b, 0) === 0) return flash('订单不能全为 0', false);
        const vp = Number(formEl.querySelector('#f-vp').value);
        if (!(vp >= 0 && vp <= 12)) return flash('分数需在 0-12 之间', false);
        g.name = name;
        g.color = formEl.querySelector('#f-color').value;
        g.order = order;
        g.vp = vp;
        renderList(); flash('已应用，记得点右上角保存');
      };
      formEl.querySelector('#f-del').onclick = () => {
        if (!confirm('删除后本局房客池少一张卡，确定？')) return;
        data.GUESTS = data.GUESTS.filter(x => x.id !== g.id);
        selected.guests = data.GUESTS[0]?.id;
        renderList(); renderForm(); flash('已删除，记得保存');
      };
      return;
    }

    if (tab === 'objectives') {
      const o = data.OBJECTIVES[selected.objectives] || data.OBJECTIVES[0];
      if (!o) { formEl.innerHTML = '<div class="gah-admin-note">没有目标卡</div>'; return; }
      selected.objectives = data.OBJECTIVES.indexOf(o);
      formEl.innerHTML = `
        <div class="gah-field"><label>编号 / 组</label><input value="#${o.id} · ${o.group} 组" disabled></div>
        <div class="gah-field"><label>条件文字</label><textarea id="f-text" rows="3">${esc(o.text)}</textarea></div>
        <div class="gah-field"><label>判定逻辑（固定）</label><div class="gah-admin-readonly">${esc(o.test)}</div></div>
        <div class="gah-field"><label>分位</label><div class="gah-admin-readonly">15 / 10 / 5（先抢先得，每人每卡限 1 个标记）</div></div>
        <div class="gah-admin-actions"><button class="btn primary" id="f-apply">应用修改</button></div>`;
      formEl.querySelector('#f-apply').onclick = () => {
        const text = formEl.querySelector('#f-text').value.trim();
        if (!text) return flash('条件文字不能为空', false);
        o.text = text;
        renderList(); flash('已应用，记得保存');
      };
      return;
    }

    if (tab === 'emperors') {
      const e = data.EMPERORS[selected.emperors] || data.EMPERORS[0];
      if (!e) { formEl.innerHTML = '<div class="gah-admin-note">没有皇帝板块</div>'; return; }
      selected.emperors = data.EMPERORS.indexOf(e);
      formEl.innerHTML = `
        <div class="gah-field"><label>编号 / 组</label><input value="${e.id} · ${e.group} 组（第 ${['3', '5', '7'][['A', 'B', 'C'].indexOf(e.group)]} 轮结算）" disabled></div>
        <div class="gah-field"><label>奖励说明</label><textarea id="f-reward" rows="2">${esc(e.reward)}</textarea></div>
        <div class="gah-field"><label>惩罚说明</label><textarea id="f-penalty" rows="2">${esc(e.penalty)}</textarea></div>
        <div class="gah-field"><label>奖励/惩罚逻辑（固定）</label><div class="gah-admin-readonly">${esc(JSON.stringify(e.bonus))}<br>${esc(JSON.stringify(e.penaltyOpts))}</div></div>
        <div class="gah-admin-actions"><button class="btn primary" id="f-apply">应用修改</button></div>`;
      formEl.querySelector('#f-apply').onclick = () => {
        e.reward = formEl.querySelector('#f-reward').value.trim();
        e.penalty = formEl.querySelector('#f-penalty').value.trim();
        renderList(); flash('已应用，记得保存');
      };
      return;
    }

    // 房间布局：只读展示
    const cells = ROOM_COLORS.map((c, i) => ({ c, i }));
    formEl.innerHTML = `
      <div class="gah-admin-note">官方固定正面布局（只读）</div>
      <div class="gah-admin-board">
        ${[3, 2, 1, 0].map(row => `<div class="gah-admin-brow">
          <span>${row + 1}F · ${FLOOR_COST[row]}元</span>
          ${[0, 1, 2, 3, 4].map(col => {
            const idx = row * 5 + col;
            const grp = ROOM_GROUPS.findIndex(g => g.includes(idx)) + 1;
            return `<div class="gah-admin-bcell c-${ROOM_COLORS[idx]}">
              ${COLOR_NAMES[ROOM_COLORS[idx]].slice(0, 1)}<i>组${grp}</i></div>`;
          }).join('')}
        </div>`).join('')}
      </div>
      <div class="gah-admin-note" style="margin-top:8px">10 个颜色组：${ROOM_GROUPS.map((g, i) => `组${i + 1}(${g.length}间)`).join('、')}</div>`;
  }

  container.querySelector('#gah-tabs').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-tab]');
    if (!btn) return;
    tab = btn.dataset.tab;
    container.querySelectorAll('.gah-admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderList(); renderForm();
  });

  listEl.addEventListener('click', ev => {
    const item = ev.target.closest('[data-id]');
    if (!item) return;
    const id = item.dataset.id;
    if (tab === 'staff') selected.staff = Number(id);
    else if (tab === 'guests') selected.guests = Number(id);
    else if (tab === 'objectives') selected.objectives = Number(id);
    else if (tab === 'emperors') selected.emperors = Number(id);
    renderList(); renderForm();
  });

  container.querySelector('#gah-save').onclick = () => {
    // 保存前校验
    for (const s of data.STAFF) {
      if (!s.name) return flash('员工 #' + s.id + ' 名称不能为空', false);
      if (!(s.cost >= 0)) return flash('员工 #' + s.id + ' 费用非法', false);
    }
    for (const g of data.GUESTS) {
      if (!g.name) return flash('房客 #' + g.id + ' 名称不能为空', false);
      if (!(g.order || []).every(n => n >= 0 && n <= 4)) return flash('房客 #' + g.id + ' 订单非法', false);
    }
    saveAdminData('hotel', data);
    flash('已保存到本机，正在同步云端…');
    saveConfigToCloud('hotel', data)
      .then(() => flash('✅ 已保存并同步云端，玩家刷新后新开一局生效'))
      .catch(() => flash('⚠️ 已保存到本机，云端同步失败', false));
  };

  container.querySelector('#gah-reset').onclick = () => {
    if (!confirm('确定恢复官方基线数据？当前后台修改会丢失。')) return;
    clearAdminData('hotel');
    data = normalize(null);
    selected = { staff: data.STAFF[0]?.id, guests: data.GUESTS[0]?.id, objectives: 0, emperors: 0 };
    renderList(); renderForm();
    saveConfigToCloud('hotel', data).catch(() => {});
    flash('已恢复官方基线');
  };

  renderList();
  renderForm();
}
