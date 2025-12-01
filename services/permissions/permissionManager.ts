import {
  containsPermissions,
  getManifest,
  onPermissionsAdded,
  onPermissionsRemoved,
  removePermissions,
  requestPermissions
} from "~/utils/browserApi"

export type ManifestPermissions = browser._manifest.Permission
export type ManifestOptionalPermissions = browser._manifest.OptionalPermission

function readOptionalPermissions(): ManifestOptionalPermissions[] {
  const manifest = getManifest()
  return (manifest.optional_permissions ?? []) as ManifestOptionalPermissions[]
}

export const OPTIONAL_PERMISSIONS: ManifestOptionalPermissions[] =
  readOptionalPermissions()

export const COOKIE_INTERCEPTOR_PERMISSIONS: ManifestOptionalPermissions[] = [
  "cookies",
  "webRequest",
  "webRequestBlocking"
]

export async function hasCookieInterceptorPermissions(): Promise<boolean> {
  return await hasPermissions(COOKIE_INTERCEPTOR_PERMISSIONS)
}

export interface PermissionDefinition {
  id: ManifestOptionalPermissions
  titleKey: string
  descriptionKey: string
}

export const OPTIONAL_PERMISSION_DEFINITIONS: PermissionDefinition[] =
  OPTIONAL_PERMISSIONS.map((id) => ({
    id,
    titleKey: `permissions.items.${id}.title`,
    descriptionKey: `permissions.items.${id}.description`
  }))

export async function hasPermission(
  id: ManifestOptionalPermissions
): Promise<boolean> {
  return await containsPermissions({ permissions: [id] })
}

export async function hasPermissions(
  ids: ManifestOptionalPermissions[]
): Promise<boolean> {
  if (ids.length === 0) return true
  return await containsPermissions({ permissions: ids })
}

export async function requestPermission(
  id: ManifestOptionalPermissions
): Promise<boolean> {
  return await requestPermissions({ permissions: [id] })
}

export async function removePermission(
  id: ManifestOptionalPermissions
): Promise<boolean> {
  return await removePermissions({ permissions: [id] })
}

export async function ensurePermissions(
  ids: ManifestOptionalPermissions[]
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

  return await requestPermissions({ permissions: missing })
}

export function getPermissionDefinition(id: ManifestOptionalPermissions) {
  return OPTIONAL_PERMISSION_DEFINITIONS.find((perm) => perm.id === id)
}

export function onOptionalPermissionsChanged(callback: () => void): () => void {
  const unsubscribeAdded = onPermissionsAdded((permissions) => {
    if (
      permissions.permissions?.some((permission) =>
        OPTIONAL_PERMISSIONS.includes(permission as ManifestOptionalPermissions)
      )
    ) {
      callback()
    }
  })

  const unsubscribeRemoved = onPermissionsRemoved((permissions) => {
    if (
      permissions.permissions?.some((permission) =>
        OPTIONAL_PERMISSIONS.includes(permission as ManifestOptionalPermissions)
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
