/** Base URL for API (same-origin `/api` or full URL from build, e.g. `https://host.com/api`). */
const RAW_BASE = import.meta.env.VITE_API_BASE_URL;
const BASE =
  typeof RAW_BASE === 'string' && RAW_BASE.trim() !== ''
    ? RAW_BASE.replace(/\/$/, '')
    : '/api';

function getToken() {
  return localStorage.getItem('token');
}

function parseJsonBody(text, url) {
  const trimmed = (text || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const hint =
      trimmed.startsWith('<')
        ? '（常见原因：请求到了前端页面而非 JSON 接口，请检查 Nginx 是否把 /api 代理到 Node，或设置 VITE_API_BASE_URL 构建前端。）'
        : '';
    throw new Error(
      `无法解析服务器响应${hint} 请求：${url}`
    );
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = parseJsonBody(text, url);
  } catch (e) {
    if (!res.ok && res.status === 0) {
      throw new Error('网络错误，请检查网络或后端是否已启动');
    }
    throw e;
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const pathname = typeof window !== 'undefined' ? window.location.pathname || '' : '';
      window.location.href = pathname.startsWith('/admin') ? '/login?admin=1' : '/login';
    }
    throw new Error(data.error || '请求失败');
  }
  return data;
}

function studyQuery(params) {
  if (!params) return '';
  const q = new URLSearchParams();
  if (params.grade != null && params.grade !== '') q.set('grade', String(params.grade));
  if (params.textbookVersion) q.set('textbookVersion', params.textbookVersion);
  if (params.textbookVolume) q.set('volume', params.textbookVolume);
  if (params.studentId != null && params.studentId !== '') q.set('studentId', String(params.studentId));
  if (params.all) q.set('all', '1');
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  adminLogin: (username, password) => request('/auth/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/me'),
  updateStudentProfile: (body) => request('/student/profile', { method: 'PUT', body: JSON.stringify(body) }),

  // Admin
  getSettings: () => request('/admin/settings'),
  updateSetting: (key, value) => request('/admin/settings', { method: 'PUT', body: JSON.stringify({ key, value }) }),
  getStudents: () => request('/admin/students'),
  createStudent: (data) => request('/admin/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (id, data) => request(`/admin/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (id) => request(`/admin/students/${id}`, { method: 'DELETE' }),
  resetStudentPassword: (id, password) => request(`/admin/students/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  getParents: () => request('/admin/parents'),
  createParent: (data) => request('/admin/parents', { method: 'POST', body: JSON.stringify(data) }),
  deleteParent: (id) => request(`/admin/parents/${id}`, { method: 'DELETE' }),
  resetParentPassword: (id, password) => request(`/admin/parents/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  bindStudentParent: (studentId, parentId) => request('/admin/bind', { method: 'POST', body: JSON.stringify({ studentId, parentId }) }),
  getAdminStats: () => request('/admin/stats'),
  getAdminWordLists: () => request('/admin/word-lists'),
  createWordList: (data) => request('/admin/word-lists', { method: 'POST', body: JSON.stringify(data) }),
  getAdminRecitationTexts: () => request('/admin/recitation-texts'),
  createRecitationText: (data) => request('/admin/recitation-texts', { method: 'POST', body: JSON.stringify(data) }),
  importRecitationTextsBatch: (items) =>
    request('/admin/recitation-texts/batch', { method: 'POST', body: JSON.stringify({ items }) }),

  getInvitationCodes: () => request('/admin/invitation-codes'),
  createInvitationCode: (data) => request('/admin/invitation-codes', { method: 'POST', body: JSON.stringify(data || {}) }),
  deleteInvitationCode: (id) => request(`/admin/invitation-codes/${id}`, { method: 'DELETE' }),

  // Dictation
  getWordLists: (params) => request(`/dictation/word-lists${studyQuery(params)}`),
  getAllWordLists: (params) => request(`/dictation/word-lists/all${studyQuery(params)}`),
  /** 已在课文学习中添加过生词的课文列表（用于生词默写入口） */
  getLessonDictationTexts: (params) => request(`/dictation/lesson-texts${studyQuery(params)}`),
  getWords: (listId) => request(`/dictation/word-lists/${listId}/words`),
  submitDictation: (data) => request('/dictation/submit', { method: 'POST', body: JSON.stringify(data) }),
  getMistakes: () => request('/dictation/mistakes'),
  getReviewMistakes: () => request('/dictation/mistakes/review'),
  getDictationHistory: () => request('/dictation/history'),

  // Recitation
  getRecitationTexts: (params) => request(`/recitation/texts${studyQuery(params)}`),
  getAllRecitationTexts: (params) => request(`/recitation/texts/all${studyQuery(params)}`),
  getRecitationText: (id) => request(`/recitation/texts/${id}`),
  submitRecitation: (data) => request('/recitation/submit', { method: 'POST', body: JSON.stringify(data) }),
  getRecitationHistory: (params) => request(`/recitation/history${studyQuery(params)}`),
  getRecitationDetail: (id, params) => request(`/recitation/history/${id}${studyQuery(params || {})}`),

  // Lesson study（学生本人；家长代子女需在 params / body 中带 studentId）
  getLessonStudyTexts: (params) => request(`/lesson-study/texts${studyQuery(params)}`),
  getAllLessonStudyTexts: (params) => request(`/lesson-study/texts/all${studyQuery(params)}`),
  getLessonStudyText: (id, params) => request(`/lesson-study/texts/${id}${studyQuery(params || {})}`),
  addLessonWord: (textId, data) =>
    request(`/lesson-study/texts/${textId}/words`, { method: 'POST', body: JSON.stringify(data) }),
  deleteLessonWord: (wordId) => request(`/lesson-study/words/${wordId}`, { method: 'DELETE' }),

  // Writing
  getTopics: () => request('/writing/topics'),
  createWritingSession: (data) => request('/writing/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getWritingSessions: () => request('/writing/sessions'),
  getWritingSession: (id) => request(`/writing/sessions/${id}`),
  inspireSession: (id) => request(`/writing/sessions/${id}/inspire`, { method: 'POST' }),
  saveOutline: (id, outline) => request(`/writing/sessions/${id}/outline`, { method: 'PUT', body: JSON.stringify({ outline }) }),
  saveDraft: (id, text) => request(`/writing/sessions/${id}/draft`, { method: 'PUT', body: JSON.stringify({ text }) }),
  getFeedback: (id) => request(`/writing/sessions/${id}/feedback`, { method: 'POST' }),
  suggestVocabulary: (text, context) => request('/writing/vocabulary-suggest', { method: 'POST', body: JSON.stringify({ text, context }) }),

  // Parent
  getChildren: () => request('/parent/children'),
  getChildOverview: (studentId) => request(`/parent/children/${studentId}/overview`),
  getChildMistakes: (studentId) => request(`/parent/children/${studentId}/mistakes`),
  getChildWeekly: (studentId) => request(`/parent/children/${studentId}/weekly`),
  setChildDailyLimit: (studentId, limit) => request(`/parent/children/${studentId}/daily-limit`, { method: 'PUT', body: JSON.stringify({ limit }) }),
};
