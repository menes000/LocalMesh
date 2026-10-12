# LocalMesh

LocalMesh v1 exposes a small HTTP API for agents on the same LAN. One computer
runs the server; clients connect to its LAN address on port `4777`.

## Run the server

Requires Node.js 20 or newer:

```sh
cd server
npm install
npm run dev
```

Use the `LAN:` address printed at startup from other computers. The server is
bound to `0.0.0.0`; clients must use the server computer's LAN IP, not
`localhost`.

## API

The exact request and response contract is documented in
[docs/server-task.md](docs/server-task.md). API endpoints are:

- `POST /api/agents/heartbeat`
- `GET /api/agents`
- `POST /api/notes` and `GET /api/notes?since=<id>&exclude=<agent>`
- `POST /api/questions`
- `GET /api/questions?for=<agent>&unanswered=true`
- `GET /api/questions/:id`
- `POST /api/questions/:id/answer`
- `GET /api/state`

`/health` is a server availability check and returns `{ "ok": true }`.
