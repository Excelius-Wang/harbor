// @vitest-environment jsdom

import type * as Data from "@/features/github/github-data";
import { invoke } from "./preview-core";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installPreview } from "./preview";

afterEach(() => {
  history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  clearMocks();
  delete document.documentElement.dataset.previewBackground;
  delete document.documentElement.dataset.uiPreview;
});

describe("UI preview isolation", () => {
  it("serves discovery fixtures and rejects unimplemented business writes", async () => {
    vi.stubGlobal("isTauri", false);
    installPreview();
    const result = await invoke<{ results: { owner: string }[] }>("github_search_discovery", {
      kind: "repositories",
    });
    expect(result.results[0].owner).toBe("harbor-preview");
    await expect(invoke("github_delete_repository_issue", { number: 1 })).rejects.toMatchObject({
      code: "previewFixtureMissing",
    });
  });

  it("keeps a known null response distinct from a missing fixture", async () => {
    vi.stubGlobal("isTauri", false);
    installPreview();
    await expect(invoke("github_get_pending_repository_pull_request_review")).resolves.toBeNull();
  });

  it("scopes a failure to selected commands while preserving workspace navigation", async () => {
    vi.stubGlobal("isTauri", false);
    history.replaceState(null, "", "/?state=error&commands=github_list_repository_workflow_runs");
    installPreview();
    const result = await invoke<{ repositories: unknown[] }>("github_list_repositories");
    expect(result.repositories.length).toBeGreaterThan(0);
    await expect(invoke("github_list_repository_workflow_runs")).rejects.toMatchObject({
      code: "preview",
    });
  });

  it("forwards native window calls while keeping business calls inside the preview", async () => {
    const nativeIPC = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("isTauri", true);
    const internals = {};
    Object.defineProperty(internals, "invoke", { value: nativeIPC });
    vi.stubGlobal("__TAURI_INTERNALS__", internals);
    installPreview();
    await invoke("plugin:window|is_maximized");
    expect(nativeIPC).toHaveBeenCalledWith("plugin:window|is_maximized", {}, undefined);
    expect(Object.getOwnPropertyDescriptor(internals, "invoke")?.writable).toBe(false);
    await expect(invoke("github_mutate_repository_issue", { number: 1 })).rejects.toMatchObject({
      code: "previewFixtureMissing",
    });
    expect(nativeIPC).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.previewBackground).toBeUndefined();
  });
});

it("supplies the sign-in configuration shape used by the production dialog", async () => {
  vi.stubGlobal("isTauri", false);
  installPreview();
  await expect(invoke("github_login_availability")).resolves.toEqual({ configured: true });
});

it("simulates only the opted-in workflow actions and reconciles their read fixtures", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?actions=failed&writes=accept");
  installPreview();
  const target = { owner: "harbor-preview", repository: "harbor", runId: 1 };
  expect(
    (await invoke<Data.GitHubWorkflowRun>("github_get_repository_workflow_run", target)).conclusion
  ).toBe("failure");
  await invoke("github_request_workflow_run_action", { ...target, action: "rerunAll" });
  expect(
    (await invoke<Data.GitHubWorkflowRun>("github_get_repository_workflow_run", target)).status
  ).toBe("queued");
  await invoke("github_delete_repository_workflow_run", target);
  expect(
    (
      await invoke<Data.GitHubWorkflowRunPage>("github_list_repository_workflow_runs", target)
    ).runs.some((run) => run.id === 1)
  ).toBe(false);
  await expect(invoke("github_delete_repository_issue", { number: 1 })).rejects.toMatchObject({
    code: "previewFixtureMissing",
  });
});

it("removes acknowledged notification targets from the controlled inbox", async () => {
  vi.stubGlobal("isTauri", false);
  history.replaceState(null, "", "/?notifications=targets");
  installPreview();
  const before = await invoke<Data.GitHubNotificationPage>("github_list_notifications");
  expect(
    before.notifications.some((notification) => notification.subject.kind === "checkSuite")
  ).toBe(true);
  await invoke("github_update_notification", {
    threadId: before.notifications[0].id,
    action: "read",
  });
  const after = await invoke<Data.GitHubNotificationPage>("github_list_notifications");
  expect(after.notifications).toHaveLength(before.notifications.length - 1);
  expect(
    after.notifications.some((notification) => notification.id === before.notifications[0].id)
  ).toBe(false);
});
