import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FileCode2, FileWarning } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppTranslation } from "@/hooks/use-app-translation";
import type { GitHubFilePreview } from "./github-data";
import {
  detectSyntaxLanguage,
  highlightSourceCode,
  type HighlightedToken,
} from "./github-syntax-highlighting";

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

function fileExtension(name: string) {
  const segments = name.split(".");
  const extension = name.includes(".") ? segments[segments.length - 1] : null;
  return extension && extension !== name ? extension.toUpperCase() : null;
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

export function GitHubFilePreviewSkeleton() {
  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.075] bg-white/[0.018]">
      <div className="flex h-12 items-center gap-2.5 border-b border-white/[0.065] px-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="ml-auto h-6 w-24" />
      </div>
      <div className="space-y-2.5 px-4 py-5">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-2.5 w-7" />
            <Skeleton className={index % 3 === 0 ? "h-2.5 w-2/3" : "h-2.5 w-1/2"} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function GitHubFilePreviewPanel({
  preview,
  sizeLabel,
  externalUrl,
  onBack,
  onOpenExternal,
}: {
  preview: GitHubFilePreview;
  sizeLabel: string;
  externalUrl: string;
  onBack: () => void;
  onOpenExternal: (url: string) => void;
}) {
  const { t } = useAppTranslation();
  const { theme } = useTheme();
  const syntaxColorMode =
    theme === "light" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches)
      ? "light"
      : "dark";
  const plainLines = useMemo(
    () => (preview.kind === "text" ? plainSourceLines(preview.content) : []),
    [preview]
  );
  const [highlightedLines, setHighlightedLines] = useState<HighlightedToken[][] | null>(null);
  const extension = fileExtension(preview.name);
  const syntaxLanguage = detectSyntaxLanguage(preview.name);

  useEffect(() => {
    setHighlightedLines(null);
    if (preview.kind !== "text" || !preview.content) return;

    let active = true;
    void highlightSourceCode({
      source: preview.content,
      fileName: preview.name,
      colorMode: syntaxColorMode,
      size: preview.size,
    })
      .then((highlighted) => {
        if (active) setHighlightedLines(highlighted?.lines ?? null);
      })
      .catch(() => {
        if (active) setHighlightedLines(null);
      });

    return () => {
      active = false;
    };
  }, [preview, syntaxColorMode]);

  const lines = highlightedLines ?? plainLines;

  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018] shadow-[inset_0_1px_0_rgba(125,211,252,0.08)]">
      <header className="flex min-h-12 flex-wrap items-center gap-2 border-b border-white/[0.07] px-2.5 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace.repositories.backToFiles")}
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.repositories.backToFiles")}</TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileCode2 className="text-primary size-4 shrink-0" />
          <span className="truncate text-xs font-semibold">{preview.name}</span>
          {extension || syntaxLanguage !== "text" ? (
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/[0.045] text-primary h-5 rounded px-1.5 font-mono text-[9px]"
            >
              {syntaxLanguage === "text" ? extension : syntaxLanguage.toUpperCase()}
            </Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground flex items-center gap-2 text-[10px] tabular-nums">
          <span>{sizeLabel}</span>
          {preview.kind === "text" && lines.length ? (
            <span>{t("workspace.repositories.lineCount", { count: lines.length })}</span>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="xs" onClick={() => onOpenExternal(externalUrl)}>
          <ExternalLink data-icon="inline-end" />
          {t("workspace.repositories.openOnGitHub")}
        </Button>
      </header>

      {preview.kind === "unsupported" ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileWarning />
            </EmptyMedia>
            <EmptyTitle>
              {preview.reason === "binary"
                ? t("workspace.repositories.binaryFile")
                : t("workspace.repositories.fileTooLarge")}
            </EmptyTitle>
            <EmptyDescription>
              {preview.reason === "binary"
                ? t("workspace.repositories.binaryFileDescription")
                : t("workspace.repositories.fileTooLargeDescription")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={() => onOpenExternal(externalUrl)}>
              <ExternalLink data-icon="inline-end" />
              {t("workspace.repositories.openOnGitHub")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : lines.length ? (
        <div
          role="table"
          aria-label={t("workspace.repositories.fileSource", { name: preview.name })}
          className="overflow-x-auto py-2 font-mono text-xs leading-5"
        >
          {lines.map((tokens, index) => (
            <div
              key={index}
              role="row"
              className="hover:bg-primary/[0.025] grid min-w-max grid-cols-[3.75rem_minmax(max-content,1fr)]"
            >
              <span
                role="rowheader"
                className="text-muted-foreground/55 border-r border-white/[0.045] pr-3 text-right tabular-nums select-none"
              >
                {index + 1}
              </span>
              <code role="cell" className="px-4 whitespace-pre [tab-size:2]">
                {tokens.length
                  ? tokens.map((token, tokenIndex) => (
                      <span key={tokenIndex} style={tokenStyle(token)}>
                        {token.content}
                      </span>
                    ))
                  : " "}
              </code>
            </div>
          ))}
        </div>
      ) : (
        <Empty className="min-h-56">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode2 />
            </EmptyMedia>
            <EmptyTitle>{t("workspace.repositories.emptyFile")}</EmptyTitle>
            <EmptyDescription>{t("workspace.repositories.emptyFileDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
