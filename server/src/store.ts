import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Agent = { agent: string; layer: string; lastSeen: string };
export type Note = { id: number; ts: string; agent: string; text: string; tags?: string[] };
export type Question = {
  id: number;
  ts: string;
  from: string;
  to?: string;
  question: string;
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
};
export type State = { agents: Agent[]; notes: Note[]; questions: Question[]; nextId: number };

const here = path.dirname(fileURLToPath(import.meta.url));
export const statePath = path.resolve(here, '../state.json');
const emptyState = (): State => ({ agents: [], notes: [], questions: [], nextId: 1 });

function validState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<State>;
  return Array.isArray(s.agents) && Array.isArray(s.notes) && Array.isArray(s.questions) &&
    Number.isSafeInteger(s.nextId) && (s.nextId as number) > 0;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

function migrateState(value: State): State {
  const agents = value.agents.map(raw => {
    const item = record(raw);
    return {
      agent: typeof item.agent === 'string' ? item.agent : String(item.id ?? ''),
      layer: typeof item.layer === 'string' ? item.layer : '',
      lastSeen: typeof item.lastSeen === 'string' ? item.lastSeen : new Date(0).toISOString(),
    };
  });
  const notes = value.notes.map(raw => {
    const item = record(raw);
    const tags = Array.isArray(item.tags) && item.tags.every(tag => typeof tag === 'string')
      ? item.tags as string[] : [];
    return {
      id: Number(item.id),
      ts: typeof item.ts === 'string' ? item.ts : String(item.createdAt ?? ''),
      agent: typeof item.agent === 'string' ? item.agent : String(item.from ?? ''),
      text: typeof item.text === 'string' ? item.text : String(item.content ?? ''),
      tags,
    };
  });
  const questions = value.questions.map(raw => {
    const item = record(raw);
    return {
      id: Number(item.id),
      ts: typeof item.ts === 'string' ? item.ts : String(item.createdAt ?? ''),
      from: String(item.from ?? ''),
      ...(typeof item.to === 'string' ? { to: item.to } : {}),
      question: String(item.question ?? item.content ?? ''),
      ...(typeof item.answer === 'string' ? { answer: item.answer } : {}),
      ...(typeof item.answeredBy === 'string' ? { answeredBy: item.answeredBy } : {}),
      ...(typeof item.answeredAt === 'string' ? { answeredAt: item.answeredAt } : {}),
    };
  });
  const highestId = Math.max(0, ...notes.map(item => item.id), ...questions.map(item => item.id));
  return { agents, notes, questions, nextId: Math.max(value.nextId, highestId + 1) };
}

async function load(): Promise<State> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'));
    if (!validState(parsed)) throw new Error('state file has an invalid shape');
    return migrateState(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyState();
    const corruptPath = `${statePath}.corrupt-${Date.now()}`;
    try { await rename(statePath, corruptPath); } catch { /* file may be unavailable */ }
    console.error(`\n*** WARNING: PeerSync state is malformed and was moved to ${corruptPath}; starting with empty state. ***\n`, error);
    return emptyState();
  }
}

export const state = await load();
let writeChain: Promise<void> = Promise.resolve();

/** Queue state mutations and persist each completed mutation atomically. */
export function mutate<T>(change: () => T): Promise<T> {
  const operation = writeChain.then(async () => {
    const result = change();
    await persist();
    return result;
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function persist(): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temp, statePath);
}

export function allocateId(): number { return state.nextId++; }
