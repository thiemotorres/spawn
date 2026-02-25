use std::collections::HashMap;
use std::io::Read;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use anyhow::Result;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Running,
    Idle,
    Stopped,
}

pub struct PtySession {
    pub id: String,
    pub project_id: String,
    pub status: SessionStatus,
    pub scrollback: Vec<u8>,
    pub writer: Box<dyn std::io::Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct PtyManager {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_session(&self, id: &str) -> Option<(SessionStatus, Vec<u8>)> {
        let sessions = self.sessions.lock().unwrap();
        sessions.get(id).map(|s| (s.status.clone(), s.scrollback.clone()))
    }

    pub fn kill_session(&self, id: &str) {
        if let Some(mut session) = self.sessions.lock().unwrap().remove(id) {
            let _ = session.child.kill();
        }
    }

    pub fn write_to_session(&self, id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| anyhow::anyhow!("session not found"))?;
        session.writer.write_all(data)?;
        Ok(())
    }

    pub fn resize_session(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        use portable_pty::PtySize;
        let sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.get(id) {
            session.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })?;
        }
        Ok(())
    }

    pub fn spawn_agent(
        &self,
        session_id: String,
        project_id: String,
        project_path: &str,
        command: &str,
        args: &[String],
        output_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
        app_handle: tauri::AppHandle,
    ) -> Result<String> {
        use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

        let pty_system = NativePtySystem::default();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(command);
        for arg in args {
            cmd.arg(arg);
        }
        cmd.cwd(project_path);

        let child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;
        let mut reader = pair.master.try_clone_reader()?;

        let sid = session_id.clone();
        let sessions_arc = Arc::clone(&self.sessions);
        let app = app_handle.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        let _ = output_tx.send((sid.clone(), data.clone()));
                        if let Ok(mut map) = sessions_arc.lock() {
                            if let Some(s) = map.get_mut(&sid) {
                                s.scrollback.extend_from_slice(&data);
                            }
                        }
                    }
                }
            }
            let natural_exit = if let Ok(mut map) = sessions_arc.lock() {
                if let Some(s) = map.get_mut(&sid) {
                    s.status = SessionStatus::Stopped;
                    true
                } else {
                    false
                }
            } else {
                false
            };
            if natural_exit {
                let _ = app.emit("session-exited", sid.clone());
            }
        });

        let session = PtySession {
            id: session_id.clone(),
            project_id,
            status: SessionStatus::Running,
            scrollback: Vec::new(),
            writer,
            child,
            master: pair.master,
        };

        self.sessions.lock().unwrap().insert(session_id.clone(), session);
        Ok(session_id)
    }

    pub fn spawn_shell(
        &self,
        session_id: String,
        cwd: &str,
        output_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
        app_handle: tauri::AppHandle,
    ) -> Result<String> {
        use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        let pty_system = NativePtySystem::default();
        let pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(cwd);

        let child = pair.slave.spawn_command(cmd)?;
        let writer = pair.master.take_writer()?;
        let mut reader = pair.master.try_clone_reader()?;

        let sid = session_id.clone();
        let sessions_arc = Arc::clone(&self.sessions);
        let app = app_handle.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = buf[..n].to_vec();
                        let _ = output_tx.send((sid.clone(), data.clone()));
                        if let Ok(mut map) = sessions_arc.lock() {
                            if let Some(s) = map.get_mut(&sid) {
                                s.scrollback.extend_from_slice(&data);
                            }
                        }
                    }
                }
            }
            let natural_exit = if let Ok(mut map) = sessions_arc.lock() {
                if let Some(s) = map.get_mut(&sid) {
                    s.status = SessionStatus::Stopped;
                    true
                } else {
                    false
                }
            } else {
                false
            };
            if natural_exit {
                let _ = app.emit("session-exited", sid.clone());
            }
        });

        let session = PtySession {
            id: session_id.clone(),
            project_id: String::new(),
            status: SessionStatus::Running,
            scrollback: Vec::new(),
            writer,
            child,
            master: pair.master,
        };

        self.sessions.lock().unwrap().insert(session_id.clone(), session);
        Ok(session_id)
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_manager_has_no_sessions() {
        let manager = PtyManager::new();
        assert_eq!(manager.sessions.lock().unwrap().len(), 0);
    }

    #[test]
    fn test_get_nonexistent_session_returns_none() {
        let manager = PtyManager::new();
        let result = manager.get_session("nonexistent");
        assert!(result.is_none());
    }

    #[test]
    fn test_kill_nonexistent_session_is_noop() {
        let manager = PtyManager::new();
        // Should not panic
        manager.kill_session("nonexistent");
        assert_eq!(manager.sessions.lock().unwrap().len(), 0);
    }
}
