require('dotenv').config();
const crypto = require('crypto');

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
};
