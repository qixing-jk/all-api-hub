import type { AccountLoginProvider } from "~/constants/accountLogin"

/**
 * What the last browser login attempt proved about one account.
 *
 * `Success` proves the browser's current provider identity belongs to this
 * account. `IdentityMismatch` proves the opposite, which matters because the
 * browser holds exactly one GitHub / Linux DO session at a time: without the
 * negative outcome, an account that keeps failing could hold a provider forever
 * while the account that actually works is never allowed to try.
 */
export const LOGIN_PROVIDER_EVIDENCE_OUTCOMES = {
  Success: "success",
  IdentityMismatch: "identity_mismatch",
} as const

export type LoginProviderEvidenceOutcome =
  (typeof LOGIN_PROVIDER_EVIDENCE_OUTCOMES)[keyof typeof LOGIN_PROVIDER_EVIDENCE_OUTCOMES]

export interface LoginProviderEvidence {
  provider: AccountLoginProvider
  outcome: LoginProviderEvidenceOutcome
  /** Epoch ms of the attempt that produced this evidence. */
  at: number
}

/** Evidence keyed by the account it describes; unknown account ids are inert. */
export type LoginProviderEvidenceMap = Readonly<
  Record<string, LoginProviderEvidence>
>
