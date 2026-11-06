// 读取 R2 中的图片：/api/image/cards/splendor/xxx.png
export async function onRequestGet(context) {
  const { params, env } = context;

  const key = Array.isArray(params.path) ? params.path.join('/') : params.path;
  if (!key) return new Response('Not found', { status: 404 });
  if (!env.IMAGES) return new Response('R2 not bound', { status: 500 });

  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  // 文件名带随机后缀，内容不会变，可长期缓存
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(obj.body, { headers });
}
