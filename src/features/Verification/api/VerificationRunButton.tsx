import { Play, Square } from "lucide-react"
import type { ComponentProps } from "react"

import { Button, BUTTON_LOADING_BEHAVIORS } from "~/components/ui"

/** Compact, visible row action shared by verification workspaces. */
export function VerificationRunButton(props: ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="gap-x-1 px-2.5 text-xs"
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
