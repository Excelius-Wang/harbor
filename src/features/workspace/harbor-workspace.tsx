import { lazy, Suspense, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  Bell,
  CircleDot,
  Compass,
  Ellipsis,
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
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
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
import { openExternalUrl, openSettingsWindow } from "@/lib/window";
import { HarborRail, type RailView, type RepositoryTarget } from "./harbor-rail";
import type { WorkspaceSection } from "./workspace-types";
import { cn } from "@/lib/utils";
import { NavigationButton } from "./navigation-button";

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

type NavigationItem = {
  id: WorkspaceSection;
  icon: typeof GitPullRequest;
};

const primaryNavItems: NavigationItem[] = [
  { id: "notifications", icon: Bell },
  { id: "issues", icon: CircleDot },
  { id: "pullRequests", icon: GitPullRequest },
  { id: "repositories", icon: Library },
  { id: "discover", icon: Compass },
];

const secondaryNavItems: NavigationItem[] = [
  { id: "projects", icon: LayoutGrid },
  { id: "gists", icon: FileCode2 },
  { id: "packages", icon: PackageOpen },
];

const navItems = [...primaryNavItems, ...secondaryNavItems];

function WorkspaceFallback() {
  const { t } = useTranslation();

  return (
    <section
      role="status"
      aria-busy="true"
      aria-label={t("workspace.loading")}
      className="harbor-content flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b px-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-28" />
        </div>
        <Skeleton className="h-8 w-24" />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="workspace-wide:w-[320px] flex min-h-0 w-full shrink-0 flex-col border-r">
          <div className="border-b p-3">
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="flex flex-col gap-1.5 p-2">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg p-3">
                <Skeleton className="size-8 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="workspace-wide:flex hidden min-h-0 min-w-0 flex-1 flex-col gap-4 p-5">
          <div className="flex flex-col gap-2 border-b pb-4">
            <Skeleton className="h-6 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      </div>
    </section>
  );
}

function PrimaryNavigation({
  expanded,
  activeSection,
  onSectionChange,
}: {
  expanded: boolean;
  activeSection: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
}) {
  const { t } = useTranslation();

  const handleOpenSettings = async () => {
    if (!isTauri()) return;
    await openSettingsWindow(t("settings.title"));
  };
  const activeSecondaryItem = secondaryNavItems.find((item) => item.id === activeSection);
  const SecondaryIcon = activeSecondaryItem?.icon ?? Ellipsis;

  return (
    <aside
      id="harbor-primary-navigation"
      data-expanded={expanded}
      className={cn(
        "harbor-pane harbor-primary-nav harbor-subtle-divider flex min-h-0 shrink-0 flex-col border-r",
        expanded ? "w-[226px]" : "w-[58px]"
      )}
    >
      <nav
        className={cn("flex flex-col gap-1.5 py-4", expanded ? "px-2.5" : "px-2")}
        aria-label={t("workspace.primaryNavigation")}
      >
        {primaryNavItems.map((item) => (
          <NavigationButton
            expanded={expanded}
            key={item.id}
            icon={item.icon}
            label={t(`workspace.nav.${item.id}`)}
            active={activeSection === item.id}
            onClick={() => onSectionChange(item.id)}
          />
        ))}

        <Separator
          className={cn(
            "bg-border/40 my-2 data-[orientation=horizontal]:w-auto!",
            expanded ? "mx-4" : "mx-2"
          )}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <NavigationButton
              expanded={expanded}
              icon={SecondaryIcon}
              label={t("workspace.nav.more")}
              caption={
                activeSecondaryItem ? t(`workspace.nav.${activeSecondaryItem.id}`) : undefined
              }
              active={Boolean(activeSecondaryItem)}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="harbor-popover w-48">
            <DropdownMenuGroup>
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.id} onSelect={() => onSectionChange(item.id)}>
                    <Icon />
                    {t(`workspace.nav.${item.id}`)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="flex-1" />

      <div className={cn("flex flex-col gap-1.5 py-2.5 pb-4", expanded ? "px-2.5" : "px-2")}>
        <NavigationButton
          expanded={expanded}
          icon={UserRound}
          label={t("workspace.account")}
          active={activeSection === "profile"}
          onClick={() => onSectionChange("profile")}
        />
        <NavigationButton
          expanded={expanded}
          icon={Settings}
          label={t("settings.title")}
          onClick={() => void handleOpenSettings()}
        />
      </div>
    </aside>
  );
}

export function HarborWorkspace() {
  const { t } = useTranslation();
  const [navigationExpanded, setNavigationExpanded] = useState(() => {
    try {
      return localStorage.getItem("harbor-navigation-expanded") !== "false";
    } catch {
      return true;
    }
  });
  const toggleNavigation = () => {
    const expanded = !navigationExpanded;
    setNavigationExpanded(expanded);
    try {
      localStorage.setItem("harbor-navigation-expanded", String(expanded));
    } catch {
      /* Navigation remains usable when storage is unavailable. */
    }
  };
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
  const [railView, setRailView] = useState<RailView>("harbor");

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
      titleBar={
        <MainTitleBar
          navigationExpanded={navigationExpanded}
          onToggleNavigation={toggleNavigation}
          onOpenCommand={() => setCommandOpen(true)}
        />
      }
      contentClassName="harbor-workspace-shell flex min-h-0 flex-1 overflow-hidden"
    >
      <Toaster />
      <PrimaryNavigation
        expanded={navigationExpanded}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
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
        className="max-w-xl"
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
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </WindowFrame>
  );
}
