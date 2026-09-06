import type * as Data from "@/features/github/github-data";
import { moreFixture } from "./more-fixtures";

const changedAt = "2026-09-01T10:05:00Z";

export function createProjectFixtures(
  repositories: Data.GitHubRepository[],
  scenario: string | null,
  acceptWrites: boolean
) {
  let projects = structuredClone(
    (
      moreFixture(
        "github_list_personal_projects",
        {},
        repositories,
        false
      ) as Data.GitHubProjectPage
    ).projects
  ).map((project) => ({
    ...project,
    ...(scenario === "readonly"
      ? { viewerCanUpdate: false, viewerCanClose: false, viewerCanReopen: false }
      : {}),
    ...(scenario === "closed"
      ? { closed: true, viewerCanClose: false, viewerCanReopen: true }
      : {}),
    ...(scenario === "long"
      ? {
          title: `${project.title}: a deliberately long Project title for compact desktop review`,
          shortDescription: project.shortDescription?.repeat(4) ?? null,
        }
      : {}),
  }));
  const details = new Map<number, Data.GitHubProjectDetail>();
  const projectDefaults = { ...projects[0] };
  let nextItem = 1000;
  let nextProject = 10;

  function detailFor(project: Data.GitHubProjectSummary) {
    if (!details.has(project.number)) {
      const detail = structuredClone(
        moreFixture(
          "github_get_personal_project",
          { number: project.number },
          repositories,
          false
        ) as Data.GitHubProjectDetail
      );
      const tags: Data.GitHubProjectFieldOption[] = [
        { id: "keyboard", name: "Keyboard access", color: "BLUE", description: "" },
        {
          id: "reading",
          name: "Reading surfaces and long content",
          color: "GREEN",
          description: "",
        },
      ];
      const iterations: Data.GitHubProjectIteration[] = [
        {
          id: "cycle-current",
          title: "September workspace review",
          startDate: "2026-09-01",
          duration: 14,
          completed: false,
        },
        {
          id: "cycle-completed",
          title: "August review and feedback",
          startDate: "2026-08-01",
          duration: 14,
          completed: true,
        },
      ];
      const field = (
        id: string,
        name: string,
        dataType: Data.GitHubProjectFieldType
      ): Data.GitHubProjectField => ({
        id,
        name,
        dataType,
        issueField: false,
        editable: true,
        options: [],
        iterations: [],
      });
      detail.project = { ...project };
      detail.fields.push(
        field("notes", "Working notes", "text"),
        field("effort", "Estimated effort", "number"),
        { ...field("tags", "Review areas", "multiSelect"), options: tags },
        { ...field("cycle", "Iteration", "iteration"), iterations }
      );
      if (scenario === "empty-options")
        detail.fields = detail.fields.map((field) => ({ ...field, options: [], iterations: [] }));
      detail.views = detail.views.map((view) => ({
        ...view,
        visibleFieldIds: detail.fields.map((field) => field.id),
        ...(view.layout === "board" && scenario === "iterations"
          ? { groupByFieldIds: ["cycle"] }
          : {}),
      }));
      detail.items.items = detail.items.items.map((item, index) => ({
        ...item,
        id: `PI_preview_${project.number}_${index}`,
        content:
          item.content.kind === "draftIssue"
            ? {
                ...item.content,
                id: `DI_preview_${project.number}_${index}`,
                body:
                  scenario === "long" ? `${item.content.body}\n\n`.repeat(30) : item.content.body,
              }
            : item.content,
        fieldValues: [
          ...item.fieldValues.filter(
            (value) => scenario !== "empty-options" || value.kind !== "singleSelect"
          ),
          {
            kind: "text",
            fieldId: "notes",
            text: "Keep the draft while refreshing.\nRead the complete field value in compact and wide views.",
          },
          { kind: "number", fieldId: "effort", number: index * 1.5 },
          ...(scenario === "empty-options"
            ? []
            : [
                {
                  kind: "multiSelect" as const,
                  fieldId: "tags",
                  options: [tags[index % tags.length]],
                },
                {
                  kind: "iteration" as const,
                  fieldId: "cycle",
                  iterationId: iterations[index % iterations.length].id,
                  title: iterations[index % iterations.length].title,
                  startDate: iterations[index % iterations.length].startDate,
                  duration: 14,
                },
              ]),
        ],
      }));
      details.set(project.number, detail);
    }
    return details.get(project.number)!;
  }

  function updateProject(project: Data.GitHubProjectSummary, detail: Data.GitHubProjectDetail) {
    const next = { ...project, itemCount: detail.items.items.length, updatedAt: changedAt };
    detail.project = next;
    projects = projects.map((current) => (current.id === next.id ? next : current));
    return next;
  }

  return (command: string, args: Record<string, unknown>, empty: boolean): unknown => {
    if (!scenario) return undefined;
    if (command === "github_list_personal_projects") {
      const query = String(args.query ?? "").toLowerCase();
      const results = projects.filter(
        (project) =>
          (!args.projectState ||
            args.projectState === "all" ||
            project.closed === (args.projectState === "closed")) &&
          project.title.toLowerCase().includes(query)
      );
      results.sort((a, b) =>
        args.sort === "title"
          ? a.title.localeCompare(b.title)
          : args.sort === "created"
            ? b.number - a.number
            : b.updatedAt.localeCompare(a.updatedAt)
      );
      return {
        projects: empty ? [] : structuredClone(results),
        totalCount: empty ? 0 : results.length,
        endCursor: null,
        hasMore: false,
      } satisfies Data.GitHubProjectPage;
    }
    if (command === "github_create_personal_project" && acceptWrites) {
      if (scenario === "readonly")
        throw { code: "githubPermission", message: "This preview account cannot create Projects." };
      const number = nextProject++;
      const project: Data.GitHubProjectSummary = {
        ...projectDefaults,
        id: `P_preview_${number}`,
        number,
        title: String(args.title),
        closed: false,
        itemCount: 0,
        url: `https://github.com/users/harbor-preview/projects/${number}`,
        updatedAt: changedAt,
        viewerCanUpdate: true,
        viewerCanClose: true,
        viewerCanReopen: false,
      };
      projects.push(project);
      detailFor(project).items.items = [];
      return { ...project };
    }
    const project = projects.find((project) => project.number === Number(args.number));
    if (!project) {
      if (command === "github_get_personal_project")
        throw { code: "githubNotFound", message: "This preview Project no longer exists." };
      return undefined;
    }
    const detail = detailFor(project);
    if (command === "github_get_personal_project") {
      const query = String(args.query ?? "").toLowerCase();
      const items = detail.items.items.filter(
        (item) =>
          item.archived === Boolean(args.archived) &&
          (item.content.kind === "redacted" || item.content.title.toLowerCase().includes(query))
      );
      return structuredClone({
        ...detail,
        project,
        items: {
          items: empty ? [] : items,
          totalCount: empty ? 0 : items.length,
          endCursor: null,
          hasMore: false,
        },
      } satisfies Data.GitHubProjectDetail);
    }
    const writes = [
      "github_update_personal_project",
      "github_delete_personal_project",
      "github_add_personal_project_item",
      "github_update_personal_project_item",
      "github_change_personal_project_item",
    ];
    if (!acceptWrites || !writes.includes(command)) return undefined;
    if (!project.viewerCanUpdate)
      throw { code: "githubPermission", message: "This preview Project is read only." };
    if (command === "github_delete_personal_project") {
      projects = projects.filter((current) => current.id !== project.id);
      details.delete(project.number);
      return null;
    }
    if (command === "github_update_personal_project") {
      const update = args.update as Data.GitHubProjectUpdate;
      detail.readme = update.readme;
      return {
        ...updateProject(
          {
            ...project,
            title: update.title,
            shortDescription: update.shortDescription,
            public: update.public,
            closed: update.closed,
            viewerCanClose: !update.closed,
            viewerCanReopen: update.closed,
          },
          detail
        ),
      };
    }
    if (command === "github_add_personal_project_item") {
      const addition = args.addition as Data.GitHubProjectItemAddition;
      let content: Data.GitHubProjectItemContent;
      const id = `PI_added_${nextItem++}`;
      if (addition.kind === "draftIssue") content = { ...addition, id: `DI_${id}` };
      else {
        const url = new URL(addition.url);
        const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)\/?$/);
        if (url.protocol !== "https:" || url.hostname !== "github.com" || !match)
          throw { code: "githubValidation", message: "Use a GitHub Issue or pull request URL." };
        const repository = {
          owner: match[1],
          name: match[2],
          fullName: `${match[1]}/${match[2]}`,
          url: `https://github.com/${match[1]}/${match[2]}`,
          defaultBranch: "main",
        };
        content = {
          kind: match[3] === "pull" ? "pullRequest" : "issue",
          id: `I_${id}`,
          title: `Linked work #${match[4]}`,
          body: "Controlled linked item",
          number: Number(match[4]),
          url: addition.url,
          state: "open",
          repository,
        };
      }
      const item: Data.GitHubProjectItem = {
        id,
        archived: false,
        content,
        fieldValues: [],
        createdAt: changedAt,
        updatedAt: changedAt,
      };
      detail.items.items.push(item);
      updateProject(project, detail);
      return structuredClone(item);
    }
    const index = detail.items.items.findIndex((item) => item.id === args.itemId);
    const item = detail.items.items[index];
    if (!item)
      throw { code: "githubNotFound", message: "This preview Project item no longer exists." };
    if (command === "github_change_personal_project_item") {
      if (args.action === "delete") {
        detail.items.items.splice(index, 1);
        updateProject(project, detail);
        return null;
      }
      if (args.action !== "archive" && args.action !== "unarchive") return undefined;
      const next = { ...item, archived: args.action === "archive", updatedAt: changedAt };
      detail.items.items[index] = next;
      updateProject(project, detail);
      return structuredClone(next);
    }
    const update = args.update as Data.GitHubProjectItemUpdate;
    let next = { ...item, updatedAt: changedAt };
    if (update.kind === "draftIssue") {
      if (item.content.kind !== "draftIssue") return undefined;
      next.content = { ...item.content, title: update.title, body: update.body };
    } else {
      const field = detail.fields.find((field) => field.id === update.fieldId && field.editable);
      if (!field) return undefined;
      if (update.kind !== "clearField" && update.kind !== field.dataType) return undefined;
      let value: Data.GitHubProjectFieldValue | null = null;
      if (update.kind === "singleSelect") {
        const option = field.options.find((option) => option.id === update.optionId);
        if (!option) return undefined;
        value = { ...update, name: option.name, color: option.color };
      } else if (update.kind === "multiSelect") {
        const options = update.optionIds.map((id) =>
          field.options.find((option) => option.id === id)
        );
        if (options.some((option) => !option)) return undefined;
        value = {
          kind: update.kind,
          fieldId: field.id,
          options: options as Data.GitHubProjectFieldOption[],
        };
      } else if (update.kind === "iteration") {
        const iteration = field.iterations.find((iteration) => iteration.id === update.iterationId);
        if (!iteration) return undefined;
        value = {
          ...update,
          title: iteration.title,
          startDate: iteration.startDate,
          duration: iteration.duration,
        };
      } else if (update.kind !== "clearField") value = update;
      next = {
        ...next,
        fieldValues: [
          ...item.fieldValues.filter((value) => value.fieldId !== field.id),
          ...(value ? [value] : []),
        ],
      };
    }
    detail.items.items[index] = next;
    updateProject(project, detail);
    return structuredClone(next);
  };
}
