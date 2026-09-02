import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseRepositoryTopics,
  updatePersonalRepositoryTopics,
} from "./github-repository-topics-logic";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("repository topics", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("normalizes GitHub topic syntax and rejects unsafe lists", () => {
    expect(parseRepositoryTopics(" Rust,tauri\n desktop-app ")).toEqual({
      names: ["rust", "tauri", "desktop-app"],
      error: null,
    });
    expect(parseRepositoryTopics("desktop_app").error).toBe("invalid");
    expect(parseRepositoryTopics("rust,RUST").error).toBe("duplicate");
    expect(
      parseRepositoryTopics(Array.from({ length: 21 }, (_, i) => `topic-${i}`).join(",")).error
    ).toBe("tooMany");
  });

  it("uses an owner-scoped command with an expected snapshot", async () => {
    vi.mocked(invoke).mockResolvedValue({ names: ["rust"] });
    await updatePersonalRepositoryTopics(
      { owner: "octocat", repository: "harbor" },
      { names: ["rust"], expectedNames: ["old"] }
    );
    expect(invoke).toHaveBeenCalledWith("github_update_personal_repository_topics", {
      owner: "octocat",
      repository: "harbor",
      mutation: { names: ["rust"], expectedNames: ["old"] },
    });
  });
});
