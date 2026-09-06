import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100
  const current = value != null && Number.isFinite(value) ? Math.min(limit, Math.max(0, value)) : null
  const indeterminate = current === null

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      value={current}
      max={limit}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full flex-1 bg-primary transition-transform duration-150",
          indeterminate && "harbor-progress-indeterminate"
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - (current / limit) * 100}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
