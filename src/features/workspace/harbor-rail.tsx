import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  LayoutDashboard,
  MessageCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { parseIpcError } from "@/lib/ipc-error";
export type RailView = "overview" | "checks" | "comments" | "harbor";

export type RepositoryTarget = {
  id: string | number;
  owner: string;
  name: string;
  isPrivate?: boolean;
};

type RepositoryContextAnswer = {
  repository: string;
  answer: string;
  provider: string;
};

const railItems: Array<{ id: RailView; icon: typeof LayoutDashboard }> = [
  { id: "overview", icon: LayoutDashboard },
  { id: "checks", icon: CheckCircle2 },
  { id: "comments", icon: MessageCircle },
  { id: "harbor", icon: Bot },
];

export function HarborRail({
  selectedRepository,
  activeView,
  onViewChange,
}: {
  selectedRepository: RepositoryTarget | null;
  activeView: RailView;
  onViewChange: (view: RailView) => void;
}) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<RepositoryContextAnswer | null>(null);
  const [agentError, setAgentError] = useState("");
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    setAnswer(null);
    setAgentError("");
    setQuestion("");
  }, [selectedRepository?.id]);

  const selectView = (view: RailView) => {
    onViewChange(view);
    setSheetOpen(view !== "overview");
  };

  const handleAskHarbor = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion) return;
    if (!selectedRepository) {
      setAgentError(t("workspace.agent.selectRepository"));
      return;
    }
    if (selectedRepository.isPrivate) {
      setAgentError(t("workspace.agent.publicOnly"));
      return;
    }
    if (!isTauri()) {
      setAgentError(t("workspace.agent.desktopOnly"));
      return;
    }

    setAsking(true);
    setAgentError("");
    setAnswer(null);
    try {
      const nextAnswer = await invoke<RepositoryContextAnswer>("repository_context_ask", {
        owner: selectedRepository.owner,
        repository: selectedRepository.name,
        question: nextQuestion,
      });
      setAnswer(nextAnswer);
      setQuestion("");
    } catch (reason) {
      setAgentError(parseIpcError(reason).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <aside
        className="harbor-glass flex w-12 shrink-0 flex-col items-center border-l py-2"
        aria-label={t("workspace.harborRail")}
      >
        {railItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => selectView(item.id)}
                  className={cn(
                    "focus-visible:ring-primary/70 relative grid size-9 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                  )}
                  aria-label={t(`workspace.rail.${item.id}`)}
                >
                  {isActive && (
                    <span className="bg-primary absolute inset-y-2 -right-1.5 w-0.5 rounded-l" />
                  )}
                  <Icon className="size-4" strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                {t(`workspace.rail.${item.id}`)}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-2 pb-1">
          <span className="bg-primary/50 h-12 w-px" />
          <span className="text-primary text-[9px] font-semibold tracking-[0.16em] [writing-mode:vertical-rl]">
            HARBOR
          </span>
        </div>
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="harbor-sheet w-[390px] border-white/10 p-0 sm:max-w-[390px]">
          <SheetHeader className="border-b border-white/8 p-5">
            <p className="text-primary text-[10px] font-semibold tracking-[0.14em] uppercase">
              Harbor Rail
            </p>
            <SheetTitle className="text-base tracking-[-0.015em]">
              {t(`workspace.rail.${activeView}`)}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {selectedRepository
                ? `${selectedRepository.owner}/${selectedRepository.name}`
                : t("workspace.agent.noRepository")}
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
            {activeView === "harbor" ? (
              <>
                {selectedRepository?.isPrivate ? (
                  <Alert>
                    <CircleAlert />
                    <AlertTitle>{t("workspace.agent.publicOnlyTitle")}</AlertTitle>
                    <AlertDescription>{t("workspace.agent.publicOnly")}</AlertDescription>
                  </Alert>
                ) : selectedRepository ? (
                  <Alert>
                    <Bot />
                    <AlertTitle>{t("workspace.agent.ready")}</AlertTitle>
                    <AlertDescription>{t("workspace.agent.description")}</AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <CircleAlert />
                    <AlertTitle>{t("workspace.agent.selectRepositoryTitle")}</AlertTitle>
                    <AlertDescription>{t("workspace.agent.selectRepository")}</AlertDescription>
                  </Alert>
                )}

                {agentError ? (
                  <Alert variant="destructive">
                    <CircleAlert />
                    <AlertTitle>{t("workspace.agent.failed")}</AlertTitle>
                    <AlertDescription>{agentError}</AlertDescription>
                  </Alert>
                ) : null}

                {!selectedRepository || selectedRepository.isPrivate ? (
                  <div className="flex-1" />
                ) : asking ? (
                  <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs">
                    <Spinner />
                    {t("workspace.agent.thinking")}
                  </div>
                ) : answer ? (
                  <ScrollArea className="min-h-0 flex-1 pr-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-primary text-[10px] font-semibold tracking-[0.12em] uppercase">
                        {answer.provider}
                      </div>
                      <p className="text-foreground/90 text-xs leading-6 whitespace-pre-wrap">
                        {answer.answer}
                      </p>
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="flex-1" />
                )}

                {selectedRepository && !selectedRepository.isPrivate ? (
                  <form
                    className="mt-auto"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleAskHarbor();
                    }}
                  >
                    <Field orientation="horizontal" className="gap-2">
                      <FieldLabel htmlFor="harbor-prompt" className="sr-only">
                        {t("workspace.agent.placeholder")}
                      </FieldLabel>
                      <Input
                        id="harbor-prompt"
                        value={question}
                        onChange={(event) => setQuestion(event.currentTarget.value)}
                        placeholder={t("workspace.agent.placeholder")}
                        disabled={asking}
                        className="bg-black/10 text-xs"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={asking || !question.trim()}
                        aria-label={t("workspace.agent.send")}
                      >
                        {asking ? <Spinner /> : <ArrowUpRight />}
                      </Button>
                    </Field>
                  </form>
                ) : null}
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-center">
                <div className="max-w-56">
                  {activeView === "checks" ? (
                    <CheckCircle2 className="text-primary mx-auto size-7" />
                  ) : (
                    <MessageCircle className="text-primary mx-auto size-7" />
                  )}
                  <p className="mt-3 text-sm font-medium">
                    {t(`workspace.panel.${activeView}.title`)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-5">
                    {t(`workspace.panel.${activeView}.description`)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
