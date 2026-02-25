use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub github_repo: Option<String>,
    pub group_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ProjectWithGit {
    pub project: Project,
    pub branch: Option<String>,
    pub last_commit: Option<String>,
    pub has_spawn_md: bool,
}

pub async fn add_project_db(pool: &SqlitePool, path: &str, name: &str, description: Option<&str>) -> Result<Project> {
    let id = Uuid::new_v4().to_string();
    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (id, name, path, description) VALUES (?, ?, ?, ?) RETURNING *"
    )
    .bind(&id)
    .bind(name)
    .bind(path)
    .bind(description)
    .fetch_one(pool)
    .await?;
    Ok(project)
}

pub async fn list_projects_db(pool: &SqlitePool) -> Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY created_at")
        .fetch_all(pool)
        .await?;
    Ok(projects)
}

pub async fn remove_project_db(pool: &SqlitePool, id: &str) -> Result<()> {
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub fn get_git_info(path: &str) -> (Option<String>, Option<String>) {
    let Ok(repo) = git2::Repository::open(path) else { return (None, None) };
    let branch = repo.head().ok()
        .and_then(|h| h.shorthand().map(str::to_string));
    let last_commit = repo.head().ok()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| c.summary().unwrap_or("").to_string());
    (branch, last_commit)
}

#[tauri::command]
pub async fn list_projects(state: tauri::State<'_, crate::AppState>) -> Result<Vec<ProjectWithGit>, String> {
    let projects = list_projects_db(&state.db).await.map_err(|e| e.to_string())?;
    let result = projects.into_iter().map(|p| {
        let (branch, last_commit) = get_git_info(&p.path);
        let has_spawn_md = std::path::Path::new(&p.path).join(".spawn.md").exists();
        ProjectWithGit { project: p, branch, last_commit, has_spawn_md }
    }).collect();
    Ok(result)
}

#[tauri::command]
pub async fn add_project(
    path: String,
    name: String,
    description: Option<String>,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Project, String> {
    add_project_db(&state.db, &path, &name, description.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_project(id: String, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    remove_project_db(&state.db, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_spawn_md(path: String) -> Option<String> {
    let file_path = std::path::Path::new(&path).join(".spawn.md");
    std::fs::read_to_string(file_path).ok()
}

#[tauri::command]
pub fn write_spawn_md(path: String, content: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path).join(".spawn.md");
    std::fs::write(file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_markdown_file(project_path: String, filename: String) -> Result<Option<String>, String> {
    let base = std::fs::canonicalize(&project_path)
        .map_err(|e| format!("Invalid project path: {}", e))?;
    let target = base.join(&filename);
    let resolved = target.components().collect::<std::path::PathBuf>();
    if !resolved.starts_with(&base) {
        return Err("Access denied: path outside project directory".to_string());
    }
    Ok(std::fs::read_to_string(&target).ok())
}

#[tauri::command]
pub fn write_markdown_file(project_path: String, filename: String, content: String) -> Result<(), String> {
    let base = std::fs::canonicalize(&project_path)
        .map_err(|e| format!("Invalid project path: {}", e))?;
    let target = base.join(&filename);
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Access denied: invalid filename".to_string());
    }
    std::fs::write(target, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_in_vscode(path: String) -> Result<(), String> {
    std::process::Command::new("code")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
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
    async fn test_add_project() {
        let (pool, _dir) = test_pool().await;
        let dir = tempdir().unwrap();
        let project = add_project_db(&pool, dir.path().to_str().unwrap(), "My Project", None).await.unwrap();
        assert_eq!(project.name, "My Project");
        assert_eq!(project.path, dir.path().to_str().unwrap());
    }

    #[tokio::test]
    async fn test_list_projects() {
        let (pool, _dir) = test_pool().await;
        let dir = tempdir().unwrap();
        add_project_db(&pool, dir.path().to_str().unwrap(), "P1", None).await.unwrap();
        let projects = list_projects_db(&pool).await.unwrap();
        assert_eq!(projects.len(), 1);
    }

    #[tokio::test]
    async fn test_remove_project() {
        let (pool, _dir) = test_pool().await;
        let dir = tempdir().unwrap();
        let p = add_project_db(&pool, dir.path().to_str().unwrap(), "P1", None).await.unwrap();
        remove_project_db(&pool, &p.id).await.unwrap();
        let projects = list_projects_db(&pool).await.unwrap();
        assert_eq!(projects.len(), 0);
    }
}
