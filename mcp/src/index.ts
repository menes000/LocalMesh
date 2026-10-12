import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const agent = process.env.LOCALMESH_AGENT?.trim();
if (!agent) {
  console.error('LOCALMESH_AGENT must be set to this agent\'s stable identity.');
  process.exit(1);
}

// The heartbeat tool may change the layer; periodic heartbeats keep the latest value.
let layer = process.env.LOCALMESH_LAYER ?? '';
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

const instructions = [
  `You are LocalMesh agent "${agent}". Other agents on the same LAN share notes and questions through these tools.`,
  'Your identity is fixed by configuration; never claim to be another agent.',
  'At the start of a session, call get_questions with unanswered=true and answer the questions you can.',
  'Use post_note for status updates others should see, and ask_question (with `to` for a specific agent) when you need an answer.',
  'To wait for replies or new work, call wait_for_activity in a loop. Answer each returned question with answer_question;',
  'after asking a question, use get_question with its id to read the answer.',
].join(' ');

const server = new McpServer({ name: 'localmesh', version: '1.0.0' }, { instructions });

server.registerTool('heartbeat', {
  description: 'Refresh this agent\'s presence on LocalMesh.',
  inputSchema: { layer: z.string().optional() },
}, ({ layer: requestedLayer }) => callTool(async () => {
  if (requestedLayer !== undefined) layer = requestedLayer;
  return request('POST', '/api/agents/heartbeat', { agent, layer });
}));

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

// Notes are a feed: skip history that existed before this process started.
// Unanswered questions are pending work: deliver ones asked while this agent was
// offline, so questionCursor starts at 0.
let noteCursor = 0;
let questionCursor = 0;
let cursorsReady: Promise<void> | undefined;

function ensureCursors(): Promise<void> {
  cursorsReady ??= request<Note[]>('GET', `/api/notes${query({ exclude: agent })}`)
    .then(notes => {
      noteCursor = notes.reduce((max, note) => Math.max(max, note.id), 0);
    })
    .catch(error => {
      // Retry on the next call instead of falling back to cursor 0 and
      // replaying every historical note as new activity.
      cursorsReady = undefined;
      throw error;
    });
  return cursorsReady;
}

async function pollActivity() {
  const [notes, questions] = await Promise.all([
    request<Note[]>('GET', `/api/notes${query({ since: noteCursor, exclude: agent })}`),
    request<Question[]>('GET', `/api/questions${query({ for: agent, unanswered: true })}`),
  ]);
  // Filter against the cursors after the await so overlapping calls never
  // deliver the same item twice.
  const newNotes = notes.filter(note => note.id > noteCursor);
  const newQuestions = questions.filter(question => question.id > questionCursor);
  if (newNotes.length) noteCursor = Math.max(noteCursor, ...newNotes.map(note => note.id));
  if (newQuestions.length) questionCursor = Math.max(questionCursor, ...newQuestions.map(question => question.id));
  return { notes: newNotes, questions: newQuestions };
}

server.registerTool('wait_for_activity', {
  description: 'Wait up to `timeout` seconds for new notes from other agents or unanswered questions for this agent. ' +
    'Each item is returned once per MCP process. Returns immediately when activity exists; ' +
    'returns { timeout: true } when nothing arrived.',
  inputSchema: { timeout: z.number().int().min(1).max(60).default(30) },
}, async ({ timeout }) => callTool(async () => {
  await ensureCursors();
  const deadline = Date.now() + timeout * 1_000;
  while (true) {
    const activity = await pollActivity();
    if (activity.notes.length || activity.questions.length) {
      return { timeout: false, ...activity };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { timeout: true, notes: [], questions: [] };
    await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
  }
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
  void heartbeat().catch(error => console.error(`Heartbeat failed: ${String(error)}`));
  const heartbeatTimer = setInterval(() => {
    void heartbeat().catch(error => console.error(`Heartbeat failed: ${String(error)}`));
  }, heartbeatIntervalMs);
  // connect() resolves as soon as stdio is attached, not when the session ends.
  // Keep heartbeats running until the host closes the transport; unref() lets
  // the process exit on stdin EOF instead of being held open by the timer.
  heartbeatTimer.unref();
  const transport = new StdioServerTransport();
  transport.onclose = () => clearInterval(heartbeatTimer);
  await server.connect(transport);
  // Start the note cursor at connect time without delaying the MCP handshake
  // when the LocalMesh server is unreachable.
  void ensureCursors().catch(error => console.error(`Could not initialize activity cursors: ${String(error)}`));
}

main().catch(error => {
  console.error(`LocalMesh MCP server failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
