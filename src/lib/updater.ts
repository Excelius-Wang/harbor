import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateCheckResult =
  | { status: "available"; update: Update }
  | { status: "up-to-date" }
  | { status: "error"; error: unknown };

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (update) {
      return { status: "available", update };
    }

    return { status: "up-to-date" };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { status: "error", error };
  }
}
