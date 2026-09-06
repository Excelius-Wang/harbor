import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WorkspaceStaleNotice({
  message,
  onRetry,
  retryDisabled = false,
  compact = false,
}: {
  message: string;
  onRetry: () => void;
  retryDisabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onRetry}
            disabled={retryDisabled}
          >
            <TriangleAlert data-icon="inline-start" className="text-muted-foreground" />
            {t("common.staleRetry")}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <p>{t("common.staleResults")}</p>
          <p className="break-words">{message}</p>
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Alert className="shrink-0 rounded-none border-x-0 border-t-0">
      <TriangleAlert />
      <AlertTitle>{t("common.staleResults")}</AlertTitle>
      <AlertDescription className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 basis-48 break-words">{message}</span>
        <Button variant="outline" size="xs" onClick={onRetry} disabled={retryDisabled}>
          {t("common.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
