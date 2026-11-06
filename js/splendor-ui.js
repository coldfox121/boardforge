// 璀璨宝石 UI 渲染 + 交互
import { initGame, applyAction, validateAction, listValidActions } from './splendor-engine.js';
import { pickAction } from './splendor-ai.js';
import { GEM_NAMES, GEM_COLORS } from './splendor-data.js';

// 每个房间一个 SplendorGame 实例
export class SplendorGame {
  constructor(container, options = {}) {
    this.container = container;
    this.playerNames = options.playerNames || ['你', 'AI-1', 'AI-2', 'AI-3'];
    this.humanIndex = options.humanIndex ?? 0;
    this.onGameOver = options.onGameOver || (() => {});
    this.state = null;
    this.selectedGems = [];        // 选 3 颗不同色 动作中
    this.selectedCard = null;      // 买卡 / 预留 动作中
    this.reserveMode = null;       // 'board' | 'top' | null
    this.actionMode = null;        // null | 'take_diff' | 'take_same' | 'reserve' | 'buy'
    this.aiTimer = null;
  }

  start() {
    this.state = initGame(this.playerNames);
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
    this._renderGemPool();
    this._renderNobles();
    this._renderTiers();
    this._renderHand();
    this._renderActionPanel();
  }

  // ===== 玩家条 =====
  _renderPlayersBar() {
    const bar = document.getElementById('splendor-players-bar');
    bar.innerHTML = '';
    this.state.players.forEach((p, i) => {
      const isCurrent = i === this.state.currentPlayer;
      const isMe = i === this.humanIndex;
      const div = document.createElement('div');
      div.className = `splendor-player ${isCurrent ? 'active' : ''} ${isMe ? 'me' : ''}`;
      div.innerHTML = `
        <div class="sp-name">${isMe ? '👤 ' : ''}${p.isAI ? '🤖 ' : ''}${p.name}${isCurrent ? ' ←' : ''}</div>
        <div class="sp-score">${p.score} pts</div>
        <div class="sp-info">卡 ${p.ownedCards.length} · 预 ${p.reserved.length} · 贵族 ${p.nobles.length}</div>
      `;
      bar.appendChild(div);
    });
  }

