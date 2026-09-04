// @vitest-environment jsdom

import type { Update } from "@tauri-apps/plugin-updater";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const updaterPlugin = vi.hoisted(() => ({
  check: vi.fn(),
}));

const windowApi = vi.hoisted(() => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-updater", () => updaterPlugin);
vi.mock("@/lib/window", () => windowApi);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: string }) =>
      values?.version ? `${key} ${values.version}` : key,
  }),
}));

import { UpdaterDialog } from "./updater-dialog";

function reviewedUpdate() {
  return {
    version: "0.2.0",
    date: "2026-09-04",
    body: "Reviewed release notes",
  } as unknown as Update;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("UpdaterDialog", () => {
  it("opens the checked release on GitHub instead of installing in-app", async () => {
    const user = userEvent.setup();
    const update = reviewedUpdate();
    updaterPlugin.check.mockResolvedValueOnce(update).mockResolvedValue(null);

    render(<UpdaterDialog />);

    expect(await screen.findByText("updater.versionAvailable 0.2.0")).toBeTruthy();
    expect(screen.getByText("Reviewed release notes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "updater.viewRelease" }));

    expect(windowApi.openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/Excelius-Wang/harbor/releases/tag/v0.2.0"
    );
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
  });
});
