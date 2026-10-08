import "~/utils/browser/browserEnvironment"

/**
 * Subscribes to local/browser storage changes when the API is available.
 */
export function onStorageChanged(
  callback: (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => void,
): () => void {
  const onChanged = (globalThis as any).browser?.storage?.onChanged as
    | {
        addListener?: (listener: typeof callback) => void
        removeListener?: (listener: typeof callback) => void
      }
    | undefined

  if (
    typeof onChanged?.addListener !== "function" ||
    typeof onChanged?.removeListener !== "function"
  ) {
    return () => {}
  }

  onChanged.addListener(callback)
  return () => {
    onChanged.removeListener?.(callback)
  }
}

/**
 * Returns whether storage change subscriptions are available.
 */
export function hasStorageChangedListener(): boolean {
  const onChanged = (globalThis as any).browser?.storage?.onChanged
  return (
    typeof onChanged?.addListener === "function" &&
    typeof onChanged?.removeListener === "function"
  )
}

/**
 * Writes values to browser.storage.local through the guarded browser adapter.
 */
export async function setLocalStorage(values: Record<string, unknown>) {
  await browser.storage.local.set(values)
}

/**
 * Removes keys from browser.storage.local through the guarded browser adapter.
 */
export async function removeLocalStorage(keys: string | string[]) {
  await browser.storage.local.remove(keys)
}

/**
 * Reports whether this browser exposes the memory-only storage.session area.
 */
export function hasSessionStorageArea(): boolean {
  const session = (globalThis as any).browser?.storage?.session
  return (
    typeof session?.get === "function" && typeof session?.set === "function"
  )
}

/**
 * Reads keys from browser.storage.session through the guarded browser adapter.
 */
export async function getSessionStorageValues(
  keys?: string | string[] | Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  if (!hasSessionStorageArea()) return {}
  return await (globalThis as any).browser.storage.session.get(keys)
}

/**
 * Writes values to browser.storage.session through the guarded browser adapter.
 */
export async function setSessionStorageValues(
  values: Record<string, unknown>,
): Promise<boolean> {
  if (!hasSessionStorageArea()) return false
  try {
    await (globalThis as any).browser.storage.session.set(values)
    return true
  } catch {
    return false
  }
}

/** Removes ephemeral values without falling back to persistent storage. */
export async function removeSessionStorageValues(
  keys: string | string[],
): Promise<void> {
  if (!hasSessionStorageArea()) return
  await (globalThis as any).browser.storage.session.remove(keys)
}
