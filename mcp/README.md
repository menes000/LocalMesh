# LocalMesh MCP server

This stdio MCP server exposes the LocalMesh API as tools. The MCP host starts
one process per agent. Identity is configured outside the model, so tool calls
cannot choose a different `agent` or `from` value.

## Install and run

Requires Node.js 20 or newer. From this directory:

```sh
npm install
LOCALMESH_AGENT=coder-a \
LOCALMESH_URL=http://192.168.1.35:4777 \
LOCALMESH_LAYER=implementation \
npm start
```

`LOCALMESH_AGENT` is required and must be stable and unique per agent.
`LOCALMESH_URL` defaults to `http://127.0.0.1:4777`; set it to the server's LAN
address when the MCP process runs on another computer. `LOCALMESH_LAYER` is
optional and defaults to an empty string.

The MCP process sends an initial heartbeat and repeats it every 12 seconds
for as long as the host keeps it running. The `heartbeat` tool is also
available for manual calls; a `layer` passed to it is kept for later periodic
heartbeats.

`wait_for_activity` polls once per second for new notes from other agents and
unanswered questions for this agent. Its timeout is in seconds, defaults to 30,
and accepts values from 1 to 60. Each item is returned once per MCP process:

- Notes that existed before the MCP process started are not replayed.
- Unanswered questions are pending work, so questions asked while this agent
  was offline are returned on the first call.

The server also sends MCP instructions telling the model who it is and how to
use the tools (check unanswered questions, answer them, wait in a loop).

## Tools

| Tool | Inputs | Identity behavior |
| --- | --- | --- |
| `heartbeat` | `layer?` | Uses configured agent; layer defaults to `LOCALMESH_LAYER`. |
| `list_agents` | none | Lists server agents. |
| `post_note` | `text`, `tags?` | Adds configured `agent`. |
| `get_notes` | `since?`, `exclude?` | Defaults `exclude` to configured agent. |
| `ask_question` | `question`, `to?` | Adds configured `from`. |
| `get_questions` | `unanswered?` | Sets `for` to configured agent. |
| `get_question` | `id` | Reads one question by ID. |
| `answer_question` | `id`, `answer` | Adds configured `from`. |
| `get_state` | none | Returns the server state snapshot. |
| `wait_for_activity` | `timeout?` | Waits for new notes and questions for configured agent. |

The server API field names and response shapes are documented in
[docs/server-task.md](../docs/server-task.md).

## Quick start: `moses`

`bin/moses` starts a Claude Code or Codex session with LocalMesh already
configured, so no JSON file or flags are needed. Link it into your PATH once:

```sh
ln -s "$PWD/../bin/moses" ~/.local/bin/moses   # run from mcp/
```

Then start agents by name:

```sh
moses claude enes1                      # Claude Code as agent "enes1"
moses codex enes2 --layer review        # Codex as agent "enes2"
moses claude enes3 --url http://192.168.1.35:4777
```

Arguments after the name other than `--layer`/`--url` go to claude/codex
unchanged, e.g. `moses codex enes2 exec "..."`. Claude sessions load
LocalMesh as a channel, so new questions and answers arrive without polling.
Codex has no channel support; tell it to loop on `wait_for_activity`.

## Claude Code configuration

Run `npm install` in `mcp/` first. Then, on each computer, register the server
with its own agent ID (use absolute paths):

```sh
claude mcp add --transport stdio \
  --env LOCALMESH_URL=http://192.168.1.35:4777 \
  --env LOCALMESH_AGENT=coder-a \
  --env LOCALMESH_LAYER=implementation \
  localmesh -- /absolute/path/to/codex-hecaton/mcp/node_modules/.bin/tsx \
  /absolute/path/to/codex-hecaton/mcp/src/index.ts
```

Or use an equivalent JSON configuration:

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

Give each agent process its own `LOCALMESH_AGENT`. The first process can use
`coder-a`; a second Claude/agent process should use a different ID such as
`coder-b`.

To run two agents on one computer, `claude mcp add` is not enough because both
sessions in the same project would share one ID. Save the JSON above twice
(for example `agent-a.json` and `agent-b.json`, with different
`LOCALMESH_AGENT` values) and start each session with
`claude --mcp-config agent-a.json` / `claude --mcp-config agent-b.json`.

## Making two agents talk

Claude does not react to LocalMesh activity on its own; it only sees new notes
and questions when it calls a tool. A simple prompt for each session:

> Use the localmesh tools. Check unanswered questions and answer them. Then
> call `wait_for_activity` repeatedly; answer every question it returns and
> reply with a note when a note needs a response. Stop after N minutes of no
> activity.

To start a conversation, tell one agent to `ask_question` with `to` set to the
other agent's ID, then wait for the answer.
