use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient};

const SECURITY_ALERT_PAGE_SIZE: u8 = 30;
const SECURITY_EVIDENCE_PAGE_SIZE: u8 = 100;
const SECURITY_COMMENT_LIMIT: usize = 1_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubSecurityAlertKind {
    Dependabot,
    CodeScanning,
    SecretScanning,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubSecurityAlertStateFilter {
    Open,
    Closed,
    All,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubSecurityAlertSeverityFilter {
    All,
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubSecurityAlertSort {
    Created,
    Updated,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubSecurityAlertMutationState {
    Open,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubDependabotDismissReason {
    FixStarted,
    Inaccurate,
    NoBandwidth,
    NotUsed,
    TolerableRisk,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubCodeScanningDismissReason {
    FalsePositive,
    WontFix,
    UsedInTests,
    Mitigated,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubSecretScanningResolution {
    FalsePositive,
    WontFix,
    Revoked,
    UsedInTests,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubSecurityAlertFilters {
    pub state: GitHubSecurityAlertStateFilter,
    pub severity: GitHubSecurityAlertSeverityFilter,
    pub sort: GitHubSecurityAlertSort,
    pub page: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSecurityActor {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubSecurityAlertSummary {
    Dependabot {
        number: u64,
        state: String,
        severity: String,
        title: String,
        package_name: String,
        ecosystem: String,
        manifest_path: String,
        scope: Option<String>,
        relationship: Option<String>,
        url: String,
        created_at: String,
        updated_at: String,
        assignees: Vec<GitHubSecurityActor>,
    },
    CodeScanning {
        number: u64,
        state: String,
        severity: String,
        title: String,
        rule_id: Option<String>,
        tool_name: String,
        path: Option<String>,
        start_line: Option<u64>,
        message: Option<String>,
        reference: Option<String>,
        url: String,
        created_at: String,
        updated_at: Option<String>,
        assignees: Vec<GitHubSecurityActor>,
    },
    SecretScanning {
        number: u64,
        state: String,
        title: String,
        secret_type: String,
        validity: String,
        publicly_leaked: bool,
        multi_repo: bool,
        url: String,
        created_at: String,
        updated_at: Option<String>,
        assignee: Option<GitHubSecurityActor>,
    },
}

impl GitHubSecurityAlertSummary {
    pub fn number(&self) -> u64 {
        match self {
            Self::Dependabot { number, .. }
            | Self::CodeScanning { number, .. }
            | Self::SecretScanning { number, .. } => *number,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSecurityAlertPage {
    pub alerts: Vec<GitHubSecurityAlertSummary>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[allow(
    clippy::large_enum_variant,
    reason = "detail variants serialize directly to stable IPC payloads and are not stored in collections"
)]
pub enum GitHubSecurityAlertDetail {
    Dependabot {
        alert: GitHubSecurityAlertSummary,
        description: String,
        ghsa_id: String,
        cve_id: Option<String>,
        vulnerable_version_range: String,
        first_patched_version: Option<String>,
        cvss_score: Option<f64>,
        cvss_vector: Option<String>,
        epss_percentage: Option<f64>,
        epss_percentile: Option<f64>,
        cwes: Vec<GitHubSecurityCwe>,
        references: Vec<String>,
        published_at: String,
        withdrawn_at: Option<String>,
        dismissed_at: Option<String>,
        dismissed_by: Option<GitHubSecurityActor>,
        dismissed_reason: Option<String>,
        dismissed_comment: Option<String>,
        fixed_at: Option<String>,
        auto_dismissed_at: Option<String>,
    },
    CodeScanning {
        alert: GitHubSecurityAlertSummary,
        description: String,
        help: Option<String>,
        help_url: Option<String>,
        tags: Vec<String>,
        fixed_at: Option<String>,
        dismissed_at: Option<String>,
        dismissed_by: Option<GitHubSecurityActor>,
        dismissed_reason: Option<String>,
        dismissed_comment: Option<String>,
    },
    SecretScanning {
        alert: GitHubSecurityAlertSummary,
        resolution: Option<String>,
        resolution_comment: Option<String>,
        resolved_at: Option<String>,
        resolved_by: Option<GitHubSecurityActor>,
        push_protection_bypassed: bool,
        push_protection_bypassed_at: Option<String>,
        push_protection_bypassed_by: Option<GitHubSecurityActor>,
        metadata: Vec<GitHubSecurityMetadata>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSecurityCwe {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSecurityMetadata {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeScanningInstance {
    pub state: Option<String>,
    pub reference: String,
    pub commit_sha: String,
    pub message: String,
    pub path: String,
    pub start_line: u64,
    pub end_line: u64,
    pub classifications: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeScanningInstancePage {
    pub instances: Vec<GitHubCodeScanningInstance>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSecretScanningLocation {
    pub kind: String,
    pub path: Option<String>,
    pub start_line: Option<u64>,
    pub end_line: Option<u64>,
    pub commit_sha: Option<String>,
    pub url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSecretScanningLocationPage {
    pub locations: Vec<GitHubSecretScanningLocation>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubSecurityAlertMutation {
    Dependabot {
        state: GitHubSecurityAlertMutationState,
        reason: Option<GitHubDependabotDismissReason>,
        comment: String,
    },
    CodeScanning {
        state: GitHubSecurityAlertMutationState,
        reason: Option<GitHubCodeScanningDismissReason>,
        comment: String,
    },
    SecretScanning {
        state: GitHubSecurityAlertMutationState,
        reason: Option<GitHubSecretScanningResolution>,
        comment: String,
    },
}

#[async_trait]
pub(crate) trait GitHubSecurityClient: Send + Sync {
    async fn list_security_alerts(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        kind: GitHubSecurityAlertKind,
        filters: &GitHubSecurityAlertFilters,
    ) -> Result<GitHubSecurityAlertPage, AppError>;

    async fn security_alert(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        kind: GitHubSecurityAlertKind,
        alert_number: u64,
    ) -> Result<GitHubSecurityAlertDetail, AppError>;

    async fn code_scanning_instances(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        alert_number: u64,
        page: u32,
    ) -> Result<GitHubCodeScanningInstancePage, AppError>;

    async fn secret_scanning_locations(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        alert_number: u64,
        page: u32,
    ) -> Result<GitHubSecretScanningLocationPage, AppError>;

    async fn update_security_alert(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        alert_number: u64,
        mutation: &GitHubSecurityAlertMutation,
    ) -> Result<GitHubSecurityAlertDetail, AppError>;
}

#[async_trait]
impl GitHubSecurityClient for OctocrabGitHubClient {
    async fn list_security_alerts(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        kind: GitHubSecurityAlertKind,
        filters: &GitHubSecurityAlertFilters,
    ) -> Result<GitHubSecurityAlertPage, AppError> {
        let client = authenticated_client(token)?;
        match kind {
            GitHubSecurityAlertKind::Dependabot => {
                let parameters = DependabotListParameters::from_filters(filters);
                let response: octocrab::Page<RawDependabotAlert> = client
                    .get(
                        dependabot_alerts_route(owner, repository),
                        Some(&parameters),
                    )
                    .await
                    .map_err(security_error)?;
                let has_more = response.next.is_some();
                Ok(security_alert_page(
                    response
                        .items
                        .into_iter()
                        .map(dependabot_summary)
                        .collect::<Result<Vec<_>, _>>()?,
                    filters.page,
                    has_more,
                ))
            }
            GitHubSecurityAlertKind::CodeScanning => {
                let parameters = CodeScanningListParameters::from_filters(filters);
                let response: octocrab::Page<RawCodeScanningAlert> = client
                    .get(
                        code_scanning_alerts_route(owner, repository),
                        Some(&parameters),
                    )
                    .await
                    .map_err(security_error)?;
                let has_more = response.next.is_some();
                Ok(security_alert_page(
                    response
                        .items
                        .into_iter()
                        .map(code_scanning_summary)
                        .collect::<Result<Vec<_>, _>>()?,
                    filters.page,
                    has_more,
                ))
            }
            GitHubSecurityAlertKind::SecretScanning => {
                let parameters = SecretScanningListParameters::from_filters(filters);
                let response: octocrab::Page<RawSecretScanningAlert> = client
                    .get(
                        secret_scanning_alerts_route(owner, repository),
                        Some(&parameters),
                    )
                    .await
                    .map_err(security_error)?;
                let has_more = response.next.is_some();
                Ok(security_alert_page(
                    response
                        .items
                        .into_iter()
                        .map(secret_scanning_summary)
                        .collect::<Result<Vec<_>, _>>()?,
                    filters.page,
                    has_more,
                ))
            }
        }
    }

    async fn security_alert(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        kind: GitHubSecurityAlertKind,
        alert_number: u64,
    ) -> Result<GitHubSecurityAlertDetail, AppError> {
        let client = authenticated_client(token)?;
        match kind {
            GitHubSecurityAlertKind::Dependabot => {
                let alert: RawDependabotAlert = client
                    .get(
                        dependabot_alert_route(owner, repository, alert_number),
                        None::<&()>,
                    )
                    .await
                    .map_err(security_error)?;
                dependabot_detail(alert)
            }
            GitHubSecurityAlertKind::CodeScanning => {
                let alert: RawCodeScanningAlert = client
                    .get(
                        code_scanning_alert_route(owner, repository, alert_number),
                        None::<&()>,
                    )
                    .await
                    .map_err(security_error)?;
                code_scanning_detail(alert)
            }
            GitHubSecurityAlertKind::SecretScanning => {
                let alert: RawSecretScanningAlert = client
                    .get(
                        secret_scanning_alert_route(owner, repository, alert_number),
                        Some(&SecretDetailParameters { hide_secret: true }),
                    )
                    .await
                    .map_err(security_error)?;
                secret_scanning_detail(alert)
            }
        }
    }

    async fn code_scanning_instances(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        alert_number: u64,
        page: u32,
    ) -> Result<GitHubCodeScanningInstancePage, AppError> {
        let client = authenticated_client(token)?;
        let response: octocrab::Page<RawCodeScanningInstance> = client
            .get(
                code_scanning_instances_route(owner, repository, alert_number),
                Some(&PageParameters {
                    per_page: SECURITY_EVIDENCE_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(security_error)?;
        let has_more = response.next.is_some();
        Ok(GitHubCodeScanningInstancePage {
            instances: response
                .items
                .into_iter()
                .map(code_scanning_instance)
                .collect(),
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn secret_scanning_locations(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        alert_number: u64,
        page: u32,
    ) -> Result<GitHubSecretScanningLocationPage, AppError> {
        let client = authenticated_client(token)?;
        let response: octocrab::Page<RawSecretScanningLocation> = client
            .get(
                secret_scanning_locations_route(owner, repository, alert_number),
                Some(&PageParameters {
                    per_page: SECURITY_EVIDENCE_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(security_error)?;
        let has_more = response.next.is_some();
        Ok(GitHubSecretScanningLocationPage {
            locations: response
                .items
                .into_iter()
                .map(secret_scanning_location)
                .collect(),
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn update_security_alert(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        alert_number: u64,
        mutation: &GitHubSecurityAlertMutation,
    ) -> Result<GitHubSecurityAlertDetail, AppError> {
        validate_security_mutation(mutation)?;
        let client = authenticated_client(token)?;
        let detail = match mutation {
            GitHubSecurityAlertMutation::Dependabot {
                state,
                reason,
                comment,
            } => {
                let body = DependabotMutationBody {
                    state: mutation_state_name(*state, "dismissed"),
                    dismissed_reason: reason.map(dependabot_reason_name),
                    dismissed_comment: non_empty_comment(comment),
                };
                let alert: RawDependabotAlert = client
                    .patch(
                        dependabot_alert_route(owner, repository, alert_number),
                        Some(&body),
                    )
                    .await
                    .map_err(security_error)?;
                dependabot_detail(alert)?
            }
            GitHubSecurityAlertMutation::CodeScanning {
                state,
                reason,
                comment,
            } => {
                let body = CodeScanningMutationBody {
                    state: mutation_state_name(*state, "dismissed"),
                    dismissed_reason: reason.map(code_scanning_reason_name),
                    dismissed_comment: non_empty_comment(comment),
                };
                let alert: RawCodeScanningAlert = client
                    .patch(
                        code_scanning_alert_route(owner, repository, alert_number),
                        Some(&body),
                    )
                    .await
                    .map_err(security_error)?;
                code_scanning_detail(alert)?
            }
            GitHubSecurityAlertMutation::SecretScanning {
                state,
                reason,
                comment,
            } => {
                let body = SecretScanningMutationBody {
                    state: mutation_state_name(*state, "resolved"),
                    resolution: reason.map(secret_scanning_resolution_name),
                    resolution_comment: non_empty_comment(comment),
                };
                let alert: RawSecretScanningAlert = client
                    .patch(
                        secret_scanning_alert_route(owner, repository, alert_number),
                        Some(&body),
                    )
                    .await
                    .map_err(security_error)?;
                secret_scanning_detail(alert)?
            }
        };
        if detail_alert_number(&detail) != alert_number {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected security alert".to_string(),
            ));
        }
        Ok(detail)
    }
}

impl GitHubService {
    pub async fn security_alerts(
        &self,
        owner: &str,
        repository: &str,
        kind: GitHubSecurityAlertKind,
        filters: &GitHubSecurityAlertFilters,
    ) -> Result<GitHubSecurityAlertPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_security_alerts(&token, owner, repository, kind, filters)
            .await
    }

    pub async fn security_alert(
        &self,
        owner: &str,
        repository: &str,
        kind: GitHubSecurityAlertKind,
        alert_number: u64,
    ) -> Result<GitHubSecurityAlertDetail, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .security_alert(&token, owner, repository, kind, alert_number)
            .await
    }

    pub async fn code_scanning_instances(
        &self,
        owner: &str,
        repository: &str,
        alert_number: u64,
        page: u32,
    ) -> Result<GitHubCodeScanningInstancePage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .code_scanning_instances(&token, owner, repository, alert_number, page)
            .await
    }

    pub async fn secret_scanning_locations(
        &self,
        owner: &str,
        repository: &str,
        alert_number: u64,
        page: u32,
    ) -> Result<GitHubSecretScanningLocationPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .secret_scanning_locations(&token, owner, repository, alert_number, page)
            .await
    }

    pub async fn update_security_alert(
        &self,
        owner: &str,
        repository: &str,
        alert_number: u64,
        mutation: &GitHubSecurityAlertMutation,
    ) -> Result<GitHubSecurityAlertDetail, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_security_alert(&token, owner, repository, alert_number, mutation)
            .await
    }
}

#[derive(Serialize)]
struct DependabotListParameters {
    per_page: u8,
    page: u32,
    direction: &'static str,
    sort: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<Vec<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    severity: Option<Vec<&'static str>>,
}

impl DependabotListParameters {
    fn from_filters(filters: &GitHubSecurityAlertFilters) -> Self {
        Self {
            per_page: SECURITY_ALERT_PAGE_SIZE,
            page: filters.page,
            direction: "desc",
            sort: security_sort_name(filters.sort),
            state: match filters.state {
                GitHubSecurityAlertStateFilter::Open => Some(vec!["open"]),
                GitHubSecurityAlertStateFilter::Closed => {
                    Some(vec!["dismissed", "fixed", "auto_dismissed"])
                }
                GitHubSecurityAlertStateFilter::All => None,
            },
            severity: severity_filter_name(filters.severity).map(|severity| vec![severity]),
        }
    }
}

#[derive(Serialize)]
struct CodeScanningListParameters {
    per_page: u8,
    page: u32,
    direction: &'static str,
    sort: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    severity: Option<&'static str>,
}

impl CodeScanningListParameters {
    fn from_filters(filters: &GitHubSecurityAlertFilters) -> Self {
        Self {
            per_page: SECURITY_ALERT_PAGE_SIZE,
            page: filters.page,
            direction: "desc",
            sort: security_sort_name(filters.sort),
            state: match filters.state {
                GitHubSecurityAlertStateFilter::Open => Some("open"),
                GitHubSecurityAlertStateFilter::Closed => Some("closed"),
                GitHubSecurityAlertStateFilter::All => None,
            },
            severity: severity_filter_name(filters.severity),
        }
    }
}

#[derive(Serialize)]
struct SecretScanningListParameters {
    per_page: u8,
    page: u32,
    direction: &'static str,
    sort: &'static str,
    hide_secret: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    state: Option<&'static str>,
}

impl SecretScanningListParameters {
    fn from_filters(filters: &GitHubSecurityAlertFilters) -> Self {
        Self {
            per_page: SECURITY_ALERT_PAGE_SIZE,
            page: filters.page,
            direction: "desc",
            sort: security_sort_name(filters.sort),
            hide_secret: true,
            state: match filters.state {
                GitHubSecurityAlertStateFilter::Open => Some("open"),
                GitHubSecurityAlertStateFilter::Closed => Some("resolved"),
                GitHubSecurityAlertStateFilter::All => None,
            },
        }
    }
}

#[derive(Serialize)]
struct SecretDetailParameters {
    hide_secret: bool,
}

#[derive(Serialize)]
struct PageParameters {
    per_page: u8,
    page: u32,
}

#[derive(Serialize)]
struct DependabotMutationBody<'a> {
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    dismissed_reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dismissed_comment: Option<&'a str>,
}

#[derive(Serialize)]
struct CodeScanningMutationBody<'a> {
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    dismissed_reason: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dismissed_comment: Option<&'a str>,
}

#[derive(Serialize)]
struct SecretScanningMutationBody<'a> {
    state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolution: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolution_comment: Option<&'a str>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawActor {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawDependabotAlert {
    number: i64,
    state: String,
    dependency: RawDependency,
    security_advisory: RawSecurityAdvisory,
    security_vulnerability: RawSecurityVulnerability,
    html_url: String,
    created_at: String,
    updated_at: String,
    dismissed_at: Option<String>,
    dismissed_by: Option<RawActor>,
    dismissed_reason: Option<String>,
    dismissed_comment: Option<String>,
    fixed_at: Option<String>,
    auto_dismissed_at: Option<String>,
    #[serde(default)]
    assignees: Vec<RawActor>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawDependency {
    package: RawPackage,
    manifest_path: String,
    scope: Option<String>,
    relationship: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawPackage {
    ecosystem: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawSecurityAdvisory {
    ghsa_id: String,
    cve_id: Option<String>,
    summary: String,
    description: String,
    severity: String,
    cvss: Option<RawCvss>,
    cvss_severities: Option<RawCvssSeverities>,
    epss: Option<RawEpss>,
    #[serde(default)]
    cwes: Vec<RawCwe>,
    #[serde(default)]
    references: Vec<RawReference>,
    published_at: String,
    withdrawn_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawSecurityVulnerability {
    vulnerable_version_range: String,
    first_patched_version: Option<RawPatchedVersion>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawPatchedVersion {
    identifier: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCvss {
    score: f64,
    vector_string: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCvssSeverities {
    cvss_v3: Option<RawCvss>,
    cvss_v4: Option<RawCvss>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawEpss {
    percentage: Option<Value>,
    percentile: Option<Value>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCwe {
    cwe_id: String,
    name: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawReference {
    url: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCodeScanningAlert {
    number: u64,
    state: String,
    created_at: String,
    updated_at: Option<String>,
    html_url: String,
    fixed_at: Option<String>,
    dismissed_at: Option<String>,
    dismissed_by: Option<RawActor>,
    dismissed_reason: Option<String>,
    dismissed_comment: Option<String>,
    rule: RawCodeScanningRule,
    tool: RawCodeScanningTool,
    most_recent_instance: Option<RawCodeScanningInstance>,
    #[serde(default)]
    assignees: Vec<RawActor>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCodeScanningRule {
    id: Option<String>,
    name: String,
    severity: Option<String>,
    security_severity_level: Option<String>,
    description: String,
    full_description: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    help: Option<String>,
    help_uri: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCodeScanningTool {
    name: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCodeScanningInstance {
    #[serde(rename = "ref")]
    reference: String,
    state: Option<String>,
    commit_sha: String,
    message: RawCodeScanningMessage,
    location: RawCodeScanningLocation,
    #[serde(default)]
    classifications: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCodeScanningMessage {
    text: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawCodeScanningLocation {
    path: String,
    start_line: u64,
    end_line: u64,
}

#[derive(Clone, Debug, Deserialize)]
struct RawSecretScanningAlert {
    number: i64,
    state: String,
    created_at: String,
    updated_at: Option<String>,
    html_url: String,
    resolution: Option<String>,
    resolution_comment: Option<String>,
    resolved_at: Option<String>,
    resolved_by: Option<RawActor>,
    secret_type: String,
    secret_type_display_name: String,
    validity: String,
    publicly_leaked: Option<bool>,
    multi_repo: Option<bool>,
    assigned_to: Option<RawActor>,
    push_protection_bypassed: Option<bool>,
    push_protection_bypassed_at: Option<String>,
    push_protection_bypassed_by: Option<RawActor>,
    #[serde(default)]
    metadata: Option<Vec<RawMetadata>>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawMetadata {
    key: String,
    value: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawSecretScanningLocation {
    #[serde(rename = "type")]
    kind: String,
    details: Value,
}

fn security_alert_page(
    alerts: Vec<GitHubSecurityAlertSummary>,
    page: u32,
    has_more: bool,
) -> GitHubSecurityAlertPage {
    GitHubSecurityAlertPage {
        alerts,
        page,
        has_previous: page > 1,
        has_more,
    }
}

fn dependabot_summary(alert: RawDependabotAlert) -> Result<GitHubSecurityAlertSummary, AppError> {
    let number = positive_alert_number(alert.number)?;
    Ok(GitHubSecurityAlertSummary::Dependabot {
        number,
        state: alert.state,
        severity: alert.security_advisory.severity,
        title: alert.security_advisory.summary,
        package_name: alert.dependency.package.name,
        ecosystem: alert.dependency.package.ecosystem,
        manifest_path: alert.dependency.manifest_path,
        scope: alert.dependency.scope,
        relationship: alert.dependency.relationship,
        url: alert.html_url,
        created_at: alert.created_at,
        updated_at: alert.updated_at,
        assignees: actors(alert.assignees),
    })
}

fn dependabot_detail(alert: RawDependabotAlert) -> Result<GitHubSecurityAlertDetail, AppError> {
    let advisory = alert.security_advisory.clone();
    let vulnerability = alert.security_vulnerability.clone();
    let cvss = advisory
        .cvss_severities
        .as_ref()
        .and_then(|severities| severities.cvss_v4.as_ref().or(severities.cvss_v3.as_ref()))
        .or(advisory.cvss.as_ref());
    Ok(GitHubSecurityAlertDetail::Dependabot {
        alert: dependabot_summary(alert.clone())?,
        description: advisory.description,
        ghsa_id: advisory.ghsa_id,
        cve_id: advisory.cve_id,
        vulnerable_version_range: vulnerability.vulnerable_version_range,
        first_patched_version: vulnerability
            .first_patched_version
            .map(|version| version.identifier),
        cvss_score: cvss.map(|cvss| cvss.score),
        cvss_vector: cvss.and_then(|cvss| cvss.vector_string.clone()),
        epss_percentage: advisory
            .epss
            .as_ref()
            .and_then(|epss| float_value(epss.percentage.as_ref())),
        epss_percentile: advisory
            .epss
            .as_ref()
            .and_then(|epss| float_value(epss.percentile.as_ref())),
        cwes: advisory
            .cwes
            .into_iter()
            .map(|cwe| GitHubSecurityCwe {
                id: cwe.cwe_id,
                name: cwe.name,
            })
            .collect(),
        references: advisory
            .references
            .into_iter()
            .map(|reference| reference.url)
            .collect(),
        published_at: advisory.published_at,
        withdrawn_at: advisory.withdrawn_at,
        dismissed_at: alert.dismissed_at,
        dismissed_by: alert.dismissed_by.map(actor),
        dismissed_reason: alert.dismissed_reason,
        dismissed_comment: alert.dismissed_comment,
        fixed_at: alert.fixed_at,
        auto_dismissed_at: alert.auto_dismissed_at,
    })
}

fn code_scanning_summary(
    alert: RawCodeScanningAlert,
) -> Result<GitHubSecurityAlertSummary, AppError> {
    let instance = alert.most_recent_instance.as_ref();
    let title = if alert.rule.description.trim().is_empty() {
        alert.rule.name.clone()
    } else {
        alert.rule.description.clone()
    };
    Ok(GitHubSecurityAlertSummary::CodeScanning {
        number: alert.number,
        state: alert.state,
        severity: alert
            .rule
            .security_severity_level
            .clone()
            .or_else(|| alert.rule.severity.clone())
            .unwrap_or_else(|| "unknown".to_string()),
        title,
        rule_id: alert.rule.id.clone(),
        tool_name: alert.tool.name.clone(),
        path: instance.map(|instance| instance.location.path.clone()),
        start_line: instance.map(|instance| instance.location.start_line),
        message: instance.map(|instance| instance.message.text.clone()),
        reference: instance.map(|instance| instance.reference.clone()),
        url: alert.html_url,
        created_at: alert.created_at,
        updated_at: alert.updated_at,
        assignees: actors(alert.assignees),
    })
}

fn code_scanning_detail(
    alert: RawCodeScanningAlert,
) -> Result<GitHubSecurityAlertDetail, AppError> {
    Ok(GitHubSecurityAlertDetail::CodeScanning {
        alert: code_scanning_summary(alert.clone())?,
        description: alert
            .rule
            .full_description
            .clone()
            .unwrap_or_else(|| alert.rule.description.clone()),
        help: alert.rule.help.clone(),
        help_url: alert.rule.help_uri.clone(),
        tags: alert.rule.tags.clone(),
        fixed_at: alert.fixed_at,
        dismissed_at: alert.dismissed_at,
        dismissed_by: alert.dismissed_by.map(actor),
        dismissed_reason: alert.dismissed_reason,
        dismissed_comment: alert.dismissed_comment,
    })
}

fn code_scanning_instance(instance: RawCodeScanningInstance) -> GitHubCodeScanningInstance {
    GitHubCodeScanningInstance {
        state: instance.state,
        reference: instance.reference,
        commit_sha: instance.commit_sha,
        message: instance.message.text,
        path: instance.location.path,
        start_line: instance.location.start_line,
        end_line: instance.location.end_line,
        classifications: instance.classifications,
    }
}

fn secret_scanning_summary(
    alert: RawSecretScanningAlert,
) -> Result<GitHubSecurityAlertSummary, AppError> {
    let number = positive_alert_number(alert.number)?;
    Ok(GitHubSecurityAlertSummary::SecretScanning {
        number,
        state: alert.state,
        title: alert.secret_type_display_name,
        secret_type: alert.secret_type,
        validity: alert.validity,
        publicly_leaked: alert.publicly_leaked.unwrap_or(false),
        multi_repo: alert.multi_repo.unwrap_or(false),
        url: alert.html_url,
        created_at: alert.created_at,
        updated_at: alert.updated_at,
        assignee: alert.assigned_to.map(actor),
    })
}

fn secret_scanning_detail(
    alert: RawSecretScanningAlert,
) -> Result<GitHubSecurityAlertDetail, AppError> {
    Ok(GitHubSecurityAlertDetail::SecretScanning {
        alert: secret_scanning_summary(alert.clone())?,
        resolution: alert.resolution,
        resolution_comment: alert.resolution_comment,
        resolved_at: alert.resolved_at,
        resolved_by: alert.resolved_by.map(actor),
        push_protection_bypassed: alert.push_protection_bypassed.unwrap_or(false),
        push_protection_bypassed_at: alert.push_protection_bypassed_at,
        push_protection_bypassed_by: alert.push_protection_bypassed_by.map(actor),
        metadata: alert
            .metadata
            .unwrap_or_default()
            .into_iter()
            .map(|metadata| GitHubSecurityMetadata {
                key: metadata.key,
                value: metadata.value,
            })
            .collect(),
    })
}

fn secret_scanning_location(location: RawSecretScanningLocation) -> GitHubSecretScanningLocation {
    let details = location.details.as_object();
    GitHubSecretScanningLocation {
        kind: location.kind,
        path: details.and_then(|details| string_value(details.get("path"))),
        start_line: details.and_then(|details| unsigned_value(details.get("start_line"))),
        end_line: details.and_then(|details| unsigned_value(details.get("end_line"))),
        commit_sha: details.and_then(|details| string_value(details.get("commit_sha"))),
        url: details.and_then(|details| {
            details
                .iter()
                .find(|(key, value)| key.ends_with("_url") && value.is_string())
                .and_then(|(_, value)| string_value(Some(value)))
        }),
    }
}

fn string_value(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::to_string)
}

fn unsigned_value(value: Option<&Value>) -> Option<u64> {
    value.and_then(Value::as_u64)
}

fn float_value(value: Option<&Value>) -> Option<f64> {
    value.and_then(|value| {
        value
            .as_f64()
            .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
    })
}

fn actor(actor: RawActor) -> GitHubSecurityActor {
    GitHubSecurityActor {
        login: actor.login,
        avatar_url: actor.avatar_url,
    }
}

fn actors(actors: Vec<RawActor>) -> Vec<GitHubSecurityActor> {
    actors.into_iter().map(actor).collect()
}

fn positive_alert_number(number: i64) -> Result<u64, AppError> {
    u64::try_from(number)
        .ok()
        .filter(|number| *number > 0)
        .ok_or_else(|| AppError::GitHub("GitHub returned an invalid security alert number".into()))
}

fn detail_alert_number(detail: &GitHubSecurityAlertDetail) -> u64 {
    match detail {
        GitHubSecurityAlertDetail::Dependabot { alert, .. }
        | GitHubSecurityAlertDetail::CodeScanning { alert, .. }
        | GitHubSecurityAlertDetail::SecretScanning { alert, .. } => alert.number(),
    }
}

fn validate_security_mutation(mutation: &GitHubSecurityAlertMutation) -> Result<(), AppError> {
    let (state, has_reason, comment) = match mutation {
        GitHubSecurityAlertMutation::Dependabot {
            state,
            reason,
            comment,
        } => (*state, reason.is_some(), comment),
        GitHubSecurityAlertMutation::CodeScanning {
            state,
            reason,
            comment,
        } => (*state, reason.is_some(), comment),
        GitHubSecurityAlertMutation::SecretScanning {
            state,
            reason,
            comment,
        } => (*state, reason.is_some(), comment),
    };
    if state == GitHubSecurityAlertMutationState::Closed && !has_reason {
        return Err(AppError::Validation(
            "a reason is required when closing a security alert".to_string(),
        ));
    }
    if state == GitHubSecurityAlertMutationState::Open && has_reason {
        return Err(AppError::Validation(
            "a reason cannot be supplied when reopening a security alert".to_string(),
        ));
    }
    if comment.chars().count() > SECURITY_COMMENT_LIMIT {
        return Err(AppError::Validation(format!(
            "security alert comments cannot exceed {SECURITY_COMMENT_LIMIT} characters"
        )));
    }
    Ok(())
}

fn non_empty_comment(comment: &str) -> Option<&str> {
    let comment = comment.trim();
    (!comment.is_empty()).then_some(comment)
}

fn mutation_state_name(
    state: GitHubSecurityAlertMutationState,
    closed_name: &'static str,
) -> &'static str {
    match state {
        GitHubSecurityAlertMutationState::Open => "open",
        GitHubSecurityAlertMutationState::Closed => closed_name,
    }
}

fn dependabot_reason_name(reason: GitHubDependabotDismissReason) -> &'static str {
    match reason {
        GitHubDependabotDismissReason::FixStarted => "fix_started",
        GitHubDependabotDismissReason::Inaccurate => "inaccurate",
        GitHubDependabotDismissReason::NoBandwidth => "no_bandwidth",
        GitHubDependabotDismissReason::NotUsed => "not_used",
        GitHubDependabotDismissReason::TolerableRisk => "tolerable_risk",
    }
}

fn code_scanning_reason_name(reason: GitHubCodeScanningDismissReason) -> &'static str {
    match reason {
        GitHubCodeScanningDismissReason::FalsePositive => "false positive",
        GitHubCodeScanningDismissReason::WontFix => "won't fix",
        GitHubCodeScanningDismissReason::UsedInTests => "used in tests",
        GitHubCodeScanningDismissReason::Mitigated => "mitigated",
    }
}

fn secret_scanning_resolution_name(reason: GitHubSecretScanningResolution) -> &'static str {
    match reason {
        GitHubSecretScanningResolution::FalsePositive => "false_positive",
        GitHubSecretScanningResolution::WontFix => "wont_fix",
        GitHubSecretScanningResolution::Revoked => "revoked",
        GitHubSecretScanningResolution::UsedInTests => "used_in_tests",
    }
}

fn security_sort_name(sort: GitHubSecurityAlertSort) -> &'static str {
    match sort {
        GitHubSecurityAlertSort::Created => "created",
        GitHubSecurityAlertSort::Updated => "updated",
    }
}

fn severity_filter_name(severity: GitHubSecurityAlertSeverityFilter) -> Option<&'static str> {
    match severity {
        GitHubSecurityAlertSeverityFilter::All => None,
        GitHubSecurityAlertSeverityFilter::Critical => Some("critical"),
        GitHubSecurityAlertSeverityFilter::High => Some("high"),
        GitHubSecurityAlertSeverityFilter::Medium => Some("medium"),
        GitHubSecurityAlertSeverityFilter::Low => Some("low"),
    }
}

fn security_error(error: octocrab::Error) -> AppError {
    match &error {
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 404 => {
            AppError::GitHubSecurityUnavailable(
                "the alert was not found, the security feature is disabled, or this account cannot view it"
                    .to_string(),
            )
        }
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 403 => {
            AppError::GitHubPermission(
                "security alerts require repository access, the security_events OAuth scope, and an enabled GitHub security feature"
                    .to_string(),
            )
        }
        _ => github_error(error),
    }
}

pub(crate) fn dependabot_alerts_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/dependabot/alerts")
}

pub(crate) fn dependabot_alert_route(owner: &str, repository: &str, number: u64) -> String {
    format!("{}/{number}", dependabot_alerts_route(owner, repository))
}

pub(crate) fn code_scanning_alerts_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/code-scanning/alerts")
}

pub(crate) fn code_scanning_alert_route(owner: &str, repository: &str, number: u64) -> String {
    format!("{}/{number}", code_scanning_alerts_route(owner, repository))
}

pub(crate) fn code_scanning_instances_route(owner: &str, repository: &str, number: u64) -> String {
    format!(
        "{}/{number}/instances",
        code_scanning_alerts_route(owner, repository)
    )
}

pub(crate) fn secret_scanning_alerts_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/secret-scanning/alerts")
}

pub(crate) fn secret_scanning_alert_route(owner: &str, repository: &str, number: u64) -> String {
    format!(
        "{}/{number}",
        secret_scanning_alerts_route(owner, repository)
    )
}

pub(crate) fn secret_scanning_locations_route(
    owner: &str,
    repository: &str,
    number: u64,
) -> String {
    format!(
        "{}/{number}/locations",
        secret_scanning_alerts_route(owner, repository)
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubSecurityClient for super::tests::FakeGitHubClient {
    async fn list_security_alerts(
        &self,
        token: &str,
        _owner: &str,
        _repository: &str,
        _kind: GitHubSecurityAlertKind,
        filters: &GitHubSecurityAlertFilters,
    ) -> Result<GitHubSecurityAlertPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(security_alert_page(Vec::new(), filters.page, false))
    }

    async fn security_alert(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _kind: GitHubSecurityAlertKind,
        _alert_number: u64,
    ) -> Result<GitHubSecurityAlertDetail, AppError> {
        Err(AppError::GitHub(
            "security alert fixture is unavailable".into(),
        ))
    }

    async fn code_scanning_instances(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _alert_number: u64,
        page: u32,
    ) -> Result<GitHubCodeScanningInstancePage, AppError> {
        Ok(GitHubCodeScanningInstancePage {
            instances: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn secret_scanning_locations(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _alert_number: u64,
        page: u32,
    ) -> Result<GitHubSecretScanningLocationPage, AppError> {
        Ok(GitHubSecretScanningLocationPage {
            locations: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn update_security_alert(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _alert_number: u64,
        _mutation: &GitHubSecurityAlertMutation,
    ) -> Result<GitHubSecurityAlertDetail, AppError> {
        Err(AppError::GitHub(
            "security alert fixture is unavailable".into(),
        ))
    }
}

#[cfg(test)]
#[path = "security/tests.rs"]
mod tests;
