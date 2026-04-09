const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');
const { normalizeInviteCode, inviteLookupKey, verifyInviteCode } = require('../utils/inviteCode');
const { isParentFeatureEnabled } = require('../utils/settings');

module.exports = function authRoutes(db) {
  const router = Router();

  router.post('/admin/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = req.body.password;
    if (!username || password == null || password === '') {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const user = db.prepare('SELECT id, username, password_hash FROM admins WHERE username = ?').get(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      const token = generateToken({ id: user.id, username: user.username, role: 'admin' });
      return res.json({ token, role: 'admin', username: user.username });
    }

    return res.status(401).json({ error: '用户名或密码错误' });
  });

  router.post('/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = req.body.password;
    if (!username || password == null || password === '') {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    let user = db.prepare(
      'SELECT id, username, display_name, password_hash, grade, textbook_version, textbook_volume FROM students WHERE username = ?'
    ).get(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      const token = generateToken({ id: user.id, username: user.username, role: 'student', grade: user.grade });
      return res.json({
        token,
        role: 'student',
        username: user.username,
        displayName: user.display_name,
        grade: user.grade,
        textbookVersion: user.textbook_version,
        textbookVolume: user.textbook_volume,
      });
    }

    if (isParentFeatureEnabled(db)) {
      user = db.prepare('SELECT id, username, password_hash FROM parents WHERE username = ?').get(username);
      if (user && bcrypt.compareSync(password, user.password_hash)) {
        const children = db.prepare(
          'SELECT id, username, display_name, grade FROM students WHERE parent_id = ?'
        ).all(user.id);
        const token = generateToken({ id: user.id, username: user.username, role: 'parent' });
        return res.json({ token, role: 'parent', username: user.username, children });
      }
    }

    return res.status(401).json({ error: '用户名或密码错误' });
  });

  router.post('/register', (req, res) => {
    const username = String(req.body.username || '').trim();
    const displayName = req.body.displayName != null ? String(req.body.displayName).trim() : '';
    const { password, inviteCode } = req.body;
    if (!username || !password || !inviteCode) {
      return res.status(400).json({ error: '请填写用户名、密码和邀请码' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: '密码至少 8 位' });
    }

    const normalized = normalizeInviteCode(inviteCode);
    if (normalized.length < 8) {
      return res.status(400).json({ error: '邀请码无效' });
    }

    const lookupKey = inviteLookupKey(normalized);
    const row = db.prepare('SELECT * FROM invitation_codes WHERE lookup_key = ?').get(lookupKey);
    if (!row) {
      return res.status(400).json({ error: '邀请码无效' });
    }

    const now = new Date().toISOString();
    if (row.expires_at && row.expires_at < now) {
      return res.status(400).json({ error: '邀请码已过期' });
    }
    if (row.used_count >= row.max_uses) {
      return res.status(400).json({ error: '邀请码已用完' });
    }

    if (!verifyInviteCode(normalized, row.code_hash)) {
      return res.status(400).json({ error: '邀请码无效' });
    }

    const exists = db.prepare('SELECT id FROM students WHERE username = ?').get(username);
    if (exists) return res.status(409).json({ error: '该用户名已存在' });

    const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
    const parentExists = db.prepare('SELECT id FROM parents WHERE username = ?').get(username);
    if (adminExists || parentExists) return res.status(409).json({ error: '该用户名已被其他角色使用' });

    const hash = bcrypt.hashSync(password, 10);

    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO students (username, display_name, password_hash, grade, textbook_version, textbook_volume) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(username, displayName || username, hash, 3, '统编版', '上册');
      db.prepare('UPDATE invitation_codes SET used_count = used_count + 1 WHERE id = ?').run(row.id);
    });
    tx();

    const student = db.prepare(
      'SELECT id, username, display_name, grade, textbook_version, textbook_volume FROM students WHERE username = ?'
    ).get(username);

    const token = generateToken({
      id: student.id,
      username: student.username,
      role: 'student',
      grade: student.grade,
    });

    return res.json({
      token,
      role: 'student',
      username: student.username,
      displayName: student.display_name,
      grade: student.grade,
      textbookVersion: student.textbook_version,
      textbookVolume: student.textbook_volume,
    });
  });

  router.post('/change-password', (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    if (!username || !oldPassword || !newPassword) {
      return res.status(400).json({ error: '请填写所有字段' });
    }

    const tables = ['admins', 'students', 'parents'];
    for (const table of tables) {
      const user = db.prepare(`SELECT id, password_hash FROM ${table} WHERE username = ?`).get(username);
      if (user && bcrypt.compareSync(oldPassword, user.password_hash)) {
        const hash = bcrypt.hashSync(newPassword, 10);
        db.prepare(`UPDATE ${table} SET password_hash = ? WHERE id = ?`).run(hash, user.id);
        return res.json({ message: '密码修改成功' });
      }
    }

    return res.status(401).json({ error: '原密码错误' });
  });

  return router;
};
