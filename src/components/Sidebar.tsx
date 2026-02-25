import { useState, useEffect, useRef } from 'react'
import type { ProjectWithGit } from '../store/projects'
import type { ProjectGroup } from '../store/groups'
import { GroupSection } from './GroupSection'

interface Props {
  projects: ProjectWithGit[]
  groups: ProjectGroup[]
  selectedProjectId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onCreateGroup: (name: string) => void
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
  const [creatingGroup, setCreatingGroup] = useState(false)
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

  const visibleGroups = q ? grouped.filter((g) => g.hasMatch) : grouped

  return (
    <aside className="w-56 flex-shrink-0 bg-zinc-800 flex flex-col h-full border-r border-zinc-700">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Projects
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreatingGroup(true)}
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
      {creatingGroup && (
        <div className="px-2 pb-1">
          <input
            autoFocus
            placeholder="Group name…"
            className="w-full bg-zinc-700 text-zinc-100 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = (e.target as HTMLInputElement).value.trim()
                if (val) { onCreateGroup(val); setCreatingGroup(false) }
              }
              if (e.key === 'Escape') setCreatingGroup(false)
            }}
            onBlur={(e) => {
              const val = e.target.value.trim()
              if (val) onCreateGroup(val)
              setCreatingGroup(false)
            }}
          />
        </div>
      )}

      <div className="px-2 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="w-full bg-zinc-700 text-zinc-100 text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
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

        <ul>
          {ungrouped.map(({ project, branch }) => (
            <li
              key={project.id}
              className={`group/item flex items-center px-3 pr-2 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
                selectedProjectId === project.id ? 'bg-zinc-700' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 truncate">{project.name}</div>
                {branch && (
                  <div className="text-xs text-zinc-400 truncate">{branch}</div>
                )}
              </div>
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
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative opacity-0 group-hover/item:opacity-100 flex-shrink-0" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="text-zinc-500 hover:text-zinc-300 px-1 text-sm leading-none"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-36 py-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onMove(projectId, g.id)
              }}
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
