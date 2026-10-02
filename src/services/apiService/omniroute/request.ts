/**
 * OmniRoute HTTP boundary: URL building, cancellation, and error evidence.
 *
 * Authentication is bearer-only. OmniRoute enforces scoped access tokens on every
 * `/api/*` management route, and its CSRF/same-origin rule applies to
 * `dashboard_session` subjects only, so an `oma_` token needs no cookie, no
 * temporary window, and no same-origin requirement.
 * https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/server/authz/pipeline.ts
 */

import { normalizeOmniRouteBaseUrl } from "~/types/omnirouteConfig"

export interface ActionSignalHandle {
  signal: AbortSignal
  cleanup: () => void
}

export type OmniRouteRequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

export type OmniRouteErrorEvidence = {
  dispatch: "not-dispatched" | "dispatched"
  responseReceived: boolean
  /** True only when the gateway's response proves the mutation did not apply. */
  confirmedNonApplication: boolean
  raw?: unknown
  code?: string | number
}

export class OmniRouteApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly evidence?: OmniRouteErrorEvidence,
  ) {
    super(message)
    this.name = "OmniRouteApiError"
  }

  get dispatch() {
    return this.evidence?.dispatch
  }

  get responseReceived() {
    return this.evidence?.responseReceived
  }

  get confirmedNonApplication() {
    return this.evidence?.confirmedNonApplication
  }

  get raw() {
    return this.evidence?.raw
  }

  get code() {
    return this.evidence?.code
  }
}

/** Builds an absolute OmniRoute management URL for one route path. */
function buildOmniRouteUrl(
  baseUrl: string,
  path: string,
  searchParams?: URLSearchParams,
): string {
  const query = searchParams?.toString()
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${normalizeOmniRouteBaseUrl(baseUrl)}${suffix}${query ? `?${query}` : ""}`
}

const getOperationalErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ||
    (typeof code === "number" && Number.isSafeInteger(code))
    ? code
    : undefined
}

const createTimeoutAbortSignal = (timeoutMs: number): ActionSignalHandle => {
  if (typeof AbortSignal.timeout === "function") {
    return { signal: AbortSignal.timeout(timeoutMs), cleanup: () => {} }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  }
}

const composeAbortSignals = (signals: AbortSignal[]): ActionSignalHandle => {
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any(signals), cleanup: () => {} }
  }

  const controller = new AbortController()
  const cleanups: Array<() => void> = []
  const abortComposite = () => {
    for (const cleanup of cleanups) cleanup()
    cleanups.length = 0
    if (!controller.signal.aborted) controller.abort()
  }

  for (const signal of signals) {
    if (signal.aborted) {
      abortComposite()
      return { signal: controller.signal, cleanup: abortComposite }
    }
    const handleAbort = () => abortComposite()
    signal.addEventListener("abort", handleAbort, { once: true })
    cleanups.push(() => signal.removeEventListener("abort", handleAbort))
  }

  return { signal: controller.signal, cleanup: abortComposite }
}

const buildActionSignal = (
  options?: OmniRouteRequestOptions,
): ActionSignalHandle => {
  const timeoutSignal = createTimeoutAbortSignal(options?.timeoutMs ?? 30_000)
  if (!options?.signal) return timeoutSignal

  const composed = composeAbortSignals([options.signal, timeoutSignal.signal])
  return {
    signal: composed.signal,
    cleanup: () => {
      composed.cleanup()
      timeoutSignal.cleanup()
    },
  }
}

/** Reads one JSON body, tolerating empty and non-JSON responses. */
async function readOmniRouteJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/**
 * Pulls the gateway's own error message out of a failed response.
 *
 * OmniRoute routes answer with an `{ error }` envelope; Next.js framework
 * failures and the problem+json helper use `detail`/`title` instead.
 */
export function readOmniRouteErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  const pick = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined

  if (typeof payload === "string") return pick(payload) ?? fallback
  if (typeof payload !== "object" || payload === null) return fallback

  const body = payload as {
    error?: unknown
    message?: unknown
    detail?: unknown
    title?: unknown
  }
  return (
    pick(body.error) ??
    pick(body.message) ??
    pick(body.detail) ??
    pick(body.title) ??
    fallback
  )
}

/** Reads a machine-readable failure code such as `PROVIDER_NAME_CONFLICT`. */
function readOmniRouteErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined
  const code = (payload as { code?: unknown }).code
  return typeof code === "string" && code.trim() ? code.trim() : undefined
}

export interface OmniRouteRequestInput {
  baseUrl: string
  path: string
  method: "GET" | "POST" | "PATCH" | "DELETE"
  token?: string
  body?: unknown
  searchParams?: URLSearchParams
  expectsJson?: boolean
  options?: OmniRouteRequestOptions
}

/**
 * Dispatches one OmniRoute management request and normalizes its JSON body.
 *
 * Every failure carries dispatch evidence so callers can distinguish "the
 * request never left" from "the gateway answered 5xx after applying the write".
 */
export async function callOmniRoute<T>(
  input: OmniRouteRequestInput,
): Promise<T> {
  const actionSignal = buildActionSignal(input.options)
  let response: Response | undefined
  let fetchStarted = false
  const fallbackMessage = `OmniRoute request failed (${input.method} ${input.path})`

  /** Throws a normalized error carrying the dispatch evidence collected so far. */
  function fail(
    error: unknown,
    evidence: Partial<OmniRouteErrorEvidence> & {
      dispatch: OmniRouteErrorEvidence["dispatch"]
    },
  ): never {
    throw new OmniRouteApiError(
      readOmniRouteErrorMessage(error, fallbackMessage),
      response?.status,
      {
        responseReceived: response !== undefined,
        confirmedNonApplication: false,
        raw: error,
        code: getOperationalErrorCode(error),
        ...evidence,
      },
    )
  }

  try {
    if (actionSignal.signal.aborted) {
      const raw =
        actionSignal.signal.reason ??
        new DOMException("The operation was aborted", "AbortError")
      fail(raw, { dispatch: "not-dispatched", confirmedNonApplication: true })
    }

    fetchStarted = true
    response = await fetch(
      buildOmniRouteUrl(input.baseUrl, input.path, input.searchParams),
      {
        method: input.method,
        signal: actionSignal.signal,
        headers: {
          ...(input.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        },
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
      },
    )

    const payload = await readOmniRouteJsonBody(response)
    if (!response.ok) {
      throw new OmniRouteApiError(
        readOmniRouteErrorMessage(
          payload,
          `OmniRoute request failed (${response.status})`,
        ),
        response.status,
        {
          dispatch: "dispatched",
          responseReceived: true,
          // A 5xx can be emitted after the gateway applied the write.
          confirmedNonApplication: response.status < 500,
          raw: payload,
          ...(readOmniRouteErrorCode(payload) === undefined
            ? {}
            : { code: readOmniRouteErrorCode(payload) }),
        },
      )
    }

    if (input.expectsJson === false) return undefined as T
    return payload as T
  } catch (error) {
    if (error instanceof OmniRouteApiError) throw error
    fail(error, {
      dispatch: fetchStarted ? "dispatched" : "not-dispatched",
      confirmedNonApplication: !fetchStarted,
    })
  } finally {
    actionSignal.cleanup()
  }
}
