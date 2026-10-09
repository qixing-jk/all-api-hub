import { OCTOPUS_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/octopus"
import {
  MANAGED_RESOURCE_FAILURE_CODES as failures,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS as intents,
  ManagedResourceError,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/editor"
import {
  buildOctopusCreateCommand,
  buildOctopusUpdateCommand,
  isOctopusHttpUrl,
  octopusFieldDescriptors,
  octopusInitialValues,
  octopusSecretIntent,
  readOctopusString,
  validateOctopusValues,
} from "~/services/apiAdapters/managedResources/octopus/editor"
import { type openOctopusNativeResourceOperations } from "~/services/apiAdapters/managedResources/octopus/nativeOperations"
import {
  resolveCredentialPatch,
  withCredentialListEditor,
  type CredentialListPatch,
} from "~/services/apiAdapters/managedResources/shared/credentialListEditor"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import { type OctopusChannel } from "~/types/octopus"

export type Operations = Awaited<
  ReturnType<typeof openOctopusNativeResourceOperations>
>

const editor = <T>(
  operations: Operations,
  definition: NativeResourceEditorDefinition<T>,
  detail?: OctopusChannel,
): NativeResourceEditorDefinition<T> => ({
  ...definition,
  ...(detail
    ? {
        loadSecret: async (
          fieldId: string,
          options?: ResourceOperationOptions,
        ) => {
          if (fieldId !== fields.Key)
            throw new ManagedResourceError({ code: failures.ValidationFailed })
          return operations.loadSecret(detail.id, options)
        },
      }
    : {}),
  loadOptions: async (fieldId, values, options) => {
    if (fieldId !== fields.Models)
      throw new ManagedResourceError({ code: failures.ValidationFailed })
    const intent = octopusSecretIntent(values)
    const key =
      intent.kind === intents.Replace
        ? intent.value.trim()
        : detail
          ? await operations.loadSecret(detail.id, options)
          : ""
    const baseUrl = readOctopusString(values, fields.BaseUrl)
    if (
      !baseUrl ||
      !isOctopusHttpUrl(baseUrl) ||
      !hasUsableManagedSiteChannelKey(key)
    )
      throw new ManagedResourceError({ code: failures.ValidationFailed })
    const models = await operations.fetchDraftModels(
      {
        type: Number(values[fields.Type]),
        baseUrl,
        key,
        ...(detail ? { source: detail, proxy: detail.proxy } : {}),
      },
      options,
    )
    return models.map((value) => ({ value }))
  },
})

/** Native IDs/names survive edits; ordinary metadata never includes secret values. */
function octopusCredentialRecords(detail: OctopusChannel) {
  return detail.keys.map((key, index) => ({
    id: key.name ?? String(key.id ?? index),
    key: key.channel_key,
    fields: {
      enabled: String(key.enabled),
      remark: key.remark ?? "",
      name: key.name ?? "",
    },
  }))
}

/** Select metadata supported by the native key protocol. */
function octopusCredentialFields(mode: "legacy" | "named") {
  return [
    { fieldId: "enabled", type: "boolean" as const },
    { fieldId: mode === "named" ? "name" : "remark", type: "text" as const },
  ]
}

/** Resolve edited credentials while preserving native key identities. */
export async function resolveOctopusCredentials(
  patch: CredentialListPatch,
  detail?: OctopusChannel,
) {
  const records = await resolveCredentialPatch(
    patch,
    detail ? octopusCredentialRecords(detail) : [],
  )
  const keys = records.map((record) => {
    const saved = detail?.keys.find(
      (key, index) => (key.name ?? String(key.id ?? index)) === record.id,
    )
    return {
      ...saved,
      originalName: saved?.name,
      channel_key: record.key,
      enabled: record.fields.enabled !== "false",
      remark: record.fields.remark ?? "",
      name: record.fields.name || saved?.name || `key-${record.id}`,
    }
  })
  if (new Set(keys.map((key) => key.name)).size !== keys.length)
    throw new ManagedResourceError({ code: "validation_failed" })
  return keys
}

export const createOctopusNativeEditor = async (
  operations: Operations,
  options?: ResourceOperationOptions,
) => {
  const base = editor(operations, {
    fields: octopusFieldDescriptors(),
    initialValues: octopusInitialValues(),
    validate: validateOctopusValues,
    buildCommand: buildOctopusCreateCommand,
  })
  const mode = await operations.keyManagement(options)
  return mode === "single"
    ? base
    : withCredentialListEditor(
        base,
        fields.Key,
        [],
        false,
        undefined,
        octopusCredentialFields(mode),
      )
}

export const editOctopusNativeEditor = async (
  operations: Operations,
  detail: OctopusChannel,
) => {
  const base = editor(
    operations,
    {
      fields: octopusFieldDescriptors(detail),
      initialValues: octopusInitialValues(detail),
      validate: (values) => validateOctopusValues(values, detail),
      buildCommand: (values) => buildOctopusUpdateCommand(detail, values),
    },
    detail,
  )
  if (detail.keyManagement === "single" || detail.keys.length === 0) return base
  return withCredentialListEditor(
    base,
    fields.Key,
    octopusCredentialRecords(detail),
    true,
    async (loadOptions) =>
      octopusCredentialRecords(await operations.get(detail.id, loadOptions)),
    octopusCredentialFields(detail.keyManagement ?? "legacy"),
  )
}
