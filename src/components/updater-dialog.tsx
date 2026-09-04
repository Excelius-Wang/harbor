import { useEffect, useState } from "react";
import { useUpdater } from "@/hooks/use-updater";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { openExternalUrl } from "@/lib/window";
import packageJson from "../../package.json";
import type { Update } from "@tauri-apps/plugin-updater";

interface UpdaterAvailableDialogProps {
  update: Update | null;
}

const projectSourceUrl = packageJson.repository.url.replace(/\.git$/, "");

function getReleaseUrl(version: string) {
  return `${projectSourceUrl}/releases/tag/v${encodeURIComponent(version)}`;
}

export function UpdaterDialog() {
  const updater = useUpdater();
  const { checkUpdate } = updater;

  useEffect(() => {
    void checkUpdate();
  }, [checkUpdate]);

  return <UpdaterAvailableDialog update={updater.update} />;
}

export function UpdaterAvailableDialog({ update }: UpdaterAvailableDialogProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (update) {
      setOpen(true);
    }
  }, [update]);

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("updater.updateAvailable")}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p>{t("updater.versionAvailable", { version: update?.version })}</p>
              {update?.body && (
                <div className="bg-muted mt-2 rounded-md p-3 text-sm">
                  <p className="font-semibold">{t("updater.releaseNotes")}</p>
                  <p className="mt-1 whitespace-pre-wrap">{update.body}</p>
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t("updater.later")}
          </Button>
          <Button
            onClick={() => {
              if (update) void openExternalUrl(getReleaseUrl(update.version));
            }}
          >
            {t("updater.viewRelease")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useManualUpdateCheck() {
  const updater = useUpdater();
  const { update, checkUpdate, checking } = updater;
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
    update,
    checkUpdate: handleCheckUpdate,
    checking,
    showNoUpdate,
  };
}
