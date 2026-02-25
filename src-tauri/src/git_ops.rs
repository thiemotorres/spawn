use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub has_upstream: bool,
    pub ahead: usize,
    pub behind: usize,
    pub changed_files: usize,
    pub staged_files: usize,
    pub last_commit: Option<String>,
    pub local_branches: Vec<String>,
}

#[tauri::command]
pub fn get_git_status(project_path: String) -> GitStatus {
    let Ok(repo) = git2::Repository::open(&project_path) else {
        return GitStatus {
            is_git_repo: false,
            branch: None,
            has_upstream: false,
            ahead: 0,
            behind: 0,
            changed_files: 0,
            staged_files: 0,
            last_commit: None,
            local_branches: vec![],
        };
    };

    let branch = repo.head().ok()
        .and_then(|h| h.shorthand().map(str::to_string));

    let last_commit = repo.head().ok()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| c.summary().unwrap_or("").to_string());

    // Count changed + staged files via status
    let mut changed_files = 0usize;
    let mut staged_files = 0usize;
    if let Ok(statuses) = repo.statuses(None) {
        for entry in statuses.iter() {
            let s = entry.status();
            if s.intersects(
                git2::Status::INDEX_NEW
                    | git2::Status::INDEX_MODIFIED
                    | git2::Status::INDEX_DELETED
                    | git2::Status::INDEX_RENAMED
                    | git2::Status::INDEX_TYPECHANGE,
            ) {
                staged_files += 1;
            }
            if s.intersects(
                git2::Status::WT_MODIFIED
                    | git2::Status::WT_DELETED
                    | git2::Status::WT_NEW
                    | git2::Status::WT_RENAMED
                    | git2::Status::WT_TYPECHANGE,
            ) {
                changed_files += 1;
            }
        }
    }

    // Ahead / behind
    let (ahead, behind, has_upstream) = branch.as_deref()
        .and_then(|b| {
            let local = repo.find_branch(b, git2::BranchType::Local).ok()?;
            let upstream = local.upstream().ok()?;
            let local_oid = repo.head().ok()?.peel_to_commit().ok()?.id();
            let upstream_oid = upstream.get().peel_to_commit().ok()?.id();
            let (a, bh) = repo.graph_ahead_behind(local_oid, upstream_oid).ok()?;
            Some((a, bh, true))
        })
        .unwrap_or((0, 0, false));

    // Local branches
    let local_branches: Vec<String> = repo
        .branches(Some(git2::BranchType::Local))
        .map(|branches| {
            branches
                .filter_map(|b| b.ok())
                .filter_map(|(b, _)| b.name().ok().flatten().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    GitStatus {
        is_git_repo: true,
        branch,
        has_upstream,
        ahead,
        behind,
        changed_files,
        staged_files,
        last_commit,
        local_branches,
    }
}

#[tauri::command]
pub fn git_init(project_path: String) -> Result<(), String> {
    git2::Repository::init(&project_path)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_checkout(project_path: String, branch: String) -> Result<(), String> {
    let repo = git2::Repository::open(&project_path).map_err(|e| e.to_string())?;
    let obj = repo
        .revparse_single(&format!("refs/heads/{}", branch))
        .map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    repo.set_head(&format!("refs/heads/{}", branch))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn git_create_branch(project_path: String, branch: String) -> Result<(), String> {
    let repo = git2::Repository::open(&project_path).map_err(|e| e.to_string())?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    repo.branch(&branch, &commit, false).map_err(|e| e.to_string())?;
    // Checkout the new branch
    let obj = repo
        .revparse_single(&format!("refs/heads/{}", branch))
        .map_err(|e| e.to_string())?;
    repo.checkout_tree(&obj, None).map_err(|e| e.to_string())?;
    repo.set_head(&format!("refs/heads/{}", branch))
        .map_err(|e| e.to_string())
}

/// Run a git network command (pull/push) via subprocess since git2 network support
/// requires libssh2/openssl which may not be available in the Tauri bundle.
fn run_git(project_path: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[tauri::command]
pub fn git_pull(project_path: String) -> Result<String, String> {
    run_git(&project_path, &["pull"])
}

#[tauri::command]
pub fn git_push(project_path: String) -> Result<String, String> {
    run_git(&project_path, &["push"])
}

#[tauri::command]
pub fn git_commit_all(project_path: String, message: String) -> Result<(), String> {
    run_git(&project_path, &["add", "-A"])?;
    run_git(&project_path, &["commit", "-m", &message])?;
    Ok(())
}
