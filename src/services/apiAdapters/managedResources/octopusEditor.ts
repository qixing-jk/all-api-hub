import {
  OCTOPUS_MANAGED_RESOURCE_FIELD_IDS as fields,
  OctopusOutboundTypeOptions,
} from "~/constants/octopus"
import {
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS as intents,
  MANAGED_RESOURCE_FIELD_ISSUE_CODES as issues,
  MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS,
  MANAGED_RESOURCE_SECRET_STATES as states,
  MANAGED_RESOURCE_STATUSES as statuses,
  MANAGED_RESOURCE_FIELD_TYPES as types,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceValidationResult,
  type SecretEditIntent,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import {
  OctopusOutboundType,
  type OctopusChannel,
  type OctopusCreateChannelInput,
  type OctopusUpdateChannelInput,
} from "~/types/octopus"
import { normalizeList } from "~/utils/core/string"

export const octopusModels = (value?: string) =>
  normalizeList((value ?? "").split(","))
export const readOctopusString = (
  values: EditableResourceProjection,
  fieldId: string,
): string => (typeof values[fieldId] === "string" ? values[fieldId] : "")
const readOctopusModels = (values: EditableResourceProjection): string[] => {
  const value = values[fields.Models]
  return Array.isArray(value)
    ? normalizeList(
        value.filter((item): item is string => typeof item === "string"),
      )
    : []
}
/** Parses explicit secret edits; malformed or absent intent leaves the existing credential unchanged. */
export const octopusSecretIntent = (
  values: EditableResourceProjection,
): SecretEditIntent => {
  const value = values[fields.Key]
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as { kind?: unknown; value?: unknown }
    if (
      candidate.kind === intents.Replace &&
      typeof candidate.value === "string"
    )
      return { kind: intents.Replace, value: candidate.value }
    if (candidate.kind === intents.Clear) return { kind: intents.Clear }
  }
  return { kind: intents.Unchanged }
}
export const isOctopusHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value.trim())
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
export const octopusSecretState = (detail: OctopusChannel) => {
  const key = detail.keys[0]?.channel_key
  return hasUsableManagedSiteChannelKey(key)
    ? states.Available
    : key?.trim()
      ? states.Masked
      : states.Unavailable
}
export const octopusInitialValues = (
  detail?: OctopusChannel,
): EditableResourceProjection => ({
  [fields.Name]: detail?.name ?? "",
  [fields.Type]: String(detail?.type ?? OctopusOutboundType.OpenAIChat),
  [fields.Status]:
    detail?.enabled === false ? statuses.Disabled : statuses.Enabled,
  [fields.BaseUrl]: detail?.base_urls[0]?.url ?? "",
  [fields.Key]: detail
    ? { kind: intents.Unchanged }
    : { kind: intents.Replace, value: "" },
  [fields.Models]: octopusModels(detail?.model),
})
export const octopusFieldDescriptors = (
  detail?: OctopusChannel,
): readonly ResourceFieldDescriptor[] => {
  const options: { value: string }[] = OctopusOutboundTypeOptions.map(
    ({ value }) => ({ value: String(value) }),
  )
  if (detail && !options.some(({ value }) => value === String(detail.type)))
    options.push({ value: String(detail.type) })
  return [
    { fieldId: fields.Name, type: types.Text, required: true },
    { fieldId: fields.Type, type: types.Select, required: true, options },
    {
      fieldId: fields.Status,
      type: types.Select,
      required: true,
      options: [{ value: statuses.Enabled }, { value: statuses.Disabled }],
    },
    { fieldId: fields.BaseUrl, type: types.Text, required: true },
    {
      fieldId: fields.Key,
      type: types.Secret,
      required: !detail,
      secretState: detail ? octopusSecretState(detail) : states.Unavailable,
      canLoadSecret: !!detail,
      canReplace: true,
      allowClear: false,
    },
    {
      fieldId: fields.Models,
      type: types.MultiSelect,
      options: octopusModels(detail?.model).map((value) => ({ value })),
      optionLoader: {
        dependsOn: [fields.Type, fields.BaseUrl, fields.Key],
        trigger: MANAGED_RESOURCE_FIELD_OPTION_LOAD_TRIGGERS.Manual,
      },
    },
  ]
}
/** Validates editable fields while allowing an existing unknown type and forbidding credential clearing. */
export const validateOctopusValues = (
  values: EditableResourceProjection,
  detail?: OctopusChannel,
): ResourceValidationResult => {
  const errors: ResourceFieldIssue[] = []
  if (!readOctopusString(values, fields.Name).trim())
    errors.push({ fieldId: fields.Name, code: issues.Required })
  const type = readOctopusString(values, fields.Type)
  if (
    !OctopusOutboundTypeOptions.some(({ value }) => String(value) === type) &&
    (!detail || String(detail.type) !== type)
  )
    errors.push({ fieldId: fields.Type, code: issues.UnsupportedOption })
  if (
    ![statuses.Enabled, statuses.Disabled].some(
      (value) => value === values[fields.Status],
    )
  )
    errors.push({ fieldId: fields.Status, code: issues.UnsupportedOption })
  if (!isOctopusHttpUrl(readOctopusString(values, fields.BaseUrl)))
    errors.push({ fieldId: fields.BaseUrl, code: issues.InvalidValue })
  const secret = octopusSecretIntent(values)
  if (
    secret.kind === intents.Clear ||
    (secret.kind === intents.Replace &&
      !hasUsableManagedSiteChannelKey(secret.value)) ||
    (!detail && secret.kind !== intents.Replace)
  )
    errors.push({ fieldId: fields.Key, code: issues.InvalidValue })
  return errors.length ? { valid: false, issues: errors } : { valid: true }
}
/** Converts an editor projection into normalized transport fields; callers validate before dispatch. */
export const buildOctopusCreateCommand = (
  values: EditableResourceProjection,
): OctopusCreateChannelInput => {
  const secret = octopusSecretIntent(values)
  return {
    name: readOctopusString(values, fields.Name).trim(),
    type: Number(values[fields.Type]),
    enabled: values[fields.Status] === statuses.Enabled,
    baseUrl: readOctopusString(values, fields.BaseUrl).trim(),
    key: secret.kind === intents.Replace ? secret.value.trim() : "",
    model: readOctopusModels(values).join(","),
    autoSync: true,
  }
}
/** Emits only changed editable fields and includes a credential only for explicit replacement. */
export const buildOctopusUpdateCommand = (
  detail: OctopusChannel,
  values: EditableResourceProjection,
): Omit<OctopusUpdateChannelInput, "id" | "source"> => {
  const command: Omit<OctopusUpdateChannelInput, "id" | "source"> = {}
  const next = buildOctopusCreateCommand(values)
  if (next.name !== detail.name.trim()) command.name = next.name
  if (next.type !== detail.type) command.type = next.type
  if (next.enabled !== detail.enabled) command.enabled = next.enabled
  if (next.baseUrl !== (detail.base_urls[0]?.url ?? "").trim())
    command.baseUrl = next.baseUrl
  if (next.model !== octopusModels(detail.model).join(","))
    command.model = next.model
  if (octopusSecretIntent(values).kind === intents.Replace)
    command.key = next.key
  return command
}
