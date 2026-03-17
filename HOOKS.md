---
title: "Claude Code Hooks Reference"
date: 2026-03-17
description: "Complete reference for all hook events available in Claude Code, including hook types, matcher patterns, and configuration locations."
---

## Overview

Hooks are user-defined handlers that execute automatically at specific points in Claude Code's lifecycle. They provide deterministic control over behavior — ensuring certain actions always happen rather than relying on the LLM to decide. Hooks can run shell commands, POST to HTTP endpoints, invoke a single-turn LLM prompt, or spawn a multi-turn subagent.

## Details

### Hook Events

| Event | When it fires |
|---|---|
| `SessionStart` | When a session begins or resumes |
| `UserPromptSubmit` | When you submit a prompt, before Claude processes it |
| `PreToolUse` | Before a tool call executes — can block it |
| `PermissionRequest` | When a permission dialog appears |
| `PostToolUse` | After a tool call succeeds |
| `PostToolUseFailure` | After a tool call fails |
| `Notification` | When Claude Code sends a notification |
| `SubagentStart` | When a subagent is spawned |
| `SubagentStop` | When a subagent finishes |
| `Stop` | When Claude finishes responding |
| `TeammateIdle` | When an agent team teammate is about to go idle |
| `TaskCompleted` | When a task is being marked as completed |
| `InstructionsLoaded` | When a CLAUDE.md or `.claude/rules/*.md` file is loaded into context |
| `ConfigChange` | When a configuration file changes during a session |
| `WorktreeCreate` | When a worktree is being created via `--worktree` or `isolation: "worktree"` — replaces default git behavior |
| `WorktreeRemove` | When a worktree is being removed (at session exit or subagent finish) |
| `PreCompact` | Before context compaction |
| `PostCompact` | After context compaction completes |
| `Elicitation` | When an MCP server requests user input during a tool call |
| `ElicitationResult` | After a user responds to an MCP elicitation, before the response goes back to the server |
| `SessionEnd` | When a session terminates |

### Hook Handler Types

Each hook specifies a `type` field:

| Type | Description |
|---|---|
| `command` | Run a shell command. Input arrives on stdin as JSON. Output via stdout/stderr/exit code. |
| `http` | POST event data to a URL. Response body uses same JSON format as command output. |
| `prompt` | Single-turn LLM evaluation (Haiku by default). Returns `{"ok": true/false, "reason": "..."}`. |
| `agent` | Multi-turn subagent with tool access. Up to 50 tool-use turns, 60s default timeout. Same ok/reason format. |

### Matcher Patterns

Matchers are regex patterns that filter when a hook fires. Each event type matches on a specific field:

| Event | Matches on | Example values |
|---|---|---|
| `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest` | tool name | `Bash`, `Edit\|Write`, `mcp__.*` |
| `SessionStart` | how session started | `startup`, `resume`, `clear`, `compact` |
| `SessionEnd` | why session ended | `clear`, `logout`, `prompt_input_exit`, `bypass_permissions_disabled`, `other` |
| `Notification` | notification type | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `SubagentStart` / `SubagentStop` | agent type | `Bash`, `Explore`, `Plan`, or custom names |
| `PreCompact` | trigger cause | `manual`, `auto` |
| `ConfigChange` | config source | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` |
| `UserPromptSubmit`, `Stop`, `TeammateIdle`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove` | — | no matcher support; always fires |

Omitting a matcher (or using `"*"`) means the hook fires on every occurrence of that event.

### Exit Codes for Command Hooks

- **Exit 0**: allow the action. Stdout is added to Claude's context for `UserPromptSubmit` and `SessionStart` hooks.
- **Exit 2**: block the action. Stderr is shown to Claude as feedback so it can adjust.
- **Any other exit code**: action proceeds; stderr is logged but not shown to Claude (toggle verbose with `Ctrl+O`).

### Structured JSON Output

For finer control, exit 0 and print JSON to stdout instead:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Use rg instead of grep"
  }
}
```

`permissionDecision` options for `PreToolUse`: `"allow"`, `"deny"`, `"ask"`.
`PostToolUse` and `Stop` use a top-level `{"decision": "block"}`.
`PermissionRequest` uses `hookSpecificOutput.decision.behavior`.

## Usage

### Minimal configuration shape

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/my-hook.sh"
          }
        ]
      }
    ]
  }
}
```

### Common patterns

**Auto-format after edits:**
```json
"PostToolUse": [{"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"}]}]
```

**Desktop notifications (macOS):**
```json
"Notification": [{"matcher": "", "hooks": [{"type": "command", "command": "osascript -e 'display notification \"Claude needs attention\" with title \"Claude Code\"'"}]}]
```

**Re-inject context after compaction:**
```json
"SessionStart": [{"matcher": "compact", "hooks": [{"type": "command", "command": "echo 'Reminder: use Bun, not npm.'"}]}]
```

**Prompt-based stop check:**
```json
"Stop": [{"hooks": [{"type": "prompt", "prompt": "Check if all tasks are complete. If not, respond with {\"ok\": false, \"reason\": \"what remains\"}"}]}]
```

### Configuration locations

| Location | Scope | Shareable |
|---|---|---|
| `~/.claude/settings.json` | All projects | No — local to your machine |
| `.claude/settings.json` | Single project | Yes — can be committed |
| `.claude/settings.local.json` | Single project | No — gitignored |
| Managed policy settings | Organization-wide | Yes — admin-controlled |
| Plugin `hooks/hooks.json` | When plugin is enabled | Yes — bundled with plugin |
| Skill or agent frontmatter | While component is active | Yes — defined in component file |

Browse configured hooks with `/hooks` in the CLI. Disable all hooks at once with `"disableAllHooks": true` in settings.

## Caveats

- **Hook not firing?** Check `/hooks` to confirm it appears, verify matcher is case-sensitive and matches exactly, and confirm you're targeting the right event.
- **Infinite loop on Stop hooks:** Parse `stop_hook_active` from stdin and `exit 0` early if it's `true`.
- **JSON validation errors:** Shell profile `echo` statements get prepended to hook stdout. Wrap them in `if [[ $- == *i* ]]; then ... fi` to skip in non-interactive shells.
- **`PermissionRequest` hooks don't fire in non-interactive mode** (`-p`). Use `PreToolUse` for automated permission decisions instead.
- **`PostToolUse` cannot undo actions** — the tool has already run.
- **Hook timeout** defaults to 10 minutes; configurable per hook via `timeout` field (in seconds).
- Manual edits to settings files while Claude Code is running won't take effect until you reload via `/hooks` or restart the session.
- Debug with `Ctrl+O` (verbose mode) or `claude --debug`.
