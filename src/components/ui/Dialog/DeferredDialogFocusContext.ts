import { createContext } from "react"

/** The opener survives replacement of a deferred dialog's loading surface. */
export const DeferredDialogFocusContext = createContext<HTMLElement | null>(
  null,
)
