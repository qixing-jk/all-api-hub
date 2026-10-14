import type { NewApiConfig } from "~/types/newApiConfig"

export const NEW_API_VERIFIED_SESSION_WINDOW_MS = 5 * 60 * 1000

/**
 * Security-proof scopes introduced by New API's stateless dashboard auth.
 * https://github.com/QuantumNous/new-api/commit/31d70fca393ff2e09bbae012af2e3ccefdd389a1
 */
export const NEW_API_SECURITY_PROOF_SCOPES = {
  CHANNEL_KEY_READ: "channel.key.read",
} as const

export const NEW_API_MANAGED_SESSION_STATUSES = {
  VERIFIED: "verified",
  CREDENTIALS_MISSING: "credentials-missing",
  LOGIN_2FA_REQUIRED: "login-2fa-required",
  SECURE_VERIFICATION_REQUIRED: "secure-verification-required",
  PASSKEY_MANUAL_REQUIRED: "passkey-manual-required",
  SESSION_ACTIVE_LIMIT: "session-active-limit",
  SESSION_ISSUANCE_LIMIT: "session-issuance-limit",
} as const

export interface NewApiVerificationMethods {
  twoFactorEnabled: boolean
  passkeyEnabled: boolean
}

export const NEW_API_VERIFICATION_METHODS = {
  TwoFactor: "2fa",
} as const

export const NEW_API_LOGIN_STATUSES = {
  LoggedIn: "logged-in",
  TwoFactorRequired: "login-2fa-required",
  CredentialsMissing: "credentials-missing",
  PasskeyManualRequired: "passkey-manual-required",
} as const

export type EnsureNewApiManagedSessionResult =
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.VERIFIED
      methods: NewApiVerificationMethods
      verifiedUntil?: number
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED
      errorMessage?: string
      automaticAttempted: boolean
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED
      methods: NewApiVerificationMethods
      errorMessage?: string
      automaticAttempted: boolean
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED
      methods: NewApiVerificationMethods
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.SESSION_ACTIVE_LIMIT
      cleanupAvailable: boolean
    }
  | {
      status: typeof NEW_API_MANAGED_SESSION_STATUSES.SESSION_ISSUANCE_LIMIT
    }

export const NEW_API_CHANNEL_KEY_ERROR_KINDS = {
  LOGIN_REQUIRED: "login-required",
  SECURE_VERIFICATION_REQUIRED: "secure-verification-required",
  SESSION_LIMIT: "session-limit",
} as const

export type NewApiChannelKeyErrorKind =
  (typeof NEW_API_CHANNEL_KEY_ERROR_KINDS)[keyof typeof NEW_API_CHANNEL_KEY_ERROR_KINDS]

export type NewApiChannelKeyRequirementSessionResult = Exclude<
  EnsureNewApiManagedSessionResult,
  {
    status: typeof NEW_API_MANAGED_SESSION_STATUSES.VERIFIED
  }
>

export class NewApiChannelKeyRequirementError extends Error {
  constructor(
    public kind: NewApiChannelKeyErrorKind,
    public sessionResult?: NewApiChannelKeyRequirementSessionResult,
    public channelId?: number,
  ) {
    super(kind)
    this.name = "NewApiChannelKeyRequirementError"
  }
}
export const NEW_API_SESSION_LIMIT_CODES = {
  ACTIVE: "AUTH_SESSION_LIMIT",
  ISSUANCE: "AUTH_SESSION_ISSUANCE_LIMIT",
} as const

/**
 * Whether the stored New API login-assist fields are sufficient to start a
 * browser-backed session recovery flow when passive exact matching is blocked.
 */
export const hasNewApiLoginAssistCredentials = (
  config?: Pick<NewApiConfig, "username" | "password"> | null,
) => Boolean(config?.username?.trim() && config?.password?.trim())
export const NEW_API_DASHBOARD_REFRESH_RESULTS = {
  Refreshed: "refreshed",
  Unavailable: "unavailable",
} as const

export type NewApiDashboardRefreshResult =
  (typeof NEW_API_DASHBOARD_REFRESH_RESULTS)[keyof typeof NEW_API_DASHBOARD_REFRESH_RESULTS]

export type EnsureNewApiLoginResult =
  | {
      status: typeof NEW_API_LOGIN_STATUSES.LoggedIn
      methods: NewApiVerificationMethods
    }
  | {
      status: typeof NEW_API_LOGIN_STATUSES.TwoFactorRequired
    }
  | {
      status: typeof NEW_API_LOGIN_STATUSES.CredentialsMissing
    }
  | {
      status: typeof NEW_API_LOGIN_STATUSES.PasskeyManualRequired
      methods: NewApiVerificationMethods
    }

export interface VerifyNewApiSessionResult {
  methods: NewApiVerificationMethods
  verifiedUntil?: number
}
