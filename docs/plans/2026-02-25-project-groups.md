# Project Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add collapsible project groups to the sidebar for visual organization, with inline rename/delete for groups and move-to-group per project.

**Architecture:** A new `project_groups` table with a nullable `group_id` FK on `projects`. The backend exposes CRUD commands in a new `group_ops.rs`. The frontend uses a new `useGroupStore` Zustand store and restructures `Sidebar.tsx` into group sections + a `GroupSection` component.

**Tech Stack:** Rust/SQLx (migration + Tauri commands), React/TypeScript/Zustand (store + components), Tailwind CSS v4

---

### Task 1: DB migration — project_groups table + group_id column

**Files:**
- Create: `src-tauri/migrations/003_project_groups.sql`

**Step 1: Create the migration file**

```sql
CREATE TABLE project_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE projects ADD COLUMN group_id TEXT REFERENCES project_groups(id) ON DELETE SET NULL;
```

**Step 2: Verify migration runs**

Run: `cd src-tauri && cargo test db::tests::test_db_init_creates_tables 2>&1`
Expected: test passes (sqlx::migrate! picks up 003 automatically)

**Step 3: Commit**

```bash
git add src-tauri/migrations/003_project_groups.sql
git commit -m "feat: add project_groups migration"
```

---

### Task 2: Backend — group_ops.rs with CRUD commands

**Files:**
- Create: `src-tauri/src/group_ops.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod group_ops;` + register 5 commands)
- Modify: `src-tauri/src/projects.rs` (add `group_id` field to `Project` struct)

**Context:**
- `Project` struct is at `src-tauri/src/projects.rs:7-14` — add `pub group_id: Option<String>` field
- `lib.rs` module list is at `src-tauri/src/lib.rs:1-8` — add `mod group_ops;`
- `lib.rs` invoke_handler is at lines 47-74 — add 5 new commands

**Step 1: Add `group_id` to `Project` struct in `projects.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub github_repo: Option<String>,
    pub group_id: Option<String>,  // ← add this
    pub created_at: i64,
}
```

**Step 2: Create `src-tauri/src/group_ops.rs`**

```rust
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectGroup {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

#[tauri::command]
pub async fn list_groups(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ProjectGroup>, String> {
    sqlx::query_as::<_, ProjectGroup>("SELECT * FROM project_groups ORDER BY created_at")
        .fetch_all(&state.db)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_group(
    name: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<ProjectGroup, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query_as::<_, ProjectGroup>(
        "INSERT INTO project_groups (id, name) VALUES (?, ?) RETURNING *",
    )
    .bind(&id)
    .bind(&name)
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_group(
    id: String,
    name: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    sqlx::query("UPDATE project_groups SET name = ? WHERE id = ?")
        .bind(&name)
        .bind(&id)
        .execute(&state.db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_group(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    // ON DELETE SET NULL on projects.group_id handles ungrouping automatically
    sqlx::query("DELETE FROM project_groups WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn assign_project_group(
    project_id: String,
    group_id: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    sqlx::query("UPDATE projects SET group_id = ? WHERE id = ?")
        .bind(&group_id)
        .bind(&project_id)
        .execute(&state.db)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}
```

**Step 3: Register in `lib.rs`**

Add `mod group_ops;` to the module list at the top of `src-tauri/src/lib.rs`.

Add to the invoke_handler list:
```rust
group_ops::list_groups,
group_ops::create_group,
group_ops::rename_group,
group_ops::delete_group,
group_ops::assign_project_group,
```

**Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors (1 pre-existing dead_code warning is fine)

**Step 5: Commit**

```bash
git add src-tauri/src/group_ops.rs src-tauri/src/lib.rs src-tauri/src/projects.rs
git commit -m "feat: group_ops backend CRUD"
```

---

### Task 3: Frontend — useGroupStore Zustand store

**Files:**
- Create: `src/store/groups.ts`
- Modify: `src/store/projects.ts` (add `group_id` to `Project` interface)

