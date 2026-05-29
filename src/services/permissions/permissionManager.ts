import {
  containsPermissions,
  getManifest,
  onPermissionsAdded,
  onPermissionsRemoved,
  removePermissions,
  removePermissionsDetailed,
  requestPermissions,
  requestPermissionsDetailed,
  type PermissionOperationResult,
} from "~/utils/browser/browserApi"

export const OPTIONAL_PERMISSION_IDS = {
  Cookies: "cookies",
  declarativeNetRequestWithHostAccess: "declarativeNetRequestWithHostAccess",
  WebRequest: "webRequest",
  WebRequestBlocking: "webRequestBlocking",
  ClipboardRead: "clipboardRead",
  Notifications: "notifications",
} as const

export type ManifestOptionalPermissions =
  (typeof OPTIONAL_PERMISSION_IDS)[keyof typeof OPTIONAL_PERMISSION_IDS]

export interface PermissionEnsureResult extends PermissionOperationResult {
  id: ManifestOptionalPermissions
  requested: boolean
  wasGrantedBefore: boolean
  wasGrantedAfter: boolean
}

export interface EnsurePermissionsResult {
  success: boolean
  results: PermissionEnsureResult[]
  requestedResults: PermissionEnsureResult[]
}

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

interface PermissionDefinition {
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
 * Request a single optional permission while preserving API failure metadata.
 */
export async function requestPermissionDetailed(
  id: ManifestOptionalPermissions,
): Promise<PermissionOperationResult> {
  return await requestPermissionsDetailed({
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
 * Remove a single optional permission while preserving API failure metadata.
 */
export async function removePermissionDetailed(
  id: ManifestOptionalPermissions,
): Promise<PermissionOperationResult> {
  return await removePermissionsDetailed({
    permissions: [id as unknown as browser._manifest.OptionalPermission],
  })
}

/**
 * Ensure a set of optional permissions; prompts only for missing ones.
 */
export async function ensurePermissions(
  ids: ManifestOptionalPermissions[],
): Promise<boolean> {
  return (await ensurePermissionsDetailed(ids)).success
}

/**
 * Ensure optional permissions and expose per-permission before/after results.
 */
export async function ensurePermissionsDetailed(
  ids: ManifestOptionalPermissions[],
): Promise<EnsurePermissionsResult> {
  const missing: ManifestOptionalPermissions[] = []
  const grantedBeforeById = new Map<ManifestOptionalPermissions, boolean>()

  for (const id of ids) {
    const wasGrantedBefore = await hasPermission(id)
    grantedBeforeById.set(id, wasGrantedBefore)
    if (!wasGrantedBefore) {
      missing.push(id)
    }
  }

  if (missing.length === 0) {
    const results = ids.map((id) => ({
      id,
      requested: false,
      success: true,
      wasGrantedBefore: true,
      wasGrantedAfter: true,
    }))

    return {
      success: true,
      results,
      requestedResults: [],
    }
  }

  const requestResult = await requestPermissionsDetailed({
    permissions: missing as unknown as browser._manifest.OptionalPermission[],
  })
  const wasGrantedAfterById = new Map<ManifestOptionalPermissions, boolean>()

  for (const id of missing) {
    try {
      wasGrantedAfterById.set(id, await hasPermission(id))
    } catch {
      wasGrantedAfterById.set(id, false)
    }
  }

  const requestedResults = missing.map<PermissionEnsureResult>((id) => {
    const wasGrantedAfter = wasGrantedAfterById.get(id) ?? false

    return {
      id,
      requested: true,
      success: wasGrantedAfter,
      ...(!wasGrantedAfter && requestResult.failureReason
        ? { failureReason: requestResult.failureReason }
        : {}),
      wasGrantedBefore: grantedBeforeById.get(id) ?? false,
      wasGrantedAfter,
    }
  })
  const requestedResultById = new Map(
    requestedResults.map((result) => [result.id, result]),
  )
  const results = ids.map<PermissionEnsureResult>((id) => {
    const requestedResult = requestedResultById.get(id)
    if (requestedResult) {
      return requestedResult
    }

    return {
      id,
      requested: false,
      success: true,
      wasGrantedBefore: true,
      wasGrantedAfter: true,
    }
  })

  return {
    success: results.every((result) => result.success),
    results,
    requestedResults,
  }
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
