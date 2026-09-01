import { useState } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { openExternalUrl } from "@/lib/window";

export function GitHubIssueConvertDiscussionAction({ issueUrl }: { issueUrl: string }) {
  const { t } = useAppTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageCircle data-icon="inline-start" />
        {t("workspace.repositories.convertIssueToDiscussion")}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("workspace.repositories.convertIssueToDiscussionTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("workspace.repositories.convertIssueToDiscussionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("workspace.repositories.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void openExternalUrl(issueUrl)}>
              <ExternalLink data-icon="inline-start" />
              {t("workspace.repositories.openIssueOnGitHubForConversion")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
