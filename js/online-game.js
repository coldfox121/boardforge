// 通用联机基类：所有联机游戏共用同一套同步逻辑
// （进度合并推送、版本冲突回退、房主代跑 AI、成员在线状态）
//
// 游戏侧只需实现：
//   state                        当前对局数据
//   render()                     重绘
//   aiAction(state, seat)        返回该座位 AI 要执行的动作（无则 null）
//   applyAIAction(seat, action)  执行 AI 动作（内部 applyAction，不负责渲染/推送）
//   canRunAI()                   页面隐藏时返回 false（可选）
//   setMemberOnline(map)         座位 → 是否在线（可选）
//   onSyncConflict()             推送冲突时提示（可选）
//   onAIFailed(err)              AI 动作异常提示（可选）
// 本地玩家操作后调用 this.afterChange()，即可自动安排 AI 并推送。
// 单机游戏不使用本基类，行为完全不变。

export class OnlineGameBase {
  constructor(options = {}) {
    this.session = null;
    if (options && options.online) this.session = new OnlineSession(this, options.online);
  }

  // 房间轮询拉到新状态 / 成员变化时由外层调用
  syncState(state, version) { if (this.session) this.session.syncState(state, version); }
  syncMembers(members) { if (this.session) this.session.syncMembers(members); }
  pushLocal() { if (this.session) this.session.queuePush(); }
}

export class OnlineSession {
  constructor(game, opts) {
    this.game = game;
    this.isHost = !!opts.isHost;
    this.version = opts.version || 0;
    this.push = opts.push;          // (state, baseVersion) => Promise<newVersion>
    this.memberOnline = null;
    this._pushing = false;
    this._pending = null;
    this._aiTimer = null;
  }

  // 本地状态变化：跑 AI（仅房主/单机）+ 推送
  localChanged() {
    this.scheduleAI();
    this.queuePush();
  }

  // 串联推送：同一时间只有一个请求，期间的多次变更合并为最后一次
  queuePush() {
    this._pending = this.game.state;
    if (this._pushing) return;
    this._flushPush();
  }

  async _flushPush() {
    this._pushing = true;
    while (this._pending) {
      const st = this._pending;
      this._pending = null;
      try {
        const v = await this.push(st, this.version);
        if (typeof v === 'number') this.version = v;
      } catch (e) {
        if (this.game.onSyncConflict) this.game.onSyncConflict();
        break;
      }
    }
    this._pushing = false;
  }

  // 轮询拉到更新的云端状态
  syncState(state, version) {
    if (!state || typeof version !== 'number') return;
    if (this._pushing) return;      // 本地还有未落库的动作，先不覆盖
    if (version <= this.version) return;
    this.version = version;
    this.game.state = state;
    if (this.game.onRemoteState) this.game.onRemoteState();
    this.game.render();
  }

  // 成员在线状态（掉线标记）
  syncMembers(members) {
    const map = {};
    (members || []).forEach(m => { map[m.seat] = !!m.online; });
    if (JSON.stringify(map) === JSON.stringify(this.memberOnline || {})) return;
    this.memberOnline = map;
    if (this.game.setMemberOnline) this.game.setMemberOnline(map);
    this.game.render();
  }

  // 只有房主端代跑 AI 座位；人类座位永远等本人操作
  scheduleAI() {
    clearTimeout(this._aiTimer);
    if (!this.isHost) return;
    const g = this.game;
    const s = g.state;
    if (!s || s.phase === 'ended') return;
    if (s.currentPlayer === g.humanIndex) return;
    if (!(s.players[s.currentPlayer] && s.players[s.currentPlayer].isAI)) return;
    this._aiTimer = setTimeout(() => {
      if (g.canRunAI && !g.canRunAI()) return;
      const st = g.state;
      if (!st || st.phase === 'ended') return;
      const seat = st.currentPlayer;
      if (seat === g.humanIndex || !(st.players[seat] && st.players[seat].isAI)) return;
      const action = g.aiAction(st, seat);
      if (!action) { if (g.onAIFailed) g.onAIFailed(new Error('AI 没有可执行的动作')); return; }
      try {
        g.applyAIAction(seat, action);
      } catch (e) {
        if (g.onAIFailed) g.onAIFailed(e);
        return;
      }
      g.render();
      this.queuePush();
      this.scheduleAI();
    }, 420);
  }
}
