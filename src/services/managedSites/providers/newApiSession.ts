import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import {
  getNewApiOwnedSessionStatus,
  touchNewApiOwnedSession,
} from "~/services/managedSites/newApiOwnedSession/client"
import {
  NEW_API_CHANNEL_KEY_ERROR_KINDS,
  NEW_API_MANAGED_SESSION_STATUSES,
  NEW_API_SESSION_LIMIT_CODES,
  NEW_API_VERIFIED_SESSION_WINDOW_MS,
  NewApiChannelKeyRequirementError,
  type EnsureNewApiLoginResult,
  type EnsureNewApiManagedSessionResult,
  type NewApiChannelKeyErrorKind,
  type NewApiChannelKeyRequirementSessionResult,
  type NewApiVerificationMethods,
} from "~/services/managedSites/providers/newApiSessionContracts"
import { createNewApiSessionProtocol } from "~/services/managedSites/providers/newApiSessionProtocol"
import { toSanitizedErrorSummary as sanitizeNewApiSessionError } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"
import type { NewApiConfig } from "~/types/newApiConfig"
import { createLogger } from "~/utils/core/logger"

import { generateNewApiTotpCode, hasNewApiTotpSecret } from "./newApiTotp"
import { NewApiTransientSessionRuntime } from "./newApiTransientSessionRuntime"

const logger = createLogger("NewApiManagedSession")

const sessionRuntime = new NewApiTransientSessionRuntime(
  NEW_API_VERIFIED_SESSION_WINDOW_MS,
)
const {
  createManagedSessionRequest,
  readNewApiVerificationMethodsWithRefresh,
  ensureNewApiLoginSession,
  verifyNewApiSession,
  sanitizeNewApiErrorForOrigin,
  isUnauthorizedError,
  isSecureVerificationError,
  submitLoginTwoFactorCode,
} = createNewApiSessionProtocol(sessionRuntime)

/** Maps only the two upstream session-limit codes to product recovery states. */
async function classifyNewApiSessionLimit(
  error: unknown,
  baseUrl: string,
): Promise<EnsureNewApiManagedSessionResult | null> {
  if (!(error instanceof Error)) return null
  const structured = error as Error & {
    statusCode?: number
    upstreamCode?: string
  }

  if (
    structured.statusCode === 409 &&
    structured.upstreamCode === NEW_API_SESSION_LIMIT_CODES.ACTIVE
  ) {
    const { owned } = await getNewApiOwnedSessionStatus(baseUrl)
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.SESSION_ACTIVE_LIMIT,
      cleanupAvailable: owned,
    }
  }

  if (
    structured.statusCode === 429 &&
    structured.upstreamCode === NEW_API_SESSION_LIMIT_CODES.ISSUANCE
  ) {
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.SESSION_ISSUANCE_LIMIT,
    }
  }

  return null
}

/**
 * Uses the same browser-session probe as ensureNewApiManagedSession so callers
 * can tell whether verification can resume immediately without stored login
 * credentials.
 */
export async function hasNewApiAuthenticatedBrowserSession(
  config: Pick<NewApiConfig, "baseUrl" | "userId">,
) {
  return Boolean(
    await readNewApiVerificationMethodsWithRefresh(
      config.baseUrl,
      config.userId,
    ),
  )
}

/**
 * Checks the cached verified-session window for the current runtime.
 */
export const isNewApiVerifiedSessionActive = (baseUrl: string) =>
  sessionRuntime.isVerifiedSessionActive(baseUrl)

const getNewApiChannelKeyRequirementKind = (
  result: NewApiChannelKeyRequirementSessionResult,
): NewApiChannelKeyErrorKind => {
  switch (result.status) {
    case NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED:
    case NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED:
      return NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED
    case NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING:
    case NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED:
      return NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED
    case NEW_API_MANAGED_SESSION_STATUSES.SESSION_ACTIVE_LIMIT:
    case NEW_API_MANAGED_SESSION_STATUSES.SESSION_ISSUANCE_LIMIT:
      return NEW_API_CHANNEL_KEY_ERROR_KINDS.SESSION_LIMIT
    default:
      return NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED
  }
}

/**
 * Ensures the current origin has enough managed-session state to read hidden
 * channel keys before callers touch the per-channel key endpoint.
 */
