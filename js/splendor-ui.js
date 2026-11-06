// 璀璨宝石 UI 渲染 + 交互
import { initGame, applyAction, validateAction, listValidActions } from './splendor-engine.js';
import { pickAction } from './splendor-ai.js';
import { GEM_NAMES, GEM_COLORS } from './splendor-data.js';

// 宝石简称（贵族牌条件里显示）
const GEM_NAMES_SHORT = { white: '白', blue: '蓝', green: '绿', red: '红', black: '黑' };

// 每个房间一个 SplendorGame 实例
export class SplendorGame {
  constructor(container, options = {}) {
    this.container = container;
    this.playerNames = options.playerNames || ['你', 'AI-1', 'AI-2', 'AI-3'];
    this.humanIndex = options.humanIndex ?? 0;
    this.onGameOver = options.onGameOver || (() => {});
    this.state = null;
    // === 选择模式状态 ===
    this.pendingAction = null;     // null | { type, ... } 正在预览的动作
    this.selectedGems = [];        // 选 3 颗不同色
    this.selectedCard = null;      // 选场上/预留的卡
    this.aiTimer = null;
  }

  start() {
    this.state = initGame(this.playerNames);
    // 给非人类玩家打 AI 标记
    this.state.players.forEach((p, i) => {
      p.isAI = i !== this.humanIndex;
    });
    // 暴露到 window 方便调试
    window.__splendor = this;
    this._renderAll();
    this._maybeAIMove();
  }

  // ===== 渲染入口 =====
  _renderAll() {
    if (this.state.gameOver) {
      this._renderEnd();
      return;
    }
    this._renderPlayersBar();
    this._renderNobles();
    this._renderTiers();
    this._renderGemPool();
    // 动作条挂到 splendor-side-bottom 里
    this._renderActionBar();
  }

  // ===== 四面玩家区域 =====
  _renderPlayersBar() {
    // 位置分配：除了自己（humanIndex），其他玩家按顺序分到 上/左/右
    const total = this.state.players.length;
    const others = this.state.players.filter((_, i) => i !== this.humanIndex);
    const positions = ['left', 'top', 'right']; // 3 个坑，按顺序塞

    // 先隐藏所有非底部的位置
    document.querySelectorAll('.splendor-side:not(.splendor-bottom)').forEach(el => el.classList.add('hidden-seat'));

    others.forEach((p, idx) => {
      const pos = positions[idx];
      const el = document.getElementById(`splendor-side-${pos}`);
      if (!el) return;
      el.classList.remove('hidden-seat');
      el.innerHTML = this._renderOpponentHTML(p, this.state.currentPlayer === this.state.players.indexOf(p));
    });

    // 底部是自己
    const bottom = document.getElementById('splendor-side-bottom');
    bottom.innerHTML = this._renderMyHTML();

    // 给自己的预留卡绑点击
    bottom.querySelectorAll('[data-reserved-id]').forEach(el => {
      const cardId = el.dataset.reservedId;
      el.addEventListener('click', () => this._onReservedCardClick(cardId));
    });

    // 给自己的已持有卡（预留点击）留个空位，暂不绑
  }

  _renderOpponentHTML(p, isCurrent) {
    const ownedCounts = {};
    for (const c of GEM_COLORS) ownedCounts[c] = 0;
    p.ownedCards.forEach(c => ownedCounts[c.color] = (ownedCounts[c.color] || 0) + 1);

    const gemDots = [...GEM_COLORS, 'gold'].map(c => {
      const n = p.gems[c] || 0;
      return `<div class="ps-gem ${c} ${n === 0 ? 'empty' : ''}" title="${GEM_NAMES[c]} ${n}">${n || ''}</div>`;
    }).join('');

    const ownedCards = p.ownedCards.map(c => {
      const idx = ownedCounts[c.color];
      ownedCounts[c.color]--;
      return `<div class="ps-owned-card ${c.color}" title="${GEM_NAMES[c.color]} · VP ${c.vp || 0}">${c.vp || ''}${c.tier ? `·${c.tier}` : ''}</div>`;
    }).join('');

    const reservedBacks = p.reserved.length > 0
      ? `<div class="ps-reserved-row">${Array(p.reserved.length).fill(0).map(() => `<div class="ps-reserved-back">背面</div>`).join('')}</div>`
      : '';

    const nobles = p.nobles.length > 0
      ? `<div class="ps-nobles">${p.nobles.map(n => `<span class="ps-noble">👑+3</span>`).join('')}</div>`
      : '';

    return `
      <div class="ps-name">
        <span>${p.isAI ? '🤖 ' : ''}${p.name}${isCurrent ? ' ← 回合' : ''}</span>
        <span class="ps-score">${p.score}</span>
      </div>
      <div class="ps-resource-row">${gemDots}</div>
      <div class="ps-owned">${ownedCards}</div>
      ${reservedBacks}
      ${nobles}
    `;
  }

