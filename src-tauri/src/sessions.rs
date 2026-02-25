use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentSession {
    pub id: String,
    pub project_id: String,
    pub name: Option<String>,
    pub status: String,
    pub scrollback: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn create_session_db(pool: &SqlitePool, project_id: &str, name: &str) -> Result<AgentSession> {
    let id = Uuid::new_v4().to_string();
    let session = sqlx::query_as::<_, AgentSession>(
        "INSERT INTO agent_sessions (id, project_id, name) VALUES (?, ?, ?) RETURNING *",
    )
    .bind(&id)
    .bind(project_id)
    .bind(name)
    .fetch_one(pool)
    .await?;
    Ok(session)
}

pub async fn list_sessions_db(pool: &SqlitePool, project_id: &str) -> Result<Vec<AgentSession>> {
    let sessions = sqlx::query_as::<_, AgentSession>(
        "SELECT * FROM agent_sessions WHERE project_id = ? ORDER BY created_at DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(sessions)
}

pub async fn update_session_status_db(pool: &SqlitePool, id: &str, status: &str) -> Result<()> {
    sqlx::query(
        "UPDATE agent_sessions SET status = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .bind(status)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn save_scrollback_db(pool: &SqlitePool, id: &str, scrollback: &str) -> Result<()> {
    sqlx::query(
        "UPDATE agent_sessions SET scrollback = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .bind(scrollback)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn spawn_agent(
    project_id: String,
    project_path: String,
    agent_name: String,
    command: String,
    args: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<AgentSession, String> {
    let session = create_session_db(&state.db, &project_id, &agent_name)
        .await
        .map_err(|e| e.to_string())?;

    state
        .pty
        .spawn_agent(
            session.id.clone(),
            project_id,
            &project_path,
            &command,
            &args,
            state.terminal_tx.clone(),
            app,
        )
        .map_err(|e| e.to_string())?;

    update_session_status_db(&state.db, &session.id, "running")
        .await
        .map_err(|e| e.to_string())?;

    // Return the updated session
    let updated = sqlx::query_as::<_, AgentSession>(
        "SELECT * FROM agent_sessions WHERE id = ?",
    )
    .bind(&session.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(updated)
}

#[tauri::command]
pub async fn list_sessions(
    project_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<AgentSession>, String> {
    list_sessions_db(&state.db, &project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_agent(
    session_id: String,
    name: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    sqlx::query("UPDATE agent_sessions SET name = ?, updated_at = unixepoch() WHERE id = ?")
        .bind(&name)
        .bind(&session_id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kill_agent(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state.pty.kill_session(&session_id);
    sqlx::query("DELETE FROM agent_sessions WHERE id = ?")
        .bind(&session_id)
        .execute(&state.db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_pty(
    session_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state
        .pty
        .resize_session(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_to_agent(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    state
        .pty
        .write_to_session(&session_id, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn spawn_shell(
    session_id: String,
    project_path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    // No-op if a shell with this ID is already running
    if state.pty.get_session(&session_id).is_some() {
        return Ok(());
    }
    state
        .pty
        .spawn_shell(session_id, &project_path, state.terminal_tx.clone(), app)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_scrollback(
    session_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<u8>, String> {
    // If session is live in PTY manager, return in-memory scrollback
    if let Some((_, scrollback)) = state.pty.get_session(&session_id) {
        return Ok(scrollback);
    }

    // Fallback: load from DB for stopped sessions
    let session = sqlx::query_as::<_, AgentSession>(
        "SELECT * FROM agent_sessions WHERE id = ?",
    )
    .bind(&session_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(session
        .and_then(|s| s.scrollback)
        .unwrap_or_default()
        .into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_create_and_list_sessions() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();

        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1', 'Test', '/tmp')")
            .execute(&pool)
            .await
            .unwrap();

        let session = create_session_db(&pool, "p1", "Session 1").await.unwrap();
        assert_eq!(session.project_id, "p1");
        assert_eq!(session.status, "stopped");

        let sessions = list_sessions_db(&pool, "p1").await.unwrap();
        assert_eq!(sessions.len(), 1);
    }

    #[tokio::test]
    async fn test_update_session_status() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();

        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1', 'T', '/tmp')")
            .execute(&pool)
            .await
            .unwrap();

        let s = create_session_db(&pool, "p1", "S1").await.unwrap();
        update_session_status_db(&pool, &s.id, "running").await.unwrap();

        let sessions = list_sessions_db(&pool, "p1").await.unwrap();
        assert_eq!(sessions[0].status, "running");
    }
}
