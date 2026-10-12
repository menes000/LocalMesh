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

The MCP process sends an initial heartbeat and repeats it every 12 seconds.
The `heartbeat` tool is also available for manual calls. `wait_for_activity`
polls for new notes and unanswered questions once per second; its timeout is
in seconds, defaults to 30, and accepts values from 1 to 60. It starts from
the current note/question cursors so existing activity is not replayed.

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

## Claude Code configuration example

Use absolute paths for the MCP executable and entry file:

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
