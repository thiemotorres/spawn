type OutputListener = (sessionId: string, data: Uint8Array) => void

const listeners = new Set<OutputListener>()
let socket: WebSocket | null = null

function connect() {
  if (socket && socket.readyState !== WebSocket.CLOSED) return
  socket = new WebSocket('ws://127.0.0.1:9731/ws')
  socket.onmessage = (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as {
        type: string
        session_id: string
        data: number[]
      }
      if (msg.type === 'TerminalOutput') {
        const bytes = new Uint8Array(msg.data)
        listeners.forEach((fn) => fn(msg.session_id, bytes))
      }
    } catch {
      // ignore malformed messages
    }
  }
  socket.onclose = () => {
    socket = null
    if (listeners.size > 0) {
      setTimeout(connect, 1000)
    }
  }
}

export function subscribe(listener: OutputListener): () => void {
  listeners.add(listener)
  connect()
  return () => {
    listeners.delete(listener)
  }
}
