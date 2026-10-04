import { useEffect, useState } from "react"

import { isDevelopmentMode } from "~/utils/core/environment"

const DEV_FEATURES_UNLOCKED_STORAGE_KEY = "aah_dev_features_unlocked"
const DEV_FEATURES_CHANGED_EVENT = "aah_dev_features_changed"

/**
 * Checks whether developer-only features (lab pages, dev panel, API tools) are enabled.
 * Returns true if the build is in development mode or if unlocked via the Easter egg.
 */
export function isDevUnlocked(): boolean {
  if (isDevelopmentMode()) {
    return true
  }

  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem(DEV_FEATURES_UNLOCKED_STORAGE_KEY) === "true"
    )
  } catch {
    return false
  }
}

/**
 * Sets whether developer-only features are unlocked.
 */
function setDevUnlocked(unlocked: boolean): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (unlocked) {
        window.localStorage.setItem(DEV_FEATURES_UNLOCKED_STORAGE_KEY, "true")
      } else {
        window.localStorage.removeItem(DEV_FEATURES_UNLOCKED_STORAGE_KEY)
      }
    }
  } finally {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(DEV_FEATURES_CHANGED_EVENT, { detail: unlocked }),
      )
    }
  }
}

export type DevUnlockToggleResult = "already_dev" | "unlocked" | "locked"

/**
 * Toggles developer mode unlock state and returns the outcome.
 * In development mode (e.g. wxt dev), developer features are permanently active and returns "already_dev".
 * In production mode, toggles the Easter egg unlock state.
 */
export function toggleDevUnlocked(): DevUnlockToggleResult {
  if (isDevelopmentMode()) {
    return "already_dev"
  }

  const currentlyUnlocked = isDevUnlocked()
  const next = !currentlyUnlocked
  setDevUnlocked(next)
  return next ? "unlocked" : "locked"
}

/**
 * React hook to reactively track whether developer mode features are unlocked.
 */
export function useDevUnlocked(): boolean {
  const [unlocked, setUnlocked] = useState(isDevUnlocked)

  useEffect(() => {
    const handleUpdate = () => {
      setUnlocked(isDevUnlocked())
    }

    window.addEventListener(DEV_FEATURES_CHANGED_EVENT, handleUpdate)
    window.addEventListener("storage", handleUpdate)

    return () => {
      window.removeEventListener(DEV_FEATURES_CHANGED_EVENT, handleUpdate)
      window.removeEventListener("storage", handleUpdate)
    }
  }, [])

  return unlocked
}
