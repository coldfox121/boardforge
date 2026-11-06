// 卡牌图片上传：仅 admin，存入 R2（绑定变量名 IMAGES）
import { json, getAuthUser, isAdmin, randomHex } from '../_shared.js';

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function onRequestPost(context) {
  const { request, env } = context;

  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  if (!isAdmin(user.username)) return json({ error: '无权限' }, 403);

  if (!env.IMAGES) {
    return json({ error: 'R2 未绑定：请在 Pages 项目设置里添加变量名 IMAGES 的 R2 存储桶绑定' }, 500);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: '需要 multipart/form-data' }, 400);

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: '缺少 file' }, 400);

  const game = String(form.get('game') || 'splendor').replace(/[^a-z0-9_-]/gi, '');
  const cardId = String(form.get('cardId') || 'misc').replace(/[^a-z0-9_-]/gi, '');

  if (file.size > MAX_SIZE) return json({ error: '图片不能超过 5MB' }, 413);
  if (!ALLOWED.includes(file.type)) return json({ error: '仅支持 PNG / JPEG / WebP / GIF' }, 415);

  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `cards/${game}/${cardId}-${randomHex(6)}.${ext}`;

  await env.IMAGES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type }
  });

  return json({ ok: true, key, url: '/api/image/' + key });
}
