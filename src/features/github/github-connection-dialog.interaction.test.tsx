// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubConnectionDialog } from "./github-connection-dialog";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});
afterEach(cleanup);

function connectionView(client: QueryClient, open: boolean) {
  return (
    <QueryClientProvider client={client}>
      <GitHubConnectionDialog
        open={open}
        onOpenChange={() => {}}
        connection={{ connected: false }}
        onConnectionChange={() => {}}
      />
    </QueryClientProvider>
  );
}

describe("sign-in availability feedback", () => {
  it("retries a failed availability check and enables sign-in", async () => {
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error("Local check failed"))
      .mockResolvedValue({ configured: true });
    const user = userEvent.setup();
    render(connectionView(new QueryClient(), true));
    expect(await screen.findByText("workspace.github.availabilityFailed")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "workspace.github.login" }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
    expect(screen.queryByText("Local check failed")).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("ignores a failure from a closed dialog after a new check succeeds", async () => {
    let failOld!: (reason: unknown) => void;
    vi.mocked(invoke)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failOld = reject;
          })
      )
      .mockResolvedValue({ configured: true });
    const client = new QueryClient();
    const { rerender } = render(connectionView(client, true));
    rerender(connectionView(client, false));
    rerender(connectionView(client, true));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "workspace.github.login" }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
    await act(async () => {
      failOld(new Error("Old check failed"));
    });
    expect(screen.queryByText("Old check failed")).toBeNull();
    expect(screen.queryByText("workspace.github.availabilityFailed")).toBeNull();
  });
});
