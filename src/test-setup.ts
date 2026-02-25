import '@testing-library/jest-dom'

global.ResizeObserver = vi.fn(function (this: Record<string, unknown>) {
  this.observe = vi.fn()
  this.unobserve = vi.fn()
  this.disconnect = vi.fn()
}) as unknown as typeof ResizeObserver

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn(function (this: Record<string, unknown>) {
    this.open = vi.fn()
    this.loadAddon = vi.fn()
    this.onData = vi.fn()
    this.write = vi.fn()
    this.dispose = vi.fn()
  })
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => {
  const FitAddon = vi.fn(function (this: Record<string, unknown>) {
    this.fit = vi.fn()
  })
  return { FitAddon }
})

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
