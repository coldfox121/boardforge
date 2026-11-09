// 卡牌图片上传：仅 admin。优先存 KV（单值上限 25MB），未绑定 KV 时回落 D1
import { json, getAuthUser, isAdmin } from '../_shared.js';

const MAX_UPLOAD = 10 * 1024 * 1024;      // KV 单值 25MB，前端压缩后一般 <200KB
const D1_MAX_B64 = 900 * 1024;            // D1 单行 1MB 上限，留余量
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const kvKey = (game, cardId) => `cardimg:${game}:${cardId}`;
const d1Key = (game, cardId) => `${game}:${cardId}`;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (!isAdmin(user.username)) return json({ error: '无权限' }, 403);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: '需要 multipart/form-data' }, 400);

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: '缺少 file' }, 400);

  const game = String(form.get('game') || 'splendor').replace(/[^a-z0-9_-]/gi, '');
  const cardId = String(form.get('cardId') || 'misc').replace(/[^a-z0-9_-]/gi, '');

  if (file.size > MAX_UPLOAD) return json({ error: '图片不能超过 10MB' }, 413);
  if (!ALLOWED.includes(file.type)) return json({ error: '仅支持 PNG / JPEG / WebP / GIF' }, 415);

  const now = Date.now();
  const buf = await file.arrayBuffer();

  // 1) 优先写 KV（二进制直存，无 base64 膨胀）
  if (env.CARDS_KV) {
    try {
      await env.CARDS_KV.put(kvKey(game, cardId), buf, {
        metadata: { mime: file.type, size: buf.byteLength, updatedAt: now }
      });
    } catch (err) {
      return json({ error: 'KV 写入失败：' + err.message }, 500);
    }
    // 清掉 D1 里的旧图，避免回落路径读到过时版本
    try {
      await env.DB.prepare('DELETE FROM card_images WHERE id = ?').bind(d1Key(game, cardId)).run();
    } catch { /* 忽略 */ }
    return json({ ok: true, storage: 'kv', url: `/api/image/${game}/${cardId}?v=${now}` });
  }

  // 2) 未绑定 KV → 回落 D1
  const b64 = toBase64(buf);
  if (b64.length > D1_MAX_B64) {
    return json({ error: '当前存储为 D1，单张上限约 675KB，请压缩后再传' }, 413);
  }

  try {
    await env.DB.prepare(
      'INSERT INTO card_images (id, game_id, card_id, mime, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at'
    ).bind(d1Key(game, cardId), game, cardId, file.type, b64, now).run();
  } catch (err) {
    return json({ error: '写入失败：' + err.message }, 500);
  }

  return json({ ok: true, storage: 'd1', url: `/api/image/${game}/${cardId}?v=${now}` });
}

// 删除卡图（KV + D1 都清）
export async function onRequestDelete(context) {
  const { request, env } = context;

  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (!isAdmin(user.username)) return json({ error: '无权限' }, 403);

  const url = new URL(request.url);
  const game = (url.searchParams.get('game') || 'splendor').replace(/[^a-z0-9_-]/gi, '');
  const cardId = (url.searchParams.get('cardId') || '').replace(/[^a-z0-9_-]/gi, '');
  if (!cardId) return json({ error: '缺少 cardId' }, 400);

  if (env.CARDS_KV) {
    try { await env.CARDS_KV.delete(kvKey(game, cardId)); } catch { /* 忽略 */ }
  }
  try {
    await env.DB.prepare('DELETE FROM card_images WHERE id = ?').bind(d1Key(game, cardId)).run();
  } catch { /* 忽略 */ }

  return json({ ok: true });
}
