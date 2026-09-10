import { createMessageEnvelopeResponseErrorDecoder } from "~/services/apiService/common/responseError"

/**
 * Owns DoneHub's channel-management `{ success, message }` failure envelope.
 * https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/common/gin.go#L211-L216
 * https://github.com/deanxv/done-hub/blob/1c09e7d75dc170a53d47af1e88c498816a5b85fb/middleware/auth.go#L15-L98
 */
export const decodeDoneHubResponseError =
  createMessageEnvelopeResponseErrorDecoder({
    isBusinessEnvelope: (body) => body.success === false,
  })
