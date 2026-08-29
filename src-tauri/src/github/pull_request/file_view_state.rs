use std::collections::HashSet;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::super::{
    authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient,
};
use super::graphql_pull_request_number;

const PULL_REQUEST_FILE_VIEW_STATE_PAGE_SIZE: i32 = 100;

const PULL_REQUEST_FILE_VIEW_STATES_QUERY: &str = r#"
query HarborPullRequestFileViewStates(
  $owner: String!
  $repository: String!
  $pullRequestNumber: Int!
  $first: Int!
  $after: String
) {
  repository(owner: $owner, name: $repository) {
    pullRequest(number: $pullRequestNumber) {
      id
      files(first: $first, after: $after) {
        nodes {
          path
          viewerViewedState
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  }
}
"#;

const MARK_PULL_REQUEST_FILE_VIEWED_MUTATION: &str = r#"
mutation HarborMarkPullRequestFileViewed($pullRequestId: ID!, $path: String!) {
  markFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
    pullRequest {
      id
    }
  }
}
"#;

const UNMARK_PULL_REQUEST_FILE_VIEWED_MUTATION: &str = r#"
mutation HarborUnmarkPullRequestFileViewed($pullRequestId: ID!, $path: String!) {
  unmarkFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
    pullRequest {
      id
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "SCREAMING_SNAKE_CASE"))]
pub enum GitHubPullRequestFileViewedState {
    Dismissed,
    Unviewed,
    Viewed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestFileViewState {
    pub path: String,
    pub state: GitHubPullRequestFileViewedState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestFileViewStateSnapshot {
    pub pull_request_id: String,
    pub files: Vec<GitHubPullRequestFileViewState>,
}

#[async_trait]
pub(crate) trait GitHubPullRequestFileViewStateClient: Send + Sync {
    async fn pull_request_file_view_states(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError>;

    async fn mark_pull_request_file_viewed(
        &self,
        token: &str,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError>;

    async fn unmark_pull_request_file_viewed(
        &self,
        token: &str,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError>;
}

#[async_trait]
impl GitHubPullRequestFileViewStateClient for OctocrabGitHubClient {
    async fn pull_request_file_view_states(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError> {
        let client = authenticated_client(token)?;
        pull_request_file_view_states_with_client(&client, owner, repository, pull_request_number)
            .await
    }

    async fn mark_pull_request_file_viewed(
        &self,
        token: &str,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError> {
        mutate_pull_request_file_view_state(
            token,
            GitHubPullRequestFileViewMutation::Mark,
            pull_request_id,
            path,
        )
        .await
    }

    async fn unmark_pull_request_file_viewed(
        &self,
        token: &str,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError> {
        mutate_pull_request_file_view_state(
            token,
            GitHubPullRequestFileViewMutation::Unmark,
            pull_request_id,
            path,
        )
        .await
    }
}

impl GitHubService {
    pub async fn pull_request_file_view_states(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_file_view_states(&token, owner, repository, pull_request_number)
            .await
    }

    pub async fn mark_pull_request_file_viewed(
        &self,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .mark_pull_request_file_viewed(&token, pull_request_id, path)
            .await
    }

    pub async fn unmark_pull_request_file_viewed(
        &self,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .unmark_pull_request_file_viewed(&token, pull_request_id, path)
            .await
    }
}

fn pull_request_file_view_state_query_payload(
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    after: Option<&str>,
) -> Result<serde_json::Value, AppError> {
    Ok(serde_json::json!({
        "query": PULL_REQUEST_FILE_VIEW_STATES_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "pullRequestNumber": graphql_pull_request_number(pull_request_number)?,
            "first": PULL_REQUEST_FILE_VIEW_STATE_PAGE_SIZE,
            "after": after,
        }
    }))
}

async fn mutate_pull_request_file_view_state(
    token: &str,
    mutation: GitHubPullRequestFileViewMutation,
    pull_request_id: &str,
    path: &str,
) -> Result<GitHubPullRequestFileViewState, AppError> {
    let client = authenticated_client(token)?;
    mutate_pull_request_file_view_state_with_client(&client, mutation, pull_request_id, path).await
}

async fn pull_request_file_view_states_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError> {
    let mut after = None;
    let mut pages = Vec::new();
    let mut seen_cursors = HashSet::new();

    loop {
        let payload = pull_request_file_view_state_query_payload(
            owner,
            repository,
            pull_request_number,
            after.as_deref(),
        )?;
        let response: PullRequestFileViewStateQuery =
            client.graphql(&payload).await.map_err(github_error)?;
        let page = pull_request_file_view_state_page_from_graphql(response)?;
        let next_cursor = page.next_cursor()?;

        if let Some(cursor) = next_cursor.as_ref() {
            if !seen_cursors.insert(cursor.clone()) {
                return Err(AppError::GitHub(
                    "GitHub repeated a pull request file cursor".to_string(),
                ));
            }
        }
        let has_more = page.has_more;
        pages.push(page);
        if !has_more {
            break;
        }
        after = next_cursor;
    }

    merge_pull_request_file_view_state_pages(pages)
}

async fn mutate_pull_request_file_view_state_with_client(
    client: &octocrab::Octocrab,
    mutation: GitHubPullRequestFileViewMutation,
    pull_request_id: &str,
    path: &str,
) -> Result<GitHubPullRequestFileViewState, AppError> {
    let payload = pull_request_file_view_state_mutation_payload(mutation, pull_request_id, path);
    let response: PullRequestFileViewStateMutation =
        client.graphql(&payload).await.map_err(github_error)?;
    verify_pull_request_file_view_mutation(response, mutation, pull_request_id, path)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GitHubPullRequestFileViewMutation {
    Mark,
    Unmark,
}

impl GitHubPullRequestFileViewMutation {
    fn query(self) -> &'static str {
        match self {
            Self::Mark => MARK_PULL_REQUEST_FILE_VIEWED_MUTATION,
            Self::Unmark => UNMARK_PULL_REQUEST_FILE_VIEWED_MUTATION,
        }
    }

    fn resulting_state(self) -> GitHubPullRequestFileViewedState {
        match self {
            Self::Mark => GitHubPullRequestFileViewedState::Viewed,
            Self::Unmark => GitHubPullRequestFileViewedState::Unviewed,
        }
    }
}

fn pull_request_file_view_state_mutation_payload(
    mutation: GitHubPullRequestFileViewMutation,
    pull_request_id: &str,
    path: &str,
) -> serde_json::Value {
    serde_json::json!({
        "query": mutation.query(),
        "variables": {
            "pullRequestId": pull_request_id,
            "path": path,
        }
    })
}

fn pull_request_file_view_state_page_from_graphql(
    response: PullRequestFileViewStateQuery,
) -> Result<PullRequestFileViewStatePage, AppError> {
    let pull_request = response
        .repository
        .and_then(|repository| repository.pull_request)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the pull request file states".to_string())
        })?;
    let files = pull_request.files.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the pull request file connection".to_string())
    })?;
    let mut entries = Vec::with_capacity(files.nodes.len());
    for node in files.nodes {
        let node = node.ok_or_else(|| {
            AppError::GitHub("GitHub returned an empty pull request file state".to_string())
        })?;
        if node.path.is_empty() || node.path.chars().any(char::is_control) {
            return Err(AppError::GitHub(
                "GitHub returned an invalid pull request file path".to_string(),
            ));
        }
        entries.push(GitHubPullRequestFileViewState {
            path: node.path,
            state: node.viewer_viewed_state,
        });
    }
    let page = PullRequestFileViewStatePage {
        pull_request_id: pull_request.id,
        files: entries,
        end_cursor: files.page_info.end_cursor,
        has_more: files.page_info.has_next_page,
    };
    page.next_cursor()?;
    Ok(page)
}

fn merge_pull_request_file_view_state_pages(
    pages: Vec<PullRequestFileViewStatePage>,
) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError> {
    let first = pages.first().ok_or_else(|| {
        AppError::GitHub("GitHub did not return pull request file states".to_string())
    })?;
    let pull_request_id = first.pull_request_id.clone();
    let mut seen_cursors = HashSet::new();
    let mut seen_paths = HashSet::new();
    let mut files = Vec::new();

    for page in pages {
        if page.pull_request_id != pull_request_id {
            return Err(AppError::GitHub(
                "GitHub changed the pull request while loading file states".to_string(),
            ));
        }
        if let Some(cursor) = page.end_cursor.as_ref() {
            if !seen_cursors.insert(cursor.clone()) {
                return Err(AppError::GitHub(
                    "GitHub repeated a pull request file cursor".to_string(),
                ));
            }
        }
        for file in page.files {
            if !seen_paths.insert(file.path.clone()) {
                return Err(AppError::GitHub(format!(
                    "GitHub returned duplicate state for pull request file {}",
                    file.path
                )));
            }
            files.push(file);
        }
    }

    Ok(GitHubPullRequestFileViewStateSnapshot {
        pull_request_id,
        files,
    })
}

fn verify_pull_request_file_view_mutation(
    response: PullRequestFileViewStateMutation,
    mutation: GitHubPullRequestFileViewMutation,
    expected_pull_request_id: &str,
    path: &str,
) -> Result<GitHubPullRequestFileViewState, AppError> {
    let payload = match mutation {
        GitHubPullRequestFileViewMutation::Mark => response.mark_file_as_viewed,
        GitHubPullRequestFileViewMutation::Unmark => response.unmark_file_as_viewed,
    };
    let returned_id = payload
        .and_then(|payload| payload.pull_request)
        .map(|pull_request| pull_request.id)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the updated pull request".to_string())
        })?;
    if returned_id != expected_pull_request_id {
        return Err(AppError::GitHub(
            "GitHub updated a different pull request file".to_string(),
        ));
    }
    Ok(GitHubPullRequestFileViewState {
        path: path.to_string(),
        state: mutation.resulting_state(),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestFileViewStateQuery {
    repository: Option<GraphQlFileViewStateRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlFileViewStateRepository {
    pull_request: Option<GraphQlFileViewStatePullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlFileViewStatePullRequest {
    id: String,
    files: Option<GraphQlFileViewStateConnection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlFileViewStateConnection {
    nodes: Vec<Option<GraphQlPullRequestFileViewState>>,
    page_info: GraphQlFileViewStatePageInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPullRequestFileViewState {
    path: String,
    viewer_viewed_state: GitHubPullRequestFileViewedState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlFileViewStatePageInfo {
    end_cursor: Option<String>,
    has_next_page: bool,
}

struct PullRequestFileViewStatePage {
    pull_request_id: String,
    files: Vec<GitHubPullRequestFileViewState>,
    end_cursor: Option<String>,
    has_more: bool,
}

impl PullRequestFileViewStatePage {
    fn next_cursor(&self) -> Result<Option<String>, AppError> {
        match (self.has_more, self.end_cursor.as_ref()) {
            (true, Some(cursor)) if !cursor.is_empty() => Ok(Some(cursor.clone())),
            (true, _) => Err(AppError::GitHub(
                "GitHub omitted the next pull request file cursor".to_string(),
            )),
            (false, _) => Ok(None),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestFileViewStateMutation {
    mark_file_as_viewed: Option<GraphQlPullRequestFileViewStateMutationPayload>,
    unmark_file_as_viewed: Option<GraphQlPullRequestFileViewStateMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPullRequestFileViewStateMutationPayload {
    pull_request: Option<GraphQlPullRequestFileViewStateMutationPullRequest>,
}

#[derive(Deserialize)]
struct GraphQlPullRequestFileViewStateMutationPullRequest {
    id: String,
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestFileViewStateClient for super::super::tests::FakeGitHubClient {
    async fn pull_request_file_view_states(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, pull_request_number),
            ("octocat", "hello-world", 12)
        );
        Ok(GitHubPullRequestFileViewStateSnapshot {
            pull_request_id: "PR_kwDOexample".to_string(),
            files: Vec::new(),
        })
    }

    async fn mark_pull_request_file_viewed(
        &self,
        token: &str,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(pull_request_id, "PR_kwDOexample");
        Ok(GitHubPullRequestFileViewState {
            path: path.to_string(),
            state: GitHubPullRequestFileViewedState::Viewed,
        })
    }

    async fn unmark_pull_request_file_viewed(
        &self,
        token: &str,
        pull_request_id: &str,
        path: &str,
    ) -> Result<GitHubPullRequestFileViewState, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(pull_request_id, "PR_kwDOexample");
        Ok(GitHubPullRequestFileViewState {
            path: path.to_string(),
            state: GitHubPullRequestFileViewedState::Unviewed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    async fn mock_graphql(
        responses: Vec<serde_json::Value>,
    ) -> (
        octocrab::Octocrab,
        Arc<Mutex<Vec<String>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
        let address = listener.local_addr().expect("mock address");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&requests);
        let server = tokio::spawn(async move {
            for response in responses {
                let (mut stream, _) = listener.accept().await.expect("mock accept");
                let mut buffer = Vec::new();
                let (body_start, content_length) = loop {
                    let mut chunk = [0_u8; 1024];
                    let read = stream.read(&mut chunk).await.expect("mock read");
                    assert!(read > 0, "request ended before headers");
                    buffer.extend_from_slice(&chunk[..read]);
                    let Some(header_end) = buffer.windows(4).position(|item| item == b"\r\n\r\n")
                    else {
                        continue;
                    };
                    let body_start = header_end + 4;
                    let headers =
                        String::from_utf8(buffer[..header_end].to_vec()).expect("request headers");
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().expect("content length"))
                        })
                        .expect("content-length header");
                    break (body_start, content_length);
                };
                while buffer.len() < body_start + content_length {
                    let mut chunk = [0_u8; 1024];
                    let read = stream.read(&mut chunk).await.expect("mock body read");
                    assert!(read > 0, "request ended before body");
                    buffer.extend_from_slice(&chunk[..read]);
                }
                captured
                    .lock()
                    .expect("request lock")
                    .push(String::from_utf8(buffer).expect("request utf8"));

                let body = serde_json::json!({ "data": response }).to_string();
                let payload = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                stream
                    .write_all(payload.as_bytes())
                    .await
                    .expect("mock write");
            }
        });
        let client = octocrab::Octocrab::builder()
            .base_uri(format!("http://{address}"))
            .expect("mock base uri")
            .personal_token("github-user-access-token".to_string())
            .build()
            .expect("mock client");
        (client, requests, server)
    }

    fn graphql_request_body(request: &str) -> serde_json::Value {
        let (_, body) = request.split_once("\r\n\r\n").expect("request body");
        serde_json::from_str(body).expect("GraphQL request JSON")
    }

    fn query_response(value: serde_json::Value) -> PullRequestFileViewStateQuery {
        serde_json::from_value(value).expect("file view state response")
    }

    #[test]
    fn query_payload_uses_viewer_state_and_cursor_pagination() {
        let payload = pull_request_file_view_state_query_payload(
            "octocat",
            "hello-world",
            12,
            Some("cursor-1"),
        )
        .expect("query payload");

        assert_eq!(payload["variables"]["pullRequestNumber"], 12);
        assert_eq!(payload["variables"]["after"], "cursor-1");
        let query = payload["query"].as_str().expect("query text");
        assert!(query.contains("files(first: $first, after: $after)"));
        assert!(query.contains("viewerViewedState"));
        assert!(query.contains("pageInfo"));
    }

    #[tokio::test]
    async fn query_transport_follows_graphql_file_cursors() {
        let (client, requests, server) = mock_graphql(vec![
            serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "id": "PR_kwDOexample",
                        "files": {
                            "nodes": [{ "path": "src/a.ts", "viewerViewedState": "VIEWED" }],
                            "pageInfo": { "endCursor": "cursor-1", "hasNextPage": true }
                        }
                    }
                }
            }),
            serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "id": "PR_kwDOexample",
                        "files": {
                            "nodes": [{ "path": "src/b.ts", "viewerViewedState": "UNVIEWED" }],
                            "pageInfo": { "endCursor": "cursor-2", "hasNextPage": false }
                        }
                    }
                }
            }),
        ])
        .await;

        let snapshot =
            pull_request_file_view_states_with_client(&client, "octocat", "hello-world", 12)
                .await
                .expect("file view states");
        server.await.expect("mock server");

        assert_eq!(snapshot.files.len(), 2);
        let requests = requests.lock().expect("request lock");
        assert_eq!(requests.len(), 2);
        assert!(requests
            .iter()
            .all(|request| request.starts_with("POST /graphql ")));
        assert_eq!(
            graphql_request_body(&requests[0])["variables"]["after"],
            serde_json::Value::Null
        );
        assert_eq!(
            graphql_request_body(&requests[1])["variables"]["after"],
            "cursor-1"
        );
    }

    #[test]
    fn pages_preserve_all_three_states_and_require_progressing_cursors() {
        assert_eq!(
            serde_json::to_value(GitHubPullRequestFileViewedState::Viewed)
                .expect("serialized viewed state"),
            serde_json::json!("viewed")
        );
        let first =
            pull_request_file_view_state_page_from_graphql(query_response(serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "id": "PR_kwDOexample",
                        "files": {
                            "nodes": [
                                { "path": "src/a.ts", "viewerViewedState": "VIEWED" },
                                { "path": "src/b.ts", "viewerViewedState": "DISMISSED" }
                            ],
                            "pageInfo": { "endCursor": "cursor-1", "hasNextPage": true }
                        }
                    }
                }
            })))
            .expect("first page");
        let second =
            pull_request_file_view_state_page_from_graphql(query_response(serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "id": "PR_kwDOexample",
                        "files": {
                            "nodes": [
                                { "path": "src/c.ts", "viewerViewedState": "UNVIEWED" }
                            ],
                            "pageInfo": { "endCursor": "cursor-2", "hasNextPage": false }
                        }
                    }
                }
            })))
            .expect("second page");

        let snapshot =
            merge_pull_request_file_view_state_pages(vec![first, second]).expect("merged pages");

        assert_eq!(snapshot.pull_request_id, "PR_kwDOexample");
        assert_eq!(
            snapshot.files,
            [
                GitHubPullRequestFileViewState {
                    path: "src/a.ts".to_string(),
                    state: GitHubPullRequestFileViewedState::Viewed,
                },
                GitHubPullRequestFileViewState {
                    path: "src/b.ts".to_string(),
                    state: GitHubPullRequestFileViewedState::Dismissed,
                },
                GitHubPullRequestFileViewState {
                    path: "src/c.ts".to_string(),
                    state: GitHubPullRequestFileViewedState::Unviewed,
                },
            ]
        );
    }

    #[test]
    fn pagination_rejects_missing_or_reused_cursors_and_duplicate_paths() {
        let missing_cursor =
            pull_request_file_view_state_page_from_graphql(query_response(serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "id": "PR_kwDOexample",
                        "files": {
                            "nodes": [],
                            "pageInfo": { "endCursor": null, "hasNextPage": true }
                        }
                    }
                }
            })));
        assert!(matches!(missing_cursor, Err(AppError::GitHub(_))));

        let page = |cursor: &str, path: &str| {
            pull_request_file_view_state_page_from_graphql(query_response(serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "id": "PR_kwDOexample",
                        "files": {
                            "nodes": [{ "path": path, "viewerViewedState": "VIEWED" }],
                            "pageInfo": { "endCursor": cursor, "hasNextPage": true }
                        }
                    }
                }
            })))
            .expect("page")
        };

        assert!(merge_pull_request_file_view_state_pages(vec![
            page("cursor-1", "src/a.ts"),
            page("cursor-1", "src/b.ts"),
        ])
        .is_err());
        assert!(merge_pull_request_file_view_state_pages(vec![
            page("cursor-1", "src/a.ts"),
            page("cursor-2", "src/a.ts"),
        ])
        .is_err());
    }

    #[test]
    fn mutation_payloads_and_responses_verify_the_pull_request_identity() {
        let mark = pull_request_file_view_state_mutation_payload(
            GitHubPullRequestFileViewMutation::Mark,
            "PR_kwDOexample",
            "src/app.ts",
        );
        let unmark = pull_request_file_view_state_mutation_payload(
            GitHubPullRequestFileViewMutation::Unmark,
            "PR_kwDOexample",
            "src/app.ts",
        );

        assert!(mark["query"]
            .as_str()
            .expect("mark query")
            .contains("markFileAsViewed"));
        assert!(unmark["query"]
            .as_str()
            .expect("unmark query")
            .contains("unmarkFileAsViewed"));
        assert_eq!(mark["variables"]["pullRequestId"], "PR_kwDOexample");
        assert_eq!(mark["variables"]["path"], "src/app.ts");

        let updated = verify_pull_request_file_view_mutation(
            serde_json::from_value(serde_json::json!({
                "markFileAsViewed": { "pullRequest": { "id": "PR_kwDOexample" } }
            }))
            .expect("mark response"),
            GitHubPullRequestFileViewMutation::Mark,
            "PR_kwDOexample",
            "src/app.ts",
        )
        .expect("verified mutation");
        assert_eq!(updated.state, GitHubPullRequestFileViewedState::Viewed);

        let mismatch = verify_pull_request_file_view_mutation(
            serde_json::from_value(serde_json::json!({
                "unmarkFileAsViewed": { "pullRequest": { "id": "PR_other" } }
            }))
            .expect("unmark response"),
            GitHubPullRequestFileViewMutation::Unmark,
            "PR_kwDOexample",
            "src/app.ts",
        );
        assert!(matches!(mismatch, Err(AppError::GitHub(_))));
    }
}
