import {
  DONE_HUB_MANAGED_RESOURCE_FIELD_IDS as fields,
  isDoneHubAdvancedFieldApplicable,
} from "~/constants/doneHub"
import {
  MANAGED_RESOURCE_FIELD_TYPES as types,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import type { DoneHubChannelCommand, DoneHubChannelRaw } from "~/types/doneHub"
import type { NewApiFamilyChannelCommand } from "~/types/newApiFamilyChannelEditor"

const advancedFields = [
  [fields.CompatibleResponse, "compatible_response", types.Boolean],
  [fields.ResponsesPath, "responses_path", types.Text],
  [fields.ModelMapping, "model_mapping", types.Textarea],
  [fields.Proxy, "proxy", types.Text],
  [fields.TestModel, "test_model", types.Text],
  [fields.ModelHeaders, "model_headers", types.Textarea],
  [fields.CustomParameter, "custom_parameter", types.Textarea],
  [fields.AllowExtraBody, "allow_extra_body", types.Boolean],
  [fields.DisabledStream, "disabled_stream", types.MultiSelect],
] as const

const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const readText = (value: unknown) => (typeof value === "string" ? value : "")

const isJsonObject = (value: string, stringsOnly: boolean) => {
  if (!value.trim()) return true
  try {
    const parsed: unknown = JSON.parse(value)
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (!stringsOnly ||
        Object.entries(parsed).every(
          ([key, item]) => key.trim() && typeof item === "string",
        ))
    )
  } catch {
    return false
  }
}

const isProxyUrl = (value: string) => {
  if (!value.trim()) return true
  try {
    const url = new URL(value.replaceAll("%s", "session"))
    return (
      ["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol) &&
      Boolean(url.hostname)
    )
  } catch {
    return false
  }
}

/** Adds DoneHub-native fields without changing the shared New API-family command. */
export function withDoneHubAdvancedEditor(
  base: NativeResourceEditorDefinition<NewApiFamilyChannelCommand>,
  detail?: DoneHubChannelRaw,
  loadModels?: (
    command: DoneHubChannelCommand,
    options?: ResourceOperationOptions,
  ) => Promise<string[]>,
): NativeResourceEditorDefinition<DoneHubChannelCommand> {
  // Native fields and the custom-channel Responses route:
  // https://github.com/deanxv/done-hub/blob/b99c6a9661fde5198504795354762f2ee2fd0189/model/channel.go
  // https://github.com/deanxv/done-hub/blob/b99c6a9661fde5198504795354762f2ee2fd0189/web/src/views/Channel/type/Plugin.json
  const initialValues: EditableResourceProjection = {
    ...base.initialValues,
    ...Object.fromEntries(
      advancedFields.map(([id, native, type]) => {
        const value =
          native === "responses_path"
            ? asObject(asObject(detail?.plugin).customize)["16"]
            : detail?.[native]
        return [
          id,
          type === types.Boolean
            ? value === true
            : type === types.MultiSelect
              ? Array.isArray(value)
                ? value.filter(
                    (item): item is string => typeof item === "string",
                  )
                : []
              : readText(value),
        ]
      }),
    ),
  }
  const changed = (values: EditableResourceProjection, id: string) =>
    values[id] !== undefined &&
    JSON.stringify(values[id]) !== JSON.stringify(initialValues[id])
  const applicable = (values: EditableResourceProjection, id: string) =>
    isDoneHubAdvancedFieldApplicable(id, Number(values[fields.Type]))

  const buildCommand = (
    values: EditableResourceProjection,
  ): DoneHubChannelCommand => ({
    ...base.buildCommand(values),
    advanced: Object.fromEntries(
      advancedFields
        .filter(([id]) => applicable(values, id) && changed(values, id))
        .map(([id, native]) => {
          const value = values[id]
          if (id === fields.ModelMapping || id === fields.ModelHeaders) {
            return [
              native,
              JSON.stringify(JSON.parse(readText(value).trim() || "{}")),
            ]
          }
          return [native, typeof value === "string" ? value.trim() : value]
        }),
    ),
  })

  return {
    ...base,
    fields: [
      ...base.fields.map((field) =>
        field.fieldId === fields.Models &&
        field.type === types.MultiSelect &&
        field.optionLoader
          ? {
              ...field,
              optionLoader: {
                ...field.optionLoader,
                dependsOn: [
                  ...field.optionLoader.dependsOn,
                  fields.Proxy,
                  fields.ModelHeaders,
                  fields.CustomParameter,
                ],
              },
            }
          : field,
      ),
      ...advancedFields.map(
        ([fieldId, , type]): ResourceFieldDescriptor =>
          type === types.MultiSelect
            ? { fieldId, type, options: [] }
            : { fieldId, type },
      ),
    ],
    initialValues,
    validate: (values) => {
      const basic = base.validate(values)
      const issues: ResourceFieldIssue[] = basic.valid ? [] : [...basic.issues]
      for (const [id, , type] of advancedFields) {
        // An unrelated edit must retain unknown/legacy settings without normalizing them.
        if (!changed(values, id) || !applicable(values, id)) continue
        const value = values[id]
        const text = readText(value)
        let valid =
          type === types.Boolean
            ? typeof value === "boolean"
            : type === types.MultiSelect
              ? Array.isArray(value) &&
                value.every((item) => typeof item === "string" && item.trim())
              : typeof value === "string"
        if (id === fields.ModelMapping || id === fields.ModelHeaders)
          valid &&= isJsonObject(text, true)
        if (id === fields.CustomParameter) valid &&= isJsonObject(text, false)
        if (id === fields.Proxy) valid &&= isProxyUrl(text)
        if (id === fields.TestModel) valid &&= text.trim().length <= 50
        if (!valid) issues.push({ fieldId: id, code: "invalid_value" })
      }
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand,
    loadOptions: async (fieldId, values, options) => {
      if (fieldId === fields.Models && loadModels)
        return (await loadModels(buildCommand(values), options)).map(
          (value) => ({ value }),
        )
      return await base.loadOptions!(fieldId, values, options)
    },
  }
}

/** Merges only the edited route with the latest provider plugin object. */
export function buildDoneHubAdvancedPayload(
  command: DoneHubChannelCommand,
  detail?: DoneHubChannelRaw,
): Record<string, unknown> {
  const { responses_path, ...fields } = command.advanced ?? {}
  if (responses_path === undefined) return fields
  const plugin = asObject(detail?.plugin)
  return {
    ...fields,
    plugin: {
      ...plugin,
      customize: { ...asObject(plugin.customize), "16": responses_path },
    },
  }
}
