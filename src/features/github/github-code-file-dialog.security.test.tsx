// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GitHubRepository } from "./github-data";
import { GitHubCodeFileDialog } from "./github-code-file-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const repository: GitHubRepository = {
  id: 1,
  owner: "harbor-fixture",
  name: "repository",
  fullName: "harbor-fixture/repository",
  url: "https://github.com/harbor-fixture/repository",
  stars: 0,
  forks: 0,
  openIssues: 0,
  defaultBranch: "main",
  isPrivate: false,
  isFork: false,
  isArchived: false,
};

beforeAll(async () => {
  await import("./github-readme");
  class ResizeObserverMock implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => cleanup());

describe("GitHubCodeFileDialog Markdown preview", () => {
  it("keeps a scheme-like file path inside the selected repository", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GitHubCodeFileDialog
          open
          repository={repository}
          branch="main"
          directory=""
          initialPath="README.md"
          initialSha="sha-1"
          initialContent="[Guide](guide.md) ![Diagram](diagram.png)"
          onOpenChange={vi.fn()}
          onCommitted={vi.fn()}
        />
      </QueryClientProvider>
    );

    const path = screen.getByLabelText("workspace.repositories.repositoryFilePath");
    await user.clear(path);
    await user.type(path, "javascript:alert(document.domain)/README.md");
    await user.click(screen.getByRole("tab", { name: "workspace.repositories.preview" }));

    expect((await screen.findByRole("link", { name: "Guide" })).getAttribute("href")).toBe(
      "https://github.com/harbor-fixture/repository/blob/main/javascript%3Aalert(document.domain)/guide.md"
    );
    expect(screen.getByRole("img", { name: "Diagram" }).getAttribute("src")).toBe(
      "https://github.com/harbor-fixture/repository/raw/main/javascript%3Aalert(document.domain)/diagram.png"
    );
  });
});
