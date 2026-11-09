// 读取卡图：/api/image/<game>/<cardId>
// 优先 KV，回落 D1（兼容历史数据）；响应走边缘缓存，避免反复读 KV
const kvKey = (game, cardId) => `cardimg:${game}:${cardId}`;
const d1Key = (game, cardId) => `${game}:${cardId}`;

export async function onRequestGet(context) {
  const { params, request, env } = context;

  const segs = Array.isArray(params.path) ? params.path : [params.path];
  if (segs.length < 2) return new Response('Not found', { status: 404 });

  const game = segs[0];
  const cardId = segs[1];

  // 边缘缓存：URL 带 ?v=版本号，改图必换 URL
  const cache = (typeof caches !== 'undefined' && caches.default) ? caches.default : null;
  const cacheKey = new Request(new URL(request.url).toString(), { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let res = null;

  // 1) KV
  if (env.CARDS_KV) {
    try {
      const { value, metadata } = await env.CARDS_KV.getWithMetadata(kvKey(game, cardId), 'arrayBuffer');
      if (value) {
        res = new Response(value, {
          headers: { 'Content-Type': (metadata && metadata.mime) || 'image/webp' }
        });
      }
    } catch { /* 回落 D1 */ }
  }

  // 2) D1（历史数据）
  if (!res) {
    let row;
    try {
      row = await env.DB.prepare(
        'SELECT mime, data FROM card_images WHERE id = ?'
      ).bind(d1Key(game, cardId)).first();
    } catch (err) {
      return new Response('Storage unavailable', { status: 500 });
    }

    if (row) {
      const binary = atob(row.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      res = new Response(bytes, {
        headers: { 'Content-Type': row.mime || 'image/jpeg' }
      });
    }
  }

  if (!res) return new Response('Not found', { status: 404 });

  res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (cache) context.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
