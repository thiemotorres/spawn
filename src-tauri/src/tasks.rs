use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub source: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub github_issue_number: Option<i64>,
    pub session_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn create_task_db(
    pool: &SqlitePool,
    project_id: &str,
    title: &str,
    description: Option<&str>,
) -> Result<Task> {
    let id = Uuid::new_v4().to_string();
    let task = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (id, project_id, title, description) VALUES (?, ?, ?, ?) RETURNING *",
    )
    .bind(&id)
    .bind(project_id)
    .bind(title)
    .bind(description)
    .fetch_one(pool)
    .await?;
    Ok(task)
}

pub async fn list_tasks_db(pool: &SqlitePool, project_id: &str) -> Result<Vec<Task>> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;
    Ok(tasks)
}

pub async fn update_task_status_db(pool: &SqlitePool, id: &str, status: &str) -> Result<()> {
    sqlx::query(
        "UPDATE tasks SET status = ?, updated_at = unixepoch() WHERE id = ?",
    )
    .bind(status)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_task_db(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn list_tasks(
    project_id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Vec<Task>, String> {
    list_tasks_db(&state.db, &project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_task(
    project_id: String,
    title: String,
    description: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Task, String> {
    create_task_db(&state.db, &project_id, &title, description.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_task_status(
    id: String,
    status: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    update_task_status_db(&state.db, &id, &status)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_task(
    id: String,
    state: tauri::State<'_, crate::AppState>,
) -> Result<(), String> {
    delete_task_db(&state.db, &id)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_create_and_list_custom_tasks() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();

        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1','T','/t')")
            .execute(&pool)
            .await
            .unwrap();

        create_task_db(&pool, "p1", "Fix bug", None).await.unwrap();
        let tasks = list_tasks_db(&pool, "p1").await.unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].title, "Fix bug");
        assert_eq!(tasks[0].status, "todo");
    }

    #[tokio::test]
    async fn test_update_task_status() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();

        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1','T','/t')")
            .execute(&pool)
            .await
            .unwrap();

        let t = create_task_db(&pool, "p1", "Task", None).await.unwrap();
        update_task_status_db(&pool, &t.id, "done").await.unwrap();
        let tasks = list_tasks_db(&pool, "p1").await.unwrap();
        assert_eq!(tasks[0].status, "done");
    }

    #[tokio::test]
    async fn test_delete_task() {
        let dir = tempdir().unwrap();
        let pool = db::init(dir.path()).await.unwrap();

        sqlx::query("INSERT INTO projects (id, name, path) VALUES ('p1','T','/t')")
            .execute(&pool)
            .await
            .unwrap();

        let t = create_task_db(&pool, "p1", "Task to delete", None).await.unwrap();
        delete_task_db(&pool, &t.id).await.unwrap();
        let tasks = list_tasks_db(&pool, "p1").await.unwrap();
        assert_eq!(tasks.len(), 0);
    }
}
