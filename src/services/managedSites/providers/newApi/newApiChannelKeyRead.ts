import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { getNewApiChannelKeyReadContext } from "~/services/managedSites/providers/newApi/newApiSession"
import {
  NEW_API_CHANNEL_KEY_ERROR_KINDS,
  NewApiChannelKeyRequirementError,
} from "~/services/managedSites/providers/newApi/newApiSessionContracts"
import {
  NEW_API_SESSION_READ_ACTIONS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { safeRandomUUID } from "~/utils/core/identifier"
import { t } from "~/utils/i18n/core"

const throwIfNewApiSessionReadAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("The operation was aborted", "AbortError")
    )
  }
}

// New API deployments signal browser-session verification with either an
// explicit 403 or a non-JSON verification page returned to the API client.
const isNewApiSessionReadFallbackError = (error: ApiError) =>
  error.statusCode === 403 ||
  error.code === API_ERROR_CODES.HTTP_403 ||
  error.code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH

type NewApiChannelKeyParams = {
  baseUrl: string
  userId?: number | string
  channelId: number
  username?: string
  password?: string
  totpSecret?: string
  protectionBypassExecution?: ProtectionBypassExecution
  signal?: AbortSignal
}

/** Serializes proof issuance and consumption within an origin, including failed reads. */
export async function fetchNewApiChannelKey(
  params: NewApiChannelKeyParams,
): Promise<string> {
  const context = getNewApiChannelKeyReadContext(params.baseUrl)
  const queue = context.queue
  const previous = queue.pending
  const pending = (async () => {
    await previous?.catch(() => undefined)
    try {
      return await readNewApiChannelKey(params, context)
    } catch (error) {
      if (error instanceof NewApiChannelKeyRequirementError)
        error.channelId = params.channelId
      throw error
    }
  })()
  queue.pending = pending
  try {
    return await runAbortableTask(() => pending, { signals: [params.signal] })
  } finally {
    if (queue.pending === pending) {
      // Keep the queue locked until the underlying operation settles, even if
      // its caller stops waiting after cancellation.
      void pending
        .finally(() => {
          if (queue.pending === pending) queue.pending = undefined
        })
        .catch(() => undefined)
    }
  }
}

/** Acquires verification and consumes the proof for one queued channel-key read. */
async function readNewApiChannelKey(
  params: NewApiChannelKeyParams,
  context: ReturnType<typeof getNewApiChannelKeyReadContext>,
): Promise<string> {
  throwIfNewApiSessionReadAborted(params.signal)
  await runAbortableTask(
    async () =>
      await context.ensureAccess({
        channelId: params.channelId,
        userId: params.userId?.toString() ?? "",
        username: params.username?.trim() ?? "",
        password: params.password ?? "",
        totpSecret: params.totpSecret?.trim() ?? "",
      }),
    { signals: [params.signal] },
  )
  throwIfNewApiSessionReadAborted(params.signal)

  let consumedProofToken = ""
  try {
    const endpoint = `/api/channel/${params.channelId}/key`
    const {
      request: sessionRequest,
      securityProof,
      usesDashboardAuth,
    } = context.prepareRequest(params.userId, params.signal)
    // Current upstream binds proofs to a channel and consumes them at most once.
    // Clear before sending: a failed or aborted response may already have consumed it.
    // https://github.com/QuantumNous/new-api/blob/main/service/security_verification.go
    if (securityProof?.channelId) {
      consumedProofToken = securityProof.token
      if (securityProof.channelId !== params.channelId) {
        throw new NewApiChannelKeyRequirementError(
          NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
        )
      }
    }
    let response: { key?: string } | string
    try {
      response = await newApiFamilyRequests.data<{ key?: string } | string>(
        sessionRequest,
        {
          endpoint,
          options: {
            method: "POST",
            body: JSON.stringify({}),
            ...(securityProof
              ? {
                  // Modern New API channel-key routes validate this scoped proof
                  // separately from the dashboard Bearer.
                  // https://github.com/QuantumNous/new-api/commit/31d70fca393ff2e09bbae012af2e3ccefdd389a1
                  headers: { "X-Security-Proof": securityProof.token },
                }
              : {}),
          },
        },
      )
    } catch (error) {
      const protectionBypassExecution = params.protectionBypassExecution
      if (
        // The protected NewApiSessionRead envelope is intentionally closed and
        // Cookie-only; never copy a transient dashboard Bearer into it.
        usesDashboardAuth ||
        !protectionBypassExecution ||
        !(error instanceof ApiError) ||
        error.code === API_ERROR_CODES.BUSINESS_ERROR ||
        !isNewApiSessionReadFallbackError(error)
      ) {
        throw error
      }

      const origin = new URL(params.baseUrl).origin
      throwIfNewApiSessionReadAborted(params.signal)
      const { tempWindowNewApiSessionRead } = await import(
        "~/utils/browser/tempWindowFetch"
      )
      const fallback = await runAbortableTask(
        async () =>
          await tempWindowNewApiSessionRead({
            origin,
            action: NEW_API_SESSION_READ_ACTIONS.ChannelKey,
            channelId: params.channelId,
            userId: params.userId?.toString().trim() ?? "",
            requestId: safeRandomUUID(
              `new-api-channel-key-${params.channelId}`,
            ),
            protectionBypassExecution,
          }),
        { signals: [params.signal] },
      )
      throwIfNewApiSessionReadAborted(params.signal)
      if (!fallback.success) {
        throw new ApiError(
          fallback.error || "New API session read failed",
          fallback.status,
          endpoint,
          fallback.code,
        )
      }
      const body = fallback.data as
        | { success?: boolean; message?: string; data?: unknown }
        | undefined
      if (!body?.success) {
        throw new ApiError(
          body?.message || t("messages:errors.api.invalidResponseFormat"),
          fallback.status,
          endpoint,
          API_ERROR_CODES.BUSINESS_ERROR,
        )
      }
      response = body.data as { key?: string } | string
    }

    throwIfNewApiSessionReadAborted(params.signal)

    const key =
      typeof response === "string" ? response.trim() : response?.key?.trim()

    if (!key) {
      throw new Error("new_api_channel_key_missing")
    }

    await context.recordSuccess(
      Boolean(securityProof?.channelId),
      params.signal,
    )
    throwIfNewApiSessionReadAborted(params.signal)
    return key
  } catch (rawError) {
    throwIfNewApiSessionReadAborted(params.signal)
    throw context.resolveFailure(rawError, consumedProofToken)
  }
}
