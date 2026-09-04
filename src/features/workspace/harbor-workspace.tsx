import { lazy, Suspense, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  Bell,
  CircleDot,
  Compass,
  ExternalLink,
  FileCode2,
  GitPullRequest,
  LayoutGrid,
  Library,
  PackageOpen,
  Settings,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { MainTitleBar } from "@/components/main-title-bar";
import { WindowFrame } from "@/components/window-frame";
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GitHubDiscoveryRepositoryTarget } from "@/features/github/github-discovery-view";
import type {
  GitHubIssueRepository,
  GitHubPullRequestRepository,
  GitHubRepository,
} from "@/features/github/github-data";
import { GitHubIssueInbox } from "@/features/github/github-issue-inbox";
import { GitHubNotifications } from "@/features/github/github-notifications";
import { GitHubPullRequestInbox } from "@/features/github/github-pull-request-inbox";
import { GitHubRepositoryBrowser } from "@/features/github/github-repository-browser";
import { cn } from "@/lib/utils";
import { openExternalUrl, openSettingsWindow } from "@/lib/window";
import { HarborRail, type RailView, type RepositoryTarget } from "./harbor-rail";
import type { WorkspaceSection } from "./workspace-types";

const GitHubDiscovery = lazy(() =>
  import("@/features/github/github-discovery-view").then((module) => ({
    default: module.GitHubDiscoveryView,
  }))
);

const GitHubProjects = lazy(() =>
  import("@/features/github/github-project-view").then((module) => ({
    default: module.GitHubProjects,
  }))
);

const GitHubGists = lazy(() =>
  import("@/features/github/github-gist-view").then((module) => ({
    default: module.GitHubGists,
  }))
);

const GitHubPackages = lazy(() =>
  import("@/features/github/github-packages-view").then((module) => ({
    default: module.GitHubPackagesView,
  }))
);

const GitHubProfile = lazy(() =>
  import("@/features/github/github-profile-view").then((module) => ({
    default: module.GitHubProfileView,
  }))
);

const navItems: Array<{
  id: WorkspaceSection;
  icon: typeof GitPullRequest;
}> = [
  { id: "notifications", icon: Bell },
  { id: "issues", icon: CircleDot },
  { id: "pullRequests", icon: GitPullRequest },
  { id: "projects", icon: LayoutGrid },
  { id: "gists", icon: FileCode2 },
  { id: "packages", icon: PackageOpen },
  { id: "repositories", icon: Library },
  { id: "discover", icon: Compass },
];

function WorkspaceFallback() {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center">
      <Spinner className="text-muted-foreground" />
    </div>
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
    <aside className="harbor-glass harbor-primary-nav workspace-wide:w-[216px] flex min-h-0 w-[54px] shrink-0 flex-col border-r">
      <nav className="flex flex-col gap-1 px-2 py-3" aria-label={t("workspace.primaryNavigation")}>
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
                      ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.045]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={t(`workspace.nav.${item.id}`)}
                >
                  {isActive ? (
                    <span className="bg-primary absolute inset-y-1.5 -left-2 w-0.5 rounded-r" />
                  ) : null}
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="workspace-wide:block hidden min-w-0 flex-1 truncate">
                    {t(`workspace.nav.${item.id}`)}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="workspace-wide:hidden">
                {t(`workspace.nav.${item.id}`)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <Separator className="workspace-wide:mx-3 mx-2 w-auto bg-white/8" />
      <div className="flex-1" />

      <div className="flex flex-col gap-0.5 p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("workspace.account")}
              aria-current={activeSection === "profile" ? "page" : undefined}
              onClick={() => onSectionChange("profile")}
              className={cn(
                "relative flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                activeSection === "profile"
                  ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_20%,transparent)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
              )}
            >
              {activeSection === "profile" ? (
                <span className="bg-primary absolute inset-y-1.5 -left-2 w-0.5 rounded-r" />
              ) : null}
              <UserRound className="size-4" />
              <span className="workspace-wide:inline hidden">{t("workspace.account")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="workspace-wide:hidden">
            {t("workspace.account")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("settings.title")}
              onClick={() => void handleOpenSettings()}
              className="text-muted-foreground hover:text-foreground flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-white/[0.04]"
            >
              <Settings className="size-4" />
              <span className="workspace-wide:inline hidden">{t("settings.title")}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8} className="workspace-wide:hidden">
            {t("settings.title")}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

export function HarborWorkspace() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("discover");
  const [selectedDiscoveryRepository, setSelectedDiscoveryRepository] =
    useState<GitHubDiscoveryRepositoryTarget | null>(null);
  const [selectedGitHubRepository, setSelectedGitHubRepository] = useState<GitHubRepository | null>(
    null
  );
  const [selectedPullRequestRepository, setSelectedPullRequestRepository] =
    useState<GitHubPullRequestRepository | null>(null);
  const [selectedIssueRepository, setSelectedIssueRepository] =
    useState<GitHubIssueRepository | null>(null);
  const [selectedNotificationRepository, setSelectedNotificationRepository] =
    useState<GitHubRepository | null>(null);
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
    activeSection === "notifications"
      ? selectedNotificationRepository
      : activeSection === "issues"
        ? selectedIssueRepository
        : activeSection === "repositories"
          ? selectedGitHubRepository
          : activeSection === "pullRequests"
            ? selectedPullRequestRepository
            : activeSection === "discover"
              ? selectedDiscoveryRepository
              : null;

  const commandRepositoryUrl =
    activeSection === "notifications"
      ? selectedNotificationRepository?.url
      : activeSection === "issues"
        ? selectedIssueRepository?.url
        : activeSection === "repositories"
          ? selectedGitHubRepository?.url
          : activeSection === "pullRequests"
            ? selectedPullRequestRepository?.url
            : activeSection === "discover"
              ? selectedDiscoveryRepository?.url
              : undefined;

  return (
    <WindowFrame
      titleBar={<MainTitleBar onOpenCommand={() => setCommandOpen(true)} />}
      contentClassName="flex min-h-0 flex-1 overflow-hidden"
    >
      <PrimaryNavigation activeSection={activeSection} onSectionChange={setActiveSection} />
      {activeSection === "discover" ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <GitHubDiscovery onSelectRepository={setSelectedDiscoveryRepository} />
        </Suspense>
      ) : activeSection === "notifications" ? (
        <GitHubNotifications onSelectRepository={setSelectedNotificationRepository} />
      ) : activeSection === "issues" ? (
        <GitHubIssueInbox onSelectRepository={setSelectedIssueRepository} />
      ) : activeSection === "repositories" ? (
        <GitHubRepositoryBrowser onSelectRepository={setSelectedGitHubRepository} />
      ) : activeSection === "projects" ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <GitHubProjects />
        </Suspense>
      ) : activeSection === "gists" ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <GitHubGists />
        </Suspense>
      ) : activeSection === "packages" ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <GitHubPackages />
        </Suspense>
      ) : activeSection === "profile" ? (
        <Suspense fallback={<WorkspaceFallback />}>
          <GitHubProfile />
        </Suspense>
      ) : (
        <GitHubPullRequestInbox onSelectRepository={setSelectedPullRequestRepository} />
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
                  {item.id === "discover" ? <CommandShortcut>G D</CommandShortcut> : null}
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
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </WindowFrame>
  );
}
