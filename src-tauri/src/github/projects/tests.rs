use super::*;

fn summary() -> GitHubProjectSummary {
    GitHubProjectSummary {
        id: "PVT_kwHOA".into(),
        number: 3,
        title: "Harbor roadmap".into(),
        short_description: Some("Personal delivery plan".into()),
        url: "https://github.com/users/octocat/projects/3".into(),
        public: false,
        closed: false,
        item_count: 2,
        updated_at: "2026-08-28T08:00:00Z".into(),
        viewer_can_update: true,
        viewer_can_close: true,
        viewer_can_reopen: false,
    }
}

fn select_field() -> GitHubProjectField {
    GitHubProjectField {
        id: "PVTSSF_status".into(),
        name: "Status".into(),
        data_type: GitHubProjectFieldType::SingleSelect,
        issue_field: false,
        editable: true,
        options: vec![GitHubProjectFieldOption {
            id: "todo".into(),
            name: "Todo".into(),
            color: "gray".into(),
            description: String::new(),
        }],
        iterations: Vec::new(),
    }
}

#[test]
fn project_search_keeps_personal_state_and_text() {
    assert_eq!(
        projects_search_query(&GitHubProjectFilters {
            state: GitHubProjectStateFilter::Open,
            query: "harbor roadmap".into(),
            sort: GitHubProjectSort::Updated,
            after: None,
        }),
        Some("is:open harbor roadmap".into())
    );
    assert_eq!(
        projects_search_query(&GitHubProjectFilters {
            state: GitHubProjectStateFilter::All,
            query: "  ".into(),
            sort: GitHubProjectSort::Updated,
            after: None,
        }),
        None
    );
}

#[test]
fn item_url_parser_accepts_only_exact_github_resources() {
    assert_eq!(
        parse_project_item_url("https://github.com/octocat/harbor/issues/42").unwrap(),
        ParsedProjectItemUrl {
            owner: "octocat".into(),
            repository: "harbor".into(),
            number: 42,
            url: "https://github.com/octocat/harbor/issues/42".into(),
        }
    );
    assert!(parse_project_item_url("https://example.com/octocat/harbor/issues/42").is_err());
    assert!(parse_project_item_url("https://github.com/octocat/harbor/issues/42#comment").is_err());
    assert!(parse_project_item_url("https://github.com/octocat/harbor/discussions/42").is_err());
}

#[test]
fn project_owner_guard_rejects_organization_projects() {
    assert!(ensure_project_owner_url(&summary(), "octocat").is_ok());
    let mut organization = summary();
    organization.url = "https://github.com/orgs/octocat/projects/3".into();
    assert!(matches!(
        ensure_project_owner_url(&organization, "octocat"),
        Err(AppError::GitHubPermission(_))
    ));
}

#[test]
fn field_update_requires_matching_type_and_owned_option() {
    let field = select_field();
    assert!(validate_field_update(
        &field,
        &GitHubProjectItemUpdate::SingleSelect {
            field_id: field.id.clone(),
            option_id: "todo".into(),
        }
    )
    .is_ok());
    assert!(validate_field_update(
        &field,
        &GitHubProjectItemUpdate::SingleSelect {
            field_id: field.id.clone(),
            option_id: "foreign".into(),
        }
    )
    .is_err());
    assert!(validate_field_update(
        &field,
        &GitHubProjectItemUpdate::Text {
            field_id: field.id.clone(),
            text: "Todo".into(),
        }
    )
    .is_err());
}

