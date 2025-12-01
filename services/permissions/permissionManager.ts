import {
  containsPermissions,
  getManifest,
  onPermissionsAdded,
  onPermissionsRemoved,
  removePermissions,
  requestPermissions
} from "~/utils/browserApi"

const ALL_OPTIONAL_PERMISSIONS = [
  "cookies",
  "webRequest",
  "webRequestBlocking"
] as const

export type OptionalPermission = (typeof ALL_OPTIONAL_PERMISSIONS)[number]

function readOptionalPermissions(): OptionalPermission[] {
  const manifest = getManifest()
  const manifestPermissions = manifest.optional_permissions ?? []

  return manifestPermissions.filter(
    (permission): permission is OptionalPermission =>
      (ALL_OPTIONAL_PERMISSIONS as readonly string[]).includes(permission)
  )
}

export const OPTIONAL_PERMISSIONS: OptionalPermission[] =
  readOptionalPermissions()

export const COOKIE_INTERCEPTOR_PERMISSIONS: OptionalPermission[] = [
  ...OPTIONAL_PERMISSIONS
]

export async function hasCookieInterceptorPermissions(): Promise<boolean> {
  return await hasPermissions(COOKIE_INTERCEPTOR_PERMISSIONS)
}

export interface PermissionDefinition {
  id: OptionalPermission
  titleKey: string
  descriptionKey: string
}

export const OPTIONAL_PERMISSION_DEFINITIONS: PermissionDefinition[] =
  OPTIONAL_PERMISSIONS.map((id) => ({
    id,
    titleKey: `permissions.items.${id}.title`,
    descriptionKey: `permissions.items.${id}.description`
  }))

export async function hasPermission(id: OptionalPermission): Promise<boolean> {
  return await containsPermissions({ permissions: [id] })
}

export async function hasPermissions(
  ids: OptionalPermission[]
): Promise<boolean> {
  if (ids.length === 0) return true
  return await containsPermissions({ permissions: ids })
}

export async function requestPermission(
  id: OptionalPermission
): Promise<boolean> {
  return await requestPermissions({ permissions: [id] })
}

export async function removePermission(
  id: OptionalPermission
): Promise<boolean> {
  return await removePermissions({ permissions: [id] })
}

export async function ensurePermissions(
  ids: OptionalPermission[]
): Promise<boolean> {
  const missing: OptionalPermission[] = []

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

export function getPermissionDefinition(id: OptionalPermission) {
  return OPTIONAL_PERMISSION_DEFINITIONS.find((perm) => perm.id === id)
}

function includesOptionalPermission(permissions?: string[]): boolean {
  if (!permissions?.length) return false
  return permissions.some((permission) =>
    (ALL_OPTIONAL_PERMISSIONS as readonly string[]).includes(permission)
  )
}

export function onOptionalPermissionsChanged(callback: () => void): () => void {
  const unsubscribeAdded = onPermissionsAdded((permissions) => {
    if (includesOptionalPermission(permissions.permissions)) {
      callback()
    }
  })

  const unsubscribeRemoved = onPermissionsRemoved((permissions) => {
    if (includesOptionalPermission(permissions.permissions)) {
      callback()
    }
  })

  return () => {
    unsubscribeAdded()
    unsubscribeRemoved()
  }
}
