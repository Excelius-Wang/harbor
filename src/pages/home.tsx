import { useEffect } from "react";
import { toast } from "sonner";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { UpdaterDialog } from "@/components/updater-dialog";
import { HarborWorkspace } from "@/features/workspace/harbor-workspace";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { registerShortcut } from "@/lib/shortcut";
import { openSettingsWindow, toggleWindow } from "@/lib/window";

const SHORTCUT_KEY = "global-shortcut-show-main";

export default function HomePage() {
  const { t } = useAppTranslation();

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    const showRestoreResult = (shortcut: string, restored: boolean) => {
      if (!active || (localStorage.getItem(SHORTCUT_KEY) ?? "") !== shortcut) return;
      if (restored) toast.dismiss("shortcut-restore");
      else
        toast.error(t("settings.shortcut.restoreFailed"), {
          id: "shortcut-restore",
          action: {
            label: t("settings.title"),
            onClick: () => {
              void openSettingsWindow(t("settings.title")).catch((error) =>
                console.error("Failed to open shortcut settings:", error)
              );
            },
          },
        });
    };
    const unlistenShortcutPressed = listen("shortcut-pressed", () => {
      void toggleWindow("main").catch((error) =>
        console.error("Failed to toggle main window:", error)
      );
    });
    const unlistenShortcutChanged = listen<{ shortcut: string; restored?: boolean }>(
      "shortcut-changed",
      (event) => showRestoreResult(event.payload.shortcut, event.payload.restored ?? true)
    );

    void invoke("update_tray_menu", {
      showText: t("tray.show"),
      quitText: t("tray.quit"),
    }).catch((error) => console.error("Failed to initialize tray menu:", error));

    const savedShortcut = localStorage.getItem(SHORTCUT_KEY);
    if (savedShortcut) {
      void registerShortcut(savedShortcut).then((restored) =>
        showRestoreResult(savedShortcut, restored)
      );
    }

    return () => {
      active = false;
      void unlistenShortcutPressed.then((unlisten) => unlisten());
      void unlistenShortcutChanged.then((unlisten) => unlisten());
    };
  }, [t]);

  return (
    <>
      {isTauri() ? <UpdaterDialog /> : null}
      <HarborWorkspace />
    </>
  );
}
