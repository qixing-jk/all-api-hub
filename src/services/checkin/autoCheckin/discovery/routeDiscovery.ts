import {
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_ROUTE_OVERRIDE_SOURCES,
} from "~/constants/checkIn"
import {
  normalizeCheckInRoutePath,
  readCheckInRouteOverride,
  withCheckInRouteOverride,
} from "~/services/checkin/autoCheckin/configuration/routeOverrides"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { collectFeedbackCluesInBrowser } from "~/services/checkin/feedback/scanClient"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import type { SiteAccount } from "~/types"
import type {
  CheckInConfig,
  CheckInMethodDetection,
  CheckInMethodId,
} from "~/types/checkIn"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

/** Candidates probed in one round; the scan budget already bounds the path list. */
const MAX_ROUTE_PROBES = 4

/**
 * Detection results that make a renamed route plausible.
 *
 * A 404/405 is the direct signal. Deployments that authenticate before route
 * matching answer `403` or a message-only rejection instead, which lands as
 * `permission_denied`; a body that is not the canonical DTO lands as
 * `invalid_response`. Transport, timeout and authentication failures are not
 * evidence about the route, so they never start a scan.
 */
const ROUTE_DISCOVERY_TRIGGERING_REASONS = new Set<string>([
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
])

interface RouteDiscoveryContext {
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
  signal?: AbortSignal
}

/** Whether this detection leaves the route itself in question. */
function shouldProbeRoutes(detection: CheckInMethodDetection | undefined) {
  if (!detection) return false
  if (detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported) {
    return true
  }
  return (
    detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown &&
    ROUTE_DISCOVERY_TRIGGERING_REASONS.has(detection.reason)
  )
}

/**
 * Keep only paths that could be this method's route.
 *
 * The active path already failed detection, so it is skipped. Manual
 * overrides are excluded before scanning. API paths come first: a console page
 * that merely mentions "daily" may appear earlier in the asset scan.
 */
function selectCandidatePaths(input: {
  routes: readonly string[]
  excludedPath?: string
}): string[] {
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const route of input.routes) {
    if (route === input.excludedPath || !normalizeCheckInRoutePath(route)) {
      continue
    }
    if (seen.has(route)) continue
    seen.add(route)
    candidates.push(route)
  }
  return candidates.sort(
    (left, right) =>
      Number(!left.startsWith("/api/")) - Number(!right.startsWith("/api/")),
  )
}

/**
 * Learn a deployment's renamed check-in route from structural, read-only
 * evidence.
 *
 * Only an explicit user redetection calls this: it reads the site's own assets
 * once, then probes at most a few candidate paths with the same strict status
 * read detection uses. A path is adopted only when it answers with a complete
 * `stats.checked_in_today` status, so an unrelated endpoint that happens to
 * accept the request is never stored as this method's route.
 *
 * Unattended discovery never scans assets or probes candidates.
 */
export async function discoverCheckInRouteOverrides(input: {
  account: SiteAccount
  config: CheckInConfig
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>>
  context: RouteDiscoveryContext
}): Promise<CheckInConfig> {
  const registrations = autoCheckinMethodRegistry
    .getCandidates(input.account.site_type, input.account.site_url)
    .filter(
      (registration) =>
        registration.provider.supportsRouteOverride === true &&
        typeof registration.provider.probeRouteOverride === "function",
    )
  const pending = registrations.filter(
    (registration) =>
      readCheckInRouteOverride(input.config, registration.id)?.source !==
        CHECK_IN_ROUTE_OVERRIDE_SOURCES.Manual &&
      shouldProbeRoutes(input.detections[registration.id]),
  )
  if (pending.length === 0) return input.config

  let routes: string[]
  try {
    routes = await collectSiteRoutes(input.account, input.context)
  } catch {
    return input.config
  }
  if (input.context.signal?.aborted) return input.config

  let config = input.config
  let probes = 0
  for (const registration of pending) {
    if (input.context.signal?.aborted || probes >= MAX_ROUTE_PROBES) break
    const probeRouteOverride = registration.provider.probeRouteOverride
    if (!probeRouteOverride) continue
    const currentOverride = readCheckInRouteOverride(
      input.config,
      registration.id,
    )
    const candidates = selectCandidatePaths({
      routes,
      excludedPath:
        currentOverride?.path ?? registration.provider.canonicalRoutePath,
    })
    for (const path of candidates) {
      if (probes >= MAX_ROUTE_PROBES) break
      probes++
      const status = await probeRouteOverride({
        account: input.account,
        path,
        ...(input.context.signal ? { signal: input.context.signal } : {}),
      })
      if (!status) continue
      config = withCheckInRouteOverride(config, registration.id, {
        path,
        source: CHECK_IN_ROUTE_OVERRIDE_SOURCES.Discovery,
        observedAt: Date.now(),
      })
      break
    }
  }
  return config
}

/** Reads the deployment's own assets for candidate paths; never mutates. */
async function collectSiteRoutes(
  account: SiteAccount,
  context: RouteDiscoveryContext,
): Promise<string[]> {
  const clues = await collectFeedbackCluesInBrowser(
    {
      baseUrl: account.site_url,
      siteType: account.site_type,
      ...(account.authType === AuthTypeEnum.AccessToken &&
      account.account_info?.access_token
        ? {
            auth: {
              authType: account.authType,
              accessToken: account.account_info.access_token,
              userId: account.account_info.id,
            },
          }
        : {}),
    },
    context.signal ?? new AbortController().signal,
  )
  return clues.routes
}
