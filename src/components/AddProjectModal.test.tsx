import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { AddProjectModal } from './AddProjectModal'

// Mock the Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('/home/user/myapp'),
}))

test('calls onAdd with name and path when form submitted', async () => {
  const onAdd = vi.fn()
  render(<AddProjectModal onAdd={onAdd} onClose={() => {}} />)

  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'My App' },
  })
  fireEvent.change(screen.getByLabelText('Path'), {
    target: { value: '/home/user/myapp' },
  })
  fireEvent.click(screen.getByText('Add Project'))

  expect(onAdd).toHaveBeenCalledWith('/home/user/myapp', 'My App', undefined)
})

test('disables Add button when name is empty', () => {
  render(<AddProjectModal onAdd={() => {}} onClose={() => {}} />)
  expect(screen.getByText('Add Project')).toBeDisabled()
})

test('disables Add button when path is empty', () => {
  render(<AddProjectModal onAdd={() => {}} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('Project Name'), {
    target: { value: 'My App' },
  })
  expect(screen.getByText('Add Project')).toBeDisabled()
})

test('calls onClose when Cancel is clicked', () => {
  const onClose = vi.fn()
  render(<AddProjectModal onAdd={() => {}} onClose={onClose} />)
  fireEvent.click(screen.getByText('Cancel'))
  expect(onClose).toHaveBeenCalled()
})
