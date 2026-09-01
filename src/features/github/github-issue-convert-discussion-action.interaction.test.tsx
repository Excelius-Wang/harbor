// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "@/lib/window";
import { GitHubIssueConvertDiscussionAction } from "./github-issue-convert-discussion-action";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/window", () => ({ openExternalUrl: vi.fn() }));

const issueUrl = "https://github.com/octocat/hello-world/issues/7";

beforeEach(() => vi.mocked(openExternalUrl).mockReset());
afterEach(() => cleanup());

describe("GitHub Issue discussion conversion fallback", () => {
  it("opens the exact Issue on GitHub after explaining the web fallback", async () => {
    const user = userEvent.setup();
    render(<GitHubIssueConvertDiscussionAction issueUrl={issueUrl} />);

    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.convertIssueToDiscussion",
      })
    );
    expect(
      screen.getByText("workspace.repositories.convertIssueToDiscussionDescription")
    ).toBeDefined();

    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.openIssueOnGitHubForConversion",
      })
    );
    expect(openExternalUrl).toHaveBeenCalledWith(issueUrl);
  });
});
