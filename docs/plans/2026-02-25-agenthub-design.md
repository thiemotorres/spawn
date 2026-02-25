# AgentHub Design

## Overview

A cross-platform desktop app (Tauri + React) for managing git projects and Claude Code agents working on them. Replaces the chaos of multiple terminal tabs with a unified view of projects, running agents, tasks, and project files. Designed from day one to support a future mobile companion app.

## Architecture

The app runs as a single Tauri process with two layers:

1. **Rust backend** — manages all stateful operations: scanning git repos, spawning/killing Claude Code agents via PTY, a WebSocket server for real-time state and terminal I/O, and a REST API for CRUD operations.

2. **React frontend** — the desktop UI, communicates with the Rust backend via Tauri IPC commands for fast local operations and WebSocket for real-time updates (agent output, status changes).

```
[React UI] ──IPC──► [Rust Core]
                        ├── PTY manager (agents)
                        ├── Project scanner
                        ├── File I/O
                        ├── WebSocket server ◄── [Mobile app]
                        └── REST API
```

The future mobile app connects to the same WebSocket + REST API over local network or a tunnel (e.g. Tailscale) — no backend changes required.

App state (registered projects, custom tasks, session history) is stored in a local SQLite database. Git repos and `.agenthub.md` files remain on disk — the app never owns them.

## Data Model

### Project
- Path on disk, name, description
- `.agenthub.md` — per-project setup instructions / initial prompt for agents
- Git metadata (current branch, last commit)
- List of active and past agent sessions

### Agent Session
- Attached to a project
- PTY process handle (if running)
- Status: `running` | `idle` | `stopped`
- Scrollback buffer for review after reconnecting

### Task
- Source: `github_issue` | `custom`
- Title, description, status
- Optional link to the agent session working on it

## UI Layout

Three-panel layout:

```
┌─────────────┬──────────────────────────┬─────────────────┐
│             │                          │                 │
│  Projects   │   Agent Terminals        │   Project Info  │
│  Sidebar    │   (tabbed panes)         │   Panel         │
│             │                          │                 │
│ • Project A │  ┌──────────────────┐   │  Tasks          │
│   ● agent1  │  │ xterm.js         │   │  ─────────────  │
│   ○ agent2  │  │                  │   │  [ ] Issue #12  │
│             │  │                  │   │  [x] Custom task│
│ • Project B │  └──────────────────┘   │                 │
│   ● agent3  │   [agent1][agent2][+]   │  Files          │
│             │                          │  ─────────────  │
│ [+] Add     │                          │  CLAUDE.md      │
│             │                          │  .agenthub.md   │
└─────────────┴──────────────────────────┴─────────────────┘
```

- **Left sidebar** — project list with active agents (● running, ○ idle). Click to select project.
- **Center** — tabbed terminal panes, one per agent. "+" spawns a new agent on the selected project.
- **Right panel** — tasks and quick-access markdown files for the selected project. Click a file to open an inline editor overlay.

## Agent Launch Flow

1. User clicks "+" on a project
2. App checks for `.agenthub.md` in the project root
3. A modal appears with the file contents (editable before launch, blank if no file exists)
4. User clicks "Launch" — Rust backend spawns `claude` in a new PTY with the `.agenthub.md` content as the initial prompt
5. A new terminal tab appears connected to the live PTY

### Resuming Sessions
- **Idle sessions** (process still running) — click in sidebar to reconnect terminal to existing PTY
- **Stopped sessions** — show scrollback as read-only with a "Restart" button that relaunches with the same `.agenthub.md` prompt

## GitHub Integration (v1)

- Per-project GitHub token stored in system keychain (Tauri keyring plugin)
- Fetches issues from the repo's GitHub API, displayed in the right panel
- Issues can be locally linked to an agent session
- One-click to open issue in browser

Custom tasks (non-GitHub repos) stored in SQLite with title, description, status (`todo` | `in_progress` | `done`), and optional agent session link.

No PR/commit integration in v1.

## Out of Scope (v1)

- Mobile app (architecture supports it, not built yet)
- GitHub PR/commit integration
- Multi-user / team features
- Non-Claude Code agent types