#[test]
fn project_detail_maps_views_fields_and_items() {
    let raw: RawProjectDetail = serde_json::from_value(json!({
        "id": "PVT_kwHOA",
        "number": 3,
        "title": "Harbor roadmap",
        "shortDescription": "Personal delivery plan",
        "url": "https://github.com/users/octocat/projects/3",
        "public": false,
        "closed": false,
        "updatedAt": "2026-08-28T08:00:00Z",
        "viewerCanUpdate": true,
        "viewerCanClose": true,
        "viewerCanReopen": false,
        "itemCount": { "totalCount": 1 },
        "readme": "# Plan",
        "fields": { "nodes": [{
            "__typename": "ProjectV2SingleSelectField",
            "id": "PVTSSF_status",
            "name": "Status",
            "dataType": "SINGLE_SELECT",
            "isIssueField": false,
            "options": [{ "id": "todo", "name": "Todo", "color": "GRAY", "description": "" }]
        }]},
        "views": { "nodes": [{
            "id": "PVTV_board",
            "number": 1,
            "name": "Board",
            "layout": "BOARD_LAYOUT",
            "filter": "-status:Done",
            "configuration": { "visibleFields": { "nodes": [{ "id": "PVTSSF_status" }] } },
            "groupByFields": { "nodes": [{ "id": "PVTSSF_status" }] },
            "verticalGroupByFields": { "nodes": [] }
        }]},
        "items": {
            "totalCount": 1,
            "pageInfo": { "hasNextPage": false, "endCursor": null },
            "nodes": [{
                "id": "PVTI_item",
                "isArchived": false,
                "createdAt": "2026-08-27T08:00:00Z",
                "updatedAt": "2026-08-28T08:00:00Z",
                "content": { "__typename": "DraftIssue", "id": "DI_draft", "title": "Ship Projects", "body": "" },
                "fieldValues": { "nodes": [{
                    "__typename": "ProjectV2ItemFieldSingleSelectValue",
                    "optionId": "todo",
                    "name": "Todo",
                    "color": "GRAY",
                    "field": { "id": "PVTSSF_status" }
                }]}
            }]
        }
    }))
    .expect("project detail shape");

    let detail = project_detail(raw, "octocat").expect("mapped detail");
    assert_eq!(detail.project.item_count, 1);
    assert_eq!(detail.views[0].layout, GitHubProjectViewLayout::Board);
    assert_eq!(detail.fields[0].options[0].color, "gray");
    assert_eq!(detail.items.items[0].content.title(), "Ship Projects");
    assert!(matches!(
        detail.items.items[0].field_values[0],
        GitHubProjectFieldValue::SingleSelect { ref option_id, .. } if option_id == "todo"
    ));
}

#[test]
fn project_item_maps_repository_context_for_native_navigation() {
    let raw: RawProjectItem = serde_json::from_value(json!({
        "id": "PVTI_issue",
        "isArchived": false,
        "createdAt": "2026-08-27T08:00:00Z",
        "updatedAt": "2026-08-28T08:00:00Z",
        "content": {
            "__typename": "Issue",
            "id": "I_issue",
            "title": "Finish desktop project view",
            "body": "",
            "number": 42,
            "url": "https://github.com/octocat/harbor/issues/42",
            "state": "OPEN",
            "repository": {
                "nameWithOwner": "octocat/harbor",
                "name": "harbor",
                "url": "https://github.com/octocat/harbor",
                "owner": { "login": "octocat" },
                "defaultBranchRef": { "name": "main" }
            }
        },
        "fieldValues": { "nodes": [] }
    }))
    .expect("project item shape");
    let item = project_item(raw).expect("mapped item");
    assert!(matches!(
        item.content,
        GitHubProjectItemContent::Issue { number: 42, ref repository, .. }
            if repository.full_name == "octocat/harbor" && repository.default_branch == "main"
    ));
}

#[test]
fn graphql_queries_keep_personal_owner_and_current_field_types() {
    let list = list_projects_query();
    let detail = project_detail_query();
    assert!(list.contains("viewer"));
    assert!(!list.contains("organization("));
    assert!(detail.contains("ProjectV2MultiSelectField"));
    assert!(detail.contains("archivedStates: $archivedStates"));
    assert!(detail.contains("ProjectV2ItemFieldIterationValue"));
}

#[test]
fn mutation_responses_accept_only_the_requested_payload() {
    let project: RawProjectMutationResponse = serde_json::from_value(json!({
        "createProjectV2": { "projectV2": null }
    }))
    .expect("single project mutation payload");
    assert!(project.create_project.is_some());
    assert!(project.update_project.is_none());
    assert!(project.delete_project.is_none());

    let item: RawProjectItemMutationResponse = serde_json::from_value(json!({
        "archiveProjectV2Item": { "item": null }
    }))
    .expect("single item mutation payload");
    assert!(item.archive.is_some());
    assert!(item.add_draft.is_none());
    assert!(item.update_field.is_none());
    assert!(item.delete.is_none());
}

#[test]
fn number_field_rejects_non_finite_values() {
    let field = GitHubProjectField {
        id: "PVTF_number".into(),
        name: "Estimate".into(),
        data_type: GitHubProjectFieldType::Number,
        issue_field: false,
        editable: true,
        options: Vec::new(),
        iterations: Vec::new(),
    };
    assert!(validate_field_update(
        &field,
        &GitHubProjectItemUpdate::Number {
            field_id: field.id.clone(),
            number: f64::NAN,
        }
    )
    .is_err());
}
