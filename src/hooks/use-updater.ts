import { useCallback, useState } from "react";
import {
  checkForUpdates,
  downloadAndInstall,
  restartApplication,
  UpdateProgress,
  UpdateCheckResult,
} from "@/lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateInstallStatus =
  | "idle"
  | "downloading"
  | "failed"
  | "restarting"
  | "relaunch-failed";

export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [installStatus, setInstallStatus] = useState<UpdateInstallStatus>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  const checkUpdate = useCallback(async (): Promise<UpdateCheckResult> => {
    setChecking(true);
    try {
      const result = await checkForUpdates();
      setUpdate(result.status === "available" ? result.update : null);
      return result;
    } finally {
      setChecking(false);
    }
  }, []);

  const relaunchAfterUpdate = useCallback(async () => {
    setInstallStatus("restarting");
    try {
      await restartApplication();
    } catch (error) {
      console.error("Failed to relaunch after update:", error);
      setInstallStatus("relaunch-failed");
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!update) {
      return;
    }

    setInstallStatus("downloading");
    setProgress(null);
    try {
      await downloadAndInstall(update, (progressEvent) => {
        setProgress(progressEvent);
      });
    } catch (error) {
      console.error("Failed to install update:", error);
      setInstallStatus("failed");
      return;
    }

    await relaunchAfterUpdate();
  }, [relaunchAfterUpdate, update]);

  return {
    update,
    checking,
    installStatus,
    progress,
    checkUpdate,
    installUpdate,
    relaunchAfterUpdate,
  };
}
