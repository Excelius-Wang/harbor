// @vitest-environment jsdom

import type { Update } from "@tauri-apps/plugin-updater";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const updaterPlugin = vi.hoisted(() => ({
  check: vi.fn(),
}));

const processPlugin = vi.hoisted(() => ({
  relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => updaterPlugin);
vi.mock("@tauri-apps/plugin-process", () => processPlugin);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: string }) =>
      values?.version ? `${key} ${values.version}` : key,
  }),
}));

import { UpdaterDialog } from "./updater-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("UpdaterDialog", () => {
  it("installs the update whose version and notes the user reviewed", async () => {
    const user = userEvent.setup();
    const reviewedUpdate = {
      version: "0.2.0",
      date: "2026-09-04",
      body: "Reviewed release notes",
      downloadAndInstall: vi.fn().mockResolvedValue(undefined),
    } as unknown as Update;
    updaterPlugin.check.mockResolvedValueOnce(reviewedUpdate).mockResolvedValue(null);

    render(<UpdaterDialog />);

    expect(await screen.findByText("updater.versionAvailable 0.2.0")).toBeTruthy();
    expect(screen.getByText("Reviewed release notes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "updater.installNow" }));

    await waitFor(() => {
      expect(reviewedUpdate.downloadAndInstall).toHaveBeenCalledTimes(1);
    });
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
    expect(processPlugin.relaunch).toHaveBeenCalledTimes(1);
  });
});
