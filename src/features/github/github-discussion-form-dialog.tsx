import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseIpcError } from "@/lib/ipc-error";
import type {
  GitHubDiscussionCategory,
  GitHubDiscussionSummary,
  GitHubRepositoryContentContext,
} from "./github-data";
import {
  createRepositoryDiscussion,
  invalidateRepositoryDiscussion,
  invalidateRepositoryDiscussions,
  syncCreatedDiscussion,
  syncUpdatedDiscussion,
  updateRepositoryDiscussion,
} from "./github-discussion-mutations";
import { GitHubTitleBodyForm, type GitHubIssueFormValue } from "./github-issue-form";

export function GitHubDiscussionFormDialog({
  repository,
  categories,
  discussion,
  open,
  onOpenChange,
  onCreated,
}: {
  repository: GitHubRepositoryContentContext;
  categories: GitHubDiscussionCategory[];
  discussion?: GitHubDiscussionSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (discussion: GitHubDiscussionSummary) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState(discussion?.category.id ?? categories[0]?.id ?? "");
  const target = { owner: repository.owner, repository: repository.name };
  const mutation = useMutation({
    mutationFn: ({ title, body }: GitHubIssueFormValue) => {
      const content = { categoryId, title, body };
      return discussion
        ? updateRepositoryDiscussion({ ...target, discussionNumber: discussion.number }, content)
        : createRepositoryDiscussion(target, content);
    },
    onSuccess: (updatedDiscussion) => {
      if (discussion) {
        syncUpdatedDiscussion(
          queryClient,
          { ...target, discussionNumber: discussion.number },
          updatedDiscussion
        );
        void invalidateRepositoryDiscussion(queryClient, {
          ...target,
          discussionNumber: discussion.number,
        });
      } else {
        syncCreatedDiscussion(queryClient, target, updatedDiscussion);
        onCreated?.(updatedDiscussion);
        void invalidateRepositoryDiscussions(queryClient, target);
      }
      toast.success(
        t(
          discussion
            ? "workspace.repositories.discussionUpdated"
            : "workspace.repositories.discussionCreated"
        )
      );
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setCategoryId(discussion?.category.id ?? categories[0]?.id ?? "");
      mutation.reset();
    }
  }, [categories, discussion?.category.id, open]);

  const error = mutation.error ? parseIpcError(mutation.error) : null;
  const setOpen = (nextOpen: boolean) => {
    if (mutation.isPending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>
            {t(
              discussion
                ? "workspace.repositories.editDiscussion"
                : "workspace.repositories.newDiscussion"
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              discussion
                ? "workspace.repositories.editDiscussionDescription"
                : "workspace.repositories.newDiscussionDescription",
              { repository: `${repository.owner}/${repository.name}`, number: discussion?.number }
            )}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <GitHubTitleBodyForm
            repository={repository}
            reference={repository.defaultBranch}
            idPrefix={
              discussion ? `github-edit-discussion-${discussion.number}` : "github-new-discussion"
            }
            initialValue={{ title: discussion?.title ?? "", body: discussion?.body ?? "" }}
            copy={{
              titleLabel: t("workspace.repositories.discussionTitle"),
              titlePlaceholder: t("workspace.repositories.discussionTitlePlaceholder"),
              titleRequired: t("workspace.repositories.discussionTitleRequired"),
              bodyLabel: t("workspace.repositories.discussionBody"),
              bodyPlaceholder: t("workspace.repositories.discussionBodyPlaceholder"),
            }}
            submitLabel={t(
              discussion
                ? "workspace.repositories.saveChanges"
                : "workspace.repositories.createDiscussion"
            )}
            pendingLabel={t(
              discussion
                ? "workspace.repositories.savingChanges"
                : "workspace.repositories.creatingDiscussion"
            )}
            pending={mutation.isPending}
            requireChanges={Boolean(discussion)}
            hasExternalChanges={Boolean(discussion && categoryId !== discussion.category.id)}
            errorTitle={t(
              discussion
                ? "workspace.repositories.updateDiscussionFailed"
                : "workspace.repositories.createDiscussionFailed"
            )}
            errorMessage={
              error?.code === "githubPermission"
                ? t("workspace.repositories.discussionWritePermissionDenied")
                : error?.message
            }
            additionalFields={
              <Field data-disabled={mutation.isPending}>
                <FieldLabel htmlFor="github-discussion-category">
                  {t("workspace.repositories.discussionCategory")}
                </FieldLabel>
                <Select
                  value={categoryId}
                  disabled={mutation.isPending}
                  onValueChange={(value) => {
                    setCategoryId(value);
                    if (mutation.isError) mutation.reset();
                  }}
                >
                  <SelectTrigger id="github-discussion-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.emoji} {category.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            }
            onChange={() => {
              if (mutation.isError) mutation.reset();
            }}
            onSubmit={(value) => {
              if (categoryId) mutation.mutate(value);
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
