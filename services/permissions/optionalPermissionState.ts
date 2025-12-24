import { Storage } from "@plasmohq/storage"

import { OPTIONAL_PERMISSIONS } from "./permissionManager"

const STORAGE_KEY = "optional_permissions_state"

interface OptionalPermissionState {
  lastSeen: string[]
}

const storage = new Storage({
  area: "local",
})

/**
 * Read the last acknowledged optional permissions from local (non-synced) storage.
 */
export async function getLastSeenOptionalPermissions(): Promise<
  string[] | null
> {
  try {
    const state = (await storage.get(
      STORAGE_KEY,
    )) as OptionalPermissionState | null
    return state?.lastSeen ?? null
  } catch (error) {
    console.error(
      "[Permissions] Failed to read last seen optional permissions",
      error,
    )
    return null
  }
}

/**
 * Persist the current optional permissions as acknowledged.
 */
export async function setLastSeenOptionalPermissions(
  permissions: string[] = OPTIONAL_PERMISSIONS,
): Promise<void> {
  try {
    const sorted = [...permissions].sort()
    await storage.set(STORAGE_KEY, { lastSeen: sorted })
  } catch (error) {
    console.error(
      "[Permissions] Failed to store last seen optional permissions",
      error,
    )
  }
}

/**
 * Remove the stored snapshot (useful for tests or retrying prompts).
 */
export async function clearLastSeenOptionalPermissions(): Promise<void> {
  try {
    await storage.remove(STORAGE_KEY)
  } catch (error) {
    console.error(
      "[Permissions] Failed to clear last seen optional permissions",
      error,
    )
  }
}

/**
 * Returns true when the current optional permissions include any new entries
 * compared with what the user last acknowledged.
 */
export async function hasNewOptionalPermissions(
  current: string[] = OPTIONAL_PERMISSIONS,
): Promise<boolean> {
  const lastSeen = await getLastSeenOptionalPermissions()
  if (!lastSeen) return true

  const lastSeenSet = new Set(lastSeen)
  return current.some((perm) => !lastSeenSet.has(perm))
}
