/** 教材分册：与纸质课本「上册 / 下册」一致 */
const VOLUMES = Object.freeze(['上册', '下册']);

function normalizeVolume(value) {
  const s = String(value ?? '').trim();
  if (s === '下册') return '下册';
  return '上册';
}

function isValidVolume(value) {
  return VOLUMES.includes(String(value ?? '').trim());
}

module.exports = { VOLUMES, normalizeVolume, isValidVolume };
