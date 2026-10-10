import { MAGPIE_ENDPOINT_FIELDS } from "~/constants/magpie"
import {
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceFieldValue,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/editor"
import {
  buildMagpieKeyPoolPatch,
  magpieKeyPoolField,
  magpieKeyPoolProjection,
  type MagpieKeyPoolPatch,
} from "~/services/apiAdapters/managedResources/magpie/keyPoolEditor"
import type { MagpieProvider } from "~/services/apiService/magpie/providers"
import { isValidProxyUrl } from "~/utils/core/proxyUrl"

export interface MagpieProviderCommand {
  fields: Record<string, unknown>
  enabled?: boolean
  keyPool?: MagpieKeyPoolPatch
  primaryKeyRef?: string
}

const text = (values: EditableResourceProjection, key: string) =>
  typeof values[key] === "string" ? (values[key] as string) : ""
const customFields = [
  "modelsURL",
  "catalog",
  "balanceURL",
  "balancePath",
] as const
const limits = {
  maxConcurrency: { max: 1000, step: 1 },
  maxRPM: { max: 10000, step: 1 },
  priceRate: { max: 1000, step: 0.001 },
} as const
const hasCustomEndpoints = (detail?: MagpieProvider) => !detail?.preset
const routingModes = ["", "order", "rotate", "usage", "pace", "weight"]

/** Match native reopening order, including a saved protocol we do not edit. */
const baseAPIOf = (detail?: MagpieProvider) => {
  const preferred = detail?.baseAPI === "openai" ? "chat" : detail?.baseAPI
  if (
    typeof preferred === "string" &&
    typeof detail?.[preferred] === "string" &&
    detail[preferred].trim()
  )
    return preferred
  return (
    ["chat", "anthropic", "responses", "gemini", "decide"].find(
      (field) => typeof detail?.[field] === "string" && detail[field].trim(),
    ) ?? "chat"
  )
}
const validLookupUrl = (value: string) => {
  try {
    const url = new URL(value)
    return (
      /^https?:$/.test(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hash
    )
  } catch {
    return false
  }
}
const models = (value: ResourceFieldValue | undefined) => [
  ...new Set(
    (Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : []
    )
      .map((item) => item.trim())
      .filter(Boolean),
  ),
]
const initialValues = (
  detail?: MagpieProvider,
): EditableResourceProjection => ({
  name: detail?.name ?? "",
  chat: detail?.chat ?? "",
  responses: detail?.responses ?? "",
  anthropic: detail?.anthropic ?? "",
  gemini: detail?.gemini ?? "",
  baseAPI: baseAPIOf(detail),
  supportedModels: [...(detail?.chosen ?? [])],
  key: detail ? { kind: "unchanged" } : { kind: "replace", value: "" },
  keyPool: magpieKeyPoolProjection(detail),
  routing: typeof detail?.routing === "string" ? detail.routing : "",
  status: detail?.off ? "disabled" : "enabled",
  proxy: typeof detail?.proxy === "string" ? detail.proxy : "",
  headers: detail?.headers ? JSON.stringify(detail.headers, null, 2) : "",
  ...Object.fromEntries(
    customFields.map((field) => [
      field,
      typeof detail?.[field] === "string" ? detail[field] : "",
    ]),
  ),
  ...Object.fromEntries(
    Object.keys(limits).map((field) => [
      field,
      typeof detail?.[field] === "number" ? detail[field] : "",
    ]),
  ),
})

/** Validate only the selected editable projection; native extras remain intact. */
export function validateMagpieConnectionValues(
  values: EditableResourceProjection,
  detail?: MagpieProvider,
): ResourceValidationResult {
  const issues: ResourceFieldIssue[] = []
  const invalid = (fieldId: string) =>
    issues.push({ fieldId, code: "invalid_value" })
  const selectedAPI = text(values, "baseAPI")
  const knownAPI = MAGPIE_ENDPOINT_FIELDS.find((field) => field === selectedAPI)
  if (knownAPI) {
    if (!text(values, knownAPI).trim())
      issues.push({ fieldId: knownAPI, code: "required" })
  } else if (!detail || selectedAPI !== baseAPIOf(detail)) {
    invalid("baseAPI")
  }
  for (const key of MAGPIE_ENDPOINT_FIELDS) {
    if (!text(values, key).trim()) continue
    try {
      const url = new URL(text(values, key).trim())
      if (
        !/^https?:$/.test(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        invalid(key)
    } catch {
      invalid(key)
    }
  }
  if (
    issues.some(
      (issue) => issue.fieldId !== selectedAPI && issue.fieldId !== "baseAPI",
    )
  )
    issues.push({ fieldId: "baseAPI", code: "inconsistent_value" })
  const key = values.key
  if (
    !key ||
    typeof key !== "object" ||
    !("kind" in key) ||
    !["unchanged", "replace"].includes(key.kind) ||
    (key.kind === "unchanged" && !detail) ||
    (key.kind === "replace" &&
      (!("value" in key) ||
        typeof key.value !== "string" ||
        !key.value.trim() ||
        /[,;，；\s]/.test(key.value.trim())))
  )
    invalid("key")
  const proxy = text(values, "proxy").trim()
  if (proxy && proxy !== "direct" && !isValidProxyUrl(proxy)) invalid("proxy")
  if (hasCustomEndpoints(detail)) {
    const modelsURL = text(values, "modelsURL").trim()
    if (modelsURL && !validLookupUrl(modelsURL)) invalid("modelsURL")
  }
  try {
    const headers: unknown = JSON.parse(text(values, "headers").trim() || "{}")
    if (
      !headers ||
      typeof headers !== "object" ||
      Array.isArray(headers) ||
      Object.values(headers).some((value) => typeof value !== "string")
    )
      invalid("headers")
  } catch {
    invalid("headers")
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

/** Validate the form as well as the connection needed for model discovery. */
export function validateMagpieValues(
  values: EditableResourceProjection,
  detail?: MagpieProvider,
): ResourceValidationResult {
  const connection = validateMagpieConnectionValues(values, detail)
  const issues: ResourceFieldIssue[] = connection.valid
    ? []
    : [...connection.issues]
  if (!text(values, "name").trim())
    issues.push({ fieldId: "name", code: "required" })
  if (!["enabled", "disabled"].includes(text(values, "status")))
    issues.push({ fieldId: "status", code: "invalid_value" })
  if (
    !Array.isArray(values.supportedModels) ||
    values.supportedModels.some((item) => typeof item !== "string")
  )
    issues.push({ fieldId: "supportedModels", code: "invalid_value" })
  const initial = initialValues(detail)
  if (
    values.routing !== initial.routing &&
    !routingModes.includes(text(values, "routing"))
  )
    issues.push({ fieldId: "routing", code: "invalid_value" })
  try {
    buildMagpieKeyPoolPatch(values, detail)
  } catch {
    issues.push({ fieldId: "keyPool", code: "invalid_value" })
  }
  if (hasCustomEndpoints(detail)) {
    const balanceURL = text(values, "balanceURL").trim()
    if (
      values.balanceURL !== initial.balanceURL &&
      balanceURL &&
      !validLookupUrl(balanceURL)
    )
      issues.push({ fieldId: "balanceURL", code: "invalid_value" })
  }
  for (const [field, { max, step }] of Object.entries(limits)) {
    const value = values[field]
    // A newer deployment may have different bounds. Preserve untouched values.
    if ((detail && value === initial[field]) || value === "") continue
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > max ||
      Math.abs(value / step - Math.round(value / step)) > 1e-7
    )
      issues.push({ fieldId: field, code: "invalid_value" })
  }
  return issues.length ? { valid: false, issues } : { valid: true }
}

/** Seed native endpoints from the source protocol, without inventing other support. */
export function magpieImportProjection(
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection {
  const protocol =
    MAGPIE_ENDPOINT_FIELDS.find((field) => field === seed.channelType) ?? "chat"
  return {
    ...initialValues(),
    name: seed.name,
    baseAPI: protocol,
    [protocol]: seed.baseUrl,
    status: seed.enabled ? "enabled" : "disabled",
    supportedModels: [...seed.models],
    key: { kind: "replace", value: seed.credential },
  }
}

/** The editor owns user changes; fresh native reads own preservation at save time. */
export function magpieEditor(
  detail?: MagpieProvider,
): NativeResourceEditorDefinition<MagpieProviderCommand> {
  const initial = initialValues(detail)
  const fields: ResourceFieldDescriptor[] = [
    { fieldId: "name", type: "text", required: true },
    {
      fieldId: "baseAPI",
      type: "select",
      options: [
        ...new Set([...MAGPIE_ENDPOINT_FIELDS, text(initial, "baseAPI")]),
      ].map((value) => ({ value })),
    },
    ...MAGPIE_ENDPOINT_FIELDS.map((fieldId) => ({
      fieldId,
      type: "text" as const,
    })),
    {
      fieldId: "key",
      type: "secret",
      required: !detail,
      canReplace: true,
      allowClear: false,
      canLoadSecret: Boolean(detail?.key.set),
      secretState: detail?.key.set ? "available" : "unavailable",
    },
    {
      fieldId: "supportedModels",
      type: "multi-select",
      options: [
        ...new Set([
          ...(detail?.chosen ?? []),
          ...(detail?.models ?? []).map((model) => model.id),
        ]),
      ].map((value) => ({ value })),
      optionLoader: {
        dependsOn: [
          ...MAGPIE_ENDPOINT_FIELDS,
          "key",
          "proxy",
          "headers",
          ...(hasCustomEndpoints(detail) ? ["modelsURL", "catalog"] : []),
        ],
        trigger: "manual",
      },
    },
    {
      fieldId: "status",
      type: "select",
      options: [{ value: "enabled" }, { value: "disabled" }],
    },
    { fieldId: "proxy", type: "text" },
    { fieldId: "headers", type: "textarea" },
    magpieKeyPoolField(detail),
    {
      fieldId: "routing",
      type: "select",
      options: [...new Set([...routingModes, text(initial, "routing")])].map(
        (value) => ({ value }),
      ),
    },
    ...customFields.map((fieldId) => ({
      fieldId,
      type: "text" as const,
      readOnly: !hasCustomEndpoints(detail),
    })),
    ...Object.entries(limits).map(([fieldId, bounds]) => ({
      fieldId,
      type: "number" as const,
      min: 0,
      ...bounds,
    })),
  ]
  return {
    fields,
    initialValues: initial,
    validate: (values) => validateMagpieValues(values, detail),
    buildCommand: (values) => {
      if (!validateMagpieValues(values, detail).valid)
        throw new ManagedResourceError({ code: "validation_failed" })
      const changed: Record<string, unknown> = {}
      for (const field of [
        "name",
        "baseAPI",
        ...MAGPIE_ENDPOINT_FIELDS,
        "proxy",
        "routing",
        ...(hasCustomEndpoints(detail) ? customFields : []),
      ]) {
        if (!detail || values[field] !== initial[field])
          changed[field] = text(values, field).trim()
      }
      for (const field of Object.keys(limits)) {
        // Omission keeps the backend's value; an explicitly blank control resets it.
        if (values[field] !== initial[field])
          changed[field] =
            values[field] === ""
              ? field === "maxConcurrency"
                ? null
                : 0
              : values[field]
      }
      if (
        !detail ||
        JSON.stringify(models(values.supportedModels)) !==
          JSON.stringify(models(initial.supportedModels))
      )
        changed.models = models(values.supportedModels)
      if (!detail || values.headers !== initial.headers)
        changed.headers = JSON.parse(text(values, "headers").trim() || "{}")
      const key = values.key
      if (
        key &&
        typeof key === "object" &&
        "kind" in key &&
        key.kind === "replace" &&
        "value" in key
      )
        changed.key = String(key.value).trim()
      const keyPool = buildMagpieKeyPoolPatch(values, detail)
      return {
        fields: changed,
        ...(keyPool ? { keyPool } : {}),
        ...(changed.key && detail?.keyList?.some((key) => key.active)
          ? { primaryKeyRef: detail.keyList.find((key) => key.active)!.id }
          : {}),
        ...(!detail || values.status !== initial.status
          ? { enabled: values.status === "enabled" }
          : {}),
      }
    },
  }
}
