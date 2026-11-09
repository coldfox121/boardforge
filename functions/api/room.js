// 房间联机：成员（邀请进房）+ 对局状态同步（轮询）
// GET  /api/room?code=XXXXXX  → 同步房间信息、成员、对局状态
// POST /api/room              → { action: 'join' | 'leave' | 'start' | 'push' | 'reset', code, ... }
import { json, getAuthUser } from '../_shared.js';
import { projectState, mergeState } from './_project.js';

const ONLINE_MS = 15000;   // 15 秒内有心跳算在线
const DROP_MS = 60000;     // 60 秒无心跳视为掉线，移出房间

let tablesReady = false;
async function ensureTables(env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS room_members (' +
      'room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL, seat INTEGER NOT NULL, ' +
      'joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, PRIMARY KEY (room_id, user_id))'
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS room_states (' +
      'room_id TEXT PRIMARY KEY, version INTEGER NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL)'
    )
  ]);
  tablesReady = true;
}

async function findRoom(env, code) {
  if (!code) return null;
  return env.DB.prepare(
    'SELECT id, name, game, room_code, status, max_players, current_players, created_by ' +
    'FROM rooms WHERE room_code = ?'
  ).bind(String(code).toUpperCase()).first();
}

async function readMembers(env, roomId, now) {
  const rows = await env.DB.prepare(
    'SELECT user_id, username, seat, last_seen FROM room_members WHERE room_id = ? ORDER BY seat'
  ).bind(roomId).all();
  return (rows.results || []).map(m => ({
    user_id: m.user_id,
    username: m.username,
    seat: m.seat,
    online: now - m.last_seen < ONLINE_MS
  }));
}

// 清理掉线成员，并把人数回写 rooms 表
async function cleanMembers(env, roomId, now) {
  await env.DB.prepare('DELETE FROM room_members WHERE room_id = ? AND last_seen < ?')
    .bind(roomId, now - DROP_MS).run();
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM room_members WHERE room_id = ?').bind(roomId).first();
  const c = (cnt && cnt.c) || 0;
  await env.DB.prepare('UPDATE rooms SET current_players = ?, updated_at = ? WHERE id = ?')
    .bind(c, now, roomId).run();
  return c;
}

