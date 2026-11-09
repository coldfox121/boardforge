// 铁路环游：美国版 · 交互界面（纯 DOM + SVG，无图片资源）
// 交互原则与璀璨宝石一致：直接操作，无“选择动作类型”按钮。
// 点击地图路线 = 占领；点击右侧车票 = 抽牌；点击盲抽堆 = 盲抽。
import { initGame, applyAction, validateAction, isTicketComplete, claimPayment } from './ticket-engine.js?v=35';
import { pickAction } from './ticket-ai.js?v=35';
import {
  CITIES, CITY_MAP, ROUTES, TICKET_MAP, COLOR_NAMES,
  ROUTE_SCORES
} from './ticket-data.js?v=35';

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
    opts.selected ? 'selected' : '',
    opts.clickable ? 'clickable' : '',
    opts.focus ? 'focused' : '',
    opts.ok === true ? 'ok' : opts.ok === false ? 'bad' : ''
  ].filter(Boolean).join(' ');
  const pts = (opts.ok === false ? '-' : '+') + t.points;
  const state = opts.ok === true
    ? '<span class="ttr-ticket-state ok">已完成</span>'
    : opts.ok === false ? '<span class="ttr-ticket-state bad">未完成</span>' : '';
  const mark = opts.toggle
    ? `<span class="ttr-ticket-toggle ${opts.selected ? 'on' : ''}" data-act="toggle-sel" data-id="${id}">${opts.selected ? '✓' : ''}</span>`
    : opts.selected ? '<span class="ttr-ticket-check">✓</span>' : '';
  return `
    <div class="${cls}" ${opts.attrs || ''} title="点击在地图上高亮起点与终点">
      <span class="ttr-ticket-pts">${pts}</span>
      <span class="ttr-ticket-line">${esc(cityName(t.a))} → ${esc(cityName(t.b))}</span>
      ${state}
      ${mark}
    </div>`;
}

export class TicketGame {
  constructor(container, options = {}) {
    this.root = typeof container === 'string' ? document.getElementById(container) : container;
    this.playerNames = options.playerNames || ['你', 'AI-1', 'AI-2'];
    this.humanIndex = options.humanIndex || 0;
    this.state = null;
    this.focusTicket = null;   // 高亮某张票的起终点城市
    this.claimDraft = null;    // 待确认占领的路线 index
    this.msg = '';
    this.sel = new Set();
    this.selKey = '';
    this._aiTimer = null;
    this._bound = false;
  }

