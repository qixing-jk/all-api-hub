import type { AccountAutoDetectExistingAccount } from "~/services/accounts/autoDetect/existingCredentials"
import type { AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"

export type AccountOnboardingRequest = {
  existingAccount?: AccountAutoDetectExistingAccount
  allowCredentialCreation?: boolean
  protectionBypassExecution?: ProtectionBypassExecution
  diagnostics?: AccountDetectionDiagnostics
}

/** Attempt-local state; only explicit onboarding may discover or acquire credentials. */
export type AccountOnboardingSession = {
  verifyExistingCredentials(): Promise<AccountAutoDetectResponse | undefined>
  discoverIdentity(): Promise<void>
  /** Present only when discovery alone cannot supply a durable credential. */
  acquireCredentials?(): Promise<void>
  verifyAccount(): Promise<AccountAutoDetectResponse>
  fail(error: unknown): AccountAutoDetectResponse
}

export type AccountOnboardingCapability = {
  matchesUrl(url: string): boolean
  createSession(request: AccountOnboardingRequest): AccountOnboardingSession
}
