import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface AgentSession {
  id: string
  project_id: string
  name: string | null
  status: string
  scrollback: string | null
  created_at: number
  updated_at: number
}

interface SessionStore {
  sessions: AgentSession[]
  load: (projectId: string) => Promise<void>
  spawn: (projectId: string, projectPath: string, agentName: string, command: string, args: string[]) => Promise<AgentSession>
  kill: (sessionId: string) => Promise<void>
  rename: (sessionId: string, name: string) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  load: async (projectId) => {
    const sessions = await invoke<AgentSession[]>('list_sessions', { projectId })
    set({ sessions })
  },
  spawn: async (projectId, projectPath, agentName, command, args) => {
    const session = await invoke<AgentSession>('spawn_agent', {
      projectId,
      projectPath,
      agentName,
      command,
      args,
    })
    await get().load(projectId)
    return session
  },
  kill: async (sessionId) => {
    await invoke('kill_agent', { sessionId })
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== sessionId) }))
  },
  rename: async (sessionId, name) => {
    await invoke('rename_agent', { sessionId, name })
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, name } : x
      ),
    }))
  },
}))
