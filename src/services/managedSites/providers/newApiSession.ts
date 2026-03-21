import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { fetchApiData } from "~/services/apiService/common/utils"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"
import type { NewApiConfig } from "~/types/newApiConfig"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { generateNewApiTotpCode, hasNewApiTotpSecret } from "./newApiTotp"

const logger = createLogger("NewApiManagedSession")

export const NEW_API_VERIFIED_SESSION_WINDOW_MS = 5 * 60 * 1000

export const NEW_API_MANAGED_SESSION_STATUSES = {
  VERIFIED: "verified",
  CREDENTIALS_MISSING: "credentials-missing",
  LOGIN_2FA_REQUIRED: "login-2fa-required",
  SECURE_VERIFICATION_REQUIRED: "secure-verification-required",
  PASSKEY_MANUAL_REQUIRED: "passkey-manual-required",
} as const

export type NewApiManagedSessionStatus =
  (typeof NEW_API_MANAGED_SESSION_STATUSES)[keyof typeof NEW_API_MANAGED_SESSION_STATUSES]

export interface NewApiVerificationMethods {
  twoFactorEnabled: boolean
  passkeyEnabled: boolean
}

export type EnsureNewApiManagedSessionResult =
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.VERIFIED
      methods: NewApiVerificationMethods
      verifiedUntil?: number
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED
      errorMessage?: string
      automaticAttempted: boolean
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED
      methods: NewApiVerificationMethods
      errorMessage?: string
      automaticAttempted: boolean
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED
      methods: NewApiVerificationMethods
    }

export const NEW_API_CHANNEL_KEY_ERROR_KINDS = {
  LOGIN_REQUIRED: "login-required",
  SECURE_VERIFICATION_REQUIRED: "secure-verification-required",
} as const

export type NewApiChannelKeyErrorKind =
  (typeof NEW_API_CHANNEL_KEY_ERROR_KINDS)[keyof typeof NEW_API_CHANNEL_KEY_ERROR_KINDS]

type NewApiChannelKeyRequirementSessionResult = Exclude<
  EnsureNewApiManagedSessionResult,
  {
    status: typeof NEW_API_MANAGED_SESSION_STATUSES.VERIFIED
  }
>

export class NewApiChannelKeyRequirementError extends Error {
  constructor(
    public kind: NewApiChannelKeyErrorKind,
    public sessionResult?: NewApiChannelKeyRequirementSessionResult,
  ) {
    super(kind)
    this.name = "NewApiChannelKeyRequirementError"
  }
}

interface NewApiLoginResponse {
  require_2fa?: boolean
}

interface NewApiTwoFactorStatusResponse {
  enabled?: boolean
}

interface NewApiPasskeyStatusResponse {
  enabled?: boolean
}

interface NewApiVerifyResponse {
  verified?: boolean
  expires_at?: number
}

interface NewApiSessionState {
  hasLoggedInSession: boolean
  verifiedUntil?: number
  loginPromise?: Promise<EnsureNewApiLoginResult>
  methodsPromise?: Promise<NewApiVerificationMethods | null>
  verificationPromise?: Promise<VerifyNewApiSessionResult>
}

type EnsureNewApiLoginResult =
  | {
      status: "logged-in"
      methods: NewApiVerificationMethods
    }
  | {
      status: "login-2fa-required"
    }
  | {
      status: "credentials-missing"
    }

interface VerifyNewApiSessionResult {
  methods: NewApiVerificationMethods
  verifiedUntil?: number
}

const sessionStates = new Map<string, NewApiSessionState>()

const normalizeSessionScopeKey = (baseUrl: string) =>
  normalizeUrlForOriginKey(baseUrl, { stripTrailingSlashes: true }) ||
  baseUrl.trim()

const getSessionState = (baseUrl: string): NewApiSessionState => {
  const scopeKey = normalizeSessionScopeKey(baseUrl)
  const existing = sessionStates.get(scopeKey)

  if (existing) {
    return existing
  }

  const created: NewApiSessionState = {
    hasLoggedInSession: false,
  }
  sessionStates.set(scopeKey, created)
  return created
}