  _renderMyHTML() {
    const p = this.state.players[this.humanIndex];
    const isMyTurn = this.state.currentPlayer === this.humanIndex;

    // 我自己：全量显示
    const ownedCards = p.ownedCards.map(c => {
      return `<div class="splendor-card" style="width:52px;height:72px;background:${this._tierBg(c.tier || 1)}">
        <div class="card-vp">${c.vp || ''}</div>
        <div class="card-color-bar ${c.color}"></div>
        <div class="card-cost">${GEM_COLORS.filter(gc => c.cost[gc]).map(gc => `<div class="card-cost-row"><span class="dot ${gc}"></span><span>${c.cost[gc]}</span></div>`).join('')}</div>
      </div>`;
    }).join('');

    const reservedCards = p.reserved.map((c, idx) => {
      const canBuy = isMyTurn && validateAction(this.state, this.humanIndex, { type: 'BUY', source: 'reserved', cardId: c.id }) === null;
      const selectedThis = this.selectedCard?.source === 'reserved' && this.selectedCard.cardId === c.id;
      return `<div class="splendor-card reserved ${canBuy ? 'buyable' : ''} ${selectedThis ? 'selected' : ''}" style="width:52px;height:72px;background:${this._tierBg(c.tier)}" data-reserved-id="${c.id}">
        <div class="card-vp">${c.vp || ''}</div>
        <div class="card-color-bar ${c.color}"></div>
        <div class="card-cost">${GEM_COLORS.filter(gc => c.cost[gc]).map(gc => `<div class="card-cost-row"><span class="dot ${gc}"></span><span>${c.cost[gc]}</span></div>`).join('')}</div>
      </div>`;
    }).join('');

    const totalGems = this._totalGems(p.gems);
    const gemBadges = [...GEM_COLORS, 'gold'].map(c => {
      const n = p.gems[c] || 0;
      return `<span class="${n > 0 ? 'hand-gem-badge has' : 'hand-gem-badge'}">${GEM_NAMES[c]} ${n}</span>`;
    }).join('');

    return `
      <div class="ps-name" style="justify-content:space-between">
        <span>👤 我 · ${p.name}${isMyTurn ? ' ← 你的回合' : ''}</span>
        <span class="ps-score" style="color:var(--gold)">${p.score} pts</span>
      </div>
      <div style="font-size:12px;color:var(--text-dim);margin:4px 0">回合 ${this.state.turn} · 宝石 ${totalGems}/10 · 预留 ${p.reserved.length}/3</div>
      <div class="hand-gems">${gemBadges}</div>
      <div class="owned-cards-row" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
        ${ownedCards || '<span style="opacity:0.3;font-size:11px">暂无可购卡</span>'}
      </div>
      ${p.reserved.length > 0 ? `
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px">预留区</div>
        <div class="reserved-cards-row" style="display:flex;gap:4px;margin-top:2px">${reservedCards}</div>
      ` : ''}
    `;
  }

  // ===== 宝石堆 =====
  _renderGemPool() {
    const pool = document.getElementById('splendor-gems');
    pool.innerHTML = '';

    const gemList = [...GEM_COLORS, 'gold'];
    for (const color of gemList) {
      const count = this.state.gemPool[color] || 0;
      const isSelected = this.selectedGems.includes(color);
      const div = document.createElement('div');
      div.className = `gem-pile ${count === 0 ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`;
      div.dataset.color = color;
      div.innerHTML = `
        <div class="gem-circle ${color}">${color === 'gold' ? '★' : ''}</div>
        <div class="gem-count">${GEM_NAMES[color]} · ${count}${isSelected ? ' ✓' : ''}</div>
      `;
      if (count > 0) div.addEventListener('click', () => this._onGemClick(color));
      pool.appendChild(div);
    }
  }

