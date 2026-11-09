// 铁路环游 · 可视化数据编辑器（城市 / 线路 / 任务票）
// 约定：所有配置项都用可视化控件编辑，不向用户暴露 JSON
import { saveAdminData, clearAdminData } from './admin.js?v=35';
import { saveConfigToCloud } from './config-sync.js?v=35';

const COLORS = [
  { v: 'purple', n: '紫色', hex: '#8e5bd0' },
  { v: 'white', n: '白色', hex: '#dfe6ee' },
  { v: 'blue', n: '蓝色', hex: '#3f7fd0' },
  { v: 'yellow', n: '黄色', hex: '#e6c246' },
  { v: 'orange', n: '橙色', hex: '#dd8438' },
  { v: 'black', n: '黑色', hex: '#4a5568' },
  { v: 'red', n: '红色', hex: '#cf4a4a' },
  { v: 'green', n: '绿色', hex: '#3f9c5a' },
  { v: '', n: '灰色（任意颜色）', hex: '#9aa4b2' }
];
const COLOR_HEX = {};
COLORS.forEach(c => { COLOR_HEX[c.v] = c.hex; });

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== 校验（与后台保存共用） =====
export function validateTicketData(data) {
  const errors = [];
  if (!Array.isArray(data.CITIES)) errors.push('城市列表缺失');
  else {
    if (data.CITIES.length < 2) errors.push('城市至少需要 2 座');
    data.CITIES.forEach((c, i) => {
      if (!c.id) errors.push(`第 ${i + 1} 座城市缺少 id`);
      if (!c.zh) errors.push(`第 ${i + 1} 座城市缺少名称`);
      if (typeof c.x !== 'number' || typeof c.y !== 'number') errors.push(`第 ${i + 1} 座城市缺少坐标`);
    });
  }
  const ids = new Set((Array.isArray(data.CITIES) ? data.CITIES : []).map(c => c.id));
  if (!Array.isArray(data.ROUTES)) errors.push('线路列表缺失');
  else data.ROUTES.forEach((r, i) => {
    if (!ids.has(r.a) || !ids.has(r.b)) errors.push(`第 ${i + 1} 条线路的城市无效`);
    if (!(typeof r.len === 'number' && r.len >= 1 && r.len <= 6)) errors.push(`第 ${i + 1} 条线路长度必须是 1-6`);
    if (r.color && !COLORS.some(c => c.v === r.color)) errors.push(`第 ${i + 1} 条线路颜色无效`);
  });
  if (!Array.isArray(data.TICKETS)) errors.push('任务票列表缺失');
  else data.TICKETS.forEach((t, i) => {
    if (!ids.has(t.a) || !ids.has(t.b)) errors.push(`第 ${i + 1} 张任务票的城市无效`);
    if (typeof t.points !== 'number') errors.push(`第 ${i + 1} 张任务票缺少分值`);
  });
  return errors;
}

