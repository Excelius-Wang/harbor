import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function WorkspaceStaleNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive" className="shrink-0 rounded-none border-x-0 border-t-0">
      <TriangleAlert />
      <AlertTitle>{t("common.staleResults")}</AlertTitle>
      <AlertDescription className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <Button variant="outline" size="xs" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