  // ===== 贵族 =====
  _renderNobles() {
    const row = document.getElementById('splendor-nobles');
    row.innerHTML = '';
    this.state.nobles.forEach(n => {
      const div = document.createElement('div');
      div.className = 'noble-card';
      const req = n.req || n;
      const reqs = [];
      for (const c of GEM_COLORS) if (req[c]) reqs.push({ color: c, count: req[c] });
      div.innerHTML = `
        <div class="noble-vp">👑 +3</div>
        <div class="noble-req">
          ${reqs.map(r => `<span class="req-chip req-${r.color}">${r.count} ${GEM_NAMES_SHORT[r.color] || r.color}</span>`).join(' ')}
        </div>
      `;
      row.appendChild(div);
    });
  }

  // ===== 三级卡 =====
  _renderTiers() {
    const isMyTurn = this.state.currentPlayer === this.humanIndex;
    const pending = this.pendingAction;

    for (const tier of [1, 2, 3]) {
      const container = document.getElementById(`splendor-tier-${tier}`);
      container.className = `splendor-tier tier-${tier}`;
      container.innerHTML = '';

      const cards = this.state.board[`tier${tier}`];
      cards.forEach((card, idx) => {
        const reserved = card._reservedSource === 'board';
        if (reserved) return;

        const canBuy = isMyTurn && pending?.type === 'BUY' && validateAction(this.state, this.humanIndex, {
          type: 'BUY', source: 'board', tier, cardIndex: idx
        }) === null;
        const isBuyableAll = isMyTurn && pending?.type !== 'BUY' && validateAction(this.state, this.humanIndex, {
          type: 'BUY', source: 'board', tier, cardIndex: idx
        }) === null;
        const isReserveable = isMyTurn && pending?.type === 'RESERVE' && validateAction(this.state, this.humanIndex, {
          type: 'RESERVE', source: 'board', tier, cardIndex: idx
        }) === null;
        const selectedThis = this.selectedCard?.source === 'board' && this.selectedCard.tier === tier && this.selectedCard.cardIndex === idx;

        const div = document.createElement('div');
        div.className = `splendor-card ${canBuy || isBuyableAll ? 'buyable' : ''} ${selectedThis ? 'selected' : ''}`;
        div.dataset.tier = tier;
        div.dataset.cardIdx = idx;
        div.style.background = this._tierBg(tier);

        const costRows = GEM_COLORS.filter(c => card.cost[c]).map(c => `
          <div class="card-cost-row">
            <span class="dot ${c}"></span><span>${card.cost[c]}</span>
          </div>
        `).join('');

        div.innerHTML = `
          <div class="card-vp">${card.vp || ''}</div>
          <div class="card-color-bar ${card.color}"></div>
          <div class="card-cost">${costRows}</div>
          <div class="card-action-hint" style="display:${pending ? 'block' : 'none'}">
            ${canBuy ? '💰 可购买' : ''}${isReserveable ? '📋 可预留' : ''}
          </div>
        `;

        if (isMyTurn) {
          div.addEventListener('click', () => this._onBoardCardClick(tier, idx));
        }
        container.appendChild(div);
      });
    }
  }

  _tierBg(tier) {
    if (tier === 3) return 'linear-gradient(135deg, #2d1f0e, #4a3418)';
    if (tier === 2) return 'linear-gradient(135deg, #1f2d3a, #183048)';
    return 'linear-gradient(135deg, #1f2d1f, #184830)';
  }

  _totalGems(gems) {
    return [...GEM_COLORS, 'gold'].reduce((s, c) => s + (gems[c] || 0), 0);
  }

