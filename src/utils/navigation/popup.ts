import { isExtensionPopup } from "~/utils/browser"

/**
 * Closes the current window when running inside the extension popup.
 * Safe to call in other contexts; it no-ops when not in popup.
 */
export function closeIfPopup() {
  if (isExtensionPopup()) {
    window.close()
  }
}

/**
 * Wraps a function to auto-close the popup after execution when applicable.
 * @param fn Function to run before optional popup close.
 * @returns Wrapped function that preserves original return value.
 */
export const withPopupClose = <T extends any[], R>(
  fn: (...args: T) => Promise<R> | R,
) => {
  return async (...args: T) => {
    const result = await fn(...args)
    closeIfPopup()
    return result
  }
}

/**
 * Execute multiple navigation operations concurrently and close the popup once
 * every action has completed.
 * @param operations List of async/sync navigation callbacks to run together.
 */
export const openMultiplePages = async (
  operations: (() => Promise<void> | void)[],
) => {
  await Promise.all(operations.map((op) => op()))
  closeIfPopup()
}
