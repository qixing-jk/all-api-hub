import { createContext } from "react"

/** Viewing a test is independent from its controller's execution state. */
export const VerificationSelectionContext = createContext<{
  selectedId: string | null
  isWide: boolean
  availableHeight: number
  select: (id: string) => void
  register: (id: string) => () => void
} | null>(null)
