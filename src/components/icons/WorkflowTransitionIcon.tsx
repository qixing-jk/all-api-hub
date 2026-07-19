import { ArrowUpRight } from "lucide-react"
import type { ComponentProps } from "react"

/**
 * WorkflowTransitionIcon marks actions that move the user out of the current
 * surface into another workflow or destination.
 */
export function WorkflowTransitionIcon(
  props: ComponentProps<typeof ArrowUpRight>,
) {
  return <ArrowUpRight {...props} />
}
