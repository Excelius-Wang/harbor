use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use async_trait::async_trait;
use oauth2::{
    basic::BasicClient, reqwest, AuthType, AuthUrl, AuthorizationCode, ClientId, ClientSecret,
    CsrfToken, EndpointNotSet, EndpointSet, PkceCodeChallenge, PkceCodeVerifier, RedirectUrl,
    RefreshToken, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const GITHUB_OAUTH_CALLBACK_URL: &str = "harbor://oauth/github/callback";
pub const GITHUB_AUTH_EVENT: &str = "github-auth";
const GITHUB_AUTHORIZE_URL: &str = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const GITHUB_LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);

type ConfiguredGitHubOAuthClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

#[derive(Clone)]
pub struct GitHubOAuthConfig {
    pub client_id: String,
    pub client_secret: String,
}

impl GitHubOAuthConfig {
    pub fn from_build_environment() -> Option<Self> {
        let client_id = option_env!("HARBOR_GITHUB_CLIENT_ID")?.trim();
        let client_secret = option_env!("HARBOR_GITHUB_CLIENT_SECRET")?.trim();
        if client_id.is_empty() || client_secret.is_empty() {
            return None;
        }
        Some(Self {
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
        })
    }
}

pub fn is_github_oauth_callback(value: &str) -> bool {
    oauth2::url::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "harbor"
            && url.host_str() == Some("oauth")
            && url.path() == "/github/callback"
    })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubLoginAttempt {
    pub authorization_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubOAuthCredentials {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<u64>,
}

struct PendingLogin {
    csrf_token: CsrfToken,
    pkce_verifier: PkceCodeVerifier,
    started_at: Instant,
}

#[async_trait]
pub(crate) trait GitHubTokenExchange: Send + Sync {
    async fn exchange_code(
        &self,
        code: String,
        pkce_verifier: PkceCodeVerifier,
    ) -> Result<GitHubOAuthCredentials, AppError>;

    async fn refresh_token(
        &self,
        refresh_token: String,
    ) -> Result<GitHubOAuthCredentials, AppError>;
}

struct GitHubOAuthTokenExchange {
    client: ConfiguredGitHubOAuthClient,
    http_client: reqwest::Client,
}

impl GitHubOAuthTokenExchange {
    fn new(client: ConfiguredGitHubOAuthClient) -> Result<Self, AppError> {
        let http_client = reqwest::ClientBuilder::new()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| AppError::GitHubAuthentication(error.to_string()))?;
        Ok(Self {
            client,
            http_client,
        })
    }
}

#[async_trait]
impl GitHubTokenExchange for GitHubOAuthTokenExchange {
    async fn exchange_code(
        &self,
        code: String,
        pkce_verifier: PkceCodeVerifier,
    ) -> Result<GitHubOAuthCredentials, AppError> {
        let response = self
            .client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(pkce_verifier)
            .request_async(&self.http_client)
            .await
            .map_err(|_| {
                AppError::GitHubAuthentication(
                    "GitHub did not accept the authorization response".to_string(),
                )
            })?;
        Ok(credentials_from_token_response(&response))
    }

    async fn refresh_token(
        &self,
        refresh_token: String,
    ) -> Result<GitHubOAuthCredentials, AppError> {
        let response = self
            .client
            .exchange_refresh_token(&RefreshToken::new(refresh_token))
            .request_async(&self.http_client)
            .await
            .map_err(|_| {
                AppError::GitHubAuthentication("GitHub login could not be refreshed".to_string())
            })?;
        Ok(credentials_from_token_response(&response))
    }
}

pub struct GitHubOAuthSession {
    client: ConfiguredGitHubOAuthClient,
    pending: Mutex<Option<PendingLogin>>,
    token_exchange: Arc<dyn GitHubTokenExchange>,
    login_timeout: Duration,
}

impl GitHubOAuthSession {
    pub fn new(config: GitHubOAuthConfig) -> Result<Self, AppError> {
        let client = github_oauth_client(&config)?;
        let token_exchange = Arc::new(GitHubOAuthTokenExchange::new(client.clone())?);
        Ok(Self {
            client,
            pending: Mutex::new(None),
            token_exchange,
            login_timeout: GITHUB_LOGIN_TIMEOUT,
        })
    }

    #[cfg(test)]
    pub(crate) fn with_token_exchange(
        config: GitHubOAuthConfig,
        token_exchange: Arc<dyn GitHubTokenExchange>,
    ) -> Result<Self, AppError> {
        let mut session = Self::new(config)?;
        session.token_exchange = token_exchange;
        Ok(session)
    }

    pub fn begin_login(&self) -> Result<GitHubLoginAttempt, AppError> {
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
        let (authorization_url, csrf_token) = self
            .client
            .authorize_url(CsrfToken::new_random)
            .set_pkce_challenge(pkce_challenge)
            .url();

        *self.pending.lock().map_err(|_| {
            AppError::GitHubAuthentication("OAuth login state is unavailable".to_string())
        })? = Some(PendingLogin {
            csrf_token,
            pkce_verifier,
            started_at: Instant::now(),
        });

        Ok(GitHubLoginAttempt {
            authorization_url: authorization_url.to_string(),
        })
    }

