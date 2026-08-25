import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function useAppTranslation() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!isTauri()) return;

    const unlistenLanguageChanged = listen<{ language: string }>("language-changed", (event) => {
      i18n.changeLanguage(event.payload.language);
    });

    return () => {
      unlistenLanguageChanged.then((fn) => fn());
    };
  }, [i18n]);

  return { t };
}
