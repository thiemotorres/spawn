mod agent_configs;
mod db;
mod git_ops;
mod group_ops;
mod github;
mod projects;
mod pty_manager;
mod sessions;
mod tasks;
mod ws_server;

use sqlx::SqlitePool;
use tauri::Manager;
use pty_manager::PtyManager;

pub struct AppState {
    pub db: SqlitePool,
    pub pty: PtyManager,
    pub terminal_tx: tokio::sync::broadcast::Sender<(String, Vec<u8>)>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&data_dir).unwrap();
            let pool = tauri::async_runtime::block_on(db::init(&data_dir)).unwrap();
            // PTY processes don't survive an app restart — clear stale sessions.
            tauri::async_runtime::block_on(
                sqlx::query("DELETE FROM agent_sessions").execute(&pool)
            ).unwrap();
            let (terminal_tx, _) = tokio::sync::broadcast::channel(1024);
            app.manage(AppState {
                db: pool,
                pty: PtyManager::new(),
                terminal_tx,
            });
            let tx = app.state::<crate::AppState>().terminal_tx.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ws_server::start(9731, tx).await {
                    eprintln!("WebSocket server failed: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projects::list_projects,
            projects::add_project,
            projects::remove_project,
            projects::read_spawn_md,
            projects::write_spawn_md,
            projects::read_markdown_file,
            projects::write_markdown_file,
            sessions::spawn_agent,
            sessions::spawn_shell,
            sessions::list_sessions,
            sessions::rename_agent,
            sessions::kill_agent,
            sessions::resize_pty,
            sessions::write_to_agent,
            sessions::get_scrollback,
            tasks::list_tasks,
            tasks::create_task,
            tasks::update_task_status,
            tasks::delete_task,
            github::set_project_github_token,
            github::fetch_project_issues,
            agent_configs::list_agent_configs,
            agent_configs::add_agent_config,
            agent_configs::update_agent_config,
            agent_configs::delete_agent_config,
            agent_configs::set_default_agent_config,
            group_ops::list_groups,
            group_ops::create_group,
            group_ops::rename_group,
            group_ops::delete_group,
            group_ops::assign_project_group,
            projects::open_in_finder,
            projects::open_in_vscode,
            git_ops::get_git_status,
            git_ops::git_init,
            git_ops::git_checkout,
            git_ops::git_create_branch,
            git_ops::git_pull,
            git_ops::git_push,
            git_ops::git_commit_all,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
