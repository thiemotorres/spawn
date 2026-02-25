import { useEffect, useState, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface GitStatus {
  is_git_repo: boolean
  branch: string | null
  has_upstream: boolean
  ahead: number
  behind: number
  changed_files: number
  staged_files: number
  last_commit: string | null
  local_branches: string[]
}

interface Props {
  projectPath: string
}

export function GitPanel({ projectPath }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showBranchPicker, setShowBranchPicker] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      const s = await invoke<GitStatus>('get_git_status', { projectPath })
      setStatus(s)
    } catch (e) {
      console.error('get_git_status failed:', e)
    }
  }

  useEffect(() => {
    load()
  }, [projectPath])

  // Close branch picker on outside click
  useEffect(() => {
    if (!showBranchPicker) return
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setShowBranchPicker(false)
        setNewBranchName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showBranchPicker])

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null)
    setLoading(true)
    try {
      await action()
      await load()
    } catch (e) {
      setActionError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleCheckout = (branch: string) => {
    setShowBranchPicker(false)
    setNewBranchName('')
    runAction(() => invoke('git_checkout', { projectPath, branch }))
  }

  const handleCreateBranch = () => {
    const name = newBranchName.trim()
    if (!name) return
    setShowBranchPicker(false)
    setNewBranchName('')
    runAction(() => invoke('git_create_branch', { projectPath, branch: name }))
  }

  const handleCommitAll = async () => {
    const msg = commitMsg.trim()
    if (!msg) return
    setCommitting(true)
    setActionError(null)
    try {
      await invoke('git_commit_all', { projectPath, message: msg })
      setCommitMsg('')
      await load()
    } catch (e) {
      setActionError(String(e))
    } finally {
      setCommitting(false)
    }
  }

  if (!status) return null

  if (!status.is_git_repo) {
    return (
      <div className="p-3 border-b border-zinc-700">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
          Git
        </div>
        <p className="text-xs text-zinc-500 mb-2">Not a git repository</p>
        <button
          onClick={() => runAction(() => invoke('git_init', { projectPath }))}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
        >
          git init
        </button>
        {actionError && (
          <p className="mt-1 text-xs text-red-400 break-all">{actionError}</p>
        )}
      </div>
    )
  }

  const totalChanges = status.changed_files + status.staged_files

  return (
    <div className="p-3 border-b border-zinc-700">
      <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
        Git
      </div>

      {/* Branch row */}
      <div className="flex items-center gap-1.5 mb-2 relative" ref={pickerRef}>
        <button
          onClick={() => setShowBranchPicker((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200 transition-colors truncate max-w-full"
          title="Switch branch"
        >
          <span className="text-zinc-400 flex-shrink-0">⎇</span>
          <span className="truncate">{status.branch ?? 'HEAD'}</span>
          <span className="text-zinc-500 flex-shrink-0">▾</span>
        </button>

        {showBranchPicker && (
          <div className="absolute top-full left-0 mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-44 py-1">
            {status.local_branches.map((b) => (
              <button
                key={b}
                onClick={() => handleCheckout(b)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 transition-colors ${
                  b === status.branch ? 'text-emerald-300' : 'text-zinc-200'
                }`}
              >
                {b === status.branch ? '✓ ' : '  '}
                {b}
              </button>
            ))}
            <div className="border-t border-zinc-700 mt-1 pt-1 px-2 flex gap-1">
              <input
                className="flex-1 bg-zinc-700 text-zinc-100 text-xs rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="new-branch"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBranch()
                  if (e.key === 'Escape') {
                    setShowBranchPicker(false)
                    setNewBranchName('')
                  }
                }}
                autoFocus
              />
              <button
                onClick={handleCreateBranch}
                className="text-xs px-1.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ahead / behind + pull/push */}
      <div className="flex items-center gap-1.5 mb-2">
        {status.has_upstream && (status.ahead > 0 || status.behind > 0) && (
          <span className="text-xs text-zinc-400">
            {status.ahead > 0 && <span className="text-sky-400">↑{status.ahead}</span>}
            {status.ahead > 0 && status.behind > 0 && ' '}
            {status.behind > 0 && <span className="text-amber-400">↓{status.behind}</span>}
          </span>
        )}
        <button
          onClick={() => runAction(() => invoke('git_pull', { projectPath }))}
          disabled={loading}
          className="text-xs px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
        >
          Pull
        </button>
        <button
          onClick={() => runAction(() => invoke('git_push', { projectPath }))}
          disabled={loading}
          className="text-xs px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50"
        >
          Push
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
          title="Refresh"
        >
          ↺
        </button>
      </div>

      {/* Changed files indicator */}
      {totalChanges > 0 && (
        <div className="text-xs text-zinc-400 mb-2">
          {status.staged_files > 0 && (
            <span className="text-green-400">{status.staged_files} staged</span>
          )}
          {status.staged_files > 0 && status.changed_files > 0 && ', '}
          {status.changed_files > 0 && (
            <span className="text-amber-400">{status.changed_files} changed</span>
          )}
        </div>
      )}

      {/* Quick commit */}
      <div className="flex gap-1 mb-2">
        <input
          className="flex-1 min-w-0 bg-zinc-700 text-zinc-100 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-500"
          placeholder="Commit message…"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommitAll()
          }}
          disabled={committing}
        />
        <button
          onClick={handleCommitAll}
          disabled={committing || !commitMsg.trim()}
          className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          Commit all
        </button>
      </div>

      {/* Last commit */}
      {status.last_commit && (
        <p className="text-xs text-zinc-500 truncate" title={status.last_commit}>
          {status.last_commit}
        </p>
      )}

      {actionError && (
        <p className="mt-1 text-xs text-red-400 break-all">{actionError}</p>
      )}
    </div>
  )
}
