// BoardForge · 前端入口
// 游戏 / 后台模块按需动态加载，避免登录页串行下载约 75KB 游戏代码

// === 全局状态 ===
const state = {
  token: localStorage.getItem('bf_token'),
  username: localStorage.getItem('bf_username'),
  isAdmin: localStorage.getItem('bf_is_admin') === 'true',
  apiBase: '',
  cloudOk: false,
  currentRoomCode: null,
  currentGame: null,
  splendorGame: null  // 当前游戏实例
};

// === 路由：#/path 解析 ===
function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = {};
  if (queryPart) queryPart.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { segments, query };
}

function navigate(path, query = null) {
  let url = path.startsWith('#') ? path : '#' + path;
  if (query && Object.keys(query).length) {
    url += '?' + Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  }
  if (location.hash === url) {
    // hash 相同浏览器不会派发 hashchange，手动触发
    handleRoute();
  } else {
    location.hash = url;
  }
}

// === 路由处理 ===
function handleRoute() {
  const { segments, query } = parseHash();
  const first = segments[0] || '';

  // 受限模式标记（提前解析，后面用到）
  let guestGame = null;
  if (first === 'g') guestGame = segments[1];
  state.guestGame = guestGame;

  // 未登录 → 保存目标路径，跳登录
  if (!state.token && first !== '' && first !== 'login') {
    state.pendingPath = '#' + (location.hash || '/');
    navigate('/login');
    return;
  }

  // 已登录 → 空路径受限模式保持，否则跳大厅
  if (state.token && first === '') {
    if (guestGame) navigate('/g/' + guestGame);
    else navigate('/lobby');
    return;
  }

  // 路由表
  if (first === 'login') {
    showView('auth');
  } else if (first === 'lobby') {
    enterLobby();
  } else if (first === 'admin') {
    // 只允许 admin 访问
    if (!state.isAdmin) { navigate('/lobby'); return; }
    showView('admin');
    import('./admin-ui.js?v=18').then(m => m.renderAdminPage());
  } else if (first === 'g' && segments[1]) {
    // #/g/splendor → 受限模式入口；#/g/splendor/room/ABCD → 受限模式展示房间
    if (segments[2] === 'room' && segments[3]) {
      showRoomByCode(segments[3], segments[1]);
    } else {
      enterRestrictedGame(segments[1]);
    }
  } else if (first === 'room' && segments[1]) {
    // #/room/ABCD → 分享链接直达房间
    showRoomByCode(segments[1]);
  } else {
    if (state.token) navigate('/lobby');
    else navigate('/login');
  }
}

// === fetch 封装 ===
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  try {
    const res = await fetch(state.apiBase + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  } catch (e) {
    throw e;
  }
}

async function checkBackend() {
  try {
    await fetch('/api/health', { method: 'GET', cache: 'no-store' });
    state.cloudOk = true;
  } catch {
    state.cloudOk = false;
  }
}

// === 视图切换 ===
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

function setAuth(token, username, isAdmin = false) {
  state.token = token;
  state.username = username;
  state.isAdmin = !!isAdmin;
  localStorage.setItem('bf_token', token);
  localStorage.setItem('bf_username', username);
  localStorage.setItem('bf_is_admin', isAdmin ? 'true' : 'false');
}

function clearAuth() {
  state.token = null;
  state.username = null;
  state.isAdmin = false;
  localStorage.removeItem('bf_token');
  localStorage.removeItem('bf_username');
  localStorage.removeItem('bf_is_admin');
}

// === 前端 PBKDF2：把计算压力从 Workers 移到浏览器，后端只做 sha256 比较 ===
const _enc = new TextEncoder();
async function clientHashPassword(password, username) {
  const key = await crypto.subtle.importKey('raw', _enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = _enc.encode('boardforge::' + username.toLowerCase());
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// === 认证事件 ===
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.className = 'msg'; msg.textContent = '';
  try {
    const clientHash = await clientHashPassword(password, username);
    // 同时传 client_hash（v2 新格式）和 password（旧格式兼容迁移）
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, client_hash: clientHash, password }) });
    setAuth(data.token, data.username, data.is_admin);
    const target = state.pendingPath || '/lobby';
    state.pendingPath = null;
    navigate(target.startsWith('#') ? target : target);
  } catch (err) {
    msg.className = 'msg error'; msg.textContent = err.message;
  }
});

