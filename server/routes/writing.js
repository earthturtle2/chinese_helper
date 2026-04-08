const { Router } = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordUsage } = require('../middleware/usageTracker');
const config = require('../config');

module.exports = function writingRoutes(db) {
  const router = Router();
  router.use(authenticate, requireRole('student'));

  router.get('/topics', (req, res) => {
    const topics = [
      { type: '记事', examples: ['一件难忘的事', '快乐的一天', '第一次做饭', '一次有趣的经历'] },
      { type: '写人', examples: ['我的好朋友', '我最敬佩的人', '我的妈妈', '一个特别的人'] },
      { type: '写景', examples: ['美丽的校园', '家乡的四季', '雨后的景色', '秋天的公园'] },
      { type: '状物', examples: ['我的文具盒', '可爱的小狗', '我喜欢的水果', '校园里的大树'] },
      { type: '想象', examples: ['未来的学校', '假如我会飞', '我和书的故事', '梦中的世界'] },
    ];
    res.json(topics);
  });

  router.post('/sessions', (req, res) => {
    const { topic, topicType } = req.body;
    if (!topic) return res.status(400).json({ error: '请选择或输入作文题目' });

    const info = db.prepare(
      'INSERT INTO writing_sessions (student_id, topic, topic_type) VALUES (?, ?, ?)'
    ).run(req.user.id, topic, topicType || '记事');

    res.json({ id: info.lastInsertRowid, message: '写作会话已创建' });
  });

  router.get('/sessions', (req, res) => {
    const sessions = db.prepare(
      'SELECT id, topic, topic_type, phase, word_count, created_at, updated_at FROM writing_sessions WHERE student_id = ? ORDER BY updated_at DESC LIMIT 20'
    ).all(req.user.id);
    res.json(sessions);
  });

  router.get('/sessions/:id', (req, res) => {
    const session = db.prepare(
      'SELECT * FROM writing_sessions WHERE id = ? AND student_id = ?'
    ).get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: '会话不存在' });
    session.outline_json = JSON.parse(session.outline_json || '{}');
    session.feedback_json = JSON.parse(session.feedback_json || '{}');
    res.json(session);
  });

  router.post('/sessions/:id/inspire', async (req, res) => {
    const session = db.prepare('SELECT * FROM writing_sessions WHERE id = ? AND student_id = ?')
      .get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: '会话不存在' });

    const questions = await generateInspireQuestions(session.topic, session.topic_type, req.user.grade);

    db.prepare("UPDATE writing_sessions SET phase = 'outline', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id);

    res.json({ questions });
  });

  router.put('/sessions/:id/outline', (req, res) => {
    const { outline } = req.body;
    db.prepare(
      "UPDATE writing_sessions SET outline_json = ?, phase = 'draft', updated_at = datetime('now') WHERE id = ? AND student_id = ?"
    ).run(JSON.stringify(outline || {}), req.params.id, req.user.id);
    res.json({ message: '提纲已保存' });
  });

  router.put('/sessions/:id/draft', (req, res) => {
    const { text } = req.body;
    const wordCount = (text || '').replace(/\s/g, '').length;
    db.prepare(
      "UPDATE writing_sessions SET draft_text = ?, word_count = ?, updated_at = datetime('now') WHERE id = ? AND student_id = ?"
    ).run(text || '', wordCount, req.params.id, req.user.id);
    res.json({ message: '草稿已保存', wordCount });
  });

  router.post('/sessions/:id/feedback', async (req, res) => {
    const session = db.prepare('SELECT * FROM writing_sessions WHERE id = ? AND student_id = ?')
      .get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: '会话不存在' });

    const feedback = await analyzeWriting(session.draft_text, session.topic, session.topic_type, req.user.grade);

    db.prepare(
      "UPDATE writing_sessions SET feedback_json = ?, phase = 'review', updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(feedback), req.params.id);

    recordUsage(db, req.user.id, 5);

    res.json(feedback);
  });

  router.post('/vocabulary-suggest', async (req, res) => {
    const { text, context } = req.body;
    const suggestions = await suggestVocabulary(text, context, req.user.grade);
    res.json(suggestions);
  });

  return router;
};

async function generateInspireQuestions(topic, topicType, grade) {
  const templateQuestions = {
    '记事': [
      '这件事发生在什么时候？在哪里？',
      '当时有谁在场？',
      '事情的起因是什么？',
      '过程中最让你印象深刻的细节是什么？',
      '这件事带给你什么感受或启发？',
    ],
    '写人': [
      '你想写的这个人长什么样子？有什么特征？',
      '他/她有什么让你印象深刻的习惯或动作？',
      '你能想起和他/她之间的一件具体的事吗？',
      '他/她说过什么让你记忆深刻的话？',
      '你最欣赏他/她的什么品质？',
    ],
    '写景': [
      '你想描写的是哪个季节或时间段的景色？',
      '站在那里，你首先看到的是什么？',
      '除了眼睛看到的，你还听到、闻到什么？',
      '那里的色彩是怎样的？',
      '这个景色给你什么样的心情？',
    ],
    '状物': [
      '你要写的东西是什么样子的？颜色、形状、大小？',
      '摸上去是什么感觉？',
      '它有什么特别之处？',
      '你和它之间有什么故事？',
      '它为什么对你很重要？',
    ],
    '想象': [
      '你想象的世界和现在有什么不同？',
      '在那个世界里，你在做什么？',
      '会遇到什么有趣的人或事？',
      '最神奇的地方是什么？',
      '这个想象让你有什么感受？',
    ],
  };

  if (templateQuestions[topicType]) {
    return templateQuestions[topicType];
  }

  if (config.deepseek.apiKey) {
    try {
      const response = await callDeepSeek(
        `你是一位温和的小学${grade}年级语文老师。学生要写一篇关于"${topic}"的作文（类型：${topicType}）。
请生成5个引导性问题，帮助学生回忆素材和组织思路。
要求：
1. 问题要具体、生活化，能引发回忆
2. 用"你"来称呼学生
3. 语气温和亲切
4. 不要给出答案示例
只输出5个问题，每行一个，不要编号。`
      );
      return response.split('\n').filter(q => q.trim()).slice(0, 5);
    } catch (e) {
      console.error('[LLM] Failed to generate questions:', e.message);
    }
  }

  return templateQuestions['记事'];
}

