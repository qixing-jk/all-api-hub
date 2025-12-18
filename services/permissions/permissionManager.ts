import {
  containsPermissions,
  getManifest,
  onPermissionsAdded,
  onPermissionsRemoved,
  removePermissions,
  requestPermissions,
} from "~/utils/browserApi"

/**
 * Aliases to manifest permission types for clearer signatures.
 */
export type ManifestPermissions = browser._manifest.Permission

export const OPTIONAL_PERMISSION_IDS = {
  Cookies: "cookies",
  declarativeNetRequestWithHostAccess: "declarativeNetRequestWithHostAccess",
  WebRequest: "webRequest",
  WebRequestBlocking: "webRequestBlocking",
} as const

export type ManifestOptionalPermissions =
  (typeof OPTIONAL_PERMISSION_IDS)[keyof typeof OPTIONAL_PERMISSION_IDS]

/**
 * Read optional permissions declared in manifest.
 */
function readOptionalPermissions(): ManifestOptionalPermissions[] {
  const manifest = getManifest()
  return (manifest.optional_permissions ?? []) as ManifestOptionalPermissions[]
}

/**
 * All optional permissions declared in manifest.json.
 */
export const OPTIONAL_PERMISSIONS: ManifestOptionalPermissions[] =
  readOptionalPermissions()

/**
 * Optional permissions required for cookie interception flows.
 */
export const COOKIE_INTERCEPTOR_PERMISSIONS: ManifestOptionalPermissions[] = [
  OPTIONAL_PERMISSION_IDS.Cookies,
  OPTIONAL_PERMISSION_IDS.WebRequest,
  OPTIONAL_PERMISSION_IDS.WebRequestBlocking,
]

/**
 * Check whether cookie interceptor permissions are already granted.
 */
export async function hasCookieInterceptorPermissions(): Promise<boolean> {
  return await hasPermissions(COOKIE_INTERCEPTOR_PERMISSIONS)
}

export interface PermissionDefinition {
  id: ManifestOptionalPermissions
  titleKey: string
  descriptionKey: string
}

/**
 * Optional permission definitions with i18n keys for UI rendering.
 */
export const OPTIONAL_PERMISSION_DEFINITIONS: PermissionDefinition[] =
  OPTIONAL_PERMISSIONS.map((id) => ({
    id,
    titleKey: `permissions.items.${id}.title`,
    descriptionKey: `permissions.items.${id}.description`,
  }))

/**
 * Check a single optional permission.
 */
export async function hasPermission(
  id: ManifestOptionalPermissions,
): Promise<boolean> {
  return await containsPermissions({
    permissions: [id as unknown as browser._manifest.OptionalPermission],
  })
}

/**
 * Check multiple optional permissions; empty list always true.
 */
export async function hasPermissions(
  ids: ManifestOptionalPermissions[],
): Promise<boolean> {
  if (ids.length === 0) return true
  return await containsPermissions({
    permissions: ids as unknown as browser._manifest.OptionalPermission[],
  })
}

/**
 * Request a single optional permission from the user.
 */
export async function requestPermission(
  id: ManifestOptionalPermissions,
): Promise<boolean> {
  return await requestPermissions({
    permissions: [id as unknown as browser._manifest.OptionalPermission],
  })
}

/**
 * Remove a single optional permission (revocation).
 */
export async function removePermission(
  id: ManifestOptionalPermissions,
): Promise<boolean> {
  return await removePermissions({
    permissions: [id as unknown as browser._manifest.OptionalPermission],
  })
}

/**
 * Ensure a set of optional permissions; prompts only for missing ones.
 */
export async function ensurePermissions(
  ids: ManifestOptionalPermissions[],
): Promise<boolean> {
  const missing: ManifestOptionalPermissions[] = []

  for (const id of ids) {
    if (!(await hasPermission(id))) {
      missing.push(id)
    }
  }

  if (missing.length === 0) {
    return true
  }

  return await requestPermissions({
    permissions: missing as unknown as browser._manifest.OptionalPermission[],
  })
}

/**
 * Get i18n definition for an optional permission.
 */
export function getPermissionDefinition(id: ManifestOptionalPermissions) {
  return OPTIONAL_PERMISSION_DEFINITIONS.find((perm) => perm.id === id)
}

/**
 * Subscribe to optional permission changes (added/removed).
 * Returns an unsubscribe function to detach both listeners.
 */
export function onOptionalPermissionsChanged(callback: () => void): () => void {
  const unsubscribeAdded = onPermissionsAdded((permissions) => {
    if (
      permissions.permissions?.some((permission) =>
        OPTIONAL_PERMISSIONS.includes(
          permission as ManifestOptionalPermissions,
        ),
      )
    ) {
      callback()
    }
  })

  const unsubscribeRemoved = onPermissionsRemoved((permissions) => {
    if (
      permissions.permissions?.some((permission) =>
        OPTIONAL_PERMISSIONS.includes(
          permission as ManifestOptionalPermissions,
        ),
      )
    ) {
      callback()
    }
  })

  return () => {
    unsubscribeAdded()
    unsubscribeRemoved()
  }
}
