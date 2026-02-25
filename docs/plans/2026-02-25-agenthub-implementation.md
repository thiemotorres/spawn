# AgentHub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Tauri + React desktop app that manages git projects and Claude Code agent sessions from a single unified UI.

**Architecture:** Rust backend handles PTY process management, SQLite state, WebSocket server, and REST API. React frontend renders the three-panel UI (project sidebar, tabbed terminals, project info panel) and communicates via Tauri IPC + WebSocket. The embedded WebSocket server is designed for future mobile client access.

**Tech Stack:** Tauri v2, React 18 + TypeScript, Vite, Tailwind CSS, Zustand, xterm.js, SQLite (sqlx), tokio, axum (WebSocket + REST), portable-pty, keyring

---

## Phase 1: Project Scaffolding

### Task 1: Scaffold Tauri + React project

**Files:**
- Create: `src-tauri/` (Tauri backend)
- Create: `src/` (React frontend)
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`
- Create: `src-tauri/Cargo.toml`

**Step 1: Install prerequisites**

```bash
# Ensure Rust is installed
rustup --version

# Ensure Tauri CLI is installed
cargo install tauri-cli --version "^2.0"

# Ensure Node/bun is available
bun --version
```

**Step 2: Scaffold the project**

```bash
bunx create-tauri-app agenthub \
  --template react-ts \
  --manager bun \
  --yes
cd agenthub
```

**Step 3: Install frontend dependencies**

```bash
bun add @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
bun add zustand
bun add tailwindcss @tailwindcss/vite
bun add -d vitest @testing-library/react @testing-library/user-event jsdom @vitejs/plugin-react
```

**Step 4: Configure Tailwind in `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // required for Tauri
  clearScreen: false,
  server: { port: 1420, strictPort: true },
})
```

**Step 5: Add `src/index.css` Tailwind import**

```css
@import "tailwindcss";
```

**Step 6: Configure vitest in `vite.config.ts`**

Add to the config:
```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test-setup.ts'],
}
```

Create `src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
```

**Step 7: Add Rust dependencies to `src-tauri/Cargo.toml`**

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-keyring = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
axum = { version = "0.7", features = ["ws"] }
portable-pty = "0.8"
uuid = { version = "1", features = ["v4"] }
anyhow = "1"
keyring = "2"
git2 = "0.19"
reqwest = { version = "0.12", features = ["json"] }

[dev-dependencies]
tempfile = "3"
```

**Step 8: Verify the project builds**

```bash
bun run tauri dev
```

Expected: App window opens with default Tauri + React template.

**Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri + React project"
```

---

### Task 2: SQLite database setup

**Files:**
- Create: `src-tauri/migrations/001_initial.sql`
- Create: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the migration**

Create `src-tauri/migrations/001_initial.sql`:
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  github_repo TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE agent_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'stopped', -- running | idle | stopped
  scrollback TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'custom', -- custom | github_issue
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo', -- todo | in_progress | done
  github_issue_number INTEGER,
  session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Step 2: Write `src-tauri/src/db.rs`**

```rust
use anyhow::Result;
use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
use std::path::Path;

pub async fn init(data_dir: &Path) -> Result<SqlitePool> {
    let db_path = data_dir.join("agenthub.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
```

**Step 3: Write the test**

Create `src-tauri/src/db.rs` test section:
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_db_init_creates_tables() {
        let dir = tempdir().unwrap();
        let pool = init(dir.path()).await.unwrap();

        // Should be able to query tables without error
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM projects")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0);
    }
}
```

**Step 4: Run the test**

```bash
cd src-tauri && cargo test db::tests
```

Expected: PASS

**Step 5: Wire pool into Tauri app state in `src-tauri/src/main.rs`**

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub db: SqlitePool,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&data_dir).unwrap();

            let pool = tauri::async_runtime::block_on(db::init(&data_dir)).unwrap();
            app.manage(AppState { db: pool });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

**Step 6: Commit**

```bash
cd ..
git add src-tauri/migrations/ src-tauri/src/db.rs src-tauri/src/main.rs
git commit -m "feat: SQLite database with migrations"
```

---

## Phase 2: Project Management

### Task 3: Project CRUD — Rust commands

**Files:**
- Create: `src-tauri/src/projects.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the failing tests**

```rust
// src-tauri/src/projects.rs
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::tempdir;

    async fn test_pool() -> SqlitePool {
        let dir = tempdir().unwrap();
        db::init(dir.path()).await.unwrap()
    }

    #[tokio::test]
    async fn test_add_project() {
        let pool = test_pool().await;
        let dir = tempdir().unwrap();
        let project = add_project_db(&pool, dir.path().to_str().unwrap(), "My Project", None).await.unwrap();
        assert_eq!(project.name, "My Project");
        assert_eq!(project.path, dir.path().to_str().unwrap());
    }

    #[tokio::test]
    async fn test_list_projects() {
        let pool = test_pool().await;
        let dir = tempdir().unwrap();
        add_project_db(&pool, dir.path().to_str().unwrap(), "P1", None).await.unwrap();
        let projects = list_projects_db(&pool).await.unwrap();
        assert_eq!(projects.len(), 1);
    }

    #[tokio::test]
    async fn test_remove_project() {
        let pool = test_pool().await;
        let dir = tempdir().unwrap();
        let p = add_project_db(&pool, dir.path().to_str().unwrap(), "P1", None).await.unwrap();
        remove_project_db(&pool, &p.id).await.unwrap();
        let projects = list_projects_db(&pool).await.unwrap();
        assert_eq!(projects.len(), 0);
    }
}
```

**Step 2: Run to verify they fail**

```bash
cd src-tauri && cargo test projects::tests
```

Expected: FAIL — functions not defined

**Step 3: Implement `src-tauri/src/projects.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;
use git2::Repository;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub github_repo: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectWithGit {
    #[serde(flatten)]
    pub project: Project,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    pub has_agenthub_md: bool,
}

pub async fn add_project_db(pool: &SqlitePool, path: &str, name: &str, description: Option<&str>) -> Result<Project> {
    let id = Uuid::new_v4().to_string();
    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (id, name, path, description) VALUES (?, ?, ?, ?) RETURNING *"
    )
    .bind(&id)
    .bind(name)
    .bind(path)
    .bind(description)
    .fetch_one(pool)
    .await?;
    Ok(project)
}

pub async fn list_projects_db(pool: &SqlitePool) -> Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY created_at")
        .fetch_all(pool)
        .await?;
    Ok(projects)
}

