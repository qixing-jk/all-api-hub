import {
  BROWSER_LOGIN_FAILURE_REASONS,
  BROWSER_LOGIN_SESSION_KEYS,
  BROWSER_LOGIN_STATUS,
} from "~/constants/browserLogin"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { TURNSTILE_MANUAL_WAIT_MS } from "~/constants/turnstile"
import type {
  AccountLoginCredential,
  AccountLoginRequest,
  AccountLoginResult,
} from "~/services/apiAdapters/contracts/accountLogin"
import { fetchSub2ApiPublicSettings } from "~/services/apiService/sub2api/account/publicSettings"
import {
  discoverSub2ApiPanelProof,
  hasSub2ApiPanelProof,
} from "~/services/apiService/sub2api/auth/panelProofCapability"
import { requiresSub2ApiPasswordVerification } from "~/services/apiService/sub2api/auth/passwordSettings"
import { normalizeSub2ApiLoginIdentity } from "~/services/apiService/sub2api/oauth/protocol"
import {
  SUB2API_AUTH_LOGIN_ENDPOINT,
  SUB2API_AUTH_ME_ENDPOINT,
} from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  API_DIRECT_REQUEST_REASONS,
  type ApiTransportResponse,
} from "~/services/apiTransport/type"
import { createBrowserLoginContext } from "~/services/browserLogin/browserLogin"
import { AuthTypeEnum } from "~/types"
import type { AccountPasswordCredentials } from "~/types/accountLogin"
import {
  TEMP_WINDOW_TURNSTILE_STATUSES,
  type TempWindowTurnstileStatus,
} from "~/types/tempWindowFetch"
import { isRecord } from "~/utils/core/object"
import { trimToNull } from "~/utils/core/string"
import { t } from "~/utils/i18n/core"

import { discardSub2ApiLoginCredential } from "./credentialCleanup"
import {
  fetchSub2ApiLocalPasswordVerification,
  Sub2ApiPasswordVerificationError,
} from "./passwordVerification"

/** Requires both HTTP success and a successful Sub2API envelope. */
function readSuccessfulAuthData(response: ApiTransportResponse<unknown>) {
  const body = response.body
  if (response.ok && isRecord(body) && body.code === 0 && isRecord(body.data))
    return body.data
}

