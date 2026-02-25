import { render, screen } from '@testing-library/react'
import { Terminal } from './Terminal'

test('renders terminal container with testid', () => {
  render(
    <Terminal sessionId="test-id" onInput={() => {}} onReady={() => {}} />
  )
  expect(screen.getByTestId('terminal-container')).toBeInTheDocument()
})

test('renders without crashing when scrollback provided', () => {
  const scrollback = new Uint8Array([104, 101, 108, 108, 111]) // "hello"
  render(
    <Terminal
      sessionId="test-id"
      onInput={() => {}}
      onReady={() => {}}
      scrollback={scrollback}
    />
  )
  expect(screen.getByTestId('terminal-container')).toBeInTheDocument()
})
