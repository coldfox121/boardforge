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

  // 选中线路后，在两端显示可拖动的连接点
  let handles = '';
  if (selectedRoute !== null && selectedRoute !== undefined) {
    const r = (data.ROUTES || [])[selectedRoute];
    const A = r ? cityMap[r.a] : null;
    const B = r ? cityMap[r.b] : null;
    if (A && B) {
      handles = `<g class="atk-handles">
        <circle class="atk-end" data-end="a" cx="${A.x}" cy="${A.y}" r="9"/>
        <circle class="atk-end" data-end="b" cx="${B.x}" cy="${B.y}" r="9"/>
      </g>`;
    }
  }

  return `<svg id="atk-map" viewBox="0 0 1260 800" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="1260" height="800" fill="#12161d"/>
    <g>${routes}</g>
    <g>${cities}</g>
    ${handles}
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
    <div class="atk-row${selectedRoute === i ? ' sel' : ''}" data-row="${i}">
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
          <div class="atk-maphead">地图预览<span class="atk-tip-inline">拖动城市改坐标 · 依次点两座城市新增线路 · 双击线路快捷编辑 · 右键删除 · 滚轮缩放</span>
            <span class="atk-zoom">
              <button class="btn" data-act="zoom-out" title="缩小">－</button>
              <button class="btn" data-act="zoom-fit" title="适应窗口">适应</button>
              <button class="btn" data-act="zoom-in" title="放大">＋</button>
            </span>
          </div>
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
    applyView();
    bindMap();
    refreshStatus();
  }

  function drawSide() {
    sideEl.innerHTML = buildSideHTML(data, tab, selectedRoute);
    mount.querySelectorAll('.atk-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    refreshStatus();
    scrollToSelectedRow();
  }

  // 从地图点选线路后，把右侧面板滚到对应那一行（已可见时不动）
  function scrollToSelectedRow() {
    if (tab !== 'routes' || selectedRoute === null || selectedRoute === undefined) return;
    const row = sideEl.querySelector(`[data-row="${selectedRoute}"]`);
    if (!row) return;
    const box = sideEl.closest('.atk-side') || sideEl;   // 真正滚动的是外层侧栏
    const r = row.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    if (r.top < c.top || r.bottom > c.bottom) {
      box.scrollTop += r.top - c.top - (c.height - r.height) / 2;
    }
  }

  function redraw() { drawMap(); drawSide(); }

  function cityById(id) { return data.CITIES.find(c => c.id === id); }

  function usedByRoutes(id) {
    return (data.ROUTES || []).filter(r => r.a === id || r.b === id).length;
  }
  function usedByTickets(id) {
    return (data.TICKETS || []).filter(t => t.a === id || t.b === id).length;
  }

  // ===== 地图视图（缩放 / 平移） =====
  const MAP_W = 1260, MAP_H = 800;
  let view = null;          // null = 适应窗口；否则 {x,y,w,h}
  let pop = null;           // 当前浮层（快捷编辑 / 右键菜单）
  let suppressClick = false;  // 拖动后丢弃一次点击

  function currentView() { return view ? { ...view } : { x: 0, y: 0, w: MAP_W, h: MAP_H }; }

  function applyView() {
    const svg = mapSlot.querySelector('#atk-map');
    if (!svg) return;
    svg.setAttribute('viewBox', view ? `${view.x} ${view.y} ${view.w} ${view.h}` : `0 0 ${MAP_W} ${MAP_H}`);
  }

  function clampView(v) {
    const w = Math.min(MAP_W * 1.5, Math.max(MAP_W / 4, v.w));
    const h = w * MAP_H / MAP_W;
    const x = Math.min(MAP_W - w / 4, Math.max(-w / 4, v.x));
    const y = Math.min(MAP_H - h / 4, Math.max(-h / 4, v.y));
    return { x, y, w, h };
  }

  function zoomAt(px, py, factor) {
    const cur = currentView();
    const w = Math.min(MAP_W * 1.5, Math.max(MAP_W / 4, cur.w * factor));
    const h = w * MAP_H / MAP_W;
    const rx = (px - cur.x) / cur.w;
    const ry = (py - cur.y) / cur.h;
    view = clampView({ x: px - rx * w, y: py - ry * h, w, h });
    applyView();
  }

  function zoomCenter(factor) {
    const cur = currentView();
    zoomAt(cur.x + cur.w / 2, cur.y + cur.h / 2, factor);
  }

  function svgPoint(svg, ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function nearestCity(p, maxD) {
    let best = null, bd = maxD;
    (data.CITIES || []).forEach(c => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  // ===== 浮层：快捷编辑 / 右键菜单 =====
  function closePop() { if (pop) { pop.remove(); pop = null; } }

  function showPop(el, ev) {
    closePop();
    pop = el;
    mapSlot.appendChild(el);
    const box = mapSlot.getBoundingClientRect();
    const left = Math.min(Math.max(8, ev.clientX - box.left), Math.max(8, box.width - el.offsetWidth - 8));
    const top = Math.min(Math.max(8, ev.clientY - box.top), Math.max(8, box.height - el.offsetHeight - 8));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function popShell(html) {
    const el = document.createElement('div');
    el.className = 'atk-pop';
    el.innerHTML = html;
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); });
    return el;
  }

  // 双击线路：就地改长度 / 颜色 / 双线
  function openQuickEdit(rid, ev) {
    const r = data.ROUTES[rid];
    if (!r) return;
    selectedRoute = rid;
    const a = cityById(r.a), b = cityById(r.b);
    const el = popShell(`
      <div class="atk-pop-title">线路 ${rid + 1}：${esc(a ? a.zh : '?')} → ${esc(b ? b.zh : '?')}</div>
      <div class="atk-pop-row"><span>长度</span><div class="atk-lenbtns">
        ${[1, 2, 3, 4, 5, 6].map(n => `<button class="atk-chip${r.len === n ? ' on' : ''}" data-len="${n}">${n}</button>`).join('')}
      </div></div>
      <div class="atk-pop-row"><span>颜色</span><div class="atk-swatches">
        ${COLORS.map(c => `<button class="atk-swatch${(r.color || '') === c.v ? ' on' : ''}" data-color="${c.v}" title="${c.n}" style="--sw:${c.hex}"></button>`).join('')}
      </div></div>
      <div class="atk-pop-row"><span>双线</span><div class="atk-lenbtns">
        <button class="atk-chip${r.parallel == null ? ' on' : ''}" data-par="">单</button>
        <button class="atk-chip${r.parallel === 0 ? ' on' : ''}" data-par="0">①</button>
        <button class="atk-chip${r.parallel === 1 ? ' on' : ''}" data-par="1">②</button>
      </div></div>`);
    el.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.len) r.len = Number(btn.dataset.len);
      if (btn.hasAttribute('data-color')) r.color = btn.dataset.color || null;
      if (btn.hasAttribute('data-par')) r.parallel = btn.dataset.par === '' ? null : Number(btn.dataset.par);
      closePop();
      redraw();
    });
    showPop(el, ev);
  }

  // 右键菜单：删除线路 / 城市
  function openCtxMenu(kind, id, ev) {
    const el = popShell(kind === 'route'
      ? '<button data-ctx="edit">✏️ 快捷编辑</button><button data-ctx="del" class="danger">🗑 删除线路</button>'
      : '<button data-ctx="del" class="danger">🗑 删除城市</button>');
    el.classList.add('atk-ctx');
    el.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.ctx === 'edit') { closePop(); openQuickEdit(id, ev); return; }
      if (kind === 'route') {
        data.ROUTES.splice(id, 1);
        selectedRoute = null;
      } else {
        const rn = usedByRoutes(id), tn = usedByTickets(id);
        if (rn || tn) {
          closePop();
          statusEl.className = 'atk-status bad';
          statusEl.textContent = `❌ 该城市仍被 ${rn} 条线路、${tn} 张任务票引用，请先删除相关线路与任务票`;
          return;
        }
        data.CITIES = data.CITIES.filter(c => c.id !== id);
        if (selectedCity === id) selectedCity = null;
      }
      closePop();
      redraw();
    });
    showPop(el, ev);
  }

  // ===== 地图交互（事件委托，只绑定一次） =====
  function bindMap() {
    if (mapSlot.dataset.bound) return;
    mapSlot.dataset.bound = '1';

    mapSlot.addEventListener('click', e => {
      if (pop && !pop.contains(e.target)) closePop();
      const cityEl = e.target.closest('[data-city]');
      const routeEl = e.target.closest('[data-route]');

      if (cityEl) {
        const id = cityEl.dataset.city;
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
        return;
      }

      if (routeEl) {
        selectedRoute = Number(routeEl.dataset.route);
        tab = 'routes';
        drawSide();
        drawMap();
      }
    });

    // 双击线路：快捷编辑
    mapSlot.addEventListener('dblclick', e => {
      const routeEl = e.target.closest('[data-route]');
      if (!routeEl) return;
      e.preventDefault();
      openQuickEdit(Number(routeEl.dataset.route), e);
    });

    // 右键：删除线路 / 城市
    mapSlot.addEventListener('contextmenu', e => {
      const routeEl = e.target.closest('[data-route]');
      const cityEl = e.target.closest('[data-city]');
      if (routeEl) { e.preventDefault(); openCtxMenu('route', Number(routeEl.dataset.route), e); }
      else if (cityEl) { e.preventDefault(); openCtxMenu('city', cityEl.dataset.city, e); }
    });

    mapSlot.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const endEl = e.target.closest('.atk-end');
      if (endEl) { e.preventDefault(); startEndpointDrag(e, endEl); return; }
      const cityEl = e.target.closest('[data-city]');
      if (cityEl) { e.preventDefault(); startCityDrag(e, cityEl); return; }
      if (e.target.closest('[data-route]')) return;   // 点线路不触发平移
      startPan(e);
    });

    // 滚轮缩放（以鼠标位置为中心）
    mapSlot.addEventListener('wheel', e => {
      const svg = mapSlot.querySelector('#atk-map');
      if (!svg) return;
      e.preventDefault();
      const p = svgPoint(svg, e);
      zoomAt(p.x, p.y, e.deltaY > 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
  }

  // 拖动城市改坐标
  function startCityDrag(ev, g) {
    const svg = mapSlot.querySelector('#atk-map');
    const city = cityById(g.dataset.city);
    if (!svg || !city) return;
    closePop();
    const circle = g.querySelector('circle');
    const label = g.querySelector('text');
    let moved = false;
    const onMove = e2 => {
      const p = svgPoint(svg, e2);
      const x = Math.round(Math.min(1240, Math.max(20, p.x)));
      const y = Math.round(Math.min(780, Math.max(20, p.y)));
      if (Math.abs(x - city.x) + Math.abs(y - city.y) > 1) moved = true;
      city.x = x;
      city.y = y;
      if (circle) { circle.setAttribute('cx', x); circle.setAttribute('cy', y); }
      if (label) { label.setAttribute('x', x); label.setAttribute('y', y - 12); }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (moved) { suppressClick = true; redraw(); }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // 拖动选中线路的端点 → 改连接的城市（靠近城市自动吸附）
  function startEndpointDrag(ev, handle) {
    const svg = mapSlot.querySelector('#atk-map');
    const r = data.ROUTES[selectedRoute];
    if (!svg || !r) return;
    closePop();
    const which = handle.dataset.end;
    const A = cityById(r.a), B = cityById(r.b);
    if (!A || !B) return;
    const fixed = which === 'a' ? B : A;
    const moving = which === 'a' ? A : B;
    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    preview.setAttribute('class', 'atk-dragline');
    preview.setAttribute('x1', fixed.x);
    preview.setAttribute('y1', fixed.y);
    preview.setAttribute('x2', moving.x);
    preview.setAttribute('y2', moving.y);
    svg.appendChild(preview);
    let snapEl = null;
    let moved = false;
    const onMove = e2 => {
      const p = svgPoint(svg, e2);
      moved = true;
      preview.setAttribute('x2', p.x);
      preview.setAttribute('y2', p.y);
      const near = nearestCity(p, 60);
      if (snapEl) snapEl.classList.remove('snap');
      snapEl = near ? mapSlot.querySelector(`[data-city="${near.id}"]`) : null;
      if (snapEl) snapEl.classList.add('snap');
    };
    const onUp = e2 => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (snapEl) snapEl.classList.remove('snap');
      preview.remove();
      if (!moved) return;
      const near = nearestCity(svgPoint(svg, e2), 60);
      if (!near || near.id === fixed.id) return;
      if (which === 'a') r.a = near.id; else r.b = near.id;
      redraw();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // 拖空白处平移地图
  function startPan(ev) {
    const svg = mapSlot.querySelector('#atk-map');
    if (!svg) return;
    closePop();
    const start = currentView();
    const startP = svgPoint(svg, ev);
    let moved = false;
    const onMove = e2 => {
      const p = svgPoint(svg, e2);
      const dx = p.x - startP.x, dy = p.y - startP.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (!moved) return;
      view = clampView({ x: start.x - dx, y: start.y - dy, w: start.w, h: start.h });
      applyView();
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // 侧栏与工具栏事件（挂在 mount 上，下次重渲染时随 DOM 一起销毁）
  mount.addEventListener('click', (e) => {
    if (pop && !pop.contains(e.target)) closePop();
    const el = e.target.closest('[data-act]');
    if (!el || !mount.contains(el)) return;
    const act = el.dataset.act;

    if (act === 'tab') {
      tab = el.dataset.tab;
      drawSide();
      return;
    }

    if (act === 'zoom-in') { zoomCenter(1 / 1.25); return; }
    if (act === 'zoom-out') { zoomCenter(1.25); return; }
    if (act === 'zoom-fit') { view = null; applyView(); return; }

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
