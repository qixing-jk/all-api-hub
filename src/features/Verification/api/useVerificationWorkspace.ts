import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { useTranslation } from "react-i18next"

import { hasOpenFloatingLayer } from "~/components/ui/floating-layer"

import { useVerificationWorkspaceHeight } from "./useVerificationWorkspaceHeight"
import {
  VERIFICATION_SETTINGS_TARGETS,
  type VerificationSettingsTarget,
} from "./VerificationSelectionContext"

/** Own selection, persistent portal targets and sidebar focus within one workspace. */
export function useVerificationWorkspace({
  preparing,
  initialSettingsOpen,
}: {
  preparing: boolean
  initialSettingsOpen: boolean
}) {
  const { t } = useTranslation("aiApiVerification")
  const [selectedId, select] = useState<string | null>(null)
  const { frameRef, isWide, isThreeColumn, availableHeight } =
    useVerificationWorkspaceHeight(selectedId)
  const [manualListCollapsed, setListCollapsed] = useState<boolean>()
  const listCollapsed = manualListCollapsed ?? false
  const listToggleRef = useRef<HTMLButtonElement>(null)
  const selectTest = useCallback(
    (id: string) => {
      select(id)
      if (!isWide) {
        setListCollapsed(true)
        requestAnimationFrame(() => {
          const frame = frameRef.current
          if (
            !frame ||
            frame.ownerDocument.activeElement !== frame.ownerDocument.body
          )
            return
          const button = frame.querySelector<HTMLButtonElement>(
            '[data-verification-summary-collapsed] button[aria-expanded="true"]',
          )
          // Restore the list trigger when its selected row is replaced by icons.
          listToggleRef.current?.focus({ preventScroll: true })
          button?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
        })
      }
    },
    [frameRef, isWide],
  )
  const listId = useId()
  const listToggleLabel = t(
    listCollapsed
      ? "verifyDialog.workspace.expandTests"
      : "verifyDialog.workspace.collapseTests",
  )
  const [settingsTarget, setSettingsTarget] = useState<HTMLDivElement | null>(
    null,
  )
  const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null)
  const [detailTarget] = useState(() => {
    const host = document.createElement("div")
    host.className = "contents"
    return host
  })
  const attachDetails = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && detailTarget.parentElement !== node)
        node.appendChild(detailTarget)
    },
    [detailTarget],
  )
  const [headerStatusTarget, setHeaderStatusTarget] =
    useState<HTMLDivElement | null>(null)
  const [manualSettingsOpen, setManualSettingsOpen] = useState<
    boolean | undefined
  >(initialSettingsOpen ? true : undefined)
  const settingsOpen = preparing || (manualSettingsOpen ?? isThreeColumn)
  const settingsToggleLabel = t(
    settingsOpen
      ? "verifyDialog.workspace.collapseSettings"
      : "verifyDialog.workspace.expandSettings",
  )
  const settingsId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const settingsRef = useRef<HTMLElement>(null)
  const closeSettings = useCallback(() => {
    setManualSettingsOpen(false)
    if (!isWide) setListCollapsed(true)
    toggleRef.current?.focus()
  }, [isWide])
  const openSettings = useCallback(
    (target?: VerificationSettingsTarget) => {
      setManualSettingsOpen(true)
      if (!isWide) setListCollapsed(true)
      requestAnimationFrame(() => {
        if (target === VERIFICATION_SETTINGS_TARGETS.ReferenceAnswer) {
          const field = settingsTarget?.querySelector<HTMLTextAreaElement>(
            "[data-verification-test-settings]:not([hidden]) [data-verification-reference-answer]",
          )
          const disclosure = field
            ?.closest("[data-verification-settings-card]")
            ?.querySelector<HTMLButtonElement>(":scope > h6 button")
          if (disclosure?.getAttribute("aria-expanded") === "false")
            disclosure.click()
          requestAnimationFrame(() => {
            field?.scrollIntoView?.({ block: "nearest" })
            field?.focus()
          })
          return
        }
        // Opening must not steal focus if the user already reached an editor.
        if (toggleRef.current?.matches(":focus")) settingsRef.current?.focus()
      })
    },
    [isWide, settingsTarget],
  )
  const toggleSettings = () => {
    if (settingsOpen) closeSettings()
    else openSettings()
  }
  const onSettingsKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (hasOpenFloatingLayer(event.currentTarget)) return
      // Modal's capture handler prevents the browser default before this pane handles Escape.
      if (
        isWide &&
        event.key === "Escape" &&
        event.currentTarget.contains(event.target as Node)
      ) {
        // Portalled calendars and selects own Escape even though React bubbles it here.
        event.preventDefault()
        event.stopPropagation()
        closeSettings()
      }
    },
    [closeSettings, isWide],
  )
  const items = useRef(new Map<string, string | undefined>())
  const currentTestLabel = items.current.get(selectedId ?? "")
  // Keep the selected identity while either mobile sidebar covers the detail.
  const mobileTestSwitcher = !isWide && manualListCollapsed !== undefined
  const listToggleText =
    mobileTestSwitcher && currentTestLabel
      ? currentTestLabel
      : t("verifyDialog.workspace.tests")
  const register = useCallback((id: string, label?: string) => {
    items.current.set(id, label)
    select((current) => current ?? id)
    return () => {
      items.current.delete(id)
      select((current) =>
        current === id ? (items.current.keys().next().value ?? null) : current,
      )
    }
  }, [])
  const selection = useMemo(
    () => ({
      selectedId,
      select: selectTest,
      register,
      isWide,
      availableHeight,
      detailTarget,
      detailCovered: !isWide && (settingsOpen || !listCollapsed),
      settingsTarget,
      headerTarget,
      headerStatusTarget,
      onSettingsKeyDown,
      openSettings,
      listCollapsed,
    }),
    [
      selectedId,
      selectTest,
      register,
      isWide,
      availableHeight,
      detailTarget,
      settingsOpen,
      settingsTarget,
      headerTarget,
      headerStatusTarget,
      onSettingsKeyDown,
      openSettings,
      listCollapsed,
    ],
  )
  return {
    frameRef,
    isWide,
    selectedId,
    selection,
    manualListCollapsed,
    listCollapsed,
    setListCollapsed,
    listToggleRef,
    listId,
    listToggleLabel,
    listToggleText,
    mobileTestSwitcher,
    currentTestLabel,
    settingsOpen,
    setManualSettingsOpen,
    settingsToggleLabel,
    settingsId,
    toggleRef,
    settingsRef,
    closeSettings,
    toggleSettings,
    onSettingsKeyDown,
    setHeaderStatusTarget,
    setHeaderTarget,
    setSettingsTarget,
    attachDetails,
  }
}
