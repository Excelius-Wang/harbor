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
  <img src="https://example.com/badge.png" alt="Fixture badge" style="height:20px;position:fixed">
  <img src="https://example.com/oversized.png" alt="Oversized image" height="99999">
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
    expect(html).toMatch(/<img[^>]+alt="Fixture logo"[^>]+width="376"/);
    expect(html).toMatch(/<img[^>]+alt="Fixture badge"[^>]+height="20"/);
    expect(html).toMatch(/<img[^>]+alt="Fixture badge"[^>]+style="height:20px"/);
    expect(html.match(/<img[^>]+alt="Oversized image"[^>]*>/)?.[0]).not.toContain("height=");
    expect(html).toContain(
      'href="https://github.com/harbor-fixture/repository/blob/main/docs/guide.md"'
    );
    expect(html).not.toContain("position:fixed");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("window.compromised");
  });
});
