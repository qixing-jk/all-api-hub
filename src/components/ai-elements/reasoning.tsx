// Adapted to shadcn/ui Trace; see NOTICE.md.
import { Brain, ChevronDown } from "lucide-react"
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react"

import { MarkdownContent } from "~/components/MarkdownContent"
import { Button } from "~/components/ui"
import {
  Trace,
  TRACE_STATUSES,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "~/components/ui/trace"
import { cn } from "~/lib/utils"

const ReasoningContext = createContext<{
  open: boolean
  streaming: boolean
  setOpen: (open: boolean) => void
  trigger: RefObject<HTMLButtonElement | null>
} | null>(null)

/** Open active thoughts automatically until the reader chooses a disclosure state. */
export function Reasoning({
  children,
  streaming = false,
}: {
  children: ReactNode
  streaming?: boolean
}) {
  const [readerOpen, setOpen] = useState<boolean>()
  const open = readerOpen ?? streaming
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <ReasoningContext.Provider value={{ open, streaming, setOpen, trigger }}>
      <Trace>
        <TraceCollapsible open={open} onOpenChange={setOpen}>
          {children}
        </TraceCollapsible>
      </Trace>
    </ReasoningContext.Provider>
  )
}

/** Accessible trigger with application-owned, localized status text. */
export function ReasoningTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof TraceCollapsibleTrigger>) {
  const context = useContext(ReasoningContext)!
  return (
    <TraceCollapsibleTrigger
      ref={context.trigger}
      className={cn("text-sm", className)}
      {...props}
    >
      <TraceLine
        className="text-sm"
        status={context.streaming ? TRACE_STATUSES.Running : undefined}
      >
        <TraceIcon>
          <Brain />
        </TraceIcon>
        <TraceTitle>{children}</TraceTitle>
      </TraceLine>
    </TraceCollapsibleTrigger>
  )
}

/** Reuse the application's Markdown sanitization and streaming configuration. */
export function ReasoningContent({
  children,
  streaming,
  collapseLabel,
}: {
  children: string
  streaming?: boolean
  collapseLabel: string
}) {
  const { open, setOpen, trigger } = useContext(ReasoningContext)!
  const preview = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const viewport = preview.current
    const content = viewport?.firstElementChild
    if (!viewport || !content) return
    const follow = () => {
      viewport.scrollTop = viewport.scrollHeight
    }
    follow()
    const observer = new ResizeObserver(follow)
    observer.observe(content)
    return () => observer.disconnect()
  }, [children, open])
  if (!open)
    return (
      <div
        ref={preview}
        aria-hidden="true"
        inert
        data-slot="reasoning-preview"
        className="max-h-20 scroll-fade-t overflow-hidden pl-6 text-muted-foreground scroll-fade-t-8"
      >
        <MarkdownContent
          content={children}
          streaming={streaming}
          className="shrink-0 text-sm leading-relaxed"
        />
      </div>
    )
  return (
    <TraceCollapsibleContent className="pb-2">
      <div data-slot="reasoning-content">
        <MarkdownContent
          content={children}
          streaming={streaming}
          className="text-sm leading-relaxed"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 gap-1 px-0 text-xs text-muted-foreground"
        onClick={() => {
          setOpen(false)
          trigger.current?.focus({ preventScroll: true })
          trigger.current?.scrollIntoView?.({ block: "nearest" })
        }}
      >
        <ChevronDown className="size-3.5 rotate-180" aria-hidden="true" />
        {collapseLabel}
      </Button>
    </TraceCollapsibleContent>
  )
}
