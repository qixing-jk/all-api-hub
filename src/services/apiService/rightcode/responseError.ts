import { createMessageEnvelopeResponseErrorDecoder } from "~/services/apiService/common/responseError"

/**
 * Owns Right Code's failure envelope.
 *
 * Failures are always carried by the HTTP status; the body is a flat
 * `{ timestamp, path, status, error, requestId, message }` record where
 * `message` holds the actionable text ("Invalid userToken", "Missing
 * userToken", ...). The console client treats `!response.ok` as the only
 * failure signal, so there is no separate business-envelope shape.
 */
export const decodeRightCodeResponseError =
  createMessageEnvelopeResponseErrorDecoder({
    isBusinessEnvelope: () => false,
    standaloneHttpMessage: true,
  })
