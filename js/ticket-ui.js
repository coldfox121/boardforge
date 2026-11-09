// 铁路环游：欧洲版 · 交互界面（纯 DOM + SVG，无图片资源）
// 交互原则与璀璨宝石一致：直接操作，无“选择动作类型”按钮。
// 点击地图路线 = 占领；点击右侧车票 = 抽牌；点击盲抽堆 = 盲抽。
import { initGame, applyAction, validateAction, isTicketComplete } from './ticket-engine.js?v=31';
import { pickAction } from './ticket-ai.js?v=31';
import {
  CITIES, CITY_MAP, ROUTES, TICKET_MAP, COLOR_NAMES,
  STATION_COSTS, STATIONS_PER_PLAYER
} from './ticket-data.js?v=31';

const PCOLORS = ['#e05c5c', '#4a90d9', '#43b581', '#e8c34a', '#a06bd0'];
const HEX = {
  purple: '#8e5bd0', white: '#dfe6ee', blue: '#3f7fd0', yellow: '#e6c246',
  orange: '#dd8438', black: '#4a5568', red: '#cf4a4a', green: '#3f9c5a', loco: '#c77dff'
};
const HAND_ORDER = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'black', 'white', 'loco'];
const SHORT_NAME = {
  purple: '紫', white: '白', blue: '蓝', yellow: '黄', orange: '橙',
  black: '黑', red: '红', green: '绿', loco: '彩'
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cityName(id) { return CITY_MAP[id] ? CITY_MAP[id].zh : id; }

// ===== 几何：路线两端坐标 + 双线偏移 =====
function routeGeom(i) {
  const r = ROUTES[i];
  const A = CITY_MAP[r.a], B = CITY_MAP[r.b];
  const dx = B.x - A.x, dy = B.y - A.y;
  const L = Math.hypot(dx, dy) || 1;
  let ox = 0, oy = 0;
  if (r.parallel !== null && r.parallel !== undefined) {
    const nx = -dy / L, ny = dx / L;
    const sgn = r.parallel === 0 ? -1 : 1;
    ox = nx * 5.5 * sgn;
    oy = ny * 5.5 * sgn;
  }
  return { x1: A.x + ox, y1: A.y + oy, x2: B.x + ox, y2: B.y + oy, L };
}

// ===== 任务票卡片 =====
function ticketHTML(id, opts = {}) {
  const t = TICKET_MAP[id];
  if (!t) return '';
  const cls = [
    'ttr-ticket',
    t.long ? 'long' : '',
    opts.selected ? 'selected' : '',
    opts.clickable ? 'clickable' : '',
    opts.focus ? 'focused' : '',
    opts.ok === true ? 'ok' : opts.ok === false ? 'bad' : ''
  ].filter(Boolean).join(' ');
  const pts = (opts.ok === false ? '-' : '+') + t.points;
  return `
    <div class="${cls}" ${opts.attrs || ''}>
      <span class="ttr-ticket-pts">${pts}</span>
      <span class="ttr-ticket-line">${esc(cityName(t.a))} → ${esc(cityName(t.b))}</span>
      ${t.long ? '<span class="ttr-ticket-tag">长途</span>' : ''}
      ${opts.selected ? '<span class="ttr-ticket-check">✓</span>' : ''}
    </div>`;
}

export class TicketGame {
  constructor(container, options = {}) {
    this.root = typeof container === 'string' ? document.getElementById(container) : container;
    this.playerNames = options.playerNames || ['你', 'AI-1', 'AI-2'];
    this.humanIndex = options.humanIndex || 0;
    this.state = null;
    this.mode = null;          // null | 'station'
    this.focusTicket = null;   // 高亮某张票的起终点城市
    this.msg = '';
    this.sel = new Set();
    this.selKey = '';
    this._aiTimer = null;
    this._bound = false;
  }

  start() {
    this.state = initGame(this.playerNames);
    this.state.players.forEach((p, i) => { p.isAI = i !== this.humanIndex; });
    this.mode = null;
    this.focusTicket = null;
    this.msg = '';
    this.sel = new Set();
    this.selKey = '';
    this.bind();
    this.render();
    this.scheduleAI();
  }

  bind() {
    if (this._bound || !this.root) return;
    this._bound = true;
    this.root.addEventListener('click', e => this.onClick(e));
  }

  // ===== 交互 =====
  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !this.root.contains(el)) return;
    const act = el.dataset.act;
    const s = this.state;
    if (!s) return;

    // 只允许在自己回合操作（游戏结束后除重开外都忽略）
    const myTurn = s.phase !== 'ended' && s.currentPlayer === this.humanIndex;

    switch (act) {
      case 'claim':
        if (!myTurn) return;
        this.mode = null;
        this.do({ type: 'CLAIM_ROUTE', routeId: Number(el.dataset.rid) });
        break;

      case 'draw-faceup':
        if (!myTurn) return;
        this.do({ type: 'DRAW_CARDS', source: 'faceup', index: Number(el.dataset.index) });
        break;

      case 'draw-deck':
        if (!myTurn) return;
        this.do({ type: 'DRAW_CARDS', source: 'deck' });
        break;

      case 'draw-tickets':
        if (!myTurn) return;
        this.do({ type: 'DRAW_TICKETS' });
        break;

      case 'station-mode':
        if (!myTurn) return;
        this.mode = this.mode === 'station' ? null : 'station';
        this.msg = this.mode === 'station' ? '请点击地图上的空城市放置火车站' : '';
        this.render();
        break;

      case 'station-city':
        if (!myTurn) return;
        this.mode = null;
        this.do({ type: 'BUILD_STATION', cityId: el.dataset.city });
        break;

      case 'focus-ticket': {
        const id = el.dataset.id;
        this.focusTicket = this.focusTicket === id ? null : id;
        this.render();
        break;
      }

      case 'toggle-sel': {
        const id = el.dataset.id;
        if (this.sel.has(id)) this.sel.delete(id);
        else this.sel.add(id);
        this.render();
        break;
      }

      case 'confirm-initial': {
        if (this.sel.size < 2) { this.msg = '开局至少要保留 2 张任务牌'; this.render(); return; }
        this.do({ type: 'KEEP_INITIAL_TICKETS', ids: [...this.sel] });
        break;
      }

      case 'confirm-drawn': {
        if (this.sel.size < 1) { this.msg = '至少要保留 1 张任务牌'; this.render(); return; }
        this.do({ type: 'KEEP_TICKETS', ids: [...this.sel] });
        break;
      }

      case 'pay-tunnel':
        this.do({ type: 'PAY_TUNNEL' });
        break;

      case 'decline-tunnel':
        this.do({ type: 'DECLINE_TUNNEL' });
        break;

      case 'restart':
        this.start();
        break;
    }
  }

  do(action) {
    const s = this.state;
    const err = validateAction(s, this.humanIndex, action);
    if (err) { this.msg = err; this.render(); return; }
    try {
      this.state = applyAction(s, this.humanIndex, action);
      this.msg = '';
    } catch (e) {
      this.msg = e.message || '操作失败';
      this.render();
      return;
    }
    this.render();
    this.scheduleAI();
  }

  scheduleAI() {
    clearTimeout(this._aiTimer);
    const s = this.state;
    if (!s || s.phase === 'ended' || s.currentPlayer === this.humanIndex) return;
    this._aiTimer = setTimeout(() => {
      if (!this.root || !this.root.isConnected || this.root.classList.contains('hidden') || this.root.offsetParent === null) return;
      const st = this.state;
      if (!st || st.phase === 'ended' || st.currentPlayer === this.humanIndex) return;
      const idx = st.currentPlayer;
      const action = pickAction(st, idx);
      if (!action) { this.msg = 'AI 没有可执行的动作'; this.render(); return; }
      try {
        this.state = applyAction(st, idx, action);
      } catch (e) {
        this.msg = 'AI 动作失败: ' + (e.message || e);
        this.render();
        return;
      }
      this.render();
      this.scheduleAI();
    }, 420);
  }

  // ===== 渲染 =====
  render() {
    const s = this.state;
    if (!s || !this.root || this.root.classList.contains('hidden')) return;

    this.syncSelection();

    const my = s.players[this.humanIndex];
    const myTurn = s.phase !== 'ended' && s.currentPlayer === this.humanIndex;
    const idle = myTurn && s.turnPhase === 'idle';

    // 可占领路线 / 可建站城市（只在自己的空闲回合计算）
    const claimable = new Array(ROUTES.length).fill(false);
    const stationCities = new Set();
    if (idle) {
      for (let i = 0; i < ROUTES.length; i++) {
        claimable[i] = validateAction(s, this.humanIndex, { type: 'CLAIM_ROUTE', routeId: i }) === null;
      }
      if (this.mode === 'station' && my.stations > 0) {
        for (const c of Object.keys(CITY_MAP)) {
          if (validateAction(s, this.humanIndex, { type: 'BUILD_STATION', cityId: c }) === null) stationCities.add(c);
        }
      }
    }

    this.root.innerHTML = `
      <div class="ttr-shell">
        <div class="ttr-players">${this.playersHTML(s)}</div>
        <div class="ttr-body">
          <div class="ttr-board-wrap">${this.boardHTML(s, claimable, stationCities)}</div>
          <aside class="ttr-panel">${this.panelHTML(s, myTurn, idle, my)}</aside>
        </div>
        <div class="ttr-me">${this.meHTML(s, my)}</div>
        <div class="ttr-status ${this.msg ? 'warn' : ''}">${esc(this.msg || this.hintText(s, myTurn))}</div>
        ${this.promptHTML(s, myTurn)}
      </div>`;
  }

  playersHTML(s) {
    return s.players.map((p, i) => `
      <div class="ttr-chip ${i === s.currentPlayer && s.phase !== 'ended' ? 'active' : ''}" style="--pc:${PCOLORS[i]}">
        <span class="ttr-chip-name">${esc(p.name)}${i === this.humanIndex ? '（我）' : ''}</span>
        <span class="ttr-chip-stat">🏆${p.score} · 🚃${p.trains} · 🚉${p.stations} · 🎫${p.tickets.length}</span>
      </div>`).join('');
  }

  boardHTML(s, claimable, stationCities) {
    const routes = ROUTES.map((r, i) => {
      const g = routeGeom(i);
      const owner = s.routeOwner[i];
      const color = owner !== null ? PCOLORS[owner] : (HEX[r.color] || '#8b95a3');
      const t0 = 9 / g.L;
      const t1 = 1 - 9 / g.L;
      const span = (t1 - t0) / r.len;

      const segs = [];
      for (let k = 0; k < r.len; k++) {
        const a = t0 + span * (k + 0.12);
        const b = t0 + span * (k + 0.88);
        const x1 = g.x1 + (g.x2 - g.x1) * a, y1 = g.y1 + (g.y2 - g.y1) * a;
        const x2 = g.x1 + (g.x2 - g.x1) * b, y2 = g.y1 + (g.y2 - g.y1) * b;
        segs.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${owner !== null ? 8 : 7}" stroke-linecap="round"/>`);
      }

      const halo = r.tunnel
        ? `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#0b1119" stroke-width="14" stroke-linecap="round" opacity=".85"/>`
        : '';

      let ferries = '';
      for (let k = 0; k < (r.ferries || 0); k++) {
        const tc = t0 + span * (k + 0.5);
        const cx = g.x1 + (g.x2 - g.x1) * tc;
        const cy = g.y1 + (g.y2 - g.y1) * tc;
        ferries += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="#fff" stroke="#0b1119" stroke-width="1.2"/>`;
      }

      const cls = [
        'ttr-route',
        owner !== null ? (owner === this.humanIndex ? 'mine' : 'foe') : '',
        claimable[i] ? 'claimable' : ''
      ].filter(Boolean).join(' ');

      return `<g class="${cls}" data-rid="${i}">
        ${halo}${segs.join('')}${ferries}
        <line class="ttr-hit" data-act="claim" data-rid="${i}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}"/>
      </g>`;
    }).join('');

    const cities = CITIES.map(c => {
      const stOwner = s.cityStations[c.id];
      const focusT = this.focusTicket ? TICKET_MAP[this.focusTicket] : null;
      const focused = focusT && (focusT.a === c.id || focusT.b === c.id);
      const selectable = stationCities.has(c.id);
      const cls = ['ttr-city', focused ? 'focused' : '', selectable ? 'selectable' : ''].filter(Boolean).join(' ');
      return `<g class="${cls}" ${selectable ? `data-act="station-city" data-city="${c.id}"` : ''}>
        <circle class="ttr-city-halo" cx="${c.x}" cy="${c.y}" r="10"/>
        <circle class="ttr-city-dot" cx="${c.x}" cy="${c.y}" r="5"/>
        ${stOwner !== undefined ? `<circle class="ttr-station" cx="${c.x}" cy="${c.y}" r="8.5" stroke="${PCOLORS[stOwner]}"/>` : ''}
        ${selectable ? `<circle class="ttr-city-hit" cx="${c.x}" cy="${c.y}" r="16"/>` : ''}
        <text x="${c.x}" y="${c.y + 18}" text-anchor="middle">${esc(c.zh)}</text>
      </g>`;
    }).join('');

    return `<svg class="ttr-board" viewBox="0 0 1260 800" preserveAspectRatio="xMidYMid meet">
      <g class="ttr-routes">${routes}</g>
      <g class="ttr-cities">${cities}</g>
    </svg>`;
  }

  panelHTML(s, myTurn, idle, my) {
    const faceup = s.faceUp.map((c, i) => {
      if (!c) return `<div class="ttr-card empty">—</div>`;
      // 面朝上的车头只能作为本回合第一张
      const blockLoco = c === 'loco' && s.drawnThisTurn > 0;
      const disabled = !myTurn || s.turnPhase === 'tunnel' || s.turnPhase === 'tickets' || blockLoco;
      return `<button class="ttr-card ${c === 'loco' ? 'loco' : ''}" style="--cc:${HEX[c] || '#888'}"
        data-act="draw-faceup" data-index="${i}" ${disabled ? 'disabled' : ''}>
        <span>${SHORT_NAME[c] || '?'}</span>
      </button>`;
    }).join('');

    const canDrawTicket = idle && s.ticketDeck.length > 0;
    const canStation = idle && my.stations > 0;

    const tickets = my.tickets.length
      ? my.tickets.map(id => ticketHTML(id, {
          focus: this.focusTicket === id,
          ok: isTicketComplete(s, this.humanIndex, id),
          clickable: true,
          attrs: `data-act="focus-ticket" data-id="${id}"`
        })).join('')
      : '<p class="ttr-dim">暂无任务牌</p>';

    const log = (s.log || []).slice(-7).reverse().map(t => `<p>${esc(t)}</p>`).join('');

    return `
      <section class="ttr-block">
        <h4>🎫 车票市场 <span class="ttr-dim">牌堆 ${s.trainDeck.length} 张</span></h4>
        <div class="ttr-market">
          ${faceup}
          <button class="ttr-deck" data-act="draw-deck" ${!myTurn || (s.turnPhase !== 'idle' && s.turnPhase !== 'drawing') || s.drawnThisTurn >= 2 ? 'disabled' : ''}>
            盲抽<small>${s.trainDeck.length + s.discard.length} 张</small>
          </button>
        </div>
      </section>

      <section class="ttr-block ttr-btn-row">
        <button class="ttr-btn" data-act="draw-tickets" ${canDrawTicket ? '' : 'disabled'}>
          抽任务牌<small>剩 ${s.ticketDeck.length}</small>
        </button>
        <button class="ttr-btn ${this.mode === 'station' ? 'active' : ''}" data-act="station-mode" ${canStation ? '' : 'disabled'}>
          建车站<small>剩 ${my.stations} 座 · 需 ${my.stations > 0 ? STATION_COSTS[STATIONS_PER_PLAYER - my.stations] : 0} 张同色</small>
        </button>
      </section>

      <section class="ttr-block">
        <h4>🎯 我的任务牌 <span class="ttr-dim">点击可高亮城市</span></h4>
        <div class="ttr-ticket-list">${tickets}</div>
      </section>

      <section class="ttr-block ttr-log">
        <h4>📜 记录</h4>
        ${log || '<p class="ttr-dim">—</p>'}
      </section>`;
  }

  meHTML(s, my) {
    const hand = HAND_ORDER.map(c => {
      const n = my.hand[c] || 0;
      if (!n) return '';
      return `<span class="ttr-hand-chip ${c === 'loco' ? 'loco' : ''}" style="--cc:${HEX[c]}"><b>${n}</b>${SHORT_NAME[c]}</span>`;
    }).join('');
    const total = HAND_ORDER.reduce((sum, c) => sum + (my.hand[c] || 0), 0);
    return `
      <div class="ttr-me-name" style="--pc:${PCOLORS[this.humanIndex]}">${esc(my.name)}</div>
      <div class="ttr-me-stats">
        <span>🚃 车厢 ${my.trains}</span>
        <span>🚉 火车站 ${my.stations}</span>
        <span>🎫 车票 ${total}</span>
        <span>🏆 分数 ${my.score}</span>
      </div>
      <div class="ttr-hand">${hand || '<span class="ttr-dim">手上没有车票</span>'}</div>`;
  }

  hintText(s, myTurn) {
    if (s.phase === 'ended') return '游戏结束';
    if (!myTurn) return `${s.players[s.currentPlayer].name} 行动中…`;
    if (s.phase === 'setup') return '开局：选择要保留的任务牌（至少 2 张）';
    if (s.turnPhase === 'tunnel') return `隧道：翻出了同色牌，需要额外支付 ${s.pendingTunnel.extraNeeded} 张`;
    if (s.turnPhase === 'tickets') return '选择要保留的任务牌（至少 1 张）';
    if (s.turnPhase === 'drawing') return `本回合还可抽 ${2 - s.drawnThisTurn} 张车票`;
    return '你的回合：点击地图路线占领 / 点击右侧车票抽牌 / 也可抽任务牌或建车站';
  }

  promptHTML(s, myTurn) {
    if (s.phase === 'ended') return this.endHTML(s);

    if (!myTurn) return '';

    if (s.phase === 'setup') {
      const pool = s.initialTickets[this.humanIndex] || [];
      const cards = pool.map(id => ticketHTML(id, {
        selected: this.sel.has(id),
        clickable: true,
        attrs: `data-act="toggle-sel" data-id="${id}"`
      })).join('');
      return `<div class="ttr-overlay"><div class="ttr-prompt">
        <h3>选择开局任务牌</h3>
        <p class="ttr-dim">至少保留 2 张（长途票通常更值钱，但更难完成）</p>
        <div class="ttr-ticket-list">${cards}</div>
        <button class="ttr-btn primary" data-act="confirm-initial" ${this.sel.size < 2 ? 'disabled' : ''}>确认保留 ${this.sel.size} 张</button>
      </div></div>`;
    }

    if (s.turnPhase === 'tunnel' && s.pendingTunnel) {
      const pt = s.pendingTunnel;
      const handColor = s.players[this.humanIndex].hand[pt.color] || 0;
      const handLoco = s.players[this.humanIndex].hand.loco || 0;
      const canPay = handColor + handLoco >= pt.extraNeeded;
      return `<div class="ttr-overlay"><div class="ttr-prompt">
        <h3>隧道额外费用</h3>
        <p>翻开的 3 张牌：${pt.revealed.map(c => `<span class="ttr-mini" style="--cc:${HEX[c] || '#888'}">${SHORT_NAME[c]}</span>`).join('')}</p>
        <p>需要额外支付 <b>${pt.extraNeeded}</b> 张${esc(COLOR_NAMES[pt.color] || '同色')}车票（车头可替代）</p>
        <p class="ttr-dim">手上有 ${esc(COLOR_NAMES[pt.color] || '')} ${handColor} 张 + 车头 ${handLoco} 张</p>
        <div class="ttr-prompt-actions">
          <button class="ttr-btn primary" data-act="pay-tunnel" ${canPay ? '' : 'disabled'}>支付并占领</button>
          <button class="ttr-btn" data-act="decline-tunnel">放弃</button>
        </div>
      </div></div>`;
    }

    if (s.turnPhase === 'tickets' && s.pendingTickets) {
      const cards = s.pendingTickets.drawn.map(id => ticketHTML(id, {
        selected: this.sel.has(id),
        clickable: true,
        attrs: `data-act="toggle-sel" data-id="${id}"`
      })).join('');
      return `<div class="ttr-overlay"><div class="ttr-prompt">
        <h3>选择要保留的任务牌</h3>
        <p class="ttr-dim">至少保留 1 张，其余放回牌堆</p>
        <div class="ttr-ticket-list">${cards}</div>
        <button class="ttr-btn primary" data-act="confirm-drawn" ${this.sel.size < 1 ? 'disabled' : ''}>确认保留 ${this.sel.size} 张</button>
      </div></div>`;
    }

    return '';
  }

  endHTML(s) {
    const rows = s.results.map(r => {
      const win = s.winners.includes(r.id);
      const b = r.breakdown || {};
      return `<tr class="${win ? 'win' : ''}">
        <td>${win ? '🏆 ' : ''}${esc(r.name)}</td>
        <td>${b.routeScore || 0}</td>
        <td>${b.ticketScore || 0}</td>
        <td>${b.stationScore || 0}</td>
        <td>${b.longestBonus || 0}</td>
        <td><b>${r.score}</b></td>
        <td>${r.longestPath}</td>
      </tr>`;
    }).join('');
    const myBreak = s.players[this.humanIndex].breakdown;
    const myTickets = (myBreak?.tickets || []).map(t => ticketHTML(t.id, { ok: t.ok })).join('');
    return `<div class="ttr-overlay"><div class="ttr-prompt ttr-end">
      <h3>游戏结束</h3>
      <table class="ttr-score-table">
        <thead><tr><th>玩家</th><th>路线</th><th>任务</th><th>车站</th><th>最长</th><th>总分</th><th>最长路线</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h4>我的任务牌结算</h4>
      <div class="ttr-ticket-list">${myTickets || '<p class="ttr-dim">无</p>'}</div>
      <button class="ttr-btn primary" data-act="restart">再来一局</button>
    </div></div>`;
  }

  // ===== 选择集同步（换阶段/换回合时重置） =====
  syncSelection() {
    const s = this.state;
    let key = '';
    if (s.phase === 'setup' && s.currentPlayer === this.humanIndex) key = 'setup-' + s.turn;
    else if (s.turnPhase === 'tickets' && s.currentPlayer === this.humanIndex) {
      key = 'tickets-' + s.turn + '-' + (s.pendingTickets?.drawn || []).join(',');
    }
    if (key === this.selKey) return;
    this.selKey = key;
    this.sel = new Set();
    if (s.phase === 'setup' && s.currentPlayer === this.humanIndex) {
      for (const id of s.initialTickets[this.humanIndex] || []) this.sel.add(id);
    } else if (s.turnPhase === 'tickets' && s.pendingTickets) {
      for (const id of s.pendingTickets.drawn) this.sel.add(id);
    }
  }
}
