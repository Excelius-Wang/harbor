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

function reviewedUpdate(downloadAndInstall = vi.fn().mockResolvedValue(undefined)) {
  return {
    version: "0.2.0",
    date: "2026-09-04",
    body: "Reviewed release notes",
    downloadAndInstall,
  } as unknown as Update;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("UpdaterDialog", () => {
  it("installs the update whose version and notes the user reviewed", async () => {
    const user = userEvent.setup();
    const update = reviewedUpdate();
    updaterPlugin.check.mockResolvedValueOnce(update).mockResolvedValue(null);

    render(<UpdaterDialog />);

    expect(await screen.findByText("updater.versionAvailable 0.2.0")).toBeTruthy();
    expect(screen.getByText("Reviewed release notes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "updater.installNow" }));

    await waitFor(() => {
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    });
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
    expect(processPlugin.relaunch).toHaveBeenCalledTimes(1);
  });

  it("shows download failure, retries, and announces the restart", async () => {
    const user = userEvent.setup();
    let rejectFirstAttempt!: (reason: unknown) => void;
    const firstAttempt = new Promise<void>((_resolve, reject) => {
      rejectFirstAttempt = reject;
    });
    let finishRelaunch!: () => void;
    const relaunchAttempt = new Promise<void>((resolve) => {
      finishRelaunch = resolve;
    });
    type ProgressCallback = Parameters<Update["downloadAndInstall"]>[0];
    const install = vi
      .fn()
      .mockImplementationOnce(async (onProgress: ProgressCallback) => {
        onProgress?.({ event: "Started", data: { contentLength: 100 } });
        await firstAttempt;
      })
      .mockImplementationOnce(async (onProgress: ProgressCallback) => {
        onProgress?.({ event: "Started", data: { contentLength: 100 } });
        onProgress?.({ event: "Progress", data: { chunkLength: 100 } });
        onProgress?.({ event: "Finished" });
      });
    const update = reviewedUpdate(install);
    updaterPlugin.check.mockResolvedValueOnce(update);
    processPlugin.relaunch.mockReturnValue(relaunchAttempt);
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<UpdaterDialog />);
    await screen.findByText("updater.versionAvailable 0.2.0");

    await user.click(screen.getByRole("button", { name: "updater.installNow" }));
    expect(await screen.findByText("updater.downloading")).toBeTruthy();

    rejectFirstAttempt(new Error("download failed"));
    expect(await screen.findByText("updater.installFailed")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "updater.retry" }));
    expect(await screen.findByText("updater.restarting")).toBeTruthy();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(2);
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
    finishRelaunch();
  });

  it("keeps the installed state and retries only relaunch after relaunch fails", async () => {
    const user = userEvent.setup();
    const update = reviewedUpdate();
    updaterPlugin.check.mockResolvedValueOnce(update);
    processPlugin.relaunch
      .mockRejectedValueOnce(new Error("relaunch failed"))
      .mockResolvedValueOnce(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<UpdaterDialog />);
    await screen.findByText("updater.versionAvailable 0.2.0");

    await user.click(screen.getByRole("button", { name: "updater.installNow" }));
    expect(await screen.findByText("updater.relaunchFailed")).toBeTruthy();
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "updater.retryRestart" }));
    await waitFor(() => {
      expect(processPlugin.relaunch).toHaveBeenCalledTimes(2);
    });
    expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
    expect(screen.getByText("updater.restarting")).toBeTruthy();
  });
});
