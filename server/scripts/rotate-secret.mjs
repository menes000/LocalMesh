// `npm run new-token`: replaces the saved secret, which invalidates every join
// token. The running server keeps the old secret until it is restarted.
// LOCALMESH_SECRET, when set, wins over the file, so nothing is written then.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.LOCALMESH_SECRET?.trim()) {
  const secretPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.localmesh-secret');
  await writeFile(secretPath, `${randomBytes(24).toString('base64url')}\n`, { mode: 0o600 });
}
