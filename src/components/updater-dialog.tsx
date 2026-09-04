import { useEffect, useState, type ReactNode } from "react";
import { useUpdater, type UpdateInstallStatus } from "@/hooks/use-updater";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CircleAlert } from "lucide-react";

interface UpdaterDialogProps {
  manualCheck?: boolean;
  onCheckComplete?: () => void;
}

interface InstallPresentation {
  titleKey: string;
  description: ReactNode;
  action: {
    labelKey: string;
    run: () => void;
  } | null;
}

export function UpdaterDialog({ manualCheck = false, onCheckComplete }: UpdaterDialogProps) {
  const {
    update,
    checking,
    installStatus,
    progress,
    checkUpdate,
    installUpdate,
    relaunchAfterUpdate,
  } = useUpdater();
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!manualCheck) {
      void checkUpdate();
    }
  }, [manualCheck, checkUpdate]);

  useEffect(() => {
    if (update) {
      setOpen(true);
      onCheckComplete?.();
    } else if (manualCheck && !checking) {
      onCheckComplete?.();
    }
  }, [update, checking, manualCheck, onCheckComplete]);

  const handleCancel = () => {
    setOpen(false);
  };

  const getProgressPercentage = () => {
    if (!progress || progress.event === "Started") return 0;
    const { downloaded, contentLength } = progress.data || {};
    if (!contentLength) return 0;
    if (progress.event === "Finished") return 100;
    return Math.round(((downloaded ?? 0) / contentLength) * 100);
  };

  const presentations: Record<UpdateInstallStatus, InstallPresentation> = {
    idle: {
      titleKey: "updater.updateAvailable",
      description: (
        <div className="flex flex-col gap-2">
          <p>{t("updater.versionAvailable", { version: update?.version })}</p>
          {update?.body && (
            <div className="bg-muted mt-2 rounded-md p-3 text-sm">
              <p className="font-semibold">{t("updater.releaseNotes")}</p>
              <p className="mt-1 whitespace-pre-wrap">{update.body}</p>
            </div>
          )}
        </div>
      ),
      action: {
        labelKey: "updater.installNow",
        run: () => void installUpdate(),
      },
    },
    downloading: {
      titleKey: "updater.downloading",
      description: (
        <div className="flex flex-col gap-2">
          <p>{t("updater.installingVersion", { version: update?.version })}</p>
          <Progress value={getProgressPercentage()} />
        </div>
      ),
      action: null,
    },
    failed: {
      titleKey: "updater.installFailed",
      description: (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {t("updater.installFailedDescription", { version: update?.version })}
          </AlertDescription>
        </Alert>
      ),
      action: {
        labelKey: "updater.retry",
        run: () => void installUpdate(),
      },
    },
    restarting: {
      titleKey: "updater.restarting",
      description: (
        <div className="flex items-center gap-2">
          <Spinner />
          <p>{t("updater.restartingDescription", { version: update?.version })}</p>
        </div>
      ),
      action: null,
    },
    "relaunch-failed": {
      titleKey: "updater.relaunchFailed",
      description: (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {t("updater.relaunchFailedDescription", { version: update?.version })}
          </AlertDescription>
        </Alert>
      ),
      action: {
        labelKey: "updater.retryRestart",
        run: () => void relaunchAfterUpdate(),
      },
    },
  };
  const presentation = presentations[installStatus];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(presentation.titleKey)}</DialogTitle>
          <DialogDescription asChild>
            <div>{presentation.description}</div>
          </DialogDescription>
        </DialogHeader>
        {presentation.action && (
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {t("updater.later")}
            </Button>
            <Button onClick={presentation.action.run}>{t(presentation.action.labelKey)}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function useManualUpdateCheck() {
  const { checkUpdate, checking, update } = useUpdater();
  const [showNoUpdate, setShowNoUpdate] = useState(false);
  const { t } = useTranslation();

  const handleCheckUpdate = async () => {
    setShowNoUpdate(false);
    const result = await checkUpdate();

    if (result.status === "up-to-date") {
      setShowNoUpdate(true);
      return;
    }

    if (result.status === "error") {
      toast.error(t("updater.checkFailed"));
    }
  };

  return {
    checkUpdate: handleCheckUpdate,
    checking,
    hasUpdate: !!update,
    showNoUpdate,
    dismissNoUpdate: () => setShowNoUpdate(false),
  };
}
