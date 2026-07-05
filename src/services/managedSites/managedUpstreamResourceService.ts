import type { ManagedSiteType } from "~/constants/siteType"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

import {
  getDefaultManagedUpstreamResourceMigrationGates,
  type ManagedUpstreamResourceFeature,
  type ManagedUpstreamResourceMigrationGates,
} from "./managedUpstreamResourceMigration"

type ManagedUpstreamResourceUnsupportedReason =
  | "core-slice-disabled"
  | "feature-slice-disabled"
  | "capability-missing"

type ManagedUpstreamResourceCapabilityResolution =
  | {
      supported: true
      siteType: ManagedSiteType
      capabilities: ManagedUpstreamResourcesCapability
    }
  | {
      supported: false
      siteType: ManagedSiteType
      reason: Exclude<
        ManagedUpstreamResourceUnsupportedReason,
        "feature-slice-disabled"
      >
    }

type ManagedUpstreamResourceFeatureCapabilityResolution =
  | {
      supported: true
      siteType: ManagedSiteType
      feature: ManagedUpstreamResourceFeature
      capabilities: ManagedUpstreamResourcesCapability
    }
  | {
      supported: false
      siteType: ManagedSiteType
      feature: ManagedUpstreamResourceFeature
      reason: ManagedUpstreamResourceUnsupportedReason
    }

type ManagedUpstreamResourceResolutionOptions = {
  gates?: ManagedUpstreamResourceMigrationGates
}

/**
 * Resolves core resource capabilities only after the site explicitly migrates.
 */
export function resolveManagedUpstreamResourceCapabilities(
  siteType: ManagedSiteType,
  options: ManagedUpstreamResourceResolutionOptions = {},
): ManagedUpstreamResourceCapabilityResolution {
  const gates =
    options.gates ?? getDefaultManagedUpstreamResourceMigrationGates()

  if (!gates.isCoreSliceEnabled(siteType)) {
    return {
      supported: false,
      siteType,
      reason: "core-slice-disabled",
    }
  }

  const resources = getSiteTypeCapabilities(siteType).managedSites?.resources
  if (!resources) {
    return {
      supported: false,
      siteType,
      reason: "capability-missing",
    }
  }

  return {
    supported: true,
    siteType,
    capabilities: resources,
  }
}

/**
 * Resolves feature resource capabilities only after both site and feature opt in.
 */
export function resolveManagedUpstreamResourceFeatureCapabilities(
  siteType: ManagedSiteType,
  feature: ManagedUpstreamResourceFeature,
  options: ManagedUpstreamResourceResolutionOptions = {},
): ManagedUpstreamResourceFeatureCapabilityResolution {
  const gates =
    options.gates ?? getDefaultManagedUpstreamResourceMigrationGates()

  if (!gates.isCoreSliceEnabled(siteType)) {
    return {
      supported: false,
      siteType,
      feature,
      reason: "core-slice-disabled",
    }
  }

  if (!gates.isFeatureSliceEnabled(siteType, feature)) {
    return {
      supported: false,
      siteType,
      feature,
      reason: "feature-slice-disabled",
    }
  }

  const resolution = resolveManagedUpstreamResourceCapabilities(siteType, {
    gates,
  })

  if (!resolution.supported) {
    return {
      supported: false,
      siteType,
      feature,
      reason: resolution.reason,
    }
  }

  return {
    supported: true,
    siteType,
    feature,
    capabilities: resolution.capabilities,
  }
}
