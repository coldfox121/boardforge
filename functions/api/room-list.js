// 房间列表：查询等待中的房间，或按房间号查询
import { json, getAuthUser } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (code) {
    // 按房间号精确查询
    const row = await env.DB.prepare(
      'SELECT id, name, game, room_code, status, max_players, current_players, created_at, updated_at ' +
      'FROM rooms WHERE room_code = ?'
    ).bind(code.toUpperCase()).first();

    if (!row) return json({ error: '房间不存在' }, 404);

    // 获取创建者名称
    const creator = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(row.created_by).first();

    return json({
      id: row.id,
      name: row.name,
      game: row.game,
      game_name: row.game === 'splendor' ? '璀璨宝石' : row.game,
      room_code: row.room_code,
      status: row.status,
      max_players: row.max_players,
      current_players: row.current_players,
      created_by: creator?.username || 'unknown'
    });
  }

  // 列出等待中的房间（最近创建的20个）
  const rows = await env.DB.prepare(
    'SELECT r.id, r.name, r.game, r.room_code, r.status, r.max_players, r.current_players, r.created_by ' +
    'FROM rooms r WHERE r.status = \'waiting\' ORDER BY r.created_at DESC LIMIT 20'
  ).all();

  if (!rows.results) return json({ rooms: [] });

  // 批量查创建者
  const ids = [...new Set(rows.results.map(r => r.created_by))];
  const creators = ids.length > 0
    ? await env.DB.prepare('SELECT id, username FROM users WHERE id IN (' + ids.map(() => '?').join(',') + ')').bind(...ids).all()
    : { results: [] };
  const creatorMap = {};
  (creators.results || []).forEach(c => creatorMap[c.id] = c.username);

  return json({
    rooms: rows.results.map(r => ({
      id: r.id,
      name: r.name,
      game: r.game,
      game_name: r.game === 'splendor' ? '璀璨宝石' : r.game,
      room_code: r.room_code,
      status: r.status,
      max_players: r.max_players,
      current_players: r.current_players,
      created_by: creatorMap[r.created_by] || 'unknown'
    }))
  });
}