  start() {
    this.state = initGame(this.playerNames);
    this.state.players.forEach((p, i) => { p.isAI = i !== this.humanIndex; });
    this.focusTicket = null;
    this.claimDraft = null;
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

    // 占领确认面板打开时，其他操作先关闭面板
    if (this.claimDraft !== null && act !== 'confirm-claim' && act !== 'cancel-claim') {
      this.claimDraft = null;
    }

    // 选票期间，只允许处理提示面板内的操作（地图仍可见）
    if (s.phase === 'setup' || s.turnPhase === 'tickets') {
      const allowed = ['toggle-sel', 'focus-ticket', 'confirm-initial', 'confirm-drawn', 'restart'];
      if (!allowed.includes(act)) return;
    }

    switch (act) {
      case 'claim': {
        if (!myTurn || s.turnPhase !== 'idle') return;
        const rid = Number(el.dataset.rid);
        const err = validateAction(s, this.humanIndex, { type: 'CLAIM_ROUTE', routeId: rid });
        if (err) { this.msg = err; this.render(); return; }
        this.claimDraft = rid;
        this.msg = '';
        this.render();
        return;
      }

      case 'confirm-claim': {
        if (!myTurn || this.claimDraft === null) return;
        const rid = this.claimDraft;
        this.claimDraft = null;
        this.do({ type: 'CLAIM_ROUTE', routeId: rid });
        return;
      }

      case 'cancel-claim':
        this.claimDraft = null;
        this.render();
        return;

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
        this.focusTicket = null;
        this.do({ type: 'KEEP_INITIAL_TICKETS', ids: [...this.sel] });
        break;
      }

      case 'confirm-drawn': {
        if (this.sel.size < 1) { this.msg = '至少要保留 1 张任务牌'; this.render(); return; }
        this.focusTicket = null;
        this.do({ type: 'KEEP_TICKETS', ids: [...this.sel] });
        break;
      }

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

    // 可占领路线（只在自己的空闲回合计算）
    const claimable = new Array(ROUTES.length).fill(false);
    if (idle) {
      for (let i = 0; i < ROUTES.length; i++) {
        claimable[i] = validateAction(s, this.humanIndex, { type: 'CLAIM_ROUTE', routeId: i }) === null;
      }
    }

    this.root.innerHTML = `
      <div class="ttr-shell">
        <div class="ttr-players">${this.playersHTML(s)}</div>
        <div class="ttr-body">
          <div class="ttr-board-wrap">${this.boardHTML(s, claimable)}</div>
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
        <span class="ttr-chip-stat">🏆${p.score} · 🚃${p.trains} · 🎫${p.tickets.length}</span>
      </div>`).join('');
  }

  boardHTML(s, claimable) {
    const routes = ROUTES.map((r, i) => {
      const g = routeGeom(i);
      const owner = s.routeOwner[i];
      const claimed = owner !== null;
      const color = claimed ? PCOLORS[owner] : (HEX[r.color] || '#8b95a3');
      const t0 = 9 / g.L;
      const t1 = 1 - 9 / g.L;
      const span = (t1 - t0) / r.len;

      const segs = [];
      for (let k = 0; k < r.len; k++) {
        const a = t0 + span * (k + 0.12);
        const b = t0 + span * (k + 0.88);
        const x1 = g.x1 + (g.x2 - g.x1) * a, y1 = g.y1 + (g.y2 - g.y1) * a;
        const x2 = g.x1 + (g.x2 - g.x1) * b, y2 = g.y1 + (g.y2 - g.y1) * b;
        // 已占领：粗线 + 白色虚线轨枕；未占领：细线、低对比
        segs.push(`<line class="ttr-seg" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${claimed ? 10 : 4.5}" stroke-linecap="round"/>`);
        if (claimed) {
          segs.push(`<line class="ttr-rail" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffffff" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round" opacity=".85"/>`);
        }
      }

      // 已占领的路线加一层深色外壳，进一步和“未占领细线”区分
      const casing = claimed
        ? `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#05090e" stroke-width="14" stroke-linecap="round"/>`
        : '';

      const cls = [
        'ttr-route',
        owner !== null ? (owner === this.humanIndex ? 'mine' : 'foe') : '',
        claimable[i] ? 'claimable' : ''
      ].filter(Boolean).join(' ');

      return `<g class="${cls}" data-rid="${i}">
        ${casing}${segs.join('')}
        <line class="ttr-hit" data-act="claim" data-rid="${i}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}"/>
      </g>`;
    }).join('');

    const focusT = this.focusTicket ? TICKET_MAP[this.focusTicket] : null;
    const focusLine = focusT && CITY_MAP[focusT.a] && CITY_MAP[focusT.b]
      ? `<line class="ttr-focus-line" x1="${CITY_MAP[focusT.a].x}" y1="${CITY_MAP[focusT.a].y}" x2="${CITY_MAP[focusT.b].x}" y2="${CITY_MAP[focusT.b].y}"/>`
      : '';

    const cities = CITIES.map(c => {
      const role = focusT ? (focusT.a === c.id ? 'focused-start' : focusT.b === c.id ? 'focused-end' : '') : '';
      const cls = ['ttr-city', role].filter(Boolean).join(' ');
      return `<g class="${cls}">
        <circle class="ttr-city-halo" cx="${c.x}" cy="${c.y}" r="10"/>
        <circle class="ttr-city-dot" cx="${c.x}" cy="${c.y}" r="5"/>
        <text x="${c.x}" y="${c.y + 18}" text-anchor="middle">${esc(c.zh)}</text>
      </g>`;
    }).join('');

    return `<svg class="ttr-board" viewBox="0 0 1260 800" preserveAspectRatio="xMidYMid meet">
      <g class="ttr-routes">${routes}</g>
      ${focusLine}
      <g class="ttr-cities">${cities}</g>
    </svg>
    <div class="ttr-legend">
      <span><i class="free"></i>未占领</span>
      <span><i class="mine"></i>我的</span>
      <span><i class="foe"></i>对手</span>
    </div>`;
  }

  panelHTML(s, myTurn, idle, my) {
    const faceup = s.faceUp.map((c, i) => {
      if (!c) return `<div class="ttr-card empty">—</div>`;
      // 面朝上的车头只能作为本回合第一张
      const blockLoco = c === 'loco' && s.drawnThisTurn > 0;
      const disabled = !myTurn || s.turnPhase === 'tickets' || blockLoco;
      return `<button class="ttr-card ${c === 'loco' ? 'loco' : ''}" style="--cc:${HEX[c] || '#888'}"
        data-act="draw-faceup" data-index="${i}" ${disabled ? 'disabled' : ''}>
        <span>${SHORT_NAME[c] || '?'}</span>
      </button>`;
    }).join('');

    const canDrawTicket = idle && s.ticketDeck.length > 0;

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

      <section class="ttr-block">
        <button class="ttr-btn" data-act="draw-tickets" ${canDrawTicket ? '' : 'disabled'}>
          抽任务牌<small>剩 ${s.ticketDeck.length}</small>
        </button>
        <p class="ttr-dim ttr-note">抽 3 张任务牌，至少保留 1 张，其余放回牌堆底部。</p>
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
        <span>🎫 车票 ${total}</span>
        <span>🏆 分数 ${my.score}</span>
      </div>
      <div class="ttr-hand">${hand || '<span class="ttr-dim">手上没有车票</span>'}</div>`;
  }

  hintText(s, myTurn) {
    if (s.phase === 'ended') return '游戏结束';
    if (!myTurn) return `${s.players[s.currentPlayer].name} 行动中…`;
    if (s.phase === 'setup') return '开局：共 3 张任务牌，至少保留 2 张';
    if (s.turnPhase === 'tickets') return '选择要保留的任务牌（至少 1 张）';
    if (s.turnPhase === 'drawing') return `本回合还可抽 ${2 - s.drawnThisTurn} 张车票`;
    if (this.claimDraft !== null) return '确认占领：核对要支付的车票后点击「确认占领」，或点「取消」';
    return '你的回合：点击地图路线 → 确认花费后占领；点击右侧车票抽牌；也可抽任务牌';
  }

  promptHTML(s, myTurn) {
    if (s.phase === 'ended') return this.endHTML(s);

    if (!myTurn) return '';

    if (s.phase === 'setup') {
      const pool = s.initialTickets[this.humanIndex] || [];
      const cards = pool.map(id => ticketHTML(id, {
        selected: this.sel.has(id),
        toggle: true,
        clickable: true,
        focus: this.focusTicket === id,
        attrs: `data-act="focus-ticket" data-id="${id}"`
      })).join('');
      return `<div class="ttr-overlay dock"><div class="ttr-prompt">
        <h3>选择开局任务牌</h3>
        <p class="ttr-dim">共 3 张，至少保留 2 张，其余移出游戏</p>
        <p class="ttr-dim">点击任务票 → 地图高亮起点（绿）与终点（红）；右侧圆点控制是否保留</p>
        <div class="ttr-ticket-list">${cards}</div>
        <button class="ttr-btn primary ttr-confirm" data-act="confirm-initial" ${this.sel.size < 2 ? 'disabled' : ''}>确认保留 ${this.sel.size} 张</button>
      </div></div>`;
    }

    if (s.turnPhase === 'tickets' && s.pendingTickets) {
      const cards = s.pendingTickets.drawn.map(id => ticketHTML(id, {
        selected: this.sel.has(id),
        toggle: true,
        clickable: true,
        focus: this.focusTicket === id,
        ok: isTicketComplete(s, this.humanIndex, id),
        attrs: `data-act="focus-ticket" data-id="${id}"`
      })).join('');
      return `<div class="ttr-overlay dock"><div class="ttr-prompt">
        <h3>选择要保留的任务牌</h3>
        <p class="ttr-dim">至少保留 1 张，其余放回牌堆</p>
        <p class="ttr-dim">「已完成」= 你自己的铁轨已连通起终点</p>
        <div class="ttr-ticket-list">${cards}</div>
        <button class="ttr-btn primary ttr-confirm" data-act="confirm-drawn" ${this.sel.size < 1 ? 'disabled' : ''}>确认保留 ${this.sel.size} 张</button>
      </div></div>`;
    }

    if (this.claimDraft !== null) return this.claimHTML(s);

    return '';
  }

  claimHTML(s) {
    const rid = this.claimDraft;
    const r = ROUTES[rid];
    if (!r || s.turnPhase !== 'idle') return '';
    const my = s.players[this.humanIndex];
    const pay = claimPayment(my.hand, rid);
    const pts = ROUTE_SCORES[r.len] || 0;

    let payHTML;
    if (!pay) {
      payHTML = '<p class="ttr-pay-missing">车票不足，无法占领</p>';
    } else {
      const chips = [];
      if (pay.colorCards > 0) {
        chips.push(`<span class="ttr-hand-chip" style="--cc:${HEX[pay.color] || '#888'}"><b>${pay.colorCards}</b>${SHORT_NAME[pay.color] || '?'}</span>`);
      }
      if (pay.locos > 0) {
        chips.push(`<span class="ttr-hand-chip loco"><b>${pay.locos}</b>车头</span>`);
      }
      payHTML = `<div class="ttr-pay">${chips.join('')}</div>
        <p class="ttr-dim">${r.color ? `颜色路线，只能用${esc(COLOR_NAMES[r.color] || '')}车票或车头` : '灰色路线，自动使用你手上数量最多的颜色'} · 占领后剩 ${my.trains - r.len} 节车厢</p>`;
    }

    return `<div class="ttr-overlay dock"><div class="ttr-prompt">
      <h3>占领路线</h3>
      <p class="ttr-claim-title">${esc(cityName(r.a))} → ${esc(cityName(r.b))}</p>
      <p class="ttr-dim">长度 ${r.len} 格 · 得分 +${pts}</p>
      <h4>需要支付</h4>
      ${payHTML}
      <div class="ttr-prompt-actions">
        <button class="ttr-btn ttr-confirm" data-act="cancel-claim">取消</button>
        <button class="ttr-btn primary ttr-confirm" data-act="confirm-claim" ${pay ? '' : 'disabled'}>确认占领</button>
      </div>
    </div></div>`;
  }

  endHTML(s) {
    const rows = s.results.map(r => {
      const win = s.winners.includes(r.id);
      const b = r.breakdown || {};
      return `<tr class="${win ? 'win' : ''}">
        <td>${win ? '🏆 ' : ''}${esc(r.name)}</td>
        <td>${b.routeScore || 0}</td>
        <td>${b.ticketScore || 0}</td>
        <td>${b.longestBonus || 0}</td>
        <td><b>${r.score}</b></td>
        <td>${r.longestPath}</td>
      </tr>`;
    }).join('');
    const myBreak = s.players[this.humanIndex].breakdown;
    const myTickets = (myBreak?.tickets || []).map(t => ticketHTML(t.id, { ok: t.ok })).join('');
    const logRows = (s.log || []).map((t, i) =>
      `<p><span class="ttr-log-no">${i + 1}</span>${esc(t)}</p>`).join('');
    return `<div class="ttr-overlay"><div class="ttr-prompt ttr-end">
      <h3>游戏结束</h3>
      <table class="ttr-score-table">
        <thead><tr><th>玩家</th><th>路线</th><th>任务</th><th>最长</th><th>总分</th><th>最长路线</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h4>我的任务牌结算</h4>
      <p class="ttr-dim">判定标准：必须用你自己的铁轨把起点和终点连通；经过对手的铁轨不算完成。</p>
      <div class="ttr-ticket-list">${myTickets || '<p class="ttr-dim">无</p>'}</div>
      <details class="ttr-end-log">
        <summary>📜 查看本局操作记录（${(s.log || []).length} 条）</summary>
        <div class="ttr-end-log-list">${logRows || '<p class="ttr-dim">无记录</p>'}</div>
      </details>
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
