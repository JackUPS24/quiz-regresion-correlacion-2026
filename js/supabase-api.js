(function (root) {
  'use strict';
  function configuration() {
    const cfg = root.QUIZ_CONFIG || {};
    const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
    const key = String(cfg.supabasePublishableKey || '');
    return { url, key, ready: /^https:\/\/.+\.supabase\.co$/.test(url) && key.length > 20 };
  }
  async function request(path, options = {}, token = '') {
    const cfg = configuration();
    if (!cfg.ready) throw new Error('CONFIG_NOT_READY');
    const response = await fetch(cfg.url + path, {
      ...options,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${token || cfg.key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error_description || data?.hint || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data?.code || data?.error || 'HTTP_ERROR';
      throw error;
    }
    return data;
  }
  function rpc(name, body, accessToken = '') {
    return request(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body || {}) }, accessToken);
  }
  function lookupStudent(code) { return rpc('lookup_student_by_code', { p_code: code }); }
  async function signIn(email, password) {
    return request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
  }
  async function signOut(accessToken) {
    try { await request('/auth/v1/logout', { method: 'POST' }, accessToken); } catch (_) { /* session is cleared locally regardless */ }
  }
  root.QuizApi = { configuration, rpc, lookupStudent, signIn, signOut };
})(globalThis);
