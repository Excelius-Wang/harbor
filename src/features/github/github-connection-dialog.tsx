import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Github, ShieldCheck, Unplug, Waves } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { parseIpcError } from "@/lib/ipc-error";
import type { GitHubConnection, GitHubIdentity } from "./github-connection";
import { resetGitHubQueryCache } from "./github-queries";

type GitHubLoginAttempt = {
  authorizationUrl: string;
};

type GitHubLoginAvailability = {
  configured: boolean;
};

type GitHubAuthEvent =
  | { status: "connected"; connection: GitHubConnection }
  | { status: "failed"; message: string };

type GitHubConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: GitHubConnection;
  onConnectionChange: (connection: GitHubConnection) => void;
};

function AccountAvatar({ identity }: { identity: GitHubIdentity }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [identity.avatarUrl]);

  return (
    <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border">
      {identity.avatarUrl && !imageFailed ? (
        <img
          src={identity.avatarUrl}
          alt={`@${identity.login}`}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-sm font-semibold">{identity.login.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

function ConnectionRoute() {
  return (
    <div className="flex items-center justify-center gap-2 py-1" aria-hidden="true">
      <span className="bg-muted grid size-10 place-items-center rounded-full border">
        <Github className="size-5" />
      </span>
      <span className="bg-border relative h-px w-16 overflow-hidden">
        <span className="bg-primary absolute inset-y-0 left-0 w-2/3" />
      </span>
      <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-full border">
        <Waves className="size-5" />
      </span>
    </div>
  );
}

export function GitHubConnectionDialog({
  open,
  onOpenChange,
  connection,
  onConnectionChange,
}: GitHubConnectionDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [loginConfigured, setLoginConfigured] = useState<boolean | null>(() =>
    isTauri() ? null : true
  );

  useEffect(() => {
    if (!open || !isTauri()) return;

    setError("");
    void invoke<GitHubLoginAvailability>("github_login_availability")
      .then(({ configured }) => setLoginConfigured(configured))
      .catch(() => setLoginConfigured(false));
  }, [open]);

  useEffect(() => {
    if (!isTauri()) return;

    const unlisten = listen<GitHubAuthEvent>("github-auth", (event) => {
      if (event.payload.status === "failed") {
        setWaiting(false);
        setChecking(false);
        setError(event.payload.message);
        return;
      }

      const nextConnection = event.payload.connection;
      setChecking(true);
      void resetGitHubQueryCache(queryClient)
        .then(() => {
          onConnectionChange(nextConnection);
          setWaiting(false);
          setError("");
        })
        .finally(() => setChecking(false));
    });

    return () => {
      void unlisten.then((removeListener) => removeListener());
    };
  }, [onConnectionChange, queryClient]);

  const handleLogin = async () => {
    if (!isTauri()) {
      setError(t("workspace.github.desktopOnly"));
      return;
    }

    setChecking(true);
    setError("");
    try {
      const attempt = await invoke<GitHubLoginAttempt>("github_begin_login");
      await openUrl(attempt.authorizationUrl);
      setWaiting(true);
    } catch (reason) {
      setWaiting(false);
      setError(parseIpcError(reason).message);
    } finally {
      setChecking(false);
    }
  };

  const handleDisconnect = async () => {
    setChecking(true);
    setError("");
    try {
      const nextConnection = await invoke<GitHubConnection>("github_disconnect");
      await resetGitHubQueryCache(queryClient);
      onConnectionChange(nextConnection);
      setWaiting(false);
    } catch (reason) {
      setError(parseIpcError(reason).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover sm:max-w-[420px]">
        <DialogHeader className="items-center text-center sm:text-center">
          <ConnectionRoute />
          <DialogTitle>{t("workspace.github.title")}</DialogTitle>
          <DialogDescription>{t("workspace.github.description")}</DialogDescription>
        </DialogHeader>

        {connection.connected && connection.identity ? (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/35 flex items-center gap-3 rounded-lg border p-3">
              <AccountAvatar identity={connection.identity} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">@{connection.identity.login}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t("workspace.github.secureStorage")}
                </p>
              </div>
              <Badge variant="secondary">{t("workspace.github.connected")}</Badge>
            </div>
            {error ? (
              <Alert variant="destructive">
                <Unplug />
                <AlertTitle>{t("workspace.github.connectionFailed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => void handleDisconnect()} disabled={checking}>
                {checking ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Unplug data-icon="inline-start" />
                )}
                {t("workspace.github.disconnect")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert variant={loginConfigured === false ? "destructive" : "default"}>
              {waiting ? <ExternalLink /> : <ShieldCheck />}
              <AlertTitle>
                {t(
                  loginConfigured === false
                    ? "workspace.github.notConfiguredTitle"
                    : waiting
                      ? "workspace.github.waitingTitle"
                      : "workspace.github.permissionsTitle"
                )}
              </AlertTitle>
              <AlertDescription>
                {t(
                  loginConfigured === false
                    ? "workspace.github.notConfiguredDescription"
                    : waiting
                      ? "workspace.github.waitingDescription"
                      : "workspace.github.permissionsDescription"
                )}
              </AlertDescription>
            </Alert>

            {error ? (
              <Alert variant="destructive">
                <Unplug />
                <AlertTitle>{t("workspace.github.connectionFailed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              size="lg"
              className="w-full"
              onClick={() => void handleLogin()}
              disabled={checking || loginConfigured !== true}
            >
              {checking ? (
                <Spinner data-icon="inline-start" />
              ) : waiting ? (
                <ExternalLink data-icon="inline-start" />
              ) : (
                <Github data-icon="inline-start" />
              )}
              {t(
                loginConfigured === false
                  ? "workspace.github.notConfiguredAction"
                  : checking
                    ? "workspace.github.opening"
                    : waiting
                      ? "workspace.github.openAgain"
                      : "workspace.github.login"
              )}
            </Button>
            <p className="text-muted-foreground text-center text-xs leading-relaxed">
              {t("workspace.github.browserSecurity")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