    pub async fn complete_login(
        &self,
        callback_url: &str,
    ) -> Result<GitHubOAuthCredentials, AppError> {
        let callback = oauth2::url::Url::parse(callback_url).map_err(|_| {
            AppError::GitHubAuthentication("GitHub returned an invalid login callback".to_string())
        })?;
        if callback.scheme() != "harbor"
            || callback.host_str() != Some("oauth")
            || callback.path() != "/github/callback"
        {
            return Err(AppError::GitHubAuthentication(
                "GitHub returned an unexpected login callback".to_string(),
            ));
        }
        let query = callback
            .query_pairs()
            .into_owned()
            .collect::<std::collections::HashMap<_, _>>();
        let returned_state = query.get("state").cloned().ok_or_else(|| {
            AppError::GitHubAuthentication("GitHub login state is missing".to_string())
        })?;
        let (code, pkce_verifier) = {
            let mut pending = self.pending.lock().map_err(|_| {
                AppError::GitHubAuthentication("OAuth login state is unavailable".to_string())
            })?;
            let expected = pending.as_ref().ok_or_else(|| {
                AppError::GitHubAuthentication("No GitHub login is pending".to_string())
            })?;
            if expected.csrf_token != CsrfToken::new(returned_state) {
                return Err(AppError::GitHubAuthentication(
                    "GitHub login state did not match".to_string(),
                ));
            }
            if expected.started_at.elapsed() >= self.login_timeout {
                pending.take();
                return Err(AppError::GitHubAuthentication(
                    "GitHub login expired; try again".to_string(),
                ));
            }
            if query.contains_key("error") {
                pending.take();
                return Err(AppError::GitHubAuthentication(
                    "GitHub authorization was cancelled".to_string(),
                ));
            }
            let code = query.get("code").cloned().ok_or_else(|| {
                AppError::GitHubAuthentication("GitHub authorization code is missing".to_string())
            })?;
            let pending_login = pending.take().ok_or_else(|| {
                AppError::GitHubAuthentication("No GitHub login is pending".to_string())
            })?;
            (code, pending_login.pkce_verifier)
        };

        self.token_exchange.exchange_code(code, pkce_verifier).await
    }

    pub async fn refresh_if_needed(
        &self,
        credentials: GitHubOAuthCredentials,
    ) -> Result<GitHubOAuthCredentials, AppError> {
        let now = unix_timestamp();
        let needs_refresh = credentials
            .expires_at
            .is_some_and(|expires_at| expires_at <= now.saturating_add(60));
        if !needs_refresh {
            return Ok(credentials);
        }

        let refresh_token = credentials.refresh_token.clone().ok_or_else(|| {
            AppError::GitHubAuthentication("GitHub login expired; sign in again".to_string())
        })?;
        let mut refreshed = self.token_exchange.refresh_token(refresh_token).await?;
        if refreshed.refresh_token.is_none() {
            refreshed.refresh_token = credentials.refresh_token;
        }
        Ok(refreshed)
    }
}

fn github_oauth_client(
    config: &GitHubOAuthConfig,
) -> Result<ConfiguredGitHubOAuthClient, AppError> {
    if config.client_id.trim().is_empty() || config.client_secret.trim().is_empty() {
        return Err(AppError::Validation(
            "GitHub OAuth configuration is incomplete".to_string(),
        ));
    }
    Ok(BasicClient::new(ClientId::new(config.client_id.clone()))
        .set_client_secret(ClientSecret::new(config.client_secret.clone()))
        .set_auth_uri(
            AuthUrl::new(GITHUB_AUTHORIZE_URL.to_string())
                .map_err(|error| AppError::GitHubAuthentication(error.to_string()))?,
        )
        .set_token_uri(
            TokenUrl::new(GITHUB_TOKEN_URL.to_string())
                .map_err(|error| AppError::GitHubAuthentication(error.to_string()))?,
        )
        .set_redirect_uri(
            RedirectUrl::new(GITHUB_OAUTH_CALLBACK_URL.to_string())
                .map_err(|error| AppError::GitHubAuthentication(error.to_string()))?,
        )
        .set_auth_type(AuthType::RequestBody))
}

