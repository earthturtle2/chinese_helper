const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordUsage } = require('../middleware/usageTracker');
const { normalizeVolume, normalizeTextbookVersion } = require('../utils/volume');

module.exports = function recitationRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('student', 'parent'));

  /** 学生：本人；家长：query/body 带 studentId 且须为已绑定子女 */
  function resolveTargetStudentId(req) {
    if (req.user.role === 'student') return req.user.id;
    const raw = req.query.studentId ?? req.body?.studentId;
    if (raw == null || raw === '') return null;
    const sid = parseInt(raw, 10);
    if (Number.isNaN(sid)) return null;
    const row = db.prepare('SELECT id FROM students WHERE id = ? AND parent_id = ?').get(sid, req.user.id);
    return row ? sid : null;
  }

  router.get('/texts', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生（家长请在链接中带上孩子账号）' });
    }
    const student = db.prepare(
      'SELECT grade, textbook_version, textbook_volume FROM students WHERE id = ?'
    ).get(sid);
    const grade =
      req.query.grade !== undefined && req.query.grade !== ''
        ? parseInt(req.query.grade, 10)
        : student.grade;
    const hasQueryTv =
      req.query.textbookVersion !== undefined &&
      req.query.textbookVersion !== null &&
      String(req.query.textbookVersion).trim() !== '';
    const textbookVersion = normalizeTextbookVersion(
      hasQueryTv ? req.query.textbookVersion : student.textbook_version
    );
    const volume = normalizeVolume(
      req.query.volume !== undefined && req.query.volume !== '' ? req.query.volume : student.textbook_volume
    );
    if (Number.isNaN(grade) || grade < 3 || grade > 6) {
      return res.status(400).json({ error: '年级无效' });
    }
    const texts = db.prepare(
      `SELECT id, grade, volume, unit, title FROM recitation_texts
       WHERE trim(textbook_version) = ? AND grade = ? AND trim(volume) = ?
       ORDER BY unit, sort_order`
    ).all(textbookVersion, grade, volume);
    res.json(texts);
  });

  router.get('/texts/all', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生（家长请在链接中带上孩子账号）' });
    }
    const student = db.prepare('SELECT textbook_version, textbook_volume FROM students WHERE id = ?').get(sid);
    const hasQueryTv =
      req.query.textbookVersion !== undefined &&
      req.query.textbookVersion !== null &&
      String(req.query.textbookVersion).trim() !== '';
    const textbookVersion = normalizeTextbookVersion(
      hasQueryTv ? req.query.textbookVersion : student.textbook_version
    );
    const volume = normalizeVolume(
      req.query.volume !== undefined && req.query.volume !== '' ? req.query.volume : student.textbook_volume
    );
    const texts = db.prepare(
      `SELECT id, grade, volume, unit, title FROM recitation_texts
       WHERE trim(textbook_version) = ? AND trim(volume) = ?
       ORDER BY grade, unit, sort_order`
    ).all(textbookVersion, volume);
    res.json(texts);
  });

  router.get('/texts/:id', (req, res) => {
    const text = db.prepare('SELECT * FROM recitation_texts WHERE id = ?').get(req.params.id);
    if (!text) return res.status(404).json({ error: '课文不存在' });
    res.json(text);
  });

  router.post('/submit', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生（家长提交时请带上 studentId）' });
    }

    const { textId, recognizedText, durationSec, usedHints, selectedContent } = req.body;
    if (!textId || recognizedText === undefined) return res.status(400).json({ error: '缺少数据' });

    const original = db.prepare('SELECT title, content FROM recitation_texts WHERE id = ?').get(textId);
    if (!original) return res.status(404).json({ error: '课文不存在' });

    const fullText = String(original.content || '');
    let segment = fullText;
    if (selectedContent != null && String(selectedContent).trim() !== '') {
      segment = String(selectedContent).trim();
      if (!isSegmentOfFullText(fullText, segment)) {
        return res.status(400).json({ error: '背诵内容须为课文中的连续片段' });
      }
    }
    if (segment.replace(/\s/g, '').length < 4) {
      return res.status(400).json({ error: '选段过短，请重新选择或背诵全文' });
    }

    const analysis = analyzeRecitation(segment, recognizedText);
    const normFull = normalizeWs(fullText);
    const normSeg = normalizeWs(segment);
    const isPartial = normSeg.length < normFull.length || normSeg !== normFull;
    const textTitle = isPartial ? `${original.title}（选段）` : original.title;

    db.prepare(`
      INSERT INTO recitation_records
        (student_id, text_title, original_text, recognized, accuracy, fluency, completeness, total_score, details_json, duration_sec, used_hints)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sid, textTitle, segment, recognizedText,
      analysis.accuracy, analysis.fluency, analysis.completeness, analysis.totalScore,
      JSON.stringify(analysis.details), durationSec || 0, usedHints || 0
    );

    recordUsage(db, sid, Math.ceil((durationSec || 0) / 60));

    res.json({
      message: '背诵评估完成',
      ...analysis,
    });
  });

  router.get('/history', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生（家长请在链接中带上孩子账号）' });
    }
    const records = db.prepare(
      'SELECT id, text_title, accuracy, fluency, completeness, total_score, duration_sec, used_hints, created_at FROM recitation_records WHERE student_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(sid);
    res.json(records);
  });

  router.get('/history/:id', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生（家长请在链接中带上孩子账号）' });
    }
    const record = db.prepare(
      'SELECT * FROM recitation_records WHERE id = ? AND student_id = ?'
    ).get(req.params.id, sid);
    if (!record) return res.status(404).json({ error: '记录不存在' });
    record.details_json = JSON.parse(record.details_json || '{}');
    res.json(record);
  });

  return router;
};

function normalizeWs(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function isSegmentOfFullText(full, segment) {
  const f = normalizeWs(full);
  const seg = normalizeWs(segment);
  if (!seg) return false;
  return f.includes(seg);
}

function analyzeRecitation(original, recognized) {
  const origChars = normalizeRecitationChars(original);
  const recChars = normalizeRecitationChars(recognized);

  const origSentences = original.split(/[。！？]/).filter(Boolean);
  const recSentences = (recognized || '').split(/[。！？]/).filter(Boolean);

  const matchedChars = lcsLength(origChars, recChars);

  const accuracy = origChars.length > 0 ? Math.round((matchedChars / origChars.length) * 100) : 0;
  const completeness = origChars.length > 0
    ? Math.round((Math.min(recChars.length, origChars.length) / origChars.length) * 100) : 0;
  const fluency = recSentences.length > 0
    ? Math.min(100, Math.round((recSentences.length / Math.max(origSentences.length, 1)) * 100)) : 0;

  const totalScore = Math.round(accuracy * 0.6 + fluency * 0.3 + completeness * 0.1);

  const sentenceDetails = origSentences.map((sentence, i) => {
    const recSentence = recSentences[i] || '';
    const s = normalizeRecitationChars(sentence);
    const r = normalizeRecitationChars(recSentence);

    const correct = lcsLength(s, r);
    const sentenceAccuracy = s.length > 0 ? Math.round((correct / s.length) * 100) : 0;

    let status = 'correct';
    if (!r) status = 'missing';
    else if (sentenceAccuracy < 50) status = 'error';
    else if (sentenceAccuracy < 90) status = 'partial';

    return { original: sentence.trim(), recognized: recSentence.trim(), accuracy: sentenceAccuracy, status };
  });

  return { accuracy, fluency, completeness, totalScore, details: { sentences: sentenceDetails } };
}

function normalizeRecitationChars(text) {
  return Array.from(String(text || '').replace(/[，。！？、；：""''（）《》【】\[\]\s]/g, ''));
}

function lcsLength(a, b) {
  const xs = Array.isArray(a) ? a : Array.from(String(a || ''));
  const ys = Array.isArray(b) ? b : Array.from(String(b || ''));
  if (xs.length === 0 || ys.length === 0) return 0;
  let prev = new Array(ys.length + 1).fill(0);
  let curr = new Array(ys.length + 1).fill(0);
  for (let i = 1; i <= xs.length; i += 1) {
    for (let j = 1; j <= ys.length; j += 1) {
      curr[j] = xs[i - 1] === ys[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[ys.length];
}
