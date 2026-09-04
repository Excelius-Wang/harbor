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

const aboutWindow = vi.hoisted(() => ({
  label: "about",
  onCloseRequested: vi.fn().mockResolvedValue(vi.fn()),
  onFocusChanged: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock("@tauri-apps/plugin-updater", () => updaterPlugin);
vi.mock("@tauri-apps/plugin-process", () => processPlugin);
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn().mockResolvedValue("0.1.0"),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => aboutWindow,
}));
vi.mock("@/lib/window", () => ({
  cancelDestroyWindow: vi.fn(),
  destroyWindow: vi.fn().mockResolvedValue(undefined),
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/components/title-bar", () => ({
  TitleBar: () => null,
}));
vi.mock("@/components/window-frame", () => ({
  WindowFrame: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));
vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: string }) =>
      values?.version ? `${key} ${values.version}` : key,
  }),
}));

import AboutPage from "./about";

function reviewedUpdate() {
  return {
    version: "0.2.0",
    date: "2026-09-04",
    body: "Manual release notes",
    downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  } as unknown as Update;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe("AboutPage updater", () => {
  it("installs and relaunches the exact update found by the manual check", async () => {
    const user = userEvent.setup();
    const update = reviewedUpdate();
    updaterPlugin.check.mockResolvedValueOnce(update);
    processPlugin.relaunch.mockResolvedValueOnce(undefined);

    render(<AboutPage />);
    await user.click(screen.getByRole("button", { name: "updater.checkForUpdates" }));

    expect(await screen.findByText("updater.versionAvailable 0.2.0")).toBeTruthy();
    expect(screen.getByText("Manual release notes")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "updater.installNow" }));

    await waitFor(() => {
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
      expect(processPlugin.relaunch).toHaveBeenCalledTimes(1);
    });
    expect(updaterPlugin.check).toHaveBeenCalledTimes(1);
  });
});
