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
}): BrowserOAuthFlow<undefined> {
  return {
    id: "sub2api-" + input.provider,
    concurrencyKey: "sub2api-session",
    displayName: "Sub2API",
    loginPath: input.loginPath,
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
      if (response.reason === "interaction_required") {
        return {
          status: "interaction_required",
          message: "Sub2API requires interactive verification before OAuth.",
        }
      }
      if (response.reason === "unsupported") return { status: "unsupported" }
      if (response.reason === "uncertain") {
        return {
          status: "uncertain",
          message: "The Sub2API logout response could not be confirmed.",
        }
      }
      return null
    },
    parseCompletion(response) {
      if (!isRecord(response)) return { status: "invalid" }
      if (response.reason === "identity_mismatch") {
        return { status: "identity_mismatch" }
      }
      if (response.reason === "interaction_required") {
        return { status: "interaction_required" }
      }
      const identity = normalizeSub2ApiLoginIdentity(response.identity)
      return response.success === true && identity
        ? { status: "verified", identity, evidence: undefined }
        : { status: "invalid" }
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
