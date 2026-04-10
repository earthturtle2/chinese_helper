const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./db/init');
const { normalizeVolume, isValidVolume } = require('./utils/volume');
const { authenticate, requireRole } = require('./middleware/auth');
const { usageTracker } = require('./middleware/usageTracker');

const db = initDatabase();

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const clientDist = path.join(__dirname, '..', 'client', 'dist');

// API routes before static files so /api/* is never handled by SPA or static assets
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api/admin', require('./routes/admin')(db));
app.use('/api/tts', require('./routes/tts')());

app.use('/api/dictation', authenticate, usageTracker(db), require('./routes/dictation')(db));
app.use('/api/recitation', authenticate, usageTracker(db), require('./routes/recitation')(db));
app.use('/api/lesson-study', authenticate, usageTracker(db), require('./routes/lessonStudy')(db));
app.use('/api/writing', authenticate, usageTracker(db), require('./routes/writing')(db));
app.use('/api/parent', require('./routes/parent')(db));

app.get('/api/me', authenticate, (req, res) => {
  const { id, username, role, grade } = req.user;

  if (role === 'student') {
    const student = db.prepare(
      'SELECT display_name, grade, textbook_version, textbook_volume FROM students WHERE id = ?'
    ).get(id);
    const today = new Date().toISOString().slice(0, 10);
    const usage = db.prepare('SELECT minutes FROM usage_log WHERE student_id = ? AND date = ?').get(id, today);
    const globalLimit = db.prepare("SELECT value FROM settings WHERE key = 'default_daily_limit'").get();
    const studentRow = db.prepare('SELECT daily_limit FROM students WHERE id = ?').get(id);
    const limit = studentRow?.daily_limit ?? parseInt(globalLimit?.value ?? config.defaultDailyLimit, 10);

    return res.json({
      id, username, role,
      displayName: student?.display_name,
      grade: student?.grade,
      textbookVersion: student?.textbook_version,
      textbookVolume: student?.textbook_volume,
      todayUsage: usage?.minutes || 0,
      dailyLimit: limit,
    });
  }

  if (role === 'parent') {
    const children = db.prepare(
      'SELECT id, display_name, grade FROM students WHERE parent_id = ?'
    ).all(id);
    return res.json({ id, username, role, children });
  }

  res.json({ id, username, role });
});

app.put('/api/student/profile', authenticate, requireRole('student'), (req, res) => {
  const { grade, textbookVersion, textbookVolume } = req.body;
  const id = req.user.id;
  if (grade !== undefined && grade !== null && grade !== '') {
    const g = parseInt(grade, 10);
    if (Number.isNaN(g) || g < 3 || g > 6) {
      return res.status(400).json({ error: '年级必须在 3–6 之间' });
    }
    db.prepare('UPDATE students SET grade = ? WHERE id = ?').run(g, id);
  }
  if (textbookVersion !== undefined && textbookVersion !== null && String(textbookVersion).trim() !== '') {
    db.prepare('UPDATE students SET textbook_version = ? WHERE id = ?').run(String(textbookVersion).trim(), id);
  }
  if (textbookVolume !== undefined && textbookVolume !== null && String(textbookVolume).trim() !== '') {
    if (!isValidVolume(textbookVolume)) {
      return res.status(400).json({ error: '分册须为「上册」或「下册」' });
    }
    db.prepare('UPDATE students SET textbook_volume = ? WHERE id = ?').run(normalizeVolume(textbookVolume), id);
  }
  res.json({ message: '已保存' });
});

app.use('/audio', express.static(path.join(__dirname, '..', 'data', 'audio')));

app.use(express.static(clientDist));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`[Server] Chinese Helper running at http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${config.nodeEnv}`);
});
