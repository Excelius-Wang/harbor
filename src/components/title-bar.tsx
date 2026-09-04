import { useEffect, useState, ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Minus, Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  title?: string;
  showMinimize?: boolean;
  showMaximize?: boolean;
  showClose?: boolean;
  leftActions?: ReactNode;
  centerContent?: ReactNode;
  rightActions?: ReactNode;
  onDoubleClick?: () => void;
  size?: "default" | "workspace";
  className?: string;
}

export function TitleBar({
  title,
  showMinimize = true,
  showMaximize = true,
  showClose = true,
  leftActions,
  centerContent,
  rightActions,
  onDoubleClick,
  size = "default",
  className,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!showMaximize || !isTauri()) return;

    const appWindow = getCurrentWebviewWindow();

    // Initialize maximized state
    appWindow.isMaximized().then(setIsMaximized);

    // Listen for window resize events
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showMaximize]);

  const handleMinimize = async () => {
    if (!isTauri()) return;
    const appWindow = getCurrentWebviewWindow();
    await appWindow.minimize();
  };

  const handleToggleMaximize = async () => {
    if (!isTauri()) return;
    const appWindow = getCurrentWebviewWindow();
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    if (!isTauri()) return;
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  useEffect(() => {
    if (!showClose || !isTauri()) {
      return;
    }

    const appWindow = getCurrentWebviewWindow();
    if (appWindow.label === "main") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      void handleClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showClose]);

  const handleDragRegionDoubleClick = () => {
    if (onDoubleClick) {
      onDoubleClick();
    } else if (showMaximize) {
      handleToggleMaximize();
    }
  };

  return (
    <div
      className={cn(
        "harbor-glass relative flex items-center justify-between border-b select-none",
        size === "workspace" ? "h-[52px]" : "h-8",
        showMaximize && isMaximized
          ? ""
          : size === "workspace"
            ? "rounded-t-[12px]"
            : "rounded-t-lg",
        className
      )}
    >
      {/* Left: Title + Drag region */}
      <div
        data-tauri-drag-region
        onDoubleClick={handleDragRegionDoubleClick}
        className="flex h-full grow items-center gap-2 pl-2"
      >
        {title && <span className="text-sm font-medium text-slate-400">{title}</span>}
        {leftActions}
      </div>

      {centerContent ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">{centerContent}</div>
        </div>
      ) : null}

      {/* Right: Control buttons */}
      <div className="relative z-10 flex h-full items-center">
        {rightActions}

        {rightActions && (showMinimize || showMaximize || showClose) && (
          <div className="bg-border/40 mx-1 h-4 w-px" />
        )}

        {showMinimize && (
          <button
            onClick={handleMinimize}
            className="title-bar-control"
            aria-label="Minimize"
            tabIndex={-1}
          >
            <Minus className="h-4 w-4" />
          </button>
        )}

        {showMaximize && (
          <button
            onClick={handleToggleMaximize}
            className="title-bar-control"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            tabIndex={-1}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        )}

        {showClose && (
          <button
            onClick={handleClose}
            className="title-bar-control hover:bg-destructive hover:text-destructive-foreground"
            aria-label="Close"
            tabIndex={-1}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
