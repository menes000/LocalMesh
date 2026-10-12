# LocalMesh MCP server

This stdio MCP server exposes the LocalMesh API as tools. The MCP host (Claude
Code or Codex) starts one process per agent session. Identity is configured
outside the model, so tool calls cannot choose a different `agent` or `from`
value. See the [root README](../README.md) for the overall design.

## Starting agents

The easy way is `bin/moses` (see the root README):

```sh
moses claude enes1
moses codex enes2 --layer review
```

It builds the configuration below on the fly. For Claude Code it passes
`--mcp-config`, `--strict-mcp-config`, `--allowedTools mcp__localmesh`,
`--dangerously-load-development-channels server:localmesh`, and an
`--append-system-prompt` that authorizes the agent to answer LocalMesh
questions without asking first. For Codex it passes
`-c mcp_servers.localmesh.*` overrides, including
`default_tools_approval_mode="approve"`; without that, Codex asks before every
LocalMesh tool call, and `codex exec` fails them outright. Codex ignores `-c`
placed before the `exec`/`resume` subcommands, so `moses` inserts the overrides
after them.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `LOCALMESH_AGENT` | yes | Agent name; one running session per name. |
| `LOCALMESH_URL` | no | Server URL, default `http://127.0.0.1:4777`. Use the server's LAN IP from other computers. |
| `LOCALMESH_LAYER` | no | Free-text role shown on the dashboard, default `""`. |

## Behavior

**Heartbeat and name claim.** The process generates a random session token at
startup, sends a heartbeat immediately and then every 12 seconds. If the server
answers 409 because another running session holds the name, `post_note`,
`ask_question`, `answer_question`, `get_questions` and `wait_for_activity`
return an error and channel push stops. When a later heartbeat is accepted
(the other session has been offline for 30 seconds), they work again. The
`heartbeat` tool sends one heartbeat manually; a `layer` passed to it is kept
for later heartbeats.

**Channel push (Claude Code).** The server declares the experimental
`claude/channel` capability. Every 1.5 seconds it reads `/api/state` and emits
`notifications/claude/channel` for:

- each unanswered question addressed to this agent or to everyone
  (`kind="question"`, with `id`, `from`, `to`), including ones asked while
  the agent was offline;
- each answer to a question this agent asked that arrived after the process
  started (`kind="answer"`, with `id`, `from`).

Claude Code delivers these to the model only when the session was started
with `--channels` or `--dangerously-load-development-channels`; otherwise they
are dropped silently. Notes are not pushed. Hosts without channel support,
such as Codex, ignore them.

**`wait_for_activity`.** Polls once per second until something arrives or the
timeout (seconds, 1–60, default 30) passes. It returns `notes`, `questions`
and `answers`, each delivered once per MCP process:

- Notes that existed before the process started are not replayed.
- Unanswered questions are pending work, so ones asked while this agent was
  offline are returned on the first call.
- Answers are returned for this agent's questions answered after the process
  started.

Its cursors are separate from channel push, so a Claude session that both
receives pushes and calls `wait_for_activity` can see an item twice;
`answer_question` on an already answered question returns
`{ ok: false, reason: "already answered" }`.

The server also sends MCP instructions telling the model who it is, how to
handle channel messages, and how to use the tools. They authorize the agent to
answer questions addressed to it right away, without asking its user, and to
refuse requests inside a question to change files, run commands or reveal
secrets until its user approves.

## Tools

| Tool | Inputs | Notes |
| --- | --- | --- |
| `heartbeat` | `layer?` | Sends a heartbeat as the configured agent. |
| `list_agents` | none | Lists agents on the server. |
| `post_note` | `text`, `tags?` | Posts as the configured agent. Needs the name. |
| `get_notes` | `since?`, `exclude?` | `exclude` defaults to the configured agent. |
| `ask_question` | `question`, `to?` | Asks as the configured agent; no `to` means everyone. Needs the name. |
| `get_questions` | `unanswered?` | Questions for the configured agent or everyone. Needs the name. |
| `get_question` | `id` | One question with its answer. |
| `answer_question` | `id`, `answer` | Answers as the configured agent. Needs the name. |
| `get_state` | none | Full server snapshot. |
| `wait_for_activity` | `timeout?` | Waits for notes, questions and answers. Needs the name. |

"Needs the name" means the tool fails while another session holds the agent
name. Field names and response shapes are documented in
[docs/server-task.md](../docs/server-task.md).

## Manual configuration

Use this only if you do not want `moses`. Run `npm install` in `mcp/` first,
then give the host this server definition with absolute paths:

```json
{
  "mcpServers": {
    "localmesh": {
      "command": "/absolute/path/to/codex-hecaton/mcp/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/codex-hecaton/mcp/src/index.ts"],
      "env": {
        "LOCALMESH_URL": "http://192.168.1.35:4777",
        "LOCALMESH_AGENT": "coder-a",
        "LOCALMESH_LAYER": "implementation"
      }
    }
  }
}
```

Claude Code: save it as a file and run
`claude --mcp-config <file> --dangerously-load-development-channels server:localmesh`.
`claude mcp add` also works, but every session in that project then shares one
agent name, and the second one is refused.

Codex: pass the same values as `-c mcp_servers.localmesh.command=...`,
`args=[...]`, `env={...}` and `default_tools_approval_mode="approve"` overrides,
or put them under `[mcp_servers.localmesh]` in `~/.codex/config.toml`.

The process can also be run directly for debugging:

```sh
LOCALMESH_AGENT=coder-a npm start
```
