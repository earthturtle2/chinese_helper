require('dotenv').config();
const crypto = require('crypto');
const path = require('path');

/**
 * Nginx 等反向代理会传 X-Forwarded-*；需开启 trust proxy，否则 express-rate-limit 等会报错。
 * TRUST_PROXY=1 表示信任第一层代理（常见单级 Nginx）。
 */
function parseTrustProxy(raw) {
  const v = (raw || '').trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return 1;
  const n = parseInt(raw, 10);
  if (!Number.isNaN(n) && n >= 0) return n;
  return false;
}

function requireJwtSecret() {
  const s = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && (!s || s.length < 32)) {
    throw new Error(
      'JWT_SECRET must be set in environment to a random string of at least 32 characters.'
    );
  }
  if (s && s.length >= 32) return s;
  if (s) return s;
  const ephemeral = crypto.randomBytes(32).toString('hex');
  console.warn(
    '[config] JWT_SECRET not set; using an ephemeral secret for this process only (tokens invalid after restart). Set JWT_SECRET in .env for stable local dev.'
  );
  return ephemeral;
}

module.exports = {
  /** Override with env `PORT` (e.g. 3001 if 3000 is taken). */
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  jwtSecret: requireJwtSecret(),
  jwtExpiresIn: '7d',

  /** Initial admin is created only when both env vars are set (see db/init.js). */
  admin: {
    username: process.env.ADMIN_USERNAME || '',
    password: process.env.ADMIN_PASSWORD || '',
  },

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  },

  voskModelPath: process.env.VOSK_MODEL_PATH || './models/vosk-model-small-cn-0.22',

  defaultDailyLimit: parseInt(process.env.DEFAULT_DAILY_LIMIT, 10) || 40,

  dbPath: process.env.DB_PATH || './data/chinese_helper.db',

  uploadDir: './data/uploads',
  audioDir: './data/audio',

  /**
   * Piper 本地 TTS（可选）。需下载中文模型到 models/piper/，并设置 PIPER_BIN 指向 piper 可执行文件。
   * 见 npm run fetch-piper 与 .env.example。
   */
  piperBin: (process.env.PIPER_BIN || '').trim(),
  piperModel: process.env.PIPER_MODEL
    ? path.resolve(process.cwd(), process.env.PIPER_MODEL.trim())
    : path.join(__dirname, '..', 'models', 'piper', 'zh_CN-xiao_ya-medium.onnx'),
  /** Piper 韵律：略大于 1 时语速稍慢、停顿略舒展（可选，未设置则不传参） */
  piperLengthScale: (() => {
    const raw = process.env.PIPER_LENGTH_SCALE;
    if (raw === undefined || raw === '') return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })(),
};
