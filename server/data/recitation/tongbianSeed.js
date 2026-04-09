/**
 * 统编版小学语文 3–6 年级上下册课文正文。
 * 由 scripts/seed-tongbian-recitation.js 导入数据库；三年级上册等已逐步换为教材全文，其余册可继续补全或用 content-updates.json 覆盖。
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
