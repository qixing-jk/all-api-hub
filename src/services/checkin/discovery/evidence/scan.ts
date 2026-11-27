import PQueue from "p-queue"

import { resolveDeploymentApiOrigin } from "~/constants/deploymentApiOrigins"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import { AuthTypeEnum } from "~/types"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { CHECK_IN_EVIDENCE_SCAN_LIMITS } from "./scanLimits"
import {
  decodeSource,
  discoverAssets,
  extractCheckInRoutes,
  extractNativeCheckInPageRoutes,
  getResponseKeys,
  KEYWORDS,
  normalizeAssetUrls,
  normalizeCheckInRouteClue,
} from "./scanParsing"
import { createScanReader, SCAN_READ_ISSUES } from "./scanReader"
import {
  CHECK_IN_EVIDENCE_SCAN_PURPOSES,
  FEEDBACK_SCAN_ISSUES,
  FEEDBACK_SCAN_STATUSES,
  NATIVE_CHECK_IN_PAGE_SOURCES,
  type CheckInEvidence,
  type CheckInEvidenceScanInput,
  type CheckInNavigationEvidence,
  type NativeCheckInPageCandidate,
} from "./scanTypes"

export { extractCheckInRoutes } from "./scanParsing"

/** Runs a bounded, session-local GET scan with no refresh, login, mutation or storage side effects. */
export async function collectCheckInEvidence(
  input: CheckInEvidenceScanInput,
  signal: AbortSignal,
  options: {
    fetch?: typeof fetch
    timeoutMs?: number
    pageUrl?: string
    loadedAssets?: string[]
    navigation?: CheckInNavigationEvidence
  } = {},
): Promise<CheckInEvidence> {
  const origin = tryParseHttpUrl(input.baseUrl)?.origin
  const result: CheckInEvidence = {
    status: FEEDBACK_SCAN_STATUSES.Empty,
    statusQueries: [],
    routes: [],
    authenticatedQueriesUnavailable: false,
  }
  if (!origin || signal.aborted) return result
  const task = new AbortController()
  const cancel = () => task.abort()
  signal.addEventListener("abort", cancel, { once: true })
  let timedOut = false
  const timer = setTimeout(
    () => {
      timedOut = true
      cancel()
    },
    Math.min(
      options.timeoutMs ?? CHECK_IN_EVIDENCE_SCAN_LIMITS.taskTimeoutMs,
      CHECK_IN_EVIDENCE_SCAN_LIMITS.taskTimeoutMs,
    ),
  )
  let partial = false
  // Only the maintained deployment map may redirect account status reads.
  // Page/resources remain restricted to the browser origin and share budgets.
  const statusOrigin =
    tryParseHttpUrl(resolveDeploymentApiOrigin(origin))?.origin ?? origin
  const { read, readStatus, exhausted, issues } = createScanReader(
    origin,
    task.signal,
    options.fetch,
    statusOrigin,
  )
  const scanIssues = new Set<NonNullable<CheckInEvidence["issues"]>[number]>()

  try {
    const paths =
      input.purpose === CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage
        ? []
        : getCheckInFeedbackStatusRoutes(
            input.siteType,
            input.baseUrl,
            input.routePaths,
          )
    // Never substitute a browser's ambient session for a selected account's cookie.
    // Cookie isolation/temp-window recovery and token refresh can mutate session state;
    // this optional scan instead discloses the unavailable query and scans public assets.
    const canAuthenticate =
      input.auth?.authType === AuthTypeEnum.AccessToken &&
      Boolean(input.auth.accessToken?.trim())
    result.authenticatedQueriesUnavailable =
      paths.some((route) => !route.public) && !canAuthenticate
    partial ||= result.authenticatedQueriesUnavailable
    // A slow protocol probe must not delay loading the page and its scripts.
    const statusQueries = (async () => {
      for (const route of paths) {
        const path = new URL(route.path, origin).pathname
        const headers =
          canAuthenticate && !route.public
            ? {
                ...buildCompatUserIdHeaders(input.auth?.userId),
                Authorization: route.rawToken
                  ? input.auth!.accessToken!
                  : `Bearer ${input.auth!.accessToken!}`,
              }
            : undefined
        if (!canAuthenticate && !route.public) continue
        if (task.signal.aborted) {
          partial = true
          break
        }
        try {
          const response = await readStatus(route.path, headers)
          const keys = getResponseKeys(response.text)
          result.statusQueries.push({ path, status: response.status, keys })
          if (response.status >= 400 || !keys.length) partial = true
        } catch {
          partial = true
          result.statusQueries.push({ path, keys: [] })
        }
      }
    })()
    if (!task.signal.aborted) {
      try {
        const html = await read(origin)
        if (html.status !== 200 || !/html/i.test(html.type)) {
          scanIssues.add(FEEDBACK_SCAN_ISSUES.ResourceResponse)
          throw new Error("scan_html")
        }
        const queue = new PQueue({
          concurrency: CHECK_IN_EVIDENCE_SCAN_LIMITS.resourceConcurrency,
          autoStart: false,
        })
        const assets = new Set<string>()
        const scheduled = new Set<string>()
        let expandReferences = options.loadedAssets === undefined
        const routes = new Set<string>()
        const pageCandidates = new Map<string, NativeCheckInPageCandidate>()
        const addPageCandidate = (
          path: string,
          source: Exclude<
            NativeCheckInPageCandidate["sources"][number],
            typeof NATIVE_CHECK_IN_PAGE_SOURCES.Area
          >,
        ) => {
          const existing = pageCandidates.get(path)
          if (existing) {
            if (!existing.sources.includes(source))
              existing.sources.push(source)
          } else if (
            pageCandidates.size < CHECK_IN_EVIDENCE_SCAN_LIMITS.routes
          ) {
            pageCandidates.set(path, { path, sources: [source] })
          } else {
            partial = true
            scanIssues.add(FEEDBACK_SCAN_ISSUES.RouteLimit)
          }
        }
        const keywords = new Set<string>()
        result.resources = { discovered: 1, scanned: 1 }
        const addAsset = (asset: string, schedule: boolean) => {
          assets.add(asset)
          result.resources!.discovered = assets.size + 1
          if (!schedule || scheduled.has(asset)) return
          scheduled.add(asset)
          const pathname = new URL(asset).pathname
          void queue.add(() => scanAsset(asset), {
            priority: /\.m?js$/i.test(pathname)
              ? 1
              : /\.css$/i.test(pathname)
                ? -1
                : 0,
          })
        }
        const analyze = (text: string, base: string, isHtml: boolean) => {
          const decoded = decodeSource(text)
          const lower = decoded.toLowerCase()
          KEYWORDS.forEach((keyword) => {
            if (lower.includes(keyword)) keywords.add(keyword)
          })
          extractCheckInRoutes(decoded).forEach((path) => {
            if (routes.size < CHECK_IN_EVIDENCE_SCAN_LIMITS.routes)
              routes.add(path)
            else if (!routes.has(path)) {
              partial = true
              scanIssues.add(FEEDBACK_SCAN_ISSUES.RouteLimit)
            }
          })
          if (input.purpose === CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage)
            extractNativeCheckInPageRoutes(decoded).forEach((path) =>
              addPageCandidate(path, NATIVE_CHECK_IN_PAGE_SOURCES.Script),
            )
          discoverAssets(decoded, base, isHtml).forEach((asset) => {
            addAsset(asset, expandReferences)
          })
        }
        const scanAsset = async (asset: string) => {
          if (exhausted()) {
            partial = true
            if (!task.signal.aborted) scanIssues.add(SCAN_READ_ISSUES.Limit)
            return
          }
          try {
            const resource = await read(asset)
            if (
              resource.status !== 200 ||
              !/(?:javascript|ecmascript|json|css|text\/plain)/i.test(
                resource.type,
              )
            ) {
              scanIssues.add(FEEDBACK_SCAN_ISSUES.ResourceResponse)
              throw new Error("scan_asset")
            }
            result.resources!.scanned++
            analyze(resource.text, asset, false)
          } catch {
            partial = true
          }
        }
        normalizeAssetUrls(options.loadedAssets ?? [], origin).forEach(
          (asset) => addAsset(asset, true),
        )
        analyze(html.text, options.pageUrl ?? origin, true)
        queue.start()
        await queue.onIdle()
        // Already loaded sources are the primary search surface. Only expand
        // into unrequested chunks when they did not reveal a relevant path.
        if (
          !expandReferences &&
          (input.purpose === CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage
            ? pageCandidates.size === 0
            : routes.size === 0) &&
          !exhausted()
        ) {
          expandReferences = true
          for (const asset of assets) addAsset(asset, true)
          await queue.onIdle()
        }
        const skipped = assets.size - scheduled.size
        if (skipped > 0) result.resources.skipped = skipped
        // Preserve source/API clues and expansion policy before adding page
        // hints; navigation must not consume their shared return budget first.
        for (const candidate of options.navigation?.candidates ?? []) {
          const path = normalizeCheckInRouteClue(candidate)
          if (!path) continue
          if (input.purpose === CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage)
            addPageCandidate(path, NATIVE_CHECK_IN_PAGE_SOURCES.Navigation)
          if (routes.size < CHECK_IN_EVIDENCE_SCAN_LIMITS.routes)
            routes.add(path)
          else if (!routes.has(path))
            scanIssues.add(FEEDBACK_SCAN_ISSUES.RouteLimit)
        }
        if (options.navigation?.candidatesComplete === false)
          scanIssues.add(FEEDBACK_SCAN_ISSUES.RouteLimit)
        partial ||= scanIssues.has(FEEDBACK_SCAN_ISSUES.RouteLimit)
        result.keywords = [...keywords]
        result.routes = [...routes]
        if (input.purpose === CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage)
          result.pageCandidates = [...pageCandidates.values()]
      } catch {
        partial = true
      }
    }
    await statusQueries
    if (timedOut) scanIssues.add(FEEDBACK_SCAN_ISSUES.TaskTimeout)
    issues.forEach((issue) => scanIssues.add(issue))
    result.issues = [...scanIssues].sort()
    partial ||= task.signal.aborted
    const hasClues =
      result.routes.length > 0 ||
      (result.pageCandidates?.length ?? 0) > 0 ||
      (result.keywords?.length ?? 0) > 0 ||
      result.statusQueries.some((query) => query.status !== undefined)
    result.status = hasClues
      ? partial
        ? FEEDBACK_SCAN_STATUSES.Partial
        : FEEDBACK_SCAN_STATUSES.Completed
      : FEEDBACK_SCAN_STATUSES.Empty
    return result
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
  }
}
