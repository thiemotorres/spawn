import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface AgentConfig {
  id: string
  name: string
  command: string
  args: string // JSON array string
  is_default: boolean
  created_at: number
}

interface AgentConfigStore {
  configs: AgentConfig[]
  load: () => Promise<void>
  add: (name: string, command: string, args: string[]) => Promise<void>
  update: (id: string, name: string, command: string, args: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  setDefault: (id: string) => Promise<void>
}

export const useAgentConfigStore = create<AgentConfigStore>((set, get) => ({
  configs: [],
  load: async () => {
    try {
      const configs = await invoke<AgentConfig[]>('list_agent_configs')
      set({ configs })
    } catch (e) {
      console.error('list_agent_configs failed:', e)
    }
  },
  add: async (name, command, args) => {
    await invoke('add_agent_config', { name, command, args })
    await get().load()
  },
  update: async (id, name, command, args) => {
    await invoke('update_agent_config', { id, name, command, args })
    await get().load()
  },
  remove: async (id) => {
    await invoke('delete_agent_config', { id })
    await get().load()
  },
  setDefault: async (id) => {
    await invoke('set_default_agent_config', { id })
    await get().load()
  },
}))
