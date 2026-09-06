import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { UpdaterDialog } from "@/components/updater-dialog";
import { HarborWorkspace } from "@/features/workspace/harbor-workspace";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { registerShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";

const SHORTCUT_KEY = "global-shortcut-show-main";

export default function HomePage() {
  const { t } = useAppTranslation();

  useEffect(() => {
    if (!isTauri()) return;

    const unlistenShortcutChanged = listen<{ shortcut: string }>(
      "shortcut-changed",
      async (event) => {
        const newShortcut = event.payload.shortcut;
        if (newShortcut) {
          await registerShortcut(newShortcut, async () => {
            await toggleWindow("main");
          });
        }
      }
    );

    void invoke("update_tray_menu", {
      showText: t("tray.show"),
      quitText: t("tray.quit"),
    }).catch((error) => console.error("Failed to initialize tray menu:", error));

    const savedShortcut = localStorage.getItem(SHORTCUT_KEY);
    if (savedShortcut) {
      void registerShortcut(savedShortcut, async () => {
        await toggleWindow("main");
      });
    }

    return () => {
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
