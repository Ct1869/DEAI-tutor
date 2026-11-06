import crypto from 'node:crypto';

const base = process.env.TUTOR_SMOKE_URL || 'http://127.0.0.1:14444';
const secret = process.env.SESSION_SECRET;
if (!secret) throw new Error('Set SESSION_SECRET to the same value as the local test server.');
const payload = `pilot-smoke.${Date.now() + 600_000}`;
const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
const cookie = `qa_session=${payload}.${signature}`;
const request = async (route, options = {}) => {
  const response = await fetch(`${base}${route}`, { ...options, headers: { cookie, ...(options.body ? { 'content-type': 'application/json' } : {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(body)}`);
  return body;
};
const initial = await request('/api/tutor/session');
if (initial.session) throw new Error('Temporary smoke-test learner already has an open session.');
const started = await request('/api/tutor/session', { method: 'POST', body: JSON.stringify({ budgetMinutes: 15 }) });
if (started.activity?.id !== 'v2-diagnostic') throw new Error('Expected first diagnostic instruction.');
const answered = await request('/api/tutor/respond', { method: 'POST', body: JSON.stringify({ sessionId: started.session.id, activityId: started.activity.id, response: 'Heute gehe ich ins Schwimmbad.', assisted: false }) });
if (answered.attempt?.correct !== true || !answered.activity) throw new Error('Answer did not advance the tutor.');
console.log(JSON.stringify({ route: '/tutor', first: started.activity.id, next: answered.activity.id, graded: answered.attempt.grading, limitedMode: answered.limitedMode }));
