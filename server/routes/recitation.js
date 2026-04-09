const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordUsage } = require('../middleware/usageTracker');

module.exports = function recitationRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('student'));

  router.get('/texts', (req, res) => {
    const student = db.prepare('SELECT grade, textbook_version FROM students WHERE id = ?').get(req.user.id);
    const grade =
      req.query.grade !== undefined && req.query.grade !== ''
        ? parseInt(req.query.grade, 10)
        : student.grade;
    const textbookVersion = req.query.textbookVersion || student.textbook_version;
    if (Number.isNaN(grade) || grade < 3 || grade > 6) {
      return res.status(400).json({ error: '年级无效' });
    }
    const texts = db.prepare(
      'SELECT id, grade, unit, title FROM recitation_texts WHERE textbook_version = ? AND grade = ? ORDER BY unit, sort_order'
    ).all(textbookVersion, grade);
    res.json(texts);
  });

  router.get('/texts/all', (req, res) => {
    const student = db.prepare('SELECT textbook_version FROM students WHERE id = ?').get(req.user.id);
    const textbookVersion = req.query.textbookVersion || student.textbook_version;
    const texts = db.prepare(
      'SELECT id, grade, unit, title FROM recitation_texts WHERE textbook_version = ? ORDER BY grade, unit, sort_order'
    ).all(textbookVersion);
    res.json(texts);
  });

  router.get('/texts/:id', (req, res) => {
    const text = db.prepare('SELECT * FROM recitation_texts WHERE id = ?').get(req.params.id);
    if (!text) return res.status(404).json({ error: '课文不存在' });
    res.json(text);
  });

  router.post('/submit', (req, res) => {
    const { textId, recognizedText, durationSec, usedHints } = req.body;
    if (!textId || recognizedText === undefined) return res.status(400).json({ error: '缺少数据' });

    const original = db.prepare('SELECT title, content FROM recitation_texts WHERE id = ?').get(textId);
    if (!original) return res.status(404).json({ error: '课文不存在' });

    const analysis = analyzeRecitation(original.content, recognizedText);

    db.prepare(`
      INSERT INTO recitation_records
        (student_id, text_title, original_text, recognized, accuracy, fluency, completeness, total_score, details_json, duration_sec, used_hints)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, original.title, original.content, recognizedText,
      analysis.accuracy, analysis.fluency, analysis.completeness, analysis.totalScore,
      JSON.stringify(analysis.details), durationSec || 0, usedHints || 0
    );

    recordUsage(db, req.user.id, Math.ceil((durationSec || 0) / 60));

    res.json({
      message: '背诵评估完成',
      ...analysis,
    });
  });

  router.get('/history', (req, res) => {
    const records = db.prepare(
      'SELECT id, text_title, accuracy, fluency, completeness, total_score, duration_sec, used_hints, created_at FROM recitation_records WHERE student_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.user.id);
    res.json(records);
  });

  router.get('/history/:id', (req, res) => {
    const record = db.prepare(
      'SELECT * FROM recitation_records WHERE id = ? AND student_id = ?'
    ).get(req.params.id, req.user.id);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    record.details_json = JSON.parse(record.details_json || '{}');
    res.json(record);
  });

  return router;
};

function analyzeRecitation(original, recognized) {
  const origChars = original.replace(/[，。！？、；：""''（）\s]/g, '');
  const recChars = (recognized || '').replace(/[，。！？、；：""''（）\s]/g, '');

  const origSentences = original.split(/[。！？]/).filter(Boolean);
  const recSentences = (recognized || '').split(/[。！？]/).filter(Boolean);

  let matchedChars = 0;
  const minLen = Math.min(origChars.length, recChars.length);
  for (let i = 0; i < minLen; i++) {
    if (origChars[i] === recChars[i]) matchedChars++;
  }

  const accuracy = origChars.length > 0 ? Math.round((matchedChars / origChars.length) * 100) : 0;
  const completeness = origChars.length > 0
    ? Math.round((Math.min(recChars.length, origChars.length) / origChars.length) * 100) : 0;
  const fluency = recSentences.length > 0
    ? Math.min(100, Math.round((recSentences.length / Math.max(origSentences.length, 1)) * 100)) : 0;

  const totalScore = Math.round(accuracy * 0.6 + fluency * 0.3 + completeness * 0.1);

  const sentenceDetails = origSentences.map((sentence, i) => {
    const recSentence = recSentences[i] || '';
    const s = sentence.replace(/[，、；：\s]/g, '');
    const r = recSentence.replace(/[，、；：\s]/g, '');

    let correct = 0;
    for (let j = 0; j < Math.min(s.length, r.length); j++) {
      if (s[j] === r[j]) correct++;
    }
    const sentenceAccuracy = s.length > 0 ? Math.round((correct / s.length) * 100) : 0;

    let status = 'correct';
    if (!r) status = 'missing';
    else if (sentenceAccuracy < 50) status = 'error';
    else if (sentenceAccuracy < 90) status = 'partial';

    return { original: sentence.trim(), recognized: recSentence.trim(), accuracy: sentenceAccuracy, status };
  });

  return { accuracy, fluency, completeness, totalScore, details: { sentences: sentenceDetails } };
}
