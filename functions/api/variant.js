// 魔改版 CRUD
// GET  /api/variant?game=splendor           → 列出基础版 + 所有魔改版
// GET  /api/variant?id=xxxxxxxx             → 读取完整配置
// POST /api/variant                         → { action: 'create'|'fork'|'update'|'delete', ... }
import { json, getAuthUser } from '../_shared.js';

let tablesReady = false;
async function ensureTables(env) {
  if (tablesReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS game_variants (' +
    'id TEXT PRIMARY KEY, base_game TEXT NOT NULL, name TEXT NOT NULL, ' +
    'rules_json TEXT NOT NULL DEFAULT "{}", labels_json TEXT NOT NULL DEFAULT "{}", ' +
    'deck_json TEXT NOT NULL DEFAULT "{}", ' +
    'version INTEGER NOT NULL DEFAULT 1, creator TEXT NOT NULL, ' +
    'created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
  ).run();
  tablesReady = true;
}

function makeId() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function parseVariant(row) {
  if (!row) return null;
  return {
    id: row.id,
    base_game: row.base_game,
    name: row.name,
    rules: JSON.parse(row.rules_json || '{}'),
    labels: JSON.parse(row.labels_json || '{}'),
    deck: JSON.parse(row.deck_json || '{}'),
    version: row.version,
    creator: row.creator,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function onRequestGet({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  await ensureTables(env);

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const game = url.searchParams.get('game');

  if (id) {
    const row = await env.DB.prepare('SELECT * FROM game_variants WHERE id = ?').bind(id).first();
    if (!row) return json({ error: '魔改版不存在' }, 404);
    return json({ variant: parseVariant(row) });
  }

  if (!game) return json({ error: '需要 game 或 id 参数' }, 400);

  const rows = await env.DB.prepare(
    'SELECT id, base_game, name, version, creator, created_at, updated_at ' +
    'FROM game_variants WHERE base_game = ? ORDER BY updated_at DESC'
  ).bind(game).all();
  return json({
    base: { id: null, base_game: game, name: '官方基础版', version: 0, isBase: true },
    variants: (rows.results || []).map(r => ({ ...r, isBase: false }))
  });
}

export async function onRequestPost({ request, env }) {
  const user = await getAuthUser(request, env);
  if (!user) return json({ error: '未登录' }, 401);
  await ensureTables(env);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const action = String(body.action || '');
  const now = Date.now();

  switch (action) {
    case 'create': {
      // 创建空魔改版（base 游戏 + 默认值）
      const baseGame = String(body.base_game || '');
      const name = String(body.name || '').trim();
      if (!baseGame || !name) return json({ error: '需要 base_game 和 name' }, 400);
      const id = makeId();
      await env.DB.prepare(
        'INSERT INTO game_variants (id, base_game, name, rules_json, labels_json, deck_json, version, creator, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
      ).bind(id, baseGame, name, '{}', '{}', '{}', user.user_id, now, now).run();
      const row = await env.DB.prepare('SELECT * FROM game_variants WHERE id = ?').bind(id).first();
      return json({ ok: true, variant: parseVariant(row) });
    }

    case 'fork': {
      // 从另一个魔改版或基础版 fork
      const baseGame = String(body.base_game || '');
      const forkId = body.fork_from_id || null;  // null 表示从基础版 fork
      const name = String(body.name || '').trim();
      if (!baseGame || !name) return json({ error: '需要 base_game 和 name' }, 400);

      let rules = {}, labels = {}, deck = {};
      if (forkId) {
        const src = await env.DB.prepare('SELECT rules_json, labels_json, deck_json FROM game_variants WHERE id = ?').bind(forkId).first();
        if (!src) return json({ error: '源魔改版不存在' }, 404);
        rules = JSON.parse(src.rules_json || '{}');
        labels = JSON.parse(src.labels_json || '{}');
        deck = JSON.parse(src.deck_json || '{}');
      }
      const id = makeId();
      await env.DB.prepare(
        'INSERT INTO game_variants (id, base_game, name, rules_json, labels_json, deck_json, version, creator, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)'
      ).bind(id, baseGame, name, JSON.stringify(rules), JSON.stringify(labels), JSON.stringify(deck), user.user_id, now, now).run();
      const row = await env.DB.prepare('SELECT * FROM game_variants WHERE id = ?').bind(id).first();
      return json({ ok: true, variant: parseVariant(row) });
    }

    case 'update': {
      // 更新魔改版配置（version 自动 +1）
      const id = String(body.id || '');
      if (!id) return json({ error: '需要 id' }, 400);
      const row = await env.DB.prepare('SELECT * FROM game_variants WHERE id = ?').bind(id).first();
      if (!row) return json({ error: '魔改版不存在' }, 404);
      if (row.creator !== user.user_id) {
        return json({ error: '只有创建者可以修改' }, 403);
      }
      const rules = body.rules !== undefined ? body.rules : JSON.parse(row.rules_json || '{}');
      const labels = body.labels !== undefined ? body.labels : JSON.parse(row.labels_json || '{}');
      const deck = body.deck !== undefined ? body.deck : JSON.parse(row.deck_json || '{}');
      const newVer = row.version + 1;
      await env.DB.prepare(
        'UPDATE game_variants SET rules_json = ?, labels_json = ?, deck_json = ?, version = ?, updated_at = ? WHERE id = ?'
      ).bind(JSON.stringify(rules), JSON.stringify(labels), JSON.stringify(deck), newVer, now, id).run();
      const updated = await env.DB.prepare('SELECT * FROM game_variants WHERE id = ?').bind(id).first();
      return json({ ok: true, variant: parseVariant(updated) });
    }

    case 'rename': {
      const id = String(body.id || '');
      const name = String(body.name || '').trim();
      if (!id || !name) return json({ error: '需要 id 和 name' }, 400);
      const row = await env.DB.prepare('SELECT creator FROM game_variants WHERE id = ?').bind(id).first();
      if (!row) return json({ error: '魔改版不存在' }, 404);
      if (row.creator !== user.user_id) return json({ error: '只有创建者可以改名' }, 403);
      await env.DB.prepare('UPDATE game_variants SET name = ?, updated_at = ?, version = version + 1 WHERE id = ?')
        .bind(name, now, id).run();
      return json({ ok: true });
    }

    case 'delete': {
      const id = String(body.id || '');
      if (!id) return json({ error: '需要 id' }, 400);
      const row = await env.DB.prepare('SELECT creator FROM game_variants WHERE id = ?').bind(id).first();
      if (!row) return json({ error: '魔改版不存在' }, 404);
      if (row.creator !== user.user_id) return json({ error: '只有创建者可以删除' }, 403);
      // 不允许删除对局中的魔改版
      const used = await env.DB.prepare('SELECT COUNT(*) AS c FROM rooms WHERE variant_id = ? AND status = "playing"').bind(id).first();
      if (used && used.c > 0) return json({ error: '有对局正在使用该魔改版，无法删除' }, 409);
      await env.DB.prepare('DELETE FROM game_variants WHERE id = ?').bind(id).run();
      await env.DB.prepare('UPDATE rooms SET variant_id = NULL, variant_version = 0 WHERE variant_id = ?').bind(id).run();
      return json({ ok: true });
    }

    default:
      return json({ error: '未知操作' }, 400);
  }
}
