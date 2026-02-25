import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface Project {
  id: string
  name: string
  path: string
  description?: string
  github_repo?: string
  group_id: string | null
  created_at: number
}

export interface ProjectWithGit {
  project: Project
  branch: string | null
  last_commit: string | null
  has_spawn_md: boolean
}

interface ProjectStore {
  projects: ProjectWithGit[]
  selectedProjectId: string | null
  load: () => Promise<void>
  add: (path: string, name: string, description?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  select: (id: string | null) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  load: async () => {
    const projects = await invoke<ProjectWithGit[]>('list_projects')
    set({ projects })
  },
  add: async (path, name, description) => {
    await invoke('add_project', { path, name, description })
    await get().load()
  },
  remove: async (id) => {
    await invoke('remove_project', { id })
    await get().load()
  },
  select: (id) => set({ selectedProjectId: id }),
}))
