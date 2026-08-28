import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { highlightSourceCode, type HighlightedToken } from "./github-syntax-highlighting";

const SHIKI_FONT_STYLE_ITALIC = 1;
const SHIKI_FONT_STYLE_BOLD = 2;
const SHIKI_FONT_STYLE_UNDERLINE = 4;
const SHIKI_FONT_STYLE_STRIKETHROUGH = 8;

function plainSourceLines(content: string): HighlightedToken[][] {
  if (!content) return [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => [{ content: line }]);
}

function tokenStyle(token: HighlightedToken): CSSProperties {
  const fontStyle = token.fontStyle && token.fontStyle > 0 ? token.fontStyle : 0;
  const textDecoration = [
    fontStyle & SHIKI_FONT_STYLE_UNDERLINE ? "underline" : null,
    fontStyle & SHIKI_FONT_STYLE_STRIKETHROUGH ? "line-through" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    color: token.color,
    fontStyle: fontStyle & SHIKI_FONT_STYLE_ITALIC ? "italic" : undefined,
    fontWeight: fontStyle & SHIKI_FONT_STYLE_BOLD ? 600 : undefined,
    textDecorationLine: textDecoration || undefined,
  };
}

export function useGitHubSourceLines({
  content,
  fileName,
  size,
}: {
  content: string;
  fileName: string;
  size: number;
}) {
  const { theme } = useTheme();
  const syntaxColorMode =
    theme === "light" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches)
      ? "light"
      : "dark";
  const plainLines = useMemo(() => plainSourceLines(content), [content]);
  const [highlightedLines, setHighlightedLines] = useState<HighlightedToken[][] | null>(null);

  useEffect(() => {
    setHighlightedLines(null);
    if (!content) return;

    let active = true;
    void highlightSourceCode({ source: content, fileName, colorMode: syntaxColorMode, size })
      .then((highlighted) => {
        if (active) setHighlightedLines(highlighted?.lines ?? null);
      })
      .catch(() => {
        if (active) setHighlightedLines(null);
      });

    return () => {
      active = false;
    };
  }, [content, fileName, size, syntaxColorMode]);

  return highlightedLines ?? plainLines;
}

export function GitHubSourceTokens({ tokens }: { tokens: HighlightedToken[] }) {
  return tokens.length
    ? tokens.map((token, tokenIndex) => (
        <span key={tokenIndex} style={tokenStyle(token)}>
          {token.content}
        </span>
      ))
    : " ";
}
