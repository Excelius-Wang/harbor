# Global Shortcut Development Guide

This guide explains how to implement global shortcuts in Tauri v2 applications using the `tauri-plugin-global-shortcut` plugin.

## Overview

Global shortcuts allow your application to respond to keyboard combinations even when the app is not focused. This template provides a complete implementation with:

- Keyboard event capture and conversion
- Shortcut registration/unregistration
- UI component for shortcut input
- Permission configuration

## Setup

### 1. Install Plugin

Add to `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-global-shortcut = "2"
```

### 2. Initialize Plugin

In `src-tauri/src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::init())
        // ... other plugins
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. Configure Permissions

Add to `src-tauri/capabilities/default.json`:

```json
{
  "permissions": [
    "global-shortcut:default",
    "global-shortcut:allow-is-registered",
    "global-shortcut:allow-register",
    "global-shortcut:allow-register-all",
    "global-shortcut:allow-unregister",
    "global-shortcut:allow-unregister-all"
  ]
}
```

### 4. Install Frontend Package

```bash
pnpm add @tauri-apps/plugin-global-shortcut
```

## Implementation

### Utility Functions (`src/lib/shortcut.ts`)

#### Convert Keyboard Event to Shortcut String

```typescript
import { convertToShortcut } from "@/lib/shortcut";

// Example: Ctrl+Shift+A
const shortcut = convertToShortcut(keyboardEvent);
```

**Supported Modifiers:**
- `Ctrl` / `Cmd` (macOS)
- `Alt`
- `Shift`

**Special Keys:**
- `Space`, `Enter`, `Esc`
- Arrow keys: `Up`, `Down`, `Left`, `Right`
- Single characters: automatically uppercase

#### Register Shortcut

```typescript
import { registerShortcut } from "@/lib/shortcut";

await registerShortcut("Ctrl+Shift+A", () => {
  console.log("Shortcut triggered!");
});

// Replace existing shortcut
await registerShortcut("Ctrl+Shift+B", callback, "Ctrl+Shift+A");
```

#### Unregister Shortcut

```typescript
import { unregisterShortcut, unregisterAllShortcut } from "@/lib/shortcut";

// Unregister specific shortcut
await unregisterShortcut("Ctrl+Shift+A");

// Unregister all shortcuts
await unregisterAllShortcut();
```

### UI Component (`src/components/shortcut-input.tsx`)

Pre-built component for capturing keyboard shortcuts:

```typescript
import { ShortcutInput } from "@/components/shortcut-input";

function Settings() {
  const [shortcut, setShortcut] = useState("Ctrl+Shift+A");

  return (
    <ShortcutInput
      value={shortcut}
      onChange={setShortcut}
    />
  );
}
```

**Features:**
- Click to focus and capture keyboard input
- Press `Backspace` or `Delete` to clear
- Visual feedback with clear button
- i18n support for placeholder text

## Complete Example

```typescript
import { useEffect, useState } from "react";
import { ShortcutInput } from "@/components/shortcut-input";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";

function Settings() {
  const [shortcut, setShortcut] = useState("Ctrl+Shift+A");

  useEffect(() => {
    // Register shortcut to show window
    const setupShortcut = async () => {
      await registerShortcut(shortcut, async () => {
        const window = getCurrentWindow();
        await window.show();
        await window.setFocus();
      });
    };

    setupShortcut();

    // Cleanup on unmount
    return () => {
      unregisterShortcut(shortcut);
    };
  }, [shortcut]);

  return (
    <div>
      <label>Global Shortcut:</label>
      <ShortcutInput value={shortcut} onChange={setShortcut} />
    </div>
  );
}
```

## Best Practices

1. **Always Unregister**: Clean up shortcuts when component unmounts or shortcut changes
2. **Validate Input**: Ensure shortcuts include at least one modifier key
3. **Avoid Conflicts**: Check if shortcut is already registered before registering
4. **User Feedback**: Show toast notifications when shortcuts are set/changed
5. **Persistence**: Save user-defined shortcuts to local storage or settings file

## Troubleshooting

### Shortcut Not Working

- Check if shortcut is already registered by system or another app
- Verify permissions in `capabilities/default.json`
- Ensure plugin is initialized in `src-tauri/src/lib.rs`

### Shortcut Conflicts

```typescript
import { isRegistered } from "@tauri-apps/plugin-global-shortcut";

const registered = await isRegistered("Ctrl+Shift+A");
if (registered) {
  console.warn("Shortcut already registered");
}
```

## API Reference

### `convertToShortcut(event: KeyboardEvent): string`

Converts browser KeyboardEvent to Tauri shortcut format.

**Returns:** Shortcut string (e.g., "Ctrl+Shift+A") or empty string if invalid

### `registerShortcut(shortcut: string, callback: () => void, oldShortcut?: string): Promise<void>`

Registers a global shortcut with callback function.

**Parameters:**
- `shortcut`: Shortcut string to register
- `callback`: Function to execute when shortcut is pressed
- `oldShortcut`: Optional previous shortcut to unregister

### `unregisterShortcut(shortcut?: string): Promise<void>`

Unregisters a specific shortcut.

### `unregisterAllShortcut(): Promise<void>`

Unregisters all shortcuts registered by the application.

## Related Documentation

- [Tauri Global Shortcut Plugin](https://v2.tauri.app/plugin/global-shortcut/)
- [Keyboard Event Reference](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent)
