import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("project metadata", () => {
  it("keeps Harbor under its approved copyleft license and canonical source", () => {
    expect(packageJson.license).toBe("AGPL-3.0-only");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/Excelius-Wang/harbor.git",
    });
    expect(packageJson.author).toBe("Excelius-Wang");
  });
});
