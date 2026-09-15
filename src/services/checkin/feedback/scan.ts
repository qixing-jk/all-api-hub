import PQueue from "p-queue"

import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import { AuthTypeEnum } from "~/types"

import { getFeedbackOrigin } from "./report"
import { FEEDBACK_SCAN_LIMITS } from "./scanLimits"
import {
  decodeSource,
  discoverAssets,
  extractCheckInRoutes,
  getResponseKeys,
  KEYWORDS,
  normalizeAssetUrls,
} from "./scanParsing"
import { createScanReader } from "./scanReader"
import type { ScanFetch } from "./scanReader"
import type {
  CheckInFeedbackClues,
  CheckInFeedbackScanInput,
} from "./scanTypes"

export { extractCheckInRoutes } from "./scanParsing"

/** Runs a bounded, session-local GET scan with no refresh, login, mutation or storage side effects. */
export async function collectCheckInFeedbackClues(
  input: CheckInFeedbackScanInput,
  signal: AbortSignal,
  options: {
    fetch?: ScanFetch
    timeoutMs?: number
    pageUrl?: string
    loadedAssets?: string[]
  } = {},
): Promise<CheckInFeedbackClues> {
  const origin = getFeedbackOrigin(input.baseUrl)
  const result: CheckInFeedbackClues = {
    status: "empty",
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
      options.timeoutMs ?? FEEDBACK_SCAN_LIMITS.taskTimeoutMs,
      FEEDBACK_SCAN_LIMITS.taskTimeoutMs,
    ),
  )
  let partial = false
  const { read, exhausted, issues } = createScanReader(
    origin,
    task.signal,
    options.fetch,
  )
  const scanIssues = new Set<
    NonNullable<CheckInFeedbackClues["issues"]>[number]
  >()

  try {
    const paths = getCheckInFeedbackStatusRoutes(input.siteType, input.baseUrl)
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
          const response = await read(route.path, headers)
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
          scanIssues.add("resource_response")
          throw new Error("scan_html")
        }
        const queue = new PQueue({
          concurrency: FEEDBACK_SCAN_LIMITS.resourceConcurrency,
          autoStart: false,
        })
        const assets = new Set<string>()
        const scheduled = new Set<string>()
        let expandReferences = options.loadedAssets === undefined
        const routes = new Set<string>()
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
            if (routes.size < FEEDBACK_SCAN_LIMITS.routes) routes.add(path)
            else if (!routes.has(path)) {
              partial = true
              scanIssues.add("route_limit")
            }
          })
          discoverAssets(decoded, base, isHtml).forEach((asset) => {
            addAsset(asset, expandReferences)
          })
        }
        const scanAsset = async (asset: string) => {
          if (exhausted()) {
            partial = true
            if (!task.signal.aborted) scanIssues.add("limit")
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
              scanIssues.add("resource_response")
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
        if (!expandReferences && routes.size === 0 && !exhausted()) {
          expandReferences = true
          for (const asset of assets) addAsset(asset, true)
          await queue.onIdle()
        }
        const skipped = assets.size - scheduled.size
        if (skipped > 0) result.resources.skipped = skipped
        result.keywords = [...keywords]
        result.routes = [...routes]
      } catch {
        partial = true
      }
    }
    await statusQueries
    if (timedOut) scanIssues.add("task_timeout")
    issues.forEach((issue) => scanIssues.add(issue))
    result.issues = [...scanIssues].sort()
    partial ||= task.signal.aborted
    const hasClues =
      result.routes.length > 0 ||
      (result.keywords?.length ?? 0) > 0 ||
      result.statusQueries.some((query) => query.status !== undefined)
    result.status = hasClues ? (partial ? "partial" : "completed") : "empty"
    return result
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
  }
}

/** Formats only bounded scan facts for the editable report. */
export function formatCheckInFeedbackClues(
  clues: CheckInFeedbackClues,
): string {
  return [
    `scan: ${clues.status}`,
    ...(clues.authenticatedQueriesUnavailable
      ? ["authenticated_status: unavailable"]
      : []),
    ...clues.statusQueries.map(
      (query) =>
        `GET ${query.path}: ${query.status ?? "unavailable"}${query.keys.length ? `; keys: ${query.keys.join(", ")}` : "; shape: unknown"}`,
    ),
    ...(clues.resources
      ? [`resources: ${clues.resources.scanned}/${clues.resources.discovered}`]
      : []),
    ...(clues.resources?.skipped
      ? [`unloaded_resources_skipped: ${clues.resources.skipped}`]
      : []),
    ...(clues.issues?.length ? [`scan_notes: ${clues.issues.join(", ")}`] : []),
    ...(clues.keywords?.length
      ? [`keywords: ${clues.keywords.join(", ")}`]
      : []),
    ...clues.routes.map((path) => `route_hint: ${path}`),
  ].join("\n")
}