async function ensureNewApiChannelKeyAccess(
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  > & { channelId?: number },
): Promise<void> {
  if (
    isNewApiVerifiedSessionActive(config.baseUrl) &&
    (!sessionRuntime.getActiveSecurityProof(config.baseUrl)?.channelId ||
      sessionRuntime.getActiveSecurityProof(config.baseUrl)?.channelId ===
        config.channelId)
  ) {
    return
  }

  const sessionResult = await ensureNewApiManagedSession(config)
  if (sessionResult.status === NEW_API_MANAGED_SESSION_STATUSES.VERIFIED) {
    return
  }

  throw new NewApiChannelKeyRequirementError(
    getNewApiChannelKeyRequirementKind(sessionResult),
    sessionResult,
  )
}

/**
 * Continues from a logged-in session into the secure-verification stage and
 * applies automatic TOTP verification when the user has opted into it.
 */
async function continueFromLoggedInSession(
  config: Pick<NewApiConfig, "baseUrl" | "userId" | "totpSecret"> & {
    channelId?: number
  },
  methods: NewApiVerificationMethods,
): Promise<EnsureNewApiManagedSessionResult> {
  if (
    isNewApiVerifiedSessionActive(config.baseUrl) &&
    (!sessionRuntime.getActiveSecurityProof(config.baseUrl)?.channelId ||
      sessionRuntime.getActiveSecurityProof(config.baseUrl)?.channelId ===
        config.channelId)
  ) {
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods,
      verifiedUntil: sessionRuntime.getVerifiedUntil(config.baseUrl),
    }
  }

  if (methods.twoFactorEnabled && hasNewApiTotpSecret(config.totpSecret)) {
    let generatedCode = ""

    try {
      generatedCode = generateNewApiTotpCode(config.totpSecret!)
      const result = await verifyNewApiSession(config, {
        method: "2fa",
        code: generatedCode,
      })

      return {
        status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
        methods: result.methods,
        verifiedUntil: result.verifiedUntil,
      }
    } catch (error) {
      const errorMessage = sanitizeNewApiSessionError(error, [
        config.totpSecret ?? "",
        generatedCode,
        ...sessionRuntime.getTransientSessionSecrets(config.baseUrl),
      ])

      logger.warn("Automatic New API secure verification failed", {
        baseUrl: config.baseUrl,
        diagnostic: errorMessage,
      })

      return {
        status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
        methods,
        automaticAttempted: true,
        errorMessage,
      }
    }
  }

  if (methods.passkeyEnabled && !methods.twoFactorEnabled) {
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED,
      methods,
    }
  }

  return {
    status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
    methods,
    automaticAttempted: false,
  }
}

/**
 * Login 2FA and secure verification are separate backend stages in upstream New
 * API, so the dialog/controller needs explicit state transitions for both.
 */
export async function ensureNewApiManagedSession(
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  > & { channelId?: number },
): Promise<EnsureNewApiManagedSessionResult> {
  let loginResult: EnsureNewApiLoginResult
  try {
    loginResult = await ensureNewApiLoginSession(config)
  } catch (error) {
    const limit = await classifyNewApiSessionLimit(error, config.baseUrl)
    if (limit) return limit
    throw error
  }

  if (loginResult.status === "credentials-missing") {
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING,
    }
  }

  if (loginResult.status === "passkey-manual-required") return loginResult

  if (loginResult.status === "login-2fa-required") {
    if (!hasNewApiTotpSecret(config.totpSecret)) {
      return {
        status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
        automaticAttempted: false,
      }
    }

    let generatedCode = ""

    try {
      generatedCode = generateNewApiTotpCode(config.totpSecret!)
      return await submitNewApiLoginTwoFactorCode(config, generatedCode, {
        automaticAttempted: true,
      })
    } catch (error) {
      const errorMessage = sanitizeNewApiSessionError(error, [
        config.totpSecret ?? "",
        generatedCode,
        ...sessionRuntime.getTransientSessionSecrets(config.baseUrl),
      ])

      logger.warn("Automatic New API login 2FA failed", {
        baseUrl: config.baseUrl,
        diagnostic: errorMessage,
      })

      return {
        status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
        automaticAttempted: true,
        errorMessage,
      }
    }
  }

  return continueFromLoggedInSession(config, loginResult.methods)
}

