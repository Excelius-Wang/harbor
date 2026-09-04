import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Github, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TitleBar } from "@/components/title-bar";
import { WindowFrame } from "@/components/window-frame";
import { Toaster } from "@/components/ui/sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { cancelDestroyWindow, destroyWindow, openExternalUrl } from "@/lib/window";
import { UpdaterInstallDialog, useManualUpdateCheck } from "@/components/updater-dialog";
import packageJson from "../../package.json";

const techVersions = {
  tauri: packageJson.dependencies["@tauri-apps/api"].replace(/^\^/, "v"),
  react: packageJson.dependencies.react.replace(/^\^/, "v"),
  typescript: packageJson.devDependencies.typescript.replace(/^~/, "v"),
};

const projectSourceUrl = packageJson.repository.url.replace(/\.git$/, "");

export default function AboutPage() {
  const [appVersion, setAppVersion] = useState("");
  const { t } = useAppTranslation();
  const { updater, checkUpdate, checking, showNoUpdate } = useManualUpdateCheck();

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      console.log("About window close requested, will destroy in 5 seconds");
      await destroyWindow(appWindow.label, 5000);
    });

    const unlistenFocusChanged = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        cancelDestroyWindow(appWindow.label);
      }
    });

    return () => {
      unlistenClose.then((fn) => fn());
      unlistenFocusChanged.then((fn) => fn());
    };
  }, []);

  return (
    <WindowFrame
      titleBar={<TitleBar title={t("about.title")} showMinimize={false} showMaximize={false} />}
      contentClassName="flex flex-1 items-center justify-center overflow-hidden"
    >
      <UpdaterInstallDialog updater={updater} />
      <Toaster />
      <div className="flex w-full max-w-xs flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">{t("about.appName")}</h2>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("about.version")}</span>
            <span className="font-medium">{appVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tauri</span>
            <span className="font-medium">{techVersions.tauri}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">React</span>
            <span className="font-medium">{techVersions.react}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">TypeScript</span>
            <span className="font-medium">{techVersions.typescript}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("about.license")}</span>
            <span className="font-medium">{packageJson.license}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={checkUpdate} className="w-full" variant="outline" disabled={checking}>
            {checking ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {checking ? t("updater.checking") : t("updater.checkForUpdates")}
          </Button>
          <Button
            onClick={() => void openExternalUrl(projectSourceUrl)}
            className="w-full"
            variant="outline"
          >
            <Github data-icon="inline-start" />
            {t("about.originalSource")}
          </Button>
        </div>

        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          {t("about.copyright")}
        </p>

        {showNoUpdate && (
          <p className="text-muted-foreground text-center text-sm">{t("updater.upToDate")}</p>
        )}
      </div>
    </WindowFrame>
  );
}
