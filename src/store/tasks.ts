import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface Task {
  id: string
  project_id: string
  source: string
  title: string
  description?: string
  status: string
  github_issue_number?: number
  session_id?: string
  created_at: number
  updated_at: number
}

interface TaskStore {
  tasks: Task[]
  load: (projectId: string) => Promise<void>
  add: (projectId: string, title: string) => Promise<void>
  updateStatus: (id: string, status: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  load: async (projectId) => {
    const tasks = await invoke<Task[]>('list_tasks', { projectId })
    set({ tasks })
  },
  add: async (projectId, title) => {
    const task = await invoke<Task>('create_task', { projectId, title })
    set((s) => ({ tasks: [...s.tasks, task] }))
  },
  updateStatus: async (id, status) => {
    await invoke('update_task_status', { id, status })
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status } : t)),
    }))
  },
  remove: async (id) => {
    await invoke('delete_task', { id })
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  },
}))
