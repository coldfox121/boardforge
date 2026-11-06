// 登出：删除会话
import { json, sha256Hex } from '../_shared.js';

export async function onRequestPost({ request, env }) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+([0-9a-f]{64})$/i);
  if (match) {
    const tokenHash = await sha256Hex(match[1].toLowerCase());
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return json({ ok: true });
}