  // ===== 动作选择条 =====
  _renderActionBar() {
    // 清掉旧的
    document.querySelectorAll('.action-row, .preview-row, .confirm-row').forEach(n => n.remove());

    const isMyTurn = this.state.currentPlayer === this.humanIndex && !this.state.players[this.humanIndex].isAI;
    if (!isMyTurn) return;

    const hand = document.getElementById('splendor-side-bottom');
    const p = this.state.players[this.humanIndex];

    // ===== 动作按钮 =====
    const row = document.createElement('div');
    row.className = 'action-row';

    const actions = this._getAvailableActionTypes();
    const buttons = [
      { key: 'TAKE_DIFF', label: '💎 拿3色宝石', hint: '选 3 颗不同颜色宝石' },
      { key: 'TAKE_SAME', label: '💎💎 拿2颗同色', hint: '选 1 种颜色（需剩 ≥4）' },
      { key: 'RESERVE', label: '📋 预留 + 黄金', hint: '选场上/牌堆顶的卡' },
      { key: 'BUY', label: '💰 买卡', hint: '选场上或预留的可买卡' },
    ];
    for (const b of buttons) {
      if (!actions[b.key.toLowerCase()] && !actions[b.key]) continue;
      if (!actions[b.key.toLowerCase()]) continue;
      const btn = document.createElement('button');
      btn.className = `action-btn ${this.pendingAction?.type === b.key ? 'selected' : ''}`;
      btn.title = b.hint;
      btn.textContent = b.label;
      btn.addEventListener('click', () => this._toggleAction(b.key));
      row.appendChild(btn);
    }
    hand.appendChild(row);

    // ===== 预览区（选了动作之后才显示） =====
    if (this.pendingAction) {
      const preview = document.createElement('div');
      preview.className = 'preview-row';

      let previewText = '';
      let canConfirm = false;
      const a = this.pendingAction;

      if (a.type === 'TAKE_DIFF') {
        const colors = this.selectedGems;
        previewText = `✅ 已选 ${colors.length}/3 颗宝石：${colors.length > 0 ? colors.map(c => GEM_NAMES[c]).join(', ') : '请点击下方宝石堆选择'}`;
        canConfirm = colors.length === 3;
      } else if (a.type === 'TAKE_SAME') {
        const color = this.selectedGems[0];
        if (color) {
          previewText = `✅ 已选：${GEM_NAMES[color]} × 2（剩余 ${this.state.gemPool[color]}）`;
          canConfirm = true;
        } else {
          previewText = '� 点击一个颜色的宝石堆（剩余 ≥4）';
        }
      } else if (a.type === 'RESERVE') {
        if (this.selectedCard) {
          const c = this.selectedCard;
          const txt = c.source === 'top' ? `牌堆顶 ${c.tier} 级` : `场上 ${c.tier} 级`;
          previewText = `✅ 已选：预留 ${txt} 卡 + 拿 1 黄金（预留槽 ${p.reserved.length}/3）`;
          canConfirm = true;
        } else {
          previewText = '� 点击场上的卡或选择牌堆顶';
          // 牌堆顶快捷按钮
          const deckRow = document.createElement('div');
          deckRow.style.cssText = 'display:flex;gap:8px;margin-top:6px';
          for (const t of [3, 2, 1]) {
            if (this.state.decks[`tier${t}`].length === 0) continue;
            if (validateAction(this.state, this.humanIndex, { type: 'RESERVE', source: 'top', tier: t }) !== null) continue;
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.textContent = `📋 抽 ${t} 级顶卡`;
            btn.addEventListener('click', () => this._selectReserveTop(t));
            deckRow.appendChild(btn);
          }
          preview.appendChild(deckRow);
        }
      } else if (a.type === 'BUY') {
        if (this.selectedCard) {
          previewText = `✅ 已选：购买 ${this.selectedCard.source === 'reserved' ? '预留区' : '场上'} ${this.selectedCard.tier || ''} 级卡`;
          canConfirm = true;
        } else {
          previewText = '👇 点击场上发金色光的可购买卡（或预留区的卡）';
        }
      }

      preview.innerHTML += `<div style="font-size:12px;color:var(--gold);margin-top:4px">${previewText}</div>`;

      // 操作按钮
      const btnRow = document.createElement('div');
      btnRow.className = 'confirm-row';
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'action-btn';
      cancelBtn.style.borderColor = '#e06666';
      cancelBtn.textContent = '✕ 取消';
      cancelBtn.addEventListener('click', () => this._cancelAction());
      btnRow.appendChild(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.className = `action-btn ${canConfirm ? 'selected' : ''}`;
      confirmBtn.disabled = !canConfirm;
      confirmBtn.textContent = '✓ 确认执行';
      confirmBtn.style.opacity = canConfirm ? '1' : '0.4';
      confirmBtn.style.cursor = canConfirm ? 'pointer' : 'not-allowed';
      confirmBtn.addEventListener('click', () => this._confirmAction());
      btnRow.appendChild(confirmBtn);

      preview.appendChild(btnRow);
      hand.appendChild(preview);
    }
  }

  _getAvailableActionTypes() {
    const result = { take_diff: false, take_same: false, reserve: false, buy: false };
    const p = this.state.players[this.humanIndex];
    const colors = GEM_COLORS.filter(c => this.state.gemPool[c] > 0);
    result.take_diff = colors.length >= 3;
    result.take_same = GEM_COLORS.some(c => this.state.gemPool[c] >= 4);
    if (p.reserved.length < 3 && this.state.gemPool.gold > 0) {
      result.reserve = true;
    }
    const all = listValidActions(this.state, this.humanIndex);
    result.buy = all.some(a => a.type === 'BUY');
    return result;
  }

  _toggleAction(type) {
    if (this.pendingAction?.type === type) {
      // 再点一次 → 取消
      this._cancelAction();
      return;
    }
    this.pendingAction = { type };
    this.selectedGems = [];
    this.selectedCard = null;
    this._renderAll();
  }

  _cancelAction() {
    this.pendingAction = null;
    this.selectedGems = [];
    this.selectedCard = null;
    this._renderAll();
  }

  // ===== 点击事件处理 =====
  _onGemClick(color) {
    if (this.state.currentPlayer !== this.humanIndex) return;

    // 点击黄金：特殊处理
    if (color === 'gold') {
      if (!this.pendingAction) {
        // 没选动作 → 自动进入预留模式
        // 检查是否合法
        const p = this.state.players[this.humanIndex];
        if (p.reserved.length >= 3) { alert('预留槽已满（最多 3 张）'); return; }
        if (this.state.gemPool.gold < 1) { alert('黄金不足'); return; }
        const totalNow = this._totalGems(p.gems);
        if (totalNow + 1 > 10) { alert('拿完黄金会超 10 颗宝石'); return; }
        this.pendingAction = { type: 'RESERVE' };
        this.selectedCard = null;
        this.selectedGems = [];
        this._renderAll();
        return;
      } else if (this.pendingAction.type === 'RESERVE') {
        // 已经在预留模式 → 黄金只是个"我想预留"的确认，提示选卡
        alert('请点击场上的卡或选择牌堆顶来完成预留');
        return;
      } else {
        // 其他动作下点黄金无效
        return;
      }
    }

    // 普通宝石（非黄金）
    if (this.pendingAction?.type === 'TAKE_DIFF') {
      const idx = this.selectedGems.indexOf(color);
      if (idx >= 0) {
        this.selectedGems.splice(idx, 1);
      } else if (this.selectedGems.length < 3) {
        const p = this.state.players[this.humanIndex];
        if (this._totalGems(p.gems) + this.selectedGems.length + 1 > 10) {
          alert('拿完会超 10 颗宝石');
          return;
        }
        this.selectedGems.push(color);
      }
    } else if (this.pendingAction?.type === 'TAKE_SAME') {
      if (this.selectedGems[0] === color) {
        this.selectedGems = [];
      } else {
        this.selectedGems = [color];
      }
    }
    this._renderAll();
  }

  _selectReserveTop(tier) {
    this.selectedCard = { source: 'top', tier };
    this._renderAll();
  }

  _onBoardCardClick(tier, idx) {
    if (this.state.currentPlayer !== this.humanIndex) return;

    if (this.pendingAction?.type === 'BUY') {
      // 检查能不能买
      if (validateAction(this.state, this.humanIndex, { type: 'BUY', source: 'board', tier, cardIndex: idx }) === null) {
        this.selectedCard = { source: 'board', tier, cardIndex: idx };
        this._renderAll();
      } else {
        alert('宝石不足，无法购买这张卡');
      }
    } else if (this.pendingAction?.type === 'RESERVE') {
      if (validateAction(this.state, this.humanIndex, { type: 'RESERVE', source: 'board', tier, cardIndex: idx }) === null) {
        this.selectedCard = { source: 'board', tier, cardIndex: idx };
        this._renderAll();
      } else {
        alert('无法预留（槽满或黄金不足）');
      }
    }
  }

  _onReservedCardClick(cardId) {
    if (this.pendingAction?.type !== 'BUY') return;
    if (validateAction(this.state, this.humanIndex, { type: 'BUY', source: 'reserved', cardId }) === null) {
      if (this.selectedCard?.cardId === cardId) {
        this.selectedCard = null;
      } else {
        this.selectedCard = { source: 'reserved', cardId };
      }
      this._renderAll();
    }
  }

  // ===== 确认执行 =====
  _confirmAction() {
    if (!this.pendingAction) return;

    let action;
    const a = this.pendingAction;

    if (a.type === 'TAKE_DIFF') {
      if (this.selectedGems.length !== 3) return;
      action = { type: 'TAKE_DIFF', colors: this.selectedGems };
    } else if (a.type === 'TAKE_SAME') {
      if (!this.selectedGems[0]) return;
      action = { type: 'TAKE_SAME', color: this.selectedGems[0] };
    } else if (a.type === 'RESERVE') {
      if (!this.selectedCard) return;
      const c = this.selectedCard;
      action = { type: 'RESERVE', source: c.source, tier: c.tier || 1, cardIndex: c.cardIndex };
    } else if (a.type === 'BUY') {
      if (!this.selectedCard) return;
      const c = this.selectedCard;
      if (c.source === 'board') {
        action = { type: 'BUY', source: 'board', tier: c.tier, cardIndex: c.cardIndex };
      } else {
        action = { type: 'BUY', source: 'reserved', cardId: c.cardId };
      }
    }

    if (!action) return;

    try {
      const err = validateAction(this.state, this.humanIndex, action);
      if (err) {
        alert('规则不合法：' + err);
        return;
      }
      this.state = applyAction(this.state, this.humanIndex, action);
      this.pendingAction = null;
      this.selectedGems = [];
      this.selectedCard = null;
      this._renderAll();
      this._checkGameOver();
      this._maybeAIMove();
    } catch (e) {
      alert('执行失败：' + e.message);
    }
  }

  // ===== AI 自动走 =====
  _maybeAIMove() {
    if (this.state.gameOver) return;
    const p = this.state.players[this.state.currentPlayer];
    if (!p.isAI) return;

    console.log('[AI] currentPlayer:', this.state.currentPlayer, 'name:', p.name, 'isAI:', p.isAI);

    this.aiTimer = setTimeout(() => {
      const actions = listValidActions(this.state, this.state.currentPlayer);
      console.log('[AI] valid actions:', actions.length);
      if (actions.length === 0) {
        console.log('[AI] NO VALID ACTIONS!');
        return;
      }
      const action = pickAction(this.state, this.state.currentPlayer);
      console.log('[AI] picked:', action);
      if (!action) return;
      try {
        this.state = applyAction(this.state, this.state.currentPlayer, action);
        this._renderAll();
        this._checkGameOver();
        this._maybeAIMove();
      } catch (e) {
        console.error('[AI] 执行报错:', e);
      }
    }, 800);
  }

  // ===== 终局 =====
  _checkGameOver() {
    if (this.state.gameOver) {
      this._renderEnd();
      this.onGameOver(this.state);
    }
  }

  _renderEnd() {
    document.getElementById('splendor-game').classList.add('hidden');
    const endEl = document.getElementById('splendor-end');
    endEl.classList.remove('hidden');
    const scores = document.getElementById('splendor-scores');
    scores.innerHTML = '';
    const sorted = [...this.state.players].sort((a, b) => b.score - a.score);
    sorted.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = `score-row ${this.state.winners.includes(p.id) ? 'winner' : ''}`;
      row.innerHTML = `
        <span>${i === 0 && this.state.winners.includes(p.id) ? '🏆 ' : ''}${p.name}${p.isAI ? ' 🤖' : ''}</span>
        <span>${p.score} pts · ${p.ownedCards.length} 卡 · ${p.nobles.length} 👑 贵族</span>
      `;
      scores.appendChild(row);
    });
  }
}
