use anyhow::Result;
use sqlx::{SqlitePool, sqlite::{SqlitePoolOptions, SqliteConnectOptions}};
use std::path::Path;
use std::str::FromStr;

pub async fn init(data_dir: &Path) -> Result<SqlitePool> {
    let db_path = data_dir.join("spawn.db");
    let db_url = format!("sqlite://{}?mode=rwc", db_path.display());

    let options = SqliteConnectOptions::from_str(&db_url)?
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_db_init_creates_tables() {
        let dir = tempdir().unwrap();
        let pool = init(dir.path()).await.unwrap();

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM projects")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 0);
    }

    #[tokio::test]
    async fn test_all_tables_exist() {
        let dir = tempdir().unwrap();
        let pool = init(dir.path()).await.unwrap();

        for table in &["projects", "agent_sessions", "tasks", "project_groups"] {
            let count: (i64,) = sqlx::query_as(&format!("SELECT COUNT(*) FROM {}", table))
                .fetch_one(&pool)
                .await
                .unwrap_or_else(|_| panic!("Table {} should exist", table));
            assert_eq!(count.0, 0);
        }
    }
}
