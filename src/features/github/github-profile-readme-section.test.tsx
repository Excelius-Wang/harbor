// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, expect, it, vi } from "vitest";
import type { GitHubUserProfile } from "./github-data";
import { GitHubProfileReadmeSection } from "./github-profile-readme-section";
import { profileReadmeQueryOptions } from "./github-queries";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const profile = { login: "octocat", url: "https://github.com/octocat" } as GitHubUserProfile;
const data = {
  reference: "custom/branch",
  readme: {
    name: "README.md",
    path: "README.md",
    url: "https://github.com/octocat/octocat",
    content:
      "# Hello\n\n" +
      "Long introduction.\n\n".repeat(30) +
      "Final paragraph.\n\n![Example](./image.png)",
  },
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <GitHubProfileReadmeSection profile={profile} />
    </QueryClientProvider>
  );
  return { client, ...result };
}
it("renders the entire README without a disclosure and resolves branch-relative images", async () => {
  vi.mocked(invoke).mockResolvedValue(data);
  mount();
  await screen.findByText("Final paragraph.");
  expect(screen.queryByRole("button", { name: /expand/i })).toBeNull();
  expect(screen.getByAltText("Example").getAttribute("src")).toBe(
    "https://github.com/octocat/octocat/raw/custom%2Fbranch/image.png"
  );
  expect(invoke).toHaveBeenCalledWith("github_get_profile_readme", { username: "octocat" });
});
it("omits a missing README without presenting an error", async () => {
  vi.mocked(invoke).mockResolvedValue(null);
  const { container, client } = mount();
  await waitFor(() =>
    expect(
      client.getQueryData(profileReadmeQueryOptions({ username: "octocat" }).queryKey)
    ).toBeNull()
  );
  expect(container.querySelector("section")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("retries a failed read without affecting the profile", async () => {
  vi.mocked(invoke)
    .mockRejectedValueOnce({ code: "github", message: "Temporary failure" })
    .mockResolvedValue(data);
  mount();
  await screen.findByText("Temporary failure");
  fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
  await screen.findByText("Final paragraph.");
});
it("retains existing content and exposes a failed refresh", async () => {
  vi.mocked(invoke).mockResolvedValue(data);
  const { client } = mount();
  await screen.findByText("Final paragraph.");
  vi.mocked(invoke).mockRejectedValue({ code: "github", message: "Refresh failed" });
  await act(async () => {
    await client.invalidateQueries({
      queryKey: profileReadmeQueryOptions({ username: "octocat" }).queryKey,
    });
  });
  await screen.findByText("Refresh failed");
  expect(screen.getByText("Final paragraph.")).toBeTruthy();
});
