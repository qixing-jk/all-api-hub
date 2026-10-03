import type { Page, Request } from "@playwright/test"

import { NEW_API_DASHBOARD_AUTH_REFRESH_PATH } from "~/services/apiService/newApi/dashboardAuth"
import { isRecord } from "~/utils/core/object"
import { trimToNull } from "~/utils/core/string"

/** Keeps one failure report readable while covering the retries a run can make. */
const MAX_REFRESH_OBSERVATIONS = 4
/** Bounds deployment details to keep failure reports readable. */
const REFRESH_OBSERVATION_DETAIL_LIMIT = 120

/** One recorded response to the dashboard refresh call detection depends on. */
export type NewApiRefreshObservation = {
  status: number | null
  code: string | null
  message: string | null
  bodyState: "pending" | "parsed" | "unavailable"
  startedAt?: number
  failure?: string
}

/** Trims one optional string field of a recorded response body. */
function readObservationField(body: unknown, key: string): string | null {
  if (!isRecord(body)) return null

  return trimToNull(body[key])
}

/** Bounds one rendered detail so a chatty deployment cannot bloat the report. */
function boundObservationDetail(value: string): string {
  return value.length > REFRESH_OBSERVATION_DETAIL_LIMIT
    ? `${value.slice(0, REFRESH_OBSERVATION_DETAIL_LIMIT)}…`
    : value
}

/** Renders recorded refresh responses, or an empty string when there are none. */
export function describeNewApiRefreshObservations(
  observations: readonly NewApiRefreshObservation[],
): string {
  if (observations.length === 0) return ""

  return `dashboard refresh responses: ${observations
    .map(({ status, code, message, bodyState, startedAt, failure }) => {
      if (failure)
        return `${status === null ? "request" : status} failed: ${boundObservationDetail(failure)}`
      if (status === null)
        return `request pending (${Math.max(0, Date.now() - (startedAt ?? Date.now()))}ms)`
      const detail = boundObservationDetail(
        [code, message].filter(Boolean).join(": "),
      )
      const bodyDetail =
        bodyState === "pending"
          ? " (body pending)"
          : bodyState === "unavailable"
            ? " (body unavailable)"
            : ""
      return `${detail ? `${status} ${detail}` : String(status)}${bodyDetail}`
    })
    .join(" | ")}`
}

/**
 * Records what the deployment answered for the dashboard refresh calls.
 *
 * Auto-detection on an rc.41 deployment depends entirely on this call, and it
 * rotates its credential on every attempt, so a refusal is indistinguishable
 * from a site that simply has no session once the extension reduces both to
 * "Could not get User ID". The extension's own logging is disabled in the E2E
 * build, which leaves the response itself as the only observable evidence.
 *
 * Records only the configured site's refresh responses. Status is available
 * immediately; code/message are added once the body has been parsed.
 * Authentication payload fields and headers are not copied into the report.
 * Observation is best-effort and can never fail the flow it observes.
 */
export function observeNewApiRefreshes(page: Page, baseUrl: string) {
  const observations: NewApiRefreshObservation[] = []
  const requests = new WeakMap<Request, NewApiRefreshObservation>()

  try {
    const origin = new URL(baseUrl).origin
    const matches = (value: { url(): string }) => {
      const url = new URL(value.url())
      return (
        url.origin === origin &&
        url.pathname === NEW_API_DASHBOARD_AUTH_REFRESH_PATH
      )
    }
    const recordRequest = (request: Request): NewApiRefreshObservation => {
      const existing = requests.get(request)
      if (existing) return existing
      const observation: NewApiRefreshObservation = {
        status: null,
        code: null,
        message: null,
        bodyState: "pending",
        startedAt: Date.now(),
      }
      requests.set(request, observation)
      observations.push(observation)
      if (observations.length > MAX_REFRESH_OBSERVATIONS) observations.shift()
      return observation
    }
    const context = page.context()
    context.on("request", (request) => {
      try {
        if (matches(request)) recordRequest(request)
      } catch {
        // Browser teardown must not fail the flow being observed.
      }
    })
    context.on("requestfailed", (request) => {
      try {
        if (!matches(request)) return
        const observation = recordRequest(request)
        observation.failure =
          request.failure()?.errorText || "unknown network failure"
        observation.bodyState = "unavailable"
      } catch {
        // Request failure diagnostics are best effort.
      }
    })
    context.on("response", (response) => {
      try {
        if (!matches(response)) return

        // Headers already give us the status, even if the body never finishes.
        // Update this entry in place so body completion cannot reorder arrivals
        // or reinsert an older response after the retention limit evicts it.
        const observation = recordRequest(response.request())
        observation.status = response.status()

        void (async () => {
          try {
            const body: unknown = await response.json()
            observation.code = readObservationField(body, "code")
            observation.message = readObservationField(body, "message")
            observation.bodyState = "parsed"
          } catch {
            observation.bodyState = "unavailable"
          }
        })()
      } catch {
        // Observation must not change the result of the flow under test.
      }
    })
  } catch {
    // A page double without a browser context, or a closed context, only means
    // there is nothing to observe; the flow under test keeps its own failure.
  }

  return {
    describe: () => describeNewApiRefreshObservations(observations),
  }
}
