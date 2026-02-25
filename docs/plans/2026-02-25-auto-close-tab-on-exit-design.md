# Design: Auto-close Tab on Process Exit

**Date:** 2026-02-25
**Status:** Approved

## Problem

When a process running in a tab (e.g. `claude`) exits naturally, the tab remains open with a stale "running" state. The frontend has no mechanism to detect natural process exit — only explicit user-initiated kills are handled.

## Solution

Use Tauri's event system to push a `session-exited` event from the backend to the frontend when a PTY process exits.

## Backend Changes (`pty_manager.rs`)

Pass `AppHandle` into `spawn_agent`. After the PTY reader loop exits (EOF or read error — meaning the process has died):

1. Emit `app_handle.emit("session-exited", session_id)`
2. Delete the session row from the DB (same cleanup `kill_agent` does today)

The `AppHandle` is available on `AppState` and just needs to be threaded into the blocking reader task.

## Frontend Changes (`TerminalPane.tsx`)

Add a `listen('session-exited', handler)` effect. When fired:

1. Call `store.kill(sessionId)` to remove the session from the store and clean up the write ref
2. Existing tab-switching fallback logic handles active-tab changes automatically
3. If the last tab closes, the tab list renders empty — the user spawns a new one manually

## Out of Scope

- No changes to `sessions.ts` store (existing `kill` already handles removal)
- No changes to `Terminal.tsx`, `useTerminalWs.ts`, or the WebSocket protocol
- No "last tab" replacement behavior — empty state is acceptable
