/**
 * gpt-load HTTP boundary: URL building, envelope unwrapping, cancellation, and
 * error evidence.
 *
 * Authentication is bearer-only with the gateway's root management key; every
 * control-plane route accepts `Authorization: Bearer <AUTH_KEY>` and there is no
 * cookie/same-origin requirement, so the extension needs no temporary window.
 *
 * gpt-load answers with an envelope: success is `{code:0,message,data}` and a
 * failure is `{code:"<UPPER_SNAKE>",message}` — the error code is a *string*,
 * so the unwrap here must read `data` only on `code === 0` and reject anything
 * with a non-zero/string code instead of treating it as an empty success.
 *
 * Most state-changing writes require an `Idempotency-Key` header (UUID v4);
 * that is supplied per-operation rather than synthesized here.
 *
 * Verified against a live v2 control plane on 2026-10-03.
 */

import { normalizeGptLoadBaseUrl } from "~/types/gptLoadConfig"

export interface ActionSignalHandle {
  signal: AbortSignal
  cleanup: () => void
}

export type GptLoadRequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

export type GptLoadErrorEvidence = {
  dispatch: "not-dispatched" | "dispatched"
  responseReceived: boolean
  /** True only when the gateway's response proves the mutation did not apply. */
  confirmedNonApplication: boolean
  raw?: unknown
  /** gpt-load business code: numeric `0` on success, or an UPPER_SNAKE string. */
  code?: string | number
}

export class GptLoadApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly evidence?: GptLoadErrorEvidence,
  ) {
    super(message)
    this.name = "GptLoadApiError"
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

/** Builds an absolute gpt-load URL for one route path. */
function buildGptLoadUrl(
  baseUrl: string,
  path: string,
  searchParams?: URLSearchParams,
): string {
  const query = searchParams?.toString()
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${normalizeGptLoadBaseUrl(baseUrl)}${suffix}${query ? `?${query}` : ""}`
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
  options?: GptLoadRequestOptions,
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
async function readGptLoadJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Pulls the gateway's own error message out of a failed response.
 *
 * gpt-load answers failures with `{code,message}`; framework errors are plain
 * text; unknown shapes degrade to the fallback.
 */
export function readGptLoadErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (typeof payload === "string") return payload.trim() || fallback
  if (isRecord(payload)) {
    const message = payload.message
    if (typeof message === "string" && message.trim()) return message.trim()
  }
  return fallback
}

/** Reads a machine-readable failure code such as `DUPLICATE_RESOURCE`. */
function readGptLoadErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined
  const code = payload.code
  return typeof code === "string" && code.trim() ? code.trim() : undefined
}

/**
 * Unwraps a gpt-load business envelope on a 2xx response.
 *
 * A 2xx body is either `{code:0,message,data}` (success business envelope),
 * a plain object (e.g. `/api/health` returns `{status:"ok"}`), or undefined.
 * A non-zero/string `code` on an *HTTP-2xx* body would be a gateway bug, but
 * the reader still refuses to return it as data so the caller never mistakes a
 * reported failure for a result.
 */
function unwrapGptLoadSuccess<T>(payload: unknown): T {
  if (isRecord(payload) && "code" in payload) {
    const code = payload.code
    if (code !== 0) {
      throw new GptLoadApiError(
        readGptLoadErrorMessage(payload, "gpt-load request failed"),
        200,
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: true,
          raw: payload,
          ...(readGptLoadErrorCode(payload) === undefined
            ? {}
            : { code: readGptLoadErrorCode(payload) }),
        },
      )
    }
    return ("data" in payload ? payload.data : undefined) as T
  }
  return payload as T
}

export interface GptLoadRequestInput {
  baseUrl: string
  path: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  managementKey?: string
  body?: unknown
  searchParams?: URLSearchParams
  /** Most gpt-load mutations require a UUID v4 Idempotency-Key header. */
  idempotencyKey?: string
  expectsJson?: boolean
  options?: GptLoadRequestOptions
}

/**
 * Dispatches one gpt-load management request and normalizes its response.
 *
 * Every failure carries dispatch evidence so callers can distinguish "the
 * request never left" from "the gateway answered a 5xx after applying the
 * write".
 */
export async function callGptLoad<T>(input: GptLoadRequestInput): Promise<T> {
  const actionSignal = buildActionSignal(input.options)
  let response: Response | undefined
  let fetchStarted = false
  const fallbackMessage = `gpt-load request failed (${input.method} ${input.path})`

  /** Throws a normalized error carrying the dispatch evidence collected so far. */
  function fail(
    error: unknown,
    evidence: Partial<GptLoadErrorEvidence> & {
      dispatch: GptLoadErrorEvidence["dispatch"]
    },
  ): never {
    throw new GptLoadApiError(
      readGptLoadErrorMessage(error, fallbackMessage),
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
      buildGptLoadUrl(input.baseUrl, input.path, input.searchParams),
      {
        method: input.method,
        signal: actionSignal.signal,
        headers: {
          ...(input.body === undefined
            ? {}
            : { "content-type": "application/json" }),
          ...(input.managementKey
            ? { authorization: `Bearer ${input.managementKey}` }
            : {}),
          ...(input.idempotencyKey
            ? { "idempotency-key": input.idempotencyKey }
            : {}),
        },
        ...(input.body === undefined
          ? {}
          : { body: JSON.stringify(input.body) }),
      },
    )

    const payload = await readGptLoadJsonBody(response)
    if (!response.ok) {
      throw new GptLoadApiError(
        readGptLoadErrorMessage(
          payload,
          `gpt-load request failed (${response.status})`,
        ),
        response.status,
        {
          dispatch: "dispatched",
          responseReceived: true,
          // A 5xx can be emitted after the gateway applied the write.
          confirmedNonApplication: response.status < 500,
          raw: payload,
          ...(readGptLoadErrorCode(payload) === undefined
            ? {}
            : { code: readGptLoadErrorCode(payload) }),
        },
      )
    }

    if (input.expectsJson === false) return undefined as T
    return unwrapGptLoadSuccess<T>(payload)
  } catch (error) {
    if (error instanceof GptLoadApiError) throw error
    fail(error, {
      dispatch: fetchStarted ? "dispatched" : "not-dispatched",
      confirmedNonApplication: !fetchStarted,
    })
  } finally {
    actionSignal.cleanup()
  }
}
