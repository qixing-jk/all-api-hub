import { createContext, useContext, type KeyboardEventHandler } from "react"

/** Targeted settings disclosures shared by the workspace and composers. */
export const VERIFICATION_SETTINGS_TARGETS = {
  ReferenceAnswer: "reference-answer",
} as const
export type VerificationSettingsTarget =
  (typeof VERIFICATION_SETTINGS_TARGETS)[keyof typeof VERIFICATION_SETTINGS_TARGETS]

/** Viewing a test is independent from its controller's execution state. */
export const VerificationSelectionContext = createContext<{
  selectedId: string | null
  isWide: boolean
  availableHeight: number
  detailTarget?: HTMLElement | null
  detailCovered?: boolean
  settingsTarget?: HTMLElement | null
  headerTarget?: HTMLElement | null
  headerStatusTarget?: HTMLElement | null
  listCollapsed?: boolean
  onSettingsKeyDown?: KeyboardEventHandler<HTMLElement>
  openSettings?: (target?: VerificationSettingsTarget) => void
  select: (id: string) => void
  register: (id: string, label?: string) => () => void
} | null>(null)

/** Header ownership follows the detail even when its content renders through portals. */
export const VerificationDetailContext = createContext<{
  headerTarget: HTMLElement | null
  headerActionsTarget?: HTMLElement | null
  selected: boolean
  settingsTitle?: string
} | null>(null)

/** One visibility rule for the selected test summary and its parked detail. */
export function useVerificationProbeSelection(id: string) {
  const selection = useContext(VerificationSelectionContext)
  return {
    selection,
    selected: !selection || selection.selectedId === id,
    isCollapsed: Boolean(selection?.listCollapsed),
    detailCovered: Boolean(
      selection &&
      !selection.isWide &&
      (selection.detailCovered ?? !selection.listCollapsed),
    ),
  }
}
