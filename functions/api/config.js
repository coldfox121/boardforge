// 游戏牌库配置：公开读取，仅 admin 可写
import { json, getAuthUser, isAdmin } from '../_shared.js';

const MAX_CONFIG_BYTES = 1024 * 1024; // 1MB

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const game = url.searchParams.get('game') || 'splendor';

  try {
    const row = await env.DB.prepare(
      'SELECT game_id, data, updated_at FROM game_configs WHERE game_id = ?'
    ).bind(game).first();

    if (!row) return json({ game, data: null, updated_at: 0 });

    let data = null;
    try { data = JSON.parse(row.data); } catch { data = null; }
    return json({ game, data, updated_at: row.updated_at || 0 });
  } catch (err) {
    // 表还没建时不让游戏挂掉，直接返回空配置
    return json({ game, data: null, updated_at: 0, warn: 'config table unavailable' });
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;

  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (!isAdmin(user.username)) return json({ error: '无权限' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: '无效 JSON' }, 400); }

  const game = String(body.game || 'splendor');
  if (!body.data || typeof body.data !== 'object') return json({ error: '缺少 data' }, 400);

  const text = JSON.stringify(body.data);
  if (text.length > MAX_CONFIG_BYTES) return json({ error: '配置超过 1MB' }, 413);

  const now = Date.now();
  try {
    await env.DB.prepare(
      'INSERT INTO game_configs (game_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(game_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
    ).bind(game, text, now, user.user_id).run();
  } catch (err) {
    return json({ error: '写入失败，请确认 game_configs 表已创建：' + err.message }, 500);
  }

  return json({ ok: true, game, updated_at: now });
}
