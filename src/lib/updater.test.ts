import type { Update } from "@tauri-apps/plugin-updater";
import { afterEach, describe, expect, it, vi } from "vitest";

const updaterPlugin = vi.hoisted(() => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => updaterPlugin);

import { checkForUpdates } from "./updater";

afterEach(() => {
  vi.clearAllMocks();
});

describe("desktop updater", () => {
  it("returns the exact update metadata that was checked", async () => {
    const reviewedUpdate = {
      version: "0.2.0",
      date: "2026-09-04",
      body: "Reviewed release notes",
    } as unknown as Update;
    updaterPlugin.check.mockResolvedValueOnce(reviewedUpdate).mockResolvedValueOnce(null);

    const result = await checkForUpdates();

    expect(result.status).toBe("available");
    if (result.status !== "available") {
      throw new Error("Expected an available update");
    }

    expect(result.update).toBe(reviewedUpdate);
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
  });
});
