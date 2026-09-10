import { z } from "zod"

import { Storage } from "@plasmohq/storage"

import {
  TEMP_CONTEXT_MODES,
  TEMP_CONTEXT_PREFERENCE_MODES,
} from "~/constants/tempContextMode"
import { OPENROUTER_MANAGEMENT_KEYS_ORIGIN } from "~/services/apiAdapters/openrouter/managementKeyPageContract"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { onStorageChanged } from "~/utils/browser/browserApi"
import { safeRandomUUID } from "~/utils/core/identifier"

import {
  isProtectionBypassExecution,
  PROTECTION_BYPASS_DENIED_REASONS,
  TEMP_CONTEXT_TASK_KINDS,
  type AuthorizedTempContextOutcome,
  type ProtectionBypassExecuteRequest,
  type ProtectionBypassExecution,
} from "./contracts"
import type { ProtectionBypassPolicyDecision } from "./policy"

export const PROTECTION_BYPASS_HISTORY_LIMIT = 100

const httpStatusSchema = z.number().int().min(100).max(599)
const apiErrorCodeSchema = z.enum(API_ERROR_CODES)
const methodSchema = z.enum([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "CONNECT",
  "TRACE",
])
const failureReasonSchema = z.enum([
  "execution_error",
  "no_response",
  "identity_missing",
  "identity_mismatch",
  "invalid_request",
  "target_not_found",
  "throttled",
  "trigger_failed",
  "firefox_popup_unsupported",
  "incognito_access_required",
])
const turnstileStatusSchema = z.enum([
  "not_present",
  "token_obtained",
  "timeout",
  "error",
])
const mutationStateSchema = z.enum([
  "not_dispatched",
  "dispatched_unconfirmed",
  "created",
])

/** Retain only the HTTP(S) origin; paths, credentials and URL parameters are private. */
function sanitizeOrigin(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.origin
  } catch {
    return undefined
  }
}

const historyEntrySchema = z.object({
  id: z.string().min(1).max(128),
  startedAt: z.number().int().min(0).max(8_640_000_000_000_000),
  finishedAt: z.number().int().min(0).max(8_640_000_000_000_000).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  status: z.enum(["started", "completed", "failed", "denied", "unavailable"]),
  execution: z.custom<ProtectionBypassExecution>(isProtectionBypassExecution),
  taskKind: z.enum(TEMP_CONTEXT_TASK_KINDS),
  origin: z.preprocess(sanitizeOrigin, z.string().optional()),
  method: methodSchema.optional(),
  incognito: z.boolean(),
  fallbackDiagnostic: z
    .object({
      statusCode: httpStatusSchema.optional(),
      code: apiErrorCodeSchema.optional(),
    })
    .optional(),
  preferredMode: z.enum(TEMP_CONTEXT_PREFERENCE_MODES).optional(),
  contextMode: z.enum(TEMP_CONTEXT_MODES).optional(),
  contextReused: z.boolean().optional(),
  denialReason: z.enum(PROTECTION_BYPASS_DENIED_REASONS).optional(),
  httpStatus: httpStatusSchema.optional(),
  errorCode: apiErrorCodeSchema.optional(),
  failureReason: failureReasonSchema.optional(),
  turnstileStatus: turnstileStatusSchema.optional(),
  mutationState: mutationStateSchema.optional(),
})

export type ProtectionBypassHistoryEntry = z.infer<typeof historyEntrySchema>

interface ProtectionBypassHistoryCompletion {
  decision?: ProtectionBypassPolicyDecision
  context?: AuthorizedTempContextOutcome
  response?: unknown
  hasError?: boolean
}

/** Project a boundary value without traversing payloads or arbitrary error messages. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Copy only allowlisted scalar evidence from the failed primary request. */
function sanitizeFallbackDiagnostic(value: unknown) {
  const diagnostic = asRecord(value)
  const statusCode = httpStatusSchema.safeParse(diagnostic.statusCode).data
  const code = apiErrorCodeSchema.safeParse(diagnostic.code).data
  return statusCode !== undefined || code !== undefined
    ? { statusCode, code }
    : undefined
}

/** Classify task completion separately from whether a page context was acquired. */
function getCompletionStatus({
  decision,
  context,
  response,
  hasError,
}: ProtectionBypassHistoryCompletion): ProtectionBypassHistoryEntry["status"] {
  if (decision?.kind === "denied") return "denied"
  if (context?.kind === "unavailable") return "unavailable"
  const result = asRecord(response)
  if (hasError) return "failed"
  return result.success === true || result.mutationState === "created"
    ? "completed"
    : "failed"
}

/** Local, bounded history; it is deliberately independent of analytics and console logging. */
class ProtectionBypassHistoryStorage {
  private storage = new Storage({ area: "local" })

