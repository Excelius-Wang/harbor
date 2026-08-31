// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => cleanup());

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

  it("does not leak private Wiki credentials through relative image URLs", () => {
    const html = renderToStaticMarkup(
      <GitHubReadme
        content={
          "![Private diagram](assets/private.png) ![Public badge](https://example.com/badge.png)"
        }
        path="Home.md"
        reference={"a".repeat(40)}
        repository={repository}
        relativeBaseUrl="https://github.com/harbor-fixture/repository/wiki"
        relativeImageBaseUrl="https://raw.githubusercontent.com/wiki/harbor-fixture/repository"
        disableRelativeImages
        onOpenExternal={vi.fn()}
      />
    );

    expect(html).toContain("Private diagram");
    expect(html).not.toContain("assets/private.png");
    expect(html).not.toContain("raw.githubusercontent.com/wiki");
    expect(html).toContain('src="https://example.com/badge.png"');
  });

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

  it("rejects credential-bearing bases and preserves trusted Wiki bases", () => {
    const unsafe = render(
      <GitHubReadme
        content="[Guide](Guide) ![Diagram](diagram.png)"
        path="Home.md"
        reference="main"
        repository={repository}
        relativeBaseUrl="https://token@github.com/harbor-fixture/repository/wiki"
        relativeImageBaseUrl="https://token@raw.githubusercontent.com/wiki/harbor-fixture/repository"
        onOpenExternal={vi.fn()}
      />
    );
    expect(unsafe.getByRole("link", { name: "Guide" }).getAttribute("href")).toBe(
      "https://github.com/harbor-fixture/repository/blob/main/Guide"
    );
    expect(unsafe.getByRole("img", { name: "Diagram" }).getAttribute("src")).toBe(
      "https://github.com/harbor-fixture/repository/raw/main/diagram.png"
    );
    unsafe.unmount();

    const trusted = render(
      <GitHubReadme
        content="[Guide](Guide) ![Diagram](diagram.png)"
        path="Home.md"
        reference="main"
        repository={repository}
        relativeBaseUrl="https://github.com/harbor-fixture/repository/wiki/?view=preview#readme"
        relativeImageBaseUrl="https://raw.githubusercontent.com/wiki/harbor-fixture/repository/?view=preview#readme"
        onOpenExternal={vi.fn()}
      />
    );
    expect(trusted.getByRole("link", { name: "Guide" }).getAttribute("href")).toBe(
      "https://github.com/harbor-fixture/repository/wiki/Guide"
    );
    expect(trusted.getByRole("img", { name: "Diagram" }).getAttribute("src")).toBe(
      "https://raw.githubusercontent.com/wiki/harbor-fixture/repository/diagram.png"
    );
    trusted.unmount();

    const trustedGist = render(
      <GitHubReadme
        content="[Guide](Guide) ![Diagram](diagram.png)"
        path="README.md"
        reference="gist-id"
        repository={repository}
        relativeBaseUrl="https://gist.githubusercontent.com/harbor-fixture/gist-id/raw/revision/"
        onOpenExternal={vi.fn()}
      />
    );
    expect(trustedGist.getByRole("link", { name: "Guide" }).getAttribute("href")).toBe(
      "https://gist.githubusercontent.com/harbor-fixture/gist-id/raw/revision/Guide"
    );
    expect(trustedGist.getByRole("img", { name: "Diagram" }).getAttribute("src")).toBe(
      "https://gist.githubusercontent.com/harbor-fixture/gist-id/raw/revision/diagram.png"
    );
  });
});
