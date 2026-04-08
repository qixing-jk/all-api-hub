import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import type { ComponentProps } from "react"

/**
 * WorkflowTransitionIcon marks actions that move the user into a different
 * page-level workflow, even when the destination still lives inside the
 * extension rather than a separate browser tab.
 */
export function WorkflowTransitionIcon(
  props: ComponentProps<typeof ArrowTopRightOnSquareIcon>,
) {
  return <ArrowTopRightOnSquareIcon {...props} />
}
