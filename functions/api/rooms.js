// 房间管理：GET 查询 / POST 创建
import { json, getAuthUser, randomHex, randomRoomCode } from '../_shared.js';
import { GAMES } from './games.js';

export async function onRequestGet({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (code) {
    const row = await env.DB.prepare(
      'SELECT id, name, game, room_code, status, max_players, current_players, created_at, updated_at ' +
      'FROM rooms WHERE room_code = ?'
    ).bind(code.toUpperCase()).first();

    if (!row) return json({ error: '房间不存在' }, 404);

    const creator = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(row.created_by).first();
    const gameName = GAMES[row.game]?.name || row.game;

    return json({
      id: row.id,
      name: row.name,
      game: row.game,
      game_name: gameName,
      room_code: row.room_code,
      status: row.status,
      max_players: row.max_players,
      current_players: row.current_players,
      created_by: creator?.username || 'unknown'
    });
  }

  // 列出等待中的房间
  const rows = await env.DB.prepare(
    'SELECT r.id, r.name, r.game, r.room_code, r.status, r.max_players, r.current_players, r.created_by ' +
    'FROM rooms r WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 20'
  ).bind('waiting').all();

  const ids = [...new Set((rows.results || []).map(r => r.created_by))];
  const creatorMap = {};
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const creators = await env.DB.prepare(`SELECT id, username FROM users WHERE id IN (${placeholders})`).bind(...ids).all();
    (creators.results || []).forEach(c => creatorMap[c.id] = c.username);
  }

  return json({
    rooms: (rows.results || []).map(r => ({
      id: r.id,
      name: r.name,
      game: r.game,
      game_name: GAMES[r.game]?.name || r.game,
      room_code: r.room_code,
      status: r.status,
      max_players: r.max_players,
      current_players: r.current_players,
      created_by: creatorMap[r.created_by] || 'unknown'
    }))
  });
}

export async function onRequestPost({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const gameId = String(body.game || 'splendor');
  const roomName = String(body.name || `${user.username}的房间`).slice(0, 30);
  const maxPlayers = Math.max(2, Math.min(4, Number(body.maxPlayers) || 4));

  const game = GAMES[gameId];
  if (!game) return json({ error: '未知游戏' }, 400);
  if (maxPlayers > game.maxPlayers) return json({ error: `该游戏最多 ${game.maxPlayers} 人` }, 400);

  const id = randomHex(16);
  const now = Date.now();

  // 直接 INSERT，依赖 room_code 唯一约束，冲突则换号重试（避免循环 SELECT）
  let roomCode;
  let ok = false;
  for (let i = 0; i < 10; i++) {
    roomCode = randomRoomCode();
    try {
      await env.DB.prepare(
        'INSERT INTO rooms (id, name, game, created_by, room_code, status, max_players, current_players, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
      ).bind(id, roomName, gameId, user.user_id, roomCode, 'waiting', maxPlayers, now, now).run();
      ok = true;
      break;
    } catch (e) {
      if (!String(e.message || '').includes('UNIQUE')) throw e;
    }
  }
  if (!ok) return json({ error: '创建房间失败，请重试' }, 500);

  return json({
    id,
    room_code: roomCode,
    name: roomName,
    game: gameId,
    game_name: game.name,
    max_players: maxPlayers,
    created_by: user.username
  });
}
