// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";
import { ActivityRow } from "./github-profile-view";
import type { GitHubProfileActivity } from "./github-data";
const i18n = createInstance();
beforeAll(async () => {
  await i18n.init({
    lng: "zh",
    resources: { zh: { translation: zh }, en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("zh");
});
const base: GitHubProfileActivity = {
  id: "1",
  repository: "Excelius-Wang/harbor",
  eventType: "PullRequestEvent",
  action: "merged",
  resourceNumber: 95,
  resourceTitle: "fix: retain workspace context",
  createdAt: "2026-09-10T00:00:00Z",
};
function mount(activity = base) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ActivityRow activity={activity} locale={i18n.language} profileLogin="Excelius-Wang" />
    </I18nextProvider>
  );
}
it("separates repository/action/number from the full title without repeating the owner", () => {
  const { container } = mount();
  expect(screen.getByText("harbor").tagName).toBe("STRONG");
  expect(container.querySelector("p")?.textContent).toBe("harbor 合并了拉取请求 #95");
  expect(screen.getByText(base.resourceTitle!).tagName).toBe("P");
  expect(container.querySelector("time")?.getAttribute("datetime")).toBe(base.createdAt);
});
it("keeps other owners and long reference names", () => {
  const reference = "fix/" + "long-reference-".repeat(15);
  const { container } = mount({
    ...base,
    repository: "modelscope/ms-swift",
    eventType: "CreateEvent",
    reference,
    resourceTitle: undefined,
    resourceNumber: undefined,
  });
  expect(screen.getByText("modelscope/ms-swift")).toBeTruthy();
  expect(screen.getByText(reference)).toBeTruthy();
  expect(container.textContent).not.toContain("undefined");
});
it("preserves comment action and does not fabricate a missing issue number", () => {
  const { container } = mount({
    ...base,
    eventType: "IssueCommentEvent",
    action: "edited",
    resourceNumber: undefined,
  });
  expect(container.querySelector("p")?.textContent).toContain("编辑了 Issue");
  expect(container.querySelector("p")?.textContent).not.toContain("#");
});

it("distinguishes repository creation from branch/tag creation", () => {
  const { container } = mount({
    ...base,
    eventType: "CreateEvent",
    reference: undefined,
    resourceNumber: undefined,
    resourceTitle: undefined,
  });
  expect(container.querySelector("p")?.textContent).toBe("harbor 创建了仓库");
});

it("uses sentence-case actions after the repository in English", async () => {
  await i18n.changeLanguage("en");
  const { container } = mount({ ...base, action: "opened" });
  expect(container.querySelector("p")?.textContent).toBe("harbor opened pull request #95");
  expect(i18n.t("workspace.profile.actions.opened")).toBe("Opened");
  expect(i18n.t("workspace.profile.actions.merged")).toBe("Merged");
});
