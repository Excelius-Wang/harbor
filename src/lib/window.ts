import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { emit, once } from "@tauri-apps/api/event";

const createWindowLoading: Record<string, boolean> = {};
const destroyTimers: Record<string, number> = {};
const destroyVersions: Record<string, number> = {};

export function cancelDestroyWindow(label: string) {
  destroyVersions[label] = (destroyVersions[label] ?? 0) + 1;

  if (destroyTimers[label]) {
    clearTimeout(destroyTimers[label]);
    delete destroyTimers[label];
    console.log("Cleared window destroy timer:", label);
  }
}

/**
 * Calculate centered position of child window relative to parent window
 * @param width Child window width (logical pixels)
 * @param height Child window height (logical pixels)
 * @param parentLabel Parent window label, defaults to current window
 * @returns Centered position coordinates or center flag
 */
async function calcCenterPosition(
  width: number,
  height: number,
  parentLabel?: string
): Promise<{ center: true } | { x: number; y: number }> {
  const parentWindow = parentLabel
    ? await WebviewWindow.getByLabel(parentLabel)
    : WebviewWindow.getCurrent();

  if (!parentWindow) {
    return { center: true };
  }

  try {
    // Use screen center if parent window is minimized
    if (await parentWindow.isMinimized()) {
      return { center: true };
    }

    const position = await parentWindow.outerPosition();
    const size = await parentWindow.outerSize();
    const scaleFactor = await parentWindow.scaleFactor();

    // Validate all values exist
    if (!position || !size || !scaleFactor) {
      console.warn("Unable to get parent window info, using screen center");
      return { center: true };
    }

    // Calculate centered position (considering DPI scaling)
    const x = (position.x + (size.width - width * scaleFactor) / 2) / scaleFactor;
    const y = (position.y + (size.height - height * scaleFactor) / 2) / scaleFactor;

    // Validate calculation result
    if (isNaN(x) || isNaN(y)) {
      console.warn("Position calculation failed, using screen center");
      return { center: true };
    }

    return { x, y };
  } catch (e) {
    console.warn("Failed to calculate centered position:", e);
    return { center: true };
  }
}

export async function toggleWindow(label: string) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }
  if ((await window.isVisible()) && !(await window.isMinimized()) && (await window.isFocused())) {
    await window.hide();
  } else {
    await showWindow(label);
  }
}

export async function showWindow(label: string) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }

  cancelDestroyWindow(label);

  if (!(await window.isVisible())) {
    await window.show();
  }
  if (await window.isMinimized()) {
    await window.unminimize();
  }
  if (!(await window.isFocused())) {
    await window.setFocus();
  }
}

export async function hideWindow(label: string, destroyDelay = 5000) {
  const window = await WebviewWindow.getByLabel(label);
  if (!window) {
    return;
  }

  await window.hide();

  // Destroy after hiding with delay
  await destroyWindow(label, destroyDelay);
}

export async function destroyWindow(label: string, delay = 0) {
  if (!delay) {
    const window = await WebviewWindow.getByLabel(label);
    if (!window) {
      return;
    }

    // Destroy immediately
    await emit("destroy-window:" + label);
    await window.destroy();
  } else {
    // Destroy with delay
    const destroyVersion = (destroyVersions[label] ?? 0) + 1;
    destroyVersions[label] = destroyVersion;

    const window = await WebviewWindow.getByLabel(label);
    if (!window) {
      return;
    }

    if (destroyTimers[label]) {
      clearTimeout(destroyTimers[label]);
    }

    await window.hide();
    destroyTimers[label] = setTimeout(async () => {
      if (destroyVersions[label] !== destroyVersion) {
        return;
      }

      delete destroyTimers[label];

      const currentWindow = await WebviewWindow.getByLabel(label);
      if (!currentWindow) {
        return;
      }

      if (destroyVersions[label] !== destroyVersion) {
        return;
      }

      await emit("destroy-window:" + label);
      await currentWindow.destroy();
      delete destroyVersions[label];
    }, delay) as unknown as number;
    console.log(`Window will be destroyed in ${delay}ms:`, label);
  }
}

export async function createWindow(
  label: string,
  options: {
    title?: string;
    url?: string;
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    resizable?: boolean;
    maximizable?: boolean;
    minimizable?: boolean;
    closable?: boolean;
    center?: boolean;
    x?: number;
    y?: number;
    decorations?: boolean;
    transparent?: boolean;
    alwaysOnTop?: boolean;
    skipTaskbar?: boolean;
    shadow?: boolean;
    parent?: string;
  },
  handlers?: {
    onCreated?: () => void;
    onDestroy?: () => void;
    onError?: () => void;
  }
) {
  cancelDestroyWindow(label);

  if (createWindowLoading[label]) {
    return;
  }
  createWindowLoading[label] = true;

  try {
    const window = await WebviewWindow.getByLabel(label);

    // If window already exists, center and show it
    if (window) {
      console.log("Window already exists, showing:", label);

      if (options.parent) {
        try {
          const size = await window.outerSize();
          const scaleFactor = await window.scaleFactor();
          const width = size.width / scaleFactor;
          const height = size.height / scaleFactor;

          const centerPos = await calcCenterPosition(width, height, options.parent);
          if ("center" in centerPos) {
            await window.center();
          } else {
            await window.setPosition(new LogicalPosition(centerPos.x, centerPos.y));
          }
        } catch (error) {
          console.error("Failed to center window:", error);
        }
      }

      await showWindow(label);
      createWindowLoading[label] = false;
      return;
    }

    // Create new window with centered position
    const finalOptions = { ...options };
    if (options.parent && !options.x && !options.y) {
      const width = options.width || 500;
      const height = options.height || 400;
      const centerPos = await calcCenterPosition(width, height, options.parent);

      if ("center" in centerPos) {
        finalOptions.center = true;
      } else {
        finalOptions.x = centerPos.x;
        finalOptions.y = centerPos.y;
        finalOptions.center = false;
      }
    }

    const webview = new WebviewWindow(label, finalOptions);
    await webview.once("tauri://created", async () => {
      console.log("Window created successfully:", label);
      handlers?.onCreated?.();

      // Register destroy callback
      if (handlers?.onDestroy) {
        await once("destroy-window:" + label, () => {
          console.log("Window destroyed:", label);
          handlers.onDestroy?.();
        });
      }
    });
    await webview.once("tauri://error", (e) => {
      console.log("Failed to create window:", label, e);
      handlers?.onError?.();
    });
  } finally {
    createWindowLoading[label] = false;
  }
}
