import { forwardRef, type ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type NavigationButtonProps = Omit<ComponentProps<"button">, "children" | "className"> & {
  icon: LucideIcon;
  label: string;
  caption?: string;
  active?: boolean;
  alwaysExpanded?: boolean;
};

// Forward Radix trigger events and refs to the same native navigation control.
export const NavigationButton = forwardRef<HTMLButtonElement, NavigationButtonProps>(
  function NavigationButton(
    { icon: Icon, label, caption, active = false, alwaysExpanded = false, ...props },
    ref
  ) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            {...props}
            ref={ref}
            type="button"
            className="harbor-nav-item focus-visible:ring-ring focus-visible:ring-offset-background relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span
              className={
                alwaysExpanded
                  ? "block min-w-0 flex-1 truncate"
                  : "workspace-wide:block hidden min-w-0 flex-1 truncate"
              }
            >
              {caption ?? label}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className={alwaysExpanded ? "hidden" : "workspace-wide:hidden"}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
);
