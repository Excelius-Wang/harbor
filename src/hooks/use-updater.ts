import { useCallback, useState } from "react";
import { checkForUpdates, type UpdateCheckResult } from "@/lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";

export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);

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

  return {
    update,
    checking,
    checkUpdate,
  };
}
