import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Sidebar } from './components/Sidebar'
import { TerminalPane } from './components/TerminalPane'
import { ShellPane } from './components/ShellPane'
import { ProjectPanel } from './components/ProjectPanel'
import { AddProjectModal } from './components/AddProjectModal'
import { SettingsModal } from './components/SettingsModal'
import { useProjectStore } from './store/projects'
import { useSessionStore } from './store/sessions'
import { useTaskStore } from './store/tasks'
import { useAgentConfigStore, type AgentConfig } from './store/agentConfigs'
import { useGroupStore } from './store/groups'

export default function App() {
  const {
    projects,
    selectedProjectId,
    load: loadProjects,
    add: addProject,
    select,
  } = useProjectStore()

  const {
    sessions,
    load: loadSessions,
    spawn: spawnAgent,
    kill: killAgent,
    rename: renameAgent,
  } = useSessionStore()

  const {
    tasks,
    load: loadTasks,
    add: addTask,
    updateStatus,
  } = useTaskStore()

  const { configs: agentConfigs, load: loadAgentConfigs } = useAgentConfigStore()

  const {
    groups,
    load: loadGroups,
    create: createGroup,
    rename: renameGroup,
    remove: removeGroup,
    assignProject: assignProjectGroup,
  } = useGroupStore()

  const [showAddProject, setShowAddProject] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Shell terminal state
  const [shellSessionId, setShellSessionId] = useState<string | null>(null)
  const shellSessionIdRef = useRef<string | null>(null)
  const [shellHeight, setShellHeight] = useState(220)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeight = useRef(0)

  // Load projects and agent configs on mount
  useEffect(() => {
    loadProjects()
    loadAgentConfigs()
    loadGroups()
  }, [])

  // Load sessions and tasks when project selection changes; manage shell terminal
  useEffect(() => {
    if (selectedProjectId) {
      loadSessions(selectedProjectId)
      loadTasks(selectedProjectId)
    }

    const proj = projects.find((p) => p.project.id === selectedProjectId)

    // Kill previous shell session
    if (shellSessionIdRef.current) {
      invoke('kill_agent', { sessionId: shellSessionIdRef.current }).catch(() => {})
      shellSessionIdRef.current = null
      setShellSessionId(null)
    }

    if (proj) {
      const newId = crypto.randomUUID()
      shellSessionIdRef.current = newId
      setShellSessionId(newId)
      invoke('spawn_shell', {
        sessionId: newId,
        projectPath: proj.project.path,
      }).catch(console.error)
    }
  }, [selectedProjectId])

  // Drag-to-resize shell pane
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = dragStartY.current - e.clientY
      setShellHeight(Math.max(80, Math.min(700, dragStartHeight.current + delta)))
    }
    const onMouseUp = () => { isDragging.current = false }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartHeight.current = shellHeight
    e.preventDefault()
  }

  const selectedProject = projects.find(
    (p) => p.project.id === selectedProjectId
  )

  const handleLaunchAgent = async (config: AgentConfig) => {
    if (!selectedProject) return
    try {
      const args = JSON.parse(config.args) as string[]
      await spawnAgent(
        selectedProject.project.id,
        selectedProject.project.path,
        config.name,
        config.command,
        args,
      )
    } catch (e) {
      console.error('spawn_agent failed:', e)
    }
  }

  const handleMoveProject = async (projectId: string, groupId: string | null) => {
    await assignProjectGroup(projectId, groupId)
    await loadProjects()
  }

  const handleCreateGroup = async (name: string) => {
    await createGroup(name)
  }

  const handleAddProject = async (
    path: string,
    name: string,
    description?: string
  ) => {
    await addProject(path, name, description)
    setShowAddProject(false)
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-zinc-100 overflow-hidden">
      {/* Modals */}
      {showAddProject && (
        <AddProjectModal
          onAdd={handleAddProject}
          onClose={() => setShowAddProject(false)}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* Left sidebar */}
      <Sidebar
        projects={projects}
        groups={groups}
        selectedProjectId={selectedProjectId}
        onSelect={select}
        onAdd={() => setShowAddProject(true)}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={renameGroup}
        onDeleteGroup={removeGroup}
        onMoveProject={handleMoveProject}
      />

      {/* Center: agent terminals + shell */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Agent pane — takes all remaining vertical space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TerminalPane
            sessions={sessions}
            agentConfigs={agentConfigs}
            onSpawn={handleLaunchAgent}
            onKill={killAgent}
            onRename={renameAgent}
          />
        </div>

        {/* Drag handle + shell pane */}
        {shellSessionId && (
          <>
            {!terminalCollapsed && (
              <div
                className="h-1.5 bg-zinc-700 hover:bg-blue-500 cursor-row-resize flex-shrink-0 transition-colors"
                onMouseDown={handleDividerMouseDown}
              />
            )}
            <div
              className="flex flex-col flex-shrink-0 overflow-hidden bg-zinc-900"
              style={{ height: terminalCollapsed ? undefined : shellHeight }}
            >
              <div className="flex items-center px-3 py-1 bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
                <span className="text-xs text-zinc-400 font-medium">Terminal</span>
                <button
                  onClick={() => setTerminalCollapsed((c) => !c)}
                  className="ml-auto text-zinc-500 hover:text-zinc-200 transition-colors text-xs leading-none"
                  aria-label={terminalCollapsed ? 'Expand terminal' : 'Collapse terminal'}
                >
                  {terminalCollapsed ? '▴' : '▾'}
                </button>
              </div>
              {!terminalCollapsed && (
                <div className="flex-1 min-h-0">
                  <ShellPane sessionId={shellSessionId} />
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Right: project info panel */}
      <ProjectPanel
        project={selectedProject?.project}
        tasks={tasks}
        onAddTask={(title) =>
          selectedProjectId ? addTask(selectedProjectId, title) : undefined
        }
        onUpdateTaskStatus={updateStatus}
        onOpenSettings={() => setShowSettings(true)}
      />
    </div>
  )
}
