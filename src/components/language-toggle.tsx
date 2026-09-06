import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  const toggleLanguage = async () => {
    const newLang = i18n.language.startsWith("zh") ? "en" : "zh";
    await i18n.changeLanguage(newLang);

    // Update tray menu with new language
    try {
      await invoke("update_tray_menu", {
        showText: t("tray.show", { lng: newLang }),
        quitText: t("tray.quit", { lng: newLang }),
      });
    } catch (error) {
      console.error("Failed to update tray menu:", error);
    }

    // Emit event to sync language across windows
    await emit("language-changed", { language: newLang });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void toggleLanguage()}
      aria-label={t("language.toggle")}
      title={i18n.language.startsWith("zh") ? "Switch to English" : "Switch to 中文"}
    >
      <Languages />
      {t(i18n.language.startsWith("zh") ? "language.zh" : "language.en")}
    </Button>
  );
}
