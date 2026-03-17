'use strict';

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { isPlanComplete, readTodoFile, watch } = require('../watcher');

// --- isPlanComplete ---

describe('isPlanComplete', () => {
  it('returns false for empty array', () => {
    assert.equal(isPlanComplete([]), false);
  });

  it('returns false when any task is pending', () => {
    assert.equal(isPlanComplete([
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'pending' },
    ]), false);
  });

  it('returns false when any task is in_progress', () => {
    assert.equal(isPlanComplete([
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'in_progress' },
    ]), false);
  });

  it('returns true when all tasks are completed', () => {
    assert.equal(isPlanComplete([
      { content: 'a', status: 'completed' },
      { content: 'b', status: 'completed' },
    ]), true);
  });

  it('returns true for a single completed task', () => {
    assert.equal(isPlanComplete([{ content: 'a', status: 'completed' }]), true);
  });

  it('returns false for null', () => {
    assert.equal(isPlanComplete(null), false);
  });
});

// --- readTodoFile ---

describe('readTodoFile', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-watcher-read-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('reads a valid JSON array', () => {
    const filePath = path.join(tmpDir, 'valid.json');
    const tasks = [{ content: 'a', status: 'pending' }];
    fs.writeFileSync(filePath, JSON.stringify(tasks));
    assert.deepEqual(readTodoFile(filePath), tasks);
  });

  it('returns null for invalid JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, 'not json');
    assert.equal(readTodoFile(filePath), null);
  });

  it('returns null when JSON is not an array', () => {
    const filePath = path.join(tmpDir, 'object.json');
    fs.writeFileSync(filePath, JSON.stringify({ content: 'a' }));
    assert.equal(readTodoFile(filePath), null);
  });

  it('returns null for a missing file', () => {
    assert.equal(readTodoFile(path.join(tmpDir, 'missing.json')), null);
  });
});

// --- watch ---
// Each test gets its own temp directory so watchers don't interfere with each other.
// The watcher is closed in afterEach to prevent leaks.

