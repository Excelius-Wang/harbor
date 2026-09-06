import { useCallback, useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavigationButton } from "@/features/workspace/navigation-button";
import { TitleBar } from "@/components/title-bar";
import { WindowFrame } from "@/components/window-frame";
import { LanguageToggle } from "@/components/language-toggle";
import { ShortcutInput } from "@/components/shortcut-input";
import { Moon, Sun, Monitor, Palette, Keyboard } from "lucide-react";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";

const SHORTCUT_KEY = "global-shortcut-show-main";

type SettingSection = "appearance" | "shortcut";

function SettingsContents() {
  const [shortcut, setShortcut] = useState<string>("");
  const [shortcutPending, setShortcutPending] = useState(false);
  const [shortcutError, setShortcutError] = useState(false);
  const changingShortcut = useRef(false);
  const [activeSection, setActiveSection] = useState<SettingSection>("appearance");
  const { t } = useAppTranslation();
  const { theme, setTheme } = useTheme();

  const handleShowMainWindow = useCallback(async () => {
    await toggleWindow("main");
  }, []);

  useEffect(() => {
    // Load saved shortcut
    const savedShortcut = localStorage.getItem(SHORTCUT_KEY);
    if (savedShortcut) {
      setShortcut(savedShortcut);
      registerShortcut(savedShortcut, handleShowMainWindow);
    }
  }, [handleShowMainWindow]);

  const handleShortcutChange = async (newShortcut: string) => {
    if (changingShortcut.current || newShortcut === shortcut) return;
    changingShortcut.current = true;
    setShortcutPending(true);
    setShortcutError(false);
    try {
      const changed = newShortcut
        ? await registerShortcut(newShortcut, handleShowMainWindow, shortcut)
        : await unregisterShortcut(shortcut);
      if (!changed) {
        setShortcutError(true);
        return;
      }
      setShortcut(newShortcut);
      if (newShortcut) localStorage.setItem(SHORTCUT_KEY, newShortcut);
      else localStorage.removeItem(SHORTCUT_KEY);
      await emit("shortcut-changed", { shortcut: newShortcut }).catch((error) => {
        console.error("Failed to notify other windows about the shortcut:", error);
      });
      if (newShortcut) toast.success(t("settings.shortcut.setSuccess", { shortcut: newShortcut }));
      else toast.info(t("settings.shortcut.cleared"));
    } finally {
      changingShortcut.current = false;
      setShortcutPending(false);
    }
  };

  const menuItems = [
    {
      id: "appearance" as SettingSection,
      label: t("settings.appearance.title"),
      icon: Palette,
    },
    {
      id: "shortcut" as SettingSection,
      label: t("settings.shortcut.title"),
      icon: Keyboard,
    },
  ];

  return (
    <>
      <Toaster />
      <aside className="harbor-subtle-divider flex w-40 shrink-0 flex-col border-r p-3">
        <nav aria-label={t("settings.title")} className="flex-1 space-y-1">
          {menuItems.map((item) => (
            <NavigationButton
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeSection === item.id}
              alwaysExpanded
              onClick={() => setActiveSection(item.id)}
            />
          ))}
        </nav>
      </aside>
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="max-w-3xl p-5">
          {activeSection === "appearance" ? (
            <section className="space-y-5">
              <header>
                <h1 className="text-2xl leading-7 font-semibold tracking-tight">
                  {t("settings.appearance.title")}
                </h1>
                <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                  {t("settings.appearance.description")}
                </p>
              </header>
              <div className="harbor-subtle-divider flex flex-wrap items-center justify-between gap-4 border-b py-4">
                <span id="settings-theme-label" className="text-[13px] font-medium">
                  {t("settings.appearance.theme")}
                </span>
                <div
                  role="group"
                  aria-labelledby="settings-theme-label"
                  className="flex flex-wrap gap-2"
                >
                  {(["light", "dark", "system"] as const).map((value) => {
                    const Icon = value === "light" ? Sun : value === "dark" ? Moon : Monitor;
                    return (
                      <Button
                        key={value}
                        type="button"
                        variant={theme === value ? "default" : "outline"}
                        size="sm"
                        aria-pressed={theme === value}
                        onClick={() => setTheme(value)}
                      >
                        <Icon />
                        {t(`settings.appearance.${value}`)}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <span className="text-[13px] font-medium">{t("settings.appearance.language")}</span>
                <LanguageToggle />
              </div>
            </section>
          ) : (
            <section className="space-y-5">
              <header>
                <h1 className="text-2xl leading-7 font-semibold tracking-tight">
                  {t("settings.shortcut.title")}
                </h1>
                <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                  {t("settings.shortcut.description")}
                </p>
              </header>
              <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-40 flex-1">
                  <p className="text-[13px] font-medium">{t("settings.shortcut.showMain")}</p>
                  <p
                    id="settings-shortcut-description"
                    className="text-muted-foreground mt-1 text-xs leading-5"
                  >
                    {t("settings.shortcut.showMainDesc")}
                  </p>
                </div>
                <ShortcutInput
                  value={shortcut}
                  onChange={(value) => void handleShortcutChange(value)}
                  disabled={shortcutPending}
                  describedBy="settings-shortcut-description"
                />
              </div>
              {shortcutPending ? (
                <p role="status" className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Spinner className="size-3" />
                  {t("settings.shortcut.updating")}
                </p>
              ) : null}
              {shortcutError ? (
                <Alert variant="destructive">
                  <AlertDescription>{t("settings.shortcut.updateFailed")}</AlertDescription>
                </Alert>
              ) : null}
            </section>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

export default function SettingsPage() {
  const { t } = useAppTranslation();
  return (
    <WindowFrame
      titleBar={<TitleBar title={t("settings.title")} showMaximize={false} />}
      contentClassName="harbor-workspace-shell flex min-h-0 flex-1 overflow-hidden"
    >
      <SettingsContents />
    </WindowFrame>
  );
}
