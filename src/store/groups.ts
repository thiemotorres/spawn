import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface ProjectGroup {
  id: string
  name: string
  created_at: number
  updated_at: number
}

interface GroupStore {
  groups: ProjectGroup[]
  load: () => Promise<void>
  create: (name: string) => Promise<ProjectGroup>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  assignProject: (projectId: string, groupId: string | null) => Promise<void>
}

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  load: async () => {
    const groups = await invoke<ProjectGroup[]>('list_groups')
    set({ groups })
  },
  create: async (name) => {
    const group = await invoke<ProjectGroup>('create_group', { name })
    await get().load()
    return group
  },
  rename: async (id, name) => {
    await invoke('rename_group', { id, name })
    await get().load()
  },
  remove: async (id) => {
    await invoke('delete_group', { id })
    await get().load()
  },
  assignProject: async (projectId, groupId) => {
    await invoke('assign_project_group', { projectId, groupId })
  },
}))
