const config = require('../config');

function usageTracker(db) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== 'student') return next();

    const studentId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const row = db.prepare('SELECT minutes FROM usage_log WHERE student_id = ? AND date = ?').get(studentId, today);
    const used = row ? row.minutes : 0;

    const student = db.prepare('SELECT daily_limit FROM students WHERE id = ?').get(studentId);
    const globalLimit = db.prepare("SELECT value FROM settings WHERE key = 'default_daily_limit'").get();
    const limit = student?.daily_limit ?? parseInt(globalLimit?.value ?? config.defaultDailyLimit, 10);

    /** 仅记录用量与上限，供前端「已达建议时长」提醒；不拦截请求，学生可继续学习 */
    req.usageInfo = { used, limit };
    next();
  };
}

function recordUsage(db, studentId, minutes) {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    INSERT INTO usage_log (student_id, date, minutes) VALUES (?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET minutes = minutes + ?
  `).run(studentId, today, minutes, minutes);
}

module.exports = { usageTracker, recordUsage };
