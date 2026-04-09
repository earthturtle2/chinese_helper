const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');

const DATA_DIR = path.dirname(config.dbPath);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Add volume columns to existing SQLite DBs created before textbook 上/下册 split */
function migrateRecitationVolume(db) {
  const rt = db.prepare('PRAGMA table_info(recitation_texts)').all();
  if (!rt.some((c) => c.name === 'volume')) {
    db.exec("ALTER TABLE recitation_texts ADD COLUMN volume TEXT NOT NULL DEFAULT '上册'");
  }
  const st = db.prepare('PRAGMA table_info(students)').all();
  if (!st.some((c) => c.name === 'textbook_volume')) {
    db.exec("ALTER TABLE students ADD COLUMN textbook_volume TEXT NOT NULL DEFAULT '上册'");
  }
  const hasIdx = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_recitation_texts_lookup'")
    .get();
  if (!hasIdx) {
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_recitation_texts_lookup ON recitation_texts(textbook_version, grade, volume)'
    );
  }
}

function initDatabase() {
  ensureDir(DATA_DIR);
  ensureDir(config.uploadDir);

  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  migrateRecitationVolume(db);

  const adminExists = db.prepare('SELECT id FROM admins LIMIT 1').get();
  if (!adminExists) {
    const { username, password } = config.admin;
    if (username && password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, hash);
      console.log(`[DB] Admin account created from ADMIN_USERNAME env: ${username}`);
    } else {
      console.warn(
        '[DB] No admin exists and ADMIN_USERNAME/ADMIN_PASSWORD not both set; create an admin via env and restart, or use an existing database.'
      );
    }
  }

  const parentEnabled = db.prepare("SELECT value FROM settings WHERE key = 'parent_feature_enabled'").get();
  if (!parentEnabled) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('parent_feature_enabled', 'true')").run();
  }
  const dailyLimit = db.prepare("SELECT value FROM settings WHERE key = 'default_daily_limit'").get();
  if (!dailyLimit) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('default_daily_limit', ?)").run(
      String(config.defaultDailyLimit)
    );
  }

  seedSampleWordList(db);

  console.log('[DB] Database initialized successfully');
  return db;
}

function seedSampleWordList(db) {
  const existing = db.prepare('SELECT id FROM word_lists LIMIT 1').get();
  if (existing) return;

  const sampleData = [
    {
      grade: 3, unit: 1, unitTitle: '大青树下的小学',
      words: [
        { word: '晨', pinyin: 'chén' }, { word: '绒', pinyin: 'róng' },
        { word: '球', pinyin: 'qiú' }, { word: '汉', pinyin: 'hàn' },
        { word: '艳', pinyin: 'yàn' }, { word: '服', pinyin: 'fú' },
        { word: '装', pinyin: 'zhuāng' }, { word: '扮', pinyin: 'bàn' },
        { word: '读', pinyin: 'dú' }, { word: '静', pinyin: 'jìng' },
      ]
    },
    {
      grade: 3, unit: 2, unitTitle: '花的学校',
      words: [
        { word: '落', pinyin: 'luò' }, { word: '荒', pinyin: 'huāng' },
        { word: '笛', pinyin: 'dí' }, { word: '舞', pinyin: 'wǔ' },
        { word: '狂', pinyin: 'kuáng' }, { word: '罚', pinyin: 'fá' },
        { word: '假', pinyin: 'jiǎ' }, { word: '互', pinyin: 'hù' },
        { word: '所', pinyin: 'suǒ' }, { word: '够', pinyin: 'gòu' },
      ]
    },
    {
      grade: 4, unit: 1, unitTitle: '观潮',
      words: [
        { word: '潮', pinyin: 'cháo' }, { word: '据', pinyin: 'jù' },
        { word: '堤', pinyin: 'dī' }, { word: '阔', pinyin: 'kuò' },
        { word: '盼', pinyin: 'pàn' }, { word: '滚', pinyin: 'gǔn' },
        { word: '顿', pinyin: 'dùn' }, { word: '逐', pinyin: 'zhú' },
        { word: '渐', pinyin: 'jiàn' }, { word: '犹', pinyin: 'yóu' },
      ]
    },
  ];

  const insertList = db.prepare(
    'INSERT INTO word_lists (textbook_version, grade, unit, unit_title) VALUES (?, ?, ?, ?)'
  );
  const insertWord = db.prepare(
    'INSERT INTO words (word_list_id, word, pinyin, sort_order) VALUES (?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const list of sampleData) {
      const info = insertList.run('统编版', list.grade, list.unit, list.unitTitle);
      list.words.forEach((w, i) => {
        insertWord.run(info.lastInsertRowid, w.word, w.pinyin, i);
      });
    }
  });
  tx();

  const sampleTexts = [
    {
      grade: 3, unit: 1, title: '所见（袁枚）',
      content: '牧童骑黄牛，歌声振林樾。意欲捕鸣蝉，忽然闭口立。'
    },
    {
      grade: 4, unit: 1, title: '观潮（节选）',
      content: '午后一点左右，从远处传来隆隆的响声，好像闷雷滚动。顿时人声鼎沸，有人告诉我们，潮来了！'
    },
  ];

  const insertText = db.prepare(
    'INSERT INTO recitation_texts (textbook_version, grade, volume, unit, title, content, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const txTexts = db.transaction(() => {
    sampleTexts.forEach((t, i) => {
      insertText.run('统编版', t.grade, '上册', t.unit, t.title, t.content, i);
    });
  });
  txTexts();

  console.log('[DB] Sample word lists and recitation texts seeded');
}

if (require.main === module) {
  initDatabase();
  process.exit(0);
}

module.exports = { initDatabase };
