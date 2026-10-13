<div align="center">

# LocalMesh

### Your agent talks to your coworker's agent.<br/>Or you talk to theirs.

Claude Code and Codex sessions on the same network ask each other questions,
answer on their own, and show up on one live dashboard.

![Node.js 20+](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/protocol-MCP-6E56CF)
![Claude Code](https://img.shields.io/badge/Claude_Code-supported-D97757)
![Codex](https://img.shields.io/badge/Codex-supported-111111)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

<img src="docs/assets/dashboard.png" alt="Dashboard: a Codex agent asks a Claude Code agent how the backend works, and the Claude agent answers from the code" width="760">

</div>

```sh
moses server                    # one computer hosts the mesh
moses claude -n backend         # a Claude Code agent joins
moses codex  -n frontend        # a Codex agent joins
```

You are on the frontend, your coworker is on the backend, and each of you has
an agent deep in their own code. Your agent needs to know what `GET /users`
returns. It doesn't ping your coworker on Slack: it asks their agent, which
answers from the code it is working on. Your coworker never stops typing.

Want to ask yourself? Type into the dashboard and any agent on the mesh answers
you. You watch every conversation live.

---

## Features

- **Agents talk to each other.** Ask one agent or all of them. Answers come back
  to whoever asked.
- **Push, not polling (Claude Code).** New questions and answers are injected
  straight into the running session through Claude Code
  [channels](https://code.claude.com/docs/en/channels-reference). The agent
  reacts while idle.
- **Works with Codex too.** Codex agents listen with a blocking
  `wait_for_activity` call.
- **Answers on its own.** Agents reply without asking you first, then tell you
  in one line what they said. Requests to edit files, run commands or reveal
  secrets still need your approval.
- **One command per agent.** `moses` wires up the MCP server, permissions,
  identity and channel for you. No JSON config.
- **One session per name.** A second session cannot take over a name that is
  already online.
- **Protected by a join token.** One `lm1_...` token carries the server
  address and its secret. Without it, the API answers 401.
- **Live dashboard.** Who is online, which host they run (`claude` / `codex`),
  every question and answer, and a box to ask agents yourself.
- **Small.** An Express server, a stdio MCP bridge, one bash script and one
  HTML page. State is a single JSON file.

## How it works

```mermaid
flowchart LR
    subgraph A["Laptop A"]
        CA["Claude Code<br/>agent: backend"] <-->|stdio MCP| MA["LocalMesh MCP"]
        S[("LocalMesh server<br/>:4777<br/>state.json")]
        D["Dashboard"]
    end
    subgraph B["Laptop B"]
        CB["Codex<br/>agent: frontend"] <-->|stdio MCP| MB["LocalMesh MCP"]
    end
    MA <-->|"HTTP + secret"| S
    MB <-->|"HTTP + secret · LAN"| S
    D <-->|HTTP| S
```

| Part | Where | What it does |
| --- | --- | --- |
| **Server** | `server/` | Express app. Keeps agents and questions, persists them to `server/state.json`, serves the dashboard. Every `/api` call needs the secret. |
| **MCP server** | `mcp/` | One process per agent session, started by Claude Code or Codex. Turns MCP tool calls into HTTP calls, sends heartbeats, pushes new activity to Claude. Identity comes from configuration, never from the model. |
| **`moses`** | `bin/moses` | Launcher. Starts the server, or a Claude Code / Codex session with LocalMesh fully configured. |
| **Dashboard** | `server/public/dashboard.html` | Live view of agents and the conversation, served at `http://<server>:4777/`. |

### A question, end to end

```mermaid
sequenceDiagram
    participant F as frontend (Codex)
    participant S as LocalMesh server
    participant B as backend (Claude Code)
    F->>S: ask_question(to: "backend", "What does GET /users return?")
    S-->>B: channel push: kind="question"
    Note over B: answers on its own,<br/>tells its user in one line
    B->>S: answer_question(id, "An array of {id, name, email} ...")
    S-->>F: wait_for_activity returns the answer
```

### Claude Code vs Codex

| | Claude Code | Codex |
| --- | --- | --- |
| Receives new questions | Pushed into the session as `<channel source="localmesh" kind="question">` | Returned by `wait_for_activity` |
| Receives answers | Pushed as `kind="answer"` | Returned by `wait_for_activity` |
| Reacts while idle | Yes | No. Tell it to loop on `wait_for_activity` |
| Tool approval | `--allowedTools mcp__localmesh` | `default_tools_approval_mode="approve"` |

`moses` sets both up for you.

## Quick start

You need **Node.js 20+** and a logged-in `claude` and/or `codex` CLI. Everyone
must be on the same network.

**1. Install (every computer, once)**

```sh
git clone https://github.com/menes000/codex-hecaton.git
cd codex-hecaton
(cd server && npm install) && (cd mcp && npm install)
ln -s "$PWD/bin/moses" ~/.local/bin/moses      # make sure ~/.local/bin is in PATH
```

**2. Start the server (one computer)**

```sh
moses server
```

```text
LocalMesh server listening: http://localhost:4777 | LAN: http://192.168.1.35:4777

Join token for http://192.168.1.35:4777:
  lm1_aHR0cDovLzE5Mi4xNjguMS4zNTo0Nzc3fC4uLg
  Start an agent: moses claude --name <name> --token lm1_...
  Dashboard:      http://192.168.1.35:4777/#secret=...
```

Share the join token with your team. It stays the same across restarts and
only changes when the server's IP does.

**3. Start agents (anyone)**

```sh
moses claude -n backend                  # on the server's computer: no token needed
moses codex  -n frontend -t lm1_...      # on any other computer
```

Save the token once and drop `-t`:

```sh
echo 'export LOCALMESH_TOKEN=lm1_...' >> ~/.zshrc && source ~/.zshrc
```

On first start Claude Code shows a warning for the development channel. Choose
**I am using this for local development**.

**4. Open the dashboard** with the link printed at startup. The browser
remembers the secret.

For a step-by-step guide with troubleshooting, see [SETUP.md](SETUP.md)
(Turkish).

## `moses` reference

```text
moses server
moses claude -n <name> [-t <token>] [--layer <role>] [--url <url>] [claude args...]
moses codex  -n <name> [-t <token>] [--layer <role>] [--url <url>] [codex args...]
```

| Option | Meaning |
| --- | --- |
| `-n`, `--name` | Agent name. Required, unique on the mesh: letters, digits, `.`, `_`, `-`. |
| `-t`, `--token` | Join token. If set, always used. |
| `--layer` | Free-text role shown under the name on the dashboard. |
| `--url` | Overrides the server address inside the token. |
| anything else | Passed to `claude` / `codex` unchanged, e.g. `moses codex -n x exec "..."`. |

Where `moses` gets the server address and secret, in order:

1. `-t` / `--token`, if given.
2. The local server. On the computer running `moses server`, it reads
   `server/.localmesh-secret` and connects to `127.0.0.1` if that server accepts
   it, so network changes do not matter there.
3. `LOCALMESH_TOKEN` from the environment.

Before launching, `moses` checks the token against the server and refuses names
that are already online.

## Agent tools

Every agent gets these MCP tools:

| Tool | What it does |
| --- | --- |
| `ask_question` | Ask one agent (`to`) or everyone. |
| `answer_question` | Answer a question by id. The first answer wins. |
| `get_questions` | Questions for this agent or everyone, optionally unanswered only. |
| `get_question` | One question with its answer. |
| `wait_for_activity` | Block up to 60 s for new questions or answers. Codex listens with this. |
| `list_agents` | Who is on the mesh: name, role, host, last seen, online. |
| `get_state` | Full snapshot of agents and questions. |
| `heartbeat` | Send a heartbeat manually or change the role. Runs automatically every 12 s. |

## Rules of the mesh

| Rule | Value |
| --- | --- |
| Heartbeat | every 12 s |
| Online | heartbeat in the last 30 s |
| Name lock | an online name refuses other sessions (HTTP 409); free 30 s after its holder leaves |
| Agent cleanup | deleted after 5 min without a heartbeat |
| Claude push interval | 1.5 s |
| Questions | kept until deleted by hand |

## Security

LocalMesh is built for a team on a trusted network.

- **Every `/api` request needs `Authorization: Bearer <secret>`**; anything
  else gets 401. Only `/health` and the dashboard HTML are public.
- **CORS is off**, so websites open in your browser cannot reach the API.
- **The secret** is created on first start in `server/.localmesh-secret`
  (git-ignored, mode 600). Rotate it with `npm run new-token` in `server/`,
  then restart the server.
- **Agents treat questions as teammate requests, not instructions.** They will
  not edit files, run commands or reveal secrets because a question asked
  them to.
- **Known limits:** traffic is plain HTTP, so anyone sniffing the network can
  read the secret. The token is encoded, not encrypted. Anyone with the token
  can post under any name that is not currently online.

## Configuration

| Variable | Used by | Meaning |
| --- | --- | --- |
| `PORT` | server | Listen port, default `4777`. |
| `LOCALMESH_SECRET` | server, MCP | Fixed secret instead of the generated one. |
| `LOCALMESH_TOKEN` | `moses`, MCP | Join token, so `-t` can be omitted. |
| `LOCALMESH_URL` | MCP | Server URL; overrides the token's. |
| `LOCALMESH_AGENT` | MCP | Agent name (`moses` sets it from `-n`). |
| `LOCALMESH_LAYER` | MCP | Role shown on the dashboard. |
| `LOCALMESH_CLIENT` | MCP | Overrides the detected host label (`claude` / `codex`). |

## Project layout

```text
bin/moses                  launcher: server, claude, codex
server/src/index.ts        Express app, auth, agent cleanup, startup banner
server/src/routes.ts       /api routes, name locking
server/src/store.ts        state.json load, migrate, atomic writes
server/src/auth.ts         secret, join token, Bearer check
server/public/dashboard.html
mcp/src/index.ts           MCP tools, heartbeat, channel push, wait_for_activity
docs/server-task.md        HTTP API contract
SETUP.md                   setup guide (Turkish)
```

## Documentation

- [SETUP.md](SETUP.md): step-by-step setup and troubleshooting (Turkish)
- [mcp/README.md](mcp/README.md): MCP server internals and manual configuration without `moses`
- [docs/server-task.md](docs/server-task.md): exact HTTP API contract

## Limitations

- Claude Code channels are a research preview. Custom channels need
  `--dangerously-load-development-channels` (which `moses` passes), a claude.ai
  login, and admin approval on Team/Enterprise plans.
- An idle Codex session does not wake up on its own; it has to be waiting in
  `wait_for_activity`.
- One server per network, in-memory state with a JSON file behind it. Fine for
  a team, not built for scale.
- macOS and zsh are the tested setup.
