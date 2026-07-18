import type { AccountTodayStatsAvailability } from "~/types"

import {
  ACCOUNT_SITE_DEFINITION_SCOPES,
  type AccountSiteDefinition,
  type AccountSiteDefinitionOnboardingMetadata,
  type AccountSiteDefinitionReadiness,
} from "./contracts"
import {
  ACCOUNT_SITE_TYPE_ORDER,
  MANAGED_SITE_TYPE_ORDER,
  SITE_TYPE_DEFINITIONS,
  type AccountSiteDefinitionType,
  type ManagedSiteDefinitionType,
} from "./definitions"
import type { SiteType } from "./identifiers"

/**
 * Clones a regular expression so callers cannot mutate shared matcher state.
 */
function cloneRegExp(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags)
}

/**
 * Clones an optional readonly array while preserving absent optional fields.
 */
function cloneArray<Item>(items: readonly Item[] | undefined) {
  return items ? [...items] : undefined
}

/** Clones an optional today-stat availability profile defensively. */
function cloneTodayStatsAvailability(
  availability: AccountTodayStatsAvailability | undefined,
): AccountTodayStatsAvailability | undefined {
  if (!availability) return undefined

  return {
    consumption: { ...availability.consumption },
    requests: { ...availability.requests },
    tokens: { ...availability.tokens },
    income: { ...availability.income },
  }
}

/**
 * Clones onboarding projection data before exposing it to compatibility callers.
 */
function cloneOnboarding(
  onboarding: AccountSiteDefinitionOnboardingMetadata | undefined,
): AccountSiteDefinitionOnboardingMetadata | undefined {
  if (!onboarding) return undefined

  return {
    detection: onboarding.detection
      ? {
          titlePatterns: onboarding.detection.titlePatterns?.map(cloneRegExp),
          hostnames: cloneArray(onboarding.detection.hostnames),
          compatUserIdHeaderNames: cloneArray(
            onboarding.detection.compatUserIdHeaderNames,
          ),
        }
      : undefined,
    routes: onboarding.routes ? { ...onboarding.routes } : undefined,
  }
}

/**
 * Clones saved-account product policy overrides before profile merging uses them.
 */
function cloneProductProfile(
  productProfile: AccountSiteDefinition["productProfile"],
): AccountSiteDefinition["productProfile"] {
  if (!productProfile) return undefined

  return {
    ...productProfile,
    auth: productProfile.auth
      ? {
          ...productProfile.auth,
          allowedAuthTypes: cloneArray(productProfile.auth.allowedAuthTypes),
          defaultAuthHostnames: cloneArray(
            productProfile.auth.defaultAuthHostnames,
          ),
        }
      : undefined,
    authSession: productProfile.authSession
      ? { ...productProfile.authSession }
      : undefined,
    createdToken: productProfile.createdToken
      ? { ...productProfile.createdToken }
      : undefined,
    identity: productProfile.identity
      ? {
          ...productProfile.identity,
          storedUserIdentityFields: cloneArray(
            productProfile.identity.storedUserIdentityFields,
          ),
        }
      : undefined,
    modelList: productProfile.modelList
      ? { ...productProfile.modelList }
      : undefined,
    metrics: productProfile.metrics
      ? {
          deferredTodayStatsAvailability: cloneTodayStatsAvailability(
            productProfile.metrics.deferredTodayStatsAvailability,
          ),
          legacyTodayStatsAvailability: cloneTodayStatsAvailability(
            productProfile.metrics.legacyTodayStatsAvailability,
          ),
        }
      : undefined,
    supplementalAuth: productProfile.supplementalAuth
      ? { ...productProfile.supplementalAuth }
      : undefined,
    tokenForm: productProfile.tokenForm
      ? { ...productProfile.tokenForm }
      : undefined,
    urls: productProfile.urls
      ? {
          ...productProfile.urls,
          recognizedHostnames: cloneArray(
            productProfile.urls.recognizedHostnames,
          ),
        }
      : undefined,
  }
}

/**
 * Clones readiness expectation data before exposing definition copies.
 */
function cloneReadiness(
  readiness: AccountSiteDefinitionReadiness | undefined,
): AccountSiteDefinitionReadiness | undefined {
  if (!readiness) return undefined

  return {
    modelList: readiness.modelList ? { ...readiness.modelList } : undefined,
  }
}

