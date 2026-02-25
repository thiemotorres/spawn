# Project Groups Design

**Goal:** Add visual grouping of projects in the sidebar with collapsible sections.

## Data Model

New `project_groups` table alongside a nullable `group_id` FK on `projects`:

```sql
CREATE TABLE project_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE projects ADD COLUMN group_id TEXT REFERENCES project_groups(id);
```

`list_projects` returns all groups with their member projects nested, plus ungrouped projects under a `null` group key.

## Backend

- Migration `003_project_groups.sql`
- `group_ops.rs`: CRUD commands — `list_groups`, `create_group`, `rename_group`, `delete_group` (projects become ungrouped), `assign_project_group`
- `projects.rs`: `Project` struct gains `group_id: Option<String>`; `list_projects` updated to return `ProjectGroup[]` (each with a `projects: Project[]` array) plus a separate `ungrouped: Project[]` list

## Frontend Sidebar

```
┌──────────────────────┐
│ Projects           + │
├──────────────────────┤
│ Filter…              │
├──────────────────────┤
│ ▾ Work               │  ← click to collapse; ⋯ on hover → Rename / Delete
│   ● BimRepo   main   │  ←  ⋯ on hover → Move to group / Remove from group
│   ● Frontend  dev    │
├──────────────────────┤
│ ▸ Personal           │  ← collapsed
├──────────────────────┤
│ ● spawn       main   │  ← ungrouped (no header)
└──────────────────────┘
```

- Collapsed state is local React state (not persisted)
- Filter auto-expands groups containing matches, collapses groups with no match
- `⋯` on group header: Rename (inline), Delete group
- `⋯` on project: Move to group (lists existing groups + "New group…"), Remove from group

## Architecture

- New Zustand store `useGroupStore` for group list + operations
- `Sidebar.tsx` restructured: renders group sections + ungrouped projects
- `GroupSection.tsx`: collapsible section component
- `ProjectItem.tsx`: extracted project list item with hover menu
