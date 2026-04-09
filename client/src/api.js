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
      window.location.href = pathname.startsWith('/admin') ? '/admin/login' : '/login';
    }
    throw new Error(data.error || '请求失败');
  }
  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  adminLogin: (username, password) => request('/auth/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/me'),

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
  bindStudentParent: (studentId, parentId) => request('/admin/bind', { method: 'POST', body: JSON.stringify({ studentId, parentId }) }),
  getAdminStats: () => request('/admin/stats'),
  getAdminWordLists: () => request('/admin/word-lists'),
  createWordList: (data) => request('/admin/word-lists', { method: 'POST', body: JSON.stringify(data) }),
  getAdminRecitationTexts: () => request('/admin/recitation-texts'),
  createRecitationText: (data) => request('/admin/recitation-texts', { method: 'POST', body: JSON.stringify(data) }),

  getInvitationCodes: () => request('/admin/invitation-codes'),
  createInvitationCode: (data) => request('/admin/invitation-codes', { method: 'POST', body: JSON.stringify(data || {}) }),
  deleteInvitationCode: (id) => request(`/admin/invitation-codes/${id}`, { method: 'DELETE' }),

  // Dictation
  getWordLists: () => request('/dictation/word-lists'),
  getAllWordLists: () => request('/dictation/word-lists/all'),
  getWords: (listId) => request(`/dictation/word-lists/${listId}/words`),
  submitDictation: (data) => request('/dictation/submit', { method: 'POST', body: JSON.stringify(data) }),
  getMistakes: () => request('/dictation/mistakes'),
  getReviewMistakes: () => request('/dictation/mistakes/review'),
  getDictationHistory: () => request('/dictation/history'),

  // Recitation
  getRecitationTexts: () => request('/recitation/texts'),
  getAllRecitationTexts: () => request('/recitation/texts/all'),
  getRecitationText: (id) => request(`/recitation/texts/${id}`),
  submitRecitation: (data) => request('/recitation/submit', { method: 'POST', body: JSON.stringify(data) }),
  getRecitationHistory: () => request('/recitation/history'),
  getRecitationDetail: (id) => request(`/recitation/history/${id}`),

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
