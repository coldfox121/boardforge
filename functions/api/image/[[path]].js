// 读取卡图：/api/image/<game>/<cardId>，数据来自 D1 card_images
export async function onRequestGet(context) {
  const { params, env } = context;

  const segs = Array.isArray(params.path) ? params.path : [params.path];
  if (segs.length < 2) return new Response('Not found', { status: 404 });

  const game = segs[0];
  const cardId = segs[1];

  let row;
  try {
    row = await env.DB.prepare(
      'SELECT mime, data FROM card_images WHERE id = ?'
    ).bind(`${game}:${cardId}`).first();
  } catch (err) {
    return new Response('Storage unavailable', { status: 500 });
  }

  if (!row) return new Response('Not found', { status: 404 });

  const binary = atob(row.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      'Content-Type': row.mime || 'image/jpeg',
      // URL 带版本参数，改图会换 URL
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}
