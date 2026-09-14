// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import { createOpportunityFixtures } from "@/dev/opportunity-fixtures";
import { resetGitHubQueryCache } from "@/features/github/github-queries";
import { OpportunityView } from "./opportunity-view";
import { filterOpportunities, monitorKey, type MonitorSnapshot } from "./opportunity-data";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn().mockResolvedValue(undefined) }));
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const handler = createOpportunityFixtures(null, true);
  vi.mocked(invoke).mockImplementation(
    async (command, args) => handler(command, args as Record<string, unknown>, false) as never
  );
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const i18n = createInstance();
  void i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    initImmediate: false,
    showSupportNotice: false,
  });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <OpportunityView />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
  return client;
}
it("renders a recommendation, filters it and preserves selection on detail return", async () => {
  mount();
  await screen.findByText("Issue summary");
  const search = screen.getByRole("textbox", { name: "Search opportunities" });
  fireEvent.change(search, { target: { value: "#130" } });
  expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { pressed: true }));
  fireEvent.click(screen.getByRole("button", { name: "Back to opportunities" }));
  expect((search as HTMLInputElement).value).toBe("#130");
  expect(screen.getByText("Claim status unverified")).toBeTruthy();
});
it("uses native pause/check contracts without GitHub writes", async () => {
  mount();
  await screen.findByText("Issue summary");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  await screen.findByRole("button", { name: "Start monitoring" });
  expect(invoke).toHaveBeenCalledWith("opportunity_set_enabled", { enabled: false });
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("opportunity_check", { historyDays: 0 }));
  expect(
    vi.mocked(invoke).mock.calls.every(([command]) => command.startsWith("opportunity_"))
  ).toBe(true);
});
it("retains cached content when snapshot refresh fails", async () => {
  const client = mount();
  await screen.findByText("Issue summary");
  vi.mocked(invoke).mockRejectedValue("network");
  await act(async () => {
    await client.invalidateQueries({ queryKey: monitorKey });
  });
  await screen.findByText(en.opportunities.errors.network);
  expect(screen.getByText("Issue summary")).toBeTruthy();
});
it("preserves a settings draft after failed save and never preloads a saved key", async () => {
  mount();
  await screen.findByText("Issue summary");
  fireEvent.click(screen.getByRole("button", { name: "Monitor settings" }));
  const key = screen.getByLabelText("Model API key") as HTMLInputElement;
  expect(key.value).toBe("");
  const model = screen.getByLabelText("Model name");
  fireEvent.change(model, { target: { value: "chosen-model" } });
  vi.mocked(invoke).mockRejectedValue("credentials");
  fireEvent.submit(model.closest("form")!);
  await screen.findByText(en.opportunities.errors.credentials);
  expect((model as HTMLInputElement).value).toBe("chosen-model");
});
it("blocks copying a stale draft and shows the reason", async () => {
  const handler = createOpportunityFixtures("stale", true);
  vi.mocked(invoke).mockImplementation(
    async (command, args) => handler(command, args as Record<string, unknown>, false) as never
  );
  mount();
  await screen.findByText("Issue summary");
  expect((screen.getByRole("button", { name: "Copy draft" }) as HTMLButtonElement).disabled).toBe(
    true
  );
  expect(screen.getByText(en.opportunities.staleItem)).toBeTruthy();
});
it("keeps preview writes intercepted and fixtures isolated", () => {
  const handler = createOpportunityFixtures(null, false);
  expect(() => handler("opportunity_check", {}, false)).toThrow();
  const snapshot = handler("opportunity_snapshot", {}, false) as MonitorSnapshot;
  snapshot.items[0].title = "Changed";
  expect((handler("opportunity_snapshot", {}, false) as MonitorSnapshot).items[0].title).not.toBe(
    "Changed"
  );
  expect(
    filterOpportunities(snapshot.items, "#128", "harbor-labs/ui-kit", "recommend")
  ).toHaveLength(1);
});

it("clears saved opportunity queries when the GitHub account changes", async () => {
  const client = new QueryClient();
  clients.push(client);
  client.setQueryData(monitorKey, { items: [{ title: "Private account A issue" }] });
  await resetGitHubQueryCache(client);
  expect(client.getQueryData(monitorKey)).toBeUndefined();
});

it("uses singular English opportunity counts", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { translation: en } }, showSupportNotice: false });
  expect(i18n.t("opportunities.count", { count: 1 })).toBe("1 opportunity");
  expect(i18n.t("opportunities.count", { count: 2 })).toBe("2 opportunities");
  expect(i18n.t("opportunities.subtitle", { count: 1, time: "now" })).toBe(
    "1 monitored repository · Last check now"
  );
});

it("provides monitor recovery instructions in both languages", () => {
  expect(en.opportunities.errors.stateRecovered).toContain("Monitoring is paused");
  expect(zh.opportunities.errors.stateRecovered).toContain("监控已暂停");
});

it("retains the selected brief through failed reanalysis and replaces it after retry", async () => {
  const client = mount();
  await screen.findByText("Issue summary");
  const selected = screen.getByRole("button", { pressed: true });
  fireEvent.click(selected);
  const initial = client.getQueryData<MonitorSnapshot>(monitorKey)!;
  const original = initial.items[0];
  const stale = structuredClone(initial);
  stale.error = "network";
  stale.items[0].pending = true;
  stale.items[0].error = "network";
  stale.items[0].title = "Updated issue title";
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "opportunity_check") {
      const fresh = structuredClone(stale);
      fresh.error = null;
      fresh.items[0].pending = false;
      fresh.items[0].error = null;
      fresh.items[0].analysis!.summary = "Freshly checked brief";
      return fresh as never;
    }
    return stale as never;
  });
  await act(async () => {
    client.setQueryData(monitorKey, stale);
  });
  expect(await screen.findByRole("heading", { name: "Updated issue title" })).toBeTruthy();
  expect(screen.getByText(original.analysis!.summary)).toBeTruthy();
  expect(screen.getByText(en.opportunities.staleItem)).toBeTruthy();
  expect(screen.getByText(en.opportunities.errors.network)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Copy draft" }) as HTMLButtonElement).disabled).toBe(
    true
  );
  fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
  await screen.findByText("Freshly checked brief");
  expect(screen.queryByText(en.opportunities.staleItem)).toBeNull();
  expect((screen.getByRole("button", { name: "Copy draft" }) as HTMLButtonElement).disabled).toBe(
    false
  );
  expect(client.getQueryData<MonitorSnapshot>(monitorKey)!.items[0].id).toBe(original.id);
});
