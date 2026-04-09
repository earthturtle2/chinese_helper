/**
 * 统编版小学语文 3–6 年级上下册课文（古诗、文言多为全文，现代文多为节选）。
 * 由 scripts/seed-tongbian-recitation.js 导入数据库。
 */
module.exports = [
  ...require('./parts/g3-up'),
  ...require('./parts/g3-down'),
  ...require('./parts/g4-up'),
  ...require('./parts/g4-down'),
  ...require('./parts/g5-up'),
  ...require('./parts/g5-down'),
  ...require('./parts/g6-up'),
  ...require('./parts/g6-down'),
];
