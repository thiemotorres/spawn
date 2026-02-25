import { useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Terminal } from './Terminal'
import { useTerminalWs } from '../hooks/useTerminalWs'

interface Props {
  sessionId: string
}

export function ShellPane({ sessionId }: Props) {
  const writeRef = useRef<((data: Uint8Array) => void) | null>(null)

  useTerminalWs((sid, data) => {
    if (sid === sessionId) {
      writeRef.current?.(data)
    }
  })

  const handleInput = async (data: string) => {
    try {
      const encoded = new TextEncoder().encode(data)
      await invoke('write_to_agent', { sessionId, data: Array.from(encoded) })
    } catch (e) {
      console.error('write_to_shell error:', e)
    }
  }

  return (
    <div className="h-full bg-zinc-900">
      <Terminal
        sessionId={sessionId}
        onInput={handleInput}
        onReady={(write) => { writeRef.current = write }}
      />
    </div>
  )
}
