// @vitest-environment jsdom

import { invoke } from "@tauri-apps/api/core";
import { clearMocks } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installPreview } from "./preview";

afterEach(() => {
  clearMocks();
  vi.unstubAllGlobals();
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

  it("forwards native window calls while keeping business calls inside the preview", async () => {
    const nativeIPC = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("isTauri", true);
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke: nativeIPC });
    installPreview();
    await invoke("plugin:window|is_maximized");
    expect(nativeIPC).toHaveBeenCalledWith("plugin:window|is_maximized", {});
    await expect(invoke("github_mutate_repository_issue", { number: 1 })).rejects.toMatchObject({
      code: "previewFixtureMissing",
    });
    expect(nativeIPC).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.previewBackground).toBeUndefined();
  });
});