async function analyzeWriting(text, topic, topicType, grade) {
  if (!text || text.trim().length < 10) {
    return { suggestions: ['作文内容太少啦，试试多写一些吧！'], score: 0, details: {} };
  }

  const wordCount = text.replace(/\s/g, '').length;
  const feedback = { wordCount, suggestions: [], vocabularyHints: [], score: 0, details: {} };

  const repeatedWords = findRepeatedWords(text);
  if (repeatedWords.length > 0) {
    feedback.suggestions.push(`"${repeatedWords.slice(0, 3).join('""')}"出现了好多次，试试换个说法？`);
    feedback.vocabularyHints = repeatedWords.map(w => ({
      word: w,
      alternatives: getSynonyms(w),
    }));
  }

  const transitionWords = ['然后', '接着', '后来', '之后'];
  let transCount = 0;
  transitionWords.forEach(w => {
    const matches = text.match(new RegExp(w, 'g'));
    if (matches) transCount += matches.length;
  });
  if (transCount > 3) {
    feedback.suggestions.push('连接词用得有点多，试试"正在这时""没想到""令我惊讶的是"等表达方式。');
  }

  const gradeWordTarget = { 3: 250, 4: 300, 5: 350, 6: 400 };
  const target = gradeWordTarget[grade] || 300;
  if (wordCount < target * 0.6) {
    feedback.suggestions.push(`这篇作文还可以再展开哦，${grade}年级的作文一般要写${target}字左右。`);
  }

  if (!text.includes('像') && !text.includes('仿佛') && !text.includes('好像') && !text.includes('如同')) {
    feedback.suggestions.push('试试用一个比喻句，会让文章更生动哦！比如"……像……一样"。');
  }

  if (feedback.suggestions.length === 0) {
    feedback.suggestions.push('写得不错！继续保持这种细致的描写。');
  }

  feedback.score = Math.min(100, Math.max(20, Math.round(
    (wordCount >= target ? 30 : wordCount / target * 30) +
    (transCount <= 3 ? 20 : 10) +
    (repeatedWords.length <= 1 ? 20 : 10) +
    (feedback.suggestions.length <= 2 ? 30 : 20)
  )));

  if (config.deepseek.apiKey) {
    try {
      const llmFeedback = await callDeepSeek(
        `你是一位温和的小学${grade}年级语文老师。请对以下学生作文给出简短的鼓励性反馈。
题目：${topic}（${topicType}）
作文：${text.slice(0, 1000)}

要求：
1. 先肯定优点（1句话）
2. 再给出1-2个具体可操作的改进建议
3. 语气温和鼓励，不要打分
4. 总共不超过100字
绝对不要帮学生写任何内容。`
      );
      feedback.llmFeedback = llmFeedback;
    } catch (e) {
      console.error('[LLM] Failed to analyze writing:', e.message);
    }
  }

  return feedback;
}

async function suggestVocabulary(text, context, grade) {
  const repeated = findRepeatedWords(text);
  return repeated.slice(0, 3).map(w => ({
    word: w,
    alternatives: getSynonyms(w),
  }));
}

function findRepeatedWords(text) {
  const commonAdj = ['高兴', '开心', '美丽', '漂亮', '好看', '大', '小', '好', '很多', '非常'];
  const repeated = [];
  for (const w of commonAdj) {
    const matches = text.match(new RegExp(w, 'g'));
    if (matches && matches.length >= 3) repeated.push(w);
  }
  return repeated;
}

function getSynonyms(word) {
  const synonymMap = {
    '高兴': ['欢喜', '愉快', '兴奋', '喜悦', '开怀'],
    '开心': ['快乐', '欣喜', '乐呵呵', '喜滋滋'],
    '美丽': ['秀丽', '绮丽', '动人', '迷人'],
    '漂亮': ['好看', '美观', '出众', '亮丽'],
    '好看': ['悦目', '耐看', '养眼', '靓丽'],
    '大': ['巨大', '硕大', '庞大', '宏大', '宽阔'],
    '小': ['微小', '细小', '娇小', '袖珍', '小巧'],
    '好': ['优秀', '出色', '棒', '优良', '不错'],
    '很多': ['许多', '众多', '大量', '不少', '数不胜数'],
    '非常': ['十分', '格外', '特别', '极其', '相当'],
  };
  return synonymMap[word] || ['（暂无推荐）'];
}

async function callDeepSeek(prompt) {
  const https = require('https');
  const url = new URL(`${config.deepseek.baseUrl}/v1/chat/completions`);

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || '');
        } catch { reject(new Error('Invalid LLM response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('LLM timeout')); });
    req.write(body);
    req.end();
  });
}
