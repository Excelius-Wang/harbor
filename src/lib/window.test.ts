// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false }));

import { openExternalUrl } from "./window";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openExternalUrl", () => {
  it("opens supported external URLs and rejects executable or credential-bearing URLs", async () => {
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);

    await openExternalUrl("https://github.com/Excelius-Wang/harbor");
    await openExternalUrl("javascript:alert(document.domain)");
    await openExternalUrl("https://token@example.com/private");

    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(openWindow).toHaveBeenCalledWith(
      "https://github.com/Excelius-Wang/harbor",
      "_blank",
      "noopener,noreferrer"
    );
  });
});
