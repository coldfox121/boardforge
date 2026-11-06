// 卡牌图片上传：仅 admin，压缩后以 base64 存入 D1（card_images）
import { json, getAuthUser, isAdmin } from '../_shared.js';

const MAX_UPLOAD = 3 * 1024 * 1024;      // 前端已压缩，这里兜底 3MB
const MAX_B64 = 900 * 1024;              // D1 单行 1MB 上限，留余量
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

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

  if (file.size > MAX_UPLOAD) return json({ error: '图片不能超过 3MB' }, 413);
  if (!ALLOWED.includes(file.type)) return json({ error: '仅支持 PNG / JPEG / WebP / GIF' }, 415);

  const b64 = toBase64(await file.arrayBuffer());
  if (b64.length > MAX_B64) return json({ error: '图片压缩后仍过大，请换更小的图' }, 413);

  const now = Date.now();

  try {
    await env.DB.prepare(
      'INSERT INTO card_images (id, game_id, card_id, mime, data, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at'
    ).bind(`${game}:${cardId}`, game, cardId, file.type, b64, now).run();
  } catch (err) {
    return json({ error: '写入失败：' + err.message }, 500);
  }

  return json({ ok: true, url: `/api/image/${game}/${cardId}?v=${now}` });
}

// 删除卡图
export async function onRequestDelete(context) {
  const { request, env } = context;

  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (!isAdmin(user.username)) return json({ error: '无权限' }, 403);

  const url = new URL(request.url);
  const game = (url.searchParams.get('game') || 'splendor').replace(/[^a-z0-9_-]/gi, '');
  const cardId = (url.searchParams.get('cardId') || '').replace(/[^a-z0-9_-]/gi, '');
  if (!cardId) return json({ error: '缺少 cardId' }, 400);

  await env.DB.prepare('DELETE FROM card_images WHERE id = ?').bind(`${game}:${cardId}`).run();
  return json({ ok: true });
}
