import { useState } from "react";
import {
  checkForUpdates,
  downloadAndInstall,
  UpdateProgress,
  UpdateCheckResult,
} from "@/lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  const checkUpdate = async (): Promise<UpdateCheckResult> => {
    setChecking(true);
    try {
      const result = await checkForUpdates();
      setUpdate(result.status === "available" ? result.update : null);
      return result;
    } finally {
      setChecking(false);
    }
  };

  const installUpdate = async () => {
    setDownloading(true);
    try {
      await downloadAndInstall((progressEvent) => {
        setProgress(progressEvent);
      });
    } catch (error) {
      console.error("Failed to install update:", error);
      setDownloading(false);
    }
  };

  return {
    update,
    checking,
    downloading,
    progress,
    checkUpdate,
    installUpdate,
  };
}
