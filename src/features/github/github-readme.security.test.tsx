// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GitHubRepository } from "./github-data";
import { GitHubReadme } from "./github-readme";

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

describe("GitHubReadme URL boundaries", () => {
  it("ignores an unsafe configured base before rendering relative links and images", () => {
    const onOpenExternal = vi.fn();
    const view = render(
      <GitHubReadme
        content="[Guide](guide.md) ![Diagram](diagram.png)"
        path="README.md"
        reference="main"
        repository={repository}
        relativeBaseUrl="javascript:alert(document.domain)"
        onOpenExternal={onOpenExternal}
      />
    );

    const link = view.getByRole("link", { name: "Guide" });
    const image = view.getByRole("img", { name: "Diagram" });
    expect(link.getAttribute("href")).toBe(
      "https://github.com/harbor-fixture/repository/blob/main/guide.md"
    );
    expect(image.getAttribute("src")).toBe(
      "https://github.com/harbor-fixture/repository/raw/main/diagram.png"
    );

    fireEvent.click(link);
    expect(onOpenExternal).toHaveBeenCalledWith(
      "https://github.com/harbor-fixture/repository/blob/main/guide.md"
    );
  });
});