fn credentials_from_token_response(
    response: &oauth2::basic::BasicTokenResponse,
) -> GitHubOAuthCredentials {
    let now = std::time::Duration::from_secs(unix_timestamp());
    GitHubOAuthCredentials {
        access_token: response.access_token().secret().clone(),
        refresh_token: response.refresh_token().map(|token| token.secret().clone()),
        expires_at: response
            .expires_in()
            .and_then(|duration| now.checked_add(duration))
            .map(|expires_at| expires_at.as_secs()),
    }
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use oauth2::url::Url;

    use super::*;

    fn test_config() -> GitHubOAuthConfig {
        GitHubOAuthConfig {
            client_id: "harbor-client-id".to_string(),
            client_secret: "harbor-client-secret".to_string(),
        }
    }

    struct SuccessfulTokenExchange;

    #[async_trait]
    impl GitHubTokenExchange for SuccessfulTokenExchange {
        async fn exchange_code(
            &self,
            _code: String,
            _pkce_verifier: PkceCodeVerifier,
        ) -> Result<GitHubOAuthCredentials, AppError> {
            Ok(GitHubOAuthCredentials {
                access_token: "github-user-access-token".to_string(),
                refresh_token: Some("github-refresh-token".to_string()),
                expires_at: Some(1_809_000_000),
            })
        }

        async fn refresh_token(
            &self,
            _refresh_token: String,
        ) -> Result<GitHubOAuthCredentials, AppError> {
            Ok(GitHubOAuthCredentials {
                access_token: "refreshed-user-access-token".to_string(),
                refresh_token: Some("rotated-refresh-token".to_string()),
                expires_at: Some(1_900_000_000),
            })
        }
    }

    #[test]
    fn begin_login_builds_a_pkce_protected_github_authorization_url() {
        let session = GitHubOAuthSession::new(test_config()).expect("OAuth session");

        let attempt = session.begin_login().expect("login attempt");
        let url = Url::parse(&attempt.authorization_url).expect("authorization URL");
        let query = url.query_pairs().into_owned().collect::<HashMap<_, _>>();

        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("github.com"));
        assert_eq!(url.path(), "/login/oauth/authorize");
        assert_eq!(
            query.get("client_id").map(String::as_str),
            Some("harbor-client-id")
        );
        assert_eq!(
            query.get("redirect_uri").map(String::as_str),
            Some(GITHUB_OAUTH_CALLBACK_URL)
        );
        assert_eq!(query.get("response_type").map(String::as_str), Some("code"));
        assert_eq!(
            query.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert!(query
            .get("code_challenge")
            .is_some_and(|value| value.len() >= 43));
        assert!(query.get("state").is_some_and(|value| value.len() >= 22));
    }

    #[tokio::test]
    async fn callback_with_the_wrong_state_is_rejected() {
        let session = GitHubOAuthSession::new(test_config()).expect("OAuth session");
        session.begin_login().expect("login attempt");

        let result = session
            .complete_login(
                "harbor://oauth/github/callback?code=temporary-code&state=attacker-state",
            )
            .await;

        assert!(matches!(result, Err(AppError::GitHubAuthentication(_))));
    }

    #[tokio::test]
    async fn valid_callback_returns_github_oauth_credentials() {
        let session = GitHubOAuthSession::with_token_exchange(
            test_config(),
            Arc::new(SuccessfulTokenExchange),
        )
        .expect("OAuth session");
        let attempt = session.begin_login().expect("login attempt");
        let authorization_url = Url::parse(&attempt.authorization_url).expect("authorization URL");
        let state = authorization_url
            .query_pairs()
            .find_map(|(key, value)| (key == "state").then(|| value.into_owned()))
            .expect("state");

        let callback = format!("harbor://oauth/github/callback?code=temporary-code&state={state}");
        let credentials = session
            .complete_login(&callback)
            .await
            .expect("OAuth credentials");

        assert_eq!(
            credentials,
            GitHubOAuthCredentials {
                access_token: "github-user-access-token".to_string(),
                refresh_token: Some("github-refresh-token".to_string()),
                expires_at: Some(1_809_000_000),
            }
        );

        let replay = session.complete_login(&callback).await;
        assert!(matches!(replay, Err(AppError::GitHubAuthentication(_))));
    }

    #[tokio::test]
    async fn expired_credentials_are_refreshed_without_user_interaction() {
        let session = GitHubOAuthSession::with_token_exchange(
            test_config(),
            Arc::new(SuccessfulTokenExchange),
        )
        .expect("OAuth session");

        let refreshed = session
            .refresh_if_needed(GitHubOAuthCredentials {
                access_token: "expired-user-access-token".to_string(),
                refresh_token: Some("github-refresh-token".to_string()),
                expires_at: Some(1),
            })
            .await
            .expect("refreshed credentials");

        assert_eq!(refreshed.access_token, "refreshed-user-access-token");
        assert_eq!(
            refreshed.refresh_token.as_deref(),
            Some("rotated-refresh-token")
        );
    }

    #[tokio::test]
    async fn expired_login_callback_is_rejected() {
        let mut session = GitHubOAuthSession::with_token_exchange(
            test_config(),
            Arc::new(SuccessfulTokenExchange),
        )
        .expect("OAuth session");
        session.login_timeout = Duration::ZERO;
        let attempt = session.begin_login().expect("login attempt");
        let authorization_url = Url::parse(&attempt.authorization_url).expect("authorization URL");
        let state = authorization_url
            .query_pairs()
            .find_map(|(key, value)| (key == "state").then(|| value.into_owned()))
            .expect("state");

        let result = session
            .complete_login(&format!(
                "harbor://oauth/github/callback?code=temporary-code&state={state}"
            ))
            .await;

        assert!(matches!(result, Err(AppError::GitHubAuthentication(_))));
    }
}
