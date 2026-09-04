import type { Update } from "@tauri-apps/plugin-updater";
import { afterEach, describe, expect, it, vi } from "vitest";

const updaterPlugin = vi.hoisted(() => ({
  check: vi.fn(),
}));

const processPlugin = vi.hoisted(() => ({
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => updaterPlugin);
vi.mock("@tauri-apps/plugin-process", () => processPlugin);

import { checkForUpdates, downloadAndInstall } from "./updater";

afterEach(() => {
  vi.clearAllMocks();
});

describe("desktop updater", () => {
  it("installs the same update that was checked and reviewed", async () => {
    const reviewedUpdate = {
      version: "0.2.0",
      date: "2026-09-04",
      body: "Reviewed release notes",
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    } as unknown as Update;
    updaterPlugin.check.mockResolvedValueOnce(reviewedUpdate).mockResolvedValueOnce(null);

    const result = await checkForUpdates();

    expect(result.status).toBe("available");
    if (result.status !== "available") {
      throw new Error("Expected an available update");
    }

    await downloadAndInstall(result.update);

    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
    expect(reviewedUpdate.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(processPlugin.relaunch).toHaveBeenCalledTimes(1);
  });
});
