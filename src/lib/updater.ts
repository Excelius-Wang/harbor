import { check } from "@tauri-apps/plugin-updater";

export interface AvailableUpdate {
  version: string;
  date?: string;
  body?: string;
}

export type UpdateCheckResult =
  | { status: "available"; update: AvailableUpdate }
  | { status: "up-to-date" }
  | { status: "error"; error: unknown };

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const checkedUpdate = await check();
    if (checkedUpdate) {
      const update = {
        version: checkedUpdate.version,
        date: checkedUpdate.date,
        body: checkedUpdate.body,
      };
      await checkedUpdate.close();
      return { status: "available", update };
    }

    return { status: "up-to-date" };
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return { status: "error", error };
  }
}
