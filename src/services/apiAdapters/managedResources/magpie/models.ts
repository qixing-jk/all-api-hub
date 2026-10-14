import {
  MAGPIE_ENDPOINT_FIELDS,
  MAGPIE_ENDPOINT_TYPES,
  MAGPIE_PROTOCOLS,
} from "~/constants/magpie"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { updateMagpieResourceById } from "~/services/apiAdapters/managedResources/magpie/mutations"
import {
  getMagpieProvider,
  magpieScope,
  requireMagpieApiProvider,
} from "~/services/apiAdapters/managedResources/magpie/nativeRuntime"
import {
  discoverMagpieModels,
  listMagpieProviders,
  readMagpieProviderKey,
} from "~/services/apiService/magpie/providers"
import { buildMagpieProviderSavePayload } from "~/services/apiService/magpie/providerUpdate"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations/contracts"
import type { MagpieConfig } from "~/types/magpieConfig"

/** Resource identity is bound to the configured Web deployment. */
function resourceId(config: MagpieConfig, ref: ManagedResourceRef) {
  if (
    ref.siteType !== SITE_TYPES.MAGPIE ||
    ref.kind !== MANAGED_RESOURCE_KINDS.Channel ||
    ref.scopeKey !== magpieScope(config) ||
    !ref.resourceId
  )
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  return ref.resourceId
}

/** Model sync preserves the full native provider; native refresh is deliberately not a read. */
export const magpieModels: ManagedResourceModelsCapability<MagpieConfig> = {
  resolveVerificationProtocol: (type) =>
    MAGPIE_ENDPOINT_FIELDS.includes(
      type as (typeof MAGPIE_ENDPOINT_FIELDS)[number],
    )
      ? MAGPIE_PROTOCOLS[type as keyof typeof MAGPIE_PROTOCOLS]
      : null,
  list: async (config, options) => {
    await options?.beforeRequest?.()
    const items = (await listMagpieProviders(config, options))
      // Magpie's chosen field contains explicit picks; an empty list delegates
      // membership to its native catalog (yetone/magpie internal/gui/providers.go).
      .filter((item) => !item.account && Boolean(item.chosen?.length))
      .map((provider) => {
        const type =
          MAGPIE_ENDPOINT_FIELDS.find((field) => provider[field]) ??
          MAGPIE_ENDPOINT_TYPES.Chat
        return {
          ref: {
            siteType: SITE_TYPES.MAGPIE,
            kind: MANAGED_RESOURCE_KINDS.Channel,
            scopeKey: magpieScope(config),
            resourceId: provider.id,
          },
          name: provider.name,
          type,
          baseUrl: provider[type] ?? "",
          models: provider.chosen ?? [],
          disabled: provider.off,
          modelMapping: "",
        }
      })
    return { items, total: items.length }
  },
  fetchModels: async (config, ref, options) => {
    const provider = requireMagpieApiProvider(
      await getMagpieProvider(config, resourceId(config, ref), options),
    )
    const key = await readMagpieProviderKey(config, provider.id, options)
    return discoverMagpieModels(
      config,
      buildMagpieProviderSavePayload(provider, { key }),
      options,
    )
  },
  fetchDraftModels: async (config, probe, options) => {
    if (
      !MAGPIE_ENDPOINT_FIELDS.includes(
        probe.channelType as (typeof MAGPIE_ENDPOINT_FIELDS)[number],
      )
    )
      throw new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      })
    return discoverMagpieModels(
      config,
      { [probe.channelType]: probe.baseUrl, key: probe.credential },
      options,
    )
  },
  updateModels: async (config, ref, models, options) => {
    const result = await updateMagpieResourceById(
      config,
      resourceId(config, ref),
      { fields: { models: [...new Set(models)] }, requireExplicitModels: true },
      options,
    )
    return result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Succeeded ||
      result.outcome === MANAGED_SITE_MUTATION_OUTCOMES.Partial
      ? { ...result, data: undefined }
      : result
  },
}
