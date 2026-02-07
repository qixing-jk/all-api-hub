/**
 * Sub2API DTOs.
 *
 * Sub2API frontends commonly wrap responses in an envelope:
 * `{ code, message, data }`.
 *
 * For authenticated user/balance, we rely on:
 * - GET `/api/v1/auth/me`
 * - Authorization: Bearer <jwt>
 */

export type Sub2ApiEnvelope<T> = {
  /**
   * Sub2API response code (0 indicates success; non-zero indicates a business error).
   */
  code: number
  /**
   * Sub2API response message.
   */
  message: string
  data?: T
}

/**
 * User payload returned under `data` for Sub2API `/api/v1/auth/me`.
 *
 * Fields beyond these are intentionally omitted so we don't couple to
 * deployment-specific schemas.
 */
export type Sub2ApiAuthMeData = {
  id: number | string
  /**
   * Sub2API deployments sometimes return an empty username (""), or omit it.
   * Treat it as optional; UI display name may fall back to email local-part.
   */
  username?: string | null
  /**
   * Email can be used as a display-name fallback when username is empty.
   */
  email?: string | null
  /**
   * Remaining balance in USD.
   */
  balance?: number | string | null
}

export type Sub2ApiAuthMeResponse = Sub2ApiEnvelope<Sub2ApiAuthMeData>