describe('watch', () => {
  let tmpDir;
  let watcher;

  // Fresh directory per test
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-watcher-watch-'));
  });

  afterEach(() => {
    if (watcher) { watcher.close(); watcher = null; }
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('calls onComplete when all tasks become completed', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    const sessionFile = path.join(dir, 'session-abc.json');

    watcher = watch({
      todosDir: dir,
      onComplete({ sessionId, tasks }) {
        assert.equal(sessionId, 'session-abc');
        assert.equal(tasks.length, 2);
        done();
      },
    });

    // Write incomplete state first, then flip to all-complete
    fs.writeFileSync(sessionFile, JSON.stringify([
      { content: 'task 1', status: 'in_progress' },
      { content: 'task 2', status: 'pending' },
    ]));

    setTimeout(() => {
      fs.writeFileSync(sessionFile, JSON.stringify([
        { content: 'task 1', status: 'completed' },
        { content: 'task 2', status: 'completed' },
      ]));
    }, 200);
  });

  it('does not call onComplete twice for the same completed session', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    const sessionFile = path.join(dir, 'session-dedup.json');
    let callCount = 0;

    watcher = watch({
      todosDir: dir,
      onComplete() { callCount++; },
    });

    const allDone = JSON.stringify([{ content: 'x', status: 'completed' }]);

    fs.writeFileSync(sessionFile, allDone);

    setTimeout(() => {
      // Write the same completed state again — should not re-fire
      fs.writeFileSync(sessionFile, allDone);
      setTimeout(() => {
        assert.equal(callCount, 1);
        done();
      }, 300);
    }, 200);
  });

  it('fires onComplete again after tasks are reopened then re-completed', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    const sessionFile = path.join(dir, 'session-reopen.json');
    let callCount = 0;

    watcher = watch({
      todosDir: dir,
      onComplete() { callCount++; },
    });

    const allDone = JSON.stringify([{ content: 'x', status: 'completed' }]);
    const reopened = JSON.stringify([
      { content: 'x', status: 'completed' },
      { content: 'new task', status: 'pending' },
    ]);

    // First completion
    fs.writeFileSync(sessionFile, allDone);

    setTimeout(() => {
      // Reopen the plan (adds a pending task)
      fs.writeFileSync(sessionFile, reopened);
      setTimeout(() => {
        // Complete again
        fs.writeFileSync(sessionFile, allDone);
        setTimeout(() => {
          assert.equal(callCount, 2);
          done();
        }, 300);
      }, 200);
    }, 200);
  });

  it('ignores other sessions when --session is set', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    let called = false;

    watcher = watch({
      todosDir: dir,
      session: 'target-session',
      onComplete() { called = true; },
    });

    // Write to a different session — should be ignored
    fs.writeFileSync(path.join(dir, 'other-session.json'), JSON.stringify([
      { content: 'task', status: 'completed' },
    ]));

    setTimeout(() => {
      assert.equal(called, false);
      done();
    }, 300);
  });

  it('fires when the correct session completes', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));

    watcher = watch({
      todosDir: dir,
      session: 'target-session',
      onComplete({ sessionId }) {
        assert.equal(sessionId, 'target-session');
        done();
      },
    });

    fs.writeFileSync(path.join(dir, 'target-session.json'), JSON.stringify([
      { content: 'task', status: 'completed' },
    ]));
  });

  it('ignores non-JSON files', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    let called = false;

    watcher = watch({
      todosDir: dir,
      onComplete() { called = true; },
    });

    fs.writeFileSync(path.join(dir, 'notes.txt'), 'hello');

    setTimeout(() => {
      assert.equal(called, false);
      done();
    }, 300);
  });

  // --- onChange ---

  it('calls onChange with status changes', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    const sessionFile = path.join(dir, 'session-change.json');

    watcher = watch({
      todosDir: dir,
      onChange({ sessionId, changes, tasks }) {
        // First write is all new tasks (from: null), skip it
        const statusChanges = changes.filter(c => c.from !== null);
        if (statusChanges.length === 0) return;

        assert.equal(sessionId, 'session-change');
        assert.equal(statusChanges.length, 1);
        assert.equal(statusChanges[0].content, 'task 1');
        assert.equal(statusChanges[0].from, 'pending');
        assert.equal(statusChanges[0].to, 'in_progress');
        done();
      },
    });

    fs.writeFileSync(sessionFile, JSON.stringify([
      { content: 'task 1', status: 'pending' },
      { content: 'task 2', status: 'pending' },
    ]));

    setTimeout(() => {
      fs.writeFileSync(sessionFile, JSON.stringify([
        { content: 'task 1', status: 'in_progress' },
        { content: 'task 2', status: 'pending' },
      ]));
    }, 200);
  });

  it('calls onChange for new tasks with from: null', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    const sessionFile = path.join(dir, 'session-new.json');

    watcher = watch({
      todosDir: dir,
      onChange({ changes }) {
        assert.equal(changes.length, 1);
        assert.equal(changes[0].from, null);
        assert.equal(changes[0].to, 'pending');
        done();
      },
    });

    fs.writeFileSync(sessionFile, JSON.stringify([
      { content: 'brand new task', status: 'pending' },
    ]));
  });

  it('can use both onChange and onComplete together', (t, done) => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'test-'));
    const sessionFile = path.join(dir, 'session-both.json');
    let changeFired = false;
    let completeFired = false;

    watcher = watch({
      todosDir: dir,
      onChange() { changeFired = true; },
      onComplete() {
        completeFired = true;
        assert.ok(changeFired, 'onChange should have fired before onComplete');
        done();
      },
    });

    fs.writeFileSync(sessionFile, JSON.stringify([
      { content: 'task', status: 'pending' },
    ]));

    setTimeout(() => {
      fs.writeFileSync(sessionFile, JSON.stringify([
        { content: 'task', status: 'completed' },
      ]));
    }, 200);
  });
});
