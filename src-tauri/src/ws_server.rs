use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::sync::broadcast;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsMessage {
    TerminalOutput {
        session_id: String,
        data: Vec<u8>,
    },
    Ping,
}

pub fn server_addr(port: u16) -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], port))
}

pub async fn start(port: u16, terminal_tx: broadcast::Sender<(String, Vec<u8>)>) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(terminal_tx);

    let addr = server_addr(port);
    let listener = tokio::net::TcpListener::bind(addr).await
        .map_err(|e| anyhow::anyhow!("Failed to bind WebSocket server on port {}: {}", port, e))?;
    axum::serve(listener, app).await
        .map_err(|e| anyhow::anyhow!("WebSocket server error: {}", e))?;
    Ok(())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(tx): State<broadcast::Sender<(String, Vec<u8>)>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, tx))
}

async fn handle_socket(mut socket: WebSocket, tx: broadcast::Sender<(String, Vec<u8>)>) {
    let mut rx = tx.subscribe();

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok((session_id, data)) => {
                        let msg = WsMessage::TerminalOutput { session_id, data };
                        if let Ok(json) = serde_json::to_string(&msg) {
                            if socket.send(Message::Text(json.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_addr_port() {
        let addr = server_addr(9731);
        assert_eq!(addr.port(), 9731);
    }

    #[test]
    fn test_server_addr_is_localhost() {
        let addr = server_addr(9731);
        assert!(addr.ip().is_loopback());
    }
}
