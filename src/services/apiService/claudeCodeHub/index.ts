import type {
  ClaudeCodeHubProviderCreatePayload,
  ClaudeCodeHubProviderDisplay,
  ClaudeCodeHubProviderUpdatePayload,
} from "~/types/claudeCodeHub"
import type { ClaudeCodeHubConfig } from "~/types/claudeCodeHubConfig"
import { getErrorMessage } from "~/utils/core/error"

interface ClaudeCodeHubActionResponse<T> {
  ok: boolean
  data?: T
  error?: string
  errorCode?: string
  errorParams?: Record<string, string | number>
}

interface ActionSignalHandle {
  signal: AbortSignal
  cleanup: () => void
}

type ClaudeCodeHubProviderAction =
  | "getProviders"
  | "addProvider"
  | "editProvider"
  | "removeProvider"

export class ClaudeCodeHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly evidence?: {
      dispatch: "not-dispatched" | "dispatched"
      responseReceived: boolean
      confirmedNonApplication: boolean
      raw?: unknown
      code?: string | number
    },
  ) {
    super(message)
    this.name = "ClaudeCodeHubApiError"
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

const getOperationalErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  const code = error.code
  return typeof code === "string" ||
    (typeof code === "number" && Number.isSafeInteger(code))
    ? code
    : undefined
}

/**
 * Normalizes Claude Code Hub base URLs before building request paths.
 */
export function normalizeClaudeCodeHubBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

const getClaudeCodeHubRequestErrorMessage = (error: unknown, status?: number) =>
  getErrorMessage(
    error,
    status === undefined
      ? "Claude Code Hub request failed"
      : `Claude Code Hub request failed (${status})`,
  )

/**
 * Parses and validates a Claude Code Hub provider action response body.
 * Upstream ErrorResult uses `error`, optional `errorCode`, and `errorParams`:
 * https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/actions/types.ts
 */
async function parseActionResponse<T>(response: Response): Promise<T> {
  let parsed: ClaudeCodeHubActionResponse<T>
  try {
    parsed = (await response.json()) as ClaudeCodeHubActionResponse<T>
  } catch {
    throw new ClaudeCodeHubApiError(
      `Claude Code Hub returned a non-JSON response (${response.status})`,
      response.status,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        raw: response,
      },
    )
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.ok !== "boolean"
  ) {
    throw new ClaudeCodeHubApiError(
      `Claude Code Hub returned an invalid action response (${response.status})`,
      response.status,
      {
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
        raw: response,
      },
    )
  }

  if (!response.ok || !parsed.ok) {
    const fallbackMessage = `Claude Code Hub request failed (${response.status})`
    const message = getErrorMessage(
      typeof parsed.error === "string" ? parsed.error : undefined,
      fallbackMessage,
    )
    const code =
      typeof parsed.errorCode === "string" && parsed.errorCode.trim()
        ? parsed.errorCode.trim()
        : undefined
    throw new ClaudeCodeHubApiError(message, response.status, {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: parsed.ok === false,
      raw: parsed,
      ...(code ? { code } : {}),
    })
  }

  return parsed.data as T
}

/**
 * Parses a Claude Code Hub v1 JSON response and normalizes problem+json errors.
 * Upstream ProblemJson defines `detail`, `title`, `errorCode`, and `errorParams`:
 * https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/lib/api/v1/_shared/error-envelope.ts
 */
async function parseV1JsonResponse<T>(response: Response): Promise<T> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new ClaudeCodeHubApiError(
      `Claude Code Hub returned a non-JSON response (${response.status})`,
      response.status,
    )
  }

  if (!response.ok) {
    const fallbackMessage = `Claude Code Hub request failed (${response.status})`
    const problem =
      parsed && typeof parsed === "object"
        ? (parsed as {
            detail?: unknown
            title?: unknown
            errorCode?: unknown
            errorParams?: unknown
          })
        : undefined
    const titleMessage = getErrorMessage(
      typeof problem?.title === "string" ? problem.title : undefined,
      fallbackMessage,
    )
    const message = getErrorMessage(
      typeof problem?.detail === "string" ? problem.detail : undefined,
      titleMessage,
    )
    const code =
      typeof problem?.errorCode === "string" && problem.errorCode.trim()
        ? problem.errorCode.trim()
        : undefined

    throw new ClaudeCodeHubApiError(message, response.status, {
      dispatch: "dispatched",
      responseReceived: true,
      // A 5xx response can be emitted after the server applied a mutation.
      confirmedNonApplication: response.status >= 400 && response.status < 500,
      raw: parsed,
      ...(code ? { code } : {}),
    })
  }

  return parsed as T
}

/**
 * Calls a Claude Code Hub provider action endpoint and normalizes failures.
 */