const createCookieAuthRequest = (
  baseUrl: string,
  userId?: number | string,
): ApiServiceRequest => ({
  baseUrl: baseUrl.trim(),
  accountId: `managed-site:new-api-session:${normalizeSessionScopeKey(baseUrl)}`,
  auth: {
    authType: AuthTypeEnum.Cookie,
    userId,
  },
})

const isUnauthorizedError = (error: unknown) =>
  error instanceof ApiError &&
  (error.statusCode === 401 || error.code === API_ERROR_CODES.HTTP_401)

const looksLikeVerificationRequirement = (message: string) =>
  /verify|verification|two[- ]factor|2fa|验证码|验证|安全验证/i.test(message)

const isSecureVerificationError = (error: unknown) =>
  (error instanceof ApiError &&
    (error.statusCode === 403 || error.code === API_ERROR_CODES.HTTP_403)) ||
  (error instanceof Error && looksLikeVerificationRequirement(error.message))

const sanitizeNewApiSessionError = (error: unknown, secrets: string[] = []) => {
  return toSanitizedErrorSummary(error, secrets)
}

const clearVerifiedState = (baseUrl: string) => {
  const state = getSessionState(baseUrl)
  state.verifiedUntil = undefined
}

const clearLoggedInState = (baseUrl: string) => {
  const state = getSessionState(baseUrl)
  state.hasLoggedInSession = false
  state.verifiedUntil = undefined
}

const toVerifiedUntilTimestamp = (expiresAt?: number) => {
  if (!Number.isFinite(expiresAt)) {
    return Date.now() + NEW_API_VERIFIED_SESSION_WINDOW_MS
  }

  return (expiresAt as number) > 1_000_000_000_000
    ? (expiresAt as number)
    : (expiresAt as number) * 1000
}

const markLoggedIn = (baseUrl: string) => {
  const state = getSessionState(baseUrl)
  state.hasLoggedInSession = true
}

const markVerified = (baseUrl: string, verifiedUntil?: number) => {
  const state = getSessionState(baseUrl)
  state.hasLoggedInSession = true
  state.verifiedUntil =
    verifiedUntil ?? Date.now() + NEW_API_VERIFIED_SESSION_WINDOW_MS
}

/**
 * Whether the stored New API login-assist fields are sufficient to start a
 * browser-backed session recovery flow when passive exact matching is blocked.
 */
export const hasNewApiLoginAssistCredentials = (
  config?: Pick<NewApiConfig, "username" | "password"> | null,
) => Boolean(config?.username?.trim() && config?.password?.trim())

/**
 * Uses the same browser-session probe as ensureNewApiManagedSession so callers
 * can tell whether verification can resume immediately without stored login
 * credentials.
 */
export async function hasNewApiAuthenticatedBrowserSession(
  config: Pick<NewApiConfig, "baseUrl" | "userId">,
) {
  return Boolean(
    await readNewApiVerificationMethods(config.baseUrl, config.userId),
  )
}

/**
 * Checks the cached verified-session window for the current runtime.
 */
export const isNewApiVerifiedSessionActive = (baseUrl: string) => {
  const verifiedUntil = getSessionState(baseUrl).verifiedUntil
  return Boolean(verifiedUntil && verifiedUntil > Date.now())
}

const getNewApiChannelKeyRequirementKind = (
  result: NewApiChannelKeyRequirementSessionResult,
): NewApiChannelKeyErrorKind => {
  switch (result.status) {
    case NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED:
    case NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED:
      return NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED
    case NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING:
    case NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED:
    default:
      return NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED
  }
}

/**
 * Ensures the current origin has enough managed-session state to read hidden
 * channel keys before callers touch the per-channel key endpoint.
 */