export async function onRequestGet({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  await ensureTables(env);

  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const room = await findRoom(env, code);
  if (!room) return json({ error: '房间不存在或已关闭' }, 404);

  const now = Date.now();
  const member = await env.DB.prepare(
    'SELECT seat FROM room_members WHERE room_id = ? AND user_id = ?'
  ).bind(room.id, user.user_id).first();
  if (member) {
    await env.DB.prepare('UPDATE room_members SET last_seen = ?, username = ? WHERE room_id = ? AND user_id = ?')
      .bind(now, user.username, room.id, user.user_id).run();
  }

  await cleanMembers(env, room.id, now);
  const members = await readMembers(env, room.id, now);
  const st = await env.DB.prepare('SELECT version, state FROM room_states WHERE room_id = ?').bind(room.id).first();
  const creator = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(room.created_by).first();

  let state = null;
  if (st && st.state) {
    try { state = JSON.parse(st.state); } catch { state = null; }
  }

  return json({
    room: {
      id: room.id,
      code: room.room_code,
      name: room.name,
      game: room.game,
      status: room.status,
      max_players: room.max_players,
      owner: creator?.username || 'unknown'
    },
    members,
    me: {
      seat: member ? member.seat : null,
      is_owner: room.created_by === user.user_id,
      username: user.username
    },
    version: st ? st.version : 0,
    // 按座位裁剪隐藏信息（任务票等），客户端只拿到自己该看的
    state: projectState(room.game, state, member ? member.seat : null)
  });
}

export async function onRequestPost({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  await ensureTables(env);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const code = String(body.code || '');
  const action = String(body.action || '');
  const room = await findRoom(env, code);
  if (!room) return json({ error: '房间不存在或已关闭' }, 404);

  const now = Date.now();
  const isOwner = room.created_by === user.user_id;

  switch (action) {
    case 'join': {
      const existing = await env.DB.prepare(
        'SELECT seat FROM room_members WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.user_id).first();
      if (existing) {
        await env.DB.prepare('UPDATE room_members SET last_seen = ?, username = ? WHERE room_id = ? AND user_id = ?')
          .bind(now, user.username, room.id, user.user_id).run();
      } else {
        if (room.status !== 'waiting') return json({ error: '房间已开始游戏，无法加入' }, 409);
        await cleanMembers(env, room.id, now);
        const used = await env.DB.prepare('SELECT seat FROM room_members WHERE room_id = ?').bind(room.id).all();
        const seats = new Set((used.results || []).map(x => x.seat));
        if (seats.size >= room.max_players) return json({ error: '房间已满员' }, 409);
        let seat = 0;
        while (seats.has(seat)) seat++;
        await env.DB.prepare(
          'INSERT INTO room_members (room_id, user_id, username, seat, joined_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(room.id, user.user_id, user.username, seat, now, now).run();
      }
      await cleanMembers(env, room.id, now);
      return json({ ok: true });
    }

    case 'leave': {
      await env.DB.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?')
        .bind(room.id, user.user_id).run();
      await cleanMembers(env, room.id, now);
      return json({ ok: true });
    }

    case 'start': {
      if (!isOwner) return json({ error: '只有房主可以开始游戏' }, 403);
      if (room.status !== 'waiting') return json({ error: '房间已经开始' }, 409);
      const state = body.state;
      if (!state || !Array.isArray(state.players)) return json({ error: '缺少初始对局数据' }, 400);
      if (state.players.length < 2 || state.players.length > room.max_players) {
        return json({ error: '人数不符合该房间限制' }, 400);
      }
      await env.DB.prepare(
        'INSERT INTO room_states (room_id, version, state, updated_at) VALUES (?, 1, ?, ?) ' +
        'ON CONFLICT(room_id) DO UPDATE SET version = 1, state = excluded.state, updated_at = excluded.updated_at'
      ).bind(room.id, JSON.stringify(state), now).run();
      await env.DB.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?')
        .bind('playing', now, room.id).run();
      return json({ ok: true, version: 1 });
    }

    case 'push': {
      const member = await env.DB.prepare(
        'SELECT seat FROM room_members WHERE room_id = ? AND user_id = ?'
      ).bind(room.id, user.user_id).first();
      if (!member) return json({ error: '你不在该房间中' }, 403);
      if (room.status !== 'playing') return json({ error: '房间不在对局中' }, 409);
      const baseVersion = Number(body.baseVersion);
      const state = body.state;
      if (!Number.isFinite(baseVersion) || !state) return json({ error: '参数错误' }, 400);

      const cur = await env.DB.prepare('SELECT version, state FROM room_states WHERE room_id = ?').bind(room.id).first();
      if (!cur) return json({ error: '对局数据不存在' }, 409);
      if (cur.version !== baseVersion) {
        return json({ error: '版本冲突', conflict: true, version: cur.version }, 409);
      }
      // 客户端那份可能是裁剪过的（看不到别人的隐藏信息），落库前用库里真实值补回
      let stored = null;
      try { stored = cur.state ? JSON.parse(cur.state) : null; } catch { stored = null; }
      const merged = mergeState(room.game, stored, state, member.seat);
      const next = baseVersion + 1;
      const res = await env.DB.prepare(
        'UPDATE room_states SET version = ?, state = ?, updated_at = ? WHERE room_id = ? AND version = ?'
      ).bind(next, JSON.stringify(merged), now, room.id, baseVersion).run();
      if (!res.meta || res.meta.changes === 0) {
        return json({ error: '版本冲突', conflict: true, version: cur.version }, 409);
      }
      await env.DB.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').bind(now, room.id).run();
      return json({ ok: true, version: next });
    }

    case 'reset': {
      if (!isOwner) return json({ error: '只有房主可以重置房间' }, 403);
      await env.DB.prepare('DELETE FROM room_states WHERE room_id = ?').bind(room.id).run();
      await env.DB.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?')
        .bind('waiting', now, room.id).run();
      return json({ ok: true });
    }

    default:
      return json({ error: '未知操作' }, 400);
  }
}
