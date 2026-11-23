import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import type { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteDefinitions"
import type { AccountSiteTypeForAdapterFamily } from "~/services/accountSiteDefinitions/definitions"
import type { CompatibleAccountVariant } from "~/services/apiAdapters/compatibleAccountVariantContract"
import { applyFamilyGroupEvidence } from "~/services/apiAdapters/newApi/account/groupEvidence"
import { normalizeApiYiModelPricingResponse } from "~/services/apiAdapters/newApi/pricing/apiyiModelPricing"
import { compatibleTokenInventoryOverrides } from "~/services/apiAdapters/newApi/variantOperations/key"
import { bindModelPricing } from "~/services/apiAdapters/newApi/variantOperations/pricing"
import * as shellCredentials from "~/services/apiService/shellApiFamily/credentials"
import * as shell from "~/services/apiService/shellApiFamily/shared"
import { createLogger } from "~/utils/core/logger"

import { fetchShellAccountData } from "./accountData"
import { shellApiInviteLink } from "./inviteLink"
import { laozhangVariant } from "./variants/laozhang"

const logger = createLogger("ShellApiAccountRefresh")

// System token issuance requires interactive site verification. Both hosted
// sites can read an existing token from /api/user/self without issuing one.
const credentials = {
  getOrCreateAccessToken: shellCredentials.getAccessToken,
  missingTokenReason:
    AUTO_DETECT_FAILURE_REASONS.AccessTokenVerificationRequired,
}

const commonKeyTransport = {
  fetchAccountAvailableModels: shell.fetchAccountAvailableModels,
  fetchUserGroups: shell.fetchUserGroups,
}

const commonVariant = {
  credentials,
  key: {
    transport: {
      ...compatibleTokenInventoryOverrides,
      ...commonKeyTransport,
    },
  },
  pricing: bindModelPricing(shell.fetchModelPricing, ({ pricing, status }) =>
    applyFamilyGroupEvidence(
      normalizeApiYiModelPricingResponse(pricing, status),
    ),
  ),
} satisfies CompatibleAccountVariant

const variants = {
  [SITE_TYPES.SHELL_API]: {
    ...commonVariant,
    inviteLink: shellApiInviteLink,
    credentials: {
      ...credentials,
      fetchUserInfo: shellCredentials.readGenericShellIdentity,
      getOrCreateAccessToken: shellCredentials.getVerifiedShellAccessToken,
    },
    bootstrap: {
      extractCheckInSupport: () => undefined,
    },
    data: {
      fetchSupportCheckIn: async () => undefined,
      fetchAccountData: fetchShellAccountData,
      refreshAccountData: (request) =>
        readAccountRefreshResult(
          () => fetchShellAccountData(request),
          (error) => logger.error("Shell account refresh failed", error),
        ),
    },
  },
  [SITE_TYPES.APIYI]: {
    ...commonVariant,
  },
  [SITE_TYPES.LAOZHANG]: {
    ...commonVariant,
    ...laozhangVariant,
    key: {
      ...laozhangVariant.key,
      transport: { ...commonKeyTransport, ...laozhangVariant.key?.transport },
    },
  },
} satisfies Record<
  AccountSiteTypeForAdapterFamily<
    typeof ACCOUNT_SITE_ADAPTER_FAMILIES.ShellApiFamily
  >,
  CompatibleAccountVariant
>

/** Resolves deployment differences for the independently composed Shell family. */
export function getShellApiVariant(
  siteType?: AccountSiteType,
): CompatibleAccountVariant | undefined {
  if (siteType && Object.hasOwn(variants, siteType))
    return variants[siteType as keyof typeof variants]
}
