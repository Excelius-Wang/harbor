import { useEffect, useState, type FormEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, ExternalLink, KeyRound, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export type GitHubIdentity = {
  login: string;
  avatarUrl?: string;
};

export type GitHubConnection = {
  connected: boolean;
  identity?: GitHubIdentity;
};

type GitHubConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: GitHubConnection;
  onConnectionChange: (connection: GitHubConnection) => void;
};

const disconnected: GitHubConnection = { connected: false };

export function GitHubConnectionDialog({
  open,
  onOpenChange,
  connection,
  onConnectionChange,
}: GitHubConnectionDialogProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !isTauri()) return;

    setChecking(true);
    setError("");
    void invoke<GitHubConnection>("github_connection_status")
      .then(onConnectionChange)
      .catch((reason) => setError(String(reason)))
      .finally(() => setChecking(false));
  }, [open, onConnectionChange]);

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isTauri()) {
      setError(t("workspace.github.desktopOnly"));
      return;
    }

    setChecking(true);
    setError("");
    try {
      const nextConnection = await invoke<GitHubConnection>("github_connect", { token });
      onConnectionChange(nextConnection);
      setToken("");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setChecking(false);
    }
  };

  const handleDisconnect = async () => {
    setChecking(true);
    setError("");
    try {
      const nextConnection = await invoke<GitHubConnection>("github_disconnect");
      onConnectionChange(nextConnection);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setChecking(false);
    }
  };

  const handleCreateToken = async () => {
    const url =
      "https://github.com/settings/personal-access-tokens/new?name=Harbor&description=GitHub+desktop+workspace&expires_in=30&contents=read&issues=write&pull_requests=read";
    if (isTauri()) {
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="harbor-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("workspace.github.title")}</DialogTitle>
          <DialogDescription>{t("workspace.github.description")}</DialogDescription>
        </DialogHeader>

        {connection.connected && connection.identity ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <CheckCircle2 />
              <AlertTitle>{t("workspace.github.connected")}</AlertTitle>
              <AlertDescription>@{connection.identity.login}</AlertDescription>
            </Alert>
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
          <form onSubmit={(event) => void handleConnect(event)}>
            <FieldGroup className="gap-4">
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="github-token">{t("workspace.github.token")}</FieldLabel>
                <Input
                  id="github-token"
                  type="password"
                  autoComplete="new-password"
                  value={token}
                  onChange={(event) => setToken(event.currentTarget.value)}
                  placeholder="github_pat_…"
                  aria-invalid={Boolean(error)}
                  disabled={checking}
                />
                <FieldDescription>{t("workspace.github.tokenDescription")}</FieldDescription>
                <FieldError>{error}</FieldError>
              </Field>
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="ghost" onClick={() => void handleCreateToken()}>
                  <ExternalLink data-icon="inline-start" />
                  {t("workspace.github.createToken")}
                </Button>
                <Button type="submit" disabled={checking || !token.trim()}>
                  {checking ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <KeyRound data-icon="inline-start" />
                  )}
                  {checking ? t("workspace.github.checking") : t("workspace.github.connect")}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { disconnected as disconnectedGitHubConnection };
