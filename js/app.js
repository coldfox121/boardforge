// BoardForge · 前端入口
// === 全局状态 ===
const state = {
  token: localStorage.getItem('bf_token'),
  username: localStorage.getItem('bf_username'),
  apiBase: '',
  cloudOk: false,
  currentRoomCode: null,
  currentGame: null
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
  location.hash = url;
}

// === 路由处理 ===
function handleRoute() {
  const { segments, query } = parseHash();
  const first = segments[0] || '';

  // 未登录 → 保存目标路径，跳登录
  if (!state.token && first !== '' && first !== 'login') {
    state.pendingPath = '#' + (location.hash || '/');
    navigate('/login');
    return;
  }

  // 已登录 → 空路径跳大厅
  if (state.token && first === '') {
    navigate('/lobby');
    return;
  }

  // 路由表
  if (first === 'login') {
    showView('auth');
  } else if (first === 'lobby') {
    enterLobby();
  } else if (first === 'game' && segments[1]) {
    // #/game/splendor → 进入房间流程
    enterLobby();
    closeRoomModal();
    openRoomModal(segments[1]);
  } else if (first === 'room' && segments[1]) {
    // #/room/ABCD12 → 加入房间 / 展示房间页
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

function setAuth(token, username) {
  state.token = token;
  state.username = username;
  localStorage.setItem('bf_token', token);
  localStorage.setItem('bf_username', username);
}

function clearAuth() {
  state.token = null;
  state.username = null;
  localStorage.removeItem('bf_token');
  localStorage.removeItem('bf_username');
}

// === 认证事件 ===
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.className = 'msg'; msg.textContent = '';
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAuth(data.token, data.username);
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
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAuth(data.token, data.username);
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

document.getElementById('btn-room-back').addEventListener('click', () => navigate('/lobby'));

// === 游戏卡片点击 ===
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.classList.contains('coming-soon')) return;
    const game = card.dataset.game;
    if (!state.cloudOk) {
      alert('后端暂不可用，需要 Cloudflare Pages 后端。');
      return;
    }
    navigate('/game/' + game);
  });
});

// === 大厅 ===
function enterLobby() {
  document.getElementById('username').textContent = state.username;
  showView('lobby');
  closeRoomModal();
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
        <label>人数</label>
        <select id="rm-max">
          <option value="2">2 人</option>
          <option value="3">3 人</option>
          <option value="4" selected>4 人</option>
        </select>
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
    const maxPlayers = Number(document.getElementById('rm-max').value);
    const msgEl = document.getElementById('rm-create-msg');
    msgEl.className = 'msg'; msgEl.textContent = '';
    try {
      const data = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name, game: gameId, maxPlayers }) });
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
async function showRoomByCode(code) {
  const title = document.getElementById('room-title');
  showView('room');
  const placeholder = document.getElementById('room-placeholder');
  closeRoomModal();
  const shareUrl = location.origin + location.pathname + '#/room/' + code.toUpperCase();

  title.textContent = `房间 · ${code.toUpperCase()}`;
  placeholder.innerHTML = `
    <div class="game-room-info">
      <h2>🎲 桌游房间</h2>
      <p class="room-code">房间号：<strong>${code.toUpperCase()}</strong></p>
      <p class="hint">🔗 分享链接</p>
      <div class="share-box">
        <input id="share-input" readonly value="${shareUrl}">
        <button id="share-copy" class="btn-primary">复制</button>
      </div>
      <p class="hint">游戏引擎开发中，很快就能联机对战</p>
    </div>`;
  document.getElementById('share-copy').addEventListener('click', () => {
    const input = document.getElementById('share-input');
    input.select();
    navigator.clipboard?.writeText(input.value).then(() => {
      const btn = document.getElementById('share-copy');
      btn.textContent = '已复制 ✓';
      setTimeout(() => btn.textContent = '复制', 1500);
    });
  });

  // 异步查房间信息（如果不存在说明创建失败，等后续 Durable Object）
  try {
    const data = await api('/api/rooms?code=' + code.toUpperCase());
    title.textContent = `${data.game_name} · ${data.room_code}`;
    placeholder.querySelector('h2').textContent = data.game_name;
  } catch {}
}

// 进入房间占位页（创建房间后）
function enterGameLobby(room) {
  // 直接调路由，让 hashchange 触发 showRoomByCode
  navigate('/room/' + room.room_code);
}

// === 启动 ===
(async () => {
  await checkBackend();
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
})();
