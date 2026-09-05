import { useCallback, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Github,
  Info,
  Languages,
  Moon,
  Search,
  Settings,
  Sun,
  Waves,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/theme-provider";
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
};

export function MainTitleBar({ onOpenCommand }: MainTitleBarProps) {
  const { theme, setTheme } = useTheme();
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
    setTheme(theme === "dark" ? "light" : "dark");
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
            <div className="mr-3 flex items-center gap-2.5 pl-1">
              <span className="border-primary/20 bg-primary/9 text-primary grid size-8 place-items-center rounded-[8px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <Waves className="size-4" strokeWidth={1.8} />
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.025em] max-[720px]:hidden">
                Harbor
              </span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="title-bar-btn disabled:pointer-events-none disabled:opacity-45"
                  aria-label={t("workspace.history.back")}
                  disabled
                >
                  <ArrowLeft className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={7}>
                {t("workspace.history.back")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="title-bar-btn disabled:pointer-events-none disabled:opacity-45"
                  aria-label={t("workspace.history.forward")}
                  disabled
                >
                  <ArrowRight className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={7}>
                {t("workspace.history.forward")}
              </TooltipContent>
            </Tooltip>
          </div>
        }
        centerContent={
          <button
            type="button"
            onClick={onOpenCommand}
            className="group text-muted-foreground hover:text-foreground focus-visible:ring-primary/60 flex h-9 w-[clamp(260px,36vw,480px)] items-center gap-2 rounded-[8px] border border-white/[0.08] bg-black/[0.07] px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-white/14 hover:bg-white/[0.035] focus-visible:ring-2 focus-visible:outline-none max-[820px]:w-56 max-[620px]:hidden"
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
                  className="focus-visible:ring-primary/60 mr-1 flex h-9 items-center gap-1 rounded-[8px] px-1.5 transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={t("workspace.accountMenu")}
                >
                  <span className="grid size-6 place-items-center rounded-full bg-white/10 text-[11px] font-medium">
                    {accountInitial}
                  </span>
                  <ChevronDown className="text-muted-foreground size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="harbor-popover w-48">
                <DropdownMenuLabel>
                  <p className="text-xs font-medium">{accountLabel}</p>
                  <p className="text-muted-foreground mt-0.5 text-[10px] font-normal">
                    {githubConnection.connected
                      ? t("workspace.github.secureStorage")
                      : t("workspace.github.notConnected")}
                  </p>
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
                  {theme === "dark" ? <Sun /> : <Moon />} {t("theme.toggle")}
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