document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.className = 'msg'; msg.textContent = '';
  try {
    if (password.length < 6 || password.length > 64) {
      throw new Error('密码需为 6-64 位');
    }
    const clientHash = await clientHashPassword(password, username);
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ username, client_hash: clientHash }) });
    setAuth(data.token, data.username, data.is_admin);
    const target = state.pendingPath || '/lobby';
    state.pendingPath = null;
    navigate(target.startsWith('#') ? target : target);
  } catch (err) {
    msg.className = 'msg error'; msg.textContent = err.message;
  }
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById('form-' + tab).classList.add('active');
    document.getElementById('auth-msg').className = 'msg';
    document.getElementById('auth-msg').textContent = '';
  });
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  clearAuth();
  navigate('/login');
});

document.getElementById('btn-room-back').addEventListener('click', () => {
  // 受限模式返回受限入口，完整模式返回大厅
  if (state.guestGame) navigate('/g/' + state.guestGame);
  else navigate('/lobby');
});

// 规则按钮（只在房间页显示）
document.addEventListener('click', e => {
  if (e.target.id === 'btn-rules') {
    const gameId = state.guestGame || 'splendor'; // 完整模式默认璀璨宝石
    openRulesModal(gameId);
  }
});

// === 规则 Modal ===
const GAME_RULES = {
  splendor: {
    name: '璀璨宝石 · 基础规则',
    sections: [
      {
        title: '🎯 游戏目标',
        body: '第一个先达到 15 分的玩家触发终局，其他人走最后一轮后比较总分，最高分获胜。'
      },
      {
        title: '🎴 资源卡（90 张）',
        body: '分三个等级。一级最便宜，三级最贵。每级场上永远翻出 4 张。买了卡之后卡面宝石永久归你，无需再用宝石支付。'
      },
      {
        title: '💎 每回合四选一',
        body: '① 拿 3 颗不同颜色的宝石<br>② 拿 2 颗同色（该色剩余 ≥4）<br>③ 预留一张场上或牌堆顶的卡 + 拿 1 颗黄金（占手牌）<br>④ 支付宝石买一张资源卡'
      },
      {
        title: '🔒 宝石上限',
        body: '每回合结束你的宝石必须 ≤10 颗，超出需主动归还。'
      },
      {
        title: '👑 贵族图板',
        body: '场上翻出 N 张（2 人 3 张 / 3 人 4 张 / 4 人 5 张），满足条件自动获得 +3 分。黄金可以当任意颜色宝石使用。'
      },
      {
        title: '⚙️ 开局设置',
        body: '2 人：每色宝石 4 颗 / 贵族 3 张<br>3 人：每色宝石 5 颗 / 贵族 4 张<br>4 人：每色宝石 7 颗 / 贵族 5 张<br>黄金永远 5 颗不变。每级永远翻 4 张。'
      },
      {
        title: '💰 黄金规则',
        body: '黄金是万能宝石，每手牌最多持有 3 颗。买卡时每颗黄金可抵任意颜色 1 颗。'
      },
      {
        title: '💳 买卡 · 宝石支付规则',
        body: '买一张卡时，它的卡面宝石（产出那种颜色）自动免费抵对应成本。剩余缺口用你手牌里的宝石支付，黄金可抵任意颜色。<br><br><b>支付完的宝石（包括黄金）全部归还公共资源池</b>，其他玩家可以继续从池里拿。这是官方规则。'
      }
    ]
  }
};

