// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueStateBadge } from "./github-issue-shared";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe("GitHub Issue state badge", () => {
  it("displays completed, not-planned, and duplicate reasons", () => {
    const { rerender } = render(<GitHubIssueStateBadge state="closed" stateReason="completed" />);
    expect(screen.getByText("workspace.repositories.issueStateReasons.completed")).toBeDefined();

    rerender(<GitHubIssueStateBadge state="closed" stateReason="notPlanned" />);
    expect(screen.getByText("workspace.repositories.issueStateReasons.notPlanned")).toBeDefined();

    rerender(<GitHubIssueStateBadge state="closed" stateReason="duplicate" />);
    expect(screen.getByText("workspace.repositories.issueStateReasons.duplicate")).toBeDefined();
  });

  it("keeps unknown future reasons readable as closed", () => {
    render(<GitHubIssueStateBadge state="closed" stateReason="futureReason" />);
    expect(screen.getByText("workspace.repositories.closed")).toBeDefined();
  });
});
