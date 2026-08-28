import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Plus, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  GitHubProjectField,
  GitHubProjectItem,
  GitHubProjectItemAddition,
  GitHubProjectItemUpdate,
  GitHubProjectSummary,
  GitHubProjectUpdate,
} from "./github-data";
import { projectFieldValue } from "./github-project-shared";

function MutationError({ message }: { message: string }) {
  return message ? (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}

export function CreateProjectDialog({
  open,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  useEffect(() => {
    if (!open) setTitle("");
  }, [open]);
  const valid = Boolean(title.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.projects.createTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.projects.createDescription")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={!valid && Boolean(title)}>
            <FieldLabel htmlFor="project-title">{t("workspace.projects.fields.title")}</FieldLabel>
            <Input
              id="project-title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={256}
              autoFocus
              aria-invalid={!valid && Boolean(title)}
            />
            {!valid && title ? (
              <FieldError>{t("workspace.projects.titleRequired")}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
        <MutationError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onSubmit(title.trim())} disabled={!valid || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            {t("workspace.projects.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectSettingsDialog({
  project,
  readme,
  open,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  project: GitHubProjectSummary;
  readme: string;
  open: boolean;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (update: GitHubProjectUpdate) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.shortDescription ?? "");
  const [nextReadme, setNextReadme] = useState(readme);
  const [isPublic, setIsPublic] = useState(project.public);
  const [closed, setClosed] = useState(project.closed);
  useEffect(() => {
    if (!open) return;
    setTitle(project.title);
    setDescription(project.shortDescription ?? "");
    setNextReadme(readme);
    setIsPublic(project.public);
    setClosed(project.closed);
  }, [open, project, readme]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.projects.settingsTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.projects.settingsDescription")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="project-settings-title">
              {t("workspace.projects.fields.title")}
            </FieldLabel>
            <Input
              id="project-settings-title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={256}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="project-description">
              {t("workspace.projects.fields.description")}
            </FieldLabel>
            <Input
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              maxLength={256}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="project-readme">
              {t("workspace.projects.fields.readme")}
            </FieldLabel>
            <Textarea
              id="project-readme"
              value={nextReadme}
              onChange={(event) => setNextReadme(event.currentTarget.value)}
              rows={8}
              maxLength={50_000}
            />
            <FieldDescription>{t("workspace.projects.readmeDescription")}</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="project-public"
              checked={isPublic}
              onCheckedChange={(checked) => setIsPublic(checked === true)}
            />
            <FieldLabel htmlFor="project-public">{t("workspace.projects.makePublic")}</FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="project-closed"
              checked={closed}
              onCheckedChange={(checked) => setClosed(checked === true)}
            />
            <FieldLabel htmlFor="project-closed">{t("workspace.projects.closeProject")}</FieldLabel>
          </Field>
        </FieldGroup>
        <MutationError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                title: title.trim(),
                shortDescription: description,
                readme: nextReadme,
                public: isPublic,
                closed,
              })
            }
            disabled={!title.trim() || pending}
          >
            {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddProjectItemDialog({
  open,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (addition: GitHubProjectItemAddition) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<"draftIssue" | "existingItem">("draftIssue");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!open) {
      setKind("draftIssue");
      setTitle("");
      setBody("");
      setUrl("");
    }
  }, [open]);
  const valid = kind === "draftIssue" ? Boolean(title.trim()) : Boolean(url.trim());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.projects.addItemTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.projects.addItemDescription")}</DialogDescription>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
          <TabsList variant="line">
            <TabsTrigger value="draftIssue">{t("workspace.projects.draftIssue")}</TabsTrigger>
            <TabsTrigger value="existingItem">{t("workspace.projects.existingItem")}</TabsTrigger>
          </TabsList>
        </Tabs>
        {kind === "draftIssue" ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-item-title">
                {t("workspace.projects.fields.title")}
              </FieldLabel>
              <Input
                id="project-item-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                maxLength={256}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-item-body">
                {t("workspace.projects.fields.body")}
              </FieldLabel>
              <Textarea
                id="project-item-body"
                value={body}
                onChange={(event) => setBody(event.currentTarget.value)}
                rows={6}
              />
            </Field>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="project-item-url">{t("workspace.projects.itemUrl")}</FieldLabel>
              <Input
                id="project-item-url"
                value={url}
                onChange={(event) => setUrl(event.currentTarget.value)}
                placeholder="https://github.com/owner/repository/issues/42"
              />
              <FieldDescription>{t("workspace.projects.itemUrlDescription")}</FieldDescription>
            </Field>
          </FieldGroup>
        )}
        <MutationError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onSubmit(
                kind === "draftIssue"
                  ? { kind, title: title.trim(), body }
                  : { kind, url: url.trim() }
              )
            }
            disabled={!valid || pending}
          >
            {pending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            {t("workspace.projects.addItem")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditProjectDraftDialog({
  item,
  open,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  item: GitHubProjectItem;
  open: boolean;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (update: GitHubProjectItemUpdate) => void;
}) {
  const { t } = useTranslation();
  const content = item.content.kind === "draftIssue" ? item.content : null;
  const [title, setTitle] = useState(content?.title ?? "");
  const [body, setBody] = useState(content?.body ?? "");
  useEffect(() => {
    if (open && content) {
      setTitle(content.title);
      setBody(content.body);
    }
  }, [open, content]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("workspace.projects.editDraftTitle")}</DialogTitle>
          <DialogDescription>{t("workspace.projects.editDraftDescription")}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-project-draft-title">
              {t("workspace.projects.fields.title")}
            </FieldLabel>
            <Input
              id="edit-project-draft-title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              maxLength={256}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-project-draft-body">
              {t("workspace.projects.fields.body")}
            </FieldLabel>
            <Textarea
              id="edit-project-draft-body"
              value={body}
              onChange={(event) => setBody(event.currentTarget.value)}
              rows={7}
            />
          </Field>
        </FieldGroup>
        <MutationError message={error} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => onSubmit({ kind: "draftIssue", title: title.trim(), body })}
            disabled={!content || !title.trim() || pending}
          >
            {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectFieldEditDialog({
  field,
  item,
  open,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  field: GitHubProjectField;
  item: GitHubProjectItem;
  open: boolean;
  pending: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (update: GitHubProjectItemUpdate) => void;
}) {
  const { t } = useTranslation();
  const current = projectFieldValue(item, field.id);
  const initial = useMemo(() => projectFieldInitialValue(current), [current]);
  const [value, setValue] = useState(initial.text);
  const [selected, setSelected] = useState<string[]>(initial.selected);
  useEffect(() => {
    if (open) {
      setValue(initial.text);
      setSelected(initial.selected);
    }
  }, [open, initial]);
  const update = projectFieldUpdate(field, value, selected);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{field.name}</DialogTitle>
          <DialogDescription>{t("workspace.projects.editFieldDescription")}</DialogDescription>
        </DialogHeader>
        <ProjectFieldControl
          field={field}
          value={value}
          selected={selected}
          onValueChange={setValue}
          onSelectedChange={setSelected}
        />
        <MutationError message={error} />
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onSubmit({ kind: "clearField", fieldId: field.id })}
            disabled={!current || pending}
          >
            {t("workspace.projects.clearField")}
          </Button>
          <Button onClick={() => update && onSubmit(update)} disabled={!update || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectFieldControl({
  field,
  value,
  selected,
  onValueChange,
  onSelectedChange,
}: {
  field: GitHubProjectField;
  value: string;
  selected: string[];
  onValueChange: (value: string) => void;
  onSelectedChange: (value: string[]) => void;
}) {
  const { t } = useTranslation();
  if (field.dataType === "singleSelect" || field.dataType === "iteration") {
    const options =
      field.dataType === "singleSelect"
        ? field.options.map((option) => ({ id: option.id, name: option.name }))
        : field.iterations.map((iteration) => ({ id: iteration.id, name: iteration.title }));
    return (
      <FieldGroup>
        <Field>
          <FieldLabel>{field.name}</FieldLabel>
          <Select value={selected[0]} onValueChange={(next) => onSelectedChange([next])}>
            <SelectTrigger>
              <SelectValue placeholder={t("workspace.projects.selectValue")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    );
  }
  if (field.dataType === "multiSelect") {
    return (
      <FieldSet>
        <FieldLegend>{field.name}</FieldLegend>
        <FieldGroup>
          {field.options.map((option) => (
            <Field key={option.id} orientation="horizontal">
              <Checkbox
                id={`project-field-${field.id}-${option.id}`}
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) =>
                  onSelectedChange(
                    checked ? [...selected, option.id] : selected.filter((id) => id !== option.id)
                  )
                }
              />
              <FieldLabel htmlFor={`project-field-${field.id}-${option.id}`}>
                {option.name}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
    );
  }
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`project-field-${field.id}`}>{field.name}</FieldLabel>
        <Input
          id={`project-field-${field.id}`}
          type={
            field.dataType === "number" ? "number" : field.dataType === "date" ? "date" : "text"
          }
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        />
      </Field>
    </FieldGroup>
  );
}

function projectFieldInitialValue(current: ReturnType<typeof projectFieldValue>): {
  text: string;
  selected: string[];
} {
  if (!current) return { text: "", selected: [] };
  switch (current.kind) {
    case "text":
      return { text: current.text, selected: [] };
    case "number":
      return { text: String(current.number), selected: [] };
    case "date":
      return { text: current.date, selected: [] };
    case "singleSelect":
      return { text: "", selected: [current.optionId] };
    case "multiSelect":
      return { text: "", selected: current.options.map((option) => option.id) };
    case "iteration":
      return { text: "", selected: [current.iterationId] };
    default:
      return { text: "", selected: [] };
  }
}

function projectFieldUpdate(
  field: GitHubProjectField,
  value: string,
  selected: string[]
): GitHubProjectItemUpdate | null {
  switch (field.dataType) {
    case "text":
      return { kind: "text", fieldId: field.id, text: value };
    case "number": {
      const number = Number(value);
      return value.trim() && Number.isFinite(number)
        ? { kind: "number", fieldId: field.id, number }
        : null;
    }
    case "date":
      return value ? { kind: "date", fieldId: field.id, date: value } : null;
    case "singleSelect":
      return selected[0]
        ? { kind: "singleSelect", fieldId: field.id, optionId: selected[0] }
        : null;
    case "multiSelect":
      return { kind: "multiSelect", fieldId: field.id, optionIds: selected };
    case "iteration":
      return selected[0]
        ? { kind: "iteration", fieldId: field.id, iterationId: selected[0] }
        : null;
    default:
      return null;
  }
}
