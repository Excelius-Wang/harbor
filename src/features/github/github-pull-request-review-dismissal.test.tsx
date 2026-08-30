import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import type { GitHubPullRequestReview } from "./github-data";
import { GitHubIssueTimeline, pullRequestReviewFromTimelineItem } from "./github-issue-timeline";
import {
  GitHubPullRequestReviewDismissalDialog,
  GitHubPullRequestReviewDismissalMenu,
  canDismissPullRequestReview,
} from "./github-pull-request-review-dismissal";

vi.mock("@/hooks/use-app-translation", () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => children,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
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
    expect(eligible).toContain(">workspace.repositories.reviewMenu<");
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

  it("keeps the numeric review identity on eligible timeline cards", () => {
    expect(
      pullRequestReviewFromTimelineItem({
        id: "PRR_86",
        reviewId: 86,
        kind: "event",
        event: "reviewed",
        actor: "hubot",
        actorAvatarUrl: "https://github.com/hubot.png",
        body: "Looks good.",
        url: review.url,
        createdAt: "2026-08-26T12:00:00Z",
        viewerCanUpdate: false,
        viewerCanDelete: false,
        isMinimized: false,
        reviewState: "approved",
      })
    ).toEqual({
      id: 86,
      nodeId: "PRR_86",
      author: "hubot",
      authorAvatarUrl: "https://github.com/hubot.png",
      body: "Looks good.",
      url: review.url,
      submittedAt: "2026-08-26T12:00:00Z",
      state: "approved",
    });
  });

  it("places the eligible action on a pull request timeline review", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const markup = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <GitHubIssueTimeline
          issue={{
            author: "octocat",
            createdAt: "2026-08-26T10:00:00Z",
          }}
          timeline={[
            {
              id: "PRR_86",
              reviewId: 86,
              kind: "event",
              event: "reviewed",
              actor: "hubot",
              url: review.url,
              createdAt: "2026-08-26T12:00:00Z",
              viewerCanUpdate: false,
              viewerCanDelete: false,
              isMinimized: false,
              reviewState: "approved",
            },
          ]}
          repository={{
            owner: "octocat",
            name: "hello-world",
            defaultBranch: "main",
            url: "https://github.com/octocat/hello-world",
          }}
          locale="en"
          page={1}
          hasPrevious={false}
          hasMore={false}
          onPageChange={vi.fn()}
          commentTarget={{
            kind: "pullRequest",
            owner: "octocat",
            repository: "hello-world",
            pullRequestNumber: 12,
          }}
        />
      </QueryClientProvider>
    );

    expect(markup).toContain('aria-label="workspace.repositories.reviewMenu"');
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
