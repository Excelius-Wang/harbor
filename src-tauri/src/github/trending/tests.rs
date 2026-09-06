use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

// Minimal fixture of the public page's outer developer row and nested popular-repository article.
const DEVELOPER: &str = r##"
<article class="Box-row d-flex" id="pa-octocat">
  <a href="#pa-octocat">1</a>
  <a href="/octocat"><img class="rounded avatar-user" src="https://avatars.githubusercontent.com/u/1?s=96&amp;v=4" /></a>
  <div><h1 class="h3 lh-condensed"><a href="/octocat">The &amp; Octocat</a></h1>
    <p><a href="/octocat">octocat</a></p>
  </div>
  <article>
    <div class="f6 color-fg-muted text-uppercase mb-1">Popular repo</div>
    <h1 class="h4 lh-condensed"><a href="/github/hello-world"><svg></svg>hello-world</a></h1>
    <div class="f6 color-fg-muted mt-1">Tools &amp; examples
      for developers.</div>
  </article>
</article>
"##;

const LANGUAGES: &str = r##"
<details id="select-menu-language"><div id="languages-menuitems">
  <a href="/trending/developers?since=weekly">Clear language</a>
  <a href="/trending/developers/python?since=weekly">Python</a>
  <a href="/trending/developers/c%23?since=weekly">C#</a>
  <a href="/trending/developers/c++?since=weekly">C++</a>
  <a href="/trending/developers/python?since=daily">Python</a>
  <a href="/trending/developers/..%2Fevil">Invalid</a>
</div></details>
"##;

#[test]
fn combines_filters_and_encodes_languages_without_allowing_path_or_query_injection() {
    for (language, expected) in [
        ("Python", "python"),
        ("C#", "c%23"),
        ("c++", "c++"),
        ("f*", "f*"),
    ] {
        let filters = GitHubTrendingFilters {
            language: Some(language.to_string()),
            sponsorable: true,
        };
        assert_eq!(
            filters.web_url(GitHubTrendingPeriod::Weekly).unwrap(),
            format!("https://github.com/trending/developers/{expected}?since=weekly&sponsorable=1")
        );
    }
    assert_eq!(
        GitHubTrendingFilters::default()
            .web_url(GitHubTrendingPeriod::Daily)
            .unwrap(),
        "https://github.com/trending/developers?since=daily"
    );
    for invalid in [
        "../python",
        "%2fpython",
        "python?since=monthly",
        "https://evil.example",
        ".",
        "..",
        "python\\rust",
    ] {
        assert!(GitHubTrendingFilters {
            language: Some(invalid.to_string()),
            sponsorable: false
        }
        .web_url(GitHubTrendingPeriod::Daily)
        .is_err());
    }
}

#[test]
fn extracts_language_choices_and_accepts_only_explicit_empty_rankings() {
    let empty = format!("{LANGUAGES}<div class='blankslate'><h2 class='blankslate-heading'>It looks like we don’t have any trending developers for C#.</h2></div>");
    let page = parse_developers(&empty, GitHubTrendingPeriod::Daily).unwrap();
    assert!(page.developers.is_empty());
    assert_eq!(
        page.languages
            .iter()
            .map(|language| (language.slug.as_str(), language.name.as_str()))
            .collect::<Vec<_>>(),
        vec![("python", "Python"), ("c#", "C#"), ("c++", "C++")]
    );
    assert!(parse_developers(LANGUAGES, GitHubTrendingPeriod::Daily).is_err());
    assert!(parse_developers(
        &empty.replace(
            "It looks like we don’t have any trending developers",
            "Verify your browser"
        ),
        GitHubTrendingPeriod::Daily
    )
    .is_err());
    assert!(parse_developers(
        &format!(
            "{empty}{}",
            DEVELOPER.replace("h1 class=\"h3", "h1 class=\"changed")
        ),
        GitHubTrendingPeriod::Daily
    )
    .is_err());
}

