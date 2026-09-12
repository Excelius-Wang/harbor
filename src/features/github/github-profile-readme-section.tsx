import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CircleAlert, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { parseIpcError } from "@/lib/ipc-error";
import { openExternalUrl } from "@/lib/window";
import type { GitHubUserProfile } from "./github-data";
import { profileReadmeQueryOptions } from "./github-queries";

const GitHubReadme = lazy(() => import("./github-readme"));

export function GitHubProfileReadmeSection({ profile }: { profile: GitHubUserProfile }) {
  const { t } = useTranslation();
  const result = useQuery(profileReadmeQueryOptions({ username: profile.login }));
  const data = result.data;
  if (result.isPending) return <Skeleton className="h-44 w-full" />;
  // A cached absence is still a valid result and must surface refresh failures.
  if (result.error && data === undefined)
    return (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>{t("workspace.profile.readmeFailed")}</AlertTitle>
        <AlertDescription>{parseIpcError(result.error).message}</AlertDescription>
        <div className="col-start-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </Alert>
    );
  return (
    <>
      {result.error ? (
        <WorkspaceStaleNotice
          message={parseIpcError(result.error).message}
          onRetry={() => void result.refetch()}
        />
      ) : null}
      {data ? (
        <section
          className="harbor-reading min-w-0 overflow-hidden rounded-lg border"
          aria-label={t("workspace.profile.readme")}
        >
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-xs">
            <FileText className="text-muted-foreground size-4" />
            <h2 className="font-medium">{data.readme.name}</h2>
            <Button
              variant="link"
              size="sm"
              className="h-auto min-w-0 p-0 text-left whitespace-normal"
              onClick={() => void openExternalUrl(data.readme.url)}
            >
              <span className="wrap-anywhere">
                {profile.login} / {profile.login}
              </span>
            </Button>
          </div>
          <article className="harbor-markdown mx-auto w-full max-w-[960px] px-5 py-4">
            <Suspense fallback={<Skeleton className="h-32 w-full" />}>
              <GitHubReadme
                content={data.readme.content}
                path={data.readme.path}
                reference={data.reference}
                repository={{
                  owner: profile.login,
                  name: profile.login,
                  defaultBranch: data.reference,
                  url: `${profile.url}/${profile.login}`,
                }}
                onOpenExternal={(url) => void openExternalUrl(url)}
              />
            </Suspense>
          </article>
        </section>
      ) : null}
    </>
  );
}
