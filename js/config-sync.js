// 云端牌库配置同步：进入游戏 / admin 前拉取，写入 localStorage 缓存，
// 让 splendor-engine.js 这类同步读取模块能拿到最新配置。
import { saveAdminData } from './admin.js?v=25';

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

// 上传前压缩：最长边 512px、JPEG 0.82，通常压到 30-80KB
async function compressImage(file, maxSide = 512, quality = 0.82) {
  if (file.type === 'image/gif') return file; // GIF 保持原样（动图）
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], 'card.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

// 上传卡牌图片到 D1，返回 { url } 或抛错
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
