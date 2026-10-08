import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import { ManagedResourceError } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ResourceSecretListValue } from "~/services/apiAdapters/contracts/resourceNative"
import { toFacts } from "~/services/apiAdapters/managedResources/cliProxyApiDisplayFacts"
import {
  editor,
  importProjection,
  validate,
  type Command,
} from "~/services/apiAdapters/managedResources/cliProxyApiEditorProjection"
import {
  createCliProxyApiResource,
  deleteCliProxyApiResource,
  mutate,
} from "~/services/apiAdapters/managedResources/cliProxyApiNativeMutation"
import {
  cliProxyApiFailure,
  cliProxyApiKeys,
  cliProxyApiScope,
  decodeId,
  getCliProxyApiResource,
  invalid,
} from "~/services/apiAdapters/managedResources/cliProxyApiNativeRuntime"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import {
  listAllCliProxyApiProviders,
  type CliProxyApiResource,
} from "~/services/apiService/cliProxyApi"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"

export const cliProxyApiManagedResourceRegistration = defineNativeResourceKind({
  updateChangesIdentity: true,
  siteType: SITE_TYPES.CLI_PROXY_API,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  createSeedBindings: [
    {
      kind: "managed-channel-import",
      project: importProjection,
      validate,
      sourceFieldIds: {
        name: "name",
        type: "channelType",
        baseURL: "baseUrl",
        key: "credential",
        credentials: "credential",
        supportedModels: "models",
      },
    },
  ],
  openConfig: async () => {
    const runtime = await getManagedSiteRuntimeConfigForType(
      SITE_TYPES.CLI_PROXY_API,
    )
    if (!runtime)
      throw new ManagedResourceError({ code: "configuration_required" })
    return runtime.config
  },
  scopeKey: cliProxyApiScope,
  encodeLocator: (id: string) => id,
  decodeLocator: decodeId,
  locatorFromListItem: (resource: CliProxyApiResource) => resource.id,
  locatorFromDetail: (resource: CliProxyApiResource) => resource.id,
  list: async (config, query, options) => {
    const items = (await listAllCliProxyApiProviders(config, options)).filter(
      (item) =>
        !query?.search ||
        `${item.value.name ?? ""} ${item.value["base-url"] ?? ""} ${item.kind}`
          .toLowerCase()
          .includes(query.search.toLowerCase()),
    )
    return { items, total: items.length }
  },
  get: getCliProxyApiResource,
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  createEditor: async () => editor(),
  editEditor: (_config, detail) => editor(detail),
  keyCleanup: async (config, detail) => ({
    baseUrls: [detail.value["base-url"] ?? ""],
    keys: cliProxyApiKeys(detail),
    remove: async (indices, options) => {
      if (detail.kind !== "openai-compatibility") throw invalid()
      const definition = editor(detail)
      const credentials = definition.initialValues
        .credentials as ResourceSecretListValue
      const values = {
        ...definition.initialValues,
        credentials: {
          ...credentials,
          entries: credentials.entries.filter(
            (_, index) => !indices.includes(index),
          ),
        },
      }
      if (!definition.validate(values).valid) throw invalid()
      return mutate(
        config,
        "update",
        definition.buildCommand(values),
        detail,
        options,
      )
    },
  }),
  create: createCliProxyApiResource,
  update: async (config, detail, command: Command, options) =>
    mutate(config, "update", command, detail, options) as Promise<
      ManagedSiteMutationResult<CliProxyApiResource>
    >,
  delete: deleteCliProxyApiResource,

  mapFailure: cliProxyApiFailure,
})
