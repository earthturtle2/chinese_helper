const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { synthToWav, isConfigured } = require('../services/piperTts');

const MAX_CHARS = 8000;

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '朗读请求过于频繁，请稍后再试' },
});

function sanitizeText(raw) {
  if (typeof raw !== 'string') return '';
  const t = raw.replace(/\u0000/g, '').trim();
  return t.slice(0, MAX_CHARS);
}

function getSetting(db, key, defaultValue) {
  if (!db) return defaultValue;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  const v = row?.value;
  if (v == null || String(v).trim() === '') return defaultValue;
  return String(v).trim();
}

function statusPayload(db) {
  const bin = config.piperBin;
  const modelPath = config.piperModel;
  const configured = isConfigured(config);
  const binOk = bin && fs.existsSync(bin);
  const modelOk = modelPath && fs.existsSync(modelPath);
  const jsonOk = modelPath && fs.existsSync(`${modelPath}.json`);
  const available = configured && binOk && modelOk && jsonOk;
  let reason = null;
  if (!configured) reason = '未设置 PIPER_BIN（请指向 piper 可执行文件）';
  else if (!binOk) reason = 'PIPER_BIN 路径无效';
  else if (!modelOk) reason = 'PIPER_MODEL 文件不存在（可先运行 npm run fetch-piper）';
  else if (!jsonOk) reason = '缺少与 .onnx 同名的 .onnx.json';
  const rawEngine = getSetting(db, 'tts_engine', 'piper').toLowerCase();
  const preferredEngine = rawEngine === 'kokoro' ? 'kokoro' : 'piper';
  return {
    available,
    engine: 'piper',
    reason: available ? null : reason,
    preferredEngine,
    kokoro: {
      modelId: getSetting(db, 'kokoro_model_id', 'onnx-community/Kokoro-82M-v1.1-zh-ONNX'),
      voice: getSetting(db, 'kokoro_voice', 'zm_yunjian'),
    },
  };
}

module.exports = function ttsRoutes(db) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json(statusPayload(db));
  });

  router.post('/speak', authenticate, ttsLimiter, async (req, res) => {
    const text = sanitizeText(req.body?.text);
    if (!text) {
      return res.status(400).json({ error: '请提供非空文本' });
    }

    const st = statusPayload(db);
    if (!st.available) {
      return res.status(503).json({ error: st.reason || '朗读服务不可用' });
    }

    try {
      const wav = await synthToWav(text, {
        bin: config.piperBin,
        modelPath: path.resolve(config.piperModel),
        timeoutMs: 120000,
        lengthScale: config.piperLengthScale,
      });
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(wav);
    } catch (e) {
      console.error('[TTS]', e.message);
      return res.status(500).json({ error: e.message || '朗读合成失败' });
    }
  });

  return router;
};
