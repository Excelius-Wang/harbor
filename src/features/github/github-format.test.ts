import { describe, expect, it } from "vitest";
import { formatBytes } from "./github-format";

describe("GitHub data formatting", () => {
  it("formats repository files and workflow artifacts with shared decimal units", () => {
    expect(formatBytes(999, "en-US")).toBe("999 B");
    expect(formatBytes(1_250, "en-US")).toBe("1.3 KB");
    expect(formatBytes(1_250_000, "en-US")).toBe("1.3 MB");
    expect(formatBytes(2_500_000_000, "en-US")).toBe("2.5 GB");
  });
});
