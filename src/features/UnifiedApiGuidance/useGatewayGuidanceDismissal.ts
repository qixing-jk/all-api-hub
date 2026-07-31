import { useCallback, useState } from "react"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  type GatewayGuidanceSurface,
  type UserPreferences,
} from "~/services/preferences/userPreferences"

import { shouldShowGatewayGuidanceSurface } from "./model"

const SESSION_STORAGE_KEY_PREFIX = "gatewayGuidance.dismissedForSession"

const getSessionStorageKey = (surface: GatewayGuidanceSurface) =>
  `${SESSION_STORAGE_KEY_PREFIX}.${surface}`

/**
 * Reads the session-only dismissal flag for a guidance surface.
 */
function readSessionDismissal(surface: GatewayGuidanceSurface): boolean {
  try {
    return (
      globalThis.sessionStorage?.getItem(getSessionStorageKey(surface)) === "1"
    )
  } catch {
    return false
  }
}

/**
 * Persists the session-only dismissal flag for a guidance surface.
 */
function writeSessionDismissal(surface: GatewayGuidanceSurface) {
  try {
    globalThis.sessionStorage?.setItem(getSessionStorageKey(surface), "1")
  } catch {
    // Session dismissal is a convenience-only state; ignore storage failures.
  }
}

/**
 * Coordinates temporary and persisted dismissal for source-surface gateway guidance.
 */
export function useGatewayGuidanceDismissal(
  surface: GatewayGuidanceSurface,
  preferences: UserPreferences | null | undefined,
) {
  const { dismissGatewayGuidanceSurface } = useUserPreferencesContext()
  const [dismissedForSession, setDismissedForSession] = useState(() =>
    readSessionDismissal(surface),
  )
  const [isPermanentDismissDialogOpen, setPermanentDismissDialogOpen] =
    useState(false)
  const [isPermanentDismissSaving, setPermanentDismissSaving] = useState(false)

  const dismissForSession = useCallback(() => {
    writeSessionDismissal(surface)
    setDismissedForSession(true)
  }, [surface])

  const requestPermanentDismiss = useCallback(() => {
    setPermanentDismissDialogOpen(true)
  }, [])

  const cancelPermanentDismiss = useCallback(() => {
    setPermanentDismissDialogOpen(false)
  }, [])

  const confirmPermanentDismiss = useCallback(async () => {
    setPermanentDismissSaving(true)
    try {
      const result = await dismissGatewayGuidanceSurface(surface)
      if (result.ok) {
        setPermanentDismissDialogOpen(false)
      }
    } finally {
      setPermanentDismissSaving(false)
    }
  }, [dismissGatewayGuidanceSurface, surface])

  return {
    shouldShow: shouldShowGatewayGuidanceSurface(
      preferences,
      surface,
      dismissedForSession,
    ),
    dismissForSession,
    requestPermanentDismiss,
    cancelPermanentDismiss,
    confirmPermanentDismiss,
    isPermanentDismissDialogOpen,
    isPermanentDismissSaving,
  }
}
