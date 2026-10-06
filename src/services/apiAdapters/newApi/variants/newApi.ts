import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND } from "~/services/accountSiteOnboarding/contracts"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"

import {
  createSafeCredentialError,
  type CredentialFailure,
  type CredentialFailureStage,
} from "../variantOperations/credentials"
import { resolveNewApiThemeRoute } from "../variantOperations/routes"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const newApiVariant: NewApiVariantRegistration = {
  resolveRoutePath: resolveNewApiThemeRoute,
  credentials: {
    selectDashboardAuth: (value) =>
      value?.kind === NEW_API_DASHBOARD_TRANSIENT_AUTH_KIND ? value : undefined,
    classifyFailure: classifyNewApiCredentialFailure,
  },
}

/** Interprets structured credential issuance failures without reflecting secrets. */
function classifyNewApiCredentialFailure(
  error: unknown,
  stage: CredentialFailureStage,
): CredentialFailure | undefined {
  if (stage !== "completion" || !(error instanceof ApiError)) return undefined
  // rc.22 security proof belongs to the token endpoint, not any generic 403.
  // https://github.com/QuantumNous/new-api/commit/a8729b5c3709cc01d88fc3f2db5b91347fc9129e
  const requiresSecurityProof =
    error.endpoint === "/api/user/token" &&
    error.upstreamCode?.startsWith("SECURITY_PROOF_")
  // rc.41 requires browser step-up verification to issue scoped access tokens.
  // https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.41/service/security_verification.go
  if (
    !requiresSecurityProof &&
    error.code !== API_ERROR_CODES.ACCESS_TOKEN_VERIFICATION_REQUIRED
  )
    return undefined
  return {
    reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    recoveryAuthType: AuthTypeEnum.AccessToken,
    error: createSafeCredentialError(
      error,
      requiresSecurityProof
        ? "New API dashboard authentication could not be exchanged"
        : "This deployment issues an access token only after a security check",
    ),
  }
}
