import { convertToShortcut } from "@/lib/shortcut";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ShortcutInputProps {
  value?: string;
  onChange?: (value: string) => void;
  describedBy?: string;
  disabled?: boolean;
}

export function ShortcutInput({ value, onChange, describedBy, disabled }: ShortcutInputProps) {
  const { t } = useTranslation();

  const handleKeydown = (event: React.KeyboardEvent) => {
    // Keep ordinary Tab and Shift+Tab available for leaving the capture control.
    if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Backspace" || event.key === "Delete") {
      onChange?.("");
      return;
    }
    const shortcut = convertToShortcut(event.nativeEvent);
    if (shortcut && !shortcut.endsWith("+")) onChange?.(shortcut);
  };

  return (
    <div className="flex w-52 max-w-full items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        aria-describedby={describedBy}
        disabled={disabled}
        className="h-auto min-h-9 min-w-0 flex-1 px-2 py-1.5 whitespace-normal"
        onKeyDown={handleKeydown}
      >
        <span className="sr-only">{t("settings.shortcut.showMain")}</span>
        {value ? (
          <kbd className="font-mono text-xs wrap-anywhere">{value}</kbd>
        ) : (
          <span className="text-muted-foreground">{t("settings.shortcut.placeholder")}</span>
        )}
      </Button>
      {value ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={t("settings.shortcut.clear")}
              onClick={() => onChange?.("")}
            >
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("settings.shortcut.clear")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
