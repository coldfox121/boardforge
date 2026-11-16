// 清空 D1 里的魔改版（variant）数据
// 用法：set CF_API_TOKEN=xxx && node scripts/clear-variants.mjs
//
// 安全策略：
//   1) 先把 game_variants 全表导出到仓库外的备份目录（默认 D:/TREA_project/_backups）
//   2) 备份文件写入成功且非空，才执行 DELETE
//   3) 只删行，不 DROP 表；同时把 rooms 里残留的 variant 引用清空
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.CF_API_TOKEN;
const ACCOUNT = 'd581be8903c61299eaa2d551e3a0f56d';
const DB = 'fbd65a6a-32c1-4ea2-ab20-0fcb9db4dc42';

if (!TOKEN) { console.error('缺少 CF_API_TOKEN 环境变量'); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = resolve(here, '../../_backups');

async function q(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  const j = await res.json();
  if (!j.success) throw new Error('D1 错误: ' + JSON.stringify(j.errors || j));
  return j.result?.[0] || { results: [] };
}

const step = (m) => console.log('\n▶ ' + m);

step('检查表是否存在');
let rows = [];
try {
  const r = await q('SELECT * FROM game_variants');
  rows = r.results || [];
  console.log(`  game_variants 现有 ${rows.length} 行`);
} catch (e) {
  console.log('  game_variants 不存在或不可读，按 0 行处理:', e.message.slice(0, 120));
}

if (rows.length) {
  step('导出备份');
  if (!existsSync(backupDir)) await mkdir(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = resolve(backupDir, `boardforge-game_variants-${ts}.json`);
  const payload = JSON.stringify({ exported_at: new Date().toISOString(), db: DB, table: 'game_variants', count: rows.length, rows }, null, 2);
  await writeFile(file, payload, 'utf8');
  console.log('  备份写入:', file, `(${payload.length} 字节)`);
  if (!existsSync(file)) { console.error('备份文件不存在，中止'); process.exit(1); }
} else {
  console.log('  无数据需要备份');
}

step('清空 game_variants');
try {
  const r = await q('DELETE FROM game_variants');
  console.log('  删除完成，meta:', JSON.stringify(r.meta || {}));
} catch (e) {
  console.error('  删除失败:', e.message);
  process.exit(1);
}

step('清理 rooms 里的 variant 引用');
for (const sql of [
  'UPDATE rooms SET variant_id = NULL WHERE variant_id IS NOT NULL',
  'UPDATE rooms SET variant_version = 0 WHERE variant_version IS NOT NULL AND variant_version != 0'
]) {
  try {
    const r = await q(sql);
    console.log('  ok:', sql.slice(0, 46), '… changes=', r.meta?.changes ?? r.meta?.rows_written ?? '?');
  } catch (e) {
    console.log('  跳过（列可能不存在）:', e.message.slice(0, 100));
  }
}

step('复核');
try {
  const c = await q('SELECT COUNT(*) AS c FROM game_variants');
  console.log('  game_variants 剩余行数:', c.results?.[0]?.c);
} catch (e) {
  console.log('  复核失败:', e.message.slice(0, 120));
}
console.log('\n完成');
