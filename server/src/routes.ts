import { Router, type Request, type Response } from 'express';
import { allocateId, mutate, state } from './store.js';

export const router = Router();
const now = () => new Date().toISOString();
const str = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const bad = (res: Response, message: string) => res.status(400).json({ error: message });
const failed = (res: Response, error: unknown) => {
  console.error('Request failed:', error);
  return res.status(500).json({ error: 'internal server error' });
};
const parseId = (value: string): number | undefined => {
  if (!/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};
const onlineMs = 30_000;
const isOnline = (lastSeen: string) => Date.now() - Date.parse(lastSeen) < onlineMs;

const agentList = () => state.agents.map(agent => ({
  agent: agent.agent,
  layer: agent.layer,
  lastSeen: agent.lastSeen,
  online: isOnline(agent.lastSeen),
  ...(agent.client === undefined ? {} : { client: agent.client }),
}));

const questionDetail = (question: (typeof state.questions)[number]) => ({
  id: question.id,
  ts: question.ts,
  from: question.from,
  ...(question.to === undefined ? {} : { to: question.to }),
  question: question.question,
  ...(question.answer === undefined ? {} : { answer: question.answer }),
  ...(question.answeredBy === undefined ? {} : { answeredBy: question.answeredBy }),
  ...(question.answeredAt === undefined ? {} : { answeredAt: question.answeredAt }),
});

router.get('/agents', (_req, res) => res.json(agentList()));

router.post('/agents/heartbeat', async (req, res) => {
  try {
    const { agent, layer = '', session, client } = req.body ?? {};
    if (!str(agent) || typeof layer !== 'string' || (session !== undefined && !str(session)) ||
      (client !== undefined && !str(client))) {
      return bad(res, 'agent must be a non-empty string, layer a string, and session/client non-empty strings when provided');
    }
    // One running session per name: while the current holder is online, a
    // heartbeat from any other session (or a legacy client without one) is refused.
    const result = await mutate(() => {
      const current = state.agents.find(item => item.agent === agent.trim());
      if (current && isOnline(current.lastSeen) && current.session !== session) return 'taken' as const;
      const value = {
        agent: agent.trim(),
        layer,
        lastSeen: now(),
        // Keep a known client when a heartbeat arrives before the MCP handshake told us.
        ...(client === undefined ? {} : { client: client.trim() }),
        ...(session === undefined ? {} : { session }),
      };
      if (current) Object.assign(current, value, session === undefined ? { session: undefined } : {});
      else state.agents.push(value);
      return 'ok' as const;
    });
    if (result === 'taken') {
      return res.status(409).json({ error: `agent name "${agent.trim()}" is already used by another running session` });
    }
    return res.json({ ok: true });
  } catch (error) {
    return failed(res, error);
  }
});

router.get('/questions', (req, res) => {
  const forAgent = typeof req.query.for === 'string' ? req.query.for.trim() : '';
  if (!forAgent) return bad(res, 'for is required');
  const unanswered = req.query.unanswered === 'true';
  const questions = state.questions
    .filter(question => question.from !== forAgent)
    .filter(question => question.to === undefined || question.to === forAgent)
    .filter(question => !unanswered || question.answer === undefined)
    .map(question => ({
      id: question.id,
      ts: question.ts,
      from: question.from,
      ...(question.to === undefined ? {} : { to: question.to }),
      question: question.question,
    }));
  return res.json(questions);
});

router.post('/questions', async (req, res) => {
  try {
    const { from, to, question } = req.body ?? {};
    if (!str(from) || !str(question) || (to !== undefined && !str(to))) {
      return bad(res, 'from and question are required; to must be a non-empty string when provided');
    }
    const created = await mutate(() => {
      const value = {
        id: allocateId(),
        ts: now(),
        from: from.trim(),
        ...(to === undefined ? {} : { to: to.trim() }),
        question,
      };
      state.questions.push(value);
      return { id: value.id, ts: value.ts };
    });
    return res.status(201).json(created);
  } catch (error) {
    return failed(res, error);
  }
});

router.get('/questions/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (id === undefined) return bad(res, 'question id must be a positive integer');
  const question = state.questions.find(item => item.id === id);
  if (!question) return res.status(404).json({ error: 'question not found' });
  return res.json(questionDetail(question));
});

router.post('/questions/:id/answer', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { from, answer } = req.body ?? {};
    if (id === undefined) return bad(res, 'question id must be a positive integer');
    if (!str(from) || !str(answer)) return bad(res, 'from and answer must be non-empty strings');
    const result = await mutate(() => {
      const question = state.questions.find(item => item.id === id);
      if (!question) return 'missing' as const;
      if (question.answer !== undefined) return 'answered' as const;
      question.answer = answer;
      question.answeredBy = from.trim();
      question.answeredAt = now();
      return 'answered-now' as const;
    });
    if (result === 'missing') return res.status(404).json({ error: 'question not found' });
    if (result === 'answered') return res.status(200).json({ ok: false, reason: 'already answered' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return failed(res, error);
  }
});

router.get('/state', (_req, res) => res.json({
  agents: agentList(),
  questions: state.questions.map(questionDetail),
  claims: [],
}));

router.use((_req: Request, res: Response) => res.status(404).json({ error: 'not found' }));
