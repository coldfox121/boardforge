// 获取当前用户存档（好友列表等扩展用）
import { json, getAuthUser } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  return json({ username: user.username, save: user.save || '' });
}
