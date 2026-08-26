import { renderToStaticMarkup } from "react-dom/server";
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

describe("GitHubReadme", () => {
  it("renders common GitHub HTML safely and resolves relative assets", () => {
    const html = renderToStaticMarkup(
      <GitHubReadme
        content={`
<p align="center">
  <img src="./assets/logo.svg" alt="Fixture logo" width="376" onerror="alert('xss')">
</p>
<div align="center"><a href="./docs/guide.md">Guide</a></div>
<a href="javascript:alert('xss')">Unsafe link</a>
<script>window.compromised = true</script>
        `}
        path="README.md"
        reference="main"
        repository={repository}
        onOpenExternal={vi.fn()}
      />
    );

    expect(html).toContain('<p align="center">');
    expect(html).toContain(
      'src="https://github.com/harbor-fixture/repository/raw/main/assets/logo.svg"'
    );
    expect(html).toContain(
      'href="https://github.com/harbor-fixture/repository/blob/main/docs/guide.md"'
    );
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("window.compromised");
  });
});
