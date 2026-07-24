import {
  canFetchDisplayAccountInviteLink,
  fetchDisplayAccountInviteLink,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  INVITE_LINK_FAILURE_REASONS,
  InviteLinkError,
  normalizeInviteLinkError,
  type InviteLinkFailureReasonCounts,
} from "~/services/inviteLinks/errors"
import type { DisplaySiteData } from "~/types"

export const INVITE_LINK_COPY_RESULTS = {
  Success: "success",
  PartialSuccess: "partial_success",
  Failure: "failure",
  Unsupported: "unsupported",
  ClipboardFailure: "clipboard_failure",
  Cancelled: "cancelled",
} as const

export const BULK_INVITE_LINK_COPY_POLICY = {
  requestTimeoutMs: 8_000,
  batchTimeoutMs: 20_000,
} as const

type InviteLinkCopyResult =
  (typeof INVITE_LINK_COPY_RESULTS)[keyof typeof INVITE_LINK_COPY_RESULTS]

interface RunInviteLinkCopyWorkflowOptions {
  accounts: DisplaySiteData[]
  format: "raw" | "labeled"
  signal?: AbortSignal
  requestTimeoutMs?: number
  batchTimeoutMs?: number
}

interface InviteLinkFetchSuccess {
  account: DisplaySiteData
  inviteLink: string
}

interface InviteLinkFetchFailure {
  reason: ReturnType<typeof normalizeInviteLinkError>["reason"]
}

/** Fetches one invite link and settles even when an adapter ignores abort. */
async function fetchInviteLink({
  account,
  signal,
  batchSignal,
  requestTimeoutMs,
}: {
  account: DisplaySiteData
  signal?: AbortSignal
  batchSignal?: AbortSignal
  requestTimeoutMs?: number
}): Promise<string> {
  const hasRequestTimeout =
    typeof requestTimeoutMs === "number" &&
    Number.isFinite(requestTimeoutMs) &&
    requestTimeoutMs > 0

  const sourceSignals = [signal, batchSignal].filter(
    (sourceSignal): sourceSignal is AbortSignal => sourceSignal !== undefined,
  )

  if (!hasRequestTimeout && sourceSignals.length === 0) {
    return fetchDisplayAccountInviteLink(account, {
      abortSignal: undefined,
    })
  }

  const controller = new AbortController()
  const signalCleanups: Array<() => void> = []
  const cleanupSourceSignals = () => {
    signalCleanups.forEach((cleanup) => cleanup())
    signalCleanups.length = 0
  }
  let rejectOnAbort!: () => void
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(controller.signal.reason)
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true })
  })

  // The parent is checked before this batch starts and adapter calls are
  // deferred below, so every source listener is attached before abort can race.
  for (const sourceSignal of sourceSignals) {
    const relayAbort = () => {
      controller.abort(sourceSignal.reason)
    }

    sourceSignal.addEventListener("abort", relayAbort, { once: true })
    signalCleanups.push(() => {
      sourceSignal.removeEventListener("abort", relayAbort)
    })
  }

  const timeoutId = hasRequestTimeout
    ? setTimeout(() => {
        controller.abort(
          new InviteLinkError(INVITE_LINK_FAILURE_REASONS.Timeout),
        )
      }, requestTimeoutMs)
    : undefined
  const fetchPromise = Promise.resolve().then(() => {
    controller.signal.throwIfAborted()
    return fetchDisplayAccountInviteLink(account, {
      abortSignal: controller.signal,
    })
  })

  try {
    return await Promise.race([fetchPromise, abortPromise])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    cleanupSourceSignals()
    controller.signal.removeEventListener("abort", rejectOnAbort)
  }
}

/** Fetches invite links concurrently while preserving account order. */
async function fetchInviteLinks({
  accounts,
  signal,
  requestTimeoutMs,
  batchTimeoutMs,
}: {
  accounts: DisplaySiteData[]
  signal?: AbortSignal
  requestTimeoutMs?: number
  batchTimeoutMs?: number
}): Promise<Array<InviteLinkFetchSuccess | InviteLinkFetchFailure>> {
  const hasBatchTimeout =
    typeof batchTimeoutMs === "number" &&
    Number.isFinite(batchTimeoutMs) &&
    batchTimeoutMs > 0
  const batchController = hasBatchTimeout ? new AbortController() : undefined
  const batchTimeoutId = batchController
    ? setTimeout(() => {
        batchController.abort(
          new InviteLinkError(INVITE_LINK_FAILURE_REASONS.Timeout),
        )
      }, batchTimeoutMs)
    : undefined
  try {
    return await Promise.all(
      accounts.map(async (account) => {
        try {
          return {
            account,
            inviteLink: await fetchInviteLink({
              account,
              signal,
              batchSignal: batchController?.signal,
              requestTimeoutMs,
            }),
          }
        } catch (error) {
          return {
            reason: normalizeInviteLinkError(error).reason,
          }
        }
      }),
    )
  } finally {
    if (batchTimeoutId !== undefined) clearTimeout(batchTimeoutId)
  }
}

