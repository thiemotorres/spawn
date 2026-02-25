import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { ProjectPanel } from './ProjectPanel'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

const project = {
  id: '1',
  name: 'My App',
  path: '/app',
  created_at: 0,
}

const tasks = [
  {
    id: 't1',
    project_id: '1',
    source: 'custom',
    title: 'Fix the bug',
    status: 'todo',
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 't2',
    project_id: '1',
    source: 'custom',
    title: 'Add feature',
    status: 'done',
    created_at: 0,
    updated_at: 0,
  },
]

test('renders Files section', () => {
  render(
    <ProjectPanel
      project={project}
      tasks={[]}
      onAddTask={() => {}}
      onUpdateTaskStatus={() => {}}
    />
  )
  expect(screen.getByText('Files')).toBeInTheDocument()
})

test('renders Tasks section', () => {
  render(
    <ProjectPanel
      project={project}
      tasks={tasks}
      onAddTask={() => {}}
      onUpdateTaskStatus={() => {}}
    />
  )
  expect(screen.getByText('Tasks')).toBeInTheDocument()
  expect(screen.getByText('Fix the bug')).toBeInTheDocument()
  expect(screen.getByText('Add feature')).toBeInTheDocument()
})

test('done tasks have line-through style', () => {
  render(
    <ProjectPanel
      project={project}
      tasks={tasks}
      onAddTask={() => {}}
      onUpdateTaskStatus={() => {}}
    />
  )
  const doneTask = screen.getByText('Add feature')
  expect(doneTask).toHaveClass('line-through')
})

test('calls onUpdateTaskStatus when status button clicked', () => {
  const onUpdateTaskStatus = vi.fn()
  render(
    <ProjectPanel
      project={project}
      tasks={tasks}
      onAddTask={() => {}}
      onUpdateTaskStatus={onUpdateTaskStatus}
    />
  )
  // Click the status button for the first task
  const statusButtons = screen.getAllByRole('button', { name: /○|◑|●/ })
  fireEvent.click(statusButtons[0])
  expect(onUpdateTaskStatus).toHaveBeenCalledWith('t1', 'in_progress')
})

test('calls onAddTask when Enter pressed in task input', () => {
  const onAddTask = vi.fn()
  render(
    <ProjectPanel
      project={project}
      tasks={[]}
      onAddTask={onAddTask}
      onUpdateTaskStatus={() => {}}
    />
  )
  const input = screen.getByPlaceholderText('Add task...')
  fireEvent.change(input, { target: { value: 'New task' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onAddTask).toHaveBeenCalledWith('New task')
})
