// 璀璨宝石 UI 渲染 + 交互（直接操作，不选动作类型）
import { initGame, applyAction, validateAction, listValidActions, discardGems } from './splendor-engine.js?v=24';
import { pickAction } from './splendor-ai.js?v=24';
import { GEM_NAMES, GEM_COLORS } from './splendor-data.js?v=24';

const GEM_NAMES_SHORT = { white: '白', blue: '蓝', green: '绿', red: '红', black: '黑' };

export class SplendorGame {
  constructor(container, options = {}) {
    this.container = container;
    this.playerNames = options.playerNames || ['你', 'AI-1', 'AI-2', 'AI-3'];
    this.humanIndex = options.humanIndex ?? 0;
    this.onGameOver = options.onGameOver || (() => {});
    this.state = null;
    // === 自由操作状态 ===
    this.ops = {
      gems: [],              // 已点的宝石颜色数组（可重复）
      card: null,            // 已点的卡 { source: 'board'|'reserved'|'top', tier?, cardIndex?, cardId? }
      goldTaken: false,      // 是否点过黄金（触发预留模式）
    };
    this.lastError = null;
    this.aiTimer = null;
  }

  start() {
    this.state = initGame(this.playerNames);
    this.state.players.forEach((p, i) => { p.isAI = i !== this.humanIndex; });
    this.actionLog = [];
    window.__splendor = this;
    this._renderAll();
    this._maybeAIMove();
  }

  // ===== 渲染入口 =====
  _renderAll() {
    if (this.state.gameOver) { this._renderEnd(); return; }
    this._renderPlayersBar();
    this._renderNobles();
    this._renderTiers();
    this._renderGemPool();
    this._renderActionBar();
    this._renderLog();
  }

  // ===== 四面玩家区域 =====
  _renderPlayersBar() {
    const others = this.state.players.filter((_, i) => i !== this.humanIndex);
    const positions = ['left', 'top', 'right'];
    document.querySelectorAll('.splendor-side:not(.splendor-bottom)').forEach(el => el.classList.add('hidden-seat'));
    others.forEach((p, idx) => {
      const pos = positions[idx];
      const el = document.getElementById(`splendor-side-${pos}`);
      if (!el) return;
      el.classList.remove('hidden-seat');
      el.innerHTML = this._renderOpponentHTML(p, this.state.currentPlayer === this.state.players.indexOf(p));
    });
    const bottom = document.getElementById('splendor-side-bottom');
    bottom.innerHTML = this._renderMyHTML();
    bottom.querySelectorAll('[data-reserved-id]').forEach(el => {
      el.addEventListener('click', () => this._onCardClick({ source: 'reserved', cardId: el.dataset.reservedId }));
    });
    bottom.querySelectorAll('[data-discard]').forEach(el => {
      el.addEventListener('click', () => this._onDiscardGem(el.dataset.discard));
    });
  }

