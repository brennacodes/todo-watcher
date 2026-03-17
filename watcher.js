const fs = require('fs');
const path = require('path');

const DEFAULT_TODOS_DIR = path.join(process.env.HOME, '.claude', 'todos');

function readTodoFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const tasks = JSON.parse(raw);
    if (!Array.isArray(tasks)) return null;
    return tasks;
  } catch {
    return null;
  }
}

function isPlanComplete(tasks) {
  if (!tasks || tasks.length === 0) return false;
  return tasks.every(t => t.status === 'completed');
}

// watch({ todosDir?, session?, onComplete({ sessionId, tasks, filePath }), onChange({ sessionId, changes, tasks, filePath }) })
// onComplete fires when all tasks reach 'completed'
// onChange fires on any status change; changes is [{ content, from, to }]
// session filters to a single session ID (ignores all other todo files)
function watch({ todosDir = DEFAULT_TODOS_DIR, session, onComplete, onChange } = {}) {
  if (!fs.existsSync(todosDir)) {
    console.error(`todos directory not found: ${todosDir}`);
    return;
  }

  const cache = new Map();      // filename -> Map<content, status> for diffing
  const fired = new Set();      // sessions where onComplete has already fired
  const debounceTimers = new Map();

  const watcher = fs.watch(todosDir, { persistent: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.json')) return;
    if (session && !filename.startsWith(session)) return;

    if (debounceTimers.has(filename)) clearTimeout(debounceTimers.get(filename));

    debounceTimers.set(filename, setTimeout(() => {
      debounceTimers.delete(filename);
      const filePath = path.join(todosDir, filename);
      const tasks = readTodoFile(filePath);
      if (!tasks) return;

      const sessionId = filename.replace('.json', '');

      if (onChange) {
        const oldMap = cache.get(filename) || new Map();
        const newMap = new Map();
        const changes = [];

        for (const task of tasks) {
          newMap.set(task.content, task.status);
          const oldStatus = oldMap.get(task.content);
          if (oldStatus === undefined) {
            changes.push({ content: task.content, from: null, to: task.status });
          } else if (oldStatus !== task.status) {
            changes.push({ content: task.content, from: oldStatus, to: task.status });
          }
        }

        cache.set(filename, newMap);
        if (changes.length > 0) onChange({ sessionId, changes, tasks, filePath });
      }

      if (onComplete) {
        if (isPlanComplete(tasks) && !fired.has(filename)) {
          fired.add(filename);
          onComplete({ sessionId, tasks, filePath });
        } else if (!isPlanComplete(tasks)) {
          fired.delete(filename);
        }
      }
    }, 150));
  });

  console.log(`Watching ${todosDir} for todo changes...`);
  return watcher;
}

module.exports = { watch, isPlanComplete, readTodoFile };
