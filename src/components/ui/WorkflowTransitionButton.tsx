import * as React from "react"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"

import { Button } from "./button"

/**
 * WorkflowTransitionButton is a thin Button wrapper for actions that move the
 * user into another page-level workflow. It keeps navigation logic in the
 * caller while standardizing the trailing workflow-transition affordance.
 */
export function WorkflowTransitionButton({
  rightIcon,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      rightIcon={
        rightIcon ?? <WorkflowTransitionIcon className="h-4 w-4" aria-hidden />
      }
      {...props}
    />
  )
}
