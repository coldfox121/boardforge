// 创建房间
import { json, getAuthUser, randomHex, randomRoomCode } from '../_shared.js';

const GAMES = {
  splendor: { name: '璀璨宝石', minPlayers: 2, maxPlayers: 4 }
};

export async function onRequestPost({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const gameId = String(body.game || 'splendor');
  const roomName = String(body.name || `${user.username}的房间`).slice(0, 30);

  const game = GAMES[gameId];
  if (!game) return json({ error: '未知游戏' }, 400);

  const maxPlayers = Math.max(game.minPlayers, Math.min(game.maxPlayers, Number(body.maxPlayers) || game.maxPlayers));

  // 生成不重复的房间号
  let roomCode;
  for (let i = 0; i < 10; i++) {
    roomCode = randomRoomCode();
    const existing = await env.DB.prepare('SELECT id FROM rooms WHERE room_code = ?').bind(roomCode).first();
    if (!existing) break;
  }

  const id = randomHex(16);
  const now = Date.now();

  await env.DB.prepare(
    'INSERT INTO rooms (id, name, game, created_by, room_code, status, max_players, current_players, created_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
  ).bind(id, roomName, gameId, user.user_id, roomCode, 'waiting', maxPlayers, now, now).run();

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
