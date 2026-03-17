# todo-watcher

Watches Claude Code's todo files and fires hooks on task status changes.

## Usage

```bash
node cli.js [--on-complete <cmd>] [--on-change <cmd>] [--session <id>] [--todos-dir <path>]
```

At least one of `--on-complete` or `--on-change` is required. Both can be used together.

### Modes

**`--on-complete <cmd>`** — fires once when all tasks in a session reach `completed`.

**`--on-change <cmd>`** — fires on any task status change.

**`--session <id>`** — only watch this session ID; ignore all other todo files.

### Examples

```bash
# Notify when a plan finishes
node cli.js --on-complete "./notify.sh"

# Log every status change
node cli.js --on-change 'echo "$CHANGES"'

# Both at once
node cli.js --on-complete "./done.sh" --on-change "./log.sh"

# Custom todos directory
node cli.js --on-complete "./notify.sh" --todos-dir /path/to/todos
```

### Environment variables

Both hooks receive:

| Variable | Description |
|---|---|
| `SESSION_ID` | Session ID of the changed plan |
| `FILE_PATH` | Full path to the todo file |
| `TASK_COUNT` | Total number of tasks in the plan |

`--on-change` also receives:

| Variable | Description |
|---|---|
| `CHANGED_COUNT` | Number of tasks that changed in this event |
| `CHANGES` | JSON array of `[{ content, from, to }]` |

## As a library

```js
const { watch } = require('./watcher');

const watcher = watch({
  // fires when all tasks are completed
  onComplete({ sessionId, tasks, filePath }) {
    console.log(`${sessionId} finished`);
  },
  // fires on any status change
  onChange({ sessionId, changes, tasks, filePath }) {
    console.log(`${changes.length} task(s) changed in ${sessionId}`);
  },
});

// Stop watching
watcher.close();
```

`changes` is an array of `{ content, from, to }` where `from` is `null` for newly added tasks.

## Using with Claude Code hooks

Start todo-watcher automatically when a Claude Code session begins by adding a `SessionStart` hook to `~/.claude/settings.json`. The hook receives the session ID on stdin as JSON, so we can pass it via `--session` to scope the watcher to just this session:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "SESSION=$(jq -r '.session_id'); node /path/to/todo-watcher/cli.js --session \"$SESSION\" --on-complete './my-hook.sh' > /tmp/todo-watcher-$SESSION.log 2>&1 & echo $! > /tmp/todo-watcher-$SESSION.pid"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "SESSION=$(jq -r '.session_id'); kill $(cat /tmp/todo-watcher-$SESSION.pid 2>/dev/null) 2>/dev/null; rm -f /tmp/todo-watcher-$SESSION.pid /tmp/todo-watcher-$SESSION.log"
          }
        ]
      }
    ]
  }
}
```

Each session gets its own PID file and log file named by session ID, so multiple sessions can run simultaneously without interfering. `SessionEnd` reads the same session ID from stdin to clean up the right process.

To only run it when starting fresh (not on resume or compact), use `"matcher": "startup"`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "SESSION=$(jq -r '.session_id'); node /path/to/todo-watcher/cli.js --session \"$SESSION\" --on-complete './my-hook.sh' > /tmp/todo-watcher-$SESSION.log 2>&1 & echo $! > /tmp/todo-watcher-$SESSION.pid"
          }
        ]
      }
    ]
  }
}
```

See `HOOKS.md` for the full hooks reference.

## Behavior

- `onComplete` fires once per session when all tasks are `completed`; resets if new tasks are added later
- `onChange` fires on every write that produces at least one status change
- File changes are debounced by 150ms

## Tests

```bash
node --test 'test/*.test.js'
```
