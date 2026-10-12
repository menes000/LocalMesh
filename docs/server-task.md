# LocalMesh server API contract

All API routes are under `/api`. The response field names and shapes below are
the contract consumed by `/mcp`; keep them exact. IDs are monotonically
increasing integers shared by notes and questions. `ts` is an ISO 8601 string.

## Agents

`POST /api/agents/heartbeat`

Request:

```json
{ "agent": "coder-a", "layer": "implementation", "client": "claude", "session": "8f0c…" }
```

`layer` is optional and defaults to `""`. `client` is optional: the host
running the agent (`claude`, `codex`, or the host's raw MCP client name); a
heartbeat without it keeps the stored value. `session` is optional: a secret
token each MCP process generates at startup. Success response:

```json
{ "ok": true }
```

Only one running session may use a name. While the stored agent is online, a
heartbeat whose `session` differs from the stored one (including a missing
`session` against a stored one, or the reverse) is refused with
`409 { "error": "agent name \"coder-a\" is already used by another running session" }`.
Once the holder has been silent for 30 seconds, the next heartbeat takes the
name over. `session` is never returned by any endpoint.

Agents whose `lastSeen` is more than five minutes old are removed from state at
startup and every minute.

`GET /api/agents` returns an array with exactly these fields per agent:

```json
[{ "agent": "coder-a", "layer": "implementation", "lastSeen": "2026-10-12T10:00:00.000Z", "online": true, "client": "claude" }]
```

`client` is omitted when the agent never reported one.

`online` is true when `lastSeen` is less than 30 seconds ago.

## Notes

`POST /api/notes`

Request:

```json
{ "agent": "coder-a", "text": "The parser is ready.", "tags": ["status"] }
```

`tags` is optional. Success response is exactly `{ "id": 1, "ts": "..." }`.

`GET /api/notes?since=<id>&exclude=<agent>` returns an array of
`{ "id", "ts", "agent", "text", "tags" }`. `since` is exclusive; `exclude`
omits notes written by that agent. Both query parameters are optional.

## Questions

`POST /api/questions`

Request:

```json
{ "from": "coder-a", "to": "coder-b", "question": "Can you review this?" }
```

`to` is optional. Success response is exactly `{ "id": 2, "ts": "..." }`.

`GET /api/questions?for=<agent>&unanswered=true` returns an array of
`{ "id", "ts", "from", "to?", "question" }`. It includes questions addressed
to that agent or with no `to`, excludes questions from that same agent, and
when `unanswered=true` excludes answered questions.

`GET /api/questions/:id` returns
`{ "id", "ts", "from", "to?", "question", "answer?", "answeredBy?", "answeredAt?" }`.
It returns HTTP 404 with `{ "error": "question not found" }` when the ID is
missing.

`POST /api/questions/:id/answer`

Request:

```json
{ "from": "coder-b", "answer": "Reviewed; looks good." }
```

The first answer returns `{ "ok": true }`. If already answered, it returns
HTTP 200 with `{ "ok": false, "reason": "already answered" }`.

## State

`GET /api/state` returns exactly
`{ "agents": [...], "notes": [...], "questions": [...], "claims": [] }`.

## Persistence and errors

Mutations are serialized and persisted to `server/state.json`. Async mutation
handlers return HTTP 500 with `{ "error": "..." }` if persistence fails; the
in-memory change (including the allocated ID) is rolled back, so a failed
write is never visible to later requests.
Validation errors return HTTP 400 with `{ "error": "..." }`. Unknown routes
return HTTP 404 with `{ "error": "not found" }`.

There is no `/api/messages` endpoint in this contract.
