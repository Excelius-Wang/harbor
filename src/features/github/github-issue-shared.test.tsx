// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueStateBadge } from "./github-issue-shared";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";

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

  it("ships complete English and Simplified Chinese close-reason copy", () => {
    expect(en.workspace.repositories.issueStateReasons).toEqual({
      completed: "Closed as completed",
      notPlanned: "Closed as not planned",
      duplicate: "Closed as duplicate",
    });
    expect(zh.workspace.repositories.issueStateReasons).toEqual({
      completed: "已按完成关闭",
      notPlanned: "已按不计划处理关闭",
      duplicate: "已按重复 Issue 关闭",
    });
    expect(en.workspace.repositories.closeIssueCompletedDescription).toBeTruthy();
    expect(zh.workspace.repositories.closeIssueNotPlannedDescription).toBeTruthy();
  });
});
