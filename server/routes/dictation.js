const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordUsage } = require('../middleware/usageTracker');

module.exports = function dictationRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('student'));

  router.get('/word-lists', (req, res) => {
    const student = db.prepare('SELECT grade, textbook_version FROM students WHERE id = ?').get(req.user.id);
    const grade =
      req.query.grade !== undefined && req.query.grade !== ''
        ? parseInt(req.query.grade, 10)
        : student.grade;
    const textbookVersion = req.query.textbookVersion || student.textbook_version;
    if (Number.isNaN(grade) || grade < 3 || grade > 6) {
      return res.status(400).json({ error: '年级无效' });
    }
    const lists = db.prepare(
      'SELECT id, grade, unit, unit_title FROM word_lists WHERE textbook_version = ? AND grade = ? ORDER BY unit'
    ).all(textbookVersion, grade);
    res.json(lists);
  });

  router.get('/word-lists/all', (req, res) => {
    const student = db.prepare('SELECT textbook_version FROM students WHERE id = ?').get(req.user.id);
    const textbookVersion = req.query.textbookVersion || student.textbook_version;
    const lists = db.prepare(
      'SELECT id, grade, unit, unit_title FROM word_lists WHERE textbook_version = ? ORDER BY grade, unit'
    ).all(textbookVersion);
    res.json(lists);
  });

  router.get('/word-lists/:id/words', (req, res) => {
    const words = db.prepare(
      'SELECT id, word, pinyin, audio_file FROM words WHERE word_list_id = ? ORDER BY sort_order'
    ).all(req.params.id);
    res.json(words);
  });

  router.post('/submit', (req, res) => {
    const { wordListId, results, durationSec } = req.body;
    if (!wordListId || !results?.length) return res.status(400).json({ error: '缺少答题数据' });

    const correct = results.filter(r => r.correct).length;

    db.prepare(
      'INSERT INTO dictation_records (student_id, word_list_id, total_words, correct, duration_sec) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, wordListId, results.length, correct, durationSec || 0);

    const upsertMistake = db.prepare(`
      INSERT INTO mistakes (student_id, word, pinyin, mistake_type, mistake_count, next_review)
      VALUES (?, ?, ?, ?, 1, datetime('now', '+1 day'))
      ON CONFLICT(student_id, word) DO UPDATE SET
        mistake_count = mistake_count + 1,
        mistake_type = excluded.mistake_type,
        last_tested = datetime('now'),
        next_review = datetime('now', '+' || (CASE
          WHEN mistake_count < 2 THEN '1' WHEN mistake_count < 4 THEN '2'
          WHEN mistake_count < 6 THEN '4' ELSE '7' END) || ' day'),
        mastered = 0
    `);

    const markCorrect = db.prepare(`
      UPDATE mistakes SET last_tested = datetime('now'),
        mastered = CASE WHEN mistake_count <= 1 THEN 1 ELSE mastered END
      WHERE student_id = ? AND word = ?
    `);

    const tx = db.transaction(() => {
      for (const r of results) {
        if (!r.correct) {
          upsertMistake.run(req.user.id, r.word, r.pinyin || '', r.mistakeType || 'unknown');
        } else {
          markCorrect.run(req.user.id, r.word);
        }
      }
    });
    tx();

    recordUsage(db, req.user.id, Math.ceil((durationSec || 0) / 60));

    res.json({
      message: '默写完成',
      total: results.length,
      correct,
      accuracy: Math.round((correct / results.length) * 100),
    });
  });

  router.get('/mistakes', (req, res) => {
    const mistakes = db.prepare(
      'SELECT word, pinyin, mistake_type, mistake_count, last_tested, next_review FROM mistakes WHERE student_id = ? AND mastered = 0 ORDER BY mistake_count DESC'
    ).all(req.user.id);
    res.json(mistakes);
  });

  router.get('/mistakes/review', (req, res) => {
    const due = db.prepare(
      "SELECT word, pinyin, mistake_type FROM mistakes WHERE student_id = ? AND mastered = 0 AND next_review <= datetime('now') ORDER BY mistake_count DESC LIMIT 20"
    ).all(req.user.id);
    res.json(due);
  });

  router.get('/history', (req, res) => {
    const records = db.prepare(
      'SELECT dr.*, wl.unit_title FROM dictation_records dr JOIN word_lists wl ON dr.word_list_id = wl.id WHERE dr.student_id = ? ORDER BY dr.created_at DESC LIMIT 50'
    ).all(req.user.id);
    res.json(records);
  });

  return router;
};