**Context:**
- `Project` interface is at `src/store/projects.ts:4-11`
- Pattern to follow: `src/store/agentConfigs.ts` (same invoke/load pattern)

**Step 1: Add `group_id` to `Project` in `src/store/projects.ts`**

```ts
export interface Project {
  id: string
  name: string
  path: string
  description?: string
  github_repo?: string
  group_id: string | null   // ← add this
  created_at: number
}
```

**Step 2: Create `src/store/groups.ts`**

```ts
import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface ProjectGroup {
  id: string
  name: string
  created_at: number
}

interface GroupStore {
  groups: ProjectGroup[]
  load: () => Promise<void>
  create: (name: string) => Promise<ProjectGroup>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  assignProject: (projectId: string, groupId: string | null) => Promise<void>
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  load: async () => {
    const groups = await invoke<ProjectGroup[]>('list_groups')
    set({ groups })
  },
  create: async (name) => {
    const group = await invoke<ProjectGroup>('create_group', { name })
    await get().load()
    return group
  },
  rename: async (id, name) => {
    await invoke('rename_group', { id, name })
    await get().load()
  },
  remove: async (id) => {
    await invoke('delete_group', { id })
    await get().load()
  },
  assignProject: async (projectId, groupId) => {
    await invoke('assign_project_group', { projectId, groupId })
  },
}))
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\." | head -20`
Expected: no new errors beyond the pre-existing test file errors

**Step 4: Commit**

```bash
git add src/store/groups.ts src/store/projects.ts
git commit -m "feat: useGroupStore + Project group_id"
```

---

### Task 4: Frontend — GroupSection component

**Files:**
- Create: `src/components/GroupSection.tsx`

**Context:**
This is a self-contained collapsible section. It receives a group name, its projects, and callbacks. It handles:
- Collapse/expand toggle (▾/▸)
- Inline rename on double-click of the group name (Enter saves, Escape cancels)
- A `⋯` hover button on the header → dropdown: Rename, Delete
- Rendering project items with their own `⋯` hover button → dropdown: Move to group, Remove from group

**Step 1: Create `src/components/GroupSection.tsx`**

