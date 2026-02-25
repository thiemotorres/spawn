use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: String, // JSON array e.g. '["--flag"]'
    pub is_default: bool,
    pub created_at: i64,
}

pub async fn list_db(pool: &SqlitePool) -> Result<Vec<AgentConfig>> {
    Ok(sqlx::query_as::<_, AgentConfig>(
        "SELECT * FROM agent_configs ORDER BY is_default DESC, created_at ASC",
    )
    .fetch_all(pool)
    .await?)
}

pub async fn add_db(pool: &SqlitePool, name: &str, command: &str, args: &str) -> Result<AgentConfig> {
    let id = Uuid::new_v4().to_string();
    Ok(sqlx::query_as::<_, AgentConfig>(
        "INSERT INTO agent_configs (id, name, command, args) VALUES (?, ?, ?, ?) RETURNING *",
    )
    .bind(&id)
    .bind(name)
    .bind(command)
    .bind(args)
    .fetch_one(pool)
    .await?)
}

pub async fn update_db(pool: &SqlitePool, id: &str, name: &str, command: &str, args: &str) -> Result<()> {
    sqlx::query("UPDATE agent_configs SET name = ?, command = ?, args = ? WHERE id = ?")
        .bind(name)
        .bind(command)
        .bind(args)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_db(pool: &SqlitePool, id: &str) -> Result<()> {
    // Prevent deleting the last config or the builtin default
    sqlx::query("DELETE FROM agent_configs WHERE id = ? AND is_default = 0")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_default_db(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("UPDATE agent_configs SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// --- Tauri commands ---

#[tauri::command]
pub async fn list_agent_configs(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<AgentConfig>, String> {
    list_db(&state.db).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_agent_config(
    name: String,
    command: String,
    args: Vec<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<AgentConfig, String> {
    let args_json = serde_json::to_string(&args).unwrap_or_else(|_| "[]".to_string());
    add_db(&state.db, &name, &command, &args_json)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_agent_config(
    id: String,
    name: String,
    command: String,
    args: Vec<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    let args_json = serde_json::to_string(&args).unwrap_or_else(|_| "[]".to_string());
    update_db(&state.db, &id, &name, &command, &args_json)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_agent_config(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    delete_db(&state.db, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_default_agent_config(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    set_default_db(&state.db, &id)
        .await
        .map_err(|e| e.to_string())
}
