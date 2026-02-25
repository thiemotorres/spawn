use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectGroup {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn list_groups_db(pool: &SqlitePool) -> Result<Vec<ProjectGroup>> {
    let groups = sqlx::query_as::<_, ProjectGroup>("SELECT * FROM project_groups ORDER BY created_at")
        .fetch_all(pool)
        .await?;
    Ok(groups)
}

pub async fn create_group_db(pool: &SqlitePool, name: &str) -> Result<ProjectGroup> {
    if name.trim().is_empty() {
        return Err(anyhow::anyhow!("Group name cannot be empty"));
    }
    let id = Uuid::new_v4().to_string();
    let group = sqlx::query_as::<_, ProjectGroup>(
        "INSERT INTO project_groups (id, name) VALUES (?, ?) RETURNING *",
    )
    .bind(&id)
    .bind(name)
    .fetch_one(pool)
    .await?;
    Ok(group)
}

pub async fn rename_group_db(pool: &SqlitePool, id: &str, name: &str) -> Result<()> {
    if name.trim().is_empty() {
        return Err(anyhow::anyhow!("Group name cannot be empty"));
    }
    let result = sqlx::query(
        "UPDATE project_groups SET name = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .bind(name)
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Group not found"));
    }
    Ok(())
}

pub async fn delete_group_db(pool: &SqlitePool, id: &str) -> Result<()> {
    let result = sqlx::query("DELETE FROM project_groups WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Group not found"));
    }
    Ok(())
}

pub async fn assign_project_group_db(
    pool: &SqlitePool,
    project_id: &str,
    group_id: Option<&str>,
) -> Result<()> {
    let result = sqlx::query("UPDATE projects SET group_id = ? WHERE id = ?")
        .bind(group_id)
        .bind(project_id)
        .execute(pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(anyhow::anyhow!("Project not found"));
    }
    Ok(())
}

// --- Tauri commands ---

#[tauri::command]
pub async fn list_groups(
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<ProjectGroup>, String> {
    list_groups_db(&state.db).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_group(
    name: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<ProjectGroup, String> {
    create_group_db(&state.db, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_group(
    id: String,
    name: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    rename_group_db(&state.db, &id, &name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_group(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    delete_group_db(&state.db, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn assign_project_group(
    project_id: String,
    group_id: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    assign_project_group_db(&state.db, &project_id, group_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::tempdir;

    async fn test_pool() -> (SqlitePool, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();
        (pool, dir)
    }

    #[tokio::test]
    async fn test_create_and_list_groups() {
        let (pool, _dir) = test_pool().await;
        create_group_db(&pool, "Work").await.unwrap();
        create_group_db(&pool, "Personal").await.unwrap();
        let groups = list_groups_db(&pool).await.unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].name, "Work");
        assert_eq!(groups[1].name, "Personal");
    }

    #[tokio::test]
    async fn test_rename_group() {
        let (pool, _dir) = test_pool().await;
        let g = create_group_db(&pool, "Old Name").await.unwrap();
        rename_group_db(&pool, &g.id, "New Name").await.unwrap();
        let groups = list_groups_db(&pool).await.unwrap();
        assert_eq!(groups[0].name, "New Name");
    }

    #[tokio::test]
    async fn test_rename_nonexistent_group_errors() {
        let (pool, _dir) = test_pool().await;
        let result = rename_group_db(&pool, "nonexistent-id", "Name").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_delete_group() {
        let (pool, _dir) = test_pool().await;
        let g = create_group_db(&pool, "ToDelete").await.unwrap();
        delete_group_db(&pool, &g.id).await.unwrap();
        let groups = list_groups_db(&pool).await.unwrap();
        assert!(groups.is_empty());
    }

    #[tokio::test]
    async fn test_create_group_empty_name_errors() {
        let (pool, _dir) = test_pool().await;
        let result = create_group_db(&pool, "  ").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_delete_nonexistent_group_errors() {
        let (pool, _dir) = test_pool().await;
        let result = delete_group_db(&pool, "nonexistent-id").await;
        assert!(result.is_err());
    }
}
