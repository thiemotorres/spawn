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
    invoke<string | null>('read_markdown_file', {
      projectPath,
      filename,
    }).then((c) => setContent(c ?? ''))
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
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-green-400">Saved</span>
            )}
            <button
              onClick={save}
              className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500"
            >
              Save
            </button>
            <button
              onClick={onClose}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
        </div>
        <textarea
          className="flex-1 bg-zinc-900 text-zinc-100 p-4 text-sm font-mono resize-none focus:outline-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`Edit ${filename}...`}
        />
      </div>
    </div>
  )
}
