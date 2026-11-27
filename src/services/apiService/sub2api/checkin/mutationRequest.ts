import { SUB2API_SESSION_BINDING_MISMATCH_CODE } from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

// These codes abort before c.Next() in the native JWT middleware.
// https://github.com/Wei-Shaw/sub2api/blob/b1748c4ea99ce2120401a269142aa071e18a84da/backend/internal/server/middleware/jwt_auth.go#L37-L100
const jwtRejectionCodes = new Set([
  "UNAUTHORIZED",
  "INVALID_AUTH_HEADER",
  "EMPTY_TOKEN",
  "TOKEN_EXPIRED",
  "INVALID_TOKEN",
  "USER_NOT_FOUND",
  "USER_INACTIVE",
  "TOKEN_REVOKED",
])

/** Only the primary middleware code can authorize recovery; grant data makes the reply ambiguous. */
function readAuthRejection(
  body: unknown,
  isNativeLoginRejection?: (envelope: Record<string, unknown>) => boolean,
) {
  if (!isRecord(body)) return
  const { code } = body
  const message =
    typeof body.message === "string" ? body.message.trim() : undefined
  if (
    code === SUB2API_SESSION_BINDING_MISMATCH_CODE &&
    Object.keys(body).every(
      (key) => key === "code" || key === "message" || key === "reason",
    )
  )
    return { code, message }
  if (
    typeof code === "string" &&
    message &&
    ((jwtRejectionCodes.has(code) && Object.keys(body).length === 2) ||
      isNativeLoginRejection?.(body))
  )
    return { code, message }
}

/** A check-in POST can be recovered only when its response identifies a pre-handler rejection. */
export async function postSub2ApiCheckIn<T = unknown>(
  request: ApiServiceRequest,
  endpoint: string,
  {
    responseType,
    isNativeLoginRejection,
    ...init
  }: {
    responseType?: "text"
    body?: string
    headers?: HeadersInit
    dispatchDeadlineAt?: number
    isNativeLoginRejection?: (envelope: Record<string, unknown>) => boolean
  } = {},
): Promise<ApiTransportResponse<T>> {
  const unconfirmed = () =>
    new ApiError(
      "Unrecognized Sub2API check-in mutation response (HTTP 401)",
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  let response: ApiTransportResponse<T>
  try {
    response = await fetchApiResponse<T>(request, {
      endpoint,
      // A redirect can forward the POST or return a 401 from a different handler.
      options: {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        ...init,
      },
      ...(responseType ? { responseType } : {}),
    })
  } catch (error) {
    // A transport error has no provider envelope to establish who rejected the POST.
    if (error instanceof ApiError && error.statusCode === 401)
      throw unconfirmed()
    throw error
  }
  if (response.status !== 401) return response
  let body: unknown = response.body
  if (responseType === "text" && typeof body === "string") {
    try {
      body = JSON.parse(body)
    } catch {
      throw unconfirmed()
    }
  }
  const rejection = readAuthRejection(body, isNativeLoginRejection)
  if (!rejection) throw unconfirmed()
  throw new ApiError(
    rejection.message || "Sub2API check-in authentication required",
    401,
    endpoint,
    API_ERROR_CODES.HTTP_401,
    rejection.code,
  )
}
