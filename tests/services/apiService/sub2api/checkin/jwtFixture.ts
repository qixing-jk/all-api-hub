/** The JWT middleware rejects an expired token before entering the check-in handler. */
export const expiredCheckInJwt = {
  code: "TOKEN_EXPIRED",
  message: "Token has expired",
}