/**
 * Submits a login 2FA code and then continues into the secure-verification
 * stage, because upstream New API treats those as two separate steps.
 */
export async function submitNewApiLoginTwoFactorCode(
  config: Pick<NewApiConfig, "baseUrl" | "userId" | "totpSecret"> & {
    channelId?: number
  },
  code: string,
  options?: {
    automaticAttempted?: boolean
  },
): Promise<EnsureNewApiManagedSessionResult> {
  let methods: NewApiVerificationMethods
  try {
    methods = await submitLoginTwoFactorCode(config, code)
  } catch (error) {
    const limit = await classifyNewApiSessionLimit(error, config.baseUrl)
    if (limit) return limit
    throw error
  }

  const nextState = await continueFromLoggedInSession(config, methods)

  if (
    nextState.status ===
      NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED &&
    options?.automaticAttempted
  ) {
    return {
      ...nextState,
      automaticAttempted: true,
    }
  }

  return nextState
}

/**
 * Submits the New API secure-verification code used for hidden channel-key
 * reads and other sensitive managed-site actions.
 */
export async function submitNewApiSecureVerificationCode(
  config: Pick<NewApiConfig, "baseUrl" | "userId"> & { channelId?: number },
  code: string,
): Promise<EnsureNewApiManagedSessionResult> {
  const trimmedCode = code.trim()
  const result = await verifyNewApiSession(config, {
    method: "2fa",
    code: trimmedCode,
  })

  return {
    status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
    methods: result.methods,
    verifiedUntil: result.verifiedUntil,
  }
}

/**
 * Provide the session-owned operations needed by one protected channel-key read.
 * The read module owns queue ordering and transport recovery; this owner keeps
 * login, proof invalidation and transient credentials together.
 */
export function getNewApiChannelKeyReadContext(baseUrl: string) {
  const queue = sessionRuntime.getChannelKeyReadQueue(baseUrl)
  return {
    queue,
    ensureAccess: (
      config: Omit<
        Parameters<typeof ensureNewApiChannelKeyAccess>[0],
        "baseUrl"
      >,
    ) => ensureNewApiChannelKeyAccess({ ...config, baseUrl }),
    prepareRequest(userId?: number | string, signal?: AbortSignal) {
      const request = createManagedSessionRequest(baseUrl, userId, signal)
      const usesDashboardAuth =
        request.auth.authType === AuthTypeEnum.AccessToken
      const securityProof = usesDashboardAuth
        ? sessionRuntime.getActiveSecurityProof(baseUrl)
        : undefined
      // Consume channel-scoped proof before transport: even a failed/aborted read
      // may have consumed it upstream. Legacy Cookie verification remains cached.
      if (securityProof?.channelId) sessionRuntime.clearVerifiedState(baseUrl)
      return { request, usesDashboardAuth, securityProof }
    },
    async recordSuccess(usedScopedProof: boolean, signal?: AbortSignal) {
      if (!usedScopedProof) sessionRuntime.markVerified(baseUrl)
      await runAbortableTask(
        () =>
          touchNewApiOwnedSession(
            baseUrl,
            sessionRuntime.getActiveDashboardAuth(baseUrl)?.sessionId,
          ),
        { signals: [signal] },
      )
    },
    resolveFailure(rawError: unknown, consumedProofToken: string) {
      const error = sanitizeNewApiErrorForOrigin(rawError, baseUrl, [
        consumedProofToken,
      ])
      if (isUnauthorizedError(error)) {
        sessionRuntime.clearLoggedInState(baseUrl)
        return new NewApiChannelKeyRequirementError(
          NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED,
        )
      }
      if (isSecureVerificationError(error)) {
        sessionRuntime.clearVerifiedState(baseUrl)
        sessionRuntime.markLoggedIn(baseUrl)
        return new NewApiChannelKeyRequirementError(
          NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
        )
      }
      return error
    },
  }
}

/**
 * Clears cached New API session state for tests or when callers need to drop
 * all runtime login/verification markers.
 */
export function clearNewApiManagedSessionState(baseUrl?: string) {
  sessionRuntime.clear(baseUrl)
}
