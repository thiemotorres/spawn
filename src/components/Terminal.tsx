import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  onInput: (data: string) => void
  onReady?: (write: (data: Uint8Array) => void) => void
  scrollback?: Uint8Array
}

export function Terminal({ sessionId, onInput, onReady, scrollback }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      theme: { background: '#18181b' },
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontSize: 13,
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    // Defer fit so the container has its final painted dimensions
    requestAnimationFrame(() => fitAddon.fit())

    if (scrollback && scrollback.length > 0) {
      term.write(scrollback)
    }

    term.onData((data) => onInput(data))

    term.onResize(({ cols, rows }) => {
      invoke('resize_pty', { sessionId, cols, rows }).catch(() => {})
    })

    if (onReady) {
      onReady((data: Uint8Array) => term.write(data))
    }

    const observer = new ResizeObserver(() => fitAddon.fit())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      term.dispose()
    }
  }, [sessionId])

  return (
    <div
      ref={containerRef}
      data-testid="terminal-container"
      className="w-full h-full"
      style={{ minHeight: '200px' }}
    />
  )
}
