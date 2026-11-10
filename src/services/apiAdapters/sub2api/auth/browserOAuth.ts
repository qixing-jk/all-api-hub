import {
  BROWSER_LOGIN_SESSION_KEYS,
  BROWSER_LOGIN_STATUS,
} from "~/constants/browserLogin"
import {
  BROWSER_OAUTH_COMPLETION_STATUS,
  BROWSER_OAUTH_CONTENT_FAILURE_REASONS,
  BROWSER_OAUTH_REQUEST_FAILURE_REASONS,
} from "~/constants/browserOAuth"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  buildSub2ApiOAuthStartUrl,
  isSub2ApiOAuthCompletionUrl,
  normalizeSub2ApiLoginIdentity,
  type Sub2ApiOAuthProvider,
} from "~/services/apiService/sub2api/oauth/protocol"
import type { BrowserOAuthFlow } from "~/services/browserOAuth/browserOAuth"
import { isRecord } from "~/utils/core/object"

/** Sub2API owns its routes, response envelope and website Bearer session. */
export function createSub2ApiOAuthFlow(input: {
  provider: Sub2ApiOAuthProvider
  origin: string
  requestId: string
  loginPath: string
  captureCredential?: BrowserOAuthFlow<undefined>["captureCredential"]
}): BrowserOAuthFlow<undefined> {
  return {
    id: "sub2api-" + input.provider,
    concurrencyKey: BROWSER_LOGIN_SESSION_KEYS.Sub2Api,
    displayName: "Sub2API",
    loginPath: input.loginPath,
    captureCredential: input.captureCredential,
    prepareAction: RuntimeActionIds.ContentPrepareSub2ApiOAuth,
    prepareDetails: { loginProvider: input.provider },
    completeAction: RuntimeActionIds.ContentCompleteSub2ApiOAuth,
    clearEvidenceAction: RuntimeActionIds.ContentClearSub2ApiOAuthEvidence,
    parsePreparation(response) {
      if (!isRecord(response)) return null
      if (response.success === true) {
        return typeof response.authorizationUrl === "string"
          ? { authorizationUrl: response.authorizationUrl }
          : null
      }
      if (
        response.reason ===
        BROWSER_OAUTH_CONTENT_FAILURE_REASONS.InteractionRequired
      ) {
        return {
          status: BROWSER_LOGIN_STATUS.InteractionRequired,
          message: "Sub2API requires interactive verification before OAuth.",
        }
      }
      if (response.reason === BROWSER_OAUTH_CONTENT_FAILURE_REASONS.Unsupported)
        return { status: BROWSER_LOGIN_STATUS.Unsupported }
      if (response.reason === BROWSER_OAUTH_REQUEST_FAILURE_REASONS.Uncertain) {
        return {
          status: BROWSER_LOGIN_STATUS.Uncertain,
          message: "The Sub2API logout response could not be confirmed.",
        }
      }
      return null
    },
    parseCompletion(response) {
      if (!isRecord(response))
        return { status: BROWSER_OAUTH_COMPLETION_STATUS.Invalid }
      if (
        response.reason ===
        BROWSER_OAUTH_CONTENT_FAILURE_REASONS.IdentityMismatch
      ) {
        return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
      }
      if (
        response.reason ===
        BROWSER_OAUTH_CONTENT_FAILURE_REASONS.InteractionRequired
      ) {
        return { status: BROWSER_LOGIN_STATUS.InteractionRequired }
      }
      const identity = normalizeSub2ApiLoginIdentity(response.identity)
      return response.success === true && identity
        ? {
            status: BROWSER_OAUTH_COMPLETION_STATUS.Verified,
            identity,
            evidence: undefined,
          }
        : { status: BROWSER_OAUTH_COMPLETION_STATUS.Invalid }
    },
    isAuthorizationUrl(url) {
      // Only navigate to the site's selected backend start route. The backend
      // owns the subsequent IdP redirect, so no client ID/state is fabricated here.
      return (
        url.href ===
        buildSub2ApiOAuthStartUrl(input.origin, input.provider, input.requestId)
      )
    },
    isCompletionUrl(url, origin) {
      return (
        origin === input.origin &&
        isSub2ApiOAuthCompletionUrl(url, origin, input.requestId)
      )
    },
  }
}