  _renderOpponentHTML(p, isCurrent) {
    const gemDots = [...GEM_COLORS, 'gold'].map(c => {
      const n = p.gems[c] || 0;
      return `<div class="ps-gem ${c} ${n === 0 ? 'empty' : ''}" title="${GEM_NAMES[c]} ${n}">${n || ''}</div>`;
    }).join('');
    // 按 GEM_COLORS 排序，跟自己的宝石列对齐
    const ownedSorted = [...p.ownedCards].sort((a, b) => GEM_COLORS.indexOf(a.color) - GEM_COLORS.indexOf(b.color));
    const ownedCards = ownedSorted.map(c =>
      `<div class="splendor-card owned-only ${c.color}" style="width:28px;height:38px;background:${this._tierBg(c.tier || 1)};cursor:default" title="${GEM_NAMES[c.color]} · VP ${c.vp ?? 0}">
        <div class="card-vp" style="font-size:8px">${c.vp ?? 0}</div>
        <div class="card-color-bar ${c.color}" style="flex:1"></div>
      </div>`
    ).join('');
    const reservedBacks = p.reserved.length > 0
      ? `<div class="ps-reserved-row">${Array(p.reserved.length).fill(0).map(() => `<div class="ps-reserved-back">背面</div>`).join('')}</div>`
      : '';
    const nobles = p.nobles.length > 0
      ? `<div class="ps-nobles">${p.nobles.map(n => {
          const req = n.req || n;
          const reqs = GEM_COLORS.filter(c => req[c]).map(c =>
            `<span class="dot ${c}" style="width:8px;height:8px;vertical-align:middle"></span>${req[c]}`
          ).join('');
          return `<span class="ps-noble" title="贵族 +3 VP">👑${reqs}</span>`;
        }).join('')}</div>`
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

    // 按 GEM_COLORS 排序，跟宝石列对齐；再同色分组竖叠
    const ownedSorted = [...p.ownedCards].sort((a, b) => {
      const ai = GEM_COLORS.indexOf(a.color);
      const bi = GEM_COLORS.indexOf(b.color);
      if (ai !== bi) return ai - bi;
      return (b.vp || 0) - (a.vp || 0); // 同色内 VP 高的在前（底层）
    });
    const ownedByColor = {};
    for (const g of GEM_COLORS) ownedByColor[g] = [];
    for (const c of ownedSorted) ownedByColor[c.color].push(c);

    const ownedCardsHTML = GEM_COLORS.map(color => {
      const cards = ownedByColor[color];
      if (cards.length === 0) return '';
      const totalVP = cards.reduce((s, c) => s + (c.vp || 0), 0);
      // 同色竖叠：后面的卡向左上偏一点叠在前一张上；最顶层（最后一张）显示 VP 总和
      const stacked = cards.map((c, i) => {
        const offset = i * (-3);
        const isTop = i === cards.length - 1;
        return `<div class="splendor-card owned-only ${c.color}" style="width:40px;height:56px;background:${this._tierBg(c.tier || 1)};position:absolute;left:${offset}px;top:${offset}px;z-index:${i + 1}" title="${GEM_NAMES[color]} · 共 ${cards.length} 张 · 总 VP ${totalVP}">
          <div class="card-vp" style="font-size:10px">${isTop ? totalVP : (c.vp ?? 0)}</div>
          <div class="card-color-bar ${c.color}" style="flex:1"></div>
        </div>`;
      }).join('');
      const stackW = 40 + Math.abs((cards.length - 1) * -3);
      const stackH = 56 + Math.abs((cards.length - 1) * -3);
      const countTag = cards.length > 1 ? `<span class="stack-count">×${cards.length}</span>` : '';
      return `<div class="owned-stack" data-color="${color}" style="width:${stackW}px;height:${stackH}px">${stacked}${countTag}</div>`;
    }).join('');

    // 预留卡：和棋盘卡一样大 + cost-chip 正常显示
    const reservedCards = p.reserved.map(c => {
      const canBuy = isMyTurn && this._canBuyCard({ source: 'reserved', cardId: c.id });
      const selectedThis = this.ops.card?.source === 'reserved' && this.ops.card.cardId === c.id;
      const costHTML = GEM_COLORS.filter(g => c.cost[g] > 0)
        .map(g => `<span class="cost-chip"><span class="dot ${g}"></span>${c.cost[g]}</span>`).join('');
      return `<div class="splendor-card reserved owned-only ${canBuy ? 'buyable' : ''} ${selectedThis ? 'selected' : ''}" style="background:${this._tierBg(c.tier)}" data-reserved-id="${c.id}">
        <div class="card-vp">${c.vp ?? 0}</div>
        <div class="card-color-bar ${c.color}"></div>
        <div class="card-cost-inline">${costHTML}</div>
      </div>`;
    }).join('');
    const totalGems = this._totalGems(p.gems);
    const isDiscardMode = this._discardNeeded > 0;
    const gemBadges = [...GEM_COLORS, 'gold'].map(c => {
      const n = p.gems[c] || 0;
      const clickable = isDiscardMode && n > 0;
      return `<div class="my-gem-badge ${c} ${n > 0 ? 'has' : 'empty'} ${clickable ? 'clickable' : ''}" ${clickable ? `data-discard="${c}" title="点我弃掉"` : ''}>${n}</div>`;
    }).join('');

    return `
      <div class="ps-name" style="justify-content:space-between">
        <span>👤 我 · ${p.name}${isMyTurn ? ' ← 你的回合' : ''}</span>
        <span class="ps-score" style="color:var(--gold)">${p.score} pts</span>
      </div>
      <div style="font-size:12px;color:${isDiscardMode ? '#ff9966' : 'var(--text-dim)'};margin:4px 0">
        ${isDiscardMode ? `⚠️ 弃掉 ${this._discardNeeded} 颗宝石（点下方自己手里的宝石）` : `回合 ${this.state.turn} · 宝石 ${totalGems}/10 · 预留 ${p.reserved.length}/3`}
      </div>
      <div class="hand-gems ${isDiscardMode ? 'discard-mode' : ''}">${gemBadges}</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:6px">已持有</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;align-items:flex-start">${ownedCardsHTML || '<span style="opacity:0.3;font-size:11px">暂无</span>'}</div>
      ${p.reserved.length > 0 ? `
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px">预留区 · 点击可购买</div>
        <div style="display:flex;gap:4px;margin-top:2px">${reservedCards}</div>
      ` : ''}
    `;
  }

