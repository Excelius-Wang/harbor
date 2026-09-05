import { useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Compass, GitMerge, Inbox, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WindowFrame } from "@/components/window-frame";
import { TitleBar } from "@/components/title-bar";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { WorkspacePageHeader } from "@/features/workspace/workspace-page-header";
import { WorkspaceStaleNotice } from "@/features/workspace/workspace-stale-notice";
import { NavigationButton } from "@/features/workspace/navigation-button";
import { GitHubTrendingFilterControls } from "@/features/github/github-trending-filters";
import { DEFAULT_TRENDING_FILTERS } from "@/features/github/github-trending";

function Example({
  title,
  usage,
  children,
}: {
  title: string;
  usage: string;
  children: ReactNode;
}) {
  return (
    <section className="harbor-subtle-divider flex flex-col gap-4 border-b py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <code className="text-muted-foreground text-xs">{usage}</code>
      </div>
      {children}
    </section>
  );
}

function Gallery() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [commandOpen, setCommandOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_TRENDING_FILTERS);
  const copy = (key: string) => t(`uiGallery.${key}`);
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-[1120px] flex-col px-6 pb-8">
        <header className="harbor-subtle-divider flex flex-wrap items-start justify-between gap-4 border-b py-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{copy("title")}</h1>
            <p className="text-muted-foreground text-sm">{copy("description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {copy("theme")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void i18n.changeLanguage(i18n.language.startsWith("zh") ? "en" : "zh")}
            >
              中文 / English
            </Button>
          </div>
        </header>
        <Example
          title={copy("navigation")}
          usage={'<WorkspacePageHeader title="Issues" contained />'}
        >
          <WorkspacePageHeader title="Issues" description={t("workspace.issues.eyebrow")}>
            <Button variant="outline" size="sm">
              {t("common.refresh")}
            </Button>
          </WorkspacePageHeader>
          <WorkspaceStaleNotice message={copy("retry")} onRetry={() => {}} />
        </Example>
        <Example title={copy("actions")} usage={'<Button variant="outline" size="sm">…</Button>'}>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{copy("primary")}</Button>
            <Button variant="outline">{copy("outline")}</Button>
            <Button variant="secondary">{copy("secondary")}</Button>
            <Button variant="ghost">{copy("ghost")}</Button>
            <Button variant="link">{copy("link")}</Button>
            <Button variant="destructive">{copy("destructive")}</Button>
            <Button disabled>{copy("disabled")}</Button>
            <Button variant="outline" disabled>
              <Spinner data-icon="inline-start" />
              {copy("loading")}
            </Button>
          </div>
        </Example>
        <Example title={copy("forms")} usage={"<Field><FieldLabel /><Input /></Field>"}>
          <FieldGroup className="max-w-xl">
            <Field>
              <FieldLabel htmlFor="gallery-search">{copy("search")}</FieldLabel>
              <Input id="gallery-search" placeholder={copy("placeholder")} />
            </Field>
            <Field data-invalid>
              <FieldLabel htmlFor="gallery-invalid">{copy("invalid")}</FieldLabel>
              <Input id="gallery-invalid" aria-invalid defaultValue="harbor / workspace" />
            </Field>
            <Field>
              <FieldLabel htmlFor="gallery-disabled">{copy("disabled")}</FieldLabel>
              <Input id="gallery-disabled" disabled defaultValue="harbor-preview" />
            </Field>
            <Field>
              <FieldLabel htmlFor="gallery-body">{copy("body")}</FieldLabel>
              <Textarea id="gallery-body" defaultValue={copy("longText")} />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="gallery-check" defaultChecked />
              <FieldLabel htmlFor="gallery-check">{copy("checked")}</FieldLabel>
            </Field>
          </FieldGroup>
        </Example>
        <Example
          title={copy("navigation")}
          usage={'<NavigationButton icon={Compass} label="Discover" active />'}
        >
          <div className="flex max-w-56 flex-col gap-1">
            <NavigationButton icon={Compass} label={t("workspace.nav.discover")} active />
            <NavigationButton icon={Inbox} label={t("workspace.nav.notifications")} />
            <NavigationButton icon={Search} label={copy("disabled")} disabled />
          </div>
          <Tabs defaultValue="code">
            <TabsList variant="line">
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="issues">Issues</TabsTrigger>
              <TabsTrigger value="checks" disabled>
                Checks
              </TabsTrigger>
            </TabsList>
            <TabsContent value="code">
              <p className="text-muted-foreground pt-3 text-sm">{copy("longText")}</p>
            </TabsContent>
            <TabsContent value="issues">
              <p className="pt-3 text-sm">{copy("body")}</p>
            </TabsContent>
          </Tabs>
        </Example>
        <Example title={copy("menus")} usage={"<SelectContent /> · <DropdownMenuContent />"}>
          <div className="flex flex-wrap items-center gap-3">
            <Select defaultValue="main">
              <SelectTrigger aria-label={copy("branch")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="main">main</SelectItem>
                  <SelectItem value="feature">feature/unified-workspace</SelectItem>
                  <SelectItem value="disabled" disabled>
                    archived
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">{copy("menu")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem>{copy("outline")}</DropdownMenuItem>
                  <DropdownMenuItem disabled>{copy("disabled")}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">{copy("destructive")}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={() => setCommandOpen(true)}>
              {copy("command")}
            </Button>
          </div>
          <GitHubTrendingFilterControls
            filters={filters}
            onChange={setFilters}
            disabled={false}
            languages={[
              { slug: "typescript", name: "TypeScript" },
              { slug: "rust", name: "Rust" },
              { slug: "python", name: "Python" },
            ]}
          />
        </Example>
        <Example title={copy("overlays")} usage={"<DialogContent /> · <SheetContent />"}>
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">{copy("dialog")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{copy("dialog")}</DialogTitle>
                  <DialogDescription>{copy("longText")}</DialogDescription>
                </DialogHeader>
                <Field>
                  <FieldLabel htmlFor="gallery-dialog-input">{copy("body")}</FieldLabel>
                  <Input id="gallery-dialog-input" />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">{t("common.cancel")}</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>{copy("primary")}</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">{copy("sheet")}</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{copy("sheet")}</SheetTitle>
                  <SheetDescription>{copy("longText")}</SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
          </div>
        </Example>
        <Example title={copy("states")} usage={"<Badge /> · <Alert /> · <Progress /> · <Empty />"}>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar>
              <AvatarFallback>HB</AvatarFallback>
            </Avatar>
            <Badge variant="secondary">{copy("secondary")}</Badge>
            <Badge variant="outline">
              <CheckCircle2 className="text-success" /> Open
            </Badge>
            <Badge variant="outline">
              <GitMerge className="text-merged" /> Merged
            </Badge>
            <Badge variant="destructive">{copy("destructive")}</Badge>
          </div>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{copy("error")}</AlertTitle>
            <AlertDescription>{copy("retry")}</AlertDescription>
          </Alert>
          <Progress value={65} aria-label={copy("loading")} />
          <Progress aria-label={copy("loading")} />
          <div className="flex max-w-xl flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>{copy("empty")}</EmptyTitle>
              <EmptyDescription>{copy("longText")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Example>
        <CommandDialog
          open={commandOpen}
          onOpenChange={setCommandOpen}
          title={copy("command")}
          description={copy("search")}
        >
          <CommandInput placeholder={copy("placeholder")} />
          <CommandList>
            <CommandEmpty>{copy("empty")}</CommandEmpty>
            <CommandGroup heading={copy("navigation")}>
              <CommandItem onSelect={() => setCommandOpen(false)}>
                <Compass />
                {t("workspace.nav.discover")}
              </CommandItem>
              <CommandItem disabled>{copy("disabled")}</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </ScrollArea>
  );
}

export default function ComponentGallery() {
  return (
    <WindowFrame
      titleBar={<TitleBar title="Harbor · UI" />}
      contentClassName="harbor-workspace-shell flex min-h-0 flex-1 flex-col"
    >
      <Gallery />
    </WindowFrame>
  );
}
