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
  ) {
    super(message)
    this.name = "ClaudeCodeHubApiError"
  }
}

/**
 * Normalizes Claude Code Hub base URLs before building request paths.
 */
export function normalizeClaudeCodeHubBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

/**
 * Removes bearer tokens and configured secrets from error messages.
 */
export function redactClaudeCodeHubSecrets(
  message: string,
  secrets: Array<string | undefined | null>,
): string {
  let redacted = message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
  for (const secret of secrets) {
    const trimmed = secret?.trim()
    if (!trimmed || trimmed.length < 4) continue
    redacted = redacted.split(trimmed).join("[REDACTED]")
  }
  return redacted
}

/**
 * Converts unknown provider-action failures into sanitized error text.
 */
function normalizeActionError(
  error: unknown,
  config: ClaudeCodeHubConfig,
  extraSecrets: Array<string | undefined | null> = [],
) {
  return redactClaudeCodeHubSecrets(getErrorMessage(error), [
    config.adminToken,
    ...extraSecrets,
  ])
}

/**
 * Parses and validates a Claude Code Hub provider action response body.
 */
async function parseActionResponse<T>(
  response: Response,
  config: ClaudeCodeHubConfig,
  extraSecrets: Array<string | undefined | null>,
): Promise<T> {
  let parsed: ClaudeCodeHubActionResponse<T>
  try {
    parsed = (await response.json()) as ClaudeCodeHubActionResponse<T>
  } catch {
    throw new ClaudeCodeHubApiError(
      `Claude Code Hub returned a non-JSON response (${response.status})`,
      response.status,
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
    )
  }

  if (!response.ok || !parsed.ok) {
    const message =
      parsed.error ||
      response.statusText ||
      `Claude Code Hub request failed (${response.status})`
    throw new ClaudeCodeHubApiError(
      redactClaudeCodeHubSecrets(message, [config.adminToken, ...extraSecrets]),
      response.status,
    )
  }

  return parsed.data as T
}

/**
 * Calls a Claude Code Hub provider action endpoint and normalizes failures.
 */
function buildActionSignal(options?: {
  signal?: AbortSignal
  timeoutMs?: number
}) {
  const timeoutSignal = AbortSignal.timeout(options?.timeoutMs ?? 30_000)
  return options?.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal
}

async function callProviderAction<T>(
  config: ClaudeCodeHubConfig,
  action: ClaudeCodeHubProviderAction,
  payload: object = {},
  options?: {
    secrets?: Array<string | undefined | null>
    signal?: AbortSignal
    timeoutMs?: number
  },
): Promise<T> {
  const baseUrl = normalizeClaudeCodeHubBaseUrl(config.baseUrl)
  let response: Response | undefined

  try {
    response = await fetch(`${baseUrl}/api/actions/providers/${action}`, {
      method: "POST",
      signal: buildActionSignal(options),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.adminToken}`,
      },
      body: JSON.stringify(payload),
    })
    return await parseActionResponse<T>(
      response,
      config,
      options?.secrets ?? [],
    )
  } catch (error) {
    if (error instanceof ClaudeCodeHubApiError) {
      throw error
    }
    throw new ClaudeCodeHubApiError(
      normalizeActionError(error, config, options?.secrets ?? []),
      response?.status,
    )
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
 * Lists Claude Code Hub providers through the admin action API.
 */
export async function listProviders(
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
    secrets: [payload.key],
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  })
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
    secrets: [payload.key],
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
