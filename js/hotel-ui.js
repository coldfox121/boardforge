// 奥地利大饭店 · UI 层
// 继承通用联机基类；只做渲染与交互，不写任何联机/轮询代码
import { OnlineGameBase } from './online-game.js?v=2';
import {
  initGame, applyAction, validateAction, guestComplete, actionStrength,
  canPrepareIndex, prepareCostFor, objectiveMet, diceTotal, orderTotal
} from './hotel-engine.js?v=6';
import { pickAction } from './hotel-ai.js?v=3';
import {
  GUEST_BY_ID, STAFF_BY_ID, ROOM_COLORS, ROOM_GROUPS, FLOOR_COST, IMMEDIATE_VP,
  EMPEROR_POINTS, MARKET_COST, FOOD_KEYS, FOOD_NAMES, COLOR_NAMES
} from './hotel-data.js?v=4';

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const SPACE_INFO = {
  1: { name: '拿餐食', sub: '<i class="gah-fdot f-strudel"></i><i class="gah-fdot f-cake"></i>', icon: '🥐' },
  2: { name: '拿饮品', sub: '<i class="gah-fdot f-wine"></i><i class="gah-fdot f-coffee"></i>', icon: '🍷' },
  3: { name: '准备房间', sub: '每点 1 间', icon: '🏨' },
  4: { name: '皇帝 / 克朗', sub: '自由分配', icon: '👑' },
  5: { name: '雇佣员工', sub: '每点减 1 克朗', icon: '👔' },
  6: { name: '万能行动', sub: '付 1 克朗 · 按 6 区骰数', icon: '🎲' }
};

const KIND_ZH = { once: '一次性', round: '每轮一次', permanent: '永久', end: '终局' };

// 餐饮统一用「颜色块 + 名字」标识（颜色见 style.css .gah-fdot.f-*：苹果卷=金黄 蛋糕=粉红 红酒=酒红 咖啡=棕）
// 颜色/餐饮在文案中用单字色名（游玩靠颜色识别，不展示汉字全名）
const COLOR_CHAR = { blue: '蓝', red: '红', yellow: '黄', green: '绿' };
const FOOD_CHAR = { strudel: '金', cake: '粉', wine: '红', coffee: '棕' };
function foodChip(key, n, extra = '') {
  return `<span class="gah-fchip ${extra}" title="${FOOD_NAMES[key]}"><i class="gah-fdot f-${key}"></i>${n != null ? ` ×${n}` : ''}</span>`;
}
function foodDot(key, text, extra = '') {
  return `<span class="gah-fchip sm ${extra}" title="${FOOD_NAMES[key]}"><i class="gah-fdot f-${key}"></i>${text}</span>`;
}
function foodIcons(order) {
  return order.map((n, i) => n > 0 ? foodChip(FOOD_KEYS[i], n) : '').join('');
}

function rewardText(rewards) {
  if (!rewards || !rewards.length) return '无奖励';
  return rewards.map(r => {
    switch (r.type) {
      case 'food': return foodChip(FOOD_KEYS[r.food], r.n);
      case 'anyFood': return `任选 ${r.n} 份餐饮`;
      case 'money': return `${r.n} 克朗`;
      case 'favor': return `皇帝轨 +${r.n}`;
      case 'points': return `${r.n} 分`;
      case 'draw': return `抽 ${r.n} 张员工`;
      case 'prepare': return r.discount >= 99 ? '免费备 1 间房' : `备 1 间房（省 ${r.discount} 克朗）`;
      case 'hire': return r.discount >= 99 ? '免费雇佣 1 名员工' : `雇佣员工（省 ${r.discount} 克朗）`;
      case 'offer': return r.discount >= 99 ? '抽 3 张员工选 1 张免费雇佣' : `抽 3 张员工，选 1 张减 ${r.discount} 克朗雇佣`;
      case 'guest': return '免费接 1 客';
      case 'occupy': return '额外入住 1 房';
      case 'bonusDie': return '额外执行一次骰子行动';
      case 'complete': return '公共供应完成 1 单';
      case 'staffPoints': return `每员工 ${r.n} 分`;
      default: return r.type;
    }
  }).join(' · ');
}

export class HotelGame extends OnlineGameBase {
  constructor(container, options = {}) {
    super(options);
    this.root = container || document.getElementById('hotel-game');
    this.humanIndex = options.humanIndex ?? 0;
    this.initialState = options.initialState || null;
    this.state = null;
    this.online = options.online || null;
    this.onRematch = options.onRematch || null;
    this.memberOnline = null;
    this.aiTimer = null;
    this.playerNames = options.playerNames || null;
    this.ui = { panel: null, mode: null, confirm: null, status: '', pendingTarget: null, foodPick: null, endLog: false, detail: null };
    this._built = false;
  }

  start() {
    if (this.initialState) {
      this.state = JSON.parse(JSON.stringify(this.initialState));
    } else {
      this.state = initGame(this.playerNames || ['玩家', 'AI-1']);
      this.state.players.forEach((p, i) => { p.isAI = i !== this.humanIndex; });
    }
    this.buildShell();
    this.render();
    if (this.session) this.session.scheduleAI();
    else this.localAILoop();
  }

  // ===== 联机基类钩子 =====
  aiAction(state, seat) { return pickAction(state, seat); }
  applyAIAction(seat, action) { this.state = applyAction(this.state, seat, action); }
  canRunAI() {
    return !!this.root && this.root.isConnected &&
      !this.root.classList.contains('hidden') && this.root.offsetParent !== null;
  }
  setMemberOnline(map) { this.memberOnline = map; this.render(); }
  onRemoteState() {
    this.ui.panel = null;
    this.ui.mode = null;
    this.ui.confirm = null;
    this.ui.pendingTarget = null;
    this.ui.foodPick = null;
  }
  onSyncConflict() { this.ui.status = '同步冲突，正在重新拉取…'; this.render(); }
  onAIFailed(err) { this.ui.status = 'AI 动作失败：' + err.message; this.render(); }

  afterChange() {
    if (this.session) this.session.localChanged();
    else { this.localAILoop(); }
  }

  localAILoop() {
    clearTimeout(this.aiTimer);
    const s = this.state;
    if (!s || s.phase === 'ended') return;
    const seat = s.currentPlayer;
    const p = s.players[seat];
    if (!p || !p.isAI) return;
    this.aiTimer = setTimeout(() => {
      if (!this.root || !this.root.isConnected) return;
      if (!this.canRunAI()) return;
      const st = this.state;
      if (!st || st.phase === 'ended') return;
      const cp = st.players[st.currentPlayer];
      if (!cp || !cp.isAI) return;
      try {
        const act = pickAction(st, st.currentPlayer);
        if (!act) return;
        this.state = applyAction(st, st.currentPlayer, act);
        this.render();
        this.localAILoop();
      } catch (e) {
        this.ui.status = 'AI 动作失败：' + e.message;
        this.render();
      }
    }, 380);
  }

  destroy() {
    clearTimeout(this.aiTimer);
    if (this.session) this.session.dispose();
  }

