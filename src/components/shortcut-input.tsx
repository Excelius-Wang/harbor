import { convertToShortcut } from "@/lib/shortcut";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

interface ShortcutInputProps {
  value?: string;
  onChange?: (value: string) => void;
}

export function ShortcutInput({ value, onChange }: ShortcutInputProps) {
  const { t } = useTranslation();

  const handleKeydown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear shortcut on Backspace or Delete
    if (e.key === "Backspace" || e.key === "Delete") {
      onChange?.("");
      return;
    }

    const shortcut = convertToShortcut(e.nativeEvent);
    // Only trigger onChange for complete shortcuts (must include modifier + main key)
    if (shortcut && !shortcut.endsWith("+")) {
      onChange?.(shortcut);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  return (
    <div
      className={cn(
        "border-input bg-background flex h-9 w-40 cursor-pointer items-center justify-between rounded-md border px-2 text-sm select-none",
        "focus:ring-ring focus:ring-offset-background focus:ring-2 focus:ring-offset-2 focus:outline-none",
        !value && "text-muted-foreground justify-center"
      )}
      tabIndex={0}
      onKeyDown={handleKeydown}
    >
      <span className="flex-1 text-center">{value || t("settings.shortcut.placeholder")}</span>
      {value && (
        <button
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground ml-1 flex-shrink-0"
          tabIndex={-1}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
