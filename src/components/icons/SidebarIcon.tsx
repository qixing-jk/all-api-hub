import { PanelLeft, PanelRight } from "lucide-react"
import type { ComponentProps } from "react"

/** Identifies a sidebar by its side; edge handles show collapse direction. */
export function SidebarIcon({
  side,
  ...props
}: ComponentProps<typeof PanelLeft> & { side: "left" | "right" }) {
  const Icon = side === "left" ? PanelLeft : PanelRight
  return <Icon {...props} />
}