pub async fn remove_project_db(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub fn get_git_info(path: &str) -> (Option<String>, Option<String>) {
    let Ok(repo) = Repository::open(path) else { return (None, None) };
    let branch = repo.head().ok()
        .and_then(|h| h.shorthand().map(str::to_string));
    let last_commit = repo.head().ok()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| c.summary().unwrap_or("").to_string());
    (branch, last_commit)
}

// Tauri commands
#[tauri::command]
pub async fn list_projects(state: tauri::State<'_, crate::AppState>) -> Result<Vec<ProjectWithGit>, String> {
    let projects = list_projects_db(&state.db).await.map_err(|e| e.to_string())?;
    let result = projects.into_iter().map(|p| {
        let (branch, last_commit) = get_git_info(&p.path);
        let has_agenthub_md = std::path::Path::new(&p.path).join(".agenthub.md").exists();
        ProjectWithGit { project: p, branch, last_commit, has_agenthub_md }
    }).collect();
    Ok(result)
}

#[tauri::command]
pub async fn add_project(
    path: String,
    name: String,
    description: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Project, String> {
    add_project_db(&state.db, &path, &name, description.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_project(id: String, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    remove_project_db(&state.db, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_agenthub_md(path: String) -> Option<String> {
    let file_path = std::path::Path::new(&path).join(".agenthub.md");
    std::fs::read_to_string(file_path).ok()
}

#[tauri::command]
pub fn write_agenthub_md(path: String, content: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path).join(".agenthub.md");
    std::fs::write(file_path, content).map_err(|e| e.to_string())
}
```

**Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test projects::tests
```

Expected: PASS

**Step 5: Register commands in `main.rs`**

```rust
mod projects;
// in tauri::Builder:
.invoke_handler(tauri::generate_handler![
    projects::list_projects,
    projects::add_project,
    projects::remove_project,
    projects::read_agenthub_md,
    projects::write_agenthub_md,
])
```

**Step 6: Commit**

```bash
git add src-tauri/src/projects.rs src-tauri/src/main.rs
git commit -m "feat: project CRUD Tauri commands"
```

---

### Task 4: Project store + sidebar UI

**Files:**
- Create: `src/store/projects.ts`
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Sidebar.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/Sidebar.test.tsx
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'

const mockProjects = [
  { project: { id: '1', name: 'ProjectA', path: '/a', created_at: 0 }, branch: 'main', last_commit: 'fix bug', has_agenthub_md: true },
  { project: { id: '2', name: 'ProjectB', path: '/b', created_at: 0 }, branch: null, last_commit: null, has_agenthub_md: false },
]

test('renders project names', () => {
  render(<Sidebar projects={mockProjects} selectedProjectId={null} onSelect={() => {}} onAdd={() => {}} />)
  expect(screen.getByText('ProjectA')).toBeInTheDocument()
  expect(screen.getByText('ProjectB')).toBeInTheDocument()
})

test('highlights selected project', () => {
  render(<Sidebar projects={mockProjects} selectedProjectId="1" onSelect={() => {}} onAdd={() => {}} />)
  const item = screen.getByText('ProjectA').closest('li')
  expect(item).toHaveClass('bg-zinc-700')
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/components/Sidebar.test.tsx
```

Expected: FAIL

**Step 3: Implement `src/store/projects.ts`**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface Project {
  id: string
  name: string
  path: string
  description?: string
  github_repo?: string
  created_at: number
}

export interface ProjectWithGit {
  project: Project
  branch: string | null
  last_commit: string | null
  has_agenthub_md: boolean
}

interface ProjectStore {
  projects: ProjectWithGit[]
  selectedProjectId: string | null
  load: () => Promise<void>
  add: (path: string, name: string, description?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  select: (id: string | null) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  load: async () => {
    const projects = await invoke<ProjectWithGit[]>('list_projects')
    set({ projects })
  },
  add: async (path, name, description) => {
    await invoke('add_project', { path, name, description })
    await get().load()
  },
  remove: async (id) => {
    await invoke('remove_project', { id })
    await get().load()
  },
  select: (id) => set({ selectedProjectId: id }),
}))
```

**Step 4: Implement `src/components/Sidebar.tsx`**

```tsx
import { ProjectWithGit } from '../store/projects'

interface Props {
  projects: ProjectWithGit[]
  selectedProjectId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
}

export function Sidebar({ projects, selectedProjectId, onSelect, onAdd }: Props) {
  return (
    <aside className="w-56 flex-shrink-0 bg-zinc-800 flex flex-col h-full border-r border-zinc-700">
      <div className="p-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        Projects
      </div>
      <ul className="flex-1 overflow-y-auto">
        {projects.map(({ project, branch }) => (
          <li
            key={project.id}
            className={`px-3 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
              selectedProjectId === project.id ? 'bg-zinc-700' : ''
            }`}
            onClick={() => onSelect(project.id)}
          >
            <div className="text-sm text-zinc-100 truncate">{project.name}</div>
            {branch && (
              <div className="text-xs text-zinc-400 truncate">{branch}</div>
            )}
          </li>
        ))}
      </ul>
      <button
        onClick={onAdd}
        className="m-2 p-2 text-sm text-zinc-300 border border-zinc-600 rounded hover:bg-zinc-700 transition-colors"
      >
        + Add Project
      </button>
    </aside>
  )
}
```

**Step 5: Run tests**

```bash
bun run vitest run src/components/Sidebar.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/store/projects.ts src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "feat: project sidebar with Zustand store"
```

---

### Task 5: Add project modal + folder picker

**Files:**
- Create: `src/components/AddProjectModal.tsx`
- Create: `src/components/AddProjectModal.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/AddProjectModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { AddProjectModal } from './AddProjectModal'

test('calls onAdd with name and path', async () => {
  const onAdd = vi.fn()
  render(<AddProjectModal onAdd={onAdd} onClose={() => {}} />)

  fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'My App' } })
  // simulate path already filled (folder picker fills it)
  fireEvent.change(screen.getByLabelText('Path'), { target: { value: '/home/user/myapp' } })
  fireEvent.click(screen.getByText('Add Project'))

  expect(onAdd).toHaveBeenCalledWith('/home/user/myapp', 'My App', undefined)
})

test('disables Add button when name or path is empty', () => {
  render(<AddProjectModal onAdd={() => {}} onClose={() => {}} />)
  expect(screen.getByText('Add Project')).toBeDisabled()
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/components/AddProjectModal.test.tsx
```

**Step 3: Implement `src/components/AddProjectModal.tsx`**

```tsx
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'

interface Props {
  onAdd: (path: string, name: string, description?: string) => void
  onClose: () => void
}

export function AddProjectModal({ onAdd, onClose }: Props) {
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected === 'string') {
      setPath(selected)
      if (!name) setName(selected.split('/').pop() ?? '')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 w-96 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">Add Project</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="name">Project Name</label>
            <input
              id="name"
              className="w-full bg-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="path">Path</label>
            <div className="flex gap-2">
              <input
                id="path"
                className="flex-1 bg-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm"
                value={path}
                onChange={e => setPath(e.target.value)}
              />
              <button
                onClick={pickFolder}
                className="px-3 py-2 text-sm bg-zinc-600 rounded hover:bg-zinc-500"
              >
                Browse
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1" htmlFor="desc">Description (optional)</label>
            <input
              id="desc"
              className="w-full bg-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            disabled={!name || !path}
            onClick={() => onAdd(path, name, description || undefined)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Project
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Run tests**

```bash
bun run vitest run src/components/AddProjectModal.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/AddProjectModal.tsx src/components/AddProjectModal.test.tsx
git commit -m "feat: add project modal with folder picker"
```

---

## Phase 3: Agent / PTY Management

### Task 6: PTY manager in Rust

**Files:**
- Create: `src-tauri/src/pty_manager.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the tests**

```rust
// src-tauri/src/pty_manager.rs (test section)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_id_is_uuid() {
        let manager = PtyManager::new();
        // spawning requires a real shell — test the state management only
        assert_eq!(manager.sessions.lock().unwrap().len(), 0);
    }

    #[test]
    fn test_get_nonexistent_session_returns_none() {
        let manager = PtyManager::new();
        let result = manager.get_session("nonexistent");
        assert!(result.is_none());
    }
}
```

**Step 2: Run to verify they fail**

```bash
cd src-tauri && cargo test pty_manager::tests
```

**Step 3: Implement `src-tauri/src/pty_manager.rs`**

```rust
use anyhow::Result;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Running,
    Idle,
    Stopped,
}

pub struct PtySession {
    pub id: String,
    pub project_id: String,
    pub status: SessionStatus,
    pub scrollback: Vec<u8>,
    writer: Box<dyn std::io::Write + Send>,
}

pub struct PtyManager {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self { sessions: Arc::new(Mutex::new(HashMap::new())) }
    }

    pub fn spawn_agent(
        &self,
        project_id: String,
        project_path: &str,
        initial_prompt: Option<String>,
        output_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
    ) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let pty_system = NativePtySystem::default();
        let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })?;

        let mut cmd = CommandBuilder::new("claude");
        cmd.cwd(project_path);
        if let Some(prompt) = initial_prompt {
            cmd.arg("-p");
            cmd.arg(prompt);
        }

        let _child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;
        let mut reader = pair.master.try_clone_reader()?;

        let sid = session_id.clone();
        let sessions = Arc::clone(&self.sessions);
        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        let _ = output_tx.send((sid.clone(), data.clone()));
                        if let Ok(mut map) = sessions.lock() {
                            if let Some(s) = map.get_mut(&sid) {
                                s.scrollback.extend_from_slice(&data);
                            }
                        }
                    }
                }
            }
            if let Ok(mut map) = sessions.lock() {
                if let Some(s) = map.get_mut(&sid) {
                    s.status = SessionStatus::Stopped;
                }
            }
        });

        let session = PtySession {
            id: session_id.clone(),
            project_id,
            status: SessionStatus::Running,
            scrollback: Vec::new(),
            writer,
        };

        self.sessions.lock().unwrap().insert(session_id.clone(), session);
        Ok(session_id)
    }

    pub fn write_to_session(&self, id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions.get_mut(id).ok_or_else(|| anyhow::anyhow!("session not found"))?;
        session.writer.write_all(data)?;
        Ok(())
    }

    pub fn get_session(&self, id: &str) -> Option<(SessionStatus, Vec<u8>)> {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(id).map(|s| (s.status.clone(), s.scrollback.clone()))
    }

    pub fn kill_session(&self, id: &str) {
        self.sessions.lock().unwrap().remove(id);
    }
}
```

**Step 4: Run tests**

```bash
cd src-tauri && cargo test pty_manager::tests
```

Expected: PASS

**Step 5: Add PtyManager to AppState**

In `src-tauri/src/main.rs`:
```rust
mod pty_manager;
use pty_manager::PtyManager;

pub struct AppState {
    pub db: SqlitePool,
    pub pty: PtyManager,
    pub terminal_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
}

// in setup:
let (terminal_tx, _) = tokio::sync::broadcast::channel(1024);
app.manage(AppState { db: pool, pty: PtyManager::new(), terminal_tx });
```

**Step 6: Commit**

```bash
git add src-tauri/src/pty_manager.rs src-tauri/src/main.rs
git commit -m "feat: PTY manager for spawning Claude Code agents"
```

---

### Task 7: Agent session Tauri commands + DB persistence

**Files:**
- Create: `src-tauri/src/sessions.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the tests**

```rust
// src-tauri/src/sessions.rs
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_create_and_list_sessions() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();

        // Insert a project first
        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/tmp')")
            .execute(&pool).await.unwrap();

        let session = create_session_db(&pool, "p1", "Session 1").await.unwrap();
        assert_eq!(session.project_id, "p1");
        assert_eq!(session.status, "stopped");

        let sessions = list_sessions_db(&pool, "p1").await.unwrap();
        assert_eq!(sessions.len(), 1);
    }

    #[tokio::test]
    async fn test_update_session_status() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();
        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1', 'T', '/tmp')")
            .execute(&pool).await.unwrap();
        let s = create_session_db(&pool, "p1", "S1").await.unwrap();
        update_session_status_db(&pool, &s.id, "running").await.unwrap();
        let sessions = list_sessions_db(&pool, "p1").await.unwrap();
        assert_eq!(sessions[0].status, "running");
    }
}
```

**Step 2: Run to verify they fail**

```bash
cd src-tauri && cargo test sessions::tests
```

**Step 3: Implement `src-tauri/src/sessions.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentSession {
    pub id: String,
    pub project_id: String,
    pub name: Option<String>,
    pub status: String,
    pub scrollback: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn create_session_db(pool: &SqlitePool, project_id: &str, name: &str) -> Result<AgentSession> {
    let id = Uuid::new_v4().to_string();
    let session = sqlx::query_as::<_, AgentSession>(
        "INSERT INTO agent_sessions (id, project_id, name) VALUES (?, ?, ?) RETURNING *"
    )
    .bind(&id).bind(project_id).bind(name)
    .fetch_one(pool).await?;
    Ok(session)
}

pub async fn list_sessions_db(pool: &SqlitePool, project_id: &str) -> Result<Vec<AgentSession>> {
    let sessions = sqlx::query_as::<_, AgentSession>(
        "SELECT * FROM agent_sessions WHERE project_id = ? ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(pool).await?;
    Ok(sessions)
}

pub async fn update_session_status_db(pool: &SqlitePool, id: &str, status: &str) -> Result<()> {
    sqlx::query("UPDATE agent_sessions SET status = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(status).bind(id)
        .execute(pool).await?;
    Ok(())
}

pub async fn save_scrollback_db(pool: &SqlitePool, id: &str, scrollback: &str) -> Result<()> {
    sqlx::query("UPDATE agent_sessions SET scrollback = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(scrollback).bind(id)
        .execute(pool).await?;
    Ok(())
}

// Tauri commands
#[tauri::command]
pub async fn spawn_agent(
    project_id: String,
    project_path: String,
    initial_prompt: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<AgentSession, String> {
    let session = create_session_db(&state.db, &project_id, "Agent").await.map_err(|e| e.to_string())?;
    state.pty.spawn_agent(
        project_id,
        &project_path,
        initial_prompt,
        state.terminal_tx.clone(),
    ).map_err(|e| e.to_string())?;
    update_session_status_db(&state.db, &session.id, "running").await.map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
pub async fn list_sessions(
    project_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<AgentSession>, String> {
    list_sessions_db(&state.db, &project_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_agent(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.pty.kill_session(&session_id);
    update_session_status_db(&state.db, &session_id, "stopped").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_to_agent(session_id: String, data: Vec<u8>, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    state.pty.write_to_session(&session_id, &data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_scrollback(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<u8>, String> {
    if let Some((_, scrollback)) = state.pty.get_session(&session_id) {
        return Ok(scrollback)
    }
    // Fallback to DB scrollback for stopped sessions
    let session = sqlx::query_as::<_, AgentSession>("SELECT * FROM agent_sessions WHERE id = ?")
        .bind(&session_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(session.and_then(|s| s.scrollback).unwrap_or_default().into_bytes())
}
```

**Step 4: Run tests**

```bash
cd src-tauri && cargo test sessions::tests
```

Expected: PASS

**Step 5: Register commands in main.rs**

```rust
mod sessions;
// add to invoke_handler:
sessions::spawn_agent, sessions::list_sessions, sessions::kill_agent,
sessions::write_to_agent, sessions::get_scrollback,
```

**Step 6: Commit**

```bash
git add src-tauri/src/sessions.rs src-tauri/src/main.rs
git commit -m "feat: agent session management commands"
```

---

### Task 8: WebSocket server for terminal I/O

**Files:**
- Create: `src-tauri/src/ws_server.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the test**

```rust
// src-tauri/src/ws_server.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_addr_default() {
        let addr = server_addr(9999);
        assert_eq!(addr.port(), 9999);
    }
}
```

**Step 2: Run to verify it fails**

```bash
cd src-tauri && cargo test ws_server::tests
```

**Step 3: Implement `src-tauri/src/ws_server.rs`**

```rust
use axum::{extract::ws::{WebSocket, WebSocketUpgrade, Message}, extract::State, routing::get, Router};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    TerminalOutput { session_id: String, data: Vec<u8> },
    TerminalInput { session_id: String, data: Vec<u8> },
    Ping,
}

pub fn server_addr(port: u16) -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], port))
}

pub async fn start(
    port: u16,
    terminal_tx: broadcast::Sender<(String, Vec<u8>)>,
) {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(terminal_tx);

    let addr = server_addr(port);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(tx): State<broadcast::Sender<(String, Vec<u8>)>>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, tx))
}

async fn handle_socket(mut socket: WebSocket, tx: broadcast::Sender<(String, Vec<u8>)>) {
    let mut rx = tx.subscribe();
    loop {
        tokio::select! {
            Ok((session_id, data)) = rx.recv() => {
                let msg = WsMessage::TerminalOutput { session_id, data };
                if let Ok(json) = serde_json::to_string(&msg) {
                    if socket.send(Message::Text(json)).await.is_err() { break }
                }
            }
            Some(Ok(msg)) = socket.recv() => {
                if let Message::Close(_) = msg { break }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_addr_default() {
        let addr = server_addr(9999);
        assert_eq!(addr.port(), 9999);
    }
}
```

**Step 4: Start the WebSocket server in `main.rs` setup**

```rust
mod ws_server;

// in setup, after managing state:
let tx = state.terminal_tx.clone();
tauri::async_runtime::spawn(async move {
    ws_server::start(9731, tx).await;
});
```

**Step 5: Run tests**

```bash
cd src-tauri && cargo test ws_server::tests
```

Expected: PASS

**Step 6: Commit**

```bash
git add src-tauri/src/ws_server.rs src-tauri/src/main.rs
git commit -m "feat: WebSocket server for terminal I/O streaming"
```

---

## Phase 4: Terminal UI

### Task 9: xterm.js terminal component

**Files:**
- Create: `src/components/Terminal.tsx`
- Create: `src/components/Terminal.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/Terminal.test.tsx
import { render, screen } from '@testing-library/react'
import { Terminal } from './Terminal'

test('renders terminal container', () => {
  render(<Terminal sessionId="test-id" onInput={() => {}} />)
  expect(screen.getByTestId('terminal-container')).toBeInTheDocument()
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/components/Terminal.test.tsx
```

**Step 3: Implement `src/components/Terminal.tsx`**

Note: xterm.js must be mocked in tests; the real implementation uses useEffect with DOM access.

```tsx
import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  onInput: (data: string) => void
  scrollback?: Uint8Array
}

export function Terminal({ sessionId, onInput, scrollback }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: { background: '#18181b' },
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontSize: 13,
      cursorBlink: true,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term

    if (scrollback) {
      term.write(scrollback)
    }

    term.onData(data => onInput(data))

    const observer = new ResizeObserver(() => fitAddon.fit())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      term.dispose()
    }
  }, [sessionId])

  // Expose write method via data attribute for parent to call
  useEffect(() => {
    // Parent uses writeToTerminal ref pattern — see TerminalPane
  }, [])

  return (
    <div
      ref={containerRef}
      data-testid="terminal-container"
      className="w-full h-full bg-zinc-900"
    />
  )
}
```

**Step 4: Mock xterm in test setup**

Add to `src/test-setup.ts`:
```ts
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(), loadAddon: vi.fn(), onData: vi.fn(),
    write: vi.fn(), dispose: vi.fn(),
  })),
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
```

**Step 5: Run tests**

```bash
bun run vitest run src/components/Terminal.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/Terminal.tsx src/components/Terminal.test.tsx src/test-setup.ts
git commit -m "feat: xterm.js terminal component"
```

---

### Task 10: Terminal pane with tabs + WebSocket connection

**Files:**
- Create: `src/components/TerminalPane.tsx`
- Create: `src/components/TerminalPane.test.tsx`
- Create: `src/hooks/useTerminalWs.ts`

**Step 1: Write the test**

```tsx
// src/components/TerminalPane.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalPane } from './TerminalPane'

const sessions = [
  { id: 's1', name: 'Agent 1', status: 'running', project_id: 'p1', scrollback: null, created_at: 0, updated_at: 0 },
  { id: 's2', name: 'Agent 2', status: 'stopped', project_id: 'p1', scrollback: null, created_at: 0, updated_at: 0 },
]

test('renders tabs for each session', () => {
  render(<TerminalPane sessions={sessions} onSpawn={() => {}} onKill={() => {}} />)
  expect(screen.getByText('Agent 1')).toBeInTheDocument()
  expect(screen.getByText('Agent 2')).toBeInTheDocument()
})

test('renders spawn button', () => {
  render(<TerminalPane sessions={[]} onSpawn={() => {}} onKill={() => {}} />)
  expect(screen.getByText('+')).toBeInTheDocument()
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/components/TerminalPane.test.tsx
```

**Step 3: Implement `src/hooks/useTerminalWs.ts`**

```ts
import { useEffect, useRef } from 'react'

interface TerminalOutput {
  type: 'TerminalOutput'
  session_id: string
  data: number[]
}

export function useTerminalWs(
  onOutput: (sessionId: string, data: Uint8Array) => void
) {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket('ws://127.0.0.1:9731/ws')
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg: TerminalOutput = JSON.parse(event.data)
        if (msg.type === 'TerminalOutput') {
          onOutput(msg.session_id, new Uint8Array(msg.data))
        }
      } catch {}
    }

    return () => ws.close()
  }, [])

  return wsRef
}
```

**Step 4: Implement `src/components/TerminalPane.tsx`**

```tsx
import { useState, useRef } from 'react'
import { Terminal } from './Terminal'
import { useTerminalWs } from '../hooks/useTerminalWs'
import { invoke } from '@tauri-apps/api/core'
import type { AgentSession } from '../store/sessions'

interface Props {
  sessions: AgentSession[]
  onSpawn: () => void
  onKill: (id: string) => void
}

export function TerminalPane({ sessions, onSpawn, onKill }: Props) {
  const [activeId, setActiveId] = useState<string | null>(sessions[0]?.id ?? null)
  const termRefs = useRef<Map<string, (data: Uint8Array) => void>>(new Map())

  useTerminalWs((sessionId, data) => {
    termRefs.current.get(sessionId)?.(data)
  })

  const handleInput = async (sessionId: string, data: string) => {
    const encoded = new TextEncoder().encode(data)
    await invoke('write_to_agent', { sessionId, data: Array.from(encoded) })
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Tabs */}
      <div className="flex items-center bg-zinc-800 border-b border-zinc-700 px-2 gap-1">
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={`px-3 py-2 text-sm rounded-t transition-colors flex items-center gap-2 ${
              activeId === s.id ? 'bg-zinc-900 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${s.status === 'running' ? 'bg-green-400' : 'bg-zinc-500'}`} />
            {s.name ?? 'Agent'}
            <span
              className="ml-1 text-zinc-500 hover:text-red-400"
              onClick={e => { e.stopPropagation(); onKill(s.id) }}
            >×</span>
          </button>
        ))}
        <button onClick={onSpawn} className="px-3 py-2 text-zinc-400 hover:text-zinc-100">+</button>
      </div>

      {/* Terminal panels */}
      <div className="flex-1 relative">
        {sessions.map(s => (
          <div key={s.id} className={`absolute inset-0 ${activeId === s.id ? 'block' : 'hidden'}`}>
            <Terminal
              sessionId={s.id}
              onInput={data => handleInput(s.id, data)}
              onReady={write => termRefs.current.set(s.id, write)}
            />
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            No agents running. Click + to spawn one.
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Update Terminal component to accept `onReady` prop**

In `src/components/Terminal.tsx`, add `onReady?: (write: (data: Uint8Array) => void) => void` to Props and call `onReady(data => term.write(data))` inside the effect after `term.open()`.

**Step 6: Run tests**

```bash
bun run vitest run src/components/TerminalPane.test.tsx
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/components/TerminalPane.tsx src/components/TerminalPane.test.tsx src/hooks/useTerminalWs.ts
git commit -m "feat: terminal pane with tabs and WebSocket connection"
```

---

## Phase 5: Agent Launch + Session Store

### Task 11: Launch agent modal

**Files:**
- Create: `src/components/LaunchAgentModal.tsx`
- Create: `src/components/LaunchAgentModal.test.tsx`
- Create: `src/store/sessions.ts`

**Step 1: Write the test**

```tsx
// src/components/LaunchAgentModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { LaunchAgentModal } from './LaunchAgentModal'

test('shows agenthub.md content when provided', () => {
  render(<LaunchAgentModal projectPath="/tmp" agenthubMd="Work on feature X" onLaunch={() => {}} onClose={() => {}} />)
  expect(screen.getByDisplayValue('Work on feature X')).toBeInTheDocument()
})

test('calls onLaunch with edited prompt', () => {
  const onLaunch = vi.fn()
  render(<LaunchAgentModal projectPath="/tmp" agenthubMd="Initial" onLaunch={onLaunch} onClose={() => {}} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Updated prompt' } })
  fireEvent.click(screen.getByText('Launch Agent'))
  expect(onLaunch).toHaveBeenCalledWith('Updated prompt')
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/components/LaunchAgentModal.test.tsx
```

**Step 3: Implement `src/store/sessions.ts`**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface AgentSession {
  id: string
  project_id: string
  name: string | null
  status: string
  scrollback: string | null
  created_at: number
  updated_at: number
}

interface SessionStore {
  sessions: AgentSession[]
  load: (projectId: string) => Promise<void>
  spawn: (projectId: string, projectPath: string, prompt?: string) => Promise<AgentSession>
  kill: (sessionId: string) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  load: async (projectId) => {
    const sessions = await invoke<AgentSession[]>('list_sessions', { projectId })
    set({ sessions })
  },
  spawn: async (projectId, projectPath, prompt) => {
    const session = await invoke<AgentSession>('spawn_agent', {
      projectId, projectPath, initialPrompt: prompt
    })
    await get().load(projectId)
    return session
  },
  kill: async (sessionId) => {
    await invoke('kill_agent', { sessionId })
    set(s => ({ sessions: s.sessions.filter(x => x.id !== sessionId) }))
  },
}))
```

**Step 4: Implement `src/components/LaunchAgentModal.tsx`**

```tsx
import { useState } from 'react'

interface Props {
  projectPath: string
  agenthubMd: string | null
  onLaunch: (prompt: string | undefined) => void
  onClose: () => void
}

export function LaunchAgentModal({ agenthubMd, onLaunch, onClose }: Props) {
  const [prompt, setPrompt] = useState(agenthubMd ?? '')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 w-[500px] shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-2">Launch Agent</h2>
        <p className="text-xs text-zinc-400 mb-3">
          Initial prompt (from .agenthub.md — edit before launching)
        </p>
        <textarea
          className="w-full bg-zinc-700 text-zinc-100 rounded p-3 text-sm h-40 resize-none focus:outline-none"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the work for this agent..."
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
          <button
            onClick={() => onLaunch(prompt || undefined)}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-500"
          >
            Launch Agent
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 5: Run tests**

```bash
bun run vitest run src/components/LaunchAgentModal.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/components/LaunchAgentModal.tsx src/components/LaunchAgentModal.test.tsx src/store/sessions.ts
git commit -m "feat: launch agent modal and session store"
```

---

## Phase 6: Right Panel — Files & Tasks

### Task 12: Project info panel with markdown editor

**Files:**
- Create: `src/components/ProjectPanel.tsx`
- Create: `src/components/MarkdownEditor.tsx`
- Create: `src/components/ProjectPanel.test.tsx`

**Step 1: Write the test**

```tsx
// src/components/ProjectPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { ProjectPanel } from './ProjectPanel'

const project = { id: '1', name: 'App', path: '/app', created_at: 0 }

test('renders files section', () => {
  render(<ProjectPanel project={project} tasks={[]} onAddTask={() => {}} onUpdateTaskStatus={() => {}} />)
  expect(screen.getByText('Files')).toBeInTheDocument()
})

test('renders tasks section', () => {
  const tasks = [
    { id: 't1', project_id: '1', source: 'custom', title: 'Fix the bug', status: 'todo', created_at: 0, updated_at: 0 }
  ]
  render(<ProjectPanel project={project} tasks={tasks} onAddTask={() => {}} onUpdateTaskStatus={() => {}} />)
  expect(screen.getByText('Fix the bug')).toBeInTheDocument()
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/components/ProjectPanel.test.tsx
```

**Step 3: Implement `src/components/MarkdownEditor.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  projectPath: string
  filename: string
  onClose: () => void
}

export function MarkdownEditor({ projectPath, filename, onClose }: Props) {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    invoke<string | null>('read_markdown_file', { projectPath, filename })
      .then(c => setContent(c ?? ''))
  }, [projectPath, filename])

  const save = async () => {
    await invoke('write_markdown_file', { projectPath, filename, content })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg flex flex-col w-[640px] h-[480px] shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <span className="text-sm font-medium text-zinc-200">{filename}</span>
          <div className="flex gap-2">
            {saved && <span className="text-xs text-green-400">Saved</span>}
            <button onClick={save} className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500">Save</button>
            <button onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-200">Close</button>
          </div>
        </div>
        <textarea
          className="flex-1 bg-zinc-900 text-zinc-100 p-4 text-sm font-mono resize-none focus:outline-none"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
    </div>
  )
}
```

**Step 4: Add file commands to `src-tauri/src/projects.rs`**

```rust
#[tauri::command]
pub fn read_markdown_file(project_path: String, filename: String) -> Option<String> {
    let path = std::path::Path::new(&project_path).join(&filename);
    std::fs::read_to_string(path).ok()
}

#[tauri::command]
pub fn write_markdown_file(project_path: String, filename: String, content: String) -> Result<(), String> {
    let path = std::path::Path::new(&project_path).join(&filename);
    std::fs::write(path, content).map_err(|e| e.to_string())
}
```

**Step 5: Implement `src/components/ProjectPanel.tsx`**

```tsx
import { useState } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import type { Project } from '../store/projects'
import type { Task } from '../store/tasks'

interface Props {
  project: Project
  tasks: Task[]
  onAddTask: (title: string) => void
  onUpdateTaskStatus: (id: string, status: string) => void
}

const STATUS_ICONS: Record<string, string> = { todo: '○', in_progress: '◑', done: '●' }
const NEXT_STATUS: Record<string, string> = { todo: 'in_progress', in_progress: 'done', done: 'todo' }

export function ProjectPanel({ project, tasks, onAddTask, onUpdateTaskStatus }: Props) {
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  const mdFiles = ['CLAUDE.md', '.agenthub.md', 'MEMORY.md'].filter(Boolean)

  return (
    <aside className="w-64 flex-shrink-0 bg-zinc-800 border-l border-zinc-700 flex flex-col h-full overflow-y-auto">
      {editingFile && (
        <MarkdownEditor
          projectPath={project.path}
          filename={editingFile}
          onClose={() => setEditingFile(null)}
        />
      )}

      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Tasks</div>
        <div className="space-y-1">
          {tasks.map(t => (
            <div key={t.id} className="flex items-start gap-2 text-sm text-zinc-200">
              <button
                className="mt-0.5 text-zinc-400 hover:text-zinc-100"
                onClick={() => onUpdateTaskStatus(t.id, NEXT_STATUS[t.status])}
              >
                {STATUS_ICONS[t.status]}
              </button>
              <span className={t.status === 'done' ? 'line-through text-zinc-500' : ''}>{t.title}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          <input
            className="flex-1 bg-zinc-700 text-zinc-100 rounded px-2 py-1 text-xs"
            placeholder="Add task..."
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newTaskTitle) { onAddTask(newTaskTitle); setNewTaskTitle('') } }}
          />
        </div>
      </div>

      <div className="p-3">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Files</div>
        <div className="space-y-1">
          {mdFiles.map(f => (
            <button
              key={f}
              onClick={() => setEditingFile(f)}
              className="block w-full text-left text-sm text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-700"
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
```

**Step 6: Run tests**

```bash
bun run vitest run src/components/ProjectPanel.test.tsx
```

Expected: PASS

**Step 7: Commit**

```bash
git add src/components/ProjectPanel.tsx src/components/MarkdownEditor.tsx src/components/ProjectPanel.test.tsx
git commit -m "feat: project info panel with markdown editor"
```

---

### Task 13: Task management — Rust + store

**Files:**
- Create: `src-tauri/src/tasks.rs`
- Create: `src/store/tasks.ts`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the Rust tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_create_and_list_custom_tasks() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();
        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1','T','/t')")
            .execute(&pool).await.unwrap();

        create_task_db(&pool, "p1", "Fix bug", None).await.unwrap();
        let tasks = list_tasks_db(&pool, "p1").await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Fix bug");
        assert_eq!(tasks[0].status, "todo");
    }

    #[tokio::test]
    async fn test_update_task_status() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();
        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1','T','/t')")
            .execute(&pool).await.unwrap();
        let t = create_task_db(&pool, "p1", "Task", None).await.unwrap();
        update_task_status_db(&pool, &t.id, "done").await.unwrap();
        let tasks = list_tasks_db(&pool, "p1").await.unwrap();
        assert_eq!(tasks[0].status, "done");
    }
}
```

**Step 2: Run to verify they fail**

```bash
cd src-tauri && cargo test tasks::tests
```

**Step 3: Implement `src-tauri/src/tasks.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub source: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub github_issue_number: Option<i64>,
    pub session_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn create_task_db(pool: &SqlitePool, project_id: &str, title: &str, description: Option<&str>) -> Result<Task> {
    let id = Uuid::new_v4().to_string();
    let task = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (id, project_id, title, description) VALUES (?, ?, ?, ?) RETURNING *"
    )
    .bind(&id).bind(project_id).bind(title).bind(description)
    .fetch_one(pool).await?;
    Ok(task)
}

pub async fn list_tasks_db(pool: &SqlitePool, project_id: &str) -> Result<Vec<Task>> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at"
    )
    .bind(project_id)
    .fetch_all(pool).await?;
    Ok(tasks)
}

pub async fn update_task_status_db(pool: &SqlitePool, id: &str, status: &str) -> Result<()> {
    sqlx::query("UPDATE tasks SET status = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(status).bind(id)
        .execute(pool).await?;
    Ok(())
}

pub async fn delete_task_db(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM tasks WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}

#[tauri::command]
pub async fn list_tasks(project_id: String, state: tauri::State<'_, crate::AppState>) -> Result<Vec<Task>, String> {
    list_tasks_db(&state.db, &project_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_task(project_id: String, title: String, description: Option<String>, state: tauri::State<'_, crate::AppState>) -> Result<Task, String> {
    create_task_db(&state.db, &project_id, &title, description.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task_status(id: String, status: String, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    update_task_status_db(&state.db, &id, &status).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_task(id: String, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    delete_task_db(&state.db, &id).await.map_err(|e| e.to_string())
}
```

**Step 4: Run tests**

```bash
cd src-tauri && cargo test tasks::tests
```

Expected: PASS

**Step 5: Register commands in main.rs**

```rust
mod tasks;
// add to invoke_handler:
tasks::list_tasks, tasks::create_task, tasks::update_task_status, tasks::delete_task,
```

**Step 6: Implement `src/store/tasks.ts`**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface Task {
  id: string
  project_id: string
  source: string
  title: string
  description?: string
  status: string
  github_issue_number?: number
  session_id?: string
  created_at: number
  updated_at: number
}

interface TaskStore {
  tasks: Task[]
  load: (projectId: string) => Promise<void>
  add: (projectId: string, title: string, description?: string) => Promise<void>
  updateStatus: (id: string, status: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  load: async (projectId) => {
    const tasks = await invoke<Task[]>('list_tasks', { projectId })
    set({ tasks })
  },
  add: async (projectId, title, description) => {
    await invoke('create_task', { projectId, title, description })
    // reload — we need projectId but don't store it; pass it back
    const tasks = await invoke<Task[]>('list_tasks', { projectId })
    set({ tasks })
  },
  updateStatus: async (id, status) => {
    await invoke('update_task_status', { id, status })
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, status } : t) }))
  },
  remove: async (id) => {
    await invoke('delete_task', { id })
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
  },
}))
```

**Step 7: Commit**

```bash
git add src-tauri/src/tasks.rs src/store/tasks.ts src-tauri/src/main.rs
git commit -m "feat: task management CRUD"
```

---

## Phase 7: GitHub Integration

### Task 14: GitHub issues fetch

**Files:**
- Create: `src-tauri/src/github.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Write the tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_repo_from_remote() {
        let url = "https://github.com/owner/repo.git";
        assert_eq!(parse_repo_from_url(url), Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_ssh_remote() {
        let url = "git@github.com:owner/repo.git";
        assert_eq!(parse_repo_from_url(url), Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_invalid_url_returns_none() {
        assert_eq!(parse_repo_from_url("not-a-url"), None);
    }
}
```

**Step 2: Run to verify they fail**

```bash
cd src-tauri && cargo test github::tests
```

**Step 3: Implement `src-tauri/src/github.rs`**

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use keyring::Entry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssue {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
}

pub fn parse_repo_from_url(url: &str) -> Option<(String, String)> {
    // Handle https://github.com/owner/repo.git
    if let Some(path) = url.strip_prefix("https://github.com/") {
        let clean = path.trim_end_matches(".git");
        let parts: Vec<&str> = clean.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    // Handle git@github.com:owner/repo.git
    if let Some(path) = url.strip_prefix("git@github.com:") {
        let clean = path.trim_end_matches(".git");
        let parts: Vec<&str> = clean.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

pub fn get_github_token(project_id: &str) -> Option<String> {
    Entry::new("agenthub", &format!("github-{}", project_id))
        .ok()
        .and_then(|e| e.get_password().ok())
}

pub fn set_github_token(project_id: &str, token: &str) -> Result<()> {
    Entry::new("agenthub", &format!("github-{}", project_id))?.set_password(token)?;
    Ok(())
}

pub async fn fetch_issues(owner: &str, repo: &str, token: &str) -> Result<Vec<GithubIssue>> {
    let client = reqwest::Client::new();
    let url = format!("https://api.github.com/repos/{}/{}/issues?state=open&per_page=50", owner, repo);
    let issues: Vec<GithubIssue> = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "agenthub/1.0")
        .send().await?
        .json().await?;
    Ok(issues)
}

#[tauri::command]
pub fn set_project_github_token(project_id: String, token: String) -> Result<(), String> {
    set_github_token(&project_id, &token).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_project_issues(
    project_id: String,
    project_path: String,
) -> Result<Vec<GithubIssue>, String> {
    let token = get_github_token(&project_id).ok_or("No GitHub token configured")?;

    // Detect remote from git
    let repo = git2::Repository::open(&project_path).map_err(|e| e.to_string())?;
    let remote = repo.find_remote("origin").map_err(|_| "No origin remote")?;
    let url = remote.url().ok_or("No remote URL")?;
    let (owner, repo_name) = parse_repo_from_url(url).ok_or("Could not parse GitHub repo from remote URL")?;

    fetch_issues(&owner, &repo_name, &token).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_github_repo_from_remote() {
        let url = "https://github.com/owner/repo.git";
        assert_eq!(parse_repo_from_url(url), Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_ssh_remote() {
        let url = "git@github.com:owner/repo.git";
        assert_eq!(parse_repo_from_url(url), Some(("owner".to_string(), "repo".to_string())));
    }

    #[test]
    fn test_parse_invalid_url_returns_none() {
        assert_eq!(parse_repo_from_url("not-a-url"), None);
    }
}
```

**Step 4: Run tests**

```bash
cd src-tauri && cargo test github::tests
```

Expected: PASS

**Step 5: Register commands in main.rs**

```rust
mod github;
// add to invoke_handler:
github::set_project_github_token, github::fetch_project_issues,
```

**Step 6: Commit**

```bash
git add src-tauri/src/github.rs src-tauri/src/main.rs
git commit -m "feat: GitHub issues integration"
```

---

## Phase 8: Wire Up the App Shell

### Task 15: Main App layout

**Files:**
- Modify: `src/App.tsx`
- Create: `src/App.test.tsx`

**Step 1: Write the test**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react'
import App from './App'

// Mock Tauri invoke for tests
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}))

test('renders three-panel layout', () => {
  render(<App />)
  expect(screen.getByRole('complementary')).toBeInTheDocument() // sidebar
})
```

**Step 2: Run to verify it fails**

```bash
bun run vitest run src/App.test.tsx
```

**Step 3: Implement `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Sidebar } from './components/Sidebar'
import { TerminalPane } from './components/TerminalPane'
import { ProjectPanel } from './components/ProjectPanel'
import { AddProjectModal } from './components/AddProjectModal'
import { LaunchAgentModal } from './components/LaunchAgentModal'
import { useProjectStore } from './store/projects'
import { useSessionStore } from './store/sessions'
import { useTaskStore } from './store/tasks'

export default function App() {
  const { projects, selectedProjectId, load: loadProjects, add: addProject, remove: removeProject, select } = useProjectStore()
  const { sessions, load: loadSessions, spawn: spawnAgent, kill: killAgent } = useSessionStore()
  const { tasks, load: loadTasks, add: addTask, updateStatus } = useTaskStore()

  const [showAddProject, setShowAddProject] = useState(false)
  const [showLaunchAgent, setShowLaunchAgent] = useState(false)
  const [agenthubMd, setAgenthubMd] = useState<string | null>(null)

  useEffect(() => { loadProjects() }, [])

  const selectedProject = projects.find(p => p.project.id === selectedProjectId)

  useEffect(() => {
    if (selectedProjectId) {
      loadSessions(selectedProjectId)
      loadTasks(selectedProjectId)
    }
  }, [selectedProjectId])

  const handleLaunchClick = async () => {
    if (!selectedProject) return
    const md = await invoke<string | null>('read_agenthub_md', { path: selectedProject.project.path })
    setAgenthubMd(md)
    setShowLaunchAgent(true)
  }

  const handleLaunch = async (prompt?: string) => {
    if (!selectedProject) return
    setShowLaunchAgent(false)
    await spawnAgent(selectedProject.project.id, selectedProject.project.path, prompt)
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      {showAddProject && (
        <AddProjectModal
          onAdd={async (path, name, desc) => { await addProject(path, name, desc); setShowAddProject(false) }}
          onClose={() => setShowAddProject(false)}
        />
      )}
      {showLaunchAgent && selectedProject && (
        <LaunchAgentModal
          projectPath={selectedProject.project.path}
          agenthubMd={agenthubMd}
          onLaunch={handleLaunch}
          onClose={() => setShowLaunchAgent(false)}
        />
      )}

      <Sidebar
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelect={select}
        onAdd={() => setShowAddProject(true)}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <TerminalPane
          sessions={sessions}
          onSpawn={handleLaunchClick}
          onKill={killAgent}
        />
      </main>

      {selectedProject && (
        <ProjectPanel
          project={selectedProject.project}
          tasks={tasks}
          onAddTask={title => addTask(selectedProjectId!, title)}
          onUpdateTaskStatus={updateStatus}
        />
      )}
    </div>
  )
}
```

**Step 4: Run all tests**

```bash
bun run vitest run
```

Expected: All PASS

**Step 5: Run the full app**

```bash
bun run tauri dev
```

Expected: Three-panel layout renders, can add projects, launch agents.

**Step 6: Final commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire up main app shell with three-panel layout"
```

---

## Verification Checklist

Before declaring v1 complete, verify:

- [ ] Can add a project by picking a folder
- [ ] Project appears in sidebar with git branch
- [ ] Clicking "+" opens launch modal with `.agenthub.md` content
- [ ] Launching agent opens a terminal tab with live Claude Code output
- [ ] Can type in the terminal and interact with the agent
- [ ] Killing an agent removes the tab
- [ ] Custom tasks can be added and status toggled
- [ ] Clicking a markdown file opens inline editor and saves correctly
- [ ] App survives restart (projects persist in SQLite)
- [ ] All tests pass: `bun run vitest run && cd src-tauri && cargo test`
