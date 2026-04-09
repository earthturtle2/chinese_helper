const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { normalizeVolume } = require('../utils/volume');
const { toPinyin, extractHanzi } = require('../utils/chinesePinyin');

module.exports = function lessonStudyRoutes(db) {
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
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const grade =
      req.query.grade !== undefined && req.query.grade !== ''
        ? parseInt(req.query.grade, 10)
        : student.grade;
    const textbookVersion = req.query.textbookVersion || student.textbook_version;
    const volume = normalizeVolume(
      req.query.volume !== undefined && req.query.volume !== '' ? req.query.volume : student.textbook_volume
    );
    if (Number.isNaN(grade) || grade < 3 || grade > 6) {
      return res.status(400).json({ error: '年级无效' });
    }
    const texts = db.prepare(
      `SELECT id, grade, volume, unit, title FROM recitation_texts
       WHERE textbook_version = ? AND grade = ? AND volume = ?
       ORDER BY unit, sort_order`
    ).all(textbookVersion, grade, volume);
    res.json(texts);
  });

  router.get('/texts/all', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生' });
    }
    const student = db.prepare('SELECT textbook_version, textbook_volume FROM students WHERE id = ?').get(sid);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const textbookVersion = req.query.textbookVersion || student.textbook_version;
    const volume = normalizeVolume(
      req.query.volume !== undefined && req.query.volume !== '' ? req.query.volume : student.textbook_volume
    );
    const texts = db.prepare(
      `SELECT id, grade, volume, unit, title FROM recitation_texts
       WHERE textbook_version = ? AND volume = ?
       ORDER BY grade, unit, sort_order`
    ).all(textbookVersion, volume);
    res.json(texts);
  });

  router.get('/texts/:id', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生' });
    }
    const text = db.prepare('SELECT * FROM recitation_texts WHERE id = ?').get(req.params.id);
    if (!text) return res.status(404).json({ error: '课文不存在' });
    const words = db
      .prepare(
        `SELECT id, word, pinyin, sort_order FROM student_lesson_words
         WHERE student_id = ? AND recitation_text_id = ? ORDER BY sort_order, id`
      )
      .all(sid, text.id);
    res.json({ ...text, lessonWords: words });
  });

  router.post('/texts/:id/words', (req, res) => {
    const sid = resolveTargetStudentId(req);
    if (sid == null) {
      return res.status(400).json({ error: '请指定学生' });
    }
    const textId = parseInt(req.params.id, 10);
    const text = db.prepare('SELECT id FROM recitation_texts WHERE id = ?').get(textId);
    if (!text) return res.status(404).json({ error: '课文不存在' });
    const { word, sortOrder } = req.body;
    const raw = word != null ? String(word).trim() : '';
    const w = extractHanzi(raw);
    if (!w) return res.status(400).json({ error: '请填写有效的汉字' });
    const dup = db
      .prepare(
        'SELECT id FROM student_lesson_words WHERE student_id = ? AND recitation_text_id = ? AND word = ?'
      )
      .get(sid, textId, w);
    if (dup) return res.status(409).json({ error: '该生词已在本课中' });
    const sort =
      sortOrder != null && !Number.isNaN(parseInt(sortOrder, 10)) ? parseInt(sortOrder, 10) : 0;
    const py = toPinyin(w);
    const info = db
      .prepare(
        `INSERT INTO student_lesson_words (student_id, recitation_text_id, word, pinyin, sort_order)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(sid, textId, w, py, sort);
    res.json({ id: info.lastInsertRowid, message: '已添加', pinyin: py });
  });

  router.delete('/words/:wordId', (req, res) => {
    const wordId = parseInt(req.params.wordId, 10);
    const row = db.prepare('SELECT id, student_id FROM student_lesson_words WHERE id = ?').get(wordId);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (req.user.role === 'student') {
      if (row.student_id !== req.user.id) return res.status(403).json({ error: '无权删除' });
    } else {
      const ok = db.prepare('SELECT id FROM students WHERE id = ? AND parent_id = ?').get(row.student_id, req.user.id);
      if (!ok) return res.status(403).json({ error: '无权删除' });
    }
    db.prepare('DELETE FROM student_lesson_words WHERE id = ?').run(wordId);
    res.json({ message: '已删除' });
  });

  return router;
};
