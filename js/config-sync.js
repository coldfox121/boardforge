// 云端牌库配置同步：进入游戏 / admin 前拉取，写入 localStorage 缓存，
// 让 splendor-engine.js 这类同步读取模块能拿到最新配置。
import { saveAdminData } from './admin.js?v=22';

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

// 上传卡牌图片到 R2，返回 { url } 或抛错
export async function uploadCardImage(gameId, cardId, file) {
  const token = localStorage.getItem('bf_token') || '';
  const form = new FormData();
  form.append('file', file);
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