  _tierBg(tier) {
    if (tier === 3) return 'linear-gradient(135deg, #2d1f0e, #4a3418)';
    if (tier === 2) return 'linear-gradient(135deg, #1f2d3a, #183048)';
    return 'linear-gradient(135deg, #1f2d1f, #184830)';
  }

  _totalGems(gems) {
    return [...GEM_COLORS, 'gold'].reduce((s, c) => s + (gems[c] || 0), 0);
  }

  _canBuyCard(cardRef) {
    return validateAction(this.state, this.humanIndex, { type: 'BUY', ...cardRef }) === null;
  }

  // ===== 计算购买某张卡的实际消耗（对齐引擎 applyAction）=====
  _calcBuyDetail(cardRef) {
    const p = this.state.players[this.humanIndex];
    let card;
    try {
      if (cardRef.source === 'board') {
        card = this.state.board[`tier${cardRef.tier}`][cardRef.cardIndex];
      } else if (cardRef.source === 'reserved') {
        card = p.reserved.find(c => c.id === cardRef.cardId);
      }
    } catch(e) { return null; }
    if (!card) return null;

    // 先卡面 → 再普通宝石 → 最后黄金（对齐引擎 applyAction）
    const cardBonus = {};
    for (const c of GEM_COLORS) cardBonus[c] = 0;
    for (const c of p.ownedCards) cardBonus[c.color]++;

    const gemsUsed = {};
    let goldUsed = 0;
    const lines = [];
    for (const color of GEM_COLORS) {
      const need = card.cost[color] || 0;
      if (need === 0) continue;
      const payFromBonus = Math.min(cardBonus[color], need);
      const gemNeed = need - payFromBonus;
      const payFromGems = Math.min(p.gems[color] || 0, gemNeed);
      gemsUsed[color] = payFromGems;
      const goldNeed = gemNeed - payFromGems;
      if (goldNeed > 0) goldUsed += goldNeed;

      // 拼这条颜色的说明
      const parts = [];
      if (payFromBonus > 0) parts.push(`${payFromBonus} 卡面`);
      if (payFromGems > 0) parts.push(`${payFromGems}${GEM_NAMES_SHORT[color]}`);
      if (goldNeed > 0) parts.push(`${goldNeed}金`);
      lines.push(`${need}×${GEM_NAMES_SHORT[color]}（${parts.join('+')}）`);
    }

    return {
      card,
      gemsUsed, goldUsed, lines,
      totalText: lines.join(' '),
    };
  }

  // ===== 宝石堆 =====
  _renderGemPool() {
    const pool = document.getElementById('splendor-gems');
    pool.innerHTML = '';
    for (const color of [...GEM_COLORS, 'gold']) {
      const count = this.state.gemPool[color] || 0;
      const selCount = this.ops.gems.filter(g => g === color).length;
      const div = document.createElement('div');
      const cls = ['gem-pile'];
      if (count === 0) cls.push('disabled');
      if (selCount > 0 || (color === 'gold' && this.ops.goldTaken)) cls.push('selected');
      div.className = cls.join(' ');
      div.dataset.color = color;
      div.innerHTML = `
        <div class="gem-circle ${color}">${color === 'gold' ? '★' : ''}</div>
        <div class="gem-count">${GEM_NAMES[color]} · ${count}</div>
        <div class="gem-stepper">
          <button class="gem-btn minus" ${selCount === 0 ? 'disabled' : ''}>−</button>
          <span class="gem-sel-count ${selCount > 0 ? 'has' : ''}">${selCount > 0 ? selCount : ''}</span>
          <button class="gem-btn plus" ${count === 0 || this.ops.gems.length >= 3 ? 'disabled' : ''}>+</button>        </div>
      `;
      const [minus, plus] = div.querySelectorAll('.gem-btn');
      minus.addEventListener('click', (e) => { e.stopPropagation(); this._onGemMinus(color); });
      if (color === 'gold') {
        // 黄金：走预留模式专用逻辑（不是普通宝石的加减）
        div.addEventListener('click', (e) => { e.stopPropagation(); this._onGemClick('gold'); });
      } else {
        plus.addEventListener('click', (e) => { e.stopPropagation(); this._onGemPlus(color); });
        div.addEventListener('click', () => this._onGemPlus(color));
      }
      pool.appendChild(div);
    }
  }

