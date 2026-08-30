// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueStateAction } from "./github-issue-state-action";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe("GitHub Issue state action", () => {
  it("lets the user close an open Issue as not planned", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<GitHubIssueStateAction state="open" pending={false} onChange={onChange} />);

    await user.click(
      screen.getByRole("button", { name: "workspace.repositories.chooseIssueCloseReason" })
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    );
    expect(onChange).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: "workspace.repositories.closeIssueAsNotPlanned",
      })
    );

    expect(onChange).toHaveBeenCalledWith({
      desiredState: "closed",
      closeReason: "notPlanned",
    });
  });

  it("reopens a closed Issue without a close reason", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<GitHubIssueStateAction state="closed" pending={false} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "workspace.repositories.reopenIssue" }));

    expect(onChange).toHaveBeenCalledWith({
      desiredState: "open",
      closeReason: null,
    });
  });
});