#[test]
fn includes_the_current_language_when_github_omits_it_from_the_menu() {
    let html = LANGUAGES.replace("<details id=\"select-menu-language\">",
        "<link rel='canonical' href='https://github.com/trending/developers/rust'><details id=\"select-menu-language\"><summary><span data-menu-button>Rust</span></summary>");
    let languages = parse_languages(&Html::parse_document(&html));
    assert!(languages
        .iter()
        .any(|language| language.slug == "rust" && language.name == "Rust"));
}

#[test]
fn parses_ranked_developers_without_confusing_nested_repository_articles() {
    let html = format!("{DEVELOPER}<article class='Box-row'><h1 class='h3'><a href='/hubot'>Hubot</a></h1></article>");
    let result = parse_developers(&html, GitHubTrendingPeriod::Weekly).unwrap();
    assert_eq!(result.period, GitHubTrendingPeriod::Weekly);
    assert_eq!(result.developers.len(), 2);
    let first = &result.developers[0];
    assert_eq!(first.rank, 1);
    assert_eq!(first.login, "octocat");
    assert_eq!(first.name, "The & Octocat");
    assert_eq!(
        first.avatar_url.as_deref(),
        Some("https://avatars.githubusercontent.com/u/1?s=96&v=4")
    );
    let repo = first.popular_repository.as_ref().unwrap();
    assert_eq!(repo.full_name, "github/hello-world");
    assert_eq!(repo.url, "https://github.com/github/hello-world");
    assert_eq!(
        repo.description.as_deref(),
        Some("Tools & examples for developers.")
    );
    assert_eq!(result.developers[1].rank, 2);
    assert!(result.developers[1].popular_repository.is_none());
    assert!(result.developers[1].avatar_url.is_none());
}

#[test]
fn rejects_changed_layouts_invalid_identities_and_duplicate_rankings() {
    for html in [
        "<html>Sign in or verify your browser</html>".to_string(),
        DEVELOPER.replace("h1 class=\"h3", "h1 class=\"changed"),
        DEVELOPER.replace("href=\"/octocat\"", "href=\"//evil.example\""),
        DEVELOPER.replace(
            "href=\"/github/hello-world\"",
            "href=\"https://evil.example/repo\"",
        ),
        format!("{DEVELOPER}{DEVELOPER}"),
    ] {
        assert!(parse_developers(&html, GitHubTrendingPeriod::Daily).is_err());
    }
}

#[test]
fn discards_untrusted_avatar_urls_and_renders_markup_as_text() {
    let html = DEVELOPER
        .replace(
            "https://avatars.githubusercontent.com/u/1?s=96&amp;v=4",
            "https://avatars.githubusercontent.com.evil.example/image",
        )
        .replace("The &amp; Octocat", "&lt;img src=x onerror=alert(1)&gt;");
    let result = parse_developers(&html, GitHubTrendingPeriod::Daily).unwrap();
    assert!(result.developers[0].avatar_url.is_none());
    assert_eq!(result.developers[0].name, "<img src=x onerror=alert(1)>");
}

#[test]
fn accepts_only_supported_periods_and_serializes_the_ipc_contract() {
    for (value, expected) in [
        ("daily", GitHubTrendingPeriod::Daily),
        ("weekly", GitHubTrendingPeriod::Weekly),
        ("monthly", GitHubTrendingPeriod::Monthly),
    ] {
        let period: GitHubTrendingPeriod =
            serde_json::from_value(serde_json::json!(value)).unwrap();
        assert_eq!(period, expected);
        assert_eq!(
            period.web_url(),
            format!("https://github.com/trending/developers?since={value}")
        );
    }
    assert!(serde_json::from_value::<GitHubTrendingPeriod>(serde_json::json!("yearly")).is_err());
    let payload =
        serde_json::to_value(parse_developers(DEVELOPER, GitHubTrendingPeriod::Weekly).unwrap())
            .unwrap();
    assert_eq!(payload["period"], "weekly");
    assert_eq!(
        payload["developers"][0]["popularRepository"]["fullName"],
        "github/hello-world"
    );
}