/**
 * Clones a complete account-site definition row for registry consumers.
 */
function cloneDefinition(
  definition: AccountSiteDefinition,
): AccountSiteDefinition {
  return {
    ...definition,
    scopes: [...definition.scopes],
    managedResource: definition.managedResource
      ? {
          ...definition.managedResource,
          tableFieldIds: [...definition.managedResource.tableFieldIds],
          detailFieldIds: [...definition.managedResource.detailFieldIds],
          actions: [...definition.managedResource.actions],
          settingsTarget: { ...definition.managedResource.settingsTarget },
        }
      : undefined,
    onboarding: cloneOnboarding(definition.onboarding),
    productProfile: cloneProductProfile(definition.productProfile),
    readiness: cloneReadiness(definition.readiness),
  }
}

/**
 * Checks whether a definition is registered for a specific capability scope.
 */
function hasScope(
  definition: AccountSiteDefinition,
  scope: (typeof ACCOUNT_SITE_DEFINITION_SCOPES)[keyof typeof ACCOUNT_SITE_DEFINITION_SCOPES],
) {
  return definition.scopes.includes(scope)
}

/**
 * Sorts projected definitions according to the public compatibility order.
 */
function sortByOrder(
  definitions: readonly AccountSiteDefinition[],
  order: readonly SiteType[],
) {
  return [...definitions].sort(
    (first, second) =>
      order.indexOf(first.siteType) - order.indexOf(second.siteType),
  )
}

/**
 * Returns defensive copies of every registered account-site definition row.
 */
export function getAccountSiteDefinitions(): readonly AccountSiteDefinition[] {
  return SITE_TYPE_DEFINITIONS.map(cloneDefinition)
}

/**
 * Returns the registered definition for one site type, when known.
 */
export function getAccountSiteDefinition(
  siteType: SiteType | string,
): AccountSiteDefinition | undefined {
  const definition = SITE_TYPE_DEFINITIONS.find(
    (definition) => definition.siteType === siteType,
  )

  return definition ? cloneDefinition(definition) : undefined
}

/**
 * Returns account-scoped site types in the legacy public order.
 */
export function getAccountSiteTypeValues(): readonly AccountSiteDefinitionType[] {
  const accountScopedSiteTypes = new Set(
    SITE_TYPE_DEFINITIONS.filter((definition) =>
      hasScope(definition, ACCOUNT_SITE_DEFINITION_SCOPES.Account),
    ).map((definition) => definition.siteType),
  )

  return ACCOUNT_SITE_TYPE_ORDER.filter((siteType) =>
    accountScopedSiteTypes.has(siteType),
  )
}

/**
 * Returns managed-scoped site types in the legacy public order.
 */
export function getManagedSiteTypeValues(): readonly ManagedSiteDefinitionType[] {
  const managedScopedSiteTypes = new Set(
    SITE_TYPE_DEFINITIONS.filter((definition) =>
      hasScope(definition, ACCOUNT_SITE_DEFINITION_SCOPES.Managed),
    ).map((definition) => definition.siteType),
  )

  return MANAGED_SITE_TYPE_ORDER.filter((siteType) =>
    managedScopedSiteTypes.has(siteType),
  )
}

/**
 * Projects account-scoped definitions into the onboarding compatibility shape.
 */
export function getAccountSiteOnboardingDefinitions() {
  return sortByOrder(
    SITE_TYPE_DEFINITIONS.filter((definition) =>
      hasScope(definition, ACCOUNT_SITE_DEFINITION_SCOPES.Account),
    ),
    ACCOUNT_SITE_TYPE_ORDER,
  ).map((definition) => ({
    siteType: definition.siteType,
    adapterFamily: definition.adapterFamily,
    ...cloneOnboarding(definition.onboarding),
  }))
}

/**
 * Returns the saved-account product profile override for one site type.
 */
export function getAccountSiteProductProfileOverride(
  siteType: SiteType | string,
) {
  return cloneProductProfile(
    SITE_TYPE_DEFINITIONS.find((definition) => definition.siteType === siteType)
      ?.productProfile,
  )
}