  // ===== 外壳 =====
  buildShell() {
    if (this._built && this.root.querySelector('.gah')) return;
    // 布局按官方实体板块还原：
    //  主图板（横向）：左上目标卡 · 右上轮次轨(下挂皇帝板块) · 中部皇帝轨 · 底部客人队列
    //  行动板块：官方为 6 个纵列（骰子按点数落柱），左→右 1-6
    //  玩家图板：酒店房间 4×5 + 咖啡吧/厨房在下 + 手牌
    this.root.innerHTML = `
      <div class="gah">
        <div class="gah-top">
          <div class="gah-round" id="gah-round"></div>
          <div class="gah-turn" id="gah-turn"></div>
          <div class="gah-mystats" id="gah-mystats"></div>
        </div>

        <div class="gah-mainboard">
          <div class="gah-mb-top">
            <div class="gah-mb-politics">
              <div class="gah-ph">目标卡 <span class="gah-hint">先抢先得 15/10/5</span></div>
              <div class="gah-objectives" id="gah-objectives"></div>
            </div>
            <div class="gah-mb-round">
              <div class="gah-ph">轮次轨 <span class="gah-hint">第 3/5/7 轮末皇帝结算</span></div>
              <div class="gah-roundtrack" id="gah-roundtrack"></div>
              <div class="gah-emperors" id="gah-emperors"></div>
            </div>
          </div>
          <div class="gah-mb-emperor">
            <div class="gah-ph">皇帝轨 <span class="gah-hint">停 3+ 格拿奖励 · 退回 0 格受罚</span></div>
            <div class="gah-emtrack" id="gah-emtrack"></div>
          </div>
          <div class="gah-mb-queue">
            <div class="gah-ph">客人队列 <span class="gah-hint">左→右费用 3/2/1/0/0 · 点卡片接客</span></div>
            <div class="gah-queue" id="gah-queue"></div>
          </div>
        </div>

        <div class="gah-grid">
          <section class="gah-col gah-col-left">
            <div class="gah-panel">
              <div class="gah-ph">行动板块 <span class="gah-hint" id="gah-dice-hint"></span></div>
              <div class="gah-actions gah-actions-cols" id="gah-actions"></div>
              <div class="gah-panelbox" id="gah-actionpanel"></div>
            </div>
          </section>

          <section class="gah-col gah-col-mid">
            <div class="gah-panel">
              <div class="gah-ph">我的酒店 <span class="gah-hint" id="gah-hotel-hint"></span></div>
              <div class="gah-hotel" id="gah-hotel"></div>
              <div class="gah-res" id="gah-res"></div>
              <div class="gah-bonusrule" id="gah-bonusrule"></div>
            </div>
            <div class="gah-panel">
              <div class="gah-ph">咖啡吧（最多 3 位）与厨房</div>
              <div class="gah-cafe" id="gah-cafe"></div>
              <div class="gah-kitchen" id="gah-kitchen"></div>
            </div>
            <div class="gah-panel">
              <div class="gah-ph">员工手牌</div>
              <div class="gah-hand" id="gah-hand"></div>
              <div class="gah-hired" id="gah-hired"></div>
            </div>
          </section>

          <section class="gah-col gah-col-right">
            <div class="gah-panel">
              <div class="gah-ph">对手</div>
              <div class="gah-opponents" id="gah-opponents"></div>
            </div>
            <div class="gah-panel">
              <div class="gah-ph">本回合指引</div>
              <div class="gah-guide" id="gah-guide"></div>
            </div>
            <div class="gah-panel">
              <div class="gah-ph">操作</div>
              <div class="gah-pending" id="gah-pending"></div>
              <div class="gah-actionsbar" id="gah-actionsbar"></div>
              <div class="gah-status" id="gah-status"></div>
            </div>
            <div class="gah-panel">
              <div class="gah-ph">行动记录</div>
              <div class="gah-log" id="gah-log"></div>
            </div>
          </section>
        </div>
        <div class="gah-end hidden" id="gah-end"></div>
      </div>`;
    this._built = true;
    this.root.querySelector('.gah').addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      e.preventDefault();
      this.handle(el.dataset.act, el.dataset);
    });
  }

  me() { return this.state.players[this.humanIndex]; }
  myTurn() {
    return this.state.currentPlayer === this.humanIndex && !this.state.pending;
  }

  // ===== 渲染 =====
  render() {
    if (!this.root || !this.state) return;
    this.buildShell();
    const s = this.state;
    const me = this.me();

    const roundEl = this.root.querySelector('#gah-round');
    roundEl.innerHTML = `第 <b>${s.round}</b> / 7 轮` +
      (s.round === 3 || s.round === 5 || s.round === 7 ? '<span class="gah-tag gold">本轮末皇帝结算</span>' : '');

    const turnEl = this.root.querySelector('#gah-turn');
    const cur = s.players[s.currentPlayer];
    if (s.phase === 'ended') turnEl.textContent = '游戏结束';
    else if (s.pending) turnEl.textContent = `${cur.name} 正在做选择…`;
    else if (s.currentPlayer === this.humanIndex) turnEl.innerHTML = '<span class="gah-turn-me">你的回合</span>';
    else turnEl.textContent = `等待 ${cur.name} 行动` + (cur.isAI ? '（电脑）' : '');

    this.root.querySelector('#gah-mystats').innerHTML =
      `<span title="克朗">💰 ${me.money}</span>
       <span title="皇帝轨">👑 ${me.emperor} <i>(+${EMPEROR_POINTS[me.emperor] || 0}分)</i></span>
       <span title="总分">⭐ ${me.score}</span>
       <span title="回合状态" class="gah-dim">${me.dieTaken ? '已取骰' : '待取骰'} · ${me.numbersLeft} 次行动</span>`;

    this._renderActions();
    this._renderQueue();
    this._renderObjectives();
    this._renderRoundTrack();
    this._renderEmTrack();
    this._renderHotel();
    this._renderCafe();
    this._renderHand();
    this._renderOpponents();
    this._renderGuide();
    this._renderPending();
    this._renderBars();
    this._renderLog();
    this._renderEnd();
  }

  _renderActions() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-actions');
    const canAct = this.myTurn() && !me.dieTaken;
    // 官方行动板为 6 个纵列（左→右 1-6），骰子按点数落柱；强度=取走时柱内剩余骰数
    let html = '';
    for (let i = 1; i <= 6; i++) {
      const info = SPACE_INFO[i];
      const n = s.dice[i] || 0;
      const st = this.myTurn() ? actionStrength(s, me, i, false) : n;
      const pips = Array.from({ length: n }, () => '<i class="gah-die"></i>').join('') ||
        '<i class="gah-die none"></i>';
      html += `<div class="gah-action ${n > 0 ? 'has' : 'empty'} ${canAct && n > 0 ? 'clickable' : ''} ${i === 6 ? 'wild' : ''}"
        data-act="space" data-space="${i}">
        <div class="gah-action-num">${i === 6 ? '6<span>万能</span>' : i}</div>
        <div class="gah-action-icon">${info.icon}</div>
        <div class="gah-action-name">${info.name}</div>
        <div class="gah-action-dice">${pips}</div>
        <div class="gah-action-strength">强度 <b>${st}</b></div>
        <div class="gah-action-sub">${info.sub}</div>
      </div>`;
    }
    wrap.innerHTML = html;
    this.root.querySelector('#gah-dice-hint').textContent =
      canAct ? '点纵列执行（强度=剩余骰数）' : me.dieTaken ? '本回合已取骰' : '';
    this.root.querySelector('#gah-actionpanel').innerHTML = this._panelHTML();
  }

  _panelHTML() {
    const ui = this.ui;
    if (!ui.panel) return '';
    const s = this.state, me = this.me();
    const space = ui.panel.space;
    const boost = !!ui.panel.boost;
    const info = SPACE_INFO[space];
    const strength = actionStrength(s, me, space, boost);
    const fee = space === 6 ? (me.hired.includes(17) ? 0 : 1) : 0;

    let inner = '';
    if (space === 6 && !ui.panel.target) {
      inner = `<div class="gah-opts">` + [1, 2, 3, 4, 5].map(t =>
        `<button class="gah-btn" data-act="wild" data-target="${t}">${SPACE_INFO[t].icon} ${SPACE_INFO[t].name}</button>`
      ).join('') + `</div>`;
    } else {
      const kind = space === 6 ? ui.panel.target : space;
      inner = this._optionsHTML(kind, strength, space, ui.panel.target, false);
    }

    return `<div class="gah-panelinner">
      <div class="gah-panelhead">
        <b>${info.icon} ${info.name}</b>
        <span>强度 <b>${strength}</b>${fee ? ` · 需付 ${fee} 克朗` : ''}</span>
        <button class="gah-mini" data-act="cancel-panel">✕</button>
      </div>
      ${space !== 6 || ui.panel.target ? `<label class="gah-boost ${me.boosted ? 'off' : ''}">
        <input type="checkbox" data-act="boost" ${boost ? 'checked' : ''} ${me.boosted ? 'disabled' : ''}>
        付 1 克朗 +1 强度${me.boosted ? '（本回合已用）' : ''}
      </label>` : ''}
      ${inner}
      <div class="gah-statusline">${esc(this.ui.status)}</div>
    </div>`;
  }

  _optionsHTML(kind, strength, space, target, resolve) {
    const pre = resolve ? 'r-' : '';
    const s = this.state, me = this.me();
    if (kind === 1) {
      const max = Math.min(strength, Math.floor(strength / 2));
      let out = '<div class="gah-opts">';
      for (let cake = 0; cake <= max; cake++) {
        out += `<button class="gah-btn" data-act="${pre}food1" data-cake="${cake}" data-st="${strength}">
          <i class="gah-fdot f-strudel"></i> ×${strength - cake}${cake ? ` + <i class="gah-fdot f-cake"></i> ×${cake}` : ''}</button>`;
      }
      return out + '</div>';
    }
    if (kind === 2) {
      const max = Math.min(strength, Math.floor(strength / 2));
      let out = '<div class="gah-opts">';
      for (let coffee = 0; coffee <= max; coffee++) {
        out += `<button class="gah-btn" data-act="${pre}food2" data-coffee="${coffee}" data-st="${strength}">
          <i class="gah-fdot f-wine"></i> ×${strength - coffee}${coffee ? ` + <i class="gah-fdot f-coffee"></i> ×${coffee}` : ''}</button>`;
      }
      return out + '</div>';
    }
    if (kind === 3) {
      return `<div class="gah-opts"><button class="gah-btn primary" data-act="${pre}prep" data-st="${strength}" data-space="${space}" data-target="${target || ''}">
        选择要准备的房间（最多 ${strength} 间）</button></div>`;
    }
    if (kind === 4) {
      if (me.hired.includes(15)) {
        return `<div class="gah-opts"><button class="gah-btn primary" data-act="${pre}split4" data-k="${strength}" data-st="${strength}">
          擦鞋匠：${strength} 克朗 + 皇帝轨 ${strength}</button></div>`;
      }
      let out = '<div class="gah-opts">';
      for (let k = 0; k <= strength; k++) {
        out += `<button class="gah-btn" data-act="${pre}split4" data-k="${k}" data-st="${strength}">
          皇帝 ${k} / 克朗 ${strength - k}</button>`;
      }
      return out + '</div>';
    }
    if (kind === 5) {
      if (!me.hand.length) return '<div class="gah-empty">手牌为空</div>';
      const list = me.hand.map(id => {
        const def = STAFF_BY_ID[id];
        const disc = (space === 5 && me.hired.includes(18)) ? 2 : 0;
        const cost = Math.max(0, def.cost - strength - disc);
        return `<button class="gah-btn ${cost <= me.money ? '' : 'disabled'}" data-act="${pre}hire" data-staff="${id}" data-st="${strength}">
          <b>${esc(def.name)}</b> · ${cost} 克朗 · ${KIND_ZH[def.kind]}</button>`;
      }).join('');
      return `<div class="gah-opts col">${list}</div>`;
    }
    return '';
  }

  _renderQueue() {
    const s = this.state;
    const wrap = this.root.querySelector('#gah-queue');
    const me = this.me();
    const canTake = this.myTurn() && s.phase === 'playing' && !me.guestTaken && me.cafe.length < 3;
    wrap.innerHTML = s.guestQueue.map((gid, slot) => {
      const g = GUEST_BY_ID[gid];
      if (!g) return '';
      const cost = MARKET_COST[slot];
      const afford = cost <= me.money || me.hired.includes(25);
      return `<div class="gah-guest rc-${g.color} ${canTake && afford ? 'clickable' : ''}" data-act="queue" data-slot="${slot}" title="${COLOR_NAMES[g.color]}客人">
        <div class="gah-guest-top">
          <span class="gah-vp">${g.vp}分</span>
        </div>
        <div class="gah-order">${foodIcons(g.order)}</div>
        <div class="gah-reward">${rewardText(g.rewards)}</div>
        <div class="gah-guest-cost">${cost === 0 ? '免费' : cost + '克朗'}</div>
      </div>`;
    }).join('');
  }

  _renderObjectives() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-objectives');
    wrap.innerHTML = s.objectives.map((o, i) => {
      const mine = me.claims.includes(i);
      const met = objectiveMet(me, o);
      const free = o.spots.some(sp => sp.seat == null);
      return `<div class="gah-obj ${met && !mine && free ? 'met clickable' : ''} ${mine ? 'mine' : ''}" data-act="obj" data-idx="${i}">
        <div class="gah-obj-text">${esc(o.text)}</div>
        <div class="gah-spots">${o.spots.map(sp =>
          `<span class="gah-spot ${sp.seat == null ? '' : 'taken'}">${sp.vp}<i>${sp.seat == null ? '—' : esc(s.players[sp.seat].name.slice(0, 4))}</i></span>`
        ).join('')}</div>
      </div>`;
    }).join('');
  }

  // 官方主图板右上：轮次轨 1-7，皇帝板块挂在第 3/5/7 轮下方
  _renderRoundTrack() {
    const s = this.state;
    const wrap = this.root.querySelector('#gah-roundtrack');
    let cells = '';
    for (let r = 1; r <= 7; r++) {
      const cur = s.phase !== 'ended' && s.round === r;
      const done = s.round > r || s.phase === 'ended';
      cells += `<div class="gah-rtcell ${cur ? 'cur' : ''} ${done ? 'done' : ''}">${r}</div>`;
    }
    wrap.innerHTML = cells;
    const emp = this.root.querySelector('#gah-emperors');
    emp.innerHTML = s.emperors.map((t, i) => {
      const rd = [3, 5, 7][i];
      const done = s.round > rd || (s.phase !== 'ended' && s.round === rd && !s.players.some(p => p.numbersLeft > 0));
      return `<div class="gah-emperor ${done ? 'done' : ''}">
        <div class="gah-emperor-head">${t.group} · 第 ${rd} 轮结算</div>
        <div class="gah-emperor-bonus">🎁 ${esc(t.reward)}</div>
        <div class="gah-emperor-pen">⚖️ ${esc(t.penalty)}</div>
      </div>`;
    }).join('');
  }

  // 官方主图板中部：皇帝轨 0-13，各玩家标记；≥3 奖励区 / 0 惩罚区
  _renderEmTrack() {
    const s = this.state;
    const wrap = this.root.querySelector('#gah-emtrack');
    let cells = '';
    for (let pos = 13; pos >= 0; pos--) {
      const vp = EMPEROR_POINTS[pos] || 0;
      const marks = s.players.map((p, i) =>
        p.emperor === pos ? `<span class="gah-emmark m-${i % 4}" title="${esc(p.name)}">${i + 1}</span>` : ''
      ).join('');
      cells += `<div class="gah-emcell ${pos >= 3 ? 'bonus' : ''} ${pos === 0 ? 'penalty' : ''}">
        <div class="gah-emmarks">${marks}</div>
        <div class="gah-empos">${pos}</div>
        <div class="gah-emvp">${vp}分</div>
      </div>`;
    }
    wrap.innerHTML = cells;
  }

  // 本回合指引：可以做什么 / 已做什么 / 还能做什么
  _renderGuide() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-guide');
    if (s.phase === 'ended') { wrap.innerHTML = '<div class="gah-hint">游戏已结束</div>'; return; }
    if (s.phase === 'setup') {
      if (s.pending && s.pending.type === 'prepare') {
        const done = me.rooms.filter(r => r.prepared).length;
        wrap.innerHTML = `<div class="gah-guide-item state-now"><i>②</i> 开局备房：点房间图板空位放置第 ${done + 1}/3 间（第一间=底层最左，后续须相邻；底层免费，高层按楼层收费）</div>`;
      } else {
        wrap.innerHTML = `<div class="gah-guide-item state-now"><i>①</i> 开局接客：点击上方客人队列免费接待 1 位</div>`;
      }
      return;
    }

    const my = this.myTurn();
    const items = [];
    const chip = (state, text) => `<span class="gah-gstate ${state}">${text}</span>`;

    // ① 接客（可选，每回合一次）
    if (me.guestTaken) items.push(`<div class="gah-guide-item ok"><i>①</i> 接客 ${chip('done', '✓ 已接')}</div>`);
    else if (me.cafe.length >= 3) items.push(`<div class="gah-guide-item"><i>①</i> 接客 ${chip('off', '咖啡吧已满')}</div>`);
    else items.push(`<div class="gah-guide-item ${my ? 'state-now' : ''}"><i>①</i> 接客（可选）${chip(my ? 'todo' : 'wait', my ? '点上方队列客人' : '非你的回合')}</div>`);

    // ② 取骰执行行动（必须）
    if (me.dieTaken) items.push(`<div class="gah-guide-item ok"><i>②</i> 取骰行动 ${chip('done', '✓ 已执行')}</div>`);
    else items.push(`<div class="gah-guide-item ${my ? 'state-now' : ''}"><i>②</i> <b>取骰行动（必须）</b>${chip(my ? 'todo' : 'wait', my ? '点左侧行动板块' : '非你的回合')}</div>`);

    // ③ 额外行动（随时可做，部分限次）
    const extras = [];
    extras.push(me.boosted
      ? `<div class="gah-guide-item ok"><i>·</i> 付 1 克朗 +1 强度 ${chip('done', '✓ 已用')}</div>`
      : (!me.dieTaken && me.money >= 1)
        ? `<div class="gah-guide-item"><i>·</i> 付 1 克朗 +1 强度 ${chip('todo', my ? '面板内勾选' : '待行动时')}</div>`
        : `<div class="gah-guide-item"><i>·</i> 付 1 克朗 +1 强度 ${chip('off', me.money < 1 ? '克朗不足' : '已取骰')}</div>`);

    const kitchenHas = me.kitchen.some(n => n > 0);
    const cafeNeed = me.cafe.some(g => !guestComplete(g));
    extras.push((kitchenHas && cafeNeed && (me.money >= 1 || me.hired.includes(24)))
      ? `<div class="gah-guide-item state-now"><i>·</i> 厨房补送（1 克朗送 ≤3 份）${chip('todo', my ? '点咖啡吧客人' : '非你的回合')}</div>`
      : `<div class="gah-guide-item"><i>·</i> 厨房补送 ${chip('off', !kitchenHas ? '厨房无货' : !cafeNeed ? '无待补订单' : '克朗不足')}</div>`);

    const roundStaff = me.hired.filter(id => STAFF_BY_ID[id] && STAFF_BY_ID[id].kind === 'round' && !me.staffUsed.includes(id));
    extras.push(roundStaff.length
      ? `<div class="gah-guide-item ${my ? 'state-now' : ''}"><i>·</i> 每轮员工 ×${roundStaff.length} ${chip('todo', my ? '点手牌下方「用」' : '非你的回合')}</div>`
      : `<div class="gah-guide-item"><i>·</i> 每轮员工 ${chip('off', me.hired.some(id => STAFF_BY_ID[id] && STAFF_BY_ID[id].kind === 'round') ? '✓ 本轮已用尽' : '未雇佣')}</div>`);

    const readyGuest = me.cafe.findIndex(g => guestComplete(g));
    extras.push(readyGuest >= 0
      ? `<div class="gah-guide-item ${my ? 'state-now' : ''}"><i>·</i> 入住完成订单的客人 ${chip('todo', my ? '点咖啡吧 ✓ 客人' : '非你的回合')}</div>`
      : `<div class="gah-guide-item"><i>·</i> 入住 ${chip('off', '暂无订单完成的客人')}</div>`);

    const claimable = s.objectives.some((o, i) => objectiveMet(me, o) && !me.claims.includes(i) && o.spots.some(sp => sp.seat == null));
    extras.push(claimable
      ? `<div class="gah-guide-item ${my ? 'state-now' : ''}"><i>·</i> 目标卡标记（15/10/5）${chip('todo', my ? '点主图板目标卡' : '非你的回合')}</div>`
      : `<div class="gah-guide-item"><i>·</i> 目标卡标记 ${chip('off', '暂未达标或已标')}</div>`);

    items.push(`<div class="gah-guide-group">额外行动（随时）</div>` + extras.join(''));

    // ④ 结束回合
    if (me.dieTaken) items.push(`<div class="gah-guide-item state-now"><i>④</i> 结束回合 ${chip('todo', my ? '点下方「结束回合」' : '非你的回合')}</div>`);
    else items.push(`<div class="gah-guide-item"><i>④</i> 结束回合 ${chip('off', '需先取骰（或全体跳过后收骰）')}</div>`);

    const head = my
      ? `<div class="gah-guide-head me">轮到你了 —— 按顺序完成：</div>`
      : s.pending && s.pending.seat === this.humanIndex
        ? `<div class="gah-guide-head me">你有待处理的选择，见下方「操作」：</div>`
        : `<div class="gah-guide-head">等待 ${esc(s.players[s.currentPlayer].name)} 行动…（你的回合进度）</div>`;
    wrap.innerHTML = head + items.join('');
  }

  _renderHotel() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-hotel');
    const mode = this.ui.mode;
    const rows = [];
    for (let row = 3; row >= 0; row--) {
      let cells = '';
      for (let col = 0; col < 5; col++) {
        const idx = row * 5 + col;
        const r = me.rooms[idx];
        const color = ROOM_COLORS[idx];
        const badge = IMMEDIATE_VP[idx];
        let cls = `gah-room c-${color}`;
        if (r.occupied) cls += ' occupied';
        else if (r.prepared) cls += ' prepared';
        else cls += ' vacant';
        let selectable = false;
        if (mode && mode.type === 'prepare') selectable = canPrepareIndex(me, idx, mode.maxFloor ?? 3) && !mode.picked.includes(idx);
        if (mode && mode.type === 'occupy') selectable = r.prepared && !r.occupied && !mode.picked.includes(idx);
        if (mode && mode.type === 'prepareOccupy') selectable = canPrepareIndex(me, idx, mode.maxFloor ?? 3);
        if (mode && mode.type === 'checkin') {
          const g = me.cafe[mode.guestIdx];
          const def = g ? GUEST_BY_ID[g.gid] : null;
          selectable = !!(def && r.prepared && !r.occupied && (def.color === 'green' || def.color === color));
        }
        if (mode && mode.picked && mode.picked.includes(idx)) cls += ' picked';
        if (selectable) cls += ' selectable';
        cells += `<div class="${cls}" data-act="room" data-idx="${idx}">
          ${badge ? `<span class="gah-roombadge">+${badge}</span>` : ''}
          ${r.occupied ? '<span class="gah-roommark">🛏</span>' : r.prepared ? '<span class="gah-roommark">🔑</span>' : `<span class="gah-roomcost">${FLOOR_COST[row]}克朗</span>`}
        </div>`;
      }
      rows.push(`<div class="gah-row"><span class="gah-floor">${row + 1}F</span>${cells}</div>`);
    }
    wrap.innerHTML = rows.join('');

    const prepared = me.rooms.filter(r => r.prepared).length;
    const occupied = me.rooms.filter(r => r.occupied).length;
    const hint = this.root.querySelector('#gah-hotel-hint');
    hint.textContent = `已备 ${prepared} · 已住 ${occupied}`;

    this.root.querySelector('#gah-res').innerHTML =
      `<span>💰 ${me.money} 克朗</span>
       <span>👑 皇帝轨 <b>${me.emperor}</b> (${EMPEROR_POINTS[me.emperor] || 0}分)</span>
       <span>🏨 房 ${prepared}/20</span>`;

    this._renderBonusRule(me);
  }

  // 满组奖励规则 + 各组实时进度
  _renderBonusRule(me) {
    const wrap = this.root.querySelector('#gah-bonusrule');
    if (!wrap) return;
    const rule = {
      blue: '1/2/3/4 间组 → +2/+5/+9/+15 分',
      red: '1/2/3/4 间组 → +1/+3/+6/+10 克朗',
      yellow: '1/2/3/4 间组 → +1/+3/+6/+10 皇帝轨'
    };
    const rows = ['blue', 'red', 'yellow'].map(c => `
      <div class="gah-br-row">
        <span class="gah-color bar c-${c}" title="${COLOR_NAMES[c]}房"></span>
        <span class="gah-br-rule">${rule[c]}</span>
      </div>`).join('');

    // 各组进度：只显示玩家已备过房的组
    const chips = [];
    for (const grp of ROOM_GROUPS) {
      const preparedN = grp.filter(i => me.rooms[i].prepared).length;
      if (!preparedN) continue;
      const occN = grp.filter(i => me.rooms[i].occupied).length;
      const color = ROOM_COLORS[grp[0]];
      const full = occN === grp.length;
      chips.push(`<span class="gah-br-chip c-${color} ${full ? 'full' : ''}">${occN}/${grp.length}${full ? ' ✓已满' : ''}</span>`);
    }
    const prog = chips.length
      ? `<div class="gah-br-prog">${chips.join('')}</div>`
      : `<div class="gah-br-prog"><span class="gah-br-none">同色房间组全部住满即触发（进度会显示在这里）</span></div>`;

    wrap.innerHTML = `<div class="gah-br-title">🏆 满组奖励（同色房整组住满）</div>${rows}${prog}`;
  }

  _renderCafe() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-cafe');
    let html = me.cafe.map((g, i) => {
      const def = GUEST_BY_ID[g.gid];
      const done = guestComplete(g);
      const mode = this.ui.mode;
      const sel = mode && mode.type === 'checkin' && mode.guestIdx === i;
      const orderHtml = def.order.map((need, f) => {
        if (need <= 0) return '';
        const have = g.items[f] || 0;
        return foodDot(FOOD_KEYS[f], `${have}/${need}`, `gah-need ${have >= need ? 'ok' : ''}`);
      }).join('');
      return `<div class="gah-cafeguest rc-${def.color} ${done ? 'done' : ''} ${sel ? 'sel' : ''}" data-act="cafe" data-idx="${i}" title="${COLOR_NAMES[def.color]}客人">
        <div class="gah-cg-head">
          <span class="gah-vp">${def.vp}分</span>
        </div>
        <div class="gah-needs">${orderHtml}</div>
        <div class="gah-reward">${rewardText(def.rewards)}</div>
        ${done ? '<div class="gah-ready">✓ 订单完成，点我选房间入住</div>' : ''}
      </div>`;
    }).join('');
    for (let i = me.cafe.length; i < 3; i++) html += `<div class="gah-cafeslot">空位</div>`;
    wrap.innerHTML = html;

    this.root.querySelector('#gah-kitchen').innerHTML = `<span class="gah-kitchen-label">厨房</span>` +
      FOOD_KEYS.map((k, i) =>
        `<span class="gah-kchen">${foodChip(k, me.kitchen[i])}</span>`).join('') +
      `<span class="gah-hint">点咖啡吧客人可用 1 克朗送最多 3 份</span>`;
  }

  _renderHand() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-hand');
    wrap.innerHTML = me.hand.length ? me.hand.map(id => {
      const def = STAFF_BY_ID[id];
      return `<div class="gah-staff" data-act="hand" data-staff="${id}">
        <div class="gah-staff-head"><b>${esc(def.name)}</b><span>${def.cost}克朗</span></div>
        <div class="gah-staff-kind k-${def.kind}">${KIND_ZH[def.kind]}</div>
        <div class="gah-staff-text">${esc(def.text)}</div>
      </div>`;
    }).join('') : '<div class="gah-empty">暂无手牌</div>';

    const hired = me.hired.map(id => {
      const def = STAFF_BY_ID[id];
      const used = me.staffUsed.includes(id);
      const usable = def.kind === 'round' && !used && this.myTurn();
      return `<span class="gah-hiredchip k-${def.kind} ${used ? 'used' : ''}" title="${esc(def.text)}">
        ${esc(def.name)}${def.kind === 'round' ? (usable ? `<button class="gah-mini" data-act="use-staff" data-staff="${id}">用</button>` : (used ? '✓' : '')) : ''}
      </span>`;
    }).join('');
    this.root.querySelector('#gah-hired').innerHTML = hired ? `<div class="gah-hired-label">已雇佣</div>${hired}` : '';
  }

  _renderOpponents() {
    const s = this.state;
    const wrap = this.root.querySelector('#gah-opponents');
    wrap.innerHTML = s.players.map((p, i) => {
      if (i === this.humanIndex) return '';
      const online = this.memberOnline && this.memberOnline[i] === false;
      const prepared = p.rooms.filter(r => r.prepared).length;
      const occupied = p.rooms.filter(r => r.occupied).length;
      return `<div class="gah-opp ${s.currentPlayer === i ? 'active' : ''}">
        <div class="gah-opp-head"><b>${esc(p.name)}</b>${p.isAI ? '<span class="gah-tag">电脑</span>' : ''}${online ? '<span class="gah-tag danger">离线</span>' : ''}</div>
        <div class="gah-opp-stats">
          <span>⭐ ${p.score}</span><span>💰 ${p.money}</span><span>👑 ${p.emperor}</span>
        </div>
        <div class="gah-opp-stats">
          <span>🏨 ${prepared}/${occupied}</span><span>☕ ${p.cafe.length}</span><span>👔 ${p.hired.length}</span><span>🃏 ${p.hand.length}</span>
        </div>
      </div>`;
    }).join('');
  }

  _renderPending() {
    const s = this.state;
    const me = this.me();
    const wrap = this.root.querySelector('#gah-pending');
    const ui = this.ui;
    const t = s.pending;
    if (!t) { wrap.innerHTML = ''; return; }
    if (t.seat !== this.humanIndex) {
      wrap.innerHTML = `<div class="gah-pendbox">等待 ${esc(s.players[t.seat].name)} 完成选择…</div>`;
      return;
    }

    const p = this.me();
    let body = '';
    if (t.type === 'prepare' || t.type === 'occupy') {
      if (!ui.mode || ui.mode.type !== t.type || ui.mode.source !== 'pending') {
        ui.mode = {
          type: t.type, count: t.count, discount: t.discount || 0,
          maxFloor: t.maxFloor ?? 3, picked: [], source: 'pending'
        };
      }
      const mode = ui.mode;
      const picked = mode.picked || [];
      const label = t.type === 'prepare' ? '准备房间' : '标记为已入住';
      if (t.setupRooms) {
        const done = me.rooms.filter(r => r.prepared).length;
        body = `<div class="gah-pendtitle">开局备房：放置第 ${done + 1}/3 间</div>
        <div class="gah-hint">在房间图板点 1 个空位 · 第一间=底层最左，后续须相邻 · 楼层费 1层0/2层1/3层2/4层3 克朗<br>方块底色=房型颜色（蓝/红/黄）</div>
        <div class="gah-opts">
          <button class="gah-btn primary" data-act="pend-rooms-done" ${picked.length ? '' : 'disabled'}>确认放置（${picked.length}/1）</button>
        </div>`;
      } else {
        body = `<div class="gah-pendtitle">请选择${label}（最多 ${t.count} 间）</div>
        <div class="gah-hint">已选 ${picked.length} 间 · 在左侧房间图板上点选</div>
        <div class="gah-opts">
          <button class="gah-btn primary" data-act="pend-rooms-done">确认（${picked.length}/${t.count}）</button>
          <button class="gah-btn" data-act="pend-skip">放弃</button>
        </div>`;
      }
    } else if (t.type === 'prepareOccupy') {
      body = `<div class="gah-pendtitle">免费放置并入住 1 间房</div>
        <div class="gah-hint">在房间图板上点选高亮位置（${t.maxFloor <= 1 ? '仅底部两层' : '任意楼层'}）</div>
        <div class="gah-opts"><button class="gah-btn" data-act="pend-skip">放弃</button></div>`;
    } else if (t.type === 'hire' || t.type === 'offer') {
      const cards = t.type === 'offer' ? (t.cards || []) : p.hand;
      body = `<div class="gah-pendtitle">${t.type === 'offer' ? '抽 3 选 1 雇佣' : '从手牌雇佣 1 名'}（减免 ${t.discount >= 99 ? '全部' : t.discount} 克朗）</div>
        <div class="gah-opts col">` + cards.map(id => {
        const def = STAFF_BY_ID[id];
        const cost = Math.max(0, def.cost - (t.discount || 0));
        return `<button class="gah-btn ${cost <= p.money ? '' : 'disabled'}" data-act="pend-staff" data-staff="${id}">
          <b>${esc(def.name)}</b> · ${cost} 克朗 · ${KIND_ZH[def.kind]}<br><i>${esc(def.text)}</i></button>`;
      }).join('') + `</div>
        <div class="gah-opts"><button class="gah-btn" data-act="pend-skip">放弃</button></div>`;
    } else if (t.type === 'guestPick') {
      body = `<div class="gah-pendtitle">${t.setup ? '开局免费接待 1 位客人' : `免费接待 ${t.count} 位客人`}</div>
        <div class="gah-hint">点击左侧队列中的客人</div>
        <div class="gah-opts"><button class="gah-btn" data-act="pend-skip">放弃</button></div>`;
    } else if (t.type === 'foodPick') {
      const sel = ui.foodPick || [0, 0, 0, 0];
      const total = sel.reduce((a, b) => a + b, 0);
      body = `<div class="gah-pendtitle">任选 ${t.count} 份餐饮</div>` +
        FOOD_KEYS.map((k, i) => `<div class="gah-foodrow">
          <span>${foodChip(k)}</span>
          <button class="gah-mini" data-act="food-minus" data-f="${i}">−</button>
          <b>${sel[i]}</b>
          <button class="gah-mini" data-act="food-plus" data-f="${i}">＋</button>
        </div>`).join('') +
        `<div class="gah-opts"><button class="gah-btn primary ${total === t.count ? '' : 'disabled'}" data-act="food-ok">确认 ${total}/${t.count}</button></div>`;
    } else if (t.type === 'complete') {
      body = `<div class="gah-pendtitle">用公共供应完成 1 位客人的订单</div>
        <div class="gah-hint">点击左侧咖啡吧中的客人</div>
        <div class="gah-opts"><button class="gah-btn" data-act="pend-skip">放弃</button></div>`;
    } else if (t.type === 'bonusDie') {
      const target = ui.pendingTarget;
      if (!target) {
        body = `<div class="gah-pendtitle">额外执行一次骰子行动（不取骰）</div>
          <div class="gah-opts">` + [1, 2, 3, 4, 5].map(x =>
          `<button class="gah-btn" data-act="coin-target" data-target="${x}">${SPACE_INFO[x].icon} ${SPACE_INFO[x].name}（强度 ${s.dice[x] || 0}）</button>`
        ).join('') + `</div>
          <div class="gah-opts"><button class="gah-btn" data-act="pend-skip">放弃</button></div>`;
      } else {
        body = `<div class="gah-pendtitle">模仿行动 ${target}（强度 ${s.dice[target] || 0}）</div>` +
          this._optionsHTML(target, s.dice[target] || 0, target, null, true) +
          `<div class="gah-opts"><button class="gah-btn" data-act="pend-skip">放弃</button></div>`;
      }
    } else {
      body = `<div class="gah-pendtitle">请处理：${t.type}</div>`;
    }

    wrap.innerHTML = `<div class="gah-pendbox">
      <div class="gah-pendhead">⏳ 需要你的选择</div>${body}
      <div class="gah-statusline">${esc(ui.status)}</div>
    </div>`;
  }

  _renderBars() {
    const s = this.state, me = this.me();
    const wrap = this.root.querySelector('#gah-actionsbar');
    if (s.phase === 'ended') { wrap.innerHTML = ''; return; }
    const my = this.myTurn();
    const canEnd = my && (me.dieTaken || diceTotal(s) <= 0);
    const canPass = my && !me.dieTaken;
    const canBoost = false;
    let conf = '';
    if (this.ui.confirm) {
      conf = `<div class="gah-confirm">${esc(this.ui.confirm.text)}
        <button class="gah-btn primary" data-act="confirm-yes">确认</button>
        <button class="gah-btn" data-act="confirm-no">取消</button></div>`;
    }
    // 行动 3 的选房确认条
    const mode = this.ui.mode;
    if (mode && (mode.type === 'prepare' || mode.type === 'occupy') && mode.source === 'action') {
      const isPrep = mode.type === 'prepare';
      conf += `<div class="gah-confirm">${isPrep ? '准备房间' : '标记入住'}：已选 ${mode.picked.length}/${mode.count} 间
        <button class="gah-btn primary" data-act="mode-done">确认执行</button>
        <button class="gah-btn" data-act="mode-cancel">取消</button></div>`;
    }
    wrap.innerHTML = `
      ${conf}
      <div class="gah-opts">
        <button class="gah-btn ${canEnd ? 'primary' : 'disabled'}" data-act="end-turn">结束回合</button>
        <button class="gah-btn ${canPass ? '' : 'disabled'}" data-act="pass">跳过（等重掷）</button>
      </div>`;
    this.root.querySelector('#gah-status').innerHTML = esc(this.ui.status);
  }

  _renderLog() {
    const s = this.state;
    const wrap = this.root.querySelector('#gah-log');
    const items = (s.log || []).slice(-40).reverse();
    wrap.innerHTML = items.map(l =>
      `<div class="gah-logline t-${l.type}">
        <span class="gah-loground">R${l.round}</span>
        <span class="gah-logname">${esc(l.name || '')}</span>
        <span class="gah-logdesc">${esc(l.desc)}</span>
      </div>`).join('') || '<div class="gah-empty">暂无记录</div>';
  }

  _renderEnd() {
    const s = this.state;
    const end = this.root.querySelector('#gah-end');
    if (s.phase !== 'ended') { end.classList.add('hidden'); end.innerHTML = ''; return; }
    end.classList.remove('hidden');

    const ranked = s.players.slice().sort((a, b) => b.score - a.score);
    const isHost = !this.session || this.session.isHost;
    const rows = ranked.map((p, i) => `
      <div class="gah-score-row ${s.winners.includes(p.seat) ? 'winner' : ''}">
        <span>${i === 0 ? '🏆 ' : ''}${esc(p.name)}${p.isAI ? ' 🤖' : ''}</span>
        <span>${p.score} 分 · 住 ${p.hotel.length} 位 · 员工 ${p.hired.length}</span>
      </div>`).join('');

    const detail = (s.finalScores || []).map(d =>
      `<div class="gah-final-line"><b>${esc(d.name)}</b>：${esc(d.parts.join('，'))} = ${d.gained >= 0 ? '+' : ''}${d.gained}</div>`).join('');

    const logHtml = this.ui.endLog
      ? `<div class="gah-endlog">${(s.log || []).slice().reverse().map(l =>
        `<div class="gah-logline"><span class="gah-loground">R${l.round}</span><span class="gah-logname">${esc(l.name || '')}</span><span class="gah-logdesc">${esc(l.desc)}</span></div>`
      ).join('')}</div>`
      : '';

    end.innerHTML = `<div class="gah-endcard">
      <h2>🏆 游戏结束</h2>
      <div class="gah-scores">${rows}</div>
      <div class="gah-final">${detail}</div>
      <div class="gah-endbtns">
        ${this.session
        ? (isHost
          ? `<button class="gah-btn primary" data-act="rematch">🔄 再来一局</button>`
          : `<button class="gah-btn disabled">⏳ 等房主再来一局</button>`)
        : `<button class="gah-btn primary" data-act="rematch">🔄 再来一局</button>`}
        <button class="gah-btn" data-act="end-log">📜 ${this.ui.endLog ? '收起' : '查看'}本局记录</button>
      </div>
      ${logHtml}
    </div>`;
  }

  // ===== 交互 =====
  handle(act, d) {
    const s = this.state;
    try {
      switch (act) {
        case 'space': this._openPanel(+d.space); break;
        case 'cancel-panel': this.ui.panel = null; this.ui.status = ''; this.render(); break;
        case 'boost': this.ui.panel && (this.ui.panel.boost = !this.ui.panel.boost); this.render(); break;
        case 'wild': this.ui.panel.target = +d.target; this.render(); break;
        case 'food1': this._die({ type: 'TAKE_DIE', action: +this.ui.panel.space, strudel: (+d.st - +d.cake), cake: +d.cake }); break;
        case 'food2': this._die({ type: 'TAKE_DIE', action: +this.ui.panel.space, wine: (+d.st - +d.coffee), coffee: +d.coffee }); break;
        case 'split4': this._die({ type: 'TAKE_DIE', action: +this.ui.panel.space, emperor: +d.k, money: (+d.st - +d.k) }); break;
        case 'hire': this._die({ type: 'TAKE_DIE', action: +this.ui.panel.space, staffId: +d.staff }); break;
        case 'prep': this._startPrepare(this.ui.panel.space, +d.st, 0, 3, 'action', null, this.ui.panel.boost); break;
        case 'queue': this._takeGuest(+d.slot); break;
        case 'obj': this._claim(+d.idx); break;
        case 'room': this._room(+d.idx); break;
        case 'cafe': this._cafe(+d.idx); break;
        case 'hand': this._hand(+d.staff); break;
        case 'use-staff': this._useStaff(+d.staff); break;
        case 'end-turn': this._simple({ type: 'END_TURN' }); break;
        case 'pass': this._simple({ type: 'PASS' }); break;
        case 'confirm-yes': { const a = this.ui.confirm.action; this.ui.confirm = null; this._execute(a); break; }
        case 'confirm-no': this.ui.confirm = null; this.render(); break;
        case 'mode-done': this._finishActionRooms(); break;
        case 'mode-cancel': this.ui.mode = null; this.ui.status = ''; this.render(); break;
        case 'pend-rooms-done': this._resolveRooms(); break;
        case 'pend-skip': this._resolveSkip(); break;
        case 'pend-staff': this._resolveStaff(+d.staff); break;
        case 'coin-target': this.ui.pendingTarget = +d.target; this.render(); break;
        case 'food-plus': this._foodAdjust(+d.f, 1); break;
        case 'food-minus': this._foodAdjust(+d.f, -1); break;
        case 'food-ok': this._foodOk(); break;
        // 奖励流程里的选项（resolve 前缀）
        case 'r-food1': this._resolveSimple({ target: 1, strudel: (+d.st - +d.cake), cake: +d.cake }); break;
        case 'r-food2': this._resolveSimple({ target: 2, wine: (+d.st - +d.coffee), coffee: +d.coffee }); break;
        case 'r-split4': this._resolveSimple({ target: 4, emperor: +d.k, money: (+d.st - +d.k) }); break;
        case 'r-hire': this._resolveStaff(+d.staff); break;
        case 'r-prep': this._startPrepare(null, +d.st, 0, 3, 'pending', +d.target); break;
        case 'end-log': this.ui.endLog = !this.ui.endLog; this.render(); break;
        case 'rematch':
          if (this.onRematch) this.onRematch();
          break;
        default: break;
      }
    } catch (e) {
      this.ui.status = e.message || String(e);
      this.render();
    }
  }

  _openPanel(space) {
    const s = this.state, me = this.me();
    this.ui.status = '';
    if (s.phase === 'ended') return;
    if (s.pending) { this.ui.status = '请先处理当前选择'; this.render(); return; }
    if (s.currentPlayer !== this.humanIndex) {
      this.ui.status = `等待 ${s.players[s.currentPlayer].name} 行动`;
      this.render(); return;
    }
    if (me.dieTaken) { this.ui.status = '本回合已经取过骰子'; this.render(); return; }
    if ((s.dice[space] || 0) <= 0) { this.ui.status = '该行动区没有骰子'; this.render(); return; }
    this.ui.panel = { space, boost: false, target: null };
    this.render();
  }

  _die(action) {
    if (this.ui.panel && this.ui.panel.boost) action.boost = true;
    const err = validateAction(this.state, this.humanIndex, action);
    if (err) { this.ui.status = err; this.render(); return; }
    this._execute(action);
  }

  _execute(action) {
    try {
      this.state = applyAction(this.state, this.humanIndex, action);
      this.ui.panel = null;
      this.ui.mode = null;
      this.ui.status = '';
      this.ui.foodPick = null;
      this.ui.pendingTarget = null;
      this.render();
      this.afterChange();
    } catch (e) {
      this.ui.status = e.message || String(e);
      this.render();
    }
  }

  _simple(action) {
    const err = validateAction(this.state, this.humanIndex, action);
    if (err) { this.ui.status = err; this.render(); return; }
    this._execute(action);
  }

  _takeGuest(slot) {
    const s = this.state;
    if (s.pending) {
      if (s.pending.seat === this.humanIndex && (s.pending.type === 'guestPick')) {
        this._execute({ type: 'RESOLVE', choice: { slot } });
      }
      return;
    }
    if (s.currentPlayer !== this.humanIndex) { this.ui.status = `等待 ${s.players[s.currentPlayer].name} 行动`; this.render(); return; }
    const def = GUEST_BY_ID[s.guestQueue[slot]];
    const cost = MARKET_COST[slot];
    if (!def) return;
    this.ui.confirm = {
      text: `花 ${this.me().hired.includes(25) ? 0 : cost} 克朗接待这位客人（${COLOR_CHAR[def.color]} · ${def.vp}分）？`,
      action: { type: 'TAKE_GUEST', slot }
    };
    this.render();
  }

  _claim(i) {
    const s = this.state, me = this.me();
    if (s.currentPlayer !== this.humanIndex || s.pending) { this.ui.status = '只能在自己回合放置目标标记'; this.render(); return; }
    if (me.claims.includes(i)) { this.ui.status = '这张卡你已经放过标记'; this.render(); return; }
    if (!objectiveMet(me, s.objectives[i])) { this.ui.status = '尚未满足该目标卡条件'; this.render(); return; }
    this._execute({ type: 'CLAIM_POLITICS', index: i });
  }

  _startPrepare(space, count, discount, maxFloor, source, target, boost) {
    const base = { count, discount, maxFloor, picked: [], source, target: target || null, boost: !!boost };
    if (source === 'action') base.space = space;
    this.ui.mode = { ...base, type: 'prepare' };
    this.ui.panel = null;
    this.render();
  }

  _finishActionRooms() {
    const mode = this.ui.mode;
    if (!mode || mode.source !== 'action') return;
    if (mode.type === 'prepare') {
      const action = { type: 'TAKE_DIE', action: mode.space, rooms: mode.picked.slice() };
      if (mode.boost) action.boost = true;
      this.ui.mode = null;
      this._die(action);
    } else {
      this.ui.mode = null;
    }
  }

  _room(idx) {
    const s = this.state, me = this.me();
    const mode = this.ui.mode;

    // 待选：免费放置并入住
    if (s.pending && s.pending.seat === this.humanIndex && s.pending.type === 'prepareOccupy') {
      if (!canPrepareIndex(me, idx, s.pending.maxFloor ?? 3)) { this.ui.status = '该位置不能放置'; this.render(); return; }
      this._execute({ type: 'RESOLVE', choice: { roomIndex: idx } });
      return;
    }

    if (mode && (mode.type === 'prepare' || mode.type === 'occupy')) {
      const legal = mode.type === 'prepare'
        ? canPrepareIndex(me, idx, mode.maxFloor ?? 3)
        : (me.rooms[idx].prepared && !me.rooms[idx].occupied);
      if (!legal) { this.ui.status = mode.type === 'prepare' ? '该位置不能准备（需相邻且颜色对应）' : '该房间不能标记入住'; this.render(); return; }
      const at = mode.picked.indexOf(idx);
      if (at >= 0) mode.picked.splice(at, 1);
      else {
        if (mode.picked.length >= mode.count) { this.ui.status = `最多选择 ${mode.count} 间`; this.render(); return; }
        mode.picked.push(idx);
      }
      this.render();
      return;
    }

    if (mode && mode.type === 'checkin') {
      this._checkIn(mode.guestIdx, idx);
      return;
    }

    // 普通点击：提示
    const r = me.rooms[idx];
    const color = COLOR_NAMES[ROOM_COLORS[idx]];
    this.ui.status = `${Math.floor(idx / 5) + 1} 层${color}房 · ` +
      (r.occupied ? '已入住' : r.prepared ? '已准备（空房）' : `未准备（${FLOOR_COST[Math.floor(idx / 5)]} 克朗）`);
    this.render();
  }

  _cafe(idx) {
    const s = this.state, me = this.me();
    const g = me.cafe[idx];
    if (!g) return;
    const def = GUEST_BY_ID[g.gid];

    // 待选：公共供应完成订单
    if (s.pending && s.pending.seat === this.humanIndex && s.pending.type === 'complete') {
      this._execute({ type: 'RESOLVE', choice: { guestIdx: idx } });
      return;
    }

    if (guestComplete(g)) {
      if (this.ui.mode && this.ui.mode.type === 'checkin' && this.ui.mode.guestIdx === idx) {
        this.ui.mode = null; this.render(); return;
      }
      const hasRoom = me.rooms.some((r, i) => r.prepared && !r.occupied && (def.color === 'green' || ROOM_COLORS[i] === def.color));
      if (!hasRoom) {
        this.ui.status = `没有匹配的空房（需要${def.color === 'green' ? '任意颜色' : COLOR_CHAR[def.color] + '色房'}）`;
        this.render(); return;
      }
      this.ui.mode = { type: 'checkin', guestIdx: idx };
      this.ui.status = '点高亮的房间安排入住';
      this.render();
      return;
    }

    // 未完成：从厨房送餐（免费铺完后仍需补差）
    const items = [0, 0, 0, 0];
    let left = 3;
    for (let f = 0; f < 4 && left > 0; f++) {
      const need = def.order[f] - (g.items[f] || 0);
      const take = Math.min(need, me.kitchen[f], left);
      if (take > 0) { items[f] = take; left -= take; }
    }
    if (!items.some(n => n > 0)) {
      this.ui.status = '厨房没有这位客人需要的餐饮';
      this.render(); return;
    }
    const free = me.hired.includes(24);
    const txt = items.map((n, f) => n > 0 ? `${FOOD_CHAR[FOOD_KEYS[f]]}×${n}` : '').filter(Boolean).join('+');
    this.ui.confirm = {
      text: `从厨房送 ${txt} 给${COLOR_CHAR[def.color]}色客人（${free ? '领班免费' : '1 克朗'}）`,
      action: { type: 'MOVE_FOOD', moves: [{ g: idx, items }] }
    };
    this.render();
  }

  _checkIn(guestIdx, roomIndex) {
    this._execute({ type: 'CHECK_IN', guestIdx, roomIndex });
    this.ui.mode = null;
  }

  _hand(id) {
    const def = STAFF_BY_ID[id];
    this.ui.status = `「${def.name}」（${def.cost} 克朗 · ${KIND_ZH[def.kind]}）：${def.text}`;
    this.render();
  }

  _useStaff(id) {
    this._simple({ type: 'USE_STAFF', staffId: id });
  }

  _resolveRooms() {
    const mode = this.ui.mode;
    const t = this.state.pending;
    if (!t || !mode) return;
    if (t.type === 'prepare') this._execute({ type: 'RESOLVE', choice: { rooms: mode.picked } });
    else this._execute({ type: 'RESOLVE', choice: { rooms: mode.picked } });
  }

  _resolveSkip() {
    const t = this.state.pending;
    if (!t) return;
    if (t.type === 'guestPick') this._execute({ type: 'RESOLVE', choice: {} });
    else if (t.type === 'hire' || t.type === 'offer') this._execute({ type: 'RESOLVE', choice: {} });
    else this._execute({ type: 'RESOLVE', choice: {} });
  }

  _resolveStaff(id) {
    this._execute({ type: 'RESOLVE', choice: { staffId: id } });
  }

  _resolveSimple(choice) {
    this._execute({ type: 'RESOLVE', choice });
  }

  _foodAdjust(f, delta) {
    const t = this.state.pending;
    if (!t) return;
    const sel = this.ui.foodPick || [0, 0, 0, 0];
    const next = sel.slice();
    next[f] = Math.max(0, next[f] + delta);
    if (next.reduce((a, b) => a + b, 0) > t.count) return;
    this.ui.foodPick = next;
    this.render();
  }

  _foodOk() {
    const t = this.state.pending;
    const sel = this.ui.foodPick || [0, 0, 0, 0];
    if (sel.reduce((a, b) => a + b, 0) !== t.count) return;
    this._execute({ type: 'RESOLVE', choice: { foods: sel } });
  }
}
