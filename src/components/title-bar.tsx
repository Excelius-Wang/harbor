import { useEffect, useState, type ReactNode } from "react";
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

type TrafficLightProps = {
  kind: "close" | "minimize" | "maximize";
  label: string;
  onPress: () => void | Promise<void>;
  children: ReactNode;
};

function TrafficLight({ kind, label, onPress, children }: TrafficLightProps) {
  return (
    <button
      type="button"
      className="title-bar-traffic-control"
      data-window-control={kind}
      aria-label={label}
      tabIndex={-1}
      onClick={() => void onPress()}
    >
      <span className="title-bar-traffic-dot">{children}</span>
    </button>
  );
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
  const hasWindowControls = showClose || showMinimize || showMaximize;

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
      {hasWindowControls ? (
        <div
          role="group"
          aria-label="Window controls"
          className="harbor-traffic-lights relative z-20 flex h-full shrink-0 items-center gap-0.5 pr-2 pl-3"
        >
          {showClose ? (
            <TrafficLight kind="close" label="Close" onPress={handleClose}>
              <X className="title-bar-traffic-glyph" strokeWidth={2.6} />
            </TrafficLight>
          ) : null}
          {showMinimize ? (
            <TrafficLight kind="minimize" label="Minimize" onPress={handleMinimize}>
              <Minus className="title-bar-traffic-glyph" strokeWidth={2.6} />
            </TrafficLight>
          ) : null}
          {showMaximize ? (
            <TrafficLight
              kind="maximize"
              label={isMaximized ? "Restore" : "Maximize"}
              onPress={handleToggleMaximize}
            >
              {isMaximized ? (
                <Minimize2 className="title-bar-traffic-glyph" strokeWidth={2.4} />
              ) : (
                <Maximize2 className="title-bar-traffic-glyph" strokeWidth={2.4} />
              )}
            </TrafficLight>
          ) : null}
        </div>
      ) : null}

      <div
        data-tauri-drag-region
        onDoubleClick={handleDragRegionDoubleClick}
        className={cn(
          "flex h-full min-w-0 grow items-center gap-2",
          hasWindowControls ? "pl-0" : "pl-2"
        )}
      >
        {title && <span className="text-sm font-medium text-slate-400">{title}</span>}
        {leftActions}
      </div>

      {centerContent ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto">{centerContent}</div>
        </div>
      ) : null}

      {rightActions ? (
        <div className="relative z-10 flex h-full items-center">{rightActions}</div>
      ) : null}
    </div>
  );
}
