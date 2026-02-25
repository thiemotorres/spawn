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
  forceExpanded?: boolean
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
      <div className="group/header flex items-center px-2 py-1.5 select-none">
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
                if (e.key === 'Escape') { setRenaming(false); setRenameValue(group.name) }
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-zinc-700 text-zinc-100 text-xs rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span
              className="text-xs font-semibold text-zinc-400 uppercase tracking-wider truncate"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenaming(true)
                setRenameValue(group.name)
              }}
            >
              {group.name}
            </span>
          )}
        </button>

        {/* ⋯ header menu */}
        <div
          className="relative opacity-0 group-hover/header:opacity-100 flex-shrink-0"
          ref={headerMenuRef}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              setHeaderMenu((v) => !v)
            }}
            className="text-zinc-500 hover:text-zinc-300 px-1 text-sm leading-none"
          >
            ⋯
          </button>
          {headerMenu && (
            <div className="absolute right-0 top-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-28 py-1">
              <button
                onClick={() => {
                  setHeaderMenu(false)
                  setRenaming(true)
                  setRenameValue(group.name)
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  setHeaderMenu(false)
                  onDeleteGroup(group.id)
                }}
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
              className={`group/item flex items-center pl-6 pr-2 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
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

              {/* ⋯ project menu */}
              <div
                className="relative opacity-0 group-hover/item:opacity-100 flex-shrink-0"
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
                          onClick={(e) => {
                            e.stopPropagation()
                            setProjectMenuId(null)
                            onMoveProject(project.id, g.id)
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
                        >
                          → {g.name}
                        </button>
                      ))}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setProjectMenuId(null)
                        onMoveProject(project.id, null)
                      }}
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
