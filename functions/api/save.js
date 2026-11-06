// 保存当前用户存档
import { json, getAuthUser } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const save = String(body.save || '');
  if (save.length > 1000000) return json({ error: '存档过大' }, 413);

  await env.DB.prepare('UPDATE users SET save = ?, last_seen = ? WHERE id = ?')
    .bind(save, Date.now(), user.user_id).run();

  return json({ ok: true });
}
