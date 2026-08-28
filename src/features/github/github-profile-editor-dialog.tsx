import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { GitHubUserProfile, GitHubUserProfileUpdate } from "./github-data";

function profileForm(profile: GitHubUserProfile): GitHubUserProfileUpdate {
  return {
    name: profile.name ?? "",
    bio: profile.bio ?? "",
    company: profile.company ?? "",
    location: profile.location ?? "",
    blog: profile.blog ?? "",
    email: profile.email ?? "",
    twitterUsername: profile.twitterUsername ?? "",
    hireable: profile.hireable,
  };
}

export function GitHubProfileEditorDialog({
  open,
  profile,
  pending,
  error,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  profile: GitHubUserProfile;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (input: GitHubUserProfileUpdate) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => profileForm(profile));

  useEffect(() => {
    if (open) setForm(profileForm(profile));
  }, [open, profile]);

  const update = <Key extends keyof GitHubUserProfileUpdate>(
    key: Key,
    value: GitHubUserProfileUpdate[Key]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover max-h-[min(90dvh,760px)] overflow-y-auto sm:max-w-2xl">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("workspace.profile.editTitle")}</DialogTitle>
            <DialogDescription>{t("workspace.profile.editDescription")}</DialogDescription>
          </DialogHeader>

          <FieldGroup className="grid gap-4 @md/field-group:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="profile-name">{t("workspace.profile.fields.name")}</FieldLabel>
              <Input
                id="profile-name"
                value={form.name}
                maxLength={255}
                disabled={pending}
                onChange={(event) => update("name", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-email">{t("workspace.profile.fields.email")}</FieldLabel>
              <Input
                id="profile-email"
                type="email"
                value={form.email}
                maxLength={254}
                disabled={pending}
                onChange={(event) => update("email", event.currentTarget.value)}
              />
            </Field>
            <Field className="@md/field-group:col-span-2">
              <FieldLabel htmlFor="profile-bio">{t("workspace.profile.fields.bio")}</FieldLabel>
              <Textarea
                id="profile-bio"
                value={form.bio}
                maxLength={160}
                rows={3}
                disabled={pending}
                onChange={(event) => update("bio", event.currentTarget.value)}
              />
              <span className="text-muted-foreground text-right text-[10px] tabular-nums">
                {form.bio.length}/160
              </span>
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-company">
                {t("workspace.profile.fields.company")}
              </FieldLabel>
              <Input
                id="profile-company"
                value={form.company}
                maxLength={255}
                disabled={pending}
                onChange={(event) => update("company", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-location">
                {t("workspace.profile.fields.location")}
              </FieldLabel>
              <Input
                id="profile-location"
                value={form.location}
                maxLength={255}
                disabled={pending}
                onChange={(event) => update("location", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-blog">
                {t("workspace.profile.fields.website")}
              </FieldLabel>
              <Input
                id="profile-blog"
                value={form.blog}
                maxLength={255}
                disabled={pending}
                onChange={(event) => update("blog", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-x">{t("workspace.profile.fields.x")}</FieldLabel>
              <Input
                id="profile-x"
                value={form.twitterUsername}
                maxLength={16}
                disabled={pending}
                onChange={(event) => update("twitterUsername", event.currentTarget.value)}
              />
            </Field>
            <Field orientation="horizontal" className="@md/field-group:col-span-2">
              <Checkbox
                id="profile-hireable"
                checked={form.hireable}
                disabled={pending}
                onCheckedChange={(checked) => update("hireable", checked === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor="profile-hireable">
                  {t("workspace.profile.fields.hireable")}
                </FieldLabel>
              </FieldContent>
            </Field>
          </FieldGroup>

          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
