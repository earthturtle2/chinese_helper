const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');
const { normalizeVolume, normalizeTextbookVersion, isValidVolume } = require('../utils/volume');
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

function cleanUsername(value) {
  const username = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    const err = new Error('用户名须为 3-32 位字母、数字、下划线、点或连字符');
    err.status = 400;
    throw err;
  }
  return username;
}

function cleanPassword(value) {
  const password = typeof value === 'string' ? value.trim() : '';
  if (password.length < 8) {
    const err = new Error('密码至少 8 位');
    err.status = 400;
    throw err;
  }
  return password;
}

function cleanGrade(value) {
  const grade = parseInt(value, 10);
  if (Number.isNaN(grade) || grade < 3 || grade > 6) {
    const err = new Error('年级必须在 3–6 之间');
    err.status = 400;
    throw err;
  }
  return grade;
}

function cleanDailyLimit(value) {
  if (value == null || value === '') return null;
  const limit = parseInt(value, 10);
  if (Number.isNaN(limit) || limit < 5 || limit > 240) {
    const err = new Error('每日时长须为 5–240 分钟，或留空');
    err.status = 400;
    throw err;
  }
  return limit;
}

function handleValidationError(res, err) {
  return res.status(err.status || 400).json({ error: err.message || '参数无效' });
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
      SELECT s.id, s.username, s.display_name, s.grade, s.textbook_version, s.textbook_volume, s.daily_limit,
             s.parent_id, p.username as parent_username, s.created_at
      FROM students s LEFT JOIN parents p ON s.parent_id = p.id
      ORDER BY s.grade, s.username
    `).all();
    res.json(students);
  });

  router.post('/students', (req, res) => {
    const { username, displayName, password, grade, textbookVersion, textbookVolume } = req.body;
    let clean;
    try {
      clean = {
        username: cleanUsername(username),
        displayName: String(displayName || username || '').trim(),
        password: cleanPassword(password),
        grade: grade == null || grade === '' ? 3 : cleanGrade(grade),
        textbookVersion: normalizeTextbookVersion(textbookVersion || '统编版') || '统编版',
        textbookVolume: normalizeVolume(textbookVolume),
      };
    } catch (e) {
      return handleValidationError(res, e);
    }

    const exists = db.prepare('SELECT id FROM students WHERE username = ?').get(clean.username);
    if (exists) return res.status(409).json({ error: '该用户名已存在' });

    const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get(clean.username);
    const parentExists = db.prepare('SELECT id FROM parents WHERE username = ?').get(clean.username);
    if (adminExists || parentExists) return res.status(409).json({ error: '该用户名已被其他角色使用' });

    const hash = bcrypt.hashSync(clean.password, 10);
    const info = db.prepare(
      'INSERT INTO students (username, display_name, password_hash, grade, textbook_version, textbook_volume) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      clean.username,
      clean.displayName || clean.username,
      hash,
      clean.grade,
      clean.textbookVersion,
      clean.textbookVolume
    );
    res.json({ id: info.lastInsertRowid, message: '学生账户已创建' });
  });

  router.put('/students/:id', (req, res) => {
    const { displayName, grade, textbookVersion, textbookVolume, dailyLimit, parentId } = req.body;
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: '无效的学生 ID' });
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(studentId);
    if (!student) return res.status(404).json({ error: '学生不存在' });

    const updates = [];
    try {
      if (displayName !== undefined) {
        updates.push(['display_name', String(displayName || '').trim()]);
      }
      if (grade !== undefined) {
        updates.push(['grade', cleanGrade(grade)]);
      }
      if (textbookVersion !== undefined) {
        const tv = normalizeTextbookVersion(textbookVersion);
        if (!tv) throw Object.assign(new Error('教材版本不能为空'), { status: 400 });
        updates.push(['textbook_version', tv]);
      }
      if (textbookVolume !== undefined) {
        if (!isValidVolume(textbookVolume)) {
          throw Object.assign(new Error('分册须为「上册」或「下册」'), { status: 400 });
        }
        updates.push(['textbook_volume', normalizeVolume(textbookVolume)]);
      }
      if (dailyLimit !== undefined) {
        updates.push(['daily_limit', cleanDailyLimit(dailyLimit)]);
      }
      if (parentId !== undefined) {
        const pid = parentId == null || parentId === '' ? null : parseInt(parentId, 10);
        if (pid !== null) {
          if (Number.isNaN(pid)) throw Object.assign(new Error('家长 ID 无效'), { status: 400 });
          const parent = db.prepare('SELECT id FROM parents WHERE id = ?').get(pid);
          if (!parent) throw Object.assign(new Error('家长不存在'), { status: 400 });
        }
        updates.push(['parent_id', pid]);
      }
    } catch (e) {
      return handleValidationError(res, e);
    }

    if (updates.length > 0) {
      const tx = db.transaction(() => {
        for (const [column, value] of updates) {
          db.prepare(`UPDATE students SET ${column} = ? WHERE id = ?`).run(value, studentId);
        }
      });
      tx();
    }
    res.json({ message: '学生信息已更新' });
  });

  router.delete('/students/:id', (req, res) => {
    db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
    res.json({ message: '学生已删除' });
  });

  router.put('/students/:id/reset-password', (req, res) => {
    const raw = req.body.password;
    let password;
    try {
      password = cleanPassword(raw);
    } catch (e) {
      return handleValidationError(res, e);
    }
    const studentId = parseInt(req.params.id, 10);
    if (Number.isNaN(studentId)) return res.status(400).json({ error: '无效的学生 ID' });
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(hash, studentId);
    if (r.changes === 0) return res.status(404).json({ error: '学生不存在' });
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
    let clean;
    try {
      clean = {
        username: cleanUsername(username),
        password: cleanPassword(password),
        phone: String(phone || '').trim(),
      };
    } catch (e) {
      return handleValidationError(res, e);
    }

    const exists = db.prepare('SELECT id FROM parents WHERE username = ?').get(clean.username);
    if (exists) return res.status(409).json({ error: '该用户名已存在' });

    const adminExists = db.prepare('SELECT id FROM admins WHERE username = ?').get(clean.username);
    const studentExists = db.prepare('SELECT id FROM students WHERE username = ?').get(clean.username);
    if (adminExists || studentExists) return res.status(409).json({ error: '该用户名已被其他角色使用' });

    const hash = bcrypt.hashSync(clean.password, 10);
    const info = db.prepare('INSERT INTO parents (username, password_hash, phone) VALUES (?, ?, ?)')
      .run(clean.username, hash, clean.phone);
    res.json({ id: info.lastInsertRowid, message: '家长账户已创建' });
  });

  router.delete('/parents/:id', (req, res) => {
    db.prepare('UPDATE students SET parent_id = NULL WHERE parent_id = ?').run(req.params.id);
    db.prepare('DELETE FROM parents WHERE id = ?').run(req.params.id);
    res.json({ message: '家长已删除' });
  });

  router.put('/parents/:id/reset-password', (req, res) => {
    const raw = req.body.password;
    let password;
    try {
      password = cleanPassword(raw);
    } catch (e) {
      return handleValidationError(res, e);
    }
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
    const sid = parseInt(studentId, 10);
    if (Number.isNaN(sid)) return res.status(400).json({ error: '缺少学生ID' });
    const student = db.prepare('SELECT id FROM students WHERE id = ?').get(sid);
    if (!student) return res.status(404).json({ error: '学生不存在' });
    const pid = parentId == null || parentId === '' ? null : parseInt(parentId, 10);
    if (pid !== null) {
      if (Number.isNaN(pid)) return res.status(400).json({ error: '家长 ID 无效' });
      const parent = db.prepare('SELECT id FROM parents WHERE id = ?').get(pid);
      if (!parent) return res.status(404).json({ error: '家长不存在' });
    }
    db.prepare('UPDATE students SET parent_id = ? WHERE id = ?').run(pid, sid);
    res.json({ message: pid ? '绑定成功' : '解绑成功' });
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
    ).run(textbookVersion || '统编版', grade, unit, unitTitle || '');

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
    const texts = db
      .prepare('SELECT * FROM recitation_texts ORDER BY grade, volume, unit, sort_order')
      .all();
    res.json(texts);
  });

  router.post('/recitation-texts', (req, res) => {
    const { textbookVersion, grade, volume, unit, title, content, sortOrder } = req.body;
    const vol = normalizeVolume(volume);
    const info = db.prepare(
      `INSERT INTO recitation_texts (textbook_version, grade, volume, unit, title, content, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      textbookVersion || '统编版',
      grade,
      vol,
      unit,
      title,
      content,
      sortOrder != null && !Number.isNaN(parseInt(sortOrder, 10)) ? parseInt(sortOrder, 10) : 0
    );
    res.json({ id: info.lastInsertRowid, message: '课文已添加' });
  });

  /** 批量导入：body 为 { items: [...] }，每项字段与单条 POST 相同 */
  router.post('/recitation-texts/batch', (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: '请使用 JSON 提供 items 数组' });
    }
    if (items.length > 500) {
      return res.status(400).json({ error: '单次最多导入 500 条' });
    }

    const insert = db.prepare(
      `INSERT INTO recitation_texts (textbook_version, grade, volume, unit, title, content, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    try {
      const ids = [];
      const tx = db.transaction(() => {
        items.forEach((row, i) => {
          const g = parseInt(row.grade, 10);
          const u = parseInt(row.unit, 10);
          if (Number.isNaN(g) || g < 3 || g > 6) {
            throw new Error(`第 ${i + 1} 条：年级须为 3–6`);
          }
          if (Number.isNaN(u) || u < 1) {
            throw new Error(`第 ${i + 1} 条：单元无效`);
          }
          const title = row.title != null ? String(row.title).trim() : '';
          const content = row.content != null ? String(row.content) : '';
          if (!title) throw new Error(`第 ${i + 1} 条：标题不能为空`);
          if (!content.trim()) throw new Error(`第 ${i + 1} 条：正文不能为空`);

          let sort = row.sortOrder;
          if (sort == null || Number.isNaN(parseInt(sort, 10))) sort = i;
          else sort = parseInt(sort, 10);

          const info = insert.run(
            row.textbookVersion || row.textbook_version || '统编版',
            g,
            normalizeVolume(row.volume),
            u,
            title,
            content,
            sort
          );
          ids.push(info.lastInsertRowid);
        });
      });
      tx();
      res.json({ message: `已导入 ${ids.length} 条`, count: ids.length, ids });
    } catch (e) {
      res.status(400).json({ error: e.message || '导入失败' });
    }
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
