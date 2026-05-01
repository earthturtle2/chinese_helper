const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordUsage } = require('../middleware/usageTracker');
const { normalizeVolume, normalizeTextbookVersion } = require('../utils/volume');
const { extractHanzi } = require('../utils/chinesePinyin');

module.exports = function dictationRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('student'));

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

  function applyMistakesFromResults(userId, results) {
    const tx = db.transaction(() => {
      for (const r of results) {
        if (!r.correct) {
          upsertMistake.run(userId, r.word, r.pinyin || '', r.mistakeType || 'unknown');
        } else {
          markCorrect.run(userId, r.word);
        }
      }
    });
    tx();
  }

  function normalizeAnswer(value) {
    return extractHanzi(String(value || '').trim());
  }

  function normalizeDurationSec(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 7200);
  }

  function buildCheckedResults(expectedWords, submittedResults) {
    if (!Array.isArray(submittedResults) || submittedResults.length === 0) {
      const err = new Error('缺少答题数据');
      err.status = 400;
      throw err;
    }
    if (submittedResults.length !== expectedWords.length) {
      const err = new Error('答题数量与词表不一致，请重新进入练习');
      err.status = 400;
      throw err;
    }
    return expectedWords.map((expected, i) => {
      const input = normalizeAnswer(submittedResults[i]?.input);
      const correct = input === expected.word;
      return {
        word: expected.word,
        pinyin: expected.pinyin || '',
        input,
        correct,
        mistakeType: correct ? null : 'unknown',
      };
    });
  }

  function summarizeResults(checkedResults) {
    const correct = checkedResults.filter((r) => r.correct).length;
    return {
      total: checkedResults.length,
      correct,
      accuracy: checkedResults.length > 0 ? Math.round((correct / checkedResults.length) * 100) : 0,
    };
  }

  /** 当前学生已添加过生词的课文，供「生词默写」入口选择 */
  router.get('/lesson-texts', (req, res) => {
    const student = db
      .prepare('SELECT grade, textbook_version, textbook_volume FROM students WHERE id = ?')
      .get(req.user.id);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const showAll =
      req.query.all === '1' || req.query.all === 'true' || req.query.showAll === '1';
    const hasQueryTv =
      req.query.textbookVersion !== undefined &&
      req.query.textbookVersion !== null &&
      String(req.query.textbookVersion).trim() !== '';
    const textbookVersion = normalizeTextbookVersion(
      hasQueryTv ? req.query.textbookVersion : student.textbook_version
    );
    const grade =
      req.query.grade !== undefined && req.query.grade !== ''
        ? parseInt(req.query.grade, 10)
        : student.grade;
    const volume = normalizeVolume(
      req.query.volume !== undefined && req.query.volume !== ''
        ? req.query.volume
        : student.textbook_volume
    );
    if (Number.isNaN(grade) || grade < 3 || grade > 6) {
      return res.status(400).json({ error: '年级无效' });
    }
    let rows;
    if (showAll) {
      rows = db
        .prepare(
          `SELECT rt.id, rt.grade, rt.volume, rt.unit, rt.title, COUNT(slw.id) AS word_count
           FROM student_lesson_words slw
           JOIN recitation_texts rt ON rt.id = slw.recitation_text_id
           WHERE slw.student_id = ? AND trim(rt.textbook_version) = ?
           GROUP BY rt.id
           ORDER BY rt.grade, rt.unit, rt.sort_order`
        )
        .all(req.user.id, textbookVersion);
    } else {
      rows = db
        .prepare(
          `SELECT rt.id, rt.grade, rt.volume, rt.unit, rt.title, COUNT(slw.id) AS word_count
           FROM student_lesson_words slw
           JOIN recitation_texts rt ON rt.id = slw.recitation_text_id
           WHERE slw.student_id = ? AND trim(rt.textbook_version) = ? AND rt.grade = ? AND trim(rt.volume) = ?
           GROUP BY rt.id
           ORDER BY rt.unit, rt.sort_order`
        )
        .all(req.user.id, textbookVersion, grade, volume);
    }
    res.json(rows);
  });

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
    const { wordListId, recitationTextId, results, durationSec } = req.body;
    const dur = normalizeDurationSec(durationSec);

    if (recitationTextId) {
      const tid = parseInt(recitationTextId, 10);
      if (Number.isNaN(tid)) return res.status(400).json({ error: '课文无效' });
      const text = db.prepare('SELECT id FROM recitation_texts WHERE id = ?').get(tid);
      if (!text) return res.status(404).json({ error: '课文不存在' });
      const expected = db.prepare(
        `SELECT word, pinyin FROM student_lesson_words
         WHERE student_id = ? AND recitation_text_id = ? ORDER BY sort_order, id`
      ).all(req.user.id, tid);
      if (expected.length === 0) return res.status(400).json({ error: '本课尚未配置默写生词' });

      let checkedResults;
      try {
        checkedResults = buildCheckedResults(expected, results);
      } catch (e) {
        return res.status(e.status || 400).json({ error: e.message || '答题数据无效' });
      }
      const summary = summarizeResults(checkedResults);

      db.prepare(
        `INSERT INTO lesson_dictation_records (student_id, recitation_text_id, total_words, correct, duration_sec)
         VALUES (?, ?, ?, ?, ?)`
      ).run(req.user.id, tid, summary.total, summary.correct, dur);

      applyMistakesFromResults(req.user.id, checkedResults);
      recordUsage(db, req.user.id, Math.ceil(dur / 60));

      return res.json({
        message: '默写完成',
        ...summary,
        results: checkedResults,
      });
    }

    if (!wordListId) return res.status(400).json({ error: '缺少词表或课文' });
    const wid = parseInt(wordListId, 10);
    if (Number.isNaN(wid)) return res.status(400).json({ error: '词表无效' });
    const list = db.prepare('SELECT id FROM word_lists WHERE id = ?').get(wid);
    if (!list) return res.status(404).json({ error: '词表不存在' });
    const expected = db.prepare(
      'SELECT word, pinyin FROM words WHERE word_list_id = ? ORDER BY sort_order, id'
    ).all(wid);
    if (expected.length === 0) return res.status(400).json({ error: '词表为空' });

    let checkedResults;
    try {
      checkedResults = buildCheckedResults(expected, results);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || '答题数据无效' });
    }
    const summary = summarizeResults(checkedResults);

    db.prepare(
      'INSERT INTO dictation_records (student_id, word_list_id, total_words, correct, duration_sec) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user.id, wid, summary.total, summary.correct, dur);

    applyMistakesFromResults(req.user.id, checkedResults);
    recordUsage(db, req.user.id, Math.ceil(dur / 60));

    res.json({
      message: '默写完成',
      ...summary,
      results: checkedResults,
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
