import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { LaunchAgentModal } from './LaunchAgentModal'

test('shows agenthub.md content when provided', () => {
  render(
    <LaunchAgentModal
      projectPath="/tmp"
      agenthubMd="Work on feature X"
      onLaunch={() => {}}
      onClose={() => {}}
    />
  )
  expect(screen.getByDisplayValue('Work on feature X')).toBeInTheDocument()
})

test('shows empty textarea when no agenthub.md', () => {
  render(
    <LaunchAgentModal
      projectPath="/tmp"
      agenthubMd={null}
      onLaunch={() => {}}
      onClose={() => {}}
    />
  )
  const textarea = screen.getByRole('textbox')
  expect(textarea).toBeInTheDocument()
  expect((textarea as HTMLTextAreaElement).value).toBe('')
})

test('calls onLaunch with current prompt text', () => {
  const onLaunch = vi.fn()
  render(
    <LaunchAgentModal
      projectPath="/tmp"
      agenthubMd="Initial"
      onLaunch={onLaunch}
      onClose={() => {}}
    />
  )
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Updated prompt' },
  })
  fireEvent.click(screen.getByText('Launch Agent'))
  expect(onLaunch).toHaveBeenCalledWith('Updated prompt')
})

test('calls onLaunch with undefined when prompt is empty', () => {
  const onLaunch = vi.fn()
  render(
    <LaunchAgentModal
      projectPath="/tmp"
      agenthubMd={null}
      onLaunch={onLaunch}
      onClose={() => {}}
    />
  )
  fireEvent.click(screen.getByText('Launch Agent'))
  expect(onLaunch).toHaveBeenCalledWith(undefined)
})

test('calls onClose when Cancel is clicked', () => {
  const onClose = vi.fn()
  render(
    <LaunchAgentModal
      projectPath="/tmp"
      agenthubMd={null}
      onLaunch={() => {}}
      onClose={onClose}
    />
  )
  fireEvent.click(screen.getByText('Cancel'))
  expect(onClose).toHaveBeenCalled()
})
