/** 教材分册：与纸质课本「上册 / 下册」一致 */
const VOLUMES = Object.freeze(['上册', '下册']);

/** 去掉首尾空格，避免与库内 textbook_version 因空格不一致而查不到课文 */
function normalizeTextbookVersion(value) {
  return String(value ?? '').trim();
}

function normalizeVolume(value) {
  const s = String(value ?? '').trim();
  if (s === '下册') return '下册';
  return '上册';
}

function isValidVolume(value) {
  return VOLUMES.includes(String(value ?? '').trim());
}

module.exports = { VOLUMES, normalizeTextbookVersion, normalizeVolume, isValidVolume };
