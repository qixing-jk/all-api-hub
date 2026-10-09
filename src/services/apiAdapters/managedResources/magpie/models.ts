import { MAGPIE_ENDPOINT_FIELDS, MAGPIE_PROTOCOLS } from "~/constants/magpie"
import type { ManagedResourceModelsCapability } from "~/services/apiAdapters/contracts/managedResourceModels"
import {
  ManagedResourceError,
  type ManagedResourceRef,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { updateMagpieResource } from "~/services/apiAdapters/managedResources/magpie/mutations"
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
import type { MagpieConfig } from "~/types/magpieConfig"

/** Resource identity is bound to the configured Web deployment. */
function resourceId(config: MagpieConfig, ref: ManagedResourceRef) {
  if (
    ref.siteType !== "magpie" ||
    ref.kind !== "channel" ||
    ref.scopeKey !== magpieScope(config) ||
    !ref.resourceId
  )
    throw new ManagedResourceError({ code: "validation_failed" })
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
      .filter((item) => !item.account)
      .map((provider) => {
        const type =
          MAGPIE_ENDPOINT_FIELDS.find((field) => provider[field]) ?? "chat"
        return {
          ref: {
            siteType: "magpie" as const,
            kind: "channel" as const,
            scopeKey: magpieScope(config),
            resourceId: provider.id,
          },
          name: provider.name,
          type,
          baseUrl: provider[type] ?? "",
          models: provider.chosen?.length
            ? provider.chosen
            : (provider.models ?? [])
                .filter((model) => model.on)
                .map((model) => model.id),
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
      throw new ManagedResourceError({ code: "validation_failed" })
    return discoverMagpieModels(
      config,
      { [probe.channelType]: probe.baseUrl, key: probe.credential },
      options,
    )
  },
  updateModels: async (config, ref, models, options) => {
    const provider = requireMagpieApiProvider(
      await getMagpieProvider(config, resourceId(config, ref), options),
    )
    const result = await updateMagpieResource(
      config,
      provider,
      { fields: { models: [...new Set(models)] } },
      options,
    )
    return result.outcome === "succeeded" || result.outcome === "partial"
      ? { ...result, data: undefined }
      : result
  },
}
