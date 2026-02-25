import { useState } from 'react'

interface Props {
  agenthubMd: string | null
  onLaunch: (prompt: string | undefined) => void
  onClose: () => void
}

export function LaunchAgentModal({
  agenthubMd,
  onLaunch,
  onClose,
}: Props) {
  const [prompt, setPrompt] = useState(agenthubMd ?? '')

  const handleLaunch = () => {
    onLaunch(prompt || undefined)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-800 rounded-lg p-6 w-[500px] shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">
          Launch Agent Session
        </h2>
        <p className="text-xs text-zinc-400 mb-3">
          Initial prompt — edit before launching (from .agenthub.md if present)
        </p>
        <textarea
          className="w-full bg-zinc-700 text-zinc-100 rounded p-3 text-sm h-40 resize-none focus:outline-none font-mono"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the work for this agent..."
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-500"
          >
            Launch Agent
          </button>
        </div>
      </div>
    </div>
  )
}
