/**
 * 将统编版 3–6 年级课文数据写入 recitation_texts。
 * 用法：
 *   node server/scripts/seed-tongbian-recitation.js           # 若已有统编版课文则跳过
 *   node server/scripts/seed-tongbian-recitation.js --replace # 先删除统编版再全量导入
 * 若需在导入后按标题覆盖正文（勘误/补全文），可配置 server/data/recitation/content-updates.json 后执行：
 *   npm run seed:recitation:apply-updates
 */
const Database = require('better-sqlite3');
const config = require('../config');
const { normalizeVolume } = require('../utils/volume');
const items = require('../data/recitation/tongbianSeed');

const TEXTBOOK = '统编版';

function main() {
  const replace = process.argv.includes('--replace');
  const db = new Database(config.dbPath);
  db.pragma('foreign_keys = ON');

  const count = db
    .prepare('SELECT COUNT(*) AS c FROM recitation_texts WHERE textbook_version = ?')
    .get(TEXTBOOK).c;

  if (count > 0 && !replace) {
    console.log(
      `[seed-recitation] 已有统编版课文 ${count} 条，跳过。若要覆盖请执行：node server/scripts/seed-tongbian-recitation.js --replace`
    );
    db.close();
    return;
  }

  if (replace) {
    const r = db.prepare('DELETE FROM recitation_texts WHERE textbook_version = ?').run(TEXTBOOK);
    console.log(`[seed-recitation] 已删除统编版旧数据 ${r.changes} 条`);
  }

  const insert = db.prepare(
    `INSERT INTO recitation_texts (textbook_version, grade, volume, unit, title, content, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    items.forEach((row) => {
      const vol = normalizeVolume(row.volume);
      insert.run(
        TEXTBOOK,
        row.grade,
        vol,
        row.unit,
        String(row.title).trim(),
        String(row.content),
        row.sortOrder != null ? parseInt(row.sortOrder, 10) : 0
      );
    });
  });
  tx();

  const n = db.prepare('SELECT COUNT(*) AS c FROM recitation_texts WHERE textbook_version = ?').get(TEXTBOOK).c;
  console.log(`[seed-recitation] 已导入统编版课文 ${items.length} 条（当前库中共 ${n} 条）`);
  db.close();
}

main();
