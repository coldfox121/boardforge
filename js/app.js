// BoardForge · 前端入口
// 全局状态
const state = {
  token: localStorage.getItem('bf_token'),
  username: localStorage.getItem('bf_username'),
  apiBase: '', // 空 = 同域
  cloudOk: false
};

// 工具：fetch 封装
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  try {
    const res = await fetch(state.apiBase + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
    return data;
  } catch (e) {
    // 离线模式：提示后端不可用
    throw e;
  }
}

// 探测后端
async function checkBackend() {
  try {
    await fetch('/api/health', { method: 'GET', cache: 'no-store' });
    state.cloudOk = true;
  } catch {
    state.cloudOk = false;
  }
}

// ===== 视图切换 =====
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

// ===== 认证 =====
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

// 登录表单
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.className = 'msg'; msg.textContent = '';

  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAuth(data.token, data.username);
    enterLobby();
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  }
});

// 注册表单
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  const msg = document.getElementById('auth-msg');
  msg.className = 'msg'; msg.textContent = '';

  try {
    const data = await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    setAuth(data.token, data.username);
    enterLobby();
  } catch (err) {
    msg.className = 'msg error';
    msg.textContent = err.message;
  }
});

// Tab 切换
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

// 退出
document.getElementById('btn-logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  clearAuth();
  showView('auth');
});

// 返回大厅
document.getElementById('btn-room-back').addEventListener('click', () => enterLobby());

// 游戏卡片点击
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    if (card.classList.contains('coming-soon')) return;
    const game = card.dataset.game;
    if (!state.cloudOk) {
      alert('后端暂不可用（可能本地 Python 服务器无 Cloudflare Functions）。\n需用 wrangler 或部署到 Cloudflare Pages 才能联机。');
      return;
    }
    // 暂时只显示占位
    document.getElementById('room-title').textContent = '💎 璀璨宝石（开发中）';
    showView('room');
  });
});

// ===== 大厅 =====
function enterLobby() {
  document.getElementById('username').textContent = state.username;
  showView('lobby');
}

// ===== 启动 =====
(async () => {
  await checkBackend();
  if (state.token) {
    enterLobby();
  } else {
    showView('auth');
  }
})();