function openRulesModal(gameId) {
  const rules = GAME_RULES[gameId] || GAME_RULES.splendor;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card rules-card">
      <button class="modal-close">✕</button>
      <h2>${rules.name}</h2>
      <div class="rules-body">
        ${rules.sections.map(s => `
          <div class="rule-section">
            <h4>${s.title}</h4>
            <p>${s.body}</p>
          </div>
        `).join('')}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// === 受限模式：朋友只看到单个游戏 ===
const GAME_NAMES = { splendor: '璀璨宝石' };
function enterRestrictedGame(gameId) {
  state.guestGame = gameId;
  const gameName = GAME_NAMES[gameId] || gameId;

  // 用大厅容器但只显示受限内容
  showView('lobby');
  document.getElementById('username').textContent = state.username;

  // 隐藏完整模式元素
  document.querySelector('.logo-sm').textContent = gameName;
  // 受限模式：不显示"退出"按钮的导航感（但保留登出能力在菜单里）

  const main = document.querySelector('.lobby-main');
  main.innerHTML = `
    <div class="restricted-game">
      <div class="rg-header">
        <h2>${gameName}</h2>
        <p class="hint">通过专属链接进入 · 仅可游玩此游戏</p>
      </div>
      <div class="rg-actions">
        <button class="btn-primary rg-btn" data-action="create">创建房间</button>
        <button class="btn-ghost rg-btn" data-action="join">加入房间</button>
      </div>
      <p class="rg-logout"><a id="rg-logout-link">退出登录</a></p>
    </div>`;

  main.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.cloudOk) { alert('后端暂不可用'); return; }
      const action = btn.dataset.action;
      closeRoomModal();
      openRestrictedModal(gameId, action);
    });
  });
  document.getElementById('rg-logout-link').addEventListener('click', async e => {
    e.preventDefault();
    try { await api('/api/logout', { method: 'POST' }); } catch {}
    clearAuth();
    navigate('/login');
  });
}

// 受限模式 Modal（简化版，不带游戏切换）
function openRestrictedModal(gameId, defaultTab) {
  const gameName = GAME_NAMES[gameId] || gameId;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
      <button class="modal-close">✕</button>
      <h2>${gameName}</h2>
      <div class="modal-tabs">
        <button class="modal-tab ${defaultTab==='create'?'active':''}" data-tab="create">创建房间</button>
        <button class="modal-tab ${defaultTab==='join'?'active':''}" data-tab="join">加入房间</button>
      </div>
      <div class="modal-panel" data-panel="create" style="display:${defaultTab==='create'?'':'none'}">
        <label>房间名称</label>
        <input id="rm-name" placeholder="${state.username}的房间" maxlength="30">
        <button class="btn-primary" id="rm-create">创建并进入</button>
        <p id="rm-create-msg" class="msg"></p>
      </div>
      <div class="modal-panel" data-panel="join" style="display:${defaultTab==='join'?'':'none'}">
        <label>房间号</label>
        <input id="rm-code" placeholder="6 位房间号" maxlength="6" style="text-transform:uppercase">
        <button class="btn-primary" id="rm-join">查询房间</button>
        <div id="rm-join-info"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  showRestrictedTab(modal, defaultTab);

  modal.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => showRestrictedTab(modal, tab.dataset.tab));
  });
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // 创建
  modal.querySelector('#rm-create').addEventListener('click', async () => {
    const name = document.getElementById('rm-name').value.trim();
    const msgEl = document.getElementById('rm-create-msg');
    msgEl.className = 'msg'; msgEl.textContent = '';
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name, game: gameId }) });
      modal.remove();
      // 受限模式：房间链接也带游戏路径
      navigate('/g/' + gameId + '/room/' + data.room_code);
    } catch (err) {
      msgEl.className = 'msg error'; msgEl.textContent = err.message;
    }
  });

  // 加入
  modal.querySelector('#rm-join').addEventListener('click', async () => {
    const code = document.getElementById('rm-code').value.trim().toUpperCase();
    const infoEl = document.getElementById('rm-join-info');
    infoEl.innerHTML = '';
    if (!code || code.length !== 6) { infoEl.innerHTML = '<p class="msg error">请输入 6 位房间号</p>'; return; }
    try {
      const data = await api('/api/rooms?code=' + code);
      infoEl.innerHTML = `
        <div class="join-info">
          <p><strong>${data.name}</strong> · ${data.game_name}</p>
          <p>状态：${data.status === 'waiting' ? '等待中' : '进行中'} · ${data.current_players}/${data.max_players} 人</p>
          <button class="btn-primary" id="rm-confirm-join" style="margin-top:10px;width:100%">加入房间</button>
        </div>`;
      document.getElementById('rm-confirm-join').addEventListener('click', () => {
        modal.remove();
        navigate('/g/' + gameId + '/room/' + code);
      });
    } catch (err) {
      infoEl.innerHTML = `<p class="msg error">${err.message}</p>`;
    }
  });
}

