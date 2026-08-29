import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import type { GitHubPullRequestReview } from "./github-data";
import {
  GitHubPullRequestReviewDismissalDialog,
  GitHubPullRequestReviewDismissalMenu,
  canDismissPullRequestReview,
} from "./github-pull-request-review-dismissal";

vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const review: GitHubPullRequestReview = {
  id: 86,
  nodeId: "PRR_86",
  author: "hubot",
  state: "approved",
  body: "Looks good.",
  url: "https://github.com/octocat/hello-world/pull/12#pullrequestreview-86",
};

describe("pull request review dismissal", () => {
  it("allows only approved and changes-requested reviews", () => {
    expect(canDismissPullRequestReview("approved")).toBe(true);
    expect(canDismissPullRequestReview("changesRequested")).toBe(true);
    expect(canDismissPullRequestReview("commented")).toBe(false);
    expect(canDismissPullRequestReview("pending")).toBe(false);
    expect(canDismissPullRequestReview("dismissed")).toBe(false);
  });

  it("renders an accessible action only for eligible reviews", () => {
    const eligible = renderToStaticMarkup(
      <GitHubPullRequestReviewDismissalMenu review={review} onSelect={vi.fn()} />
    );
    const ineligible = renderToStaticMarkup(
      <GitHubPullRequestReviewDismissalMenu
        review={{ ...review, state: "commented" }}
        onSelect={vi.fn()}
      />
    );

    expect(eligible).toContain('aria-label="workspace.repositories.reviewMenu"');
    expect(ineligible).toBe("");
  });

  it("keeps English and Chinese menu, reason, and error copy accessible", () => {
    expect(en.workspace.repositories.reviewMenu).toBe("Review actions");
    expect(en.workspace.repositories.dismissReviewReason).toBe("Dismissal reason");
    expect(en.workspace.repositories.dismissReviewFailed).toContain("could not dismiss");
    expect(zh.workspace.repositories.reviewMenu).toBe("评审操作");
    expect(zh.workspace.repositories.dismissReviewReason).toBe("驳回原因");
    expect(zh.workspace.repositories.dismissReviewFailed).toContain("没有驳回成功");
  });

  it("requires a reason and exposes pending and error states", () => {
    const empty = renderToStaticMarkup(
      <GitHubPullRequestReviewDismissalDialog
        open
        review={review}
        message=""
        pending={false}
        error={null}
        onMessageChange={vi.fn()}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />
    );
    const pending = renderToStaticMarkup(
      <GitHubPullRequestReviewDismissalDialog
        open
        review={review}
        message="Outdated approval"
        pending
        error="GitHub denied dismissal"
        onMessageChange={vi.fn()}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />
    );

    expect(empty).toContain("required");
    expect(empty).toContain("disabled");
    expect(pending).toContain("GitHub denied dismissal");
    expect(pending).toContain("workspace.repositories.dismissingReview");
  });
});