interface InviteLinkCopyWorkflowResult {
  result: InviteLinkCopyResult
  payload?: string
  selectedCount: number
  itemCount: number
  successCount: number
  failureCount: number
  failureReasonCounts?: InviteLinkFailureReasonCounts
  unsupportedCount: number
  skippedCount: number
}

/**
 * Fetches and copies invite links for account-management entry points.
 */
export async function runInviteLinkCopyWorkflow({
  accounts,
  format,
  signal,
  requestTimeoutMs,
  batchTimeoutMs,
}: RunInviteLinkCopyWorkflowOptions): Promise<InviteLinkCopyWorkflowResult> {
  const enabledAccounts = accounts.filter(
    (account) => account.disabled !== true,
  )
  const supportedAccounts = enabledAccounts.filter(
    canFetchDisplayAccountInviteLink,
  )
  const baseResult = {
    selectedCount: accounts.length,
    itemCount: supportedAccounts.length,
    unsupportedCount: enabledAccounts.length - supportedAccounts.length,
    skippedCount: accounts.length - enabledAccounts.length,
  }

  if (signal?.aborted) {
    return {
      ...baseResult,
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      successCount: 0,
      failureCount: 0,
    }
  }

  if (supportedAccounts.length === 0) {
    return {
      ...baseResult,
      result: INVITE_LINK_COPY_RESULTS.Unsupported,
      successCount: 0,
      failureCount: 0,
    }
  }

  const fetchResults = await fetchInviteLinks({
    accounts: supportedAccounts,
    signal,
    requestTimeoutMs,
    batchTimeoutMs,
  })

  if (signal?.aborted) {
    return {
      ...baseResult,
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      successCount: 0,
      failureCount: 0,
    }
  }

  const successes = fetchResults.filter(
    (result): result is InviteLinkFetchSuccess => "inviteLink" in result,
  )
  const failureReasonCounts =
    fetchResults.reduce<InviteLinkFailureReasonCounts>((counts, result) => {
      if ("reason" in result) {
        counts[result.reason] = (counts[result.reason] ?? 0) + 1
      }
      return counts
    }, {})
  const successCount = successes.length
  const failureCount = supportedAccounts.length - successCount
  const failureDetails = failureCount > 0 ? { failureReasonCounts } : undefined
  const payload = successes
    .map(({ account, inviteLink }) => {
      if (format === "raw") return inviteLink

      const label =
        typeof account.name === "string" && account.name.trim().length > 0
          ? account.name.trim()
          : account.baseUrl
      return `${label}: ${inviteLink}`
    })
    .join("\n")

  if (successCount === 0) {
    return {
      ...baseResult,
      result: INVITE_LINK_COPY_RESULTS.Failure,
      successCount,
      failureCount,
      ...failureDetails,
    }
  }

  let clipboardWriteSettled = false
  let clipboardWriteFailed = false
  let abortedBeforeClipboardWriteSettled = false
  const handleClipboardWriteAbort = () => {
    queueMicrotask(() => {
      if (!clipboardWriteSettled) {
        abortedBeforeClipboardWriteSettled = true
      }
    })
  }
  signal?.addEventListener("abort", handleClipboardWriteAbort, { once: true })

  try {
    await navigator.clipboard.writeText(payload).finally(() => {
      clipboardWriteSettled = true
    })
  } catch {
    clipboardWriteFailed = true
  } finally {
    signal?.removeEventListener("abort", handleClipboardWriteAbort)
  }

  if (abortedBeforeClipboardWriteSettled) {
    return {
      ...baseResult,
      result: INVITE_LINK_COPY_RESULTS.Cancelled,
      payload,
      successCount,
      failureCount,
      ...failureDetails,
    }
  }

  if (clipboardWriteFailed) {
    return {
      ...baseResult,
      result: INVITE_LINK_COPY_RESULTS.ClipboardFailure,
      payload,
      successCount,
      failureCount,
      ...failureDetails,
    }
  }

  const isPartial =
    failureCount > 0 ||
    baseResult.unsupportedCount > 0 ||
    baseResult.skippedCount > 0

  return {
    ...baseResult,
    result: isPartial
      ? INVITE_LINK_COPY_RESULTS.PartialSuccess
      : INVITE_LINK_COPY_RESULTS.Success,
    payload,
    successCount,
    failureCount,
    ...failureDetails,
  }
}
