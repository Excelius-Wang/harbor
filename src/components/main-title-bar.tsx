import { useCallback, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  CheckCircle2,
  ChevronDown,
  Github,
  Info,
  Languages,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/theme-provider";
import { BrandMark } from "@/components/brand-mark";
import { TitleBar } from "@/components/title-bar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  cacheGitHubConnection,
  readCachedGitHubConnection,
  type GitHubConnection,
} from "@/features/github/github-connection";
import { GitHubConnectionDialog } from "@/features/github/github-connection-dialog";
import { createWindow, openSettingsWindow } from "@/lib/window";

type MainTitleBarProps = {
  onOpenCommand?: () => void;
  navigationExpanded?: boolean;
  onToggleNavigation?: () => void;
};

export function MainTitleBar({
  onOpenCommand,
  navigationExpanded = true,
  onToggleNavigation,
}: MainTitleBarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [githubConnection, setGithubConnection] = useState<GitHubConnection>(() =>
    readCachedGitHubConnection()
  );

  const handleConnectionChange = useCallback((connection: GitHubConnection) => {
    cacheGitHubConnection(connection);
    setGithubConnection(connection);
  }, []);

  const handleToggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const handleOpenAbout = async () => {
    if (!isTauri()) return;
    await createWindow("about", {
      title: t("about.title"),
      url: "/about",
      width: 500,
      height: 400,
      resizable: false,
      maximizable: false,
      minimizable: false,
      decorations: false,
      transparent: true,
      shadow: true,
      alwaysOnTop: true,
      parent: "main",
    });
  };

  const handleOpenSettings = async () => {
    if (!isTauri()) return;
    await openSettingsWindow(t("settings.title"));
  };

  const switchLanguage = () => {
    void i18n.changeLanguage(i18n.language.startsWith("zh") ? "en" : "zh");
  };

  const accountLabel = githubConnection.identity?.login ?? t("workspace.github.notConnected");
  const accountInitial = githubConnection.identity?.login.charAt(0).toUpperCase() ?? "G";

  return (
    <>
      <TitleBar
        size="workspace"
        className="border-transparent bg-transparent shadow-none"
        leftActions={
          <div className="relative z-10 flex h-full items-center gap-1.5">
            <div className="mr-3 flex items-center gap-3 pl-2">
              <div
                className="text-foreground flex shrink-0 items-center gap-1.5"
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <BrandMark className="h-[22px] w-6" />
                <span className="text-sm font-medium tracking-[-0.015em] max-[720px]:hidden">
                  {t("app.title")}
                </span>
              </div>
              {onToggleNavigation ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring grid size-8 shrink-0 cursor-pointer place-items-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 motion-reduce:transition-none"
                      onClick={onToggleNavigation}
                      onDoubleClick={(event) => event.stopPropagation()}
                      aria-expanded={navigationExpanded}
                      aria-controls="harbor-primary-navigation"
                      aria-label={t(
                        navigationExpanded
                          ? "workspace.collapseNavigation"
                          : "workspace.expandNavigation"
                      )}
                    >
                      <PanelLeft className="size-[18px]" strokeWidth={1.7} aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" sideOffset={7}>
                    {t(
                      navigationExpanded
                        ? "workspace.collapseNavigation"
                        : "workspace.expandNavigation"
                    )}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </div>
        }
        centerContent={
          <button
            type="button"
            onClick={onOpenCommand}
            className="harbor-control text-muted-foreground hover:text-foreground hover:bg-accent/70 focus-visible:ring-ring flex h-9 w-[clamp(260px,36vw,480px)] items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none max-[820px]:w-56 max-[620px]:hidden"
          >
            <Search className="size-3.5" />
            <span className="truncate">{t("workspace.command.trigger")}</span>
            <kbd className="ml-auto">⌘K</kbd>
          </button>
        }
        rightActions={
          <>
            <div className="text-muted-foreground mr-1 hidden items-center gap-1.5 px-2 text-[11px] min-[960px]:flex">
              <CheckCircle2 className="text-primary size-3.5" />
              {githubConnection.connected
                ? t("workspace.github.connected")
                : t("workspace.github.local")}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="focus-visible:ring-ring hover:bg-accent/70 mr-1 flex h-9 items-center gap-1 rounded-[8px] px-1.5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={t("workspace.accountMenu")}
                  title={t("workspace.accountMenu")}
                >
                  <span className="bg-muted grid size-6 place-items-center rounded-full text-[11px] font-medium">
                    {accountInitial}
                  </span>
                  <ChevronDown className="text-muted-foreground size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="harbor-popover w-48">
                <DropdownMenuLabel>
                  <p className="text-xs font-medium">{accountLabel}</p>
                  {githubConnection.connected ? (
                    <p className="text-muted-foreground mt-0.5 text-[11px] font-normal">
                      {t("workspace.github.secureStorage")}
                    </p>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setGithubDialogOpen(true)}>
                  <Github />
                  {githubConnection.connected
                    ? t("workspace.github.manage")
                    : t("workspace.github.login")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void handleOpenSettings()}>
                  <Settings /> {t("settings.title")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={switchLanguage}>
                  <Languages /> {t("language.toggle")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleToggleTheme}>
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />} {t("theme.toggle")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleOpenAbout()}>
                  <Info /> {t("about.title")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <GitHubConnectionDialog
        open={githubDialogOpen}
        onOpenChange={setGithubDialogOpen}
        connection={githubConnection}
        onConnectionChange={handleConnectionChange}
      />
    </>
  );
}
