// @vitest-environment jsdom

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
