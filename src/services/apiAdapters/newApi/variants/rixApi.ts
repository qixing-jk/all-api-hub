import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import * as rixApi from "~/services/apiService/newApiFamily/variants/rixApi"
import {
  readRixApiMajorVersion,
  recordRixApiMajorVersion,
  reportsRixApiV6TokenColumns,
} from "~/services/apiService/newApiFamily/variants/rixApiDialects"
import * as rixApiTokens from "~/services/apiService/newApiFamily/variants/rixApiTokens"
import { ApiError } from "~/services/apiTransport/errors"

import {
  fetchRixApiModelPricing,
  normalizeRixApiModelPricingResponse,
} from "../rixApiModelPricing"
import {
  createSafeCredentialError,
  type CredentialFailure,
  type CredentialFailureStage,
} from "../variantOperations/credentials"
import { bindModelPricing } from "../variantOperations/pricing"
import { resolveRixApiConsoleRoute } from "../variantOperations/routes"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const rixApiVariant: NewApiVariantRegistration = {
  key: {
    transport: {
      // The 6.x inventory normalizes `p=0` to its first page and reports string
      // quotas, groups and the revealable key through its own dialects.
      fetchAccountTokens: rixApiTokens.fetchAccountTokens,
      fetchTokenById: rixApiTokens.fetchTokenById,
      fetchUserGroups: rixApiTokens.fetchUserGroups,
      fetchCurrentUserGroup: rixApiTokens.fetchCurrentUserGroup,
      fetchAccountAvailableModels: rixApiTokens.fetchAccountAvailableModels,
      resolveApiTokenKey: rixApiTokens.resolveApiTokenKey,
    },
    readPreservedFields: rixApiTokens.readRixApiPreservedTokenFields,
    exposesDeploymentFields: (request) =>
      reportsRixApiV6TokenColumns(request.baseUrl),
  },
  credentials: {
    fetchUserInfo: rixApi.fetchUserInfo,
    getOrCreateAccessToken: rixApi.getOrCreateAccessToken,
    classifyFailure: classifyRixApiCredentialFailure,
  },
  bootstrap: {
    observeSiteStatus: (request, status) => {
      if (request.baseUrl)
        recordRixApiMajorVersion(
          request.baseUrl,
          readRixApiMajorVersion(status),
        )
    },
  },
  resolveRoutePath: resolveRixApiConsoleRoute,
  data: {
    fetchAccountData: rixApi.fetchAccountData,
    refreshAccountData: rixApi.refreshAccountData,
  },
  pricing: bindModelPricing(
    fetchRixApiModelPricing,
    normalizeRixApiModelPricingResponse,
  ),
}

/** Keeps sensitive-action verification failures specific to credential acquisition. */
function classifyRixApiCredentialFailure(
  error: unknown,
  stage: CredentialFailureStage,
): CredentialFailure | undefined {
  // Keep cookie user-info failures separate from the credential issuance path.
  // Rix /api/user/token and /api/user/admin-keys have distinct issuance dialects.
  // Observed 2026-09-26 on https://platform.ephone.ai: the former returns 404,
  // while the latter returns 403 and requires 2FA, a passkey or a bound phone.
  // Upstream: https://github.com/RixAPI/Rix-API
  if (
    stage !== "acquisition" ||
    !(error instanceof ApiError) ||
    (error.statusCode !== 404 && error.statusCode !== 403)
  )
    return undefined
  return {
    reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
    error: createSafeCredentialError(
      error,
      "This deployment issues an access token only to accounts with two-factor authentication, a passkey, or a bound phone number",
    ),
  }
}
