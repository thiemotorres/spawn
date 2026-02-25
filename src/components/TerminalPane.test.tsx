import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { TerminalPane } from './TerminalPane'
import type { AgentConfig } from '../store/agentConfigs'

// Mock the WebSocket hook
vi.mock('../hooks/useTerminalWs', () => ({
  useTerminalWs: vi.fn(),
}))

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

// Mock the Terminal component directly to avoid xterm/ResizeObserver jsdom issues
vi.mock('./Terminal', () => ({
  Terminal: ({ sessionId }: { sessionId: string }) => <div data-testid={`terminal-${sessionId}`} />,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const sessions = [
  {
    id: 's1',
    name: 'Agent 1',
    status: 'running',
    project_id: 'p1',
    scrollback: null,
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 's2',
    name: 'Agent 2',
    status: 'stopped',
    project_id: 'p1',
    scrollback: null,
    created_at: 0,
    updated_at: 0,
  },
]

const defaultProps = {
  sessions,
  agentConfigs: [] as AgentConfig[],
  onSpawn: vi.fn() as (config: AgentConfig) => void,
  onKill: vi.fn() as (id: string) => void,
  onRename: vi.fn() as (id: string, name: string) => void,
}

test('renders a tab for each session', () => {
  render(<TerminalPane {...defaultProps} />)
  expect(screen.getByText('Agent 1')).toBeInTheDocument()
  expect(screen.getByText('Agent 2')).toBeInTheDocument()
})

test('renders spawn button', () => {
  render(<TerminalPane {...defaultProps} sessions={[]} />)
  expect(screen.getByText('+')).toBeInTheDocument()
})

test('calls onSpawn when + is clicked', () => {
  const onSpawn = vi.fn() as (config: AgentConfig) => void
  render(<TerminalPane {...defaultProps} sessions={[]} onSpawn={onSpawn} />)
  fireEvent.click(screen.getByText('+'))
  expect(onSpawn).toHaveBeenCalled()
})

test('shows empty state when no sessions', () => {
  render(<TerminalPane {...defaultProps} sessions={[]} />)
  expect(screen.getByText(/Nothing running/)).toBeInTheDocument()
})
