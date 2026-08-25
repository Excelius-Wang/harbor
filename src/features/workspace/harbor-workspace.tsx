import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Compass,
  ExternalLink,
  GitFork,
  GitMerge,
  GitPullRequest,
  Library,
  MessageSquareText,
  Pin,
  Search,
  Settings,
  Star,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { openExternalUrl, openSettingsWindow } from "@/lib/window";
import type { GitHubRepository } from "@/features/github/github-data";
import { GitHubRepositoryBrowser } from "@/features/github/github-repository-browser";
import { HarborRail, type RailView, type RepositoryTarget } from "./harbor-rail";
import {
  pinnedRepositories,
  repositories,
  type ActivityKind,
  type DiscoverTab,
  type Repository,
  type TrendingPeriod,
  type WorkspaceSection,
} from "./mock-data";

const navItems: Array<{
  id: WorkspaceSection;
  icon: typeof GitPullRequest;
  count?: number;
}> = [
  { id: "pullRequests", icon: GitPullRequest },
  { id: "repositories", icon: Library },
  { id: "discover", icon: Compass },
];

const activityIcons: Record<ActivityKind, typeof GitMerge> = {
  merged: GitMerge,
  opened: CircleDot,
  commented: MessageSquareText,
};

function RepositoryMark({
  repository,
  size = "md",
}: {
  repository: Repository;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center border border-white/12 font-semibold shadow-sm",
        size === "md" ? "size-11 rounded-[11px] text-lg" : "size-9 rounded-[9px] text-sm",
        repository.markTone
      )}
      aria-hidden="true"
    >
      {repository.mark}
    </span>
  );
}

