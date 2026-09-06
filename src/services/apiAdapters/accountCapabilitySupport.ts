import type { AccountSiteType } from "~/constants/siteType"
import type {
  AccountSiteCapabilities,
  SiteTypeCapabilities,
} from "~/services/apiAdapters/contracts/siteTypeCapabilities"

type AccountSiteCapabilityId = keyof AccountSiteCapabilities

const ACCOUNT_SITE_CAPABILITY_INVENTORY = {
  announcements: true,
  modelCatalog: true,
  providerModelCatalog: true,
  modelPricing: true,
  data: true,
  bootstrap: true,
  completion: true,
  inviteLink: true,
  keyManagement: true,
  keyResourceManagement: true,
  keyResources: true,
  serviceCredential: true,
  tokenProvisioning: true,
  refresh: true,
  redemption: true,
} as const satisfies Record<AccountSiteCapabilityId, true>

export const ACCOUNT_SITE_CAPABILITY_IDS = Object.keys(
  ACCOUNT_SITE_CAPABILITY_INVENTORY,
) as AccountSiteCapabilityId[]

export const ACCOUNT_USER_FEATURE_IDS = {
  AutomaticRedemption: "automaticRedemption",
  DefaultTokenAutomation: "defaultTokenAutomation",
} as const

type AccountUserFeatureId =
  (typeof ACCOUNT_USER_FEATURE_IDS)[keyof typeof ACCOUNT_USER_FEATURE_IDS]

export const ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS = {
  CapabilityMissing: "capability-missing",
} as const

type AccountUserFeatureCapabilityMap = {
  [ACCOUNT_USER_FEATURE_IDS.AutomaticRedemption]: NonNullable<
    AccountSiteCapabilities["redemption"]
  >
  [ACCOUNT_USER_FEATURE_IDS.DefaultTokenAutomation]: {
    keyManagement: NonNullable<AccountSiteCapabilities["keyManagement"]>
    tokenProvisioning: NonNullable<AccountSiteCapabilities["tokenProvisioning"]>
  }
}

type AccountUserFeatureAvailability<K extends AccountUserFeatureId> =
  | {
      status: "supported"
      siteType: AccountSiteType
      feature: K
      capability: AccountUserFeatureCapabilityMap[K]
    }
  | {
      status: "unsupported"
      siteType: AccountSiteType
      feature: K
      reason: (typeof ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS)[keyof typeof ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS]
    }

const ACCOUNT_USER_FEATURE_SELECTORS = {
  [ACCOUNT_USER_FEATURE_IDS.AutomaticRedemption]: (
    capabilities: SiteTypeCapabilities,
  ) => capabilities.account?.redemption,
  [ACCOUNT_USER_FEATURE_IDS.DefaultTokenAutomation]: (
    capabilities: SiteTypeCapabilities,
  ) => {
    const keyManagement = capabilities.account?.keyManagement
    const tokenProvisioning = capabilities.account?.tokenProvisioning
    return keyManagement && tokenProvisioning
      ? { keyManagement, tokenProvisioning }
      : undefined
  },
} satisfies {
  [K in AccountUserFeatureId]: (
    capabilities: SiteTypeCapabilities,
  ) => AccountUserFeatureCapabilityMap[K] | undefined
}

/** Returns an inventory of raw account adapter capabilities for diagnostics. */
export function getAccountSiteCapabilitySupportMatrix(
  capabilities: SiteTypeCapabilities,
) {
  return Object.fromEntries(
    Object.keys(ACCOUNT_SITE_CAPABILITY_INVENTORY).map((capabilityId) => [
      capabilityId,
      {
        status: capabilities.account?.[capabilityId as AccountSiteCapabilityId]
          ? ("supported" as const)
          : ("unsupported" as const),
      },
    ]),
  ) as Record<AccountSiteCapabilityId, { status: "supported" | "unsupported" }>
}

/**
 * Resolves a user-visible feature from the registered adapter capability.
 * Capability presence is the runtime support discriminator for every site type.
 */
export function resolveAccountUserFeatureAvailability<
  K extends AccountUserFeatureId,
>(
  siteType: AccountSiteType,
  feature: K,
  capabilities: SiteTypeCapabilities,
): AccountUserFeatureAvailability<K> {
  const capability = ACCOUNT_USER_FEATURE_SELECTORS[feature](capabilities) as
    | AccountUserFeatureCapabilityMap[K]
    | undefined

  if (!capability) {
    return {
      status: "unsupported",
      siteType,
      feature,
      reason: ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS.CapabilityMissing,
    }
  }

  return { status: "supported", siteType, feature, capability }
}