function showRestrictedTab(modal, tab) {
  modal.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  modal.querySelectorAll('.modal-panel').forEach(p => p.style.display = p.dataset.panel === tab ? '' : 'none');
}

// === 游戏卡片点击 ===
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.classList.contains('coming-soon')) return;
    const game = card.dataset.game;
    if (!state.cloudOk) {
      alert('后端暂不可用，需要 Cloudflare Pages 后端。');
      return;
    }
    // 弹出 Modal 只是 UI 层选择，URL 保持大厅不变；真正创建/加入房间才改 URL
    closeRoomModal();
    openRoomModal(game);
  });
});

// === 大厅 ===
function enterLobby() {
  document.getElementById('username').textContent = state.username;
  showView('lobby');
  closeRoomModal();
  import('./admin-ui.js?v=18').then(m => m.mountAdminButton());
}

// === 房间 Modal（创建 / 加入） ===
function openRoomModal(gameId, presetCode) {
  closeRoomModal();
  const gameNames = { splendor: '璀璨宝石' };
  const gameName = gameNames[gameId] || gameId || '游戏';

  const modal = document.createElement('div');
  modal.id = 'room-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-card">
      <button class="modal-close">✕</button>
      <h2>${gameId ? gameName : '加入'}房间</h2>
      <div class="modal-tabs">
        <button class="modal-tab ${gameId ? 'active' : ''}" data-tab="create">创建房间</button>
        <button class="modal-tab ${!gameId ? 'active' : ''}" data-tab="join">加入房间</button>
      </div>
      <div class="modal-panel" data-panel="create" style="display:${gameId ? '' : 'none'}">
        <label>房间名称</label>
        <input id="rm-name" placeholder="${state.username}的房间" maxlength="30">
        <button class="btn-primary" id="rm-create">创建并进入</button>
        <p id="rm-create-msg" class="msg"></p>
      </div>
      <div class="modal-panel" data-panel="join" style="display:${!gameId ? '' : 'none'}">
        <label>房间号</label>
        <input id="rm-code" placeholder="6 位房间号" maxlength="6" value="${presetCode || ''}" style="text-transform:uppercase">
        <button class="btn-primary" id="rm-join">查询房间</button>
        <div id="rm-join-info"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  showModal(gameId ? 'create' : 'join');

  // Tab 切换
  modal.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => showModal(tab.dataset.tab));
  });

  modal.querySelector('.modal-close').addEventListener('click', closeRoomModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeRoomModal(); });

  // 创建
  modal.querySelector('#rm-create').addEventListener('click', async () => {
    const name = document.getElementById('rm-name').value.trim();
    const msgEl = document.getElementById('rm-create-msg');
    msgEl.className = 'msg'; msgEl.textContent = '';
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name, game: gameId }) });
      state.currentRoomCode = data.room_code;
      state.currentGame = gameId;
      closeRoomModal();
      enterGameLobby(data);
    } catch (err) {
      msgEl.className = 'msg error'; msgEl.textContent = err.message;
    }
  });

  // 加入
  modal.querySelector('#rm-join').addEventListener('click', async () => {
    const code = document.getElementById('rm-code').value.trim().toUpperCase();
    const infoEl = document.getElementById('rm-join-info');
    infoEl.innerHTML = '';
    if (!code || code.length !== 6) { infoEl.innerHTML = '<p class="msg error">请输入 6 位房间号</p>'; return; }
    try {
      const data = await api('/api/rooms?code=' + code);
      infoEl.innerHTML = `
        <div class="join-info">
          <p><strong>${data.name}</strong> · ${data.game_name}</p>
          <p>状态：${data.status === 'waiting' ? '等待中' : '进行中'} · ${data.current_players}/${data.max_players} 人</p>
          <p class="hint">⚠️ 联机房间开发中，暂不能真正进入游戏</p>
        </div>`;
    } catch (err) {
      infoEl.innerHTML = `<p class="msg error">${err.message}</p>`;
    }
  });
}

