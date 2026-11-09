// 铁路环游：美国版 · 交互界面（纯 DOM + SVG，无图片资源）
// 交互原则与璀璨宝石一致：直接操作，无“选择动作类型”按钮。
// 点击地图路线 = 占领；点击右侧车票 = 抽牌；点击盲抽堆 = 盲抽。
import { initGame, applyAction, validateAction, isTicketComplete, claimOptions } from './ticket-engine.js?v=38';
import { pickAction } from './ticket-ai.js?v=38';
import {
  CITIES, CITY_MAP, ROUTES, TICKET_MAP, COLOR_NAMES,
  ROUTE_SCORES
} from './ticket-data.js?v=38';

const PCOLORS = ['#e05c5c', '#4a90d9', '#43b581', '#e8c34a', '#a06bd0'];
const HEX = {
  purple: '#a273ff', white: '#f5f9ff', blue: '#4f8cff', yellow: '#f3cf4a',
  orange: '#f59a45', black: '#7d8ba0', red: '#ec5f5f', green: '#3fc97a', loco: '#d08bff'
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
    this.humanIndex = options.humanIndex ?? 0;
    this.state = null;
    this.online = options.online || null;
    this.initialState = options.initialState || null;
    this.version = this.online ? (this.online.version || 0) : 0;
    this._pushing = false;
    this._pending = null;
    this.memberOnline = null;   // 联机模式：座位 → 是否在线
    this.focusTicket = null;   // 高亮某张票的起终点城市
    this.claimDraft = null;    // 待确认占领的路线 index
    this.claimPay = null;      // 玩家选中的支付组合 { color, locos }
    this.msg = '';
    this.sel = new Set();
    this.selKey = '';
    this._aiTimer = null;
    this._bound = false;
  }

  start() {
    // 联机模式使用云端下发的权威对局数据；单机模式本地开局
    this.state = this.initialState
      ? JSON.parse(JSON.stringify(this.initialState))
      : initGame(this.playerNames);
    if (!this.initialState) {
      this.state.players.forEach((p, i) => { p.isAI = i !== this.humanIndex; });
    }
    this.focusTicket = null;
    this.claimDraft = null;
    this.claimPay = null;
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

    // 占领确认面板打开时，其他操作先关闭面板（支付组合选择属于面板内操作）
    const claimActs = ['confirm-claim', 'cancel-claim', 'pay-color', 'pay-locos'];
    if (this.claimDraft !== null && !claimActs.includes(act)) {
      this.claimDraft = null;
      this.claimPay = null;
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
        const opts = claimOptions(s.players[this.humanIndex].hand, rid);
        this.claimPay = opts.length ? { color: opts[0].color, locos: opts[0].locos } : null;
        this.msg = '';
        this.render();
        return;
      }

      case 'pay-color': {
        if (this.claimDraft === null) return;
        const opts = claimOptions(s.players[this.humanIndex].hand, this.claimDraft)
          .filter(o => o.color === el.dataset.color);
        if (!opts.length) return;
        this.claimPay = { color: opts[0].color, locos: opts[0].locos };
        this.render();
        return;
      }

      case 'pay-locos': {
        if (this.claimDraft === null || !this.claimPay) return;
        const opts = claimOptions(s.players[this.humanIndex].hand, this.claimDraft)
          .filter(o => o.color === this.claimPay.color && o.locos === Number(el.dataset.locos));
        if (!opts.length) return;
        this.claimPay = { color: opts[0].color, locos: opts[0].locos };
        this.render();
        return;
      }

      case 'confirm-claim': {
        if (!myTurn || this.claimDraft === null) return;
        const rid = this.claimDraft;
        const pay = this.claimPay;
        this.claimDraft = null;
        this.claimPay = null;
        this.do(pay
          ? { type: 'CLAIM_ROUTE', routeId: rid, color: pay.color, locos: pay.locos }
          : { type: 'CLAIM_ROUTE', routeId: rid });
        return;
      }

      case 'cancel-claim':
        this.claimDraft = null;
        this.claimPay = null;
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
        if (this.online) {
          this.msg = '联机对局请返回大厅后重新创建房间';
          this.render();
          break;
        }
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
    this.afterChange();
  }

  // 本地状态发生变化：安排 AI（仅房主/单机）+ 同步到房间
  afterChange() {
    this.scheduleAI();
    this.queuePush();
  }

  // 串联推送：同一时间只有一个请求，期间的多次变更合并为最后一次
  queuePush() {
    if (!this.online) return;
    this._pending = this.state;
    if (this._pushing) return;
    this._flushPush();
  }

  async _flushPush() {
    this._pushing = true;
    while (this._pending) {
      const st = this._pending;
      this._pending = null;
      try {
        const v = await this.online.push(st, this.version);
        if (typeof v === 'number') this.version = v;
      } catch (e) {
        this.msg = '同步冲突，正在重新拉取最新对局…';
        this.render();
        break;
      }
    }
    this._pushing = false;
  }

  // 轮询拉到更新的云端状态时调用
  syncState(state, version) {
    if (!state || typeof version !== 'number') return;
    if (this._pushing) return;      // 本地还有未落库的动作，先不覆盖
    if (version <= this.version) return;
    this.version = version;
    this.state = state;
    this.claimDraft = null;
    this.claimPay = null;
    this.render();
  }

  // 联机模式：同步各座位在线状态（掉线标记），有变化才重绘
  syncMembers(members) {
    if (!this.online) return;
    const map = {};
    (members || []).forEach(m => { map[m.seat] = !!m.online; });
    if (JSON.stringify(map) === JSON.stringify(this.memberOnline || {})) return;
    this.memberOnline = map;
    this.render();
  }

  scheduleAI() {
    clearTimeout(this._aiTimer);
    const s = this.state;
    if (!s || s.phase === 'ended' || s.currentPlayer === this.humanIndex) return;
    // 联机模式只由房主端代跑 AI，且只代跑 AI 座位
    if (this.online) {
      if (!this.online.isHost) return;
      if (!s.players[s.currentPlayer]?.isAI) return;
    }
    this._aiTimer = setTimeout(() => {
      if (!this.root || !this.root.isConnected || this.root.classList.contains('hidden') || this.root.offsetParent === null) return;
      const st = this.state;
      if (!st || st.phase === 'ended' || st.currentPlayer === this.humanIndex) return;
      if (this.online && !st.players[st.currentPlayer]?.isAI) return;
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
      this.afterChange();
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
    return s.players.map((p, i) => {
      const offline = !p.isAI && !!this.memberOnline && this.memberOnline[i] !== true;
      return `
      <div class="ttr-chip ${i === s.currentPlayer && s.phase !== 'ended' ? 'active' : ''} ${offline ? 'offline' : ''}" style="--pc:${PCOLORS[i]}">
        <span class="ttr-chip-name">${esc(p.name)}${i === this.humanIndex ? '（我）' : ''}${offline ? '<span class="ttr-offline">离线</span>' : ''}</span>
        <span class="ttr-chip-stat">🏆${p.score} · 🚃${p.trains} · 🎫${p.tickets.length}</span>
      </div>`;
    }).join('');
  }

  boardHTML(s, claimable) {
    const routes = ROUTES.map((r, i) => {
      const g = routeGeom(i);
      const owner = s.routeOwner[i];
      const claimed = owner !== null;
      const color = claimed ? PCOLORS[owner] : (HEX[r.color] || '#9fb0c2');
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
        segs.push(`<line class="ttr-seg" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${claimed ? 11 : 6}" stroke-linecap="round"/>`);
        if (claimed) {
          segs.push(`<line class="ttr-rail" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffffff" stroke-width="2.2" stroke-dasharray="3 6" stroke-linecap="round" opacity=".9"/>`);
        }
      }

      // 已占领的路线加一层深色外壳，进一步和“未占领细线”区分
      const casing = claimed
        ? `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#05090e" stroke-width="15" stroke-linecap="round"/>`
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
        <circle class="ttr-city-halo" cx="${c.x}" cy="${c.y}" r="11"/>
        <circle class="ttr-city-dot" cx="${c.x}" cy="${c.y}" r="5.5"/>
        <text x="${c.x}" y="${c.y + 19}" text-anchor="middle">${esc(c.zh)}</text>
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
    const opts = claimOptions(my.hand, rid);
    const pts = ROUTE_SCORES[r.len] || 0;

    const head = `<h3>占领路线</h3>
      <p class="ttr-claim-title">${esc(cityName(r.a))} → ${esc(cityName(r.b))}</p>
      <p class="ttr-dim">长度 ${r.len} 格 · 得分 +${pts}</p>`;

    if (opts.length === 0) {
      return `<div class="ttr-overlay dock"><div class="ttr-prompt">
        ${head}
        <h4>需要支付</h4>
        <p class="ttr-pay-missing">车票不足，无法占领</p>
        <div class="ttr-prompt-actions">
          <button class="ttr-btn ttr-confirm" data-act="cancel-claim">取消</button>
          <button class="ttr-btn primary ttr-confirm" data-act="confirm-claim" disabled>确认占领</button>
        </div>
      </div></div>`;
    }

    // 颜色可选（灰线多色）→ 先选颜色，再选使用几张车头
    const colorKeys = [...new Set(opts.map(o => o.color))]
      .sort((a, b) => HAND_ORDER.indexOf(a) - HAND_ORDER.indexOf(b));
    const selColor = this.claimPay && colorKeys.includes(this.claimPay.color)
      ? this.claimPay.color : colorKeys[0];
    const sameColor = opts.filter(o => o.color === selColor);
    const selLocos = this.claimPay && sameColor.some(o => o.locos === this.claimPay.locos)
      ? this.claimPay.locos : sameColor[0].locos;
    const pay = sameColor.find(o => o.locos === selLocos) || sameColor[0];

    const colorBtns = colorKeys.length > 1
      ? `<div class="ttr-pay-pick">${colorKeys.map(c => {
        const have = c === 'loco' ? (my.hand.loco || 0) : (my.hand[c] || 0);
        const name = c === 'loco' ? '全车头' : (COLOR_NAMES[c] || SHORT_NAME[c] || c);
        return `<button class="ttr-pay-color ${c === selColor ? 'on' : ''}"
          data-act="pay-color" data-color="${c}" style="--cc:${HEX[c] || '#888'}">
          <span class="ttr-pay-dot"></span>${esc(name)}<b>${have}</b>
        </button>`;
      }).join('')}</div>` : '';

    const locoBtns = selColor === 'loco' ? ''
      : `<div class="ttr-pay-pick">${sameColor.map(o => `
        <button class="ttr-pay-locos ${o.locos === selLocos ? 'on' : ''}"
          data-act="pay-locos" data-locos="${o.locos}">${o.locos === 0 ? '不用车头' : `${o.locos} 张车头`}</button>`).join('')}</div>`;

    const chips = [];
    if (pay.colorCards > 0) {
      chips.push(`<span class="ttr-hand-chip" style="--cc:${HEX[pay.color] || '#888'}"><b>${pay.colorCards}</b>${SHORT_NAME[pay.color] || '?'}</span>`);
    }
    if (pay.locos > 0) {
      chips.push(`<span class="ttr-hand-chip loco"><b>${pay.locos}</b>车头</span>`);
    }

    const tip = r.color
      ? `颜色路线：只能用${esc(COLOR_NAMES[r.color] || '')}车票，车头可替代任意颜色`
      : '灰色路线：可用任意单一颜色车票，车头可替代任意颜色';

    return `<div class="ttr-overlay dock"><div class="ttr-prompt">
      ${head}
      <h4>需要支付</h4>
      <div class="ttr-pay">${chips.join('')}</div>
      <p class="ttr-dim">${tip} · 占领后剩 ${my.trains - r.len} 节车厢</p>
      ${colorBtns}
      ${locoBtns}
      <div class="ttr-prompt-actions">
        <button class="ttr-btn ttr-confirm" data-act="cancel-claim">取消</button>
        <button class="ttr-btn primary ttr-confirm" data-act="confirm-claim">确认占领</button>
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
