import { describe, expect, it } from "vitest";
import { detectSyntaxLanguage, highlightSourceCode } from "./github-syntax-highlighting";
import { highlightWithShiki } from "./github-shiki-runtime";

describe("GitHub syntax highlighting", () => {
  it("detects common source languages and falls back to plain text", () => {
    expect(detectSyntaxLanguage("component.tsx")).toBe("tsx");
    expect(detectSyntaxLanguage("Cargo.toml")).toBe("toml");
    expect(detectSyntaxLanguage("Dockerfile")).toBe("dockerfile");
    expect(detectSyntaxLanguage("script.py")).toBe("python");
    expect(detectSyntaxLanguage("NOTICE.unknown")).toBe("text");
  });

  it("covers Harbor's common repository file types", () => {
    expect(detectSyntaxLanguage("src/lib.rs")).toBe("rust");
    expect(detectSyntaxLanguage("cmd/harbor/main.go")).toBe("go");
    expect(detectSyntaxLanguage("package.json")).toBe("json");
    expect(detectSyntaxLanguage("README.md")).toBe("markdown");
    expect(detectSyntaxLanguage("styles/app.scss")).toBe("scss");
    expect(detectSyntaxLanguage("scripts/release.sh")).toBe("shellscript");
    expect(detectSyntaxLanguage("schema.yml")).toBe("yaml");
    expect(detectSyntaxLanguage("src/native.cpp")).toBe("cpp");
    expect(detectSyntaxLanguage("Makefile")).toBe("make");
    expect(detectSyntaxLanguage("CMakeLists.txt")).toBe("cmake");
  });

  it.each(["dark", "light"] as const)(
    "returns %s theme tokens without changing the source text",
    async (colorMode) => {
      const source = "const answer: number = 42;\n";

      const lines = await highlightWithShiki({
        source,
        language: "typescript",
        colorMode,
      });

      expect(lines).toHaveLength(1);
      expect(lines[0].map((token) => token.content).join("")).toBe("const answer: number = 42;");
      expect(lines[0].some((token) => token.color?.startsWith("#"))).toBe(true);
    }
  );

  it("keeps unknown and expensive source files on the plain-text path", async () => {
    await expect(
      highlightSourceCode({
        source: "Harbor notice",
        fileName: "NOTICE.unknown",
        colorMode: "dark",
        size: 13,
      })
    ).resolves.toBeNull();
    await expect(
      highlightSourceCode({
        source: "fn main() {}",
        fileName: "main.rs",
        colorMode: "dark",
        size: 500_001,
      })
    ).resolves.toBeNull();
  });
});
