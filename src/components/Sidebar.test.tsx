import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from './Sidebar'

const mockProjects = [
  {
    project: { id: '1', name: 'ProjectA', path: '/a', created_at: 0 },
    branch: 'main',
    last_commit: 'fix bug',
    has_agenthub_md: true,
  },
  {
    project: { id: '2', name: 'ProjectB', path: '/b', created_at: 0 },
    branch: null,
    last_commit: null,
    has_agenthub_md: false,
  },
]

test('renders project names', () => {
  render(
    <Sidebar
      projects={mockProjects}
      selectedProjectId={null}
      onSelect={() => {}}
      onAdd={() => {}}
    />
  )
  expect(screen.getByText('ProjectA')).toBeInTheDocument()
  expect(screen.getByText('ProjectB')).toBeInTheDocument()
})

test('highlights selected project', () => {
  render(
    <Sidebar
      projects={mockProjects}
      selectedProjectId="1"
      onSelect={() => {}}
      onAdd={() => {}}
    />
  )
  const item = screen.getByText('ProjectA').closest('li')
  expect(item).toHaveClass('bg-zinc-700')
})

test('calls onSelect when project clicked', () => {
  const onSelect = vi.fn()
  render(
    <Sidebar
      projects={mockProjects}
      selectedProjectId={null}
      onSelect={onSelect}
      onAdd={() => {}}
    />
  )
  fireEvent.click(screen.getByText('ProjectA'))
  expect(onSelect).toHaveBeenCalledWith('1')
})

test('calls onAdd when Add Project button clicked', () => {
  const onAdd = vi.fn()
  render(
    <Sidebar
      projects={[]}
      selectedProjectId={null}
      onSelect={() => {}}
      onAdd={onAdd}
    />
  )
  fireEvent.click(screen.getByText('+ Add Project'))
  expect(onAdd).toHaveBeenCalled()
})
