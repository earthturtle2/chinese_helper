const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

module.exports = function authRoutes(db) {
  const router = Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    let user = db.prepare('SELECT id, username, password_hash FROM admins WHERE username = ?').get(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      const token = generateToken({ id: user.id, username: user.username, role: 'admin' });
      return res.json({ token, role: 'admin', username: user.username });
    }

    user = db.prepare('SELECT id, username, display_name, password_hash, grade, textbook_version FROM students WHERE username = ?').get(username);
    if (user && bcrypt.compareSync(password, user.password_hash)) {
      const token = generateToken({ id: user.id, username: user.username, role: 'student', grade: user.grade });
      return res.json({
        token, role: 'student',
        username: user.username,
        displayName: user.display_name,
        grade: user.grade,
        textbookVersion: user.textbook_version,
      });
    }

    const parentEnabled = db.prepare("SELECT value FROM settings WHERE key = 'parent_feature_enabled'").get();
    if (parentEnabled?.value === 'true') {
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