function FilterMenu({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-md border-white/9 bg-white/[0.035] px-2.5 text-xs font-normal shadow-none hover:bg-white/[0.07]"
        >
          {selectedLabel}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="harbor-popover min-w-44">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PrimaryNavigation({
  activeSection,
  onSectionChange,
}: {
  activeSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
}) {
  const { t } = useTranslation();

  const handleOpenSettings = async () => {
    if (!isTauri()) return;
    await openSettingsWindow(t("settings.title"));
  };

  return (
    <aside className="harbor-glass harbor-primary-nav flex min-h-0 w-[216px] shrink-0 flex-col border-r max-[760px]:w-[54px]">
      <nav className="space-y-1 px-2 py-3" aria-label={t("workspace.primaryNavigation")}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={cn(
                    "group relative flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_20%,transparent)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.045]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {isActive && (
                    <span className="bg-primary absolute inset-y-1.5 -left-2 w-0.5 rounded-r" />
                  )}
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate max-[760px]:hidden">
                    {t(`workspace.nav.${item.id}`)}
                  </span>
                  {item.count ? (
                    <span className="text-[11px] tabular-nums opacity-65 max-[760px]:hidden">
                      {item.count}
                    </span>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="min-[761px]:hidden">
                {t(`workspace.nav.${item.id}`)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <Separator className="mx-3 w-auto bg-white/8 max-[760px]:mx-2" />

      <div className="min-h-0 flex-1 overflow-hidden px-2 py-3 max-[760px]:hidden">
        <div className="text-muted-foreground mb-2 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-[0.12em] uppercase">
          <Pin className="size-3" />
          {t("workspace.pinned")}
        </div>
        <div className="space-y-0.5">
          {pinnedRepositories.map((repository) => (
            <button
              key={repository}
              type="button"
              className="text-muted-foreground hover:text-foreground flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors hover:bg-white/[0.035]"
            >
              <span className="border-primary/30 bg-primary/8 text-primary grid size-5 place-items-center rounded border text-[10px] font-semibold uppercase">
                {repository[0]}
              </span>
              <span className="truncate">{repository}</span>
              <Pin className="ml-auto size-3 rotate-45 opacity-45" />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-0.5 p-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-white/[0.04]"
        >
          <UserRound className="size-4" />
          <span className="max-[760px]:hidden">{t("workspace.account")}</span>
        </button>
        <button
          type="button"
          onClick={() => void handleOpenSettings()}
          className="text-muted-foreground hover:text-foreground flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-white/[0.04]"
        >
          <Settings className="size-4" />
          <span className="max-[760px]:hidden">{t("settings.title")}</span>
        </button>
      </div>
    </aside>
  );
}

function RepositoryList({
  selectedRepository,
  onSelect,
  onPreview,
  searchQuery,
  discoverTab,
  period,
  language,
  spokenLanguage,
}: {
  selectedRepository: Repository;
  onSelect: (repository: Repository) => void;
  onPreview: (repository: Repository) => void;
  searchQuery: string;
  discoverTab: DiscoverTab;
  period: TrendingPeriod;
  language: string;
  spokenLanguage: string;
}) {
  const { t } = useTranslation();
  const visibleRepositories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = repositories.filter((repository) => {
      const matchesQuery =
        !query ||
        [repository.owner, repository.name, repository.description, repository.language]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesLanguage = language === "all" || repository.language.toLowerCase() === language;
      const matchesSpokenLanguage =
        spokenLanguage === "any" || repository.spokenLanguage === spokenLanguage;
      const matchesCollection = discoverTab !== "collections" || repository.featured;
      return matchesQuery && matchesLanguage && matchesSpokenLanguage && matchesCollection;
    });

    return filtered.sort((left, right) => {
      if (discoverTab === "forYou") {
        const languagePreference =
          Number(right.language === "Rust") - Number(left.language === "Rust");
        if (languagePreference) return languagePreference;
      }
      return right.growth[period] - left.growth[period];
    });
  }, [discoverTab, language, period, searchQuery, spokenLanguage]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!visibleRepositories.length) return;
    const selectedIndex = visibleRepositories.findIndex(
      (repository) => repository.id === selectedRepository.id
    );

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        (Math.max(selectedIndex, 0) + direction + visibleRepositories.length) %
        visibleRepositories.length;
      onSelect(visibleRepositories[nextIndex]);
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const repository = visibleRepositories[selectedIndex] ?? visibleRepositories[0];
      if (event.metaKey || event.ctrlKey) {
        void openExternalUrl(repository.url);
      } else {
        onPreview(repository);
      }
    }
  };

  if (!visibleRepositories.length) {
    return (
      <div className="grid min-h-64 place-items-center px-8 text-center">
        <div>
          <Search className="text-muted-foreground/45 mx-auto mb-3 size-7" />
          <p className="text-sm font-medium">{t("workspace.empty.title")}</p>
          <p className="text-muted-foreground mt-1 text-xs">{t("workspace.empty.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <div role="listbox" tabIndex={0} onKeyDown={handleKeyDown} className="outline-none">
      {visibleRepositories.map((repository, index) => {
        const isSelected = repository.id === selectedRepository.id;
        return (
          <button
            key={repository.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(repository)}
            onDoubleClick={() => void openExternalUrl(repository.url)}
            className={cn(
              "group focus-visible:ring-primary/60 relative grid w-full grid-cols-[24px_44px_minmax(0,1fr)_52px] gap-3 border-b border-white/[0.065] px-4 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
              isSelected ? "bg-primary/[0.095]" : "hover:bg-white/[0.025]"
            )}
          >
            {isSelected && (
              <span className="bg-primary absolute inset-y-2 left-0 w-0.5 rounded-r" />
            )}
            <span className="text-muted-foreground pt-0.5 text-right text-xs tabular-nums">
              {index + 1}
            </span>
            <RepositoryMark repository={repository} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] leading-5 font-semibold tracking-[-0.01em]">
                {repository.owner}/{repository.name}
              </span>
              <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-[1.5]">
                {repository.description}
              </span>
              <span className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <i
                    className="size-2 rounded-full"
                    style={{ backgroundColor: repository.languageColor }}
                  />
                  {repository.language}
                </span>
                <span className="flex items-center gap-1">
                  <Star className="size-3" /> {repository.stars}
                </span>
                <span className="flex items-center gap-1">
                  <GitFork className="size-3" /> {repository.forks}
                </span>
              </span>
            </span>
            <span className="mt-auto flex items-center justify-end gap-1 pb-0.5 text-[11px] font-medium text-emerald-500">
              <TrendingUp className="size-3" /> {repository.growth[period]}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RepositoryDetailContent({ repository }: { repository: Repository }) {
  const { t } = useTranslation();

  return (
    <ScrollArea className="h-full">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <RepositoryMark repository={repository} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-muted-foreground text-[11px]">{repository.owner}</p>
            <h2 className="truncate text-lg font-semibold tracking-[-0.025em]">
              {repository.name}
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openExternalUrl(repository.url)}
            className="h-8 shrink-0 rounded-md border-white/10 bg-transparent px-2.5 text-xs shadow-none"
          >
            {t("workspace.openOnGitHub")}
            <ExternalLink className="size-3.5" />
          </Button>
        </div>

        <p className="text-muted-foreground mt-4 text-[13px] leading-6">{repository.description}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {repository.topics.map((topic) => (
            <Badge
              key={topic}
              variant="outline"
              className="border-primary/20 bg-primary/[0.045] text-primary rounded-md px-2 py-0.5 text-[10px] font-normal"
            >
              {topic}
            </Badge>
          ))}
        </div>

        <section className="mt-6">
          <h3 className="text-xs font-semibold">{t("workspace.language")}</h3>
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-white/8">
            {repository.languages.map((language) => (
              <span
                key={language.name}
                style={{ width: `${language.percentage}%`, backgroundColor: language.color }}
              />
            ))}
          </div>
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px]">
            {repository.languages.map((language) => (
              <span key={language.name} className="flex items-center gap-1.5">
                <i className="size-2 rounded-full" style={{ backgroundColor: language.color }} />
                {language.name} {language.percentage}%
              </span>
            ))}
          </div>
        </section>

        <Separator className="my-5 bg-white/[0.075]" />

        <section>
          <h3 className="text-xs font-semibold">{t("workspace.recentActivity")}</h3>
          {repository.activity.length ? (
            <div className="mt-2">
              {repository.activity.map((activity) => {
                const ActivityIcon = activityIcons[activity.kind];
                return (
                  <div
                    key={activity.id}
                    className="grid grid-cols-[20px_minmax(0,1fr)_auto] gap-2.5 border-b border-white/[0.06] py-3 last:border-0"
                  >
                    <ActivityIcon
                      className={cn(
                        "mt-0.5 size-4",
                        activity.kind === "opened"
                          ? "text-emerald-500"
                          : activity.kind === "commented"
                            ? "text-primary"
                            : "text-violet-400"
                      )}
                    />
                    <div className="min-w-0 text-[11px] leading-5">
                      <p className="truncate">
                        <span className="font-medium">
                          {t(`workspace.activity.${activity.kind}`)}
                        </span>{" "}
                        <span className="text-muted-foreground">{activity.subject}</span>
                      </p>
                      <p className="text-muted-foreground truncate">{activity.title}</p>
                      {activity.branch ? (
                        <span className="mt-1 inline-flex rounded border border-white/8 bg-white/[0.025] px-1.5 font-mono text-[9px]">
                          {activity.branch}
                        </span>
                      ) : null}
                    </div>
                    <time className="text-muted-foreground pt-0.5 text-[10px] whitespace-nowrap">
                      {activity.time}
                    </time>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground mt-3 text-xs">{t("workspace.activity.none")}</p>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function RepositoryDetail({ repository }: { repository: Repository }) {
  return (
    <aside className="harbor-detail min-w-[360px] flex-1 border-l border-white/[0.075] bg-[color-mix(in_oklch,var(--background)_94%,transparent)] max-[1040px]:hidden">
      <RepositoryDetailContent repository={repository} />
    </aside>
  );
}

function DiscoverWorkspace({
  selectedRepository,
  onSelectRepository,
}: {
  selectedRepository: Repository;
  onSelectRepository: (repository: Repository) => void;
}) {
  const { t } = useTranslation();
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>("trending");
  const [period, setPeriod] = useState<TrendingPeriod>("week");
  const [language, setLanguage] = useState("all");
  const [spokenLanguage, setSpokenLanguage] = useState("any");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const handleSelectRepository = (repository: Repository) => {
    onSelectRepository(repository);
    if (window.matchMedia("(max-width: 1040px)").matches) {
      setMobileDetailOpen(true);
    }
  };

  const handlePreviewRepository = (repository: Repository) => {
    onSelectRepository(repository);
    setMobileDetailOpen(true);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section className="flex min-w-[420px] flex-[1.25] flex-col bg-[color-mix(in_oklch,var(--background)_96%,transparent)] max-[760px]:min-w-0">
        <header className="border-b border-white/[0.075] px-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-primary/80 text-[10px] font-medium tracking-[0.14em] uppercase">
                {t("workspace.discover.eyebrow")}
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-[-0.03em]">
                {t("workspace.nav.discover")}
              </h1>
            </div>
            <div className="relative w-44 max-[700px]:hidden">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder={t("workspace.searchRepositories")}
                className="placeholder:text-muted-foreground/70 focus:border-primary/40 h-8 w-full rounded-md border border-white/8 bg-white/[0.025] pr-2 pl-8 text-xs transition-colors outline-none"
              />
            </div>
          </div>

          <Tabs
            value={discoverTab}
            onValueChange={(value) => setDiscoverTab(value as DiscoverTab)}
            className="mt-3"
          >
            <TabsList className="h-8 gap-4 rounded-none bg-transparent p-0">
              {(["trending", "forYou", "collections"] as const).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="data-[state=active]:text-primary after:bg-primary relative h-8 rounded-none border-0 bg-transparent px-0 text-xs shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:scale-x-0 after:transition-transform data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:after:scale-x-100"
                >
                  {t(`workspace.discover.tabs.${tab}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.065] px-4 py-2.5">
          <FilterMenu
            label={t("workspace.filters.period")}
            value={period}
            onValueChange={(value) => setPeriod(value as TrendingPeriod)}
            options={[
              { value: "today", label: t("workspace.filters.today") },
              { value: "week", label: t("workspace.filters.week") },
              { value: "month", label: t("workspace.filters.month") },
            ]}
          />
          <FilterMenu
            label={t("workspace.filters.language")}
            value={language}
            onValueChange={setLanguage}
            options={[
              { value: "all", label: t("workspace.filters.allLanguages") },
              { value: "rust", label: "Rust" },
              { value: "typescript", label: "TypeScript" },
              { value: "python", label: "Python" },
            ]}
          />
          <FilterMenu
            label={t("workspace.filters.spoken")}
            value={spokenLanguage}
            onValueChange={setSpokenLanguage}
            options={[
              { value: "any", label: t("workspace.filters.spokenAny") },
              { value: "en", label: "English" },
              { value: "zh", label: "中文" },
            ]}
          />
          <span className="text-muted-foreground ml-auto text-[10px]">
            {t("workspace.sampleData")}
          </span>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <RepositoryList
            selectedRepository={selectedRepository}
            onSelect={handleSelectRepository}
            onPreview={handlePreviewRepository}
            searchQuery={searchQuery}
            discoverTab={discoverTab}
            period={period}
            language={language}
            spokenLanguage={spokenLanguage}
          />
        </ScrollArea>

        <footer className="text-muted-foreground flex h-8 items-center gap-4 border-t border-white/[0.065] px-4 text-[10px] max-[700px]:hidden">
          <span>
            <kbd>↵</kbd> {t("workspace.shortcuts.preview")}
          </span>
          <span>
            <kbd>⌘↵</kbd> {t("workspace.openOnGitHub")}
          </span>
          <span className="ml-auto">
            <kbd>⌘K</kbd> {t("workspace.shortcuts.actions")}
          </span>
        </footer>
      </section>

      <RepositoryDetail repository={selectedRepository} />

      <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
        <SheetContent className="harbor-sheet w-[min(92vw,520px)] gap-0 border-white/10 p-0 min-[1041px]:hidden sm:max-w-[520px]">
          <SheetHeader className="sr-only">
            <SheetTitle>
              {selectedRepository.owner}/{selectedRepository.name}
            </SheetTitle>
            <SheetDescription>{selectedRepository.description}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 pt-8">
            <RepositoryDetailContent repository={selectedRepository} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SectionPlaceholder({ section }: { section: "pullRequests" }) {
  const { t } = useTranslation();
  const Icon = section === "pullRequests" ? GitPullRequest : Library;

  return (
    <section className="grid min-w-0 flex-1 place-items-center bg-[color-mix(in_oklch,var(--background)_95%,transparent)] p-8 text-center">
      <div className="max-w-sm">
        <Icon className="text-primary mx-auto size-8" strokeWidth={1.5} />
        <h1 className="mt-4 text-lg font-semibold tracking-[-0.02em]">
          {t(`workspace.nav.${section}`)}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          {t(`workspace.placeholder.${section}`)}
        </p>
        <Badge variant="outline" className="mt-4 rounded-md font-normal">
          {t("workspace.nextSlice")}
        </Badge>
      </div>
    </section>
  );
}

export function HarborWorkspace() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("discover");
  const [selectedRepository, setSelectedRepository] = useState(repositories[0]);
  const [selectedGitHubRepository, setSelectedGitHubRepository] = useState<GitHubRepository | null>(
    null
  );
  const [commandOpen, setCommandOpen] = useState(false);
  const [railView, setRailView] = useState<RailView>("overview");

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const runCommand = (action: () => void) => {
    setCommandOpen(false);
    action();
  };

  const railRepository: RepositoryTarget | null =
    activeSection === "repositories" ? selectedGitHubRepository : selectedRepository;

  const commandRepositoryUrl =
    activeSection === "repositories" ? selectedGitHubRepository?.url : selectedRepository.url;

  return (
    <WindowFrame
      titleBar={<MainTitleBar onOpenCommand={() => setCommandOpen(true)} />}
      className="harbor-window"
      contentClassName="flex min-h-0 flex-1 overflow-hidden"
    >
      <PrimaryNavigation activeSection={activeSection} onSectionChange={setActiveSection} />
      {activeSection === "discover" ? (
        <DiscoverWorkspace
          selectedRepository={selectedRepository}
          onSelectRepository={setSelectedRepository}
        />
      ) : activeSection === "repositories" ? (
        <GitHubRepositoryBrowser onSelectRepository={setSelectedGitHubRepository} />
      ) : (
        <SectionPlaceholder section={activeSection} />
      )}
      <HarborRail
        selectedRepository={railRepository}
        activeView={railView}
        onViewChange={setRailView}
      />

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title={t("workspace.command.title")}
        description={t("workspace.command.description")}
        className="harbor-command top-[28%] max-w-xl translate-y-0 border-white/10 shadow-2xl"
      >
        <CommandInput placeholder={t("workspace.command.placeholder")} />
        <CommandList className="max-h-[360px]">
          <CommandEmpty>{t("workspace.command.empty")}</CommandEmpty>
          <CommandGroup heading={t("workspace.command.navigation")}>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  onSelect={() => runCommand(() => setActiveSection(item.id))}
                >
                  <Icon />
                  {t(`workspace.nav.${item.id}`)}
                  {item.id === "discover" && <CommandShortcut>G D</CommandShortcut>}
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading={t("workspace.command.repository")}>
            <CommandItem
              disabled={!commandRepositoryUrl}
              onSelect={() => {
                if (commandRepositoryUrl) {
                  runCommand(() => void openExternalUrl(commandRepositoryUrl));
                }
              }}
            >
              <ExternalLink />
              {t("workspace.command.openSelected")}
              <CommandShortcut>⌘ ↵</CommandShortcut>
            </CommandItem>
            {repositories.map((repository) => (
              <CommandItem
                key={repository.id}
                value={`${repository.owner} ${repository.name}`}
                onSelect={() =>
                  runCommand(() => {
                    setActiveSection("discover");
                    setSelectedRepository(repository);
                  })
                }
              >
                <RepositoryMark repository={repository} size="sm" />
                <span>
                  {repository.owner}/{repository.name}
                </span>
                <ChevronRight className="ml-auto size-3.5 opacity-45" />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </WindowFrame>
  );
}
