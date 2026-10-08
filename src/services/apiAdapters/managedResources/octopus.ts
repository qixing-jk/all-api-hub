import {
  OCTOPUS_MANAGED_RESOURCE_FIELD_IDS as fields,
  OctopusOutboundTypeOptions,
} from "~/constants/octopus"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS as intents,
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  ManagedResourceError,
  MANAGED_RESOURCE_STATUSES as statuses,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { type CredentialListPatch } from "~/services/apiAdapters/managedResources/credentialListEditor"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import { toFacts } from "~/services/apiAdapters/managedResources/octopusDisplayFacts"
import {
  octopusInitialValues,
  validateOctopusValues,
} from "~/services/apiAdapters/managedResources/octopusEditor"
import { type UpdateCommand } from "~/services/apiAdapters/managedResources/octopusNativeContracts"
import {
  createOctopusNativeEditor,
  editOctopusNativeEditor,
  resolveOctopusCredentials,
  type Operations,
} from "~/services/apiAdapters/managedResources/octopusNativeEditor"
import { openOctopusNativeResourceOperations } from "~/services/apiAdapters/managedResources/octopusNativeOperations"
import {
  assertLocator,
  mapFailure,
} from "~/services/apiAdapters/managedResources/octopusNativeRuntime"
import {
  type OctopusChannel,
  type OctopusCreateChannelInput,
} from "~/types/octopus"

export const octopusManagedResourceRegistration = defineNativeResourceKind({
  siteType: SITE_TYPES.OCTOPUS,
  kind: MANAGED_RESOURCE_KINDS.Channel,
  capabilities: { canSearch: true },
  openConfig: openOctopusNativeResourceOperations,
  scopeKey: (operations: Operations) => operations.scopeKey,
  encodeLocator: (id: number) => String(assertLocator(id)),
  decodeLocator: (value: string) => assertLocator(Number(value)),
  locatorFromListItem: (detail: OctopusChannel) => detail.id,
  locatorFromDetail: (detail: OctopusChannel) => detail.id,
  list: (operations: Operations, query, options) =>
    operations.list(query, options),
  get: (operations: Operations, id, options) => operations.get(id, options),
  toListFacts: toFacts,
  toDetailFacts: toFacts,
  keyCleanup: async (operations: Operations, detail) => ({
    baseUrls: detail.base_urls.map((entry) => entry.url),
    keys: detail.keys.map((entry) => entry.channel_key),
    remove: (indices, options) =>
      operations.update(
        detail,
        {
          removeKeys: detail.keys
            .filter((_, index) => indices.includes(index))
            .map((entry) => entry.channel_key),
        },
        options,
      ),
  }),
  createSeedBindings: [
    {
      kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
      validate: validateOctopusValues,
      sourceFieldIds: {
        [fields.Name]: "name",
        [fields.Type]: "channelType",
        [fields.Status]: "enabled",
        [fields.BaseUrl]: "baseUrl",
        [fields.Key]: "credential",
        [fields.Models]: "models",
      },
      project: (seed) => {
        const initialValues = octopusInitialValues()
        return {
          ...initialValues,
          [fields.Type]: OctopusOutboundTypeOptions.some(
            ({ value }) => String(value) === String(seed.channelType),
          )
            ? String(seed.channelType)
            : initialValues[fields.Type] ?? "",
          [fields.Name]: seed.name,
          [fields.BaseUrl]: seed.baseUrl,
          [fields.Key]: { kind: intents.Replace, value: seed.credential },
          [fields.Models]: [...seed.models],
          [fields.Status]: seed.enabled ? statuses.Enabled : statuses.Disabled,
        }
      },
    },
  ],
  createEditor: createOctopusNativeEditor,
  editEditor: editOctopusNativeEditor,
  create: async (
    operations: Operations,
    command: OctopusCreateChannelInput & {
      credentialPatch?: CredentialListPatch
    },
    options,
  ) => {
    const { credentialPatch, ...input } = command
    if (credentialPatch)
      input.keys = await resolveOctopusCredentials(credentialPatch)
    return operations.create(input, options)
  },
  update: async (
    operations: Operations,
    detail: OctopusChannel,
    command: UpdateCommand,
    options,
  ) => {
    const { credentialPatch, ...input } = command
    if (credentialPatch) {
      if (detail.keyManagement === "single")
        throw new ManagedResourceError({ code: "resource_changed" })
      input.keys = await resolveOctopusCredentials(credentialPatch, detail)
    }
    return operations.update(detail, input, options)
  },
  delete: (operations: Operations, id, options) =>
    operations.delete(id, options),
  mapFailure,
})
