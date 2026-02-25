use anyhow::Result;
use keyring::Entry;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssue {
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub html_url: String,
}

pub fn parse_repo_from_url(url: &str) -> Option<(String, String)> {
    // Handle https://github.com/owner/repo[.git]
    if let Some(path) = url.strip_prefix("https://github.com/") {
        let clean = path.trim_end_matches(".git");
        let parts: Vec<&str> = clean.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    // Handle git@github.com:owner/repo[.git]
    if let Some(path) = url.strip_prefix("git@github.com:") {
        let clean = path.trim_end_matches(".git");
        let parts: Vec<&str> = clean.splitn(2, '/').collect();
        if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Some((parts[0].to_string(), parts[1].to_string()));
        }
    }
    None
}

pub fn get_github_token(project_id: &str) -> Option<String> {
    Entry::new("spawn", &format!("github-{}", project_id))
        .ok()
        .and_then(|e| e.get_password().ok())
}

pub fn set_github_token(project_id: &str, token: &str) -> Result<()> {
    Entry::new("spawn", &format!("github-{}", project_id))?
        .set_password(token)?;
    Ok(())
}

pub async fn fetch_issues(owner: &str, repo: &str, token: &str) -> Result<Vec<GithubIssue>> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/issues?state=open&per_page=50",
        owner, repo
    );
    let issues: Vec<GithubIssue> = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "spawn/1.0")
        .send()
        .await?
        .json()
        .await?;
    Ok(issues)
}

#[tauri::command]
pub fn set_project_github_token(
    project_id: String,
    token: String,
) -> Result<(), String> {
    set_github_token(&project_id, &token).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_project_issues(
    project_id: String,
    project_path: String,
) -> Result<Vec<GithubIssue>, String> {
    let token = get_github_token(&project_id)
        .ok_or_else(|| "No GitHub token configured for this project".to_string())?;

    // Extract the remote URL synchronously, then drop all non-Send git2 types
    // before the first await point so the future is Send.
    let (owner, repo_name) = {
        let repo = git2::Repository::open(&project_path)
            .map_err(|e| format!("Could not open git repo: {}", e))?;
        let remote = repo
            .find_remote("origin")
            .map_err(|_| "No 'origin' remote found".to_string())?;
        let url = remote
            .url()
            .ok_or_else(|| "Remote URL is not valid UTF-8".to_string())?
            .to_string();
        parse_repo_from_url(&url)
            .ok_or_else(|| format!("Could not parse GitHub owner/repo from remote URL: {}", url))?
    };

    fetch_issues(&owner, &repo_name, &token)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_https_url() {
        let url = "https://github.com/owner/repo.git";
        assert_eq!(
            parse_repo_from_url(url),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn test_parse_https_url_no_git_suffix() {
        let url = "https://github.com/owner/repo";
        assert_eq!(
            parse_repo_from_url(url),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn test_parse_ssh_url() {
        let url = "git@github.com:owner/repo.git";
        assert_eq!(
            parse_repo_from_url(url),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }

    #[test]
    fn test_parse_invalid_url_returns_none() {
        assert_eq!(parse_repo_from_url("not-a-url"), None);
    }

    #[test]
    fn test_parse_gitlab_url_returns_none() {
        assert_eq!(
            parse_repo_from_url("https://gitlab.com/owner/repo.git"),
            None
        );
    }
}
