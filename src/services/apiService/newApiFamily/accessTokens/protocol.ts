export const NEW_API_TOKEN_VERIFICATION_METHODS = {
  PASSWORD: "password",
  TWO_FACTOR: "2fa",
  PASSKEY: "passkey",
  OAUTH: "oauth",
} as const

export const NEW_API_TOKEN_OPERATION_SCOPES = {
  GENERATE: "access_token.generate",
  REVOKE: "access_token.revoke",
} as const

export const NEW_API_TOKEN_ENDPOINTS = {
  SELF: "/api/user/self",
  ACCESS_TOKENS: "/api/user/access_tokens",
  CATALOG: "/api/user/access_tokens/catalog",
  VERIFICATION_METHODS: "/api/verify/methods",
  VERIFY: "/api/verify",
  PASSKEY_BEGIN: "/api/user/passkey/verify/begin",
  PASSKEY_FINISH: "/api/user/passkey/verify/finish",
  OAUTH_STATE: "/api/oauth/state",
  STATUS: "/api/status",
} as const

export const NEW_API_TOKEN_NAME_MAX_LENGTH = 64

export const NEW_API_TOKEN_ACCESS_SCOPES = {
  PROFILE_READ: "profile:read",
  PROFILE_WRITE: "profile:write",
  API_KEY_READ: "api_key:read",
  API_KEY_WRITE: "api_key:write",
  API_KEY_REVEAL: "api_key:reveal",
  USAGE_READ: "usage:read",
  WALLET_READ: "wallet:read",
  WALLET_WRITE: "wallet:write",
  SECURITY_READ: "account_security:read",
  SECURITY_WRITE: "account_security:write",
} as const

export const NEW_API_TOKEN_CREATION_ERRORS = {
  BUSY: "ACCESS_TOKEN_CREATION_BUSY",
  INVALID_PROOF: "SECURITY_PROOF_INVALID",
  UNCERTAIN: "ACCESS_TOKEN_CREATION_UNCERTAIN",
  GRANT_MISMATCH: "ACCESS_TOKEN_GRANT_MISMATCH",
  NOT_CREATED: "ACCESS_TOKEN_NOT_CREATED",
  PROFILE_REQUIRED: "ACCESS_TOKEN_PROFILE_REQUIRED",
  EXPIRY_INVALID: "ACCESS_TOKEN_EXPIRY_INVALID",
  SCOPE_FORBIDDEN: "ACCESS_TOKEN_SCOPE_FORBIDDEN",
  REVOKE_UNCONFIRMED: "ACCESS_TOKEN_REVOKE_UNCONFIRMED",
  LIMIT: "ACCESS_TOKEN_LIMIT",
} as const

export const NEW_API_TOKEN_VALIDATION_STATUSES = {
  VALID: "valid",
  INVALID: "invalid",
  IDENTITY_MISMATCH: "identity_mismatch",
  UNAVAILABLE: "unavailable",
} as const

export const NEW_API_TOKEN_VERIFICATION_ERRORS = {
  INVALID_CONTEXT: "INVALID_TOKEN_CONTEXT",
  METHOD_UNAVAILABLE: "SECURITY_METHOD_UNAVAILABLE",
  FLOW_REQUIRED: "SECURITY_VERIFICATION_FLOW_REQUIRED",
  LOCKED: "SECURITY_VERIFICATION_LOCKED",
  OAUTH_ACCOUNT_MISMATCH: "OAUTH_ACCOUNT_MISMATCH",
  OAUTH_CANCELLED: "OAUTH_CANCELLED",
  OAUTH_STATE_INVALID: "OAUTH_STATE_INVALID",
  OAUTH_TIMEOUT: "OAUTH_TIMEOUT",
  PASSKEY_CANCELLED: "PASSKEY_CANCELLED",
} as const