async fn mock_page(
    status: &str,
    headers: &str,
    body: &str,
) -> (String, tokio::task::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "http://{}/trending/developers?since=monthly",
        listener.local_addr().unwrap()
    );
    let response = format!("HTTP/1.1 {status}\r\n{headers}\r\nConnection: close\r\n\r\n{body}");
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        let mut buffer = [0; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let count = socket.read(&mut buffer).await.unwrap();
            if count == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..count]);
        }
        let _ = socket.write_all(response.as_bytes()).await;
        String::from_utf8(request).unwrap()
    });
    (url, task)
}

#[tokio::test]
async fn fetches_public_html_without_credentials() {
    let (url, server) = mock_page(
        "200 OK",
        "Content-Type: text/html; charset=utf-8",
        DEVELOPER,
    )
    .await;
    let html = fetch_page(&reqwest::Client::new(), &url).await.unwrap();
    assert_eq!(html, DEVELOPER);
    let request = server.await.unwrap().to_lowercase();
    assert!(request.starts_with("get /trending/developers?since=monthly "));
    assert!(request.contains("accept: text/html"));
    assert!(!request.contains("authorization:") && !request.contains("cookie:"));
}

#[tokio::test]
async fn rejects_http_errors_wrong_content_types_and_oversized_streams() {
    for (status, headers, body) in [
        (
            "429 Too Many Requests",
            "Content-Type: text/html",
            String::new(),
        ),
        (
            "503 Service Unavailable",
            "Content-Type: text/html",
            String::new(),
        ),
        ("200 OK", "Content-Type: application/json", "{}".to_string()),
        (
            "200 OK",
            "Content-Type: text/html\r\nContent-Length: 99999999",
            String::new(),
        ),
        (
            "200 OK",
            "Content-Type: text/html",
            "x".repeat(MAX_PAGE_BYTES + 1),
        ),
    ] {
        let (url, server) = mock_page(status, headers, &body).await;
        let result = fetch_page(&reqwest::Client::new(), &url).await;
        assert!(result.is_err());
        if status.starts_with("429") {
            assert!(matches!(result, Err(AppError::GitHubRateLimited(_))));
        }
        server.await.unwrap();
    }
}

#[tokio::test]
#[ignore = "contacts the public GitHub Trending Developers page"]
async fn live_trending_developers() {
    let result = OctocrabGitHubClient
        .trending_developers(
            GitHubTrendingPeriod::Weekly,
            GitHubTrendingFilters::default(),
        )
        .await
        .unwrap();
    assert!(!result.developers.is_empty());
    assert!(result.developers[0].popular_repository.is_some());
    assert!(result
        .languages
        .iter()
        .any(|language| language.slug == "python"));
}

#[tokio::test]
#[ignore = "contacts filtered public GitHub Trending Developers pages"]
async fn live_trending_developer_filters() {
    let python = OctocrabGitHubClient
        .trending_developers(
            GitHubTrendingPeriod::Weekly,
            GitHubTrendingFilters {
                language: Some("python".to_string()),
                sponsorable: true,
            },
        )
        .await
        .unwrap();
    assert!(!python.developers.is_empty());
    assert!(python
        .languages
        .iter()
        .any(|language| language.slug == "python" && language.name == "Python"));
    assert!(python
        .languages
        .iter()
        .any(|language| language.slug == "c#"));
    let abap = OctocrabGitHubClient
        .trending_developers(
            GitHubTrendingPeriod::Daily,
            GitHubTrendingFilters {
                language: Some("abap".to_string()),
                sponsorable: true,
            },
        )
        .await
        .unwrap();
    assert!(!abap.languages.is_empty());
}
