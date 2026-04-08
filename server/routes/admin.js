const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');

module.exports = function adminRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('admin'));

  // --- Settings ---
  router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  });

  router.put('/settings', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: '缺少 key' });
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
      .run(key, String(value), String(value));
    res.json({ message: '设置已更新' });
  });

  // --- Students ---
  router.get('/students', (req, res) => {
    const students = db.prepare(`
      SELECT s.id, s.username, s.display_name, s.grade, s.textbook_version, s.daily_limit,
             s.parent_id, p.username as parent_username, s.created_at
      FROM students s LEFT JOIN parents p ON s.parent_id = p.id
      ORDER BY s.grade, s.username
    `).all();
    res.json(students);
  });

  router.post('/students', (req, res) => {
    const { username, displayName, password, grade, textbookVersion } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    const exists = db.prepare('SELECT id FROM students WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: '该用户名已存在' });

    const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
    const parentExists = db.prepare('SELECT id FROM parents WHERE username = ?').get(username);
    if (adminExists || parentExists) return res.status(409).json({ error: '该用户名已被其他角色使用' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(
      'INSERT INTO students (username, display_name, password_hash, grade, textbook_version) VALUES (?, ?, ?, ?, ?)'
    ).run(username, displayName || username, hash, grade || 3, textbookVersion || '人教版');
    res.json({ id: info.lastInsertRowid, message: '学生账户已创建' });
  });

  router.put('/students/:id', (req, res) => {
    const { displayName, grade, textbookVersion, dailyLimit, parentId } = req.body;
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(req.params.id);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    if (displayName !== undefined)
      db.prepare('UPDATE students SET display_name = ? WHERE id = ?').run(displayName, req.params.id);
    if (grade !== undefined)
      db.prepare('UPDATE students SET grade = ? WHERE id = ?').run(grade, req.params.id);
    if (textbookVersion !== undefined)
      db.prepare('UPDATE students SET textbook_version = ? WHERE id = ?').run(textbookVersion, req.params.id);
    if (dailyLimit !== undefined)
      db.prepare('UPDATE students SET daily_limit = ? WHERE id = ?').run(dailyLimit, req.params.id);
    if (parentId !== undefined)
      db.prepare('UPDATE students SET parent_id = ? WHERE id = ?').run(parentId || null, req.params.id);

    res.json({ message: '学生信息已更新' });
  });

  router.delete('/students/:id', (req, res) => {
    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    res.json({ message: '学生已删除' });
  });

  router.put('/students/:id/reset-password', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: '密码不能为空' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ message: '密码已重置' });
  });

  // --- Parents ---
  router.get('/parents', (req, res) => {
    const parents = db.prepare(`
      SELECT p.id, p.username, p.phone, p.created_at,
             GROUP_CONCAT(s.display_name) as children_names
      FROM parents p LEFT JOIN students s ON s.parent_id = p.id
      GROUP BY p.id ORDER BY p.username
    `).all();
    res.json(parents);
  });

  router.post('/parents', (req, res) => {
    const { username, password, phone } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

    const exists = db.prepare('SELECT id FROM parents WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: '该用户名已存在' });

    const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
    const studentExists = db.prepare('SELECT id FROM students WHERE username = ?').get(username);
    if (adminExists || studentExists) return res.status(409).json({ error: '该用户名已被其他角色使用' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO parents (username, password_hash, phone) VALUES (?, ?, ?)')
      .run(username, hash, phone || '');
    res.json({ id: info.lastInsertRowid, message: '家长账户已创建' });
  });

  router.delete('/parents/:id', (req, res) => {
    db.prepare('UPDATE students SET parent_id = NULL WHERE parent_id = ?').run(req.params.id);
    db.prepare('DELETE FROM parents WHERE id = ?').run(req.params.id);
    res.json({ message: '家长已删除' });
  });

  // --- Bind student to parent ---
  router.post('/bind', (req, res) => {
    const { studentId, parentId } = req.body;
    if (!studentId) return res.status(400).json({ error: '缺少学生ID' });
    db.prepare('UPDATE students SET parent_id = ? WHERE id = ?').run(parentId || null, studentId);
    res.json({ message: parentId ? '绑定成功' : '解绑成功' });
  });

  // --- Word list management ---
  router.get('/word-lists', (req, res) => {
    const lists = db.prepare('SELECT * FROM word_lists ORDER BY grade, unit').all();
    res.json(lists);
  });

  router.post('/word-lists', (req, res) => {
    const { textbookVersion, grade, unit, unitTitle, words } = req.body;
    const info = db.prepare(
      'INSERT INTO word_lists (textbook_version, grade, unit, unit_title) VALUES (?, ?, ?, ?)'
    ).run(textbookVersion || '人教版', grade, unit, unitTitle || '');

    if (words?.length) {
      const insert = db.prepare('INSERT INTO words (word_list_id, word, pinyin, sort_order) VALUES (?, ?, ?, ?)');
      const tx = db.transaction(() => {
        words.forEach((w, i) => insert.run(info.lastInsertRowid, w.word, w.pinyin || '', i));
      });
      tx();
    }
    res.json({ id: info.lastInsertRowid, message: '词表已创建' });
  });

  // --- Recitation text management ---
  router.get('/recitation-texts', (req, res) => {
    const texts = db.prepare('SELECT * FROM recitation_texts ORDER BY grade, unit, sort_order').all();
    res.json(texts);
  });

  router.post('/recitation-texts', (req, res) => {
    const { textbookVersion, grade, unit, title, content } = req.body;
    const info = db.prepare(
      'INSERT INTO recitation_texts (textbook_version, grade, unit, title, content) VALUES (?, ?, ?, ?, ?)'
    ).run(textbookVersion || '人教版', grade, unit, title, content);
    res.json({ id: info.lastInsertRowid, message: '课文已添加' });
  });

  // --- Dashboard stats ---
  router.get('/stats', (req, res) => {
    const studentCount = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
    const parentCount = db.prepare('SELECT COUNT(*) as c FROM parents').get().c;
    const dictationCount = db.prepare('SELECT COUNT(*) as c FROM dictation_records').get().c;
    const recitationCount = db.prepare('SELECT COUNT(*) as c FROM recitation_records').get().c;
    const writingCount = db.prepare('SELECT COUNT(*) as c FROM writing_sessions').get().c;
    res.json({ studentCount, parentCount, dictationCount, recitationCount, writingCount });
  });

  return router;
};
