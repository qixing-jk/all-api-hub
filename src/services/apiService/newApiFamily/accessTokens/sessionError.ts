export const NEW_API_TOKEN_SESSION_ERRORS = {
  IDENTITY_MISMATCH: "ACCOUNT_IDENTITY_MISMATCH",
  UNSUPPORTED: "SCOPED_TOKEN_UNSUPPORTED",
  UNAVAILABLE: "AUTH_SESSION_UNAVAILABLE",
  RELOAD_REQUIRED: "TAB_RELOAD_REQUIRED",
} as const

const contentErrorCodes = [
  NEW_API_TOKEN_SESSION_ERRORS.IDENTITY_MISMATCH,
  NEW_API_TOKEN_SESSION_ERRORS.UNSUPPORTED,
  NEW_API_TOKEN_SESSION_ERRORS.UNAVAILABLE,
] as const

type TokenSessionContentErrorCode = (typeof contentErrorCodes)[number]
type TokenSessionErrorCode =
  | TokenSessionContentErrorCode
  | typeof NEW_API_TOKEN_SESSION_ERRORS.RELOAD_REQUIRED

/** Accept only the codes the content session handler is allowed to return. */
export function isTokenSessionContentErrorCode(
  code: unknown,
): code is TokenSessionContentErrorCode {
  return contentErrorCodes.some((known) => known === code)
}

/** A session failure with only the recovery data needed by the dialog. */
export class NewApiTokenSessionError extends Error {
  constructor(
    readonly code: TokenSessionErrorCode,
    readonly tabId?: number,
  ) {
    super(code)
    this.name = "NewApiTokenSessionError"
  }
}