function showModal(tab) {
  const modal = document.getElementById('room-modal');
  if (!modal) return;
  modal.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  modal.querySelectorAll('.modal-panel').forEach(p => p.style.display = p.dataset.panel === tab ? '' : 'none');
}

function closeRoomModal() {
  const m = document.getElementById('room-modal');
  if (m) m.remove();
}

// 展示房间页（创建后或直接通过链接访问）
async function showRoomByCode(code, gameId) {
  const title = document.getElementById('room-title');
  showView('room');
  closeRoomModal();

  const upper = code.toUpperCase();
  let shareUrl;
  if (gameId) {
    state.guestGame = gameId;
    shareUrl = location.origin + location.pathname + '#/g/' + gameId + '/room/' + upper;
  } else {
    state.guestGame = null;
    shareUrl = location.origin + location.pathname + '#/room/' + upper;
  }
  const gameName = gameId ? (GAME_NAMES[gameId] || gameId) : '璀璨宝石';

  title.textContent = `${gameName} · ${upper}`;

  // 显示准备界面，隐藏游戏和结束
  document.getElementById('room-waiting').classList.remove('hidden');
  document.getElementById('splendor-game').classList.add('hidden');
  document.getElementById('splendor-end').classList.add('hidden');

  // 玩家列表（目前本地，联机后从服务器同步）
  const playersEl = document.getElementById('room-players-list');
  playersEl.innerHTML = '';
  const myName = state.username || '你';
  const myChip = document.createElement('div');
  myChip.className = 'room-player-chip me';
  myChip.textContent = `👤 ${myName}`;
  playersEl.appendChild(myChip);

  // AI 复选框联动 AI 数量选择器
  const aiToggle = document.getElementById('toggle-ai');
  const aiCount = document.getElementById('ai-count');
  aiToggle.addEventListener('change', () => {
    aiCount.disabled = !aiToggle.checked;
    document.getElementById('room-online-count').textContent =
      1 + (aiToggle.checked ? Number(aiCount.value) : 0);
  });
  aiCount.addEventListener('change', () => {
    if (aiToggle.checked) {
      document.getElementById('room-online-count').textContent = 1 + Number(aiCount.value);
    }
  });

  document.getElementById('room-online-count').textContent = 1;
  aiCount.disabled = !aiToggle.checked;

  // 分享框
  const shareBox = document.getElementById('room-share-box');
  shareBox.innerHTML = `
    <div class="share-box">
      <input id="share-input" readonly value="${shareUrl}">
      <button id="share-copy" class="btn-primary">复制</button>
    </div>
    <p style="font-size:11px;color:var(--text-dim);margin-top:8px">朋友打开此链接 → 登录后自动回到房间</p>
  `;
  document.getElementById('share-copy').addEventListener('click', () => {
    const input = document.getElementById('share-input');
    input.select();
    navigator.clipboard?.writeText(input.value).then(() => {
      const btn = document.getElementById('share-copy');
      btn.textContent = '已复制 ✓';
      setTimeout(() => btn.textContent = '复制', 1500);
    });
  });

  // 开始游戏
  document.getElementById('btn-start-game').onclick = async () => {
    let aiCountVal = 0;
    if (aiToggle.checked) aiCountVal = Number(aiCount.value);

    const names = [myName];
    for (let i = 1; i <= aiCountVal; i++) names.push(`AI-${i}`);

    // 保底：至少 2 人（璀璨宝石最低 2 人）
    while (names.length < 2) names.push(`AI-${names.length}`);

    // 进入游戏时才加载游戏模块
    const { SplendorGame } = await import('./splendor-ui.js?v=18');
    state.splendorGame = new SplendorGame(null, {
      playerNames: names,
      humanIndex: 0
    });

    // 切换 UI
    document.getElementById('room-waiting').classList.add('hidden');
    document.getElementById('splendor-game').classList.remove('hidden');
    document.getElementById('splendor-end').classList.add('hidden');

    state.splendorGame.start();
  };
}

// 进入房间占位页（创建房间后）
function enterGameLobby(room) {
  // 直接调路由，让 hashchange 触发 showRoomByCode
  navigate('/room/' + room.room_code);
}

// === 启动 ===
(() => {
  // checkBackend 不阻塞路由，后台静默检测
  checkBackend();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
})();
