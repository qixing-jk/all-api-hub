import {
  hasStorageChangedListener,
  onStorageChanged,
} from "~/utils/browser/storage"

const STORAGE_CHANGE_SNAPSHOT_DEBOUNCE_MS = 2_000

/** Owns one idempotent local-storage subscription, including pending snapshot cleanup. */
export function createStorageSnapshotListener(
  storageKey: string,
  capture: () => void,
) {
  let cleanup: (() => void) | null = null

  return function setup() {
    if (cleanup) return cleanup
    if (!hasStorageChangedListener()) return () => {}

    let timer: ReturnType<typeof setTimeout> | null = null
    let isListening = true
    const cleanupStorageChanged = onStorageChanged((changes, areaName) => {
      if (!isListening || areaName !== "local" || !(storageKey in changes))
        return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        capture()
      }, STORAGE_CHANGE_SNAPSHOT_DEBOUNCE_MS)
    })

    cleanup = () => {
      if (!isListening) return
      isListening = false
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      cleanupStorageChanged()
      cleanup = null
    }
    return cleanup
  }
}