// ===== 地图预览（SVG） =====
export function buildMapSVG(data, selectedCity, selectedRoute) {
  const cityMap = {};
  (data.CITIES || []).forEach(c => { cityMap[c.id] = c; });

  const routes = (data.ROUTES || []).map((r, i) => {
    const A = cityMap[r.a], B = cityMap[r.b];
    if (!A || !B) return '';
    const dx = B.x - A.x, dy = B.y - A.y;
    const L = Math.hypot(dx, dy) || 1;
    let ox = 0, oy = 0;
    if (r.parallel !== null && r.parallel !== undefined) {
      const sgn = r.parallel === 0 ? -1 : 1;
      ox = (-dy / L) * 5.5 * sgn;
      oy = (dx / L) * 5.5 * sgn;
    }
    const x1 = A.x + ox, y1 = A.y + oy, x2 = B.x + ox, y2 = B.y + oy;
    const hex = r.color ? (COLOR_HEX[r.color] || '#888') : COLOR_HEX[''];
    const isSel = selectedRoute === i;
    return `<g class="atk-route${isSel ? ' sel' : ''}">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${hex}" stroke-width="${isSel ? 7 : 4.5}" stroke-linecap="round"/>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="transparent" stroke-width="14" data-route="${i}" class="atk-hit"/>
      <text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" class="atk-len">${r.len}</text>
    </g>`;
  }).join('');

  const cities = (data.CITIES || []).map(c => {
    const sel = selectedCity === c.id;
    return `<g class="atk-city${sel ? ' sel' : ''}" data-city="${esc(c.id)}">
      <circle cx="${c.x}" cy="${c.y}" r="${sel ? 9 : 6.5}" fill="${sel ? '#ffd166' : '#e8eaef'}" stroke="#0f1115" stroke-width="2"/>
      <text x="${c.x}" y="${c.y - 12}" class="atk-city-name">${esc(c.zh)}</text>
    </g>`;
  }).join('');

  return `<svg id="atk-map" viewBox="0 0 1260 800" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="1260" height="800" fill="#12161d"/>
    <g>${routes}</g>
    <g>${cities}</g>
  </svg>`;
}

// ===== 右侧面板 =====
function cityOptions(data, current) {
  return (data.CITIES || []).map(c =>
    `<option value="${esc(c.id)}"${c.id === current ? ' selected' : ''}>${esc(c.zh)}</option>`
  ).join('');
}

export function buildCitiesHTML(data) {
  const rows = (data.CITIES || []).map((c, i) => `
    <div class="atk-row">
      <span class="atk-index">${i + 1}</span>
      <input class="atk-input atk-name" data-act="city-name" data-id="${esc(c.id)}" value="${esc(c.zh)}" placeholder="城市名称">
      <input class="atk-input atk-num" type="number" data-act="city-x" data-id="${esc(c.id)}" value="${c.x}" title="横坐标">
      <input class="atk-input atk-num" type="number" data-act="city-y" data-id="${esc(c.id)}" value="${c.y}" title="纵坐标">
      <button class="atk-del" data-act="city-del" data-id="${esc(c.id)}" title="删除城市">✕</button>
    </div>`).join('');
  return `
    <div class="atk-panel-head">
      <strong>城市</strong>
      <button class="btn" data-act="city-add">＋ 新增城市</button>
    </div>
    <p class="atk-tip">可直接在地图预览里拖动城市调整位置；删除城市前需先删除引用它的线路与任务票。</p>
    <div class="atk-list">${rows}</div>`;
}

