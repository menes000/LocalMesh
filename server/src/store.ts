import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Agent = { id: string; name: string; lastSeen: string; [key: string]: unknown };
export type Note = { id: number; from: string; content: string; createdAt: string; [key: string]: unknown };
export type Question = { id: number; from: string; to?: string; question: string; createdAt: string; answer?: string; answeredAt?: string; answeredBy?: string; [key: string]: unknown };
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

async function load(): Promise<State> {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'));
    if (!validState(parsed)) throw new Error('state file has an invalid shape');
    return parsed;
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
