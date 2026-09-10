import { createMessageEnvelopeResponseErrorDecoder } from "~/services/apiService/common/responseError"

/**
 * Owns AIHubMix's documented `{ success, message, data }` failure envelope.
 * https://docs.aihubmix.com/en/api/CliEndpoints/get-self
 */
export const decodeAIHubMixResponseError =
  createMessageEnvelopeResponseErrorDecoder({
    isBusinessEnvelope: (body) => body.success === false,
  })