export async function ensureNewApiChannelKeyAccess(
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >,
): Promise<void> {
  if (isNewApiVerifiedSessionActive(config.baseUrl)) {
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
 * Probes the logged-in New API session for available verification methods.
 * Returns `null` when no valid browser session exists for the current origin.
 */
async function readNewApiVerificationMethods(
  baseUrl: string,
  userId?: number | string,
): Promise<NewApiVerificationMethods | null> {
  const state = getSessionState(baseUrl)
  if (state.methodsPromise) {
    return state.methodsPromise
  }

  state.methodsPromise = (async () => {
    const request = createCookieAuthRequest(baseUrl, userId)
    const results = await Promise.allSettled([
      fetchApiData<NewApiTwoFactorStatusResponse>(request, {
        endpoint: "/api/user/2fa/status",
      }),
      fetchApiData<NewApiPasskeyStatusResponse>(request, {
        endpoint: "/api/user/passkey",
      }),
    ])

    let loggedIn = false
    let twoFactorEnabled = false
    let passkeyEnabled = false
    let unexpectedError: unknown = null

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        loggedIn = true
        if (index === 0) {
          twoFactorEnabled = result.value?.enabled === true
        } else {
          passkeyEnabled = result.value?.enabled === true
        }
        return
      }

      if (!isUnauthorizedError(result.reason) && !unexpectedError) {
        unexpectedError = result.reason
      }
    })

    if (!loggedIn) {
      clearLoggedInState(baseUrl)

      if (unexpectedError) {
        throw unexpectedError
      }

      return null
    }

    markLoggedIn(baseUrl)
    return {
      twoFactorEnabled,
      passkeyEnabled,
    }
  })()

  try {
    return await state.methodsPromise
  } finally {
    state.methodsPromise = undefined
  }
}

/**
 * Starts a New API login session with stored username/password when no browser
 * session is already available, and reports whether login 2FA is still needed.
 */
async function postNewApiLogin(
  config: Pick<NewApiConfig, "baseUrl" | "userId" | "username" | "password">,
): Promise<EnsureNewApiLoginResult> {
  const methods = await readNewApiVerificationMethods(
    config.baseUrl,
    config.userId,
  )
  if (methods) {
    return {
      status: "logged-in",
      methods,
    }
  }

  if (!hasNewApiLoginAssistCredentials(config)) {
    return {
      status: "credentials-missing",
    }
  }

  const request = createCookieAuthRequest(config.baseUrl, config.userId)
  const response = await fetchApiData<NewApiLoginResponse>(request, {
    endpoint: "/api/user/login",
    options: {
      method: "POST",
      body: JSON.stringify({
        username: config.username?.trim(),
        password: config.password ?? "",
      }),
    },
  })

  if (response?.require_2fa) {
    return {
      status: "login-2fa-required",
    }
  }

  markLoggedIn(config.baseUrl)

  return {
    status: "logged-in",
    methods: (await readNewApiVerificationMethods(
      config.baseUrl,
      config.userId,
    )) ?? {
      twoFactorEnabled: false,
      passkeyEnabled: false,
    },
  }
}

/**
 * Deduplicates in-flight New API login attempts per managed-site origin.
 */
async function ensureNewApiLoginSession(
  config: Pick<NewApiConfig, "baseUrl" | "userId" | "username" | "password">,
): Promise<EnsureNewApiLoginResult> {
  const state = getSessionState(config.baseUrl)
  if (state.loginPromise) {
    return state.loginPromise
  }

  state.loginPromise = postNewApiLogin(config)

  try {
    return await state.loginPromise
  } finally {
    state.loginPromise = undefined
  }
}

/**
 * Runs the secure-verification request that unlocks hidden channel-key reads.
 */
async function verifyNewApiSession(
  config: Pick<NewApiConfig, "baseUrl" | "userId">,
  params: {
    method: "2fa"
    code: string
  },
): Promise<VerifyNewApiSessionResult> {
  const state = getSessionState(config.baseUrl)
  if (state.verificationPromise) {
    return state.verificationPromise
  }

  state.verificationPromise = (async () => {
    const request = createCookieAuthRequest(config.baseUrl, config.userId)
    const response = await fetchApiData<NewApiVerifyResponse>(request, {
      endpoint: "/api/verify",
      options: {
        method: "POST",
        body: JSON.stringify(params),
      },
    })

    const verifiedUntil = toVerifiedUntilTimestamp(response?.expires_at)
    markVerified(config.baseUrl, verifiedUntil)

    return {
      methods: (await readNewApiVerificationMethods(
        config.baseUrl,
        config.userId,
      )) ?? {
        twoFactorEnabled: false,
        passkeyEnabled: false,
      },
      verifiedUntil,
    }
  })()

  try {
    return await state.verificationPromise
  } finally {
    state.verificationPromise = undefined
  }
}