/** No browser session is opened or replaced; the issued credential belongs to the extension. */
export async function loginSub2ApiBackgroundPassword(
  request: AccountLoginRequest,
  credentials: AccountPasswordCredentials,
  turnstileToken?: string,
  dispatchObservation = { submitted: false },
): Promise<AccountLoginResult | null> {
  const transport = {
    siteType: SITE_TYPES.SUB2API,
    baseUrl: request.account.site_url,
    auth: { authType: AuthTypeEnum.None },
    directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
    abortSignal: request.abortSignal,
  } as const
  const expectedIdentity = normalizeSub2ApiLoginIdentity(
    request.account.account_info.id,
  )
  let submitted = false
  let issuedCredential: AccountLoginCredential | undefined
  let accepted = false
  let verificationToken = turnstileToken
  let hasPanelProof = false
  const execute = async (): Promise<AccountLoginResult | null> => {
    try {
      hasPanelProof = await hasSub2ApiPanelProof(transport.baseUrl)
      const settings = await fetchSub2ApiPublicSettings(transport)
      if (!settings) return null
      // First acquisition may have no JWT hint. Only an explicit middleware
      // response to a credential-free probe can opt the origin into signing.
      if (!hasPanelProof) {
        hasPanelProof = await discoverSub2ApiPanelProof(
          transport.baseUrl,
          request.abortSignal,
        )
      }
      const usesOnlyTurnstile =
        settings.turnstile_enabled === true &&
        settings.tencent_captcha_enabled !== true &&
        settings.aliyun_captcha_enabled !== true
      if (!verificationToken && usesOnlyTurnstile)
        verificationToken =
          (await fetchSub2ApiLocalPasswordVerification(transport)) ?? undefined
      // Local verification and request signing are independent opt-ins. An
      // unmatched deployment retains its native flow before credential dispatch.
      if (!hasPanelProof && !verificationToken) return null
      if (requiresSub2ApiPasswordVerification(settings) && !verificationToken) {
        if (request.attended === false)
          return {
            status: BROWSER_LOGIN_STATUS.InteractionRequired,
            reason: BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
          }
        if (usesOnlyTurnstile) {
          let captured: AccountLoginCredential | null = null
          const result = await createBrowserLoginContext({
            id: "sub2api-background-password-verification",
            concurrencyKey: BROWSER_LOGIN_SESSION_KEYS.Sub2Api,
            displayName: "Sub2API",
            loginPath: "/login",
            preferIncognito: true,
            clearEvidenceAction:
              RuntimeActionIds.ContentClearSub2ApiPasswordLogin,
            captureCredential: async () => captured,
            async execute(session) {
              await session.assertOrigin()
              const verification = await session.sendSiteAction<{
                success?: boolean
                status?: TempWindowTurnstileStatus
                token?: string
              }>(RuntimeActionIds.ContentWaitForTurnstileToken, {
                requestId: request.requestId,
                timeoutMs: TURNSTILE_MANUAL_WAIT_MS,
                expectTurnstile: true,
              })
              if (
                verification.success !== true ||
                verification.status !==
                  TEMP_WINDOW_TURNSTILE_STATUSES.TokenObtained ||
                !verification.token
              )
                return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
              await session.assertOrigin()
              const result = await loginSub2ApiBackgroundPassword(
                {
                  ...request,
                  abortSignal: session.abortSignal ?? request.abortSignal,
                },
                credentials,
                verification.token,
                dispatchObservation,
              )
              if (!result) return { status: BROWSER_LOGIN_STATUS.Failed }
              if (result.status === BROWSER_LOGIN_STATUS.Authenticated) {
                captured = result.credential ?? null
                issuedCredential = result.credential
                return { ...result, evidence: { credentialIssued: true } }
              }
              return result
            },
          }).authenticate({
            origin: new URL(request.account.site_url).origin,
            expectedIdentity: expectedIdentity ?? undefined,
            requestId: request.requestId,
            captureCredential: true,
            attended: true,
            abortSignal: request.abortSignal,
          })
          accepted = result.status === BROWSER_LOGIN_STATUS.Authenticated
          if (
            result.status === BROWSER_LOGIN_STATUS.Cancelled &&
            dispatchObservation.submitted &&
            !issuedCredential
          )
            return { status: BROWSER_LOGIN_STATUS.Uncertain }
          return result
        }
        return null
      }
      request.abortSignal?.throwIfAborted()
      const response = await fetchApiResponse(
        {
          ...transport,
          observer: {
            onDispatch: () => {
              submitted = true
              dispatchObservation.submitted = true
            },
            onResponse: () => {},
          },
        },
        {
          endpoint: SUB2API_AUTH_LOGIN_ENDPOINT,
          options: {
            method: "POST",
            body: JSON.stringify({
              email: credentials.username,
              password: credentials.password,
              ...(verificationToken
                ? { turnstile_token: verificationToken }
                : {}),
            }),
            credentials: "omit",
            redirect: "error",
          },
        },
      )
      const data = readSuccessfulAuthData(response)
      if (!data)
        return {
          status:
            response.status >= 500
              ? BROWSER_LOGIN_STATUS.Uncertain
              : BROWSER_LOGIN_STATUS.Failed,
        }
      const accessToken = trimToNull(data.access_token)
      const refreshToken = trimToNull(data.refresh_token)
      if (accessToken && refreshToken)
        issuedCredential = {
          accessToken,
          sub2apiAuth: { refreshToken },
        }
      if (data.requires_2fa === true)
        return {
          status: BROWSER_LOGIN_STATUS.InteractionRequired,
          reason: BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
          message: t("messages:errors.api.browserProofSecondFactorRequired"),
        }
      if (
        !accessToken ||
        !refreshToken ||
        typeof data.expires_in !== "number" ||
        !Number.isFinite(data.expires_in) ||
        data.expires_in <= 0 ||
        !isRecord(data.user)
      )
        return { status: BROWSER_LOGIN_STATUS.Uncertain }
      const identity = normalizeSub2ApiLoginIdentity(data.user.id)
      if (identity !== expectedIdentity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      const credential = {
        accessToken,
        sub2apiAuth: {
          refreshToken,
          tokenExpiresAt: Date.now() + data.expires_in * 1000,
        },
      }
      const self = await fetchApiResponse(
        {
          ...transport,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: credential.accessToken,
          },
        },
        {
          endpoint: SUB2API_AUTH_ME_ENDPOINT,
          options: { credentials: "omit", redirect: "error" },
        },
      )
      const selfData = readSuccessfulAuthData(self)
      if (!selfData) return { status: BROWSER_LOGIN_STATUS.Uncertain }
      if (normalizeSub2ApiLoginIdentity(selfData.id) !== expectedIdentity)
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      accepted = true
      return {
        status: BROWSER_LOGIN_STATUS.Authenticated,
        identity: expectedIdentity!,
        credential,
        evidence: { credentialIssued: true },
      }
    } catch (error) {
      hasPanelProof ||= await hasSub2ApiPanelProof(transport.baseUrl)
      if (error instanceof Sub2ApiPasswordVerificationError)
        return {
          status: BROWSER_LOGIN_STATUS.InteractionRequired,
          reason: BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
          message: error.message,
        }
      if (
        !submitted &&
        error instanceof ApiError &&
        error.code === API_ERROR_CODES.ROBOT_CHALLENGE
      ) {
        if (hasPanelProof)
          return {
            status: BROWSER_LOGIN_STATUS.InteractionRequired,
            reason: BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
            message: error.message,
          }
        return null
      }
      if (
        error instanceof ApiError &&
        error.code === API_ERROR_CODES.REQUEST_PROOF_INVALID
      )
        return { status: BROWSER_LOGIN_STATUS.Failed, message: error.message }
      if (request.abortSignal?.aborted)
        return {
          status:
            submitted && !issuedCredential
              ? BROWSER_LOGIN_STATUS.Uncertain
              : BROWSER_LOGIN_STATUS.Cancelled,
        }
      // Optional discovery cannot block an unmatched site's native login.
      if (!submitted && !hasPanelProof) return null
      return {
        status: submitted
          ? BROWSER_LOGIN_STATUS.Uncertain
          : BROWSER_LOGIN_STATUS.Failed,
      }
    }
  }
  const result = await execute()
  if (issuedCredential && !accepted) {
    try {
      await discardSub2ApiLoginCredential(transport.baseUrl, issuedCredential)
    } catch {
      return {
        status: BROWSER_LOGIN_STATUS.Uncertain,
        message: t("messages:errors.api.browserLoginCleanupUnconfirmed"),
      }
    }
  }
  return result
}
