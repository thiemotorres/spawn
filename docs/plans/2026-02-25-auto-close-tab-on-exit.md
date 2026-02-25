# Auto-close Tab on Process Exit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a PTY process exits naturally, its tab closes automatically.

**Architecture:** Emit a Tauri `session-exited` event from the PTY reader thread (Rust) when the process exits; `TerminalPane` listens for it and removes the tab via the existing `onKill` path.

**Tech Stack:** Rust (Tauri v2), TypeScript/React, `@tauri-apps/api/event`

---

### Task 1: Emit `session-exited` event from PTY reader thread

**Files:**
- Modify: `src-tauri/src/pty_manager.rs`

**Step 1: Add `app_handle` parameter to `spawn_agent` signature**

In `pty_manager.rs`, change the `spawn_agent` signature (line 69) from:

```rust
pub fn spawn_agent(
    &self,
    session_id: String,
    project_id: String,
    project_path: &str,
    command: &str,
    args: &[String],
    output_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
) -> Result<String> {
```

to:

```rust
pub fn spawn_agent(
    &self,
    session_id: String,
    project_id: String,
    project_path: &str,
    command: &str,
    args: &[String],
    output_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
    app_handle: tauri::AppHandle,
) -> Result<String> {
```

**Step 2: Clone `app_handle` before the blocking task and emit on exit**

Inside `spawn_agent`, before `tokio::task::spawn_blocking`, add:

```rust
let app = app_handle.clone();
```

Then at the end of the blocking closure, after setting `s.status = SessionStatus::Stopped`, add the emit. Replace lines 117-121:

```rust
if let Ok(mut map) = sessions_arc.lock() {
    if let Some(s) = map.get_mut(&sid) {
        s.status = SessionStatus::Stopped;
    }
}
// Notify frontend so the tab auto-closes
let _ = app.emit("session-exited", sid.clone());
```

**Step 3: Repeat for `spawn_shell`**

`spawn_shell` (line 138) has the same reader loop structure. Add the same `app_handle: tauri::AppHandle` parameter and the same emit at the end of its blocking closure.

**Step 4: Build to verify it compiles**

```bash
cd src-tauri && cargo build 2>&1 | head -40
```

Expected: compiler error about `spawn_agent` callers not passing `app_handle` (that's fine — fixed in Task 2).

---

### Task 2: Pass `AppHandle` through from commands

**Files:**
- Modify: `src-tauri/src/sessions.rs`

**Step 1: Update `spawn_agent` command signature**

In `sessions.rs`, change `spawn_agent` (line 62) to add `app: tauri::AppHandle`:

```rust
#[tauri::command]
pub async fn spawn_agent(
    project_id: String,
    project_path: String,
    agent_name: String,
    command: String,
    args: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<AgentSession, String> {
```

**Step 2: Pass `app` to `state.pty.spawn_agent`**

Change the call at line 76 to:

```rust
state
    .pty
    .spawn_agent(
        session.id.clone(),
        project_id,
        &project_path,
        &command,
        &args,
        state.terminal_tx.clone(),
        app,
    )
    .map_err(|e| e.to_string())?;
```

**Step 3: Update `spawn_shell` command**

In `sessions.rs`, change `spawn_shell` (line 167) to add `app: tauri::AppHandle` and pass it:

```rust
#[tauri::command]
pub async fn spawn_shell(
    session_id: String,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    if state.pty.get_session(&session_id).is_some() {
        return Ok(());
    }
    state
        .pty
        .spawn_shell(session_id, &project_path, state.terminal_tx.clone(), app)
        .map(|_| ())
        .map_err(|e| e.to_string())
}
```

**Step 4: Build to verify it compiles**

```bash
cd src-tauri && cargo build 2>&1 | head -40
```

Expected: clean build (or only unrelated warnings).

**Step 5: Commit**

```bash
git add src-tauri/src/pty_manager.rs src-tauri/src/sessions.rs
git commit -m "feat: emit session-exited tauri event when PTY process exits"
```

---

### Task 3: Listen for `session-exited` in TerminalPane

**Files:**
- Modify: `src/components/TerminalPane.tsx`

**Step 1: Import `listen` from Tauri**

At the top of `TerminalPane.tsx`, add to existing imports:

```typescript
import { listen } from '@tauri-apps/api/event'
```

**Step 2: Add the listener effect**

Add this `useEffect` inside the `TerminalPane` component, after the existing effects (around line 63):

```typescript
useEffect(() => {
  let unlisten: (() => void) | undefined
  listen<string>('session-exited', (event) => {
    const sessionId = event.payload
    termWriteRefs.current.delete(sessionId)
    onKill(sessionId)
  }).then((fn) => { unlisten = fn })
  return () => { unlisten?.() }
}, [onKill])
```

**Step 3: Verify the app runs**

```bash
npm run tauri dev
```

Open a project, spawn a claude session. In the terminal, type `exit` (or let the process finish). The tab should disappear automatically.

**Step 4: Commit**

```bash
git add src/components/TerminalPane.tsx
git commit -m "feat: auto-close tab when process exits via session-exited event"
```
