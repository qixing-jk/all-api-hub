import { createMessageEnvelopeResponseErrorDecoder } from "~/services/apiService/common/responseError"

const NEW_API_ERROR_TYPE = "new_api_error"

const isFailedBusinessEnvelope = (body: Record<string, unknown>): boolean => {
  if (body.success === false) return true
  const code = body.code
  return (
    (typeof code === "number" && code !== 0) ||
    (typeof code === "string" && code.trim() !== "" && code.trim() !== "0")
  )
}

/**
 * Interprets New API's `{ success, message }` and nested `new_api_error`
 * envelopes before transport fallback.
 * https://github.com/QuantumNous/new-api/blob/32c261923a9786c64d2af087327ef057e7bde7e3/common/gin.go#L199-L228
 * https://github.com/QuantumNous/new-api/blob/32c261923a9786c64d2af087327ef057e7bde7e3/middleware/utils.go#L14-L37
 */
export const decodeNewApiResponseError =
  createMessageEnvelopeResponseErrorDecoder({
    isBusinessEnvelope: isFailedBusinessEnvelope,
    captureBusinessCode: true,
    standaloneHttpMessage: true,
    nestedError: {
      type: NEW_API_ERROR_TYPE,
      kind: "business",
      captureCode: true,
    },
  })
