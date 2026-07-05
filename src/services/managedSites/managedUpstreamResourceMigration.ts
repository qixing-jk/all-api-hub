import type { ManagedSiteType } from "~/constants/siteType"
import { SITE_TYPES } from "~/constants/siteType"

export const MANAGED_UPSTREAM_RESOURCE_FEATURES = {
  DuplicateMatching: "duplicateMatching",
  ChannelMigration: "channelMigration",
  TokenBatchExport: "tokenBatchExport",
  TokenChannelStatus: "tokenChannelStatus",
  ModelSync: "modelSync",
  ModelRedirect: "modelRedirect",
  ChannelFilters: "channelFilters",
  ChannelConfigStorage: "channelConfigStorage",
} as const

export type ManagedUpstreamResourceFeature =
  (typeof MANAGED_UPSTREAM_RESOURCE_FEATURES)[keyof typeof MANAGED_UPSTREAM_RESOURCE_FEATURES]

type ManagedUpstreamResourceFeatureSlice = {
  siteType: ManagedSiteType
  feature: ManagedUpstreamResourceFeature
}

export type ManagedUpstreamResourceMigrationGates = {
  isCoreSliceEnabled(siteType: ManagedSiteType): boolean
  isFeatureSliceEnabled(
    siteType: ManagedSiteType,
    feature: ManagedUpstreamResourceFeature,
  ): boolean
}

type ManagedUpstreamResourceMigrationGateConfig = {
  coreSiteTypes?: readonly ManagedSiteType[]
  featureSlices?: readonly ManagedUpstreamResourceFeatureSlice[]
}

const getFeatureSliceKey = (
  siteType: ManagedSiteType,
  feature: ManagedUpstreamResourceFeature,
): string => `${siteType}:${feature}`

/**
 * Builds an explicit migration gate set for a managed-site resource slice.
 */
export function createManagedUpstreamResourceMigrationGates(
  config: ManagedUpstreamResourceMigrationGateConfig = {},
): ManagedUpstreamResourceMigrationGates {
  const coreSiteTypes = new Set(config.coreSiteTypes ?? [])
  const featureSlices = new Set(
    (config.featureSlices ?? []).map(({ siteType, feature }) =>
      getFeatureSliceKey(siteType, feature),
    ),
  )

  return {
    isCoreSliceEnabled: (siteType) => coreSiteTypes.has(siteType),
    isFeatureSliceEnabled: (siteType, feature) =>
      featureSlices.has(getFeatureSliceKey(siteType, feature)),
  }
}

const defaultManagedUpstreamResourceMigrationGates =
  createManagedUpstreamResourceMigrationGates({
    coreSiteTypes: [
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ],
  })

/**
 * Checks whether the production core resource path is enabled for a site.
 */
export function isManagedSiteCoreResourceSliceEnabled(
  siteType: ManagedSiteType,
): boolean {
  return defaultManagedUpstreamResourceMigrationGates.isCoreSliceEnabled(
    siteType,
  )
}

/**
 * Checks whether a production feature has opted into the resource path.
 */
export function isManagedSiteFeatureResourceSliceEnabled(
  siteType: ManagedSiteType,
  feature: ManagedUpstreamResourceFeature,
): boolean {
  return defaultManagedUpstreamResourceMigrationGates.isFeatureSliceEnabled(
    siteType,
    feature,
  )
}

/**
 * Returns the production migration gates for resource-backed managed-site slices.
 */
export function getDefaultManagedUpstreamResourceMigrationGates(): ManagedUpstreamResourceMigrationGates {
  return defaultManagedUpstreamResourceMigrationGates
}