export function buildRoutesHTML(data, selectedRoute) {
  const rows = (data.ROUTES || []).map((r, i) => `
    <div class="atk-row${selectedRoute === i ? ' sel' : ''}">
      <span class="atk-index">${i + 1}</span>
      <select class="atk-input" data-act="route-a" data-idx="${i}">${cityOptions(data, r.a)}</select>
      <span class="atk-arrow">→</span>
      <select class="atk-input" data-act="route-b" data-idx="${i}">${cityOptions(data, r.b)}</select>
      <select class="atk-input atk-num" data-act="route-len" data-idx="${i}">
        ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === r.len ? ' selected' : ''}>${n} 格</option>`).join('')}
      </select>
      <select class="atk-input" data-act="route-color" data-idx="${i}">
        ${COLORS.map(c => `<option value="${c.v}"${(r.color || '') === c.v ? ' selected' : ''}>${c.n}</option>`).join('')}
      </select>
      <select class="atk-input atk-num" data-act="route-parallel" data-idx="${i}">
        <option value=""${r.parallel === null || r.parallel === undefined ? ' selected' : ''}>单线</option>
        <option value="0"${r.parallel === 0 ? ' selected' : ''}>双线①</option>
        <option value="1"${r.parallel === 1 ? ' selected' : ''}>双线②</option>
      </select>
      <button class="atk-del" data-act="route-del" data-idx="${i}" title="删除线路">✕</button>
    </div>`).join('');
  return `
    <div class="atk-panel-head">
      <strong>线路</strong>
      <button class="btn" data-act="route-add">＋ 新增线路</button>
    </div>
    <p class="atk-tip">在地图预览中依次点击两座城市，可以快速新增一条线路。</p>
    <div class="atk-list">${rows}</div>`;
}

export function buildTicketsHTML(data) {
  const rows = (data.TICKETS || []).map((t, i) => `
    <div class="atk-row">
      <span class="atk-index">${i + 1}</span>
      <select class="atk-input" data-act="ticket-a" data-idx="${i}">${cityOptions(data, t.a)}</select>
      <span class="atk-arrow">→</span>
      <select class="atk-input" data-act="ticket-b" data-idx="${i}">${cityOptions(data, t.b)}</select>
      <input class="atk-input atk-num" type="number" data-act="ticket-points" data-idx="${i}" value="${t.points}" title="分值">
      <span class="atk-unit">分</span>
      <button class="atk-del" data-act="ticket-del" data-idx="${i}" title="删除任务票">✕</button>
    </div>`).join('');
  return `
    <div class="atk-panel-head">
      <strong>任务票</strong>
      <button class="btn" data-act="ticket-add">＋ 新增任务票</button>
    </div>
    <p class="atk-tip">分值越高，完成后得分越多；未完成会扣同样分数。</p>
    <div class="atk-list">${rows}</div>`;
}

function buildSideHTML(data, tab, selectedRoute) {
  if (tab === 'cities') return buildCitiesHTML(data);
  if (tab === 'tickets') return buildTicketsHTML(data);
  return buildRoutesHTML(data, selectedRoute);
}

export function buildEditorShell(hasOverride) {
  return `
    <div class="atk">
      <div class="admin-header">
        <h2>🛠 铁路环游 · 数据编辑</h2>
        <div class="admin-head-right">
          <div class="admin-status" id="atk-note">${hasOverride ? '⚠️ 正在编辑已保存的自定义数据' : 'ℹ️ 当前使用官方基线数据'}</div>
          <button class="btn" id="admin-back">← 返回大厅</button>
        </div>
      </div>
      <div class="atk-toolbar">
        <button class="btn primary" data-act="save">💾 保存并同步云端</button>
        <button class="btn" data-act="reset">↺ 恢复官方基线</button>
        <span class="atk-status" id="atk-status"></span>
      </div>
      <div class="atk-main">
        <div class="atk-mapwrap">
          <div class="atk-maphead">地图预览<span class="atk-tip-inline">悬停线路显示长度 · 拖动城市改坐标 · 依次点两座城市新增线路</span></div>
          <div class="atk-mapbox" id="atk-map-slot"></div>
        </div>
        <div class="atk-side">
          <div class="atk-tabs">
            <button class="atk-tab" data-act="tab" data-tab="routes">线路</button>
            <button class="atk-tab" data-act="tab" data-tab="cities">城市</button>
            <button class="atk-tab" data-act="tab" data-tab="tickets">任务票</button>
          </div>
          <div id="atk-side"></div>
        </div>
      </div>
    </div>`;
}

// ===== 编辑器主体 =====
export function renderTicketEditor(container, baseData, adminData) {
  let data = clone(adminData || baseData);
  let tab = 'routes';
  let selectedCity = null;
  let selectedRoute = null;

  container.innerHTML = '<div class="atk-mount"></div>';
  const mount = container.querySelector('.atk-mount');
  mount.innerHTML = buildEditorShell(!!adminData);

  const mapSlot = mount.querySelector('#atk-map-slot');
  const sideEl = mount.querySelector('#atk-side');
  const statusEl = mount.querySelector('#atk-status');

  mount.querySelector('#admin-back')?.addEventListener('click', () => { location.hash = '#/lobby'; });

  function refreshStatus() {
    const errs = validateTicketData(data);
    statusEl.className = 'atk-status ' + (errs.length ? 'bad' : 'ok');
    statusEl.textContent = errs.length
      ? `❌ ${errs.length} 个问题：${errs.slice(0, 3).join('；')}${errs.length > 3 ? '…' : ''}`
      : '✅ 数据校验通过';
  }

  function drawMap() {
    mapSlot.innerHTML = buildMapSVG(data, selectedCity, selectedRoute);
    bindMap();
    refreshStatus();
  }

  function drawSide() {
    sideEl.innerHTML = buildSideHTML(data, tab, selectedRoute);
    mount.querySelectorAll('.atk-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    refreshStatus();
  }

  function redraw() { drawMap(); drawSide(); }

  function cityById(id) { return data.CITIES.find(c => c.id === id); }

  function usedByRoutes(id) {
    return (data.ROUTES || []).filter(r => r.a === id || r.b === id).length;
  }
  function usedByTickets(id) {
    return (data.TICKETS || []).filter(t => t.a === id || t.b === id).length;
  }

  // 地图交互：点城市选点/连线，拖动城市改坐标，点线路选中
  function bindMap() {
    const svg = mapSlot.querySelector('#atk-map');
    if (!svg) return;

    svg.querySelectorAll('[data-route]').forEach(el => {
      el.addEventListener('click', () => {
        selectedRoute = Number(el.dataset.route);
        tab = 'routes';
        drawSide();
        drawMap();
      });
    });

    svg.querySelectorAll('[data-city]').forEach(g => {
      const id = g.dataset.city;
      let suppressClick = false;
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        if (suppressClick) { suppressClick = false; return; }
        if (selectedCity && selectedCity !== id) {
          // 依次点击两座城市 → 新增线路
          data.ROUTES.push({ a: selectedCity, b: id, len: 2, color: null, parallel: null });
          selectedRoute = data.ROUTES.length - 1;
          selectedCity = null;
          tab = 'routes';
          redraw();
          return;
        }
        selectedCity = selectedCity === id ? null : id;
        drawMap();
      });

      // 拖动城市
      g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const city = cityById(id);
        if (!city) return;
        const circle = g.querySelector('circle');
        const label = g.querySelector('text');
        let moved = false;

        const toSvg = (ev) => {
          const pt = svg.createSVGPoint();
          pt.x = ev.clientX;
          pt.y = ev.clientY;
          return pt.matrixTransform(svg.getScreenCTM().inverse());
        };

        const onMove = (ev) => {
          const p = toSvg(ev);
          const x = Math.round(Math.min(1240, Math.max(20, p.x)));
          const y = Math.round(Math.min(780, Math.max(20, p.y)));
          if (Math.abs(x - city.x) + Math.abs(y - city.y) > 1) moved = true;
          city.x = x;
          city.y = y;
          circle.setAttribute('cx', x);
          circle.setAttribute('cy', y);
          label.setAttribute('x', x);
          label.setAttribute('y', y - 12);
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          if (moved) { suppressClick = true; redraw(); }
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
    });
  }

  // 侧栏与工具栏事件（挂在 mount 上，下次重渲染时随 DOM 一起销毁）
  mount.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !mount.contains(el)) return;
    const act = el.dataset.act;

    if (act === 'tab') {
      tab = el.dataset.tab;
      drawSide();
      return;
    }

    if (act === 'save') {
      const errs = validateTicketData(data);
      if (errs.length) {
        statusEl.className = 'atk-status bad';
        statusEl.textContent = `❌ 请先修正问题：${errs[0]}`;
        return;
      }
      saveAdminData('ticket', data);
      statusEl.className = 'atk-status';
      statusEl.textContent = '保存中…';
      saveConfigToCloud('ticket', data)
        .then(() => {
          document.getElementById('atk-note').textContent = '⚠️ 正在编辑已保存的自定义数据';
          statusEl.className = 'atk-status ok';
          statusEl.textContent = '✅ 已保存并同步云端，玩家下一局生效';
        })
        .catch(() => {
          statusEl.className = 'atk-status bad';
          statusEl.textContent = '⚠️ 已保存到本机，云端同步失败';
        });
      return;
    }

    if (act === 'reset') {
      if (!confirm('确定恢复官方基线？当前自定义数据会被覆盖')) return;
      clearAdminData('ticket');
      data = clone(baseData);
      selectedCity = null;
      selectedRoute = null;
      saveConfigToCloud('ticket', baseData).catch(() => {});
      document.getElementById('atk-note').textContent = 'ℹ️ 当前使用官方基线数据';
      redraw();
      statusEl.className = 'atk-status ok';
      statusEl.textContent = '✅ 已恢复官方基线（云端同步中）';
      return;
    }

    if (act === 'route-add') {
      const a = data.CITIES[0], b = data.CITIES[1] || data.CITIES[0];
      data.ROUTES.push({ a: a.id, b: b.id, len: 2, color: null, parallel: null });
      selectedRoute = data.ROUTES.length - 1;
      redraw();
      return;
    }
    if (act === 'route-del') {
      data.ROUTES.splice(Number(el.dataset.idx), 1);
      selectedRoute = null;
      redraw();
      return;
    }
    if (act === 'ticket-add') {
      const a = data.CITIES[0], b = data.CITIES[1] || data.CITIES[0];
      data.TICKETS.push({ id: 't_' + Date.now().toString(36), a: a.id, b: b.id, points: 10 });
      redraw();
      return;
    }
    if (act === 'ticket-del') {
      data.TICKETS.splice(Number(el.dataset.idx), 1);
      redraw();
      return;
    }
    if (act === 'city-add') {
      const id = 'city_' + Date.now().toString(36);
      data.CITIES.push({ id, zh: '新城市', x: 630, y: 400 });
      tab = 'cities';
      redraw();
      return;
    }
    if (act === 'city-del') {
      const id = el.dataset.id;
      const r = usedByRoutes(id), t = usedByTickets(id);
      if (r || t) {
        alert(`该城市仍被 ${r} 条线路、${t} 张任务票引用，请先删除相关线路与任务票`);
        return;
      }
      data.CITIES = data.CITIES.filter(c => c.id !== id);
      redraw();
      return;
    }
  });

  // 表单修改（下拉、数字、文本）
  mount.addEventListener('change', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const idx = Number(el.dataset.idx);

    if (act === 'route-a') { data.ROUTES[idx].a = el.value; redraw(); }
    else if (act === 'route-b') { data.ROUTES[idx].b = el.value; redraw(); }
    else if (act === 'route-len') { data.ROUTES[idx].len = Number(el.value); redraw(); }
    else if (act === 'route-color') { data.ROUTES[idx].color = el.value || null; redraw(); }
    else if (act === 'route-parallel') {
      data.ROUTES[idx].parallel = el.value === '' ? null : Number(el.value);
      redraw();
    }
    else if (act === 'ticket-a') { data.TICKETS[idx].a = el.value; redraw(); }
    else if (act === 'ticket-b') { data.TICKETS[idx].b = el.value; redraw(); }
    else if (act === 'ticket-points') { data.TICKETS[idx].points = Number(el.value); refreshStatus(); }
    else if (act === 'city-x' || act === 'city-y') {
      const c = cityById(el.dataset.id);
      if (!c) return;
      if (act === 'city-x') c.x = Number(el.value);
      else c.y = Number(el.value);
      drawMap();
    }
  });

  // 名称输入实时更新（不重绘侧栏，避免输入框失焦）
  mount.addEventListener('input', (e) => {
    const el = e.target.closest('[data-act="city-name"]');
    if (!el) return;
    const c = cityById(el.dataset.id);
    if (!c) return;
    c.zh = el.value;
    drawMap();
  });

  drawMap();
  drawSide();
}
