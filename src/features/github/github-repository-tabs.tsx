import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RepositoryTabStrip({
  activeTab,
  children,
}: {
  activeTab: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const stripRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ visible: false, left: false, right: false });

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!strip || !viewport || !list) return;

    const update = () => {
      const next = {
        // Compare with the whole strip so the arrows cannot keep themselves visible.
        visible: list.scrollWidth > strip.clientWidth - 16,
        left: viewport.scrollLeft > 1,
        right: viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1,
      };
      setOverflow((previous) =>
        previous.visible === next.visible &&
        previous.left === next.left &&
        previous.right === next.right
          ? previous
          : next
      );
    };
    const revealSelection = () => {
      const selected = list.querySelector<HTMLElement>('[data-state="active"]');
      if (selected) {
        const item = selected.getBoundingClientRect();
        const visible = viewport.getBoundingClientRect();
        if (item.left < visible.left) viewport.scrollLeft -= visible.left - item.left;
        else if (item.right > visible.right) viewport.scrollLeft += item.right - visible.right;
      }
      update();
    };
    const observer = new ResizeObserver(revealSelection);
    observer.observe(strip);
    observer.observe(viewport);
    observer.observe(list);
    viewport.addEventListener("scroll", update, { passive: true });
    revealSelection();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
    };
  }, [activeTab]);

  const scroll = (direction: number) => {
    const viewport = viewportRef.current;
    if (viewport)
      viewport.scrollBy({ left: direction * viewport.clientWidth * 0.75, behavior: "auto" });
  };

  return (
    <div
      ref={stripRef}
      data-slot="repository-tab-strip"
      className="harbor-subtle-divider flex h-10 min-w-0 shrink-0 items-center gap-1 border-b px-2"
    >
      {overflow.visible ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace.repositories.scrollTabsLeft")}
              disabled={!overflow.left}
              onClick={() => scroll(-1)}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.repositories.scrollTabsLeft")}</TooltipContent>
        </Tooltip>
      ) : null}
      <div
        ref={viewportRef}
        className="scrollbar-none min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <TabsList
          ref={listRef}
          variant="line"
          aria-label={t("workspace.repositories.tabsLabel")}
          className="flex w-max shrink-0 gap-1 p-0 group-data-[orientation=horizontal]/tabs:h-10 @min-[640px]/repository-pane:gap-2"
        >
          {children}
        </TabsList>
      </div>
      {overflow.visible ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace.repositories.scrollTabsRight")}
              disabled={!overflow.right}
              onClick={() => scroll(1)}
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("workspace.repositories.scrollTabsRight")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function RepositoryTabTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "px-1.5 text-xs group-data-[orientation=horizontal]/tabs:after:bottom-0 focus-visible:ring-inset",
        className
      )}
      {...props}
    />
  );
}
