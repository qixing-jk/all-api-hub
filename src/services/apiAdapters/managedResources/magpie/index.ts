import { SITE_TYPES } from "~/constants/siteType"
import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import {
  magpieDisplayFacts,
  magpieSearchValues,
} from "~/services/apiAdapters/managedResources/magpie/displayFacts"
import {
  magpieImportProjection,
  validateMagpieValues,
} from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import {
  createMagpieResource,
  deleteMagpieResource,
  updateMagpieResource,
} from "~/services/apiAdapters/managedResources/magpie/mutations"
import { magpieNativeEditor } from "~/services/apiAdapters/managedResources/magpie/nativeEditor"
import {
  getMagpieProvider,
  magpieFailure,
  magpieScope,
  requireMagpieApiProvider,
} from "~/services/apiAdapters/managedResources/magpie/nativeRuntime"
import {
  listMagpieProviders,
  type MagpieProvider,
} from "~/services/apiService/magpie/providers"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/configuration/runtimeConfig"

export const magpieManagedResourceRegistration = defineNativeResourceKind({
  siteType: SITE_TYPES.MAGPIE,
  kind: "channel",
  capabilities: {
    canSearch: true,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  createSeedBindings: [
    {
      kind: "managed-channel-import",
      project: magpieImportProjection,
      validate: validateMagpieValues,
      sourceFieldIds: {
        name: "name",
        chat: "baseUrl",
        responses: "baseUrl",
        anthropic: "baseUrl",
        gemini: "baseUrl",
        key: "credential",
        supportedModels: "models",
      },
    },
  ],
  openConfig: async () => {
    const runtime = await getManagedSiteRuntimeConfigForType(SITE_TYPES.MAGPIE)
    if (!runtime)
      throw new ManagedResourceError({ code: "configuration_required" })
    return runtime.config
  },
  scopeKey: magpieScope,
  encodeLocator: (id: string) => id,
  decodeLocator: (id: string) => {
    if (!id) throw new ManagedResourceError({ code: "validation_failed" })
    return id
  },
  locatorFromListItem: (item: MagpieProvider) => item.id,
  locatorFromDetail: (item: MagpieProvider) => item.id,
  list: async (config, query, options) => {
    const search = query?.search?.trim().toLowerCase()
    const items = (await listMagpieProviders(config, options)).filter(
      (item) =>
        !search ||
        magpieSearchValues(item).join(" ").toLowerCase().includes(search),
    )
    return { items, total: items.length }
  },
  get: getMagpieProvider,
  toListFacts: magpieDisplayFacts,
  toDetailFacts: magpieDisplayFacts,
  createEditor: async (config) => magpieNativeEditor(config),
  editEditor: (config, detail) =>
    magpieNativeEditor(config, requireMagpieApiProvider(detail)),
  create: createMagpieResource,
  update: updateMagpieResource,
  delete: deleteMagpieResource,
  mapFailure: magpieFailure,
})
