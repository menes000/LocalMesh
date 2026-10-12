import { Router, type Request, type Response } from 'express';
import { allocateId, mutate, state } from './store.js';

export const router = Router();
const now = () => new Date().toISOString();
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const bad = (res: Response, message: string) => res.status(400).json({ error: message });

router.get('/agents', (_req, res) => {
  const cutoff = Date.now() - 30_000;
  res.json(state.agents.map(a => ({ ...a, online: Date.parse(a.lastSeen) > cutoff })));
});

router.post('/agents/heartbeat', async (req, res) => {
  const { id, name, ...extra } = req.body ?? {};
  if (!str(id)) return bad(res, 'id must be a non-empty string');
  const result = await mutate(() => {
    let agent = state.agents.find(a => a.id === id);
    if (!agent) {
      agent = { id, name: str(name) ? name : id, lastSeen: now() };
      state.agents.push(agent);
    } else {
      Object.assign(agent, extra);
      if (str(name)) agent.name = name;
      agent.lastSeen = now();
    }
    return { ...agent, online: true };
  });
  res.json(result);
});

router.get('/notes', (req, res) => {
  const since = Number(req.query.since);
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  res.json(state.notes.filter(n => (!Number.isFinite(since) || n.id > since) && (!from || n.from === from)));
});

router.post('/notes', async (req, res) => {
  const { from, content, ...extra } = req.body ?? {};
  if (!str(from) || !str(content)) return bad(res, 'from and content must be non-empty strings');
  const note = await mutate(() => {
    const value = { ...extra, id: allocateId(), from, content, createdAt: now() };
    state.notes.push(value);
    return value;
  });
  res.status(201).json(note);
});

router.get('/questions', (req, res) => {
  const since = Number(req.query.since);
  const agent = typeof req.query.agent === 'string' ? req.query.agent : undefined;
  const unanswered = req.query.unanswered === 'true';
  res.json(state.questions.filter(q => (!Number.isFinite(since) || q.id > since) &&
    (!agent || q.to === agent || q.to === undefined) && (!unanswered || !q.answer)));
});

router.post('/questions', async (req, res) => {
  const { from, to, question, content, ...extra } = req.body ?? {};
  const text = str(question) ? question : content;
  if (!str(from) || !str(text) || (to !== undefined && !str(to))) return bad(res, 'from, question, and optional to are required');
  const created = await mutate(() => {
    const value = { ...extra, id: allocateId(), from, ...(to ? { to } : {}), question: text, createdAt: now() };
    state.questions.push(value);
    return value;
  });
  res.status(201).json(created);
});

router.post('/questions/:id/answer', async (req, res) => {
  const id = Number(req.params.id);
  const { from, agent, answer } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id < 1) return bad(res, 'question id must be an integer');
  if (!str(answer)) return bad(res, 'answer must be a non-empty string');
  const result = await mutate(() => {
    const question = state.questions.find(q => q.id === id);
    if (!question) return { kind: 'missing' as const };
    if (question.answer !== undefined) return { kind: 'answered' as const, question };
    question.answer = answer;
    question.answeredBy = str(agent) ? agent : (str(from) ? from : undefined);
    question.answeredAt = now();
    return { kind: 'ok' as const, question };
  });
  if (result.kind === 'missing') return res.status(404).json({ error: 'question not found' });
  if (result.kind === 'answered') return res.status(409).json({ error: 'question already answered', question: result.question });
  res.json(result.question);
});

router.get('/state', (_req, res) => res.json({ agents: state.agents, notes: state.notes, questions: state.questions, claims: [] }));

router.use((_req: Request, res: Response) => res.status(404).json({ error: 'not found' }));