```tsx
import { useRef, useState, useEffect } from 'react'
import type { ProjectWithGit } from '../store/projects'
import type { ProjectGroup } from '../store/groups'

interface Props {
  group: ProjectGroup
  projects: ProjectWithGit[]
  selectedProjectId: string | null
  allGroups: ProjectGroup[]
  onSelect: (id: string) => void
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onMoveProject: (projectId: string, groupId: string | null) => void
  forceExpanded?: boolean  // true when filter is active and group has matches
}

export function GroupSection({
  group,
  projects,
  selectedProjectId,
  allGroups,
  onSelect,
  onRenameGroup,
  onDeleteGroup,
  onMoveProject,
  forceExpanded,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(group.name)
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const isExpanded = forceExpanded || !collapsed

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus()
  }, [renaming])

  // Close menus on outside click
  useEffect(() => {
    if (!headerMenu && !projectMenuId) return
    const handler = (e: MouseEvent) => {
      if (!headerMenuRef.current?.contains(e.target as Node)) setHeaderMenu(false)
      if (!projectMenuRef.current?.contains(e.target as Node)) setProjectMenuId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [headerMenu, projectMenuId])

  const commitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== group.name) onRenameGroup(group.id, trimmed)
    setRenaming(false)
  }

  return (
    <div>
      {/* Group header */}
      <div className="group flex items-center px-2 py-1.5 hover:bg-zinc-750 select-none">
        <button
          onClick={() => !forceExpanded && setCollapsed((c) => !c)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          <span className="text-zinc-500 text-xs w-3 flex-shrink-0">
            {isExpanded ? '▾' : '▸'}
          </span>
          {renaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-zinc-700 text-zinc-100 text-xs rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span
              className="text-xs font-semibold text-zinc-400 uppercase tracking-wider truncate"
              onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameValue(group.name) }}
            >
              {group.name}
            </span>
          )}
        </button>

        {/* ⋯ header menu */}
        <div className="relative opacity-0 group-hover:opacity-100 flex-shrink-0" ref={headerMenuRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setHeaderMenu((v) => !v) }}
            className="text-zinc-500 hover:text-zinc-300 px-1 text-sm leading-none"
          >
            ⋯
          </button>
          {headerMenu && (
            <div className="absolute right-0 top-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-28 py-1">
              <button
                onClick={() => { setHeaderMenu(false); setRenaming(true); setRenameValue(group.name) }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                Rename
              </button>
              <button
                onClick={() => { setHeaderMenu(false); onDeleteGroup(group.id) }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700"
              >
                Delete group
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Projects in group */}
      {isExpanded && (
        <ul>
          {projects.map(({ project, branch }) => (
            <li
              key={project.id}
              className={`group flex items-center pl-6 pr-2 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
                selectedProjectId === project.id ? 'bg-zinc-700' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">{project.name}</div>
                {branch && <div className="text-xs text-zinc-400 truncate">{branch}</div>}
              </div>

              {/* ⋯ project menu */}
              <div
                className="relative opacity-0 group-hover:opacity-100 flex-shrink-0"
                ref={projectMenuId === project.id ? projectMenuRef : undefined}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setProjectMenuId((id) => (id === project.id ? null : project.id))
                  }}
                  className="text-zinc-500 hover:text-zinc-300 px-1 text-sm leading-none"
                >
                  ⋯
                </button>
                {projectMenuId === project.id && (
                  <div className="absolute right-0 top-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-36 py-1">
                    {allGroups
                      .filter((g) => g.id !== group.id)
                      .map((g) => (
                        <button
                          key={g.id}
                          onClick={(e) => { e.stopPropagation(); setProjectMenuId(null); onMoveProject(project.id, g.id) }}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                        >
                          → {g.name}
                        </button>
                      ))}
                    <button
                      onClick={(e) => { e.stopPropagation(); setProjectMenuId(null); onMoveProject(project.id, null) }}
                      className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700"
                    >
                      Remove from group
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\." | head -20`
Expected: no new errors

**Step 3: Commit**

```bash
git add src/components/GroupSection.tsx
git commit -m "feat: GroupSection collapsible component"
```

---

### Task 5: Frontend — restructure Sidebar.tsx

**Files:**
- Modify: `src/components/Sidebar.tsx` (full rewrite — currently 60 lines)
- Modify: `src/App.tsx` (pass `groups`, group callbacks into Sidebar)

**Context:**
- Current `Sidebar` props: `projects`, `selectedProjectId`, `onSelect`, `onAdd`
- `App.tsx` uses `useProjectStore` — add `useGroupStore` alongside it
- The new Sidebar groups projects by `project.group_id`, renders `GroupSection` for each group, then ungrouped projects below
- Filter: text matches project name → auto-expand that group, hide groups with no matches

**Step 1: Rewrite `src/components/Sidebar.tsx`**

```tsx
import { useState } from 'react'
import type { ProjectWithGit } from '../store/projects'
import type { ProjectGroup } from '../store/groups'
import { GroupSection } from './GroupSection'

interface Props {
  projects: ProjectWithGit[]
  groups: ProjectGroup[]
  selectedProjectId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onCreateGroup: () => void
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onMoveProject: (projectId: string, groupId: string | null) => void
}

export function Sidebar({
  projects,
  groups,
  selectedProjectId,
  onSelect,
  onAdd,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveProject,
}: Props) {
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()

  const filtered = q
    ? projects.filter((p) => p.project.name.toLowerCase().includes(q))
    : projects

  const grouped = groups.map((g) => ({
    group: g,
    projects: filtered.filter((p) => p.project.group_id === g.id),
    hasMatch: filtered.some((p) => p.project.group_id === g.id),
  }))

  const ungrouped = filtered.filter((p) => !p.project.group_id)

  // Only show groups that have projects when filtering
  const visibleGroups = q ? grouped.filter((g) => g.hasMatch) : grouped

  return (
    <aside className="w-56 flex-shrink-0 bg-zinc-800 flex flex-col h-full border-r border-zinc-700">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Projects
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onCreateGroup}
            title="New group"
            className="text-zinc-400 hover:text-zinc-100 text-xs leading-none"
          >
            ⊞
          </button>
          <button
            onClick={onAdd}
            title="Add project"
            className="text-zinc-400 hover:text-zinc-100 text-lg leading-none"
          >
            +
          </button>
        </div>
      </div>

      <div className="px-2 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="w-full bg-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Grouped projects */}
        {visibleGroups.map(({ group, projects: gProjects, hasMatch }) => (
          <GroupSection
            key={group.id}
            group={group}
            projects={gProjects}
            selectedProjectId={selectedProjectId}
            allGroups={groups}
            onSelect={onSelect}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
            onMoveProject={onMoveProject}
            forceExpanded={q ? hasMatch : undefined}
          />
        ))}

        {/* Ungrouped projects */}
        <ul>
          {ungrouped.map(({ project, branch }) => (
            <li
              key={project.id}
              className={`group flex items-center px-3 pr-2 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
                selectedProjectId === project.id ? 'bg-zinc-700' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">{project.name}</div>
                {branch && <div className="text-xs text-zinc-400 truncate">{branch}</div>}
              </div>

              {/* ⋯ project menu for ungrouped */}
              {groups.length > 0 && (
                <UngroupedProjectMenu
                  projectId={project.id}
                  groups={groups}
                  onMove={onMoveProject}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

// Small inline component for the ungrouped project ⋯ menu
function UngroupedProjectMenu({
  projectId,
  groups,
  onMove,
}: {
  projectId: string
  groups: ProjectGroup[]
  onMove: (projectId: string, groupId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative opacity-0 group-hover:opacity-100 flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="text-zinc-500 hover:text-zinc-300 px-1 text-sm leading-none"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-36 py-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={(e) => { e.stopPropagation(); setOpen(false); onMove(projectId, g.id) }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              → {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Update `src/App.tsx`**

Add imports at the top:
```tsx
import { useGroupStore } from './store/groups'
```

Add inside `App()` component body (after existing store hooks):
```tsx
const {
  groups,
  load: loadGroups,
  create: createGroup,
  rename: renameGroup,
  remove: removeGroup,
  assignProject: assignProjectGroup,
} = useGroupStore()
```

Update the `useEffect` that loads on mount to also call `loadGroups()`:
```tsx
useEffect(() => {
  loadProjects()
  loadAgentConfigs()
  loadGroups()
}, [])
```

Update the `handleMoveProject` handler (add after `handleAddProject`):
```tsx
const handleMoveProject = async (projectId: string, groupId: string | null) => {
  await assignProjectGroup(projectId, groupId)
  await loadProjects()
}
```

Update the `handleCreateGroup` handler:
```tsx
const handleCreateGroup = async () => {
  const name = window.prompt('Group name:')
  if (name?.trim()) await createGroup(name.trim())
}
```

Update the `<Sidebar>` JSX to pass new props:
```tsx
<Sidebar
  projects={projects}
  groups={groups}
  selectedProjectId={selectedProjectId}
  onSelect={select}
  onAdd={() => setShowAddProject(true)}
  onCreateGroup={handleCreateGroup}
  onRenameGroup={renameGroup}
  onDeleteGroup={removeGroup}
  onMoveProject={handleMoveProject}
/>
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "\.test\." | head -20`
Expected: no new errors

**Step 4: Smoke test in dev**

Run: `bun run tauri dev`

Verify:
- Sidebar shows existing projects as ungrouped
- `⊞` button prompts for a group name and creates a group header in the sidebar
- Projects can be moved into a group via `⋯` → group name
- Group header collapses/expands on click
- Group can be renamed (double-click header label or `⋯` → Rename)
- Group can be deleted (`⋯` → Delete group) — projects return to ungrouped
- Filter hides groups with no matches and auto-expands groups with matches

**Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: project groups sidebar with collapsible sections"
```
