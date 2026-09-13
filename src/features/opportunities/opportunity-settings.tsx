import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { monitorError, monitorKey, saveMonitor, type MonitorSnapshot } from "./opportunity-data";

export function OpportunitySettings({
  snapshot,
  onClose,
}: {
  snapshot: MonitorSnapshot;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const client = useQueryClient();
  const [draft, setDraft] = useState(snapshot.config);
  const [repositories, setRepositories] = useState(draft.repositories.join("\n"));
  const [include, setInclude] = useState(draft.includeLabels.join(", "));
  const [exclude, setExclude] = useState(draft.excludeLabels.join(", "));
  const [apiKey, setApiKey] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      saveMonitor(
        {
          ...draft,
          repositories: repositories
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          includeLabels: include
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          excludeLabels: exclude
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          language: i18n.language.startsWith("zh") ? "zh-CN" : "en",
        },
        apiKey
      ),
    onSuccess: (value) => {
      client.setQueryData(monitorKey, value);
      setApiKey("");
      onClose();
    },
  });
  const pending = mutation.isPending;
  const keyRequired =
    !snapshot.hasApiKey || draft.endpoint.trim().replace(/\/$/, "") !== snapshot.config.endpoint;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-48px)] flex-col overflow-hidden sm:max-w-xl"
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle>{t("opportunities.settings")}</DialogTitle>
          <DialogDescription>{t("opportunities.settingsDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <ScrollArea
            className="h-[min(600px,60dvh)] min-h-0 shrink overflow-hidden [&>[data-slot=scroll-area-viewport]]:absolute [&>[data-slot=scroll-area-viewport]]:inset-0"
            constrainContentWidth
          >
            <FieldGroup className="gap-4 p-1 pr-5">
              <Field>
                <FieldLabel htmlFor={`${id}-repos`}>{t("opportunities.repositories")}</FieldLabel>
                <Textarea
                  id={`${id}-repos`}
                  required
                  rows={3}
                  disabled={pending}
                  value={repositories}
                  onChange={(e) => setRepositories(e.target.value)}
                  placeholder="owner/repository"
                />
                <FieldDescription>{t("opportunities.repositoriesHelp")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-preferences`}>
                  {t("opportunities.preferences")}
                </FieldLabel>
                <Textarea
                  id={`${id}-preferences`}
                  rows={3}
                  maxLength={8000}
                  disabled={pending}
                  value={draft.preferences}
                  onChange={(e) => setDraft({ ...draft, preferences: e.target.value })}
                  placeholder={t("opportunities.preferencesPlaceholder")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-endpoint`}>{t("opportunities.endpoint")}</FieldLabel>
                <Input
                  id={`${id}-endpoint`}
                  type="url"
                  required
                  disabled={pending}
                  value={draft.endpoint}
                  onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${id}-model`}>{t("opportunities.model")}</FieldLabel>
                  <Input
                    id={`${id}-model`}
                    required
                    maxLength={200}
                    disabled={pending}
                    value={draft.model}
                    onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-interval`}>{t("opportunities.interval")}</FieldLabel>
                  <Input
                    id={`${id}-interval`}
                    type="number"
                    required
                    min={60}
                    max={86400}
                    disabled={pending}
                    value={draft.intervalSeconds}
                    onChange={(e) =>
                      setDraft({ ...draft, intervalSeconds: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor={`${id}-key`}>{t("opportunities.apiKey")}</FieldLabel>
                <Input
                  id={`${id}-key`}
                  type="password"
                  autoComplete="new-password"
                  required={keyRequired}
                  disabled={pending}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    snapshot.hasApiKey && !keyRequired ? t("opportunities.keySaved") : undefined
                  }
                />
                <FieldDescription>{t("opportunities.keyHelp")}</FieldDescription>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${id}-include`}>
                    {t("opportunities.includeLabels")}
                  </FieldLabel>
                  <Input
                    id={`${id}-include`}
                    disabled={pending}
                    value={include}
                    onChange={(e) => setInclude(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-exclude`}>
                    {t("opportunities.excludeLabels")}
                  </FieldLabel>
                  <Input
                    id={`${id}-exclude`}
                    disabled={pending}
                    value={exclude}
                    onChange={(e) => setExclude(e.target.value)}
                  />
                </Field>
              </div>
              <p className="text-muted-foreground text-xs leading-5">
                {t("opportunities.disclosure")}
              </p>
            </FieldGroup>
          </ScrollArea>
          {mutation.error ? (
            <p role="alert" className="text-destructive text-sm">
              {t(`opportunities.errors.${monitorError(mutation.error)}`, {
                defaultValue: t("opportunities.errors.network"),
              })}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t(pending ? "opportunities.saving" : "common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
