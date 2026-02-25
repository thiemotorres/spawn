import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MarkdownEditor } from './MarkdownEditor'
import { GitPanel } from './GitPanel'
import type { Project } from '../store/projects'
import type { Task } from '../store/tasks'

const STATUS_ICONS: Record<string, string> = {
  todo: '○',
  in_progress: '◑',
  done: '●',
}

const NEXT_STATUS: Record<string, string> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}

const MD_FILES = ['CLAUDE.md', '.spawn.md', 'MEMORY.md']

interface Props {
  project?: Project
  tasks: Task[]
  onAddTask: (title: string) => void
  onUpdateTaskStatus: (id: string, status: string) => void
  onOpenSettings: () => void
}

export function ProjectPanel({
  project,
  tasks,
  onAddTask,
  onUpdateTaskStatus,
  onOpenSettings,
}: Props) {
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')

  return (
    <aside className="w-64 flex-shrink-0 bg-zinc-800 border-l border-zinc-700 flex flex-col h-full overflow-y-auto">
      {editingFile && project && (
        <MarkdownEditor
          projectPath={project.path}
          filename={editingFile}
          onClose={() => setEditingFile(null)}
        />
      )}

      {project && (
        <>
          {/* Tasks section */}
          <div className="p-3 border-b border-zinc-700">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Tasks
            </div>
            <div className="space-y-1">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-sm">
                  <button
                    aria-label={STATUS_ICONS[t.status] ?? '○'}
                    className="mt-0.5 text-zinc-400 hover:text-zinc-100 flex-shrink-0"
                    onClick={() =>
                      onUpdateTaskStatus(t.id, NEXT_STATUS[t.status] ?? 'todo')
                    }
                  >
                    {STATUS_ICONS[t.status] ?? '○'}
                  </button>
                  <span
                    className={
                      t.status === 'done'
                        ? 'text-zinc-400 line-through'
                        : 'text-zinc-200'
                    }
                  >
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <input
                className="w-full bg-zinc-700 text-zinc-100 rounded px-2 py-1 text-xs focus:outline-none"
                placeholder="Add task..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTaskTitle.trim()) {
                    onAddTask(newTaskTitle.trim())
                    setNewTaskTitle('')
                  }
                }}
              />
            </div>
          </div>

          {/* Git section */}
          <GitPanel projectPath={project.path} />

          {/* Files section */}
          <div className="p-3">
            <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Files
            </div>
            <div className="space-y-0.5">
              {MD_FILES.map((f) => (
                <button
                  key={f}
                  onClick={() => setEditingFile(f)}
                  className="block w-full text-left text-sm text-zinc-300 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bottom actions */}
      <div className="mt-auto p-3 border-t border-zinc-700 space-y-1">
        {project && (
          <>
            <button
              onClick={() => invoke('open_in_finder', { path: project.path })}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full py-1"
            >
              <span className="w-4 text-center leading-none">◫</span>
              <span>Open in Finder</span>
            </button>
            <button
              onClick={() => invoke('open_in_vscode', { path: project.path })}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full py-1"
            >
              <span className="w-4 text-center leading-none">⎇</span>
              <span>Open in VS Code</span>
            </button>
          </>
        )}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full py-1"
        >
          <span className="w-4 text-center leading-none">⚙</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
