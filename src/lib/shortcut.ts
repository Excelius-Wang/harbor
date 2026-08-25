import {
  isRegistered,
  register,
  unregister,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";

export function convertToShortcut(event: KeyboardEvent): string {
  const keys: string[] = [];

  // Check if modifier keys are pressed
  if (event.ctrlKey) {
    keys.push("Ctrl");
  } else if (event.metaKey) {
    keys.push("Cmd");
  }
  if (event.altKey) {
    keys.push("Alt");
  }
  if (event.shiftKey) {
    keys.push("Shift");
  }

  // Must have modifier keys
  if (!keys.length) {
    return "";
  }

  // Get the main key pressed
  let mainKey = event.key;

  // Ignore standalone modifier keys
  if (mainKey === "Control" || mainKey === "Meta" || mainKey === "Alt" || mainKey === "Shift") {
    mainKey = "";
  }

  // Convert special key names to standard format
  const keyMap: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Escape: "Esc",
    Enter: "Enter",
  };

  // Use mapped value if key exists in keyMap
  if (keyMap[mainKey]) {
    mainKey = keyMap[mainKey];
  } else if (mainKey.length === 1) {
    // Ensure single character keys are uppercase
    mainKey = mainKey.toUpperCase();
  }

  // Add main key to array
  keys.push(mainKey);

  // Build final shortcut string
  const shortcut = keys.join("+");
  console.log("Captured shortcut:", shortcut);
  return shortcut;
}

export async function registerShortcut(
  shortcut: string,
  callback: () => void,
  oldShortcut?: string
): Promise<void> {
  if (oldShortcut) {
    await unregisterShortcut(oldShortcut);
  }
  await unregisterShortcut(shortcut);
  try {
    await register(shortcut, (event) => {
      if (event.state === "Pressed") {
        callback();
      }
    });
    console.log("Shortcut registered successfully:", shortcut);
  } catch (e) {
    console.error("Failed to register shortcut:", e);
  }
}

export async function unregisterShortcut(shortcut?: string): Promise<void> {
  if (!shortcut) {
    return;
  }
  try {
    if (!(await isRegistered(shortcut))) {
      return;
    }
    await unregister(shortcut);
  } catch (e) {
    console.error("Failed to unregister shortcut:", e);
  }
}

export async function unregisterAllShortcut(): Promise<void> {
  await unregisterAll();
}
