/**
 * 按课文标题更新统编版 recitation_texts 的 title、content（用于补全文或勘误）。
 * 数据文件：server/data/recitation/content-updates.json
 * 格式：[{ "matchTitle": "大青树下的小学（节选）", "title": "大青树下的小学", "content": "……" }, ...]
 *
 *   node server/scripts/apply-recitation-content-updates.js
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

const TEXTBOOK = '统编版';
const DATA = path.join(__dirname, '..', 'data', 'recitation', 'content-updates.json');

function main() {
  if (!fs.existsSync(DATA)) {
    console.log(`[apply-recitation-updates] 跳过：未找到 ${DATA}`);
    return;
  }
  let items;
  try {
    items = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch (e) {
    console.error('[apply-recitation-updates] JSON 解析失败', e.message);
    process.exit(1);
  }
  if (!Array.isArray(items) || items.length === 0) {
    console.log('[apply-recitation-updates] 无更新项');
    return;
  }

  const db = new Database(config.dbPath);
  db.pragma('foreign_keys = ON');
  const upd = db.prepare(
    `UPDATE recitation_texts SET title = ?, content = ?
     WHERE textbook_version = ? AND title = ?`
  );

  let n = 0;
  const tx = db.transaction(() => {
    for (const row of items) {
      const match = String(row.matchTitle || '').trim();
      const title = String(row.title != null ? row.title : match).trim();
      const content = String(row.content || '');
      if (!match) continue;
      const r = upd.run(title, content, TEXTBOOK, match);
      n += r.changes;
    }
  });
  tx();
  db.close();
  console.log(`[apply-recitation-updates] 已更新 ${n} 条（配置 ${items.length} 项）`);
}

main();
