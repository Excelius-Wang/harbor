import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageHeader({
  title,
  description,
  children,
  contained = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  contained?: boolean;
}) {
  return (
    <header className="harbor-subtle-divider shrink-0 border-b px-5">
      <div
        className={cn(
          "flex min-h-[74px] min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3",
          contained && "mx-auto w-full max-w-[1120px]"
        )}
      >
        <div className="min-w-0">
          <h1 className="text-2xl leading-7 font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground mt-1 text-[11px] leading-4">{description}</p>
          ) : null}
        </div>
        {children ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
