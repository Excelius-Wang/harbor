import { useCallback, useState } from "react";
import { checkForUpdates, type AvailableUpdate, type UpdateCheckResult } from "@/lib/updater";

export function useUpdater() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
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