function createTimeoutAbortSignal(timeoutMs: number): ActionSignalHandle {
  if (typeof AbortSignal.timeout === "function") {
    return {
      signal: AbortSignal.timeout(timeoutMs),
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  const handleAbort = () => {
    clearTimeout(timeoutId)
  }
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  controller.signal.addEventListener("abort", handleAbort, { once: true })

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      controller.signal.removeEventListener("abort", handleAbort)
    },
  }
}

/**
 * Composes multiple abort signals while remaining compatible with older browsers.
 */
function composeAbortSignals(signals: AbortSignal[]): ActionSignalHandle {
  const handle: ActionSignalHandle = {
    signal: undefined as unknown as AbortSignal,
    cleanup: () => {},
  }

  if (typeof AbortSignal.any === "function") {
    return {
      signal: AbortSignal.any(signals),
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  const cleanups: Array<() => void> = []

  const abortComposite = () => {
    for (const cleanup of cleanups) {
      cleanup()
    }
    cleanups.length = 0

    if (!controller.signal.aborted) {
      controller.abort()
    }
  }

  handle.signal = controller.signal
  handle.cleanup = abortComposite

  for (const signal of signals) {
    if (signal.aborted) {
      abortComposite()
      return handle
    }

    const handleAbort = () => {
      abortComposite()
    }

    signal.addEventListener("abort", handleAbort, { once: true })
    cleanups.push(() => {
      signal.removeEventListener("abort", handleAbort)
    })
  }

  return handle
}

/**
 * Builds the request abort signal with a default timeout safety floor.
 */
function buildActionSignal(options?: {
  signal?: AbortSignal
  timeoutMs?: number
}): ActionSignalHandle {
  const timeoutSignal = createTimeoutAbortSignal(options?.timeoutMs ?? 30_000)
  if (!options?.signal) {
    return timeoutSignal
  }

  const composed = composeAbortSignals([options.signal, timeoutSignal.signal])
  return {
    signal: composed.signal,
    cleanup: () => {
      composed.cleanup()
      timeoutSignal.cleanup()
    },
  }
}

/**
 * Calls a Claude Code Hub provider action endpoint and parses its typed response.
 */
async function callProviderAction<T>(
  config: ClaudeCodeHubConfig,
  action: ClaudeCodeHubProviderAction,
  payload: object = {},
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<T> {
  const baseUrl = normalizeClaudeCodeHubBaseUrl(config.baseUrl)
  let response: Response | undefined
  let fetchStarted = false
  const actionSignal = buildActionSignal(options)

  try {
    if (actionSignal.signal.aborted) {
      const raw =
        actionSignal.signal.reason ??
        new DOMException("The operation was aborted", "AbortError")
      throw new ClaudeCodeHubApiError(
        getClaudeCodeHubRequestErrorMessage(raw),
        undefined,
        {
          dispatch: "not-dispatched",
          responseReceived: false,
          confirmedNonApplication: true,
          raw,
          code: getOperationalErrorCode(raw),
        },
      )
    }
    fetchStarted = true
    response = await fetch(`${baseUrl}/api/actions/providers/${action}`, {
      method: "POST",
      signal: actionSignal.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.adminToken}`,
      },
      body: JSON.stringify(payload),
    })
    return await parseActionResponse<T>(response)
  } catch (error) {
    if (error instanceof ClaudeCodeHubApiError) {
      throw error
    }
    throw new ClaudeCodeHubApiError(
      getClaudeCodeHubRequestErrorMessage(error, response?.status),
      response?.status,
      {
        dispatch: fetchStarted ? "dispatched" : "not-dispatched",
        responseReceived: response !== undefined,
        confirmedNonApplication: !fetchStarted,
        raw: error,
        code: getOperationalErrorCode(error),
      },
    )
  } finally {
    actionSignal.cleanup()
  }
}

/**
 * Extracts provider rows from the varying action response payload shapes.
 */
function extractProviderList(data: unknown): ClaudeCodeHubProviderDisplay[] {
  if (Array.isArray(data)) {
    return data as ClaudeCodeHubProviderDisplay[]
  }
  if (data && typeof data === "object") {
    const candidates = [
      (data as { providers?: unknown }).providers,
      (data as { items?: unknown }).items,
      // Some upstreams wrap the already-unwrapped provider payload in an inner
      // `data` field, e.g. `{ data: [...] }`.
      (data as { data?: unknown }).data,
    ]
    const array = candidates.find(Array.isArray)
    if (array) {
      return array as ClaudeCodeHubProviderDisplay[]
    }
  }
  return []
}

/**
 * Lists Claude Code Hub providers through the legacy admin action API.
 */
export async function listProvidersFromAction(
  config: ClaudeCodeHubConfig,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<ClaudeCodeHubProviderDisplay[]> {
  const data = await callProviderAction<unknown>(
    config,
    "getProviders",
    {},
    options,
  )
  return extractProviderList(data)
}

type ClaudeCodeHubV1ProviderListOptions = {
  keyword?: string
  signal?: AbortSignal
  timeoutMs?: number
}

type ClaudeCodeHubV1RequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * Claude Code Hub v0.9.5 exposes authenticated provider CRUD at this route.
 * Routes: https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/app/api/v1/resources/providers/router.ts
 * Strict bodies: https://github.com/ding113/claude-code-hub/blob/dfeb14331cb350f672e92a3684adecf1052dd476/src/lib/api/v1/schemas/providers.ts
 */
const callV1ProviderRoute = async <T>(input: {
  config: ClaudeCodeHubConfig
  path: string
  method: "GET" | "POST" | "PATCH" | "DELETE"
  body?: object
  expectsJson?: boolean
  options?: ClaudeCodeHubV1RequestOptions
}): Promise<T> => {
  const baseUrl = normalizeClaudeCodeHubBaseUrl(input.config.baseUrl)
  const actionSignal = buildActionSignal(input.options)
  let response: Response | undefined
  let fetchStarted = false

  try {
    if (actionSignal.signal.aborted) {
      const raw =
        actionSignal.signal.reason ??
        new DOMException("The operation was aborted", "AbortError")
      throw new ClaudeCodeHubApiError(
        getClaudeCodeHubRequestErrorMessage(raw),
        undefined,
        {
          dispatch: "not-dispatched",
          responseReceived: false,
          confirmedNonApplication: true,
          raw,
          code: getOperationalErrorCode(raw),
        },
      )
    }

    fetchStarted = true
    response = await fetch(`${baseUrl}/api/v1/providers${input.path}`, {
      method: input.method,
      signal: actionSignal.signal,
      headers: {
        ...(input.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${input.config.adminToken}`,
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    })

    if (input.expectsJson === false && response.ok) {
      return undefined as T
    }
    return await parseV1JsonResponse<T>(response)
  } catch (error) {
    if (error instanceof ClaudeCodeHubApiError && error.evidence) {
      throw error
    }
    throw new ClaudeCodeHubApiError(
      getClaudeCodeHubRequestErrorMessage(error, response?.status),
      response?.status,
      {
        dispatch: fetchStarted ? "dispatched" : "not-dispatched",
        responseReceived: response !== undefined,
        confirmedNonApplication: !fetchStarted,
        raw: error,
        code:
          error instanceof ClaudeCodeHubApiError
            ? error.code
            : getOperationalErrorCode(error),
      },
    )
  } finally {
    actionSignal.cleanup()
  }
}

/**
 * Lists Claude Code Hub providers through the admin v1 provider list API.
 *
 * Upstream contract: ding113/claude-code-hub
 * `src/app/api/v1/resources/providers/router.ts` registers
 * `GET /api/v1/providers` and returns `{ items: ProviderSummary[] }`.
 */
export async function listProviders(
  config: ClaudeCodeHubConfig,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<ClaudeCodeHubProviderDisplay[]> {
  return await fetchV1ProviderList(config, options)
}

/**
 * Searches Claude Code Hub providers through the admin v1 provider list API.
 *
 * Upstream contract: ding113/claude-code-hub
 * `GET /api/v1/providers` accepts optional `q` search text.
 */
export async function searchProviders(
  config: ClaudeCodeHubConfig,
  keyword: string,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<ClaudeCodeHubProviderDisplay[]> {
  return await fetchV1ProviderList(config, {
    ...options,
    keyword,
  })
}

/** Reads one native provider through the v0.9.5 admin resource route. */
export async function getProvider(
  config: ClaudeCodeHubConfig,
  providerId: number,
  options?: ClaudeCodeHubV1RequestOptions,
): Promise<ClaudeCodeHubProviderDisplay> {
  return await callV1ProviderRoute({
    config,
    path: `/${providerId}`,
    method: "GET",
    options,
  })
}

/** Creates one native provider through the strict v0.9.5 resource schema. */
export async function createProviderV1(
  config: ClaudeCodeHubConfig,
  payload: ClaudeCodeHubProviderCreatePayload,
  options?: ClaudeCodeHubV1RequestOptions,
): Promise<ClaudeCodeHubProviderDisplay> {
  return await callV1ProviderRoute({
    config,
    path: "",
    method: "POST",
    body: payload,
    options,
  })
}

/** Updates only an explicit native provider patch through the strict schema. */
export async function updateProviderV1(
  config: ClaudeCodeHubConfig,
  providerId: number,
  payload: Omit<ClaudeCodeHubProviderUpdatePayload, "providerId">,
  options?: ClaudeCodeHubV1RequestOptions,
): Promise<ClaudeCodeHubProviderDisplay> {
  return await callV1ProviderRoute({
    config,
    path: `/${providerId}`,
    method: "PATCH",
    body: payload,
    options,
  })
}

/** Deletes one native provider through the v0.9.5 resource route. */
export async function deleteProviderV1(
  config: ClaudeCodeHubConfig,
  providerId: number,
  options?: ClaudeCodeHubV1RequestOptions,
): Promise<void> {
  return await callV1ProviderRoute({
    config,
    path: `/${providerId}`,
    method: "DELETE",
    expectsJson: false,
    options,
  })
}

/**
 * Fetches the Claude Code Hub v1 provider list, optionally applying search text.
 */
async function fetchV1ProviderList(
  config: ClaudeCodeHubConfig,
  options?: ClaudeCodeHubV1ProviderListOptions,
): Promise<ClaudeCodeHubProviderDisplay[]> {
  const baseUrl = normalizeClaudeCodeHubBaseUrl(config.baseUrl)
  const searchParams = new URLSearchParams()
  const trimmedKeyword = options?.keyword?.trim()
  if (trimmedKeyword) {
    searchParams.set("q", trimmedKeyword)
  }

  const query = searchParams.toString()
  const actionSignal = buildActionSignal(options)
  let response: Response | undefined

  try {
    response = await fetch(
      `${baseUrl}/api/v1/providers${query ? `?${query}` : ""}`,
      {
        method: "GET",
        signal: actionSignal.signal,
        headers: {
          Authorization: `Bearer ${config.adminToken}`,
        },
      },
    )
    const data = await parseV1JsonResponse<unknown>(response)
    return extractProviderList(data)
  } catch (error) {
    if (error instanceof ClaudeCodeHubApiError) {
      throw error
    }
    throw new ClaudeCodeHubApiError(
      getClaudeCodeHubRequestErrorMessage(error, response?.status),
      response?.status,
      {
        dispatch: "dispatched",
        responseReceived: response !== undefined,
        confirmedNonApplication: false,
        raw: error,
        code: getOperationalErrorCode(error),
      },
    )
  } finally {
    actionSignal.cleanup()
  }
}

/**
 * Validates Claude Code Hub credentials by performing a provider list request.
 */
export async function validateClaudeCodeHubConfig(
  config: ClaudeCodeHubConfig,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<boolean> {
  await listProviders(config, options)
  return true
}

/**
 * Creates a provider in Claude Code Hub.
 */
export async function createProvider(
  config: ClaudeCodeHubConfig,
  payload: ClaudeCodeHubProviderCreatePayload,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<unknown> {
  return await callProviderAction(config, "addProvider", payload, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  })
}

/**
 * Fetches the real provider key through Claude Code Hub's admin v1 API.
 *
 * Upstream contract: ding113/claude-code-hub
 * `src/app/api/v1/resources/providers/router.ts` registers
 * `GET /api/v1/providers/{id}/key:reveal` and returns `{ key: string }`.
 */
export async function getUnmaskedProviderKey(
  config: ClaudeCodeHubConfig,
  providerId: number,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<string> {
  const baseUrl = normalizeClaudeCodeHubBaseUrl(config.baseUrl)
  let response: Response | undefined
  const actionSignal = buildActionSignal(options)

  try {
    response = await fetch(
      `${baseUrl}/api/v1/providers/${providerId}/key:reveal`,
      {
        method: "GET",
        signal: actionSignal.signal,
        headers: {
          Authorization: `Bearer ${config.adminToken}`,
        },
      },
    )
    const data = await parseV1JsonResponse<unknown>(response)

    const key =
      data && typeof data === "object"
        ? (data as { key?: unknown }).key
        : undefined
    if (typeof key !== "string" || !key.trim()) {
      throw new ClaudeCodeHubApiError(
        "Claude Code Hub returned an invalid provider key response",
        response.status,
      )
    }

    return key
  } catch (error) {
    if (error instanceof ClaudeCodeHubApiError) {
      throw error
    }
    throw new ClaudeCodeHubApiError(
      getClaudeCodeHubRequestErrorMessage(error, response?.status),
      response?.status,
      {
        dispatch: "dispatched",
        responseReceived: response !== undefined,
        confirmedNonApplication: false,
        raw: error,
        code: getOperationalErrorCode(error),
      },
    )
  } finally {
    actionSignal.cleanup()
  }
}

/**
 * Updates an existing provider in Claude Code Hub.
 */
export async function updateProvider(
  config: ClaudeCodeHubConfig,
  payload: ClaudeCodeHubProviderUpdatePayload,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<unknown> {
  return await callProviderAction(config, "editProvider", payload, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  })
}

/**
 * Deletes a provider from Claude Code Hub.
 */
export async function deleteProvider(
  config: ClaudeCodeHubConfig,
  providerId: number,
  options?: {
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<unknown> {
  return await callProviderAction(
    config,
    "removeProvider",
    { providerId },
    options,
  )
}