/**
 * Continues from a logged-in session into the secure-verification stage and
 * applies automatic TOTP verification when the user has opted into it.
 */
async function continueFromLoggedInSession(
  config: Pick<NewApiConfig, "baseUrl" | "userId" | "totpSecret">,
  methods: NewApiVerificationMethods,
): Promise<EnsureNewApiManagedSessionResult> {
  if (isNewApiVerifiedSessionActive(config.baseUrl)) {
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods,
      verifiedUntil: getSessionState(config.baseUrl).verifiedUntil,
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
  >,
): Promise<EnsureNewApiManagedSessionResult> {
  const loginResult = await ensureNewApiLoginSession(config)

  if (loginResult.status === "credentials-missing") {
    return {
      status: NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING,
    }
  }

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
  config: Pick<NewApiConfig, "baseUrl" | "userId" | "totpSecret">,
  code: string,
  options?: {
    automaticAttempted?: boolean
  },
): Promise<EnsureNewApiManagedSessionResult> {
  const trimmedCode = code.trim()

  const request = createCookieAuthRequest(config.baseUrl, config.userId)
  await fetchApiData(request, {
    endpoint: "/api/user/login/2fa",
    options: {
      method: "POST",
      body: JSON.stringify({
        code: trimmedCode,
      }),
    },
  })

  markLoggedIn(config.baseUrl)

  const methods = (await readNewApiVerificationMethods(
    config.baseUrl,
    config.userId,
  )) ?? {
    twoFactorEnabled: false,
    passkeyEnabled: false,
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
  config: Pick<NewApiConfig, "baseUrl" | "userId">,
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
 * Fetches a hidden New API channel key through the cookie-auth session flow and
 * classifies missing login or verification state for callers that need to stay
 * passive unless the user explicitly chooses recovery.
 */
export async function fetchNewApiChannelKey(params: {
  baseUrl: string
  userId?: number | string
  channelId: number
  username?: string
  password?: string
  totpSecret?: string
}): Promise<string> {
  await ensureNewApiChannelKeyAccess({
    baseUrl: params.baseUrl,
    userId: params.userId?.toString() ?? "",
    username: params.username?.trim() ?? "",
    password: params.password ?? "",
    totpSecret: params.totpSecret?.trim() ?? "",
  })

  try {
    const response = await fetchApiData<{ key?: string } | string>(
      createCookieAuthRequest(params.baseUrl, params.userId),
      {
        endpoint: `/api/channel/${params.channelId}/key`,
        options: {
          method: "POST",
          body: JSON.stringify({}),
        },
      },
    )

    const key =
      typeof response === "string" ? response.trim() : response?.key?.trim()

    if (!key) {
      throw new Error("new_api_channel_key_missing")
    }

    markVerified(params.baseUrl)
    return key
  } catch (error) {
    if (isUnauthorizedError(error)) {
      clearLoggedInState(params.baseUrl)
      throw new NewApiChannelKeyRequirementError(
        NEW_API_CHANNEL_KEY_ERROR_KINDS.LOGIN_REQUIRED,
      )
    }

    if (isSecureVerificationError(error)) {
      clearVerifiedState(params.baseUrl)
      markLoggedIn(params.baseUrl)
      throw new NewApiChannelKeyRequirementError(
        NEW_API_CHANNEL_KEY_ERROR_KINDS.SECURE_VERIFICATION_REQUIRED,
      )
    }

    throw error
  }
}

/**
 * Clears cached New API session state for tests or when callers need to drop
 * all runtime login/verification markers.
 */
export function clearNewApiManagedSessionState(baseUrl?: string) {
  if (!baseUrl) {
    sessionStates.clear()
    return
  }

  sessionStates.delete(normalizeSessionScopeKey(baseUrl))
}
