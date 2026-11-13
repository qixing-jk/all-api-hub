// Adapted to shadcn/ui Message Scroller; see NOTICE.md.
import { ArrowDown } from "lucide-react"
import type { ComponentProps } from "react"

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "~/components/ui/message-scroller"
import { cn } from "~/lib/utils"

/** Confine automatic following to the process viewport, without animated scrolling. */
export function Conversation({
  className,
  children,
  "aria-label": label,
  ...props
}: ComponentProps<typeof MessageScroller>) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller
        className={cn("h-auto min-w-0 flex-1", className)}
        role="log"
        aria-label={label}
        {...props}
      >
        {children}
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

/** Fill a desktop result pane; keep a viewport-sized reading area on narrow screens. */
export function ConversationContent({
  className,
  children,
  "aria-label": label,
  ...props
}: ComponentProps<typeof MessageScrollerContent>) {
  return (
    <MessageScrollerViewport
      aria-label={label}
      className="h-auto max-h-[65dvh] flex-1 scroll-auto [@container(min-width:52rem)]:max-h-none"
    >
      <MessageScrollerContent
        data-slot="conversation-content"
        role="presentation"
        className={cn("min-h-0 min-w-0 gap-0 px-1 py-1", className)}
        {...props}
      >
        <MessageScrollerItem messageId="process">
          {children}
        </MessageScrollerItem>
      </MessageScrollerContent>
    </MessageScrollerViewport>
  )
}

/** Resume following only when explicitly requested after the reader scrolls away. */
export function ConversationScrollButton({
  children,
  className,
  ...props
}: ComponentProps<typeof MessageScrollerButton>) {
  return (
    <MessageScrollerButton
      type="button"
      behavior="instant"
      variant="outline"
      size="sm"
      className={cn(
        "absolute bottom-2 left-1/2 -translate-x-1/2 gap-1.5 rounded-full bg-background shadow-sm",
        className,
      )}
      {...props}
    >
      <ArrowDown className="size-3.5" aria-hidden="true" />
      {children}
    </MessageScrollerButton>
  )
}
