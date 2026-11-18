// 复现：奥地利大饭店开局接客阶段 "Cannot read properties of undefined (reading 'push')"
// 模拟联机双人类客户端：各自持投影状态，applyAction 后 push 到服务器，另一方 poll 拉取
import { initGame, applyAction, validateAction } from 'file:///D:/TREA_project/boardforge/js/hotel-engine.js';

const log = (...a) => console.log(...a);
let step = 0;
const tag = m => log(`[step ${++step}] ${m}`);

// 模拟服务器
let stored = null, version = 0;
function push(newState, baseV, seat) {
  if (baseV !== version) throw new Error('版本冲突');
  // hotel merge：恢复其他人类玩家手牌
  const st = JSON.parse(JSON.stringify(newState));
  if (stored) {
    st.players.forEach((p, i) => {
      const prev = stored.players[i];
      if (prev && i !== seat && !prev.isAI && Array.isArray(prev.hand)) p.hand = JSON.parse(JSON.stringify(prev.hand));
    });
  }
  stored = st; version++;
}
function project(seat) {
  const st = JSON.parse(JSON.stringify(stored));
  st.players.forEach((p, i) => {
    if (i !== seat && !p.isAI && Array.isArray(p.hand)) p.hand = p.hand.map(() => '?');
  });
  return st;
}

// ===== 场景 A：双人联机，正常接客 =====
tag('场景 A：双人联机开局');
stored = initGame(['甲', '乙']); version = 1;

const hIdx = 0, gIdx = 1;
let hState = project(hIdx);
let gState = project(gIdx);

// 尾家先接（initGame 后 pending.seat 应为 1）
tag(`pending: type=${stored.pending?.type} seat=${stored.pending?.seat}`);

// guest 先动（它看到的投影状态）
function tryAct(state, seat, label) {
  const action = { type: 'RESOLVE', choice: { slot: 0 } };
  const err = validateAction(state, seat, action);
  if (err) { tag(`${label}: validate 拦截 → ${err}`); return state; }
  try {
    const ns = applyAction(state, seat, action);
    tag(`${label}: 动作成功，pending → ${ns.pending?.type}@${ns.pending?.seat}, phase=${ns.phase}`);
    return ns;
  } catch (e) {
    tag(`${label}: ★ 抛错 → ${e.message}`);
    return state;
  }
}

gState = tryAct(gState, gIdx, 'guest 接客');
push(gState, version, gIdx);
hState = project(hIdx);
hState = tryAct(hState, hIdx, 'host 接客');
push(hState, version, hIdx);
gState = project(gIdx);

// 备房阶段循环
let guard = 0;
while (stored.phase === 'setup' && guard++ < 40) {
  const t = stored.pending;
  if (!t) { tag('无 pending，退出'); break; }
  const seat = t.seat;
  const state = seat === hIdx ? hState : gState;
  const label = seat === hIdx ? 'host' : 'guest';
  const choice = t.type === 'prepare' ? { rooms: [bottomLeft(state.players[seat])] } : {};
  const action = { type: 'RESOLVE', choice };
  try {
    const ns = applyAction(state, seat, action);
    tag(`${label} ${t.type} 成功 → pending ${ns.pending?.type}@${ns.pending?.seat}, phase=${ns.phase}`);
    if (seat === hIdx) hState = ns; else gState = ns;
    push(ns, version, seat);
    if (seat === hIdx) hState = project(hIdx); else gState = project(gIdx);
  } catch (e) {
    tag(`${label} ${t.type}: ★ 抛错 → ${e.message}`);
    break;
  }
}

function bottomLeft(p) {
  const idxs = p.rooms.map((_r, i) => i).filter(i => !p.rooms[i].prepared);
  return idxs.sort((a, b) => (Math.floor(a / 5) - Math.floor(b / 5)) || (a - b))[0];
}

// ===== 场景 B：双人+2AI，host 代跑 AI =====
tag('场景 B：双人 + 2AI');
stored = initGame(['甲', '乙', 'AI-1', 'AI-2']); version = 1;
stored.players[2].isAI = true; stored.players[3].isAI = true;
hState = JSON.parse(JSON.stringify(stored));
guard = 0;
while (stored.phase === 'setup' && guard++ < 80) {
  const t = stored.pending;
  if (!t) break;
  const p = stored.players[t.seat];
  let action;
  if (p.isAI) action = { type: 'RESOLVE', choice: { slot: 0 } };
  else action = { type: 'RESOLVE', choice: { slot: 0 } };
  try {
    const ns = applyAction(stored, t.seat, action);
    stored = ns;
    tag(`seat${t.seat}(${p.isAI ? 'AI' : '人'}) ${t.type} ok → ${ns.pending?.type}@${ns.pending?.seat} phase=${ns.phase}`);
  } catch (e) {
    tag(`seat${t.seat} ${t.type}: ★ 抛错 → ${e.message}`);
    console.log(JSON.stringify(stored.pending, null, 1));
    break;
  }
}
log('DONE');
