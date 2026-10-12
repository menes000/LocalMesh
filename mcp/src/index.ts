import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const agent = process.env.LOCALMESH_AGENT?.trim();
if (!agent) {
  console.error('LOCALMESH_AGENT must be set to this agent\'s stable identity.');
  process.exit(1);
}

const layer = process.env.LOCALMESH_LAYER ?? '';
const baseUrl = (process.env.LOCALMESH_URL || 'http://127.0.0.1:4777').replace(/\/+$/, '');
const pollIntervalMs = 1_000;
const heartbeatIntervalMs = 12_000;

type Note = { id: number; ts: string; agent: string; text: string; tags: string[] };
type Question = { id: number; ts: string; from: string; to?: string; question: string };

function result(value: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) };
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot reach LocalMesh at ${baseUrl}: ${detail}`);
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'error' in data
      ? String(data.error) : text || response.statusText;
    throw new Error(`LocalMesh returned HTTP ${response.status}: ${detail}`);
  }
  return data as T;
}

function query(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.size ? `?${params.toString()}` : '';
}

async function callTool(action: () => Promise<unknown>) {
  try {
    return result(await action());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return result({ error: message }, true);
  }
}

const server = new McpServer({ name: 'localmesh', version: '1.0.0' });

server.registerTool('heartbeat', {
  description: 'Refresh this agent\'s presence on LocalMesh.',
  inputSchema: { layer: z.string().optional() },
}, ({ layer: requestedLayer }) => callTool(() => request('POST', '/api/agents/heartbeat', {
  agent,
  layer: requestedLayer ?? layer,
})));

server.registerTool('list_agents', {
  description: 'List agents registered on LocalMesh.',
  inputSchema: {},
}, () => callTool(() => request('GET', '/api/agents')));

server.registerTool('post_note', {
  description: 'Post a note from this agent.',
  inputSchema: { text: z.string().min(1), tags: z.array(z.string()).optional() },
}, ({ text, tags }) => callTool(() => request('POST', '/api/notes', {
  agent,
  text,
  ...(tags === undefined ? {} : { tags }),
})));

server.registerTool('get_notes', {
  description: 'Get notes newer than an optional ID, excluding this agent by default.',
  inputSchema: {
    since: z.number().int().nonnegative().optional(),
    exclude: z.string().optional(),
  },
}, ({ since, exclude }) => callTool(() => request('GET', `/api/notes${query({
  since,
  exclude: exclude ?? agent,
})}`)));

server.registerTool('ask_question', {
  description: 'Ask a question as this agent, optionally addressed to another agent.',
  inputSchema: { question: z.string().min(1), to: z.string().min(1).optional() },
}, ({ question, to }) => callTool(() => request('POST', '/api/questions', {
  from: agent,
  ...(to === undefined ? {} : { to }),
  question,
})));

server.registerTool('get_questions', {
  description: 'List questions addressed to this agent or to any agent.',
  inputSchema: { unanswered: z.boolean().optional() },
}, ({ unanswered }) => callTool(() => request('GET', `/api/questions${query({
  for: agent,
  unanswered: unanswered ? true : undefined,
})}`)));

server.registerTool('get_question', {
  description: 'Get a question and its answer by ID.',
  inputSchema: { id: z.number().int().positive() },
}, ({ id }) => callTool(() => request('GET', `/api/questions/${id}`)));

server.registerTool('answer_question', {
  description: 'Answer a question as this agent.',
  inputSchema: { id: z.number().int().positive(), answer: z.string().min(1) },
}, ({ id, answer }) => callTool(() => request('POST', `/api/questions/${id}/answer`, {
  from: agent,
  answer,
})));

server.registerTool('get_state', {
  description: 'Get the current LocalMesh state snapshot.',
  inputSchema: {},
}, () => callTool(() => request('GET', '/api/state')));

let noteCursor = 0;
let questionCursor = 0;
let cursorsInitialized = false;

async function pollActivity() {
  const [notes, questions] = await Promise.all([
    request<Note[]>('GET', `/api/notes${query({ since: noteCursor, exclude: agent })}`),
    request<Question[]>('GET', `/api/questions${query({ for: agent, unanswered: true })}`),
  ]);
  const newNotes = notes.filter(note => note.id > noteCursor);
  const newQuestions = questions.filter(question => question.id > questionCursor);
  if (newNotes.length) noteCursor = Math.max(noteCursor, ...newNotes.map(note => note.id));
  if (newQuestions.length) questionCursor = Math.max(questionCursor, ...newQuestions.map(question => question.id));
  return { notes: newNotes, questions: newQuestions };
}

async function initializeCursors() {
  try {
    const [notes, questions] = await Promise.all([
      request<Note[]>('GET', `/api/notes${query({ since: 0, exclude: agent })}`),
      request<Question[]>('GET', `/api/questions${query({ for: agent, unanswered: true })}`),
    ]);
    noteCursor = notes.reduce((max, note) => Math.max(max, note.id), 0);
    questionCursor = questions.reduce((max, question) => Math.max(max, question.id), 0);
    cursorsInitialized = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Could not initialize activity cursors: ${message}`);
  }
}

server.registerTool('wait_for_activity', {
  description: 'Wait for a new note or unanswered question addressed to this agent.',
  inputSchema: { timeout: z.number().int().min(1).max(60).default(30) },
}, async ({ timeout }) => callTool(async () => {
  if (!cursorsInitialized) await initializeCursors();
  const deadline = Date.now() + timeout * 1_000;
  while (Date.now() < deadline) {
    const activity = await pollActivity();
    if (activity.notes.length || activity.questions.length) {
      return { timeout: false, ...activity };
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, deadline - Date.now())));
  }
  return { timeout: true, notes: [], questions: [] };
}));

let heartbeatInFlight = false;
async function heartbeat() {
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;
  try {
    await request('POST', '/api/agents/heartbeat', { agent, layer });
  } finally {
    heartbeatInFlight = false;
  }
}

async function main() {
  await initializeCursors();
  void heartbeat().catch(error => console.error(`Heartbeat failed: ${String(error)}`));
  const heartbeatTimer = setInterval(() => {
    void heartbeat().catch(error => console.error(`Heartbeat failed: ${String(error)}`));
  }, heartbeatIntervalMs);
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
  } finally {
    clearInterval(heartbeatTimer);
  }
}

main().catch(error => {
  console.error(`LocalMesh MCP server failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
