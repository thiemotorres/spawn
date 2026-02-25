import { useState, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from './Terminal'
import { useTerminalWs } from '../hooks/useTerminalWs'
import type { AgentSession } from '../store/sessions'
import type { AgentConfig } from '../store/agentConfigs'

interface Props {
  sessions: AgentSession[]
  agentConfigs: AgentConfig[]
  onSpawn: (config: AgentConfig) => void
  onKill: (id: string) => void
  onRename: (id: string, name: string) => void
}

export function TerminalPane({ sessions, agentConfigs, onSpawn, onKill, onRename }: Props) {
  const [activeId, setActiveId] = useState<string | null>(
    sessions[0]?.id ?? null
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const termWriteRefs = useRef<Map<string, (data: Uint8Array) => void>>(
    new Map()
  )
  const prevSessionCountRef = useRef(sessions.length)
  const onKillRef = useRef(onKill)
  useEffect(() => { onKillRef.current = onKill }, [onKill])

  useTerminalWs((sessionId: string, data: Uint8Array) => {
    termWriteRefs.current.get(sessionId)?.(data)
  })

  useEffect(() => {
    if (sessions.length === 0) {
      prevSessionCountRef.current = 0
      return
    }
    // New session added → activate it (sessions are ordered newest-first)
    if (sessions.length > prevSessionCountRef.current) {
      setActiveId(sessions[0].id)
    } else if (!sessions.find((s) => s.id === activeId)) {
      // Active session was removed → fall back to first available
      setActiveId(sessions[0].id)
    }
    prevSessionCountRef.current = sessions.length
  }, [sessions])

  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen<string>('session-exited', (event) => {
      const sessionId = event.payload
      termWriteRefs.current.delete(sessionId)
      onKillRef.current(sessionId)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  const handleInput = async (sessionId: string, data: string) => {
    try {
      const encoded = new TextEncoder().encode(data)
      await invoke('write_to_agent', { sessionId, data: Array.from(encoded) })
    } catch (e) {
      console.error('write_to_agent error:', e)
    }
  }

  const handleKill = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    termWriteRefs.current.delete(sessionId)
    onKill(sessionId)
  }

  const startEdit = (e: React.MouseEvent, s: AgentSession) => {
    e.stopPropagation()
    setEditingId(s.id)
    setEditValue(s.name ?? 'Agent')
  }

  const commitEdit = () => {
    if (editingId) {
      const trimmed = editValue.trim()
      if (trimmed) onRename(editingId, trimmed)
    }
    setEditingId(null)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingId(null)
  }

  const handleSpawnDefault = () => {
    const cfg = agentConfigs.find((c) => c.is_default) ?? agentConfigs[0] ?? {
      id: 'builtin-claude',
      name: 'Claude Code',
      command: 'claude',
      args: '[]',
      is_default: true,
      created_at: 0,
    }
    onSpawn(cfg)
  }

  const handlePickAgent = (cfg: AgentConfig) => {
    setShowDropdown(false)
    onSpawn(cfg)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Tab bar — tabs scroll, buttons stay fixed so dropdown isn't clipped */}
      <div className="flex items-center bg-zinc-800 border-b border-zinc-700 px-1 flex-shrink-0">
        {/* Scrollable tab list */}
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-sm transition-colors whitespace-nowrap cursor-pointer select-none flex-shrink-0 ${
                activeId === s.id
                  ? 'bg-zinc-900 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-750'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === 'running' ? 'bg-green-400' : 'bg-zinc-500'
                }`}
              />
              {editingId === s.id ? (
                <input
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-zinc-700 text-zinc-100 text-sm rounded px-1 w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <span onDoubleClick={(e) => startEdit(e, s)} title="Double-click to rename">
                  {s.name ?? 'Agent'}
                </span>
              )}
              <span
                className="ml-1 text-zinc-500 hover:text-red-400 leading-none"
                onClick={(e) => handleKill(e, s.id)}
              >
                ×
              </span>
            </div>
          ))}
        </div>

        {/* Fixed action buttons — outside overflow so dropdown isn't clipped */}
        <div className="flex items-center flex-shrink-0 pl-0.5">
          <button
            onClick={handleSpawnDefault}
            className="px-3 py-2 text-zinc-400 hover:text-zinc-100 text-lg leading-none"
            title="Launch default agent"
          >
            +
          </button>

          {agentConfigs.length > 1 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown((v) => !v)}
                className="px-2 py-2 text-zinc-400 hover:text-zinc-100 text-sm leading-none"
                title="Choose agent"
              >
                ···
              </button>
              {showDropdown && (
                <div className="absolute top-full right-0 mt-0.5 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50 min-w-40 py-1">
                  {agentConfigs.map((cfg) => (
                    <button
                      key={cfg.id}
                      onClick={() => handlePickAgent(cfg)}
                      className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2"
                    >
                      {cfg.name}
                      {cfg.is_default && (
                        <span className="text-xs text-blue-400 ml-auto">default</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Terminal panels */}
      <div className="flex-1 relative overflow-hidden">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`absolute inset-0 ${activeId === s.id ? 'block' : 'hidden'}`}
          >
            <Terminal
              sessionId={s.id}
              onInput={(data) => handleInput(s.id, data)}
              onReady={(write) => termWriteRefs.current.set(s.id, write)}
            />
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Nothing running. Click + to spawn something.
          </div>
        )}
      </div>
    </div>
  )
}
