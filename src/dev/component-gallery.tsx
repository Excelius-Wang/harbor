import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Compass,
  GitMerge,
  Inbox,
  Search,
  ChevronDown,
  Info,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WindowFrame } from "@/components/window-frame";
import { TitleBar } from "@/components/title-bar";
import { ModeToggle } from "@/components/mode-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend,
  FieldSeparator,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "@/components/ui/breadcrumb";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationLink,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
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
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
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
  const { t } = useTranslation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [page, setPage] = useState(2);
  const [menuChecked, setMenuChecked] = useState(true);
  const [menuValue, setMenuValue] = useState("public");
  const [rowSelected, setRowSelected] = useState(true);
  const [partialChecked, setPartialChecked] = useState<boolean | "indeterminate">("indeterminate");
  const [filters, setFilters] = useState(DEFAULT_TRENDING_FILTERS);
  const copy = (key: string) => t(`uiGallery.${key}`);
  return (
    <ScrollArea className="min-h-0 flex-1" constrainContentWidth>
      <Toaster closeButton />
      <div className="mx-auto flex max-w-[1120px] flex-col px-6 pb-8">
        <header className="harbor-subtle-divider flex flex-wrap items-start justify-between gap-4 border-b py-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{copy("title")}</h1>
            <p className="text-muted-foreground text-sm">{copy("description")}</p>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <LanguageToggle />
          </div>
        </header>
        <Example
          title={copy("navigation")}
          usage={'<WorkspacePageHeader title={t("workspace.nav.issues")} contained />'}
        >
          <WorkspacePageHeader
            title={t("workspace.nav.issues")}
            description={t("workspace.issues.eyebrow")}
          >
            <Button variant="outline" size="sm">
              {t("common.refresh")}
            </Button>
          </WorkspacePageHeader>
          <WorkspaceStaleNotice message={copy("retry")} onRetry={() => {}} />
          <div className="flex flex-wrap items-center gap-3">
            <WorkspaceStaleNotice compact message={copy("retry")} onRetry={() => {}} />
            <WorkspaceStaleNotice
              compact
              retryDisabled
              message={copy("retry")}
              onRetry={() => {}}
            />
          </div>
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
              <Input
                id="gallery-invalid"
                aria-invalid
                aria-describedby="gallery-validation"
                defaultValue="harbor / workspace"
              />
              <FieldError id="gallery-validation">{copy("validation")}</FieldError>
            </Field>
            <Field data-disabled>
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
        <Example title={copy("choices")} usage="<FieldSet> · <RadioGroup> · <FieldError>">
          <FieldGroup className="max-w-xl">
            <FieldSet>
              <FieldLegend variant="label">{copy("radioGroup")}</FieldLegend>
              <RadioGroup defaultValue="public" aria-label={copy("radioGroup")}>
                <Field orientation="horizontal">
                  <RadioGroupItem id="gallery-public" value="public" />
                  <FieldLabel htmlFor="gallery-public">{copy("public")}</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="gallery-private" value="private" />
                  <FieldLabel htmlFor="gallery-private">{copy("private")}</FieldLabel>
                </Field>
                <Field orientation="horizontal" data-disabled>
                  <RadioGroupItem id="gallery-radio-disabled" value="disabled" disabled />
                  <FieldLabel htmlFor="gallery-radio-disabled">{copy("disabled")}</FieldLabel>
                </Field>
              </RadioGroup>
            </FieldSet>
            <FieldSeparator>{copy("divider")}</FieldSeparator>
            <Field orientation="horizontal">
              <Checkbox
                id="gallery-partial"
                checked={partialChecked}
                onCheckedChange={setPartialChecked}
              />
              <FieldLabel htmlFor="gallery-partial">{copy("indeterminate")}</FieldLabel>
            </Field>
            <Field orientation="horizontal" data-disabled>
              <Checkbox id="gallery-disabled-check" disabled checked />
              <FieldLabel htmlFor="gallery-disabled-check">{copy("disabled")}</FieldLabel>
            </Field>
            <FieldDescription>{copy("longText")}</FieldDescription>
          </FieldGroup>
        </Example>
        <Example
          title={copy("navigation")}
          usage={'<NavigationButton icon={Compass} label="Discover" active />'}
        >
          <div className="workspace-wide:w-[226px] flex w-[58px] flex-col gap-1">
            <NavigationButton icon={Compass} label={t("workspace.nav.discover")} active />
            <NavigationButton icon={Inbox} label={t("workspace.nav.notifications")} />
            <NavigationButton icon={Search} label={copy("disabled")} disabled />
          </div>
          <Tabs defaultValue="code">
            <TabsList variant="line">
              <TabsTrigger value="code">{copy("code")}</TabsTrigger>
              <TabsTrigger value="issues">{t("workspace.nav.issues")}</TabsTrigger>
              <TabsTrigger value="checks" disabled>
                {copy("checks")}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">{copy("menuOptions")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuCheckboxItem checked={menuChecked} onCheckedChange={setMenuChecked}>
                    {copy("checked")}
                  </DropdownMenuCheckboxItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={menuValue} onValueChange={setMenuValue}>
                  <DropdownMenuRadioItem value="public">{copy("public")}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="private">{copy("private")}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>{copy("menuSub")}</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        <DropdownMenuGroup>
                          <DropdownMenuItem>{t("common.edit")}</DropdownMenuItem>
                          <DropdownMenuItem disabled>{copy("disabled")}</DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">{copy("popover")}</Button>
              </PopoverTrigger>
              <PopoverContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="gallery-popover-input">{copy("search")}</FieldLabel>
                    <Input id="gallery-popover-input" placeholder={copy("placeholder")} />
                  </Field>
                  <FieldDescription>{copy("longText")}</FieldDescription>
                </FieldGroup>
              </PopoverContent>
            </Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label={copy("details")}>
                  <Info />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copy("longText")}</TooltipContent>
            </Tooltip>
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">{copy("confirmation")}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{copy("confirmation")}</AlertDialogTitle>
                  <AlertDialogDescription>{copy("longText")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive">{copy("destructive")}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">{copy("sheet")}</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{copy("sheet")}</SheetTitle>
                  <SheetDescription>{copy("longText")}</SheetDescription>
                </SheetHeader>
                <ScrollArea className="min-h-0 flex-1 px-4 pb-4" constrainContentWidth>
                  <div className="flex flex-col gap-4">
                    {Array.from({ length: 12 }, (_, index) => (
                      <p key={index} className="text-sm leading-relaxed">
                        {copy("longText")}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </Example>
        <Example title={copy("data")} usage="<Breadcrumb> · <Table> · <Pagination> · <Card>">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#" onClick={(event) => event.preventDefault()}>
                  harbor-preview
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbEllipsis />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>harbor</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Table>
            <TableCaption>{copy("tableCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">{copy("selected")}</span>
                </TableHead>
                <TableHead>{copy("item")}</TableHead>
                <TableHead>{copy("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow data-state={rowSelected ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={rowSelected}
                    onCheckedChange={(checked) => setRowSelected(checked === true)}
                    aria-label={copy("selected")}
                  />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <p className="font-medium">harbor-preview/accessible-desktop-workspace</p>
                  <p className="text-muted-foreground mt-1 max-w-xl text-xs leading-relaxed">
                    {copy("longText")}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{copy("public")}</Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell />
                <TableCell>harbor-preview/design-system</TableCell>
                <TableCell>
                  <Badge variant="secondary">{copy("private")}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(Math.max(1, page - 1));
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink
                  href="#"
                  isActive
                  aria-label={t("workspace.repositories.pageNumber", { page })}
                  onClick={(event) => event.preventDefault()}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(page + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Harbor</CardTitle>
              <CardDescription>{copy("longText")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline">
                    {copy("details")}
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="pt-4 text-sm leading-relaxed">{copy("longText")}</p>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
            <CardFooter>
              <AvatarGroup>
                <Avatar>
                  <AvatarFallback>HB</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>UI</AvatarFallback>
                </Avatar>
                <AvatarGroupCount>+2</AvatarGroupCount>
              </AvatarGroup>
            </CardFooter>
          </Card>
        </Example>
        <Example title={copy("chart")} usage="<ChartContainer> · <ChartTooltipContent>">
          <ChartContainer
            className="h-48 w-full max-w-xl"
            config={{ changes: { label: copy("series"), color: "var(--primary)" } }}
          >
            <BarChart
              data={[
                { day: "01", changes: 8 },
                { day: "02", changes: 12 },
                { day: "03", changes: 5 },
                { day: "04", changes: 16 },
              ]}
              accessibilityLayer
              aria-label={copy("chart")}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="changes" fill="var(--color-changes)" isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </Example>
        <Example title={copy("states")} usage={"<Badge /> · <Alert /> · <Progress /> · <Empty />"}>
          <div className="flex flex-wrap items-center gap-2">
            <Avatar>
              <AvatarFallback>HB</AvatarFallback>
            </Avatar>
            <Badge variant="secondary">{copy("secondary")}</Badge>
            <Badge variant="outline">
              <CheckCircle2 className="text-success" /> {copy("open")}
            </Badge>
            <Badge variant="outline">
              <GitMerge className="text-merged" /> {copy("merged")}
            </Badge>
            <Badge variant="destructive">{copy("destructive")}</Badge>
          </div>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{copy("error")}</AlertTitle>
            <AlertDescription>{copy("retry")}</AlertDescription>
          </Alert>
          <p className="text-sm">{copy("progress")} · 150 / 200</p>
          <Progress value={150} max={200} aria-label={copy("progress")} />
          <Progress aria-label={copy("loading")} />
          <div className="flex max-w-xl flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-3">
            <Label>{copy("toast")}</Label>
            <Button
              variant="outline"
              onClick={() => toast.success(copy("toastSuccess"), { description: copy("longText") })}
            >
              {copy("toastSuccess")}
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.error(copy("toastError"), { description: copy("longText") })}
            >
              {copy("toastError")}
            </Button>
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
