import { identifyProvider } from "~/services/models/utils/modelProviders"

import { API_TYPES, type ApiVerificationApiType } from "./types"

export interface VerificationApiTypeContext {
  apiType?: ApiVerificationApiType
  supportedEndpointTypes?: string[]
}

/** Read protocol facts without guessing from a model name. */
export function getDeclaredVerificationApiType(
  supportedEndpointTypes?: string[],
): ApiVerificationApiType | undefined {
  const endpoints =
    supportedEndpointTypes?.map((value) => value.trim().toLowerCase()) ?? []
  if (
    endpoints.some(
      (value) =>
        /^(?:openai(?:-compatible)?|chat|embeddings?|rerank|images?|video|decisions?)$/.test(
          value,
        ) ||
        /\/(?:chat\/completions|embeddings|rerank|images\/generations|video\/generations|decisions)$/.test(
          value,
        ),
    )
  )
    return API_TYPES.OPENAI_COMPATIBLE
  if (
    endpoints.some(
      (value) =>
        value === "responses" ||
        value === "openai-response" ||
        /\/responses$/.test(value),
    )
  )
    return API_TYPES.OPENAI
  if (
    endpoints.some(
      (value) => value === "anthropic" || /\/messages$/.test(value),
    )
  )
    return API_TYPES.ANTHROPIC
  if (
    endpoints.some(
      (value) =>
        value === "gemini" ||
        value === API_TYPES.GOOGLE ||
        /:(?:generatecontent|embedcontent|batchembedcontents|predict|predictlongrunning)$/.test(
          value,
        ),
    )
  )
    return API_TYPES.GOOGLE

  return undefined
}

/** Use configured protocols and published endpoints before model-name fallbacks. */
export function resolveVerificationApiType({
  apiType,
  supportedEndpointTypes,
  modelId,
}: VerificationApiTypeContext & { modelId: string }): ApiVerificationApiType {
  if (apiType) return apiType
  const declared = getDeclaredVerificationApiType(supportedEndpointTypes)
  if (declared) return declared

  const provider = identifyProvider(modelId)
  if (provider === "Claude") return API_TYPES.ANTHROPIC
  if (provider === "Gemini") return API_TYPES.GOOGLE
  return API_TYPES.OPENAI_COMPATIBLE
}
