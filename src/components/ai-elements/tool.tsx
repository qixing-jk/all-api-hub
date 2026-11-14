// Adapted to shadcn/ui Trace; see NOTICE.md.
import { Wrench } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "~/components/ui/trace"
import { cn } from "~/lib/utils"

/** One tool call and its associated input/output, kept at its original position. */
export function Tool({
  className,
  ...props
}: ComponentProps<typeof TraceCollapsible>) {
  return (
    <Trace>
      <TraceCollapsible className={cn("min-w-0", className)} {...props} />
    </Trace>
  )
}

/** Tool identity and localized state; callers own execution semantics. */
export function ToolHeader({
  title,
  status,
  className,
  ...props
}: Omit<ComponentProps<typeof TraceCollapsibleTrigger>, "title"> & {
  title: string
  status: ReactNode
}) {
  return (
    <TraceCollapsibleTrigger className={cn("text-xs", className)} {...props}>
      <TraceLine>
        <TraceIcon>
          <Wrench />
        </TraceIcon>
        <TraceTitle className="font-medium break-all text-foreground">
          {title}
        </TraceTitle>
        {status}
      </TraceLine>
    </TraceCollapsibleTrigger>
  )
}

/** Parameters and results use the host application's evidence renderer. */
export function ToolContent({
  className,
  ...props
}: ComponentProps<typeof TraceCollapsibleContent>) {
  return (
    <TraceCollapsibleContent
      className={cn("space-y-3 pb-2", className)}
      {...props}
    />
  )
}
