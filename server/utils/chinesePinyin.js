const { pinyin } = require('pinyin');

/**
 * Convert a Chinese string to spaced pinyin with tone marks (e.g. "你好" -> "nǐ hǎo").
 * Non-Chinese characters are skipped.
 */
function toPinyin(text) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const result = pinyin(trimmed, { style: pinyin.STYLE_TONE, heteronym: false });
  return result.map((r) => r[0]).join(' ');
}

/** Keep only CJK unified ideographs (common Hanzi range). */
function extractHanzi(s) {
  return String(s).replace(/[^\u4e00-\u9fff]/g, '');
}

module.exports = { toPinyin, extractHanzi };
