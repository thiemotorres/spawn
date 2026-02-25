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

  const handleAdd = () => {
    onAdd(path, name, description || undefined)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 w-96 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">New Project</h2>
        <div className="space-y-3">
          <div>
            <label
              className="block text-xs text-zinc-400 mb-1"
              htmlFor="project-name"
            >
              Project Name
            </label>
            <input
              id="project-name"
              aria-label="Project Name"
              className="w-full bg-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm focus:outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label
              className="block text-xs text-zinc-400 mb-1"
              htmlFor="project-path"
            >
              Path
            </label>
            <div className="flex gap-2">
              <input
                id="project-path"
                aria-label="Path"
                className="flex-1 bg-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm focus:outline-none"
                value={path}
                onChange={(e) => setPath(e.target.value)}
              />
              <button
                onClick={pickFolder}
                className="px-3 py-2 text-sm bg-zinc-600 rounded hover:bg-zinc-500 text-zinc-100"
              >
                Browse
              </button>
            </div>
          </div>
          <div>
            <label
              className="block text-xs text-zinc-400 mb-1"
              htmlFor="project-desc"
            >
              Description (optional)
            </label>
            <input
              id="project-desc"
              className="w-full bg-zinc-700 text-zinc-100 rounded px-3 py-2 text-sm focus:outline-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            disabled={!name || !path}
            onClick={handleAdd}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Project
          </button>
        </div>
      </div>
    </div>
  )
}
