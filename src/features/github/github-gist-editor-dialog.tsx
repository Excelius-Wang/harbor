import { useEffect, useState } from "react";
import { FilePlus2, LockKeyhole, Plus, Save, Trash2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { GitHubGist, GitHubGistCreateInput, GitHubGistUpdateInput } from "./github-data";

type EditableGistFile = {
  key: string;
  originalFilename?: string;
  filename: string;
  content: string;
  deleted: boolean;
};

let fileKey = 0;

function nextFileKey() {
  fileKey += 1;
  return `gist-file-${fileKey}`;
}

function initialFiles(gist?: GitHubGist): EditableGistFile[] {
  if (gist) {
    return gist.files.map((file) => ({
      key: nextFileKey(),
      originalFilename: file.filename,
      filename: file.filename,
      content: file.content ?? "",
      deleted: false,
    }));
  }
  return [
    {
      key: nextFileKey(),
      filename: "gist.md",
      content: "",
      deleted: false,
    },
  ];
}

export function GitHubGistEditorDialog({
  open,
  gist,
  pending,
  error,
  onOpenChange,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  gist?: GitHubGist;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: GitHubGistCreateInput) => void;
  onUpdate: (input: GitHubGistUpdateInput) => void;
}) {
  const { t } = useTranslation();
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"secret" | "public">("secret");
  const [files, setFiles] = useState<EditableGistFile[]>(() => initialFiles(gist));
  const activeFiles = files.filter((file) => !file.deleted);
  const normalizedNames = activeFiles.map((file) => file.filename.trim());
  const hasDuplicate = new Set(normalizedNames).size !== normalizedNames.length;
  const invalid = activeFiles.length === 0 || normalizedNames.some((name) => !name) || hasDuplicate;

  useEffect(() => {
    if (!open) return;
    setDescription(gist?.description ?? "");
    setVisibility(gist?.public ? "public" : "secret");
    setFiles(initialFiles(gist));
  }, [gist, open]);

  const updateFile = (key: string, update: Partial<EditableGistFile>) => {
    setFiles((current) =>
      current.map((file) => (file.key === key ? { ...file, ...update } : file))
    );
  };

  const removeFile = (file: EditableGistFile) => {
    if (activeFiles.length <= 1) return;
    setFiles((current) =>
      file.originalFilename
        ? current.map((item) => (item.key === file.key ? { ...item, deleted: true } : item))
        : current.filter((item) => item.key !== file.key)
    );
  };

  const submit = () => {
    if (invalid || pending) return;
    const normalizedDescription = description.trim() || undefined;
    if (gist) {
      onUpdate({
        description: normalizedDescription,
        files: files.map((file) => ({
          originalFilename: file.originalFilename,
          filename: file.filename.trim(),
          content: file.deleted ? undefined : file.content,
          deleted: file.deleted,
        })),
      });
    } else {
      onCreate({
        description: normalizedDescription,
        public: visibility === "public",
        files: activeFiles.map((file) => ({
          filename: file.filename.trim(),
          content: file.content,
        })),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t(gist ? "workspace.gists.editTitle" : "workspace.gists.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {t(gist ? "workspace.gists.editDescription" : "workspace.gists.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="gist-description">{t("workspace.gists.description")}</FieldLabel>
            <Input
              id="gist-description"
              value={description}
              disabled={pending}
              maxLength={1024}
              placeholder={t("workspace.gists.descriptionPlaceholder")}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </Field>

          {!gist ? (
            <Field>
              <FieldLabel>{t("workspace.gists.visibility")}</FieldLabel>
              <RadioGroup
                value={visibility}
                onValueChange={(value) => setVisibility(value as typeof visibility)}
                className="grid gap-2 sm:grid-cols-2"
                disabled={pending}
              >
                <label className="has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-primary/[0.05] flex cursor-pointer gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="secret" />
                  <span className="flex min-w-0 gap-2">
                    <LockKeyhole className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="block text-xs font-medium">
                        {t("workspace.gists.secret")}
                      </span>
                      <span className="text-muted-foreground block text-[11px] leading-4">
                        {t("workspace.gists.secretDescription")}
                      </span>
                    </span>
                  </span>
                </label>
                <label className="has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-primary/[0.05] flex cursor-pointer gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="public" />
                  <span className="flex min-w-0 gap-2">
                    <Users className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="block text-xs font-medium">
                        {t("workspace.gists.public")}
                      </span>
                      <span className="text-muted-foreground block text-[11px] leading-4">
                        {t("workspace.gists.publicDescription")}
                      </span>
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </Field>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div>
              <FieldLabel>{t("workspace.gists.files")}</FieldLabel>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {t("workspace.gists.filesDescription")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || activeFiles.length >= 100}
              onClick={() =>
                setFiles((current) => [
                  ...current,
                  {
                    key: nextFileKey(),
                    filename: `file-${activeFiles.length + 1}.txt`,
                    content: "",
                    deleted: false,
                  },
                ])
              }
            >
              <Plus data-icon="inline-start" />
              {t("workspace.gists.addFile")}
            </Button>
          </div>

          <div className="space-y-3">
            {activeFiles.map((file, index) => (
              <section key={file.key} className="overflow-hidden rounded-lg border">
                <header className="bg-muted/25 flex items-center gap-2 border-b p-2">
                  <FilePlus2 className="text-muted-foreground size-4 shrink-0" />
                  <Input
                    aria-label={t("workspace.gists.fileName", { number: index + 1 })}
                    value={file.filename}
                    disabled={pending}
                    maxLength={255}
                    className="h-8 font-mono text-xs"
                    onChange={(event) =>
                      updateFile(file.key, { filename: event.currentTarget.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("workspace.gists.removeFile", { name: file.filename })}
                    disabled={pending || activeFiles.length <= 1}
                    onClick={() => removeFile(file)}
                  >
                    <Trash2 />
                  </Button>
                </header>
                <Textarea
                  aria-label={t("workspace.gists.fileContent", { name: file.filename })}
                  value={file.content}
                  disabled={pending}
                  className="min-h-44 resize-y rounded-none border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
                  onChange={(event) => updateFile(file.key, { content: event.currentTarget.value })}
                />
              </section>
            ))}
          </div>
          {hasDuplicate ? <FieldError>{t("workspace.gists.duplicateFile")}</FieldError> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="button" disabled={invalid || pending} onClick={submit}>
            {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {t(
              pending
                ? "workspace.gists.saving"
                : gist
                  ? "workspace.gists.save"
                  : "workspace.gists.create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
