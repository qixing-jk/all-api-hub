import { createMessageEnvelopeResponseErrorDecoder } from "~/services/apiService/common/responseError"

/**
 * Owns Veloera's channel-management `{ success, message }` failure envelope.
 * It also recognizes the provider's global nested panic response as HTTP failure.
 * https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/channel.go#L351-L452
 * https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/main.go#L159-L169
 */
export const decodeVeloeraResponseError =
  createMessageEnvelopeResponseErrorDecoder({
    isBusinessEnvelope: (body) => body.success === false,
    nestedError: {
      type: "veloera_panic",
      kind: "http",
    },
  })
