import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/window";
import type { GitHubRepositoryContentContext } from "./github-data";

const GitHubReadme = lazy(() => import("./github-readme"));

export function GitHubMarkdownEditor({
  id,
  name,
  value,
  repository,
  reference,
  relativeBaseUrl,
  placeholder,
  disabled,
  invalid = false,
  minHeightClassName = "min-h-56",
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  repository: GitHubRepositoryContentContext;
  reference: string;
  relativeBaseUrl?: string;
  placeholder: string;
  disabled: boolean;
  invalid?: boolean;
  minHeightClassName?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("write");
  const previousValue = useRef(value);

  useEffect(() => {
    if (previousValue.current && !value) setMode("write");
    previousValue.current = value;
  }, [value]);

  return (
    <Tabs value={mode} onValueChange={setMode} className="min-w-0 gap-2">
      <TabsList variant="line" className="h-8 justify-start rounded-none p-0">
        <TabsTrigger value="write" className="px-2 text-xs" disabled={disabled}>
          {t("workspace.repositories.write")}
        </TabsTrigger>
        <TabsTrigger value="preview" className="px-2 text-xs" disabled={disabled}>
          {t("workspace.repositories.preview")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="write" className="min-w-0">
        <Textarea
          id={id}
          name={name}
          value={value}
          disabled={disabled}
          aria-invalid={invalid}
          placeholder={placeholder}
          className={cn(
            "bg-background/40 max-h-[45vh] resize-y text-[12px] leading-5",
            minHeightClassName
          )}
          onChange={(event) => onChange(event.target.value)}
        />
      </TabsContent>
      <TabsContent value="preview" className="min-w-0">
        <div
          className={cn(
            "harbor-markdown bg-background/40 max-h-[45vh] overflow-auto rounded-md border p-3 text-[12px]",
            minHeightClassName
          )}
          role="region"
          aria-label={t("workspace.repositories.preview")}
        >
          {value ? (
            <Suspense fallback={<Skeleton className="h-20 w-full" />}>
              <GitHubReadme
                content={value}
                path=""
                reference={reference}
                repository={repository}
                relativeBaseUrl={relativeBaseUrl}
                onOpenExternal={(url) => void openExternalUrl(url)}
              />
            </Suspense>
          ) : (
            <p className="text-muted-foreground">{t("workspace.repositories.issuePreviewEmpty")}</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
