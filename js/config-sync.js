// 云端牌库配置同步：进入游戏 / admin 前拉取，写入 localStorage 缓存，
// 让 splendor-engine.js 这类同步读取模块能拿到最新配置。
import { saveAdminData } from './admin.js?v=29';

export async function syncGameConfig(gameId) {
  try {
    const res = await fetch('/api/config?game=' + encodeURIComponent(gameId), { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    if (j && j.data) {
      saveAdminData(gameId, j.data);
      return j.data;
    }
  } catch (e) {
    // 网络不可用时保持本地缓存
  }
  return null;
}

// 上传前压缩：最长边 1024px，优先 WebP，目标 ≤600KB
const MAX_SIDE = 1024;
const TARGET_BYTES = 600 * 1024;
const GIF_MAX = 2 * 1024 * 1024;

function toBlob(canvas, mime, quality) {
  return new Promise(res => canvas.toBlob(res, mime, quality));
}

async function compressImage(file) {
  // 动图不做压缩，但必须小于 2MB
  if (file.type === 'image/gif') {
    if (file.size > GIF_MAX) throw new Error('GIF 请控制在 2MB 内（动图不做压缩）');
    return file;
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (e) {
    // 浏览器解不开的格式：原样交给后端判断大小
    return file;
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  // 优先 WebP（体积更小），不支持则退 JPEG
  let blob = await toBlob(canvas, 'image/webp', 0.9);
  let mime = 'image/webp';
  if (!blob || blob.type !== 'image/webp') {
    mime = 'image/jpeg';
    blob = await toBlob(canvas, 'image/jpeg', 0.9);
  }
  if (!blob) return file;

  // 逐步降质量直到达标
  let quality = 0.9;
  while (blob.size > TARGET_BYTES && quality > 0.5) {
    quality -= 0.1;
    const next = await toBlob(canvas, mime, quality);
    if (!next) break;
    blob = next;
  }

  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `card.${ext}`, { type: mime });
}

// 上传卡牌图片到 KV，返回 { url } 或抛错
export async function uploadCardImage(gameId, cardId, file) {
  const token = localStorage.getItem('bf_token') || '';
  const compressed = await compressImage(file);

  const form = new FormData();
  form.append('file', compressed);
  form.append('game', gameId);
  form.append('cardId', cardId);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('上传失败 ' + res.status));
  return j;
}

// 删除卡图数据
export async function deleteCardImage(gameId, cardId) {
  const token = localStorage.getItem('bf_token') || '';
  try {
    await fetch(`/api/upload?game=${encodeURIComponent(gameId)}&cardId=${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });
  } catch (e) {
    // 删除失败不影响界面
  }
}

// 保存牌库配置到云端
export async function saveConfigToCloud(gameId, data) {
  const token = localStorage.getItem('bf_token') || '';
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ game: gameId, data })
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('保存失败 ' + res.status));
  return j;
}
