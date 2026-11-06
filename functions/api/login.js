// 登录：校验密码，返回新会话
import { json, sha256Hex, hashPassword, isV2Hash, hashClientResult, deriveClientHash, isValidUsername, createSession, isAdmin } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const username = String(body.username || '').toLowerCase();
  const clientHash = String(body.client_hash || '');
  // 兼容旧前端（直接传明文 password）：旧用户第一次登录会走旧路径并自动升级
  const password = String(body.password || '');

  if (!isValidUsername(username) || (!clientHash && !password)) {
    return json({ error: '账号或密码错误' }, 401);
  }

  const user = await env.DB.prepare(
    'SELECT id, username, pass_hash, salt FROM users WHERE username = ?'
  ).bind(username).first();

  if (!user) {
    return json({ error: '账号或密码错误' }, 401);
  }

  let ok = false;

  if (isV2Hash(user.pass_hash)) {
    // v2：前端 PBKDF2 → 后端 sha256 比较（极快）
    if (clientHash) {
      const expected = 'v2:' + await sha256Hex(clientHash);
      ok = expected === user.pass_hash;
    }
    // 兼容加载了旧版前端的浏览器：只传明文密码，后端自行推导后比较
    if (!ok && password) {
      const derived = await deriveClientHash(password, username);
      ok = ('v2:' + await sha256Hex(derived)) === user.pass_hash;
    }
  } else {
    // 旧格式：后端 PBKDF2（慢），验证通过后自动升级为 v2
    if (password && user.salt) {
      const passHash = await hashPassword(password, user.salt);
      ok = passHash === user.pass_hash;
      if (ok && clientHash) {
        const newHash = await hashClientResult(clientHash);
        await env.DB.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').bind(newHash, user.id).run();
      }
    } else if (clientHash) {
      // 旧格式但前端只传了 client_hash（新前端登录旧账号）：无法直接验证，
      // 因为旧 hash 是后端 PBKDF2 结果，与 client_hash 不同。需前端传 password。
      ok = false;
    }
  }

  if (!ok) {
    return json({ error: '账号或密码错误' }, 401);
  }

  const token = await createSession(env, user.id);
  return json({
    token,
    username: user.username,
    is_admin: isAdmin(user.username)
  });
}
