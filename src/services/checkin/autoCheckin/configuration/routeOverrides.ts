import type {
  CheckInConfig,
  CheckInMethodId,
  CheckInRouteOverride,
} from "~/types/checkIn"

/** Longest request path retained for one method; longer values are not stored. */
const CHECK_IN_ROUTE_PATH_MAX_LENGTH = 200

export { CHECK_IN_ROUTE_OVERRIDE_SOURCES } from "~/constants/checkIn"

/**
 * Normalize a same-origin request path for a check-in route.
 *
 * Only an absolute path is accepted: a full URL would silently move requests to
 * another origin, and a query or fragment would be concatenated with the
 * operation's own parameters. `null` means "not a path this module can use",
 * so callers keep their canonical default instead of requesting the value.
 */
export function normalizeCheckInRoutePath(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > CHECK_IN_ROUTE_PATH_MAX_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.trim() !== value ||
    /[\\?#\s<>"`]/.test(value)
  ) {
    return null
  }
  try {
    const parsed = new URL(value, "https://route.invalid")
    return parsed.pathname === value &&
      parsed.origin === "https://route.invalid"
      ? value
      : null
  } catch {
    return null
  }
}

/** Read one stored override, ignoring a value that is no longer a usable path. */
export function readCheckInRouteOverride(
  config: CheckInConfig,
  methodId: CheckInMethodId,
): CheckInRouteOverride | undefined {
  const override = config.routeOverrides?.[methodId]
  if (!override) return undefined
  const path = normalizeCheckInRoutePath(override.path)
  return path ? { ...override, path } : undefined
}

/** Resolve the request path this account uses for one method's route. */
export function readCheckInRoutePath(
  config: CheckInConfig,
  methodId: CheckInMethodId,
  canonicalPath: string,
): string {
  return readCheckInRouteOverride(config, methodId)?.path ?? canonicalPath
}

/**
 * List every route this account actually calls, for read-only diagnostics.
 *
 * A report that only probed the canonical path would describe a route the
 * account never uses, so the deployment's own paths come first.
 */
export function listCheckInRoutePaths(config: CheckInConfig): string[] {
  const overrides = config.routeOverrides
  if (!overrides) return []
  const paths = new Set<string>()
  for (const methodId of Object.keys(overrides) as CheckInMethodId[]) {
    const override = readCheckInRouteOverride(config, methodId)
    if (override) paths.add(override.path)
  }
  return [...paths]
}

/**
 * Set or clear one method's route override.
 *
 * Clearing removes the whole map when it becomes empty, so a normalized account
 * without overrides stays byte-identical to one that never had any.
 */
export function withCheckInRouteOverride(
  config: CheckInConfig,
  methodId: CheckInMethodId,
  override: CheckInRouteOverride | null,
): CheckInConfig {
  const routeOverrides = { ...config.routeOverrides }
  if (override === null) {
    delete routeOverrides[methodId]
  } else {
    const path = normalizeCheckInRoutePath(override.path)
    if (!path) return config
    routeOverrides[methodId] = { ...override, path }
  }
  return Object.keys(routeOverrides).length > 0
    ? { ...config, routeOverrides }
    : { ...config, routeOverrides: undefined }
}
