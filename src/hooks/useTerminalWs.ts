import { useEffect, useRef } from 'react'
import { subscribe } from '../lib/terminalBus'

export function useTerminalWs(
  onOutput: (sessionId: string, data: Uint8Array) => void
) {
  const onOutputRef = useRef(onOutput)

  useEffect(() => {
    onOutputRef.current = onOutput
  })

  useEffect(() => {
    return subscribe((sessionId, data) => onOutputRef.current(sessionId, data))
  }, [])
}
