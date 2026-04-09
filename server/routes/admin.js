const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  generatePlainInviteCode,
  normalizeInviteCode,
  inviteLookupKey,
  hashInviteCodeForStorage,
} = require('../utils/inviteCode');

function maskSettings(settings) {
  const out = { ...settings };
  for (const k of Object.keys(out)) {
    if (/_key$/i.test(k) || /_secret$/i.test(k) || /password/i.test(k)) {
      if (out[k]) out[k] = '********';
    }
  }
  return out;
}

module.exports = function adminRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('admin'));

  // --- Settings ---
  router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json(maskSettings(settings));
  });

  router.put('/settings', (req, res) => {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: '缺少 key' });
    if (value === '********') {
      return res.status(400).json({ error: '请填写新值，不能使用占位符' });
    }
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
    const raw = req.body.password;
    const password = typeof raw === 'string' ? raw.trim() : raw;
    if (!password) return res.status(400).json({ error: '密码不能为空' });
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: '无效的学生 ID' });
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hash, studentId);
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

  router.put('/parents/:id/reset-password', (req, res) => {
    const raw = req.body.password;
    const password = typeof raw === 'string' ? raw.trim() : raw;
    if (!password) return res.status(400).json({ error: '密码不能为空' });
    const parentId = parseInt(req.params.id, 10);
    if (Number.isNaN(parentId)) return res.status(400).json({ error: '无效的家长 ID' });
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('UPDATE parents SET password_hash = ? WHERE id = ?').run(hash, parentId);
    if (r.changes === 0) return res.status(404).json({ error: '家长不存在' });
    res.json({ message: '密码已更新' });
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

  // --- Invitation codes (only bcrypt hash + SHA-256 lookup stored) ---
  router.get('/invitation-codes', (req, res) => {
    const rows = db.prepare(`
      SELECT id, note, max_uses, used_count, expires_at, created_at, created_by_admin_id
      FROM invitation_codes ORDER BY created_at DESC
    `).all();
    res.json(rows);
  });

  router.post('/invitation-codes', (req, res) => {
    const { note, maxUses, expiresInDays } = req.body;
    const maxUsesNum = Math.max(1, parseInt(maxUses, 10) || 1);
    let expiresAt = null;
    if (expiresInDays != null && expiresInDays !== '') {
      const d = parseInt(expiresInDays, 10);
      if (!Number.isNaN(d) && d > 0) {
        const t = new Date();
        t.setDate(t.getDate() + d);
        expiresAt = t.toISOString();
      }
    }

    let plain;
    let lookupKey;
    let codeHash;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      plain = generatePlainInviteCode();
      const normalized = normalizeInviteCode(plain);
      lookupKey = inviteLookupKey(normalized);
      const clash = db.prepare('SELECT id FROM invitation_codes WHERE lookup_key = ?').get(lookupKey);
      if (!clash) {
        codeHash = hashInviteCodeForStorage(normalized);
        break;
      }
    }
    if (!codeHash) return res.status(500).json({ error: '无法生成唯一邀请码，请重试' });

    const info = db.prepare(`
      INSERT INTO invitation_codes (lookup_key, code_hash, note, max_uses, created_by_admin_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(lookupKey, codeHash, note || '', maxUsesNum, req.user.id, expiresAt);

    res.json({
      id: info.lastInsertRowid,
      code: plain,
      message: '邀请码仅显示一次，请妥善保存',
    });
  });

  router.delete('/invitation-codes/:id', (req, res) => {
    const r = db.prepare('DELETE FROM invitation_codes WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: '记录不存在' });
    res.json({ message: '已删除' });
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
