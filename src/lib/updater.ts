import { check } from "@tauri-apps/plugin-updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateProgress {
  event: "Started" | "Progress" | "Finished";
  data?: {
    contentLength?: number;
    chunkLength?: number;
    downloaded?: number;
  };
}

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

export async function downloadAndInstall(onProgress?: (progress: UpdateProgress) => void) {
  const update = await check();

  if (!update) {
    return false;
  }

  console.log(`Found update ${update.version} from ${update.date} with notes: ${update.body}`);

  let downloaded = 0;
  let contentLength = 0;

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        contentLength = event.data.contentLength!;
        console.log(`Started downloading ${event.data.contentLength} bytes`);
        onProgress?.({ event: "Started", data: { ...event.data, downloaded: 0 } });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        console.log(`Downloaded ${downloaded} from ${contentLength}`);
        onProgress?.({
          event: "Progress",
          data: { ...event.data, contentLength, downloaded },
        });
        break;
      case "Finished":
        console.log("Download finished");
        onProgress?.({ event: "Finished", data: { contentLength, downloaded } });
        break;
    }
  });

  console.log("Update installed");
  await relaunch();
  return true;
}