  _onGemPlus(color) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    this.lastError = null;
    if (this.ops.card && !this.ops.goldTaken) { this.lastError = '已选中卡片，先取消卡片'; this._renderAll(); return; }
    if (this.ops.goldTaken) { this.lastError = '已进入预留模式'; this._renderAll(); return; }
    if (this.ops.gems.length >= 3) { this.lastError = '最多选 3 颗'; this._renderAll(); return; }
    const test = [...this.ops.gems, color];
    const counts = {};
    test.forEach(g => counts[g] = (counts[g] || 0) + 1);
    const hasTwoSame = Object.values(counts).some(n => n >= 2);
    const colors = Object.keys(counts);
    // 冲突：要么 1-3 颗不同色，要么恰好 2 颗同色，不能混
    if (hasTwoSame) {
      // 有重复的 → 必须恰好 1 种颜色且 2 颗
      if (colors.length > 1 || test.length !== 2) {
        this.lastError = '2 颗同色不能混拿其他颜色（规则：要么 2 同色，要么 1-3 颗不同色）';
        this._renderAll(); return;
      }
    }
    // pool 里够不够
    if ((this.state.gemPool[color] || 0) < (counts[color] || 1)) { this.lastError = `${GEM_NAMES[color]} 不足`; this._renderAll(); return; }
    // 超 10 颗允许拿，UI 层会让玩家弃掉多余的
    this.ops.gems.push(color);
    this._renderAll();
  }

  _onGemMinus(color) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    this.lastError = null;
    // 从后往前删，视觉上取消"最后加的那颗"
    for (let i = this.ops.gems.length - 1; i >= 0; i--) {
      if (this.ops.gems[i] === color) {
        this.ops.gems.splice(i, 1);
        this._renderAll();
        return;
      }
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
          ${reqs.map(r => `<span class="req-chip req-${r.color}">${r.count} ${GEM_NAMES_SHORT[r.color]}</span>`).join(' ')}
        </div>
      `;
      row.appendChild(div);
    });
  }

  // ===== 三级卡 =====
  _renderTiers() {
    const isMyTurn = this.state.currentPlayer === this.humanIndex;
    for (const tier of [1, 2, 3]) {
      const container = document.getElementById(`splendor-tier-${tier}`);
      container.innerHTML = '';
      const cards = this.state.board[`tier${tier}`];
      cards.forEach((card, idx) => {
        const canBuy = isMyTurn && this._canBuyCard({ source: 'board', tier, cardIndex: idx });
        const isSelected = this.ops.card?.source === 'board' && this.ops.card.tier === tier && this.ops.card.cardIndex === idx;
        const div = document.createElement('div');
        div.className = `splendor-card ${canBuy ? 'buyable' : ''} ${isSelected ? 'selected' : ''}`;
        div.style.background = this._tierBg(tier);
        // cost: 颜色圆点 + 数字，只显示有数量的颜色
        const costHTML = GEM_COLORS.filter(g => card.cost[g] > 0)
          .map(g => `<span class="cost-chip"><span class="dot ${g}"></span>${card.cost[g]}</span>`).join('');
        div.innerHTML = `
          ${card.image ? `<img class="card-art" src="${card.image}" alt="">` : ''}
          <div class="card-vp">${card.vp ?? 0}</div>
          <div class="card-color-bar ${card.color}"></div>
          <div class="card-cost-inline">${costHTML}</div>
        `;
        if (isMyTurn) div.addEventListener('click', () => this._onBoardCardClick(tier, idx));
        container.appendChild(div);
      });
    }
  }

  // ===== 动作/状态条 =====
  _renderActionBar() {
    document.querySelectorAll('.action-row, .preview-row, .confirm-row, .status-row').forEach(n => n.remove());
    const bottom = document.getElementById('splendor-side-bottom');

    // 终局倒计时条：不管谁的回合都显示
    if (this.state.endTriggeredBy !== null && !this.state.gameOver) {
      const triggerName = this.state.players[this.state.endTriggeredBy].name;
      const cd = this.state._endCountdown || 0;
      const totalSteps = this.state.players.length;
      const roundsLeft = Math.ceil(cd / totalSteps);
      const endRow = document.createElement('div');
      endRow.className = 'status-row';
      endRow.style.cssText = 'padding:8px 10px;border-radius:8px;margin-top:8px;font-size:12px;background:rgba(255,213,79,0.15);border:1px solid rgba(255,213,79,0.4);color:var(--gold);text-align:center';
      endRow.textContent = `🏆 公平轮 · ${triggerName} 触发终局，所有人各再走 ${roundsLeft} 轮（剩余 ${cd}/${totalSteps} 步）后结束`;
      bottom.appendChild(endRow);
    }

    const isMyTurn = this.state.currentPlayer === this.humanIndex;
    if (!isMyTurn) return;

    // 弃宝石模式：不渲染操作按钮（弃宝石操作在 _renderMyHTML 的宝石 badge 上）
    if (this.state.pendingDiscard) return;

    const p = this.state.players[this.humanIndex];

    // 状态说明行
    const statusRow = document.createElement('div');
    statusRow.className = 'status-row';
    statusRow.style.cssText = 'padding:8px 10px;border-radius:8px;margin-top:8px;font-size:12px;';
    const { intent, ok, hint } = this._analyzeIntent();
    let statusColor = 'rgba(255,255,255,0.06)';
    let statusText = '';
    if (this.lastError) {
      statusColor = 'rgba(224,102,102,0.15)';
      statusText = `❌ ${this.lastError}`;
    } else if (intent === 'gems') {
      const counts = {};
      this.ops.gems.forEach(g => counts[g] = (counts[g] || 0) + 1);
      const pairs = Object.entries(counts).map(([c, n]) => `${GEM_NAMES[c]}×${n}`).join(', ');
      statusColor = ok ? 'rgba(112,173,71,0.12)' : 'rgba(255,180,80,0.12)';
      statusText = ok
        ? `💎 已选宝石（${pairs}）· ${hint || '点击"结束回合"确认'}`
        : `💎 已选宝石（${pairs}）· ⚠️ ${hint}`;
    } else if (intent === 'reserve') {
      statusColor = ok ? 'rgba(255,213,79,0.12)' : 'rgba(255,180,80,0.12)';
      if (this.ops.card) {
        statusText = `📋 预留 + 拿黄金 · 已选卡片`;
      } else {
        statusText = `📋 已拿黄金 · 点击场上卡或抽牌堆顶来预留（或点"取消"）`;
      }
    } else if (intent === 'buy') {
      statusColor = ok ? 'rgba(112,173,71,0.12)' : 'rgba(224,102,102,0.15)';
      if (ok) {
        const detail = this._calcBuyDetail(this.ops.card);
        if (detail) {
          const goldTag = detail.goldUsed > 0
            ? `<span style="color:var(--gold)">⛏ 消耗 ${detail.goldUsed} 黄金</span>`
            : '<span style="opacity:0.6">⛏ 无需黄金</span>';
          statusText = `💰 购买卡片 → ${detail.totalText} · ${goldTag} · 点"结束回合"确认`;
        } else {
          statusText = `💰 购买卡片 · 点击"结束回合"确认`;
        }
      } else {
        statusText = `💰 卡片宝石不足，无法购买`;
      }
    } else {
      statusColor = 'rgba(255,255,255,0.04)';
      statusText = '💡 直接点击宝石拿取、点击黄金+选卡预留、点击场上卡购买 · 点"结束回合"确认操作';
    }
    statusRow.style.background = statusColor;
    statusRow.innerHTML = statusText;
    bottom.appendChild(statusRow);

    // 按钮行
    const btnRow = document.createElement('div');
    btnRow.className = 'action-row';
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px';

    const canConfirm = ok && intent !== null;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'action-btn';
    cancelBtn.style.borderColor = '#e06666';
    cancelBtn.textContent = '✕ 取消';
    cancelBtn.addEventListener('click', () => this._clearOps());
    btnRow.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `action-btn ${canConfirm ? 'selected' : ''}`;
    confirmBtn.textContent = canConfirm ? '✓ 结束回合' : '结束回合（无操作）';
    confirmBtn.style.opacity = canConfirm ? '1' : '0.4';
    confirmBtn.style.cursor = canConfirm ? 'pointer' : 'not-allowed';
    confirmBtn.disabled = !canConfirm;
    confirmBtn.addEventListener('click', () => this._confirmAction());
    btnRow.appendChild(confirmBtn);

    bottom.appendChild(btnRow);

    // 牌堆顶快捷（预留用）
    if (this.ops.goldTaken && !this.ops.card) {
      const deckRow = document.createElement('div');
      deckRow.style.cssText = 'display:flex;gap:8px;margin-top:6px;flex-wrap:wrap';
      for (const t of [3, 2, 1]) {
        if (this.state.decks[`tier${t}`].length === 0) continue;
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.style.fontSize = '11px';
        btn.textContent = `📋 抽 ${t} 级顶卡 (剩 ${this.state.decks[`tier${t}`].length})`;
        btn.addEventListener('click', () => {
          this.ops.card = { source: 'top', tier: t };
          this.lastError = null;
          this._renderAll();
        });
        deckRow.appendChild(btn);
      }
      bottom.appendChild(deckRow);
    }
  }

  // ===== 分析当前操作意图 =====
  _analyzeIntent() {
    const totalGems = this._totalGems(this.state.players[this.humanIndex].gems);
    const pendingGems = this.ops.gems.length;
    const afterTotal = totalGems + pendingGems;

    // 买卡模式优先
    if (this.ops.card && !this.ops.goldTaken) {
      const err = validateAction(this.state, this.humanIndex, { type: 'BUY', ...this.ops.card });
      return { intent: 'buy', ok: err === null, hint: err };
    }
    // 预留模式
    if (this.ops.goldTaken) {
      if (!this.ops.card) return { intent: 'reserve', ok: false, hint: '选一张卡来预留' };
      const err = validateAction(this.state, this.humanIndex, { type: 'RESERVE', ...this.ops.card });
      return { intent: 'reserve', ok: err === null, hint: err };
    }
    // 拿宝石模式
    if (pendingGems > 0) {
      // 检查是不是 2 颗同色
      const counts = {};
      this.ops.gems.forEach(g => counts[g] = (counts[g] || 0) + 1);
      const hasTwoSame = Object.values(counts).some(n => n >= 2);
      const colors = Object.keys(counts);

      if (pendingGems > 3) {
        return { intent: 'gems', ok: false, hint: '最多拿 3 颗宝石' };
      }
      if (hasTwoSame) {
        if (pendingGems !== 2 || colors.length !== 1) {
          return { intent: 'gems', ok: false, hint: '拿 2 颗同色时不能混拿其他颜色' };
        }
        const color = colors[0];
        if ((this.state.gemPool[color] || 0) < 4) {
          return { intent: 'gems', ok: false, hint: '该颜色剩余不足 4 颗' };
        }
      } else {
        // 不同色 1~3 颗都可以，3 颗必须全不同
        if (pendingGems === 3 && colors.length < 3) {
          return { intent: 'gems', ok: false, hint: '3 颗必须不同颜色' };
        }
      }
      // 不检查超 10，允许拿完后弃掉多余的
      // 检查每颗宝石 pool 里够不够
      for (const [c, n] of Object.entries(counts)) {
        if ((this.state.gemPool[c] || 0) < n) {
          return { intent: 'gems', ok: false, hint: `${GEM_NAMES[c]} 不足` };
        }
      }
      return { intent: 'gems', ok: true, hint: hasTwoSame ? '2 颗同色' : `${pendingGems} 颗不同色` };
    }
    return { intent: null, ok: false, hint: '' };
  }

  // ===== 点击黄金（进入预留模式）普通宝石走 _onGemPlus =====
  _onGemClick(color) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    if (color !== 'gold') return;
    this.lastError = null;

    if (this.ops.gems.length > 0) {
      this.lastError = '已选普通宝石，黄金不能与普通宝石同回合';
      this._renderAll();
      return;
    }
    if (this.ops.goldTaken) {
      // 取消黄金
      this.ops.goldTaken = false;
      if (this.ops.card?.source === 'top' || this.ops.card?.source === 'board') {
        this.ops.card = null;
      }
      this._renderAll();
      return;
    }
    const p = this.state.players[this.humanIndex];
    if (p.reserved.length >= 3) { this.lastError = '预留槽已满'; this._renderAll(); return; }
    if (this.state.gemPool.gold < 1) { this.lastError = '黄金不足（需要池里至少 1 颗才能预留）'; this._renderAll(); return; }
    this.ops.goldTaken = true;
    this._renderAll();
  }

  // ===== 点击场上卡 =====
  _onBoardCardClick(tier, idx) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    this.lastError = null;

    if (this.ops.gems.length > 0 && !this.ops.goldTaken) {
      this.lastError = '已选宝石，不能同时买卡（点"取消"重新开始）';
      this._renderAll();
      return;
    }

    const cardRef = { source: 'board', tier, cardIndex: idx };

    if (this.ops.goldTaken) {
      // 预留模式
      if (this.ops.card?.source === 'board' && this.ops.card.tier === tier && this.ops.card.cardIndex === idx) {
        this.ops.card = null;  // 取消选中
      } else {
        this.ops.card = cardRef;
      }
    } else {
      // 买卡模式
      if (this.ops.card?.source === 'board' && this.ops.card.tier === tier && this.ops.card.cardIndex === idx) {
        this.ops.card = null;
      } else {
        // 先检查能不能买
        if (this._canBuyCard(cardRef)) {
          this.ops.card = cardRef;
        } else {
        // 尝试自动切预留（但前提是黄金够）
        const reserveErr = validateAction(this.state, this.humanIndex, { type: 'RESERVE', ...cardRef });
        if (reserveErr === null) {
          this.ops.card = cardRef;
          this.ops.goldTaken = true;  // ← 关键：自动切预留时也要设！
          this.lastError = '宝石不足无法购买，已自动切换为预留模式（已拿 1 颗黄金）';
        } else {
          this.lastError = '宝石不足无法购买（预留也不行：' + reserveErr + '）';
        }
      }
      }
    }
    this._renderAll();
  }

  // ===== 点击预留区卡 =====
  _onCardClick(cardRef) {
    if (this.state.currentPlayer !== this.humanIndex) return;
    this.lastError = null;
    if (this.ops.goldTaken) {
      // 预留模式下，预留区的卡是自己之前留的，不能再点
      this.lastError = '这张卡已经是你的了';
      this._renderAll();
      return;
    }
    if (this.ops.card?.cardId === cardRef.cardId) {
      this.ops.card = null;
    } else {
      if (this._canBuyCard(cardRef)) {
        this.ops.card = cardRef;
      } else {
        this.lastError = '宝石不足，无法购买';
      }
    }
    this._renderAll();
  }

  // ===== 清空操作 =====
  _clearOps(opts = {}) {
    this.ops = { gems: [], card: null, goldTaken: false };
    this.lastError = null;
    if (!opts.keepDiscard) this._discardNeeded = 0;
    this._renderAll();
  }

  // ===== 确认执行 =====
  _confirmAction() {
    const { intent, ok } = this._analyzeIntent();
    if (!ok || !intent) return;

    let action;
    if (intent === 'gems') {
      const counts = {};
      this.ops.gems.forEach(g => counts[g] = (counts[g] || 0) + 1);
      if (Object.keys(counts).length === 1 && Object.values(counts)[0] === 2) {
        action = { type: 'TAKE_SAME', color: Object.keys(counts)[0] };
      } else {
        action = { type: 'TAKE_DIFF', colors: Object.keys(counts) };
      }
    } else if (intent === 'buy') {
      action = { type: 'BUY', ...this.ops.card };
    } else if (intent === 'reserve') {
      action = { type: 'RESERVE', ...this.ops.card };
    }

    if (!action) return;
    const err = validateAction(this.state, this.humanIndex, action);
    if (err) {
      this.lastError = '规则不合法：' + err;
      this._renderAll();
      return;
    }

    this._logAction(this.humanIndex, action);
    this.state = applyAction(this.state, this.humanIndex, action);

    // 人类玩家拿贵族 → toast 提示
    const nobleToast = this.state._lastNoblesGained;
    if (nobleToast && nobleToast.playerIndex === this.humanIndex && nobleToast.nobles.length > 0) {
      const first = nobleToast.nobles[0];
      const req = first.req || first;
      const reqs = GEM_COLORS.filter(c => req[c]).map(c => `${req[c]}${GEM_NAMES_SHORT[c]}`).join('+');
      this.lastError = `👑 获得贵族！满足条件 ${reqs}，+3 分`;
    }
    // 清掉一次性标记，避免下回合重复提示
    delete this.state._lastNoblesGained;

    // 人类玩家触发终局（达到 15 分）→ toast 提示
    if (this.state._justTriggeredEnd) {
      const p = this.state.players[this.humanIndex];
      const cd = this.state._endCountdown || 0;
      this.lastError = `🏆 你达到 ${p.score} 分！公平轮：所有人各再走 ${Math.ceil(cd / this.state.players.length)} 轮后结束`;
      delete this.state._justTriggeredEnd;
    } else if (this.state.gameOver) {
      // 非触发者走完了，游戏结束
      this.lastError = null;
    }

    // 检查是否需要弃宝石（引擎拿宝石后超 10 会设置 pendingDiscard，不推进回合）
    if (this.state.pendingDiscard) {
      this._discardNeeded = this.state.pendingDiscard.count;
      this._clearOps({ keepDiscard: true });
      this._renderAll();
      return; // 不结束回合，等弃完再推进
    }

    this._clearOps();
    this._checkGameOver();
    this._maybeAIMove();
  }

  // ===== 弃宝石（调用引擎 discardGems，弃完引擎自动推进回合）=====
  _onDiscardGem(color) {
    if (!this.state.pendingDiscard) return;
    try {
      this.state = discardGems(this.state, this.humanIndex, color);
    } catch (e) {
      this.lastError = e.message;
      this._renderAll();
      return;
    }
    this._discardNeeded = this.state.pendingDiscard ? this.state.pendingDiscard.count : 0;
    if (!this.state.pendingDiscard) {
      // 弃完了，回合已由引擎推进
      this._renderAll();
      this._checkGameOver();
      this._maybeAIMove();
    } else {
      this._renderAll();
    }
  }

  // ===== AI 自动走 =====
  _maybeAIMove() {
    if (this.state.gameOver) return;
    const p = this.state.players[this.state.currentPlayer];
    if (!p.isAI) return;

    // AI 处于弃宝石状态 → 自动弃（优先弃最多的普通宝石，保留黄金）
    if (this.state.pendingDiscard) {
      this.aiTimer = setTimeout(() => {
        const ai = this.state.players[this.state.currentPlayer];
        let bestColor = null, bestCount = 0;
        for (const c of GEM_COLORS) {
          if ((ai.gems[c] || 0) > bestCount) { bestCount = ai.gems[c]; bestColor = c; }
        }
        if (bestColor) {
          try {
            this.state = discardGems(this.state, this.state.currentPlayer, bestColor);
            this._renderAll();
            this._maybeAIMove();
          } catch (e) { console.error('[AI] 弃宝石报错:', e); }
        }
      }, 400);
      return;
    }

    this.aiTimer = setTimeout(() => {
      let actions = listValidActions(this.state, this.state.currentPlayer);
      // 保底：无合法动作时，先弃宝石腾出空间再试
      if (actions.length === 0) {
        const ai = this.state.players[this.state.currentPlayer];
        if (this._totalGems(ai.gems) > 10) {
          let bestColor = null, bestCount = 0;
          for (const c of GEM_COLORS) {
            if ((ai.gems[c] || 0) > bestCount) { bestCount = ai.gems[c]; bestColor = c; }
          }
          if (bestColor) {
            ai.gems[bestColor]--;
            this.state.gemPool[bestColor]++;
            actions = listValidActions(this.state, this.state.currentPlayer);
          }
        }
      }

      // 还是没有合法动作 → PASS 跳过回合
      if (actions.length === 0) {
        try {
          this._logAction(this.state.currentPlayer, { type: 'PASS' });
          this.state = applyAction(this.state, this.state.currentPlayer, { type: 'PASS' });
          this._renderAll();
          this._checkGameOver();
          this._maybeAIMove();
        } catch (e) { console.error('[AI] PASS 报错:', e); }
        return;
      }

      const action = pickAction(this.state, this.state.currentPlayer);
      if (!action) return;
      try {
        this._logAction(this.state.currentPlayer, action);
        this.state = applyAction(this.state, this.state.currentPlayer, action);
        this._renderAll();
        this._checkGameOver();
        this._maybeAIMove();
      } catch (e) { console.error('[AI] 报错:', e); }
    }, 400);
  }

  // ===== 终局 =====
  _checkGameOver() {
    if (this.state.gameOver) { this._renderEnd(); this.onGameOver(this.state); }
  }

  // ===== 行动记录 =====
  _logAction(playerIndex, action) {
    const p = this.state.players[playerIndex];
    const turn = this.state.turn;
    let desc = '';
    switch (action.type) {
      case 'TAKE_DIFF': {
        const counts = {};
        action.colors.forEach(c => counts[c] = (counts[c] || 0) + 1);
        const parts = Object.entries(counts).map(([c, n]) => `${n}颗${GEM_NAMES[c]}`);
        desc = `拿了 ${parts.join('、')}`;
        break;
      }
      case 'TAKE_SAME':
        desc = `拿了 2 颗${GEM_NAMES[action.color]}宝石`;
        break;
      case 'RESERVE':
        desc = action.source === 'top' ? `预留了牌库顶一张卡` : `预留了场上一张卡`;
        break;
      case 'BUY': {
        let vp = 0;
        if (action.source === 'reserved') {
          const card = p.reserved.find(c => c.id === action.cardId);
          vp = card ? (card.vp || 0) : 0;
        } else if (action.source === 'board') {
          const card = this.state.board[`tier${action.tier}`][action.cardIndex];
          vp = card ? (card.vp || 0) : 0;
        }
        desc = vp > 0 ? `买了一张 ${vp}VP 的卡` : `买了一张卡`;
        break;
      }
      case 'PASS':
        desc = `跳过回合`;
        break;
      default:
        desc = action.type;
    }
    this.actionLog.push({ turn, who: p.name, isMe: playerIndex === this.humanIndex, desc });
    // 最多保留 100 条
    if (this.actionLog.length > 100) this.actionLog.shift();
  }

  _renderLog() {
    const el = document.getElementById('splendor-log');
    if (!el) return;
    if (this.actionLog.length === 0) {
      el.innerHTML = '<h4>📜 行动记录</h4><div class="log-empty">暂无记录</div>';
      return;
    }
    const items = this.actionLog.map(l =>
      `<div class="log-item${l.isMe ? ' is-me' : ''}">` +
      `<span class="log-turn">第${l.turn}回合</span> ` +
      `<span class="log-who">${l.who}</span> ${l.desc}` +
      `</div>`
    ).join('');
    el.innerHTML = `<h4>📜 行动记录</h4>${items}`;
    // 自动滚动到底部
    el.scrollTop = el.scrollHeight;
  }

  _renderEnd() {
    document.getElementById('splendor-game').classList.add('hidden');
    const endEl = document.getElementById('splendor-end');
    endEl.classList.remove('hidden');
    const scores = document.getElementById('splendor-scores');
    scores.innerHTML = '';
    const sorted = [...this.state.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.ownedCards.length !== b.ownedCards.length) return a.ownedCards.length - b.ownedCards.length;
      return a.reserved.length - b.reserved.length;
    });
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
