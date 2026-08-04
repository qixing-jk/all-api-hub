import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { ApiResponse } from "~/services/apiTransport/type"
import {
  toPrivateManagedSiteMutationOutput,
  type ManagedSiteMutationResult,
} from "~/services/managedSites/mutations"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/runtimeConfig"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/managedSite"
import type { AxonHubChannel } from "~/types/axonHub"
import type { ChannelFormData } from "~/types/managedSite"
import type {
  ManagedUpstreamResourceDetail,
  ManagedUpstreamResourceRef,
  ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"
import type { OctopusChannel } from "~/types/octopus"

import {
  getDefaultManagedUpstreamResourceMigrationGates,
  type ManagedUpstreamResourceFeature,
  type ManagedUpstreamResourceMigrationGates,
} from "./managedUpstreamResourceMigration"

type ManagedUpstreamResourceUnsupportedReason =
  | "core-slice-disabled"
  | "feature-slice-disabled"
  | "capability-missing"

type ManagedSiteUpstreamResourcesCapability =
  ManagedUpstreamResourcesCapability<
    ManagedSiteRuntimeConfigValue,
    unknown,
    ChannelFormData
  >

type TransitionalLegacyManagedUpstreamResourceItemsCapability<
  TConfig,
  TNative,
  TDraft,
> = Omit<
  ManagedUpstreamResourcesCapability<TConfig, TNative, TDraft>["items"],
  "create" | "update" | "delete"
> & {
  create(
    config: TConfig,
    draft: TDraft,
  ): Promise<ApiResponse<ManagedUpstreamResourceSummary | null>>
  update(
    config: TConfig,
    detail: ManagedUpstreamResourceDetail<TNative>,
    draft: TDraft,
  ): Promise<ApiResponse<ManagedUpstreamResourceSummary | null>>
  delete(
    config: TConfig,
    ref: ManagedUpstreamResourceRef,
  ): Promise<ApiResponse<unknown>>
}

/**
 * Temporary Task 6 legacy service projection; delete with its private runtime
 * adapter after Task 8 migrates every transitional caller.
 */
export type TransitionalLegacyManagedUpstreamResourcesCapability<
  TConfig = ManagedSiteRuntimeConfigValue,
  TNative = unknown,
  TDraft = ChannelFormData,
> = Omit<
  ManagedUpstreamResourcesCapability<TConfig, TNative, TDraft>,
  "items"
> & {
  items: TransitionalLegacyManagedUpstreamResourceItemsCapability<
    TConfig,
    TNative,
    TDraft
  >
}

type ManagedUpstreamResourceCapabilityResolution =
  | {
      supported: true
      siteType: ManagedSiteType
      capabilities: TransitionalLegacyManagedUpstreamResourcesCapability
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
      capabilities: TransitionalLegacyManagedUpstreamResourcesCapability
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

const adaptMutationResultForLegacyCaller = <TData>(
  result: ManagedSiteMutationResult<TData>,
  knownSecrets: readonly string[],
): ApiResponse<TData | null> => {
  const output = toPrivateManagedSiteMutationOutput(result, {
    knownSecrets,
  })

  if (result.outcome === "succeeded") {
    return {
      success: true,
      message: output.message || "success",
      data: result.data,
    }
  }

  return {
    // Partial/uncertain must close the old workflow as completed so it cannot
    // immediately replay an effect whose final state is unknown.
    success: result.outcome !== "rejected",
    message: output.message || "Managed resource mutation was not confirmed",
    data: null,
  }
}

const collectTextSecrets = (values: readonly unknown[]) =>
  values.filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  )

const collectAxonHubNativeSecrets = (native: unknown): string[] => {
  if (!native || typeof native !== "object") return []

  const channel = native as Partial<AxonHubChannel>
  const credentials = channel.credentials
  const settings = channel.settings
  const apiKeys = Array.isArray(credentials?.apiKeys) ? credentials.apiKeys : []
  const headerOverrides = Array.isArray(settings?.headerOverrideOperations)
    ? settings.headerOverrideOperations
    : []
  const bodyOverrides = Array.isArray(settings?.bodyOverrideOperations)
    ? settings.bodyOverrideOperations
    : []

  return collectTextSecrets([
    credentials?.apiKey,
    ...apiKeys,
    credentials?.gcp?.jsonData,
    credentials?.oauth?.accessToken,
    credentials?.oauth?.refreshToken,
    settings?.proxy?.url,
    settings?.proxy?.password,
    settings?.providerQuota?.opencodeGo?.authCookie,
    ...headerOverrides.map((operation) => operation.value),
    ...bodyOverrides.map((operation) => operation.value),
  ])
}

const collectOctopusNativeSecrets = (native: unknown): string[] => {
  if (!native || typeof native !== "object") return []

  const channel = native as Partial<OctopusChannel>
  const customHeaders = Array.isArray(channel.custom_header)
    ? channel.custom_header
    : []

  return collectTextSecrets([
    ...customHeaders.map((header) => header.header_value),
    channel.channel_proxy,
    channel.param_override,
  ])
}

const collectManagedUpstreamNativeSecrets = (
  siteType: ManagedSiteType,
  native: unknown,
): string[] => {
  if (siteType === SITE_TYPES.AXON_HUB) {
    return collectAxonHubNativeSecrets(native)
  }
  if (siteType === SITE_TYPES.OCTOPUS) {
    return collectOctopusNativeSecrets(native)
  }
  return []
}

/**
 * Keeps Task 6 callers on their legacy response shape without exposing raw
 * diagnostics. Delete this private adapter when Task 8 migrates those callers.
 */
const adaptManagedUpstreamResourcesForLegacyCallers = (
  siteType: ManagedSiteType,
  capabilities: ManagedSiteUpstreamResourcesCapability,
): TransitionalLegacyManagedUpstreamResourcesCapability => ({
  ...capabilities,
  items: {
    ...capabilities.items,
    create: async (config, draft) =>
      adaptMutationResultForLegacyCaller(
        await capabilities.items.create(config, draft),
        [...collectManagedConfigSecrets(config), draft.key],
      ),
    update: async (config, detail, draft) =>
      adaptMutationResultForLegacyCaller(
        await capabilities.items.update(config, detail, draft),
        [
          ...collectManagedConfigSecrets(config),
          draft.key,
          ...collectManagedUpstreamNativeSecrets(siteType, detail.native),
        ],
      ),
    delete: async (config, ref) =>
      adaptMutationResultForLegacyCaller(
        await capabilities.items.delete(config, ref),
        collectManagedConfigSecrets(config),
      ),
  },
})

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
    // Managed-site resource adapters normalize edit/import drafts to ChannelFormData.
    capabilities: adaptManagedUpstreamResourcesForLegacyCallers(
      siteType,
      resources as ManagedSiteUpstreamResourcesCapability,
    ),
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
