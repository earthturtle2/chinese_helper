require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '7d',

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
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