  // ===== 宝石堆 =====
  _renderGemPool() {
    const pool = document.getElementById('splendor-gems');
    pool.innerHTML = '';
    const isMyTurn = this.state.currentPlayer === this.humanIndex && !this.state.players[this.humanIndex].isAI;

    const gemList = [...GEM_COLORS, 'gold'];
    for (const color of gemList) {
      const count = this.state.gemPool[color] || 0;
      const isSelected = this.selectedGems.includes(color);
      const canTake = isMyTurn && !this.state.gameOver && count > 0 && this.actionMode !== 'buy';
      const div = document.createElement('div');
      div.className = `gem-pile ${canTake ? '' : 'disabled'} ${isSelected ? 'selected' : ''}`;
      div.innerHTML = `
        <div class="gem-circle ${color}">${color === 'gold' ? '★' : ''}</div>
        <div class="gem-count">${GEM_NAMES[color]} · ${count}</div>
      `;
      if (canTake) div.addEventListener('click', () => this._onGemClick(color));
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
      const reqs = [];
      for (const c of GEM_COLORS) if (n[c]) reqs.push(`${n[c]}${c[0]}`);
      div.innerHTML = `
        <div class="noble-vp">👑 +3</div>
        <div class="noble-req">${reqs.join(' ')}</div>
      `;
      row.appendChild(div);
    });
    // 已获得的贵族在自己手牌区展示
  }

  // ===== 三级卡 =====
  _renderTiers() {
    for (const tier of [1, 2, 3]) {
      const container = document.getElementById(`splendor-tier-${tier}`);
      container.className = `splendor-tier tier-${tier}`;
      container.innerHTML = '';

      const cards = this.state.board[`tier${tier}`];
      cards.forEach((card, idx) => {
        const buyable = this._canBuy(card, tier, idx);
        const reserved = card._reservedSource === 'board'; // 预留卡标记（不显示在场上）
        if (reserved) return;
        const div = document.createElement('div');
        div.className = `splendor-card ${buyable ? 'buyable' : ''}`;
        div.dataset.tier = tier;
        div.dataset.cardIdx = idx;
        div.style.background = this._tierBg(tier);

        // 成本显示
        const costRows = GEM_COLORS.filter(c => card.cost[c]).map(c => `
          <div class="card-cost-row">
            <span class="dot ${c}"></span><span>${card.cost[c]}</span>
          </div>
        `).join('');

        div.innerHTML = `
          <div class="card-vp">${card.vp || ''}</div>
          <div class="card-color-bar ${card.color}"></div>
          <div class="card-cost">${costRows}</div>
        `;

        // 场上卡只能通过「买」动作拿；预留也可以
        if (this.state.currentPlayer === this.humanIndex) {
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

  _canBuy(card, tier, idx) {
    if (this.state.currentPlayer !== this.humanIndex) return false;
    if (this.state.players[this.humanIndex].isAI) return false;
    const a = { type: 'BUY', source: 'board', tier, cardIndex: idx };
    return validateAction(this.state, this.humanIndex, a) === null;
  }

  // ===== 手牌区 =====
  _renderHand() {
    const hand = document.getElementById('splendor-hand');
    hand.innerHTML = '';
    const p = this.state.players[this.humanIndex];
    const isMyTurn = this.state.currentPlayer === this.humanIndex && !p.isAI;

    // 宝石统计 badge
    const badgeRow = document.createElement('div');
    badgeRow.className = 'hand-gems';
    for (const color of [...GEM_COLORS, 'gold']) {
      const count = p.gems[color] || 0;
      const cls = count > 0 ? 'hand-gem-badge has' : 'hand-gem-badge';
      badgeRow.innerHTML += `<span class="${cls}">${GEM_NAMES[color]} ${count}</span>`;
    }
    hand.appendChild(badgeRow);

    // 已持有卡
    const cardRow = document.createElement('div');
    cardRow.className = 'hand-cards-row';
    p.ownedCards.forEach(card => {
      const div = document.createElement('div');
      div.className = 'splendor-card';
      div.style.background = this._tierBg(card.tier);
      div.style.cursor = 'default';
      div.innerHTML = `
        <div class="card-vp">${card.vp || ''}</div>
        <div class="card-color-bar ${card.color}"></div>
        <div class="card-cost">${card.vp > 0 ? '<div style="font-size:9px;color:var(--gold)">⭐ 高分卡</div>' : '<div style="font-size:9px;opacity:0.5">基础产出</div>'}</div>
      `;
      cardRow.appendChild(div);
    });
    hand.appendChild(cardRow);

    // 预留区
    if (p.reserved.length > 0) {
      const reserveRow = document.createElement('div');
      reserveRow.className = 'hand-reserved-row';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:11px;color:var(--text-dim);margin-bottom:4px;width:100%';
      title.textContent = `预留槽 (${p.reserved.length}/3) · 点卡可以购买`;
      reserveRow.appendChild(title);

      p.reserved.forEach(card => {
        const div = document.createElement('div');
        div.className = `splendor-card reserved ${this._canBuyReserved(card) ? 'buyable' : ''}`;
        div.style.background = this._tierBg(card.tier);
        if (this._canBuyReserved(card)) {
          div.addEventListener('click', () => this._onReservedBuy(card.id));
        }
        const costRows = GEM_COLORS.filter(c => card.cost[c]).map(c => `
          <div class="card-cost-row"><span class="dot ${c}"></span><span>${card.cost[c]}</span></div>
        `).join('');
        div.innerHTML = `
          <div class="card-vp">${card.vp || ''}</div>
          <div class="card-color-bar ${card.color}"></div>
          <div class="card-cost">${costRows}</div>
        `;
        reserveRow.appendChild(div);
      });
      hand.appendChild(reserveRow);
    }

    // 手牌总数
    const header = document.createElement('div');
    header.className = 'hand-header';
    header.innerHTML = `<span>你的回合：${isMyTurn ? '🎯 请选择动作' : `等待 ${this.state.players[this.state.currentPlayer].name} 操作`}</span><span>宝石 ${this._totalGems(p.gems)}/10 · 回合 ${this.state.turn}</span>`;
    hand.prepend(header);
  }

  _totalGems(gems) {
    return [...GEM_COLORS, 'gold'].reduce((s, c) => s + (gems[c] || 0), 0);
  }

  _canBuyReserved(card) {
    if (this.state.currentPlayer !== this.humanIndex) return false;
    const a = { type: 'BUY', source: 'reserved', cardId: card.id };
    return validateAction(this.state, this.humanIndex, a) === null;
  }

  // ===== 动作面板 =====
  _renderActionPanel() {
    // 放在手牌区下面（hand 已经有 action-row 了）
    // 简化：在 hand 顶部追加动作选择条
    const p = this.state.players[this.humanIndex];
    if (this.state.currentPlayer !== this.humanIndex || p.isAI) return;

    const hand = document.getElementById('splendor-hand');
    // 清掉旧的 action-row
    hand.querySelectorAll('.action-row').forEach(n => n.remove());

    // 四个动作
    const actions = this._getAvailableActionTypes();
    const row = document.createElement('div');
    row.className = 'action-row';

    const buttons = [
      { key: 'take_diff', label: '💎 3 颗不同色宝石' },
      { key: 'take_same', label: '💎💎 2 颗同色宝石 (需剩≥4)' },
      { key: 'reserve', label: '📋 预留 + 拿黄金' },
      { key: 'buy', label: '💰 买卡' },
    ];
    for (const b of buttons) {
      if (!actions[b.key]) continue;
      const btn = document.createElement('button');
      btn.className = `action-btn ${this.actionMode === b.key ? 'selected' : ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => this._toggleAction(b.key));
      row.appendChild(btn);
    }
    // 取消按钮
    if (this.actionMode) {
      const cancel = document.createElement('button');
      cancel.className = 'action-btn';
      cancel.style.borderColor = '#e06666';
      cancel.textContent = '✕ 取消';
      cancel.addEventListener('click', () => this._clearAction());
      row.appendChild(cancel);
    }
    hand.appendChild(row);
  }

  _getAvailableActionTypes() {
    const p = this.state.players[this.humanIndex];
    const result = { take_diff: false, take_same: false, reserve: false, buy: false };

    // take_diff: 至少有 3 种宝石有货
    const colors = GEM_COLORS.filter(c => this.state.gemPool[c] > 0);
    if (colors.length >= 3) result.take_diff = true;

    // take_same: 某色剩 ≥4
    result.take_same = GEM_COLORS.some(c => this.state.gemPool[c] >= 4);

    // reserve: 槽未满且有黄金
    if (p.reserved.length < 3 && this.state.gemPool.gold > 0) result.reserve = true;

    // buy: 有可买的卡
    const allActions = listValidActions(this.state, this.humanIndex);
    result.buy = allActions.some(a => a.type === 'BUY');

    return result;
  }

  // ===== 动作处理 =====
  _toggleAction(mode) {
    this._clearAction();
    this.actionMode = mode;
    if (mode === 'take_diff') this.selectedGems = [];
    this._renderAll();
  }

  _clearAction() {
    this.actionMode = null;
    this.selectedGems = [];
    this.selectedCard = null;
    this.reserveMode = null;
    this._renderAll();
  }

  _onGemClick(color) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    const isMyTurn = true;
    if (!isMyTurn) return;

    if (this.actionMode === 'take_diff') {
      // 切换选中
      const idx = this.selectedGems.indexOf(color);
      if (idx >= 0) this.selectedGems.splice(idx, 1);
      else if (!this.selectedGems.includes(color) && this.selectedGems.length < 3) {
        // 拿完不超 10
        const p = this.state.players[this.humanIndex];
        const after = this._totalGems(p.gems) + this.selectedGems.length + 1;
        if (after > 10) { alert('拿完会超 10 颗宝石'); return; }
        this.selectedGems.push(color);
      }
      if (this.selectedGems.length === 3) {
        // 执行
        try {
          this.state = applyAction(this.state, this.humanIndex, {
            type: 'TAKE_DIFF', colors: this.selectedGems
          });
          this._clearAction();
          this._checkGameOver();
          this._maybeAIMove();
          return;
        } catch (e) {
          alert(e.message);
        }
      }
      this._renderAll();
    } else if (this.actionMode === 'take_same') {
      try {
        this.state = applyAction(this.state, this.humanIndex, {
          type: 'TAKE_SAME', color
        });
        this._clearAction();
        this._checkGameOver();
        this._maybeAIMove();
      } catch (e) { alert(e.message); }
    } else if (this.actionMode === 'reserve') {
      // 黄金 + 预留？直接预留
      // 简化：点击黄金=预留牌堆顶；点击其他宝石=无意义
      if (color === 'gold') {
        this._showReserveModal();
      }
    } else if (this.actionMode === 'buy') {
      // 不处理宝石，buy 动作看卡片点击
    }
  }

  _showReserveModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card rules-card" style="max-width:380px">
        <button class="modal-close">✕</button>
        <h3>预留一张卡</h3>
        <p style="color:var(--text-dim);font-size:12px;margin-bottom:16px">从场上选一张卡，或从牌堆顶抽一张</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="action-btn" data-tier="3">📋 从 3 级牌堆顶抽</button>
          <button class="action-btn" data-tier="2">📋 从 2 级牌堆顶抽</button>
          <button class="action-btn" data-tier="1">📋 从 1 级牌堆顶抽</button>
        </div>
        <p style="font-size:11px;color:var(--text-dim);margin-top:12px">点击场上的卡也可以直接预留</p>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.action-btn[data-tier]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tier = Number(btn.dataset.tier);
        try {
          this.state = applyAction(this.state, this.humanIndex, {
            type: 'RESERVE', source: 'top', tier
          });
          modal.remove();
          this._clearAction();
          this._checkGameOver();
          this._maybeAIMove();
        } catch (e) { alert(e.message); }
      });
    });
  }

  _onBoardCardClick(tier, idx) {
    if (this.state.currentPlayer !== this.humanIndex) return;

    if (this.actionMode === 'buy') {
      try {
        this.state = applyAction(this.state, this.humanIndex, {
          type: 'BUY', source: 'board', tier, cardIndex: idx
        });
        this._clearAction();
        this._checkGameOver();
        this._maybeAIMove();
      } catch (e) { alert(e.message); }
    } else if (this.actionMode === 'reserve') {
      try {
        this.state = applyAction(this.state, this.humanIndex, {
          type: 'RESERVE', source: 'board', tier, cardIndex: idx
        });
        this._clearAction();
        this._checkGameOver();
        this._maybeAIMove();
      } catch (e) { alert(e.message); }
    } else {
      // 默认行为：如果能买就直接买
      if (this._canBuy({ tier }, tier, idx)) {
        try {
          this.state = applyAction(this.state, this.humanIndex, {
            type: 'BUY', source: 'board', tier, cardIndex: idx
          });
          this._clearAction();
          this._checkGameOver();
          this._maybeAIMove();
        } catch (e) { alert(e.message); }
      } else {
        this._renderActionPanel(); // 刷新显示可用动作
      }
    }
  }

  _onReservedBuy(cardId) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    try {
      this.state = applyAction(this.state, this.humanIndex, {
        type: 'BUY', source: 'reserved', cardId
      });
      this._clearAction();
      this._checkGameOver();
      this._maybeAIMove();
    } catch (e) { alert(e.message); }
  }

  // ===== AI 自动走 =====
  _maybeAIMove() {
    if (this.state.gameOver) return;
    const p = this.state.players[this.state.currentPlayer];
    if (!p.isAI) return;

    // 延迟 800ms 让人类看清
    this.aiTimer = setTimeout(() => {
      const action = pickAction(this.state, this.state.currentPlayer);
      if (!action) return;
      try {
        this.state = applyAction(this.state, this.state.currentPlayer, action);
        this._renderAll();
        this._checkGameOver();
        this._maybeAIMove(); // 连走直到轮到人类
      } catch (e) {
        console.error('AI 报错:', e);
      }
    }, 600);
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