  /** Read detached, sanitized entries, newest first, tolerating malformed stored rows. */
  async list(): Promise<ProtectionBypassHistoryEntry[]> {
    const raw = asRecord(
      await this.storage.get(STORAGE_KEYS.PROTECTION_BYPASS_HISTORY),
    )
    if (raw.version !== 1 || !Array.isArray(raw.entries)) return []
    return raw.entries
      .flatMap((entry) => {
        const parsed = historyEntrySchema.safeParse(entry)
        return parsed.success ? [parsed.data] : []
      })
      .sort((left, right) => right.startedAt - left.startedAt)
      .slice(0, PROTECTION_BYPASS_HISTORY_LIMIT)
  }

  /** Save the trigger before execution so interrupted tasks still leave evidence. */
  async start(request: ProtectionBypassExecuteRequest): Promise<string> {
    const { task, execution } = request
    const params = task.params
    const origin =
      "originUrl" in params
        ? params.originUrl
        : "origin" in params
          ? params.origin
          : "url" in params
            ? params.url
            : task.kind ===
                TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction
              ? OPENROUTER_MANAGEMENT_KEYS_ORIGIN
              : undefined
    const entry = historyEntrySchema.parse({
      id: safeRandomUUID(),
      startedAt: Date.now(),
      status: "started",
      execution: { ...execution },
      taskKind: task.kind,
      origin,
      method:
        "fetchUrl" in params
          ? methodSchema.safeParse(
              params.fetchOptions?.method?.toUpperCase() ?? "GET",
            ).data
          : undefined,
      incognito: "useIncognito" in params && params.useIncognito === true,
      fallbackDiagnostic:
        "fallbackDiagnostic" in params
          ? sanitizeFallbackDiagnostic(params.fallbackDiagnostic)
          : undefined,
    })
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.PROTECTION_BYPASS_HISTORY,
      async () => {
        const entries = [entry, ...(await this.list())].slice(
          0,
          PROTECTION_BYPASS_HISTORY_LIMIT,
        )
        await this.storage.set(STORAGE_KEYS.PROTECTION_BYPASS_HISTORY, {
          version: 1,
          entries,
        })
      },
    )
    return entry.id
  }

  /** Finish only an existing pending entry; clearing history must not resurrect it. */
  async finish(
    id: string,
    completion: ProtectionBypassHistoryCompletion,
  ): Promise<void> {
    const finishedAt = Date.now()
    const response = asRecord(completion.response)
    const { decision, context } = completion
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.PROTECTION_BYPASS_HISTORY,
      async () => {
        const entries = await this.list()
        const index = entries.findIndex(
          (entry) => entry.id === id && entry.status === "started",
        )
        if (index < 0) return
        const entry = entries[index]
        entries[index] = historyEntrySchema.parse({
          ...entry,
          status: getCompletionStatus(completion),
          finishedAt,
          durationMs: Math.max(0, finishedAt - entry.startedAt),
          preferredMode:
            decision?.kind === "allowed" ? decision.adapter : undefined,
          contextMode:
            context?.kind === "allowed" ? context.adapter : undefined,
          contextReused:
            context?.kind === "allowed" ? context.reused : undefined,
          denialReason:
            decision?.kind === "denied" ? decision.reason : undefined,
          httpStatus: httpStatusSchema.safeParse(response.status).data,
          errorCode: apiErrorCodeSchema.safeParse(response.code).data,
          failureReason:
            context?.kind === "unavailable" && context.reason
              ? context.reason
              : completion.hasError
                ? "execution_error"
                : completion.response === undefined
                  ? "no_response"
                  : failureReasonSchema.safeParse(response.reason).data,
          turnstileStatus: turnstileStatusSchema.safeParse(
            asRecord(response.turnstile).status,
          ).data,
          mutationState: mutationStateSchema.safeParse(response.mutationState)
            .data,
        })
        await this.storage.set(STORAGE_KEYS.PROTECTION_BYPASS_HISTORY, {
          version: 1,
          entries,
        })
      },
    )
  }

  /** Clear this device's history under the same lock as background writes. */
  async clear(): Promise<void> {
    await withExtensionStorageWriteLock(
      STORAGE_LOCKS.PROTECTION_BYPASS_HISTORY,
      () => this.storage.remove(STORAGE_KEYS.PROTECTION_BYPASS_HISTORY),
    )
  }
}

export const protectionBypassHistoryStorage =
  new ProtectionBypassHistoryStorage()

/** Observe local history changes without polling or keeping the worker alive. */
export function subscribeToProtectionBypassHistory(
  callback: () => void,
): () => void {
  return onStorageChanged((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEYS.PROTECTION_BYPASS_HISTORY])
      callback()
  })
}
