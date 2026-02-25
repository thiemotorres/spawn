import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

// Mock all Tauri invoke calls
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}))

// Mock the WebSocket hook
vi.mock('./hooks/useTerminalWs', () => ({
  useTerminalWs: vi.fn(),
}))

test('renders the sidebar', () => {
  render(<App />)
  // The sidebar "Projects" heading should be present
  expect(screen.getByText('Projects')).toBeInTheDocument()
})

test('renders Add Project button', () => {
  render(<App />)
  expect(screen.getByText('+ Add Project')).toBeInTheDocument()
})

test('renders spawn button in terminal pane', () => {
  render(<App />)
  expect(screen.getByText('+')).toBeInTheDocument()
})
