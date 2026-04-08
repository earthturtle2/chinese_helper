const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');

module.exports = function parentRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('parent'));

  router.get('/children', (req, res) => {
    const children = db.prepare(
      'SELECT id, username, display_name, grade, textbook_version, daily_limit FROM students WHERE parent_id = ?'
    ).all(req.user.id);
    res.json(children);
  });

  router.get('/children/:studentId/overview', (req, res) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ? AND parent_id = ?')
      .get(req.params.studentId, req.user.id);
    if (!student) return res.status(403).json({ error: '无权查看该学生数据' });

    const today = new Date().toISOString().slice(0, 10);
    const usage = db.prepare('SELECT minutes FROM usage_log WHERE student_id = ? AND date = ?')
      .get(student.id, today);

    const recentDictation = db.prepare(
      'SELECT total_words, correct, created_at FROM dictation_records WHERE student_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(student.id);

    const recentRecitation = db.prepare(
      'SELECT text_title, total_score, created_at FROM recitation_records WHERE student_id = ? ORDER BY created_at DESC LIMIT 5'
    ).all(student.id);

    const recentWriting = db.prepare(
      'SELECT topic, phase, word_count, updated_at FROM writing_sessions WHERE student_id = ? ORDER BY updated_at DESC LIMIT 5'
    ).all(student.id);

    const mistakeCount = db.prepare(
      'SELECT COUNT(*) as c FROM mistakes WHERE student_id = ? AND mastered = 0'
    ).get(student.id).c;

    res.json({
      student: { id: student.id, displayName: student.display_name, grade: student.grade },
      todayUsage: usage?.minutes || 0,
      recentDictation,
      recentRecitation,
      recentWriting,
      mistakeCount,
    });
  });

  router.get('/children/:studentId/mistakes', (req, res) => {
    const student = db.prepare('SELECT id FROM students WHERE id = ? AND parent_id = ?')
      .get(req.params.studentId, req.user.id);
    if (!student) return res.status(403).json({ error: '无权查看该学生数据' });

    const mistakes = db.prepare(
      'SELECT word, pinyin, mistake_type, mistake_count, last_tested FROM mistakes WHERE student_id = ? AND mastered = 0 ORDER BY mistake_count DESC'
    ).all(req.params.studentId);
    res.json(mistakes);
  });

  router.get('/children/:studentId/weekly', (req, res) => {
    const student = db.prepare('SELECT id FROM students WHERE id = ? AND parent_id = ?')
      .get(req.params.studentId, req.user.id);
    if (!student) return res.status(403).json({ error: '无权查看该学生数据' });

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const dictation = db.prepare(
      'SELECT total_words, correct, created_at FROM dictation_records WHERE student_id = ? AND created_at >= ? ORDER BY created_at'
    ).all(req.params.studentId, weekAgo);

    const recitation = db.prepare(
      'SELECT text_title, accuracy, fluency, total_score, created_at FROM recitation_records WHERE student_id = ? AND created_at >= ? ORDER BY created_at'
    ).all(req.params.studentId, weekAgo);

    const topMistakes = db.prepare(
      'SELECT word, pinyin, mistake_count FROM mistakes WHERE student_id = ? AND mastered = 0 ORDER BY mistake_count DESC LIMIT 5'
    ).all(req.params.studentId);

    const usage = db.prepare(
      'SELECT date, minutes FROM usage_log WHERE student_id = ? AND date >= ? ORDER BY date'
    ).all(req.params.studentId, weekAgo.slice(0, 10));

    const totalDictation = dictation.reduce((s, r) => s + r.total_words, 0);
    const totalCorrect = dictation.reduce((s, r) => s + r.correct, 0);

    res.json({
      dictation: {
        sessions: dictation.length,
        totalWords: totalDictation,
        accuracy: totalDictation > 0 ? Math.round((totalCorrect / totalDictation) * 100) : 0,
      },
      recitation: {
        sessions: recitation.length,
        avgScore: recitation.length > 0
          ? Math.round(recitation.reduce((s, r) => s + r.total_score, 0) / recitation.length) : 0,
        details: recitation,
      },
      topMistakes,
      usage,
    });
  });

  router.put('/children/:studentId/daily-limit', (req, res) => {
    const { limit } = req.body;
    const student = db.prepare('SELECT id FROM students WHERE id = ? AND parent_id = ?')
      .get(req.params.studentId, req.user.id);
    if (!student) return res.status(403).json({ error: '无权修改该学生设置' });

    const clampedLimit = Math.max(20, Math.min(60, parseInt(limit, 10) || 40));
    db.prepare('UPDATE students SET daily_limit = ? WHERE id = ?').run(clampedLimit, req.params.studentId);
    res.json({ message: `每日使用时长已设置为${clampedLimit}分钟`, limit: clampedLimit });
  });

  return router;
};
