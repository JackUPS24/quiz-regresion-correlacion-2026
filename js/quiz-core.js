(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QuizCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORE_KEY = 'quiz_regresion_correlacion_v02_active';
  function normalizeName(value) { return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' '); }
  function normalizeCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{3})(.{4})(.{4})(.{0,4}).*$/, (_, a, b, c, d) => [a,b,c,d].filter(Boolean).join('-')); }
  function remainingSeconds(deadlineIso, nowMs = Date.now()) { return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - nowMs) / 1000)); }
  function formatClock(seconds) { const safe = Math.max(0, Number(seconds) || 0); return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`; }
  function isAnswered(value) { return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== ''; }
  function canonicalAnswer(value) { return Array.isArray(value) ? [...value].map(Number).sort((a,b) => a-b) : value; }
  function answersEqual(question, response) { if (question.type === 'numeric') { if (!isAnswered(response)) return false; const number = Number(String(response).replace(',', '.')); return Number.isFinite(number) && Math.abs(number - Number(question.answer)) <= Number(question.tolerance || 0); } if (question.type === 'multi') return JSON.stringify(canonicalAnswer(response || [])) === JSON.stringify(canonicalAnswer(question.answer || [])); return Number(response) === Number(question.answer); }
  function scoreAttempt(questions, responses) { const detail = questions.map(q => ({ id: q.id, topic: q.topic, correct: answersEqual(q, responses[q.id]) })); const points = questions.length ? 100 / questions.length : 0; return { score: Math.round(detail.filter(x => x.correct).length * points * 100) / 100, detail }; }
  function createDraft(serverAttempt) { return { schema: 2, attemptId: serverAttempt.attempt_id, attemptToken: serverAttempt.attempt_token, resumeCode: serverAttempt.resume_code || '', attemptNo: serverAttempt.attempt_no, studentName: serverAttempt.student_name, startedAt: serverAttempt.started_at, deadlineAt: serverAttempt.deadline_at, serverOffsetMs: Number.isFinite(Date.parse(serverAttempt.server_now || serverAttempt.started_at)) ? Date.parse(serverAttempt.server_now || serverAttempt.started_at) - Date.now() : 0, questions: serverAttempt.questions, responses: serverAttempt.responses || {}, index: Number.isInteger(serverAttempt.resume_index) ? serverAttempt.resume_index : 0, submitPending: false, finished: false, lastSavedAt: new Date().toISOString() }; }
  function saveDraft(storage, draft) { draft.lastSavedAt = new Date().toISOString(); storage.setItem(STORE_KEY, JSON.stringify(draft)); return draft; }
  function loadDraft(storage) { try { const value = JSON.parse(storage.getItem(STORE_KEY)); return value && value.schema === 2 && value.attemptToken ? value : null; } catch (_) { return null; } }
  function clearDraft(storage) { storage.removeItem(STORE_KEY); }
  function csvCell(value) { const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value); return `"${text.replaceAll('"', '""')}"`; }
  return { STORE_KEY, normalizeName, normalizeCode, remainingSeconds, formatClock, isAnswered, answersEqual, scoreAttempt, createDraft, saveDraft, loadDraft, clearDraft, csvCell };
});