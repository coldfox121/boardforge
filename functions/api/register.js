// 注册：用户名 + 密码，创建账号并直接返回登录态
import { json, randomHex, hashClientResult, isValidUsername, createSession, isAdmin } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const username = String(body.username || '').toLowerCase();
  const clientHash = String(body.client_hash || '');

  if (!isValidUsername(username)) {
    return json({ error: '账号需为 3-16 位字母、数字或下划线' }, 400);
  }
  if (!clientHash || clientHash.length !== 64) {
    return json({ error: '密码处理失败' }, 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) {
    return json({ error: '该账号已被注册' }, 409);
  }

  const id = randomHex(16);
  const salt = randomHex(16); // 保留 salt 字段（兼容旧格式），v2 不再用
  const passHash = await hashClientResult(clientHash);

  await env.DB.prepare(
    'INSERT INTO users (id, username, pass_hash, salt, save, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, username, passHash, salt, '', null, Date.now()).run();

  const token = await createSession(env, id);
  return json({ token, username, is_admin: isAdmin(username) });
}
