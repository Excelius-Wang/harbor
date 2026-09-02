import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Save, Tags } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubRepository } from "./github-data";
import { githubQueryKeys, personalRepositoryTopicsQueryOptions } from "./github-queries";
import {
  parseRepositoryTopics,
  updatePersonalRepositoryTopics,
  type GitHubRepositoryTopicsTarget,
} from "./github-repository-topics-logic";

function formatTopics(names: string[]) {
  return names.join(", ");
}

function sameTopics(left: string[], right: string[]) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

export function GitHubRepositoryTopicsCard({ repository }: { repository: GitHubRepository }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const target: GitHubRepositoryTopicsTarget = {
    owner: repository.owner,
    repository: repository.name,
  };
  const result = useQuery(personalRepositoryTopicsQueryOptions(target));
  const [draft, setDraft] = useState<string | null>(null);
  const editBaselineRef = useRef<string[] | null>(null);
  const value = draft ?? (result.data ? formatTopics(result.data.names) : "");
  const parsed = parseRepositoryTopics(value);
  const currentNames = result.data?.names ?? [];
  const canSave =
    !repository.isArchived &&
    parsed.names !== null &&
    !sameTopics(parsed.names, currentNames) &&
    !result.isPending;

  useEffect(() => {
    setDraft(null);
    editBaselineRef.current = null;
  }, [repository.id]);

  useEffect(() => {
    if (draft === null && result.data) {
      editBaselineRef.current = [...result.data.names];
    }
  }, [draft, result.data]);

  const mutation = useMutation({
    mutationFn: () =>
      updatePersonalRepositoryTopics(target, {
        names: parsed.names ?? [],
        expectedNames: editBaselineRef.current ?? currentNames,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(personalRepositoryTopicsQueryOptions(target).queryKey, next);
      editBaselineRef.current = [...next.names];
      setDraft(formatTopics(next.names));
      toast.success(t("workspace.repositories.settings.topicsSaved"));
    },
    onError: (error) => {
      const parsedError = parseIpcError(error);
      void queryClient.invalidateQueries({ queryKey: githubQueryKeys.repositoryTopics(target) });
      toast.error(t("workspace.repositories.settings.topicsSaveFailed"), {
        description:
          parsedError.code === "githubPermission"
            ? t("workspace.repositories.settings.topicsPermissionDenied")
            : parsedError.code === "githubRepositoryTopicsConflict"
              ? t("workspace.repositories.settings.topicsSaveUncertain")
              : parsedError.message,
      });
    },
  });

  if (result.isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!result.data) {
    const error = result.error ? parseIpcError(result.error) : null;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags /> {t("workspace.repositories.settings.topics")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.settings.topicsLoadFailed")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{error?.message}</span>
              <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
                {t("common.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const validationMessage = parsed.error
    ? t(`workspace.repositories.settings.topicValidation.${parsed.error}`)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags /> {t("workspace.repositories.settings.topics")}
        </CardTitle>
        <CardDescription>{t("workspace.repositories.settings.topicsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {result.error ? (
          <Alert variant="destructive" className="mb-4">
            <CircleAlert />
            <AlertTitle>{t("workspace.repositories.settings.topicsLoadFailed")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
              <span>{parseIpcError(result.error).message}</span>
              <Button variant="outline" size="sm" onClick={() => void result.refetch()}>
                {t("common.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) mutation.mutate();
          }}
        >
          <Field data-invalid={Boolean(validationMessage) || undefined}>
            <FieldLabel htmlFor="repository-settings-topics">
              {t("workspace.repositories.settings.topicList")}
            </FieldLabel>
            <Textarea
              id="repository-settings-topics"
              value={value}
              rows={3}
              disabled={repository.isArchived || mutation.isPending}
              aria-invalid={Boolean(validationMessage) || undefined}
              placeholder={t("workspace.repositories.settings.topicPlaceholder")}
              onChange={(event) => {
                if (draft === null) {
                  editBaselineRef.current = [...currentNames];
                }
                setDraft(event.currentTarget.value);
              }}
            />
            <FieldDescription>
              {validationMessage ?? t("workspace.repositories.settings.topicListDescription")}
            </FieldDescription>
          </Field>
          <Alert>
            <Tags />
            <AlertDescription>
              {t("workspace.repositories.settings.topicsPublicNotice")}
            </AlertDescription>
          </Alert>
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSave || mutation.isPending}>
              {mutation.isPending ? <Spinner /> : <Save />}
              {t("workspace.repositories.settings.saveTopics")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
