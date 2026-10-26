import { Play, Square } from "lucide-react"
import type { ComponentProps } from "react"

import { Button, BUTTON_LOADING_BEHAVIORS } from "~/components/ui"

/** Quiet row action shared by account, credential, CLI and webpage probes. */
export function VerificationRunButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground hover:text-foreground gap-x-1 px-2 text-xs"
      loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
      leftIcon={
        props.loading ? (
          <Square aria-hidden="true" className="size-3.5" />
        ) : (
          <Play aria-hidden="true" className="size-3.5" />
        )
      }
      {...props}
    />
  )
}
