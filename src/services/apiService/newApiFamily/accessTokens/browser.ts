import { RuntimeActionIds } from "~/constants/runtimeActions"
import { API_OPERATION_SEMANTICS } from "~/services/apiTransport/type"
import { assertSiteTabOrigin } from "~/services/browsingContext/siteTabRecovery"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { focusTab } from "~/utils/browser/tabs"

import type { NewApiTokenInteraction, NewApiTokenProof } from "./creation"
import {
  NEW_API_TOKEN_ENDPOINTS as ENDPOINTS,
  NEW_API_TOKEN_VERIFICATION_METHODS as METHODS,
  NEW_API_TOKEN_VERIFICATION_ERRORS as VERIFICATION_ERRORS,
} from "./protocol"
import { tokenSessionRequest } from "./sessionRequest"

/** Runs site-bound security verification while the extension retains the token draft. */
export function createNewApiTokenInteraction(
  tabId: number,
  origin: string,
): NewApiTokenInteraction {
  return {
    async verify(input, operation, request) {
      await assertSiteTabOrigin(tabId, origin)
      if (input.method === METHODS.OAUTH) {
        const { verifyNewApiTokenOAuth } = await import("./oauthBrowser")
        return verifyNewApiTokenOAuth(
          tabId,
          origin,
          input.provider,
          operation,
          request,
        )
      }
      const challenge = await tokenSessionRequest<{
        flow_token: string
        options: unknown
      }>(request, {
        endpoint: ENDPOINTS.PASSKEY_BEGIN,
        operationSemantics: API_OPERATION_SEMANTICS.Mutation,
        options: {
          method: "POST",
          body: JSON.stringify({
            ...operation,
            ...(input.rpId ? { rp_id: input.rpId } : {}),
          }),
        },
      })
      if (!challenge.flow_token || !challenge.options)
        throw new Error("PASSKEY_CHALLENGE_INVALID")
      const tab = await assertSiteTabOrigin(tabId, origin)
      await focusTab(tab)
      const requestId = crypto.randomUUID()
      const assertion = await sendTabMessageWithRetry<{
        success: boolean
        data: unknown
      }>(
        tabId,
        {
          action: RuntimeActionIds.ContentNewApiTokenPasskey,
          expectedOrigin: origin,
          requestId,
          options: challenge.options,
        },
        { maxAttempts: 1, frameId: 0, abortSignal: request.abortSignal },
      ).finally(async () => {
        await sendTabMessageWithRetry(
          tabId,
          {
            action: RuntimeActionIds.ContentCancelNewApiTokenPasskey,
            expectedOrigin: origin,
            requestId,
          },
          { maxAttempts: 1, frameId: 0 },
        ).catch(() => undefined)
      })
      if (!assertion?.success) throw new Error("PASSKEY_VERIFICATION_FAILED")
      if (assertion.data === null)
        throw new Error(VERIFICATION_ERRORS.PASSKEY_CANCELLED)
      await assertSiteTabOrigin(tabId, origin)
      return tokenSessionRequest<NewApiTokenProof>(request, {
        endpoint: ENDPOINTS.PASSKEY_FINISH,
        operationSemantics: API_OPERATION_SEMANTICS.Mutation,
        options: {
          method: "POST",
          body: JSON.stringify({
            flow_token: challenge.flow_token,
            credential: assertion.data,
          }),
        },
      })
    },
  }
}
