import type {
  ContextCapacityHistoryAccess,
  ContextHistoryRequest,
} from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import { CONTEXT_HISTORY_ACTIONS } from "~/services/verification/webAiApiCheck/constants"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

/** Send only request identity fields, excluding React helpers and redaction lists. */
function publicRequest(request: ContextHistoryRequest): ContextHistoryRequest {
  const {
    apiType,
    baseUrl,
    apiKey,
    modelId,
    mode,
    requestProfile,
    requestProfileEnhanced,
  } = request
  return {
    apiType,
    baseUrl,
    apiKey,
    modelId,
    mode,
    requestProfile,
    requestProfileEnhanced,
  }
}

/** Webpages never need storage access or WebCrypto to restore a capacity result. */
export const contextHistoryInBackground: ContextCapacityHistoryAccess = {
  async get(request) {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ContextHistory,
      { request: publicRequest(request), action: CONTEXT_HISTORY_ACTIONS.Get },
    )
    if (!response.success) throw new Error("Context history unavailable")
    return response.summary
  },
  async save(request, result) {
    const response = await sendWebAiApiCheckMessage(
      WebAiApiCheckMessageTypes.ContextHistory,
      {
        request: publicRequest(request),
        action: CONTEXT_HISTORY_ACTIONS.Save,
        result,
      },
    )
    if (!response.success || !response.summary)
      throw new Error("Context history unavailable")
    return response.summary
  },
}
