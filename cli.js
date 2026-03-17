#!/usr/bin/env node
const { execSync } = require('child_process');
const { watch } = require('./watcher');

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--on-complete' && args[i + 1]) {
      opts.onComplete = args[++i];
    } else if (args[i] === '--on-change' && args[i + 1]) {
      opts.onChange = args[++i];
    } else if (args[i] === '--session' && args[i + 1]) {
      opts.session = args[++i];
    } else if (args[i] === '--todos-dir' && args[i + 1]) {
      opts.todosDir = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help || (!opts.onComplete && !opts.onChange)) {
  console.log(`Usage: node cli.js [--on-complete <cmd>] [--on-change <cmd>] [--todos-dir <path>]

At least one of --on-complete or --on-change is required.

Options:
  --on-complete <cmd>   Command to run when all tasks in a plan are completed
  --on-change <cmd>     Command to run on any task status change
  --session <id>        Only watch this session ID (ignores all other todo files)
  --todos-dir <path>    Path to todos directory (default: ~/.claude/todos)
  --help                Show this help

Environment variables for --on-complete:
  SESSION_ID    Session ID of the completed plan
  FILE_PATH     Full path to the todo file
  TASK_COUNT    Number of tasks in the plan

Environment variables for --on-change (includes all of the above, plus):
  CHANGED_COUNT   Number of tasks whose status changed
  CHANGES         JSON array of changes: [{ content, from, to }]

Examples:
  node cli.js --on-complete "./notify.sh"
  node cli.js --on-change "echo 'changed: \$CHANGES'"
  node cli.js --on-complete "./done.sh" --on-change "./log-change.sh"
`);
  process.exit(opts.help ? 0 : 1);
}

function runHook(cmd, env) {
  try {
    execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
  } catch (err) {
    console.error(`Hook failed (exit ${err.status})`);
  }
}

watch({
  todosDir: opts.todosDir,
  session: opts.session,

  onComplete: opts.onComplete ? ({ sessionId, tasks, filePath }) => {
    console.log(`Plan complete: ${sessionId} (${tasks.length} tasks)`);
    runHook(opts.onComplete, {
      SESSION_ID: sessionId,
      FILE_PATH: filePath,
      TASK_COUNT: String(tasks.length),
    });
  } : undefined,

  onChange: opts.onChange ? ({ sessionId, changes, tasks, filePath }) => {
    console.log(`Todo change: ${sessionId} (${changes.length} changed)`);
    runHook(opts.onChange, {
      SESSION_ID: sessionId,
      FILE_PATH: filePath,
      TASK_COUNT: String(tasks.length),
      CHANGED_COUNT: String(changes.length),
      CHANGES: JSON.stringify(changes),
    });
  } : undefined,
});
