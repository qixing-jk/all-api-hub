import {
  NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE,
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  captureNewApiOwnedSession,
  cleanupNewApiOwnedSession,
  refreshNewApiOwnedSession,
} from "~/services/managedSites/newApiOwnedSession/client"
import {
  hasNewApiLoginAssistCredentials,
  NEW_API_SECURITY_PROOF_SCOPES,
  NEW_API_VERIFIED_SESSION_WINDOW_MS,
  type EnsureNewApiLoginResult,
  type NewApiDashboardRefreshResult,
  type NewApiVerificationMethods,
  type VerifyNewApiSessionResult,
} from "~/services/managedSites/providers/newApiSessionContracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum } from "~/types"
import type { NewApiConfig } from "~/types/newApiConfig"
import { isRecord } from "~/utils/core/object"
import { trimToNull } from "~/utils/core/string"
import { t } from "~/utils/i18n/core"

import {
  normalizeSessionScopeKey,
  type NewApiTransientSessionRuntime,
} from "./newApiTransientSessionRuntime"

/** Adapts dashboard authentication and secure verification using the workflow's single runtime. */
export function createNewApiSessionProtocol(
  sessionRuntime: NewApiTransientSessionRuntime,
) {
  interface NewApiLoginResponse {
    require_2fa?: boolean
    require_verification?: boolean
    methods?: Array<{ method: string; available: boolean }>
    flow_token?: string
    expires_at?: number
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
    proof_token?: string
    method?: string
    scope?: string
  }

  const NEW_API_DASHBOARD_REFRESH_CONTROLLED_STATUSES = new Set([409, 429])
  const NEW_API_DASHBOARD_REFRESH_REQUEST_ERROR =
    "New API session refresh request failed"
  const NEW_API_DASHBOARD_AUTH_UNAUTHORIZED =
    "New API dashboard session could not be authenticated"

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

  const createDashboardAuthRequest = (
    baseUrl: string,
    dashboardAuth: NonNullable<
      ReturnType<NewApiTransientSessionRuntime["getActiveDashboardAuth"]>
    >,
  ): ApiServiceRequest => ({
    baseUrl: baseUrl.trim(),
    accountId: `managed-site:new-api-session:${normalizeSessionScopeKey(baseUrl)}`,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: dashboardAuth.token,
    },
  })

  /** Selects the response-detected dashboard Bearer or the legacy Cookie path. */
  const createManagedSessionRequest = (
    baseUrl: string,
    userId?: number | string,
    signal?: AbortSignal,
  ): ApiServiceRequest => {
    const dashboardAuth = sessionRuntime.getActiveDashboardAuth(baseUrl)
    const request = dashboardAuth
      ? createDashboardAuthRequest(baseUrl, dashboardAuth)
      : createCookieAuthRequest(baseUrl, userId)
    return signal ? { ...request, abortSignal: signal } : request
  }

  const isUnauthorizedError = (error: unknown) =>
    error instanceof ApiError &&
    (error.statusCode === 401 || error.code === API_ERROR_CODES.HTTP_401)

  const looksLikeVerificationRequirement = (message: string) =>
    /verify|verification|two[- ]factor|2fa|验证码|验证|安全验证/i.test(message)
  const isSecureVerificationError = (error: unknown) =>
    (error instanceof ApiError &&
      (error.statusCode === 403 || error.code === API_ERROR_CODES.HTTP_403)) ||
    (error instanceof Error && looksLikeVerificationRequirement(error.message))

  const sanitizeNewApiSessionError = (
    error: unknown,
    secrets: string[] = [],
  ) => {
    return toSanitizedErrorSummary(error, secrets)
  }

  const toVerifiedUntilTimestamp = (expiresAt?: number) => {
    if (!Number.isFinite(expiresAt)) {
      return Date.now() + NEW_API_VERIFIED_SESSION_WINDOW_MS
    }

    return (expiresAt as number) > 1_000_000_000_000
      ? (expiresAt as number)
      : (expiresAt as number) * 1000
  }

  /** Redacts transient session credentials while retaining error categories. */
  const sanitizeNewApiErrorForOrigin = (
    error: unknown,
    baseUrl: string,
    extraSecrets: string[] = [],
  ) => {
    const secrets = [
      ...sessionRuntime.getTransientSessionSecrets(baseUrl),
      ...extraSecrets,
    ].filter(Boolean)
    if (!secrets.length) return error

    const message = sanitizeNewApiSessionError(error, secrets)
    if (error instanceof ApiError) {
      const sanitized = new ApiError(
        message,
        error.statusCode,
        error.endpoint,
        error.code,
        error.upstreamCode,
      )
      sanitized.originalCode = error.originalCode
      return sanitized
    }

    if (error instanceof Error && message !== error.message) {
      const sanitized = new Error(message)
      sanitized.name = error.name
      return sanitized
    }

    return error
  }

  const applyDashboardAuthBundleResponse = (baseUrl: string, body: unknown) => {
    const parsed = parseNewApiDashboardAuthBundleResponse(body)
    if (parsed.kind === "valid") {
      sessionRuntime.storeDashboardAuth(baseUrl, parsed.bundle)
    }
    return parsed.kind
  }

  const parseDashboardRefreshBody = (body: string): unknown | undefined => {
    try {
      return JSON.parse(body)
    } catch {
      // A successful non-JSON response is not recognizable as modern auth;
      // preserve the legacy credential path for older/protected deployments.
      return undefined
    }
  }

  const createDashboardRefreshStatusError = (status: number) =>
    new Error(`New API session refresh failed (${status})`)

  const createControlledDashboardRefreshError = (
    body: unknown,
    status: number,
  ) => {
    const code = isRecord(body) ? trimToNull(body.code) : null
    const message = isRecord(body) ? trimToNull(body.message) : null
    const diagnostic =
      code && message
        ? `${code}: ${message}`
        : code || message || `New API session refresh failed (${status})`
    const error = new Error(diagnostic)
    Object.defineProperties(error, {
      statusCode: { value: status },
      upstreamCode: { value: code ?? undefined },
    })
    return error
  }

  const toOwnedSessionBundle = (
    baseUrl: string,
    dashboardAuth: NonNullable<
      ReturnType<NewApiTransientSessionRuntime["getActiveDashboardAuth"]>
    >,
  ) => ({
    baseUrl,
    sessionId: dashboardAuth.sessionId,
    accessToken: dashboardAuth.token,
    accessExpiresAt: dashboardAuth.expiresAt,
  })

  /**
   * Refreshes only the modern dashboard session. The request rotates auth state,
   * so it is never replayed through current-tab or temporary-window transports.
   */
  async function postNewApiDashboardRefresh(
    baseUrl: string,
  ): Promise<NewApiDashboardRefreshResult> {
    let response
    try {
      response = await fetchApiResponse<string>(
        createCookieAuthRequest(baseUrl),
        {
          endpoint: NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
          responseType: "text",
          currentTabTransport: "disabled",
          tempWindowFallback: { statusCodes: [], codes: [] },
          options: { method: "POST" },
        },
      )
    } catch {
      throw new Error(NEW_API_DASHBOARD_REFRESH_REQUEST_ERROR)
    }

    if (
      response.status === 401 ||
      response.status === 404 ||
      response.status === 405
    ) {
      return "unavailable"
    }

    if (!response.ok) {
      if (NEW_API_DASHBOARD_REFRESH_CONTROLLED_STATUSES.has(response.status)) {
        let body: unknown = null
        try {
          body = JSON.parse(response.body)
        } catch {
          // Status-only fallback remains useful and cannot expose response data.
        }
        throw createControlledDashboardRefreshError(body, response.status)
      }

      throw createDashboardRefreshStatusError(response.status)
    }

    const body = parseDashboardRefreshBody(response.body)
    if (body === undefined) return "unavailable"
    const parsedKind = applyDashboardAuthBundleResponse(baseUrl, body)
    if (parsedKind === "valid") {
      const dashboardAuth = sessionRuntime.getActiveDashboardAuth(baseUrl)
      if (dashboardAuth) {
        await refreshNewApiOwnedSession(
          toOwnedSessionBundle(baseUrl, dashboardAuth),
        )
      }
      return "refreshed"
    }
    if (parsedKind === "malformed") {
      throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
    }

    return "unavailable"
  }

  /** Deduplicates refresh-cookie rotation per managed-site origin. */
  async function refreshNewApiDashboardSession(
    baseUrl: string,
  ): Promise<NewApiDashboardRefreshResult> {
    return sessionRuntime.runDashboardRefresh(baseUrl, () =>
      postNewApiDashboardRefresh(baseUrl),
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
    return sessionRuntime.runVerificationMethods(baseUrl, async () => {
      const request = createManagedSessionRequest(baseUrl, userId)
      const results = await Promise.allSettled([
        newApiFamilyRequests.data<NewApiTwoFactorStatusResponse>(request, {
          endpoint: "/api/user/2fa/status",
        }),
        newApiFamilyRequests.data<NewApiPasskeyStatusResponse>(request, {
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
        sessionRuntime.clearLoggedInState(baseUrl)

        if (unexpectedError) {
          throw unexpectedError
        }

        return null
      }

      sessionRuntime.markLoggedIn(baseUrl)
      return {
        twoFactorEnabled,
        passkeyEnabled,
      }
    })
  }

  /**
   * Probes the active auth path, then uses a modern refresh cookie before any
   * credential login. Legacy 401/404/405 or unrelated responses remain a miss.
   */
  async function readNewApiVerificationMethodsWithRefresh(
    baseUrl: string,
    userId?: number | string,
  ): Promise<NewApiVerificationMethods | null> {
    const methods = await readNewApiVerificationMethods(baseUrl, userId)
    if (methods) return methods

    const refreshResult = await refreshNewApiDashboardSession(baseUrl)
    if (refreshResult !== "refreshed") return null

    const refreshedMethods = await readNewApiVerificationMethods(
      baseUrl,
      userId,
    )
    if (!refreshedMethods) {
      throw new ApiError(
        NEW_API_DASHBOARD_AUTH_UNAUTHORIZED,
        401,
        NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
        API_ERROR_CODES.HTTP_401,
      )
    }

    return refreshedMethods
  }

  /**
   * Starts a New API login session with stored username/password when no browser
   * session is already available, and reports whether login 2FA is still needed.
   */
  async function postNewApiLogin(
    config: Pick<NewApiConfig, "baseUrl" | "userId" | "username" | "password">,
  ): Promise<EnsureNewApiLoginResult> {
    if (sessionRuntime.hasActivePendingLoginFlow(config.baseUrl)) {
      return { status: "login-2fa-required" }
    }

    const methods = await readNewApiVerificationMethodsWithRefresh(
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

    // A lost/mismatched refresh cookie must not let this extension accumulate a
    // second owned session for the same origin. Cleanup remains best-effort so a
    // stale receipt or transient network failure cannot block legacy login.
    await cleanupNewApiOwnedSession(config.baseUrl)

    const request = createCookieAuthRequest(config.baseUrl, config.userId)
    const response = await newApiFamilyRequests.envelope<NewApiLoginResponse>(
      request,
      {
        endpoint: "/api/user/login",
        options: {
          method: "POST",
          body: JSON.stringify({
            username: config.username?.trim(),
            password: config.password ?? "",
          }),
        },
      },
    )

    if (!isRecord(response)) {
      throw new ApiError(
        t("messages:errors.api.invalidResponseFormat"),
        undefined,
        "/api/user/login",
        API_ERROR_CODES.JSON_PARSE_ERROR,
      )
    }

    if (response.success === false) {
      throw new ApiError(
        trimToNull(response.message) ??
          t("messages:errors.api.invalidResponseFormat"),
        undefined,
        "/api/user/login",
        API_ERROR_CODES.BUSINESS_ERROR,
      )
    }

    if (
      !Object.prototype.hasOwnProperty.call(response, "data") ||
      response.data === undefined
    ) {
      throw new ApiError(
        t("messages:errors.api.invalidResponseFormat"),
        undefined,
        "/api/user/login",
        API_ERROR_CODES.JSON_PARSE_ERROR,
      )
    }

    const authBundleKind = applyDashboardAuthBundleResponse(
      config.baseUrl,
      response,
    )
    if (authBundleKind === "malformed") {
      throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
    }
    if (authBundleKind === "valid") {
      const dashboardAuth = sessionRuntime.getActiveDashboardAuth(
        config.baseUrl,
      )
      if (dashboardAuth) {
        await captureNewApiOwnedSession(
          toOwnedSessionBundle(config.baseUrl, dashboardAuth),
        )
      }
    }

    const responseData = isRecord(response.data)
      ? (response.data as NewApiLoginResponse)
      : undefined

    if (
      authBundleKind !== "valid" &&
      (responseData?.require_2fa || responseData?.require_verification)
    ) {
      // Unified login challenges use /login/verify with the advertised method.
      // https://github.com/QuantumNous/new-api/blob/main/controller/login_verification.go
      const unified = responseData.require_verification === true
      if (unified) {
        if (!trimToNull(responseData.flow_token))
          throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
        const verificationMethods = responseData.methods
        if (
          !Array.isArray(verificationMethods) ||
          !verificationMethods.every(
            (method) =>
              isRecord(method) &&
              typeof method.method === "string" &&
              typeof method.available === "boolean",
          )
        )
          throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
        if (
          !verificationMethods.some(
            (method) => method.method === "2fa" && method.available,
          )
        ) {
          sessionRuntime.clearPendingLoginFlow(config.baseUrl)
          if (
            verificationMethods.some(
              (method) => method.method === "passkey" && method.available,
            )
          )
            return {
              status: "passkey-manual-required",
              methods: { twoFactorEnabled: false, passkeyEnabled: true },
            }
          throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
        }
      }
      // Modern New API returns a flow token; its absence is the legacy contract.
      // https://github.com/QuantumNous/new-api/commit/31d70fca393ff2e09bbae012af2e3ccefdd389a1
      const flowToken = trimToNull(responseData.flow_token)
      if (flowToken) {
        sessionRuntime.storePendingLoginFlow(
          config.baseUrl,
          flowToken,
          responseData.expires_at,
          unified,
        )
      } else {
        sessionRuntime.clearPendingLoginFlow(config.baseUrl)
      }

      return {
        status: "login-2fa-required",
      }
    }

    sessionRuntime.clearPendingLoginFlow(config.baseUrl)
    if (authBundleKind === "unrelated") {
      sessionRuntime.markLoggedIn(config.baseUrl)
    }

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
    return sessionRuntime.runLogin(config.baseUrl, () =>
      postNewApiLogin(config),
    )
  }

  /**
   * Runs the secure-verification request that unlocks hidden channel-key reads.
   */
  async function verifyNewApiSession(
    config: Pick<NewApiConfig, "baseUrl" | "userId"> & { channelId?: number },
    params: {
      method: "2fa"
      code: string
    },
  ): Promise<VerifyNewApiSessionResult> {
    return sessionRuntime.runVerification(
      config.baseUrl,
      config.channelId,
      async () => {
        const request = createManagedSessionRequest(
          config.baseUrl,
          config.userId,
        )
        const usesDashboardAuth =
          request.auth.authType === AuthTypeEnum.AccessToken
        const requestParams = usesDashboardAuth
          ? {
              ...params,
              // New API stateless dashboard auth issues a proof scoped to the
              // sensitive channel-key read. Older Cookie-auth deployments do not
              // receive this field, preserving their original request contract.
              scope: NEW_API_SECURITY_PROOF_SCOPES.CHANNEL_KEY_READ,
              ...(config.channelId
                ? { context: { channel_id: config.channelId } }
                : {}),
            }
          : params
        let response: NewApiVerifyResponse
        try {
          response = await newApiFamilyRequests.data<NewApiVerifyResponse>(
            request,
            {
              endpoint: "/api/verify",
              options: {
                method: "POST",
                body: JSON.stringify(requestParams),
              },
            },
          )
        } catch (error) {
          throw sanitizeNewApiErrorForOrigin(error, config.baseUrl)
        }

        const proofToken = trimToNull(response?.proof_token)
        const verifiedUntil = toVerifiedUntilTimestamp(response?.expires_at)
        sessionRuntime.markVerified(
          config.baseUrl,
          verifiedUntil,
          usesDashboardAuth && proofToken
            ? {
                token: proofToken,
                expiresAt: verifiedUntil,
                ...(config.channelId ? { channelId: config.channelId } : {}),
              }
            : undefined,
        )

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
      },
    )
  }
  /** Accepts login 2FA and its owned authentication bundle before probing verification methods. */
  async function submitLoginTwoFactorCode(
    config: Pick<NewApiConfig, "baseUrl" | "userId">,
    code: string,
  ): Promise<NewApiVerificationMethods> {
    const trimmedCode = code.trim()
    const pendingLoginFlow = sessionRuntime.getPendingLoginFlowForSubmission(
      config.baseUrl,
    )

    const request = createCookieAuthRequest(config.baseUrl, config.userId)
    const response = await newApiFamilyRequests.envelope<unknown>(request, {
      endpoint: pendingLoginFlow?.unified
        ? "/api/user/login/verify"
        : "/api/user/login/2fa",
      options: {
        method: "POST",
        body: JSON.stringify({
          code: trimmedCode,
          ...(pendingLoginFlow?.unified ? { method: "2fa" } : {}),
          ...(pendingLoginFlow ? { flow_token: pendingLoginFlow.token } : {}),
        }),
      },
    })

    if (!isRecord(response)) {
      throw new ApiError(
        t("messages:errors.api.invalidResponseFormat"),
        undefined,
        "/api/user/login/2fa",
        API_ERROR_CODES.JSON_PARSE_ERROR,
      )
    }

    if (response.success === false) {
      throw new ApiError(
        sanitizeNewApiSessionError(
          trimToNull(response.message) ??
            t("messages:errors.api.invalidResponseFormat"),
          [
            trimmedCode,
            ...sessionRuntime.getTransientSessionSecrets(config.baseUrl),
          ],
        ),
        undefined,
        "/api/user/login/2fa",
      )
    }

    const authBundleKind = applyDashboardAuthBundleResponse(
      config.baseUrl,
      response,
    )
    if (authBundleKind === "malformed") {
      throw new Error(NEW_API_DASHBOARD_AUTH_INVALID_RESPONSE)
    }
    if (authBundleKind === "valid") {
      const dashboardAuth = sessionRuntime.getActiveDashboardAuth(
        config.baseUrl,
      )
      if (dashboardAuth) {
        await captureNewApiOwnedSession(
          toOwnedSessionBundle(config.baseUrl, dashboardAuth),
        )
      }
    }

    if (authBundleKind === "unrelated") {
      // A partially upgraded fork may accept flow_token but still keep the
      // legacy Cookie-auth success body; retain that compatibility path.
      sessionRuntime.clearPendingLoginFlow(config.baseUrl)
      sessionRuntime.markLoggedIn(config.baseUrl)
    }

    const methods = (await readNewApiVerificationMethods(
      config.baseUrl,
      config.userId,
    )) ?? {
      twoFactorEnabled: false,
      passkeyEnabled: false,
    }

    return methods
  }
  return {
    createManagedSessionRequest,
    readNewApiVerificationMethodsWithRefresh,
    ensureNewApiLoginSession,
    verifyNewApiSession,
    sanitizeNewApiErrorForOrigin,
    isUnauthorizedError,
    isSecureVerificationError,
    submitLoginTwoFactorCode,
  }
}
