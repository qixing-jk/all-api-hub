import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  RESOURCE_FIELD_TYPES as types,
  type EditableResourceProjection,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceFieldOption,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  encodeNovitaConsoleCredential,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import {
  fetchNovitaManagementModels,
  type NovitaModelPolicy,
} from "~/services/apiService/novita/keyManagement"
import { fetchNovitaPublicModelCatalog } from "~/services/apiService/novita/publicModelCatalog"
import { isNovitaAuthFailureError } from "~/services/apiService/novita/transport"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type NovitaKeyCommand = {
  name: string
  lifecycle: string
  modelPolicy: NovitaModelPolicy
  allowedIps: string[]
}

const list = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    : []
const isIpv4 = (value: string) => {
  const octets = value.split(".")
  return (
    octets.length === 4 &&
    octets.every(
      (part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
    )
  )
}
const isAllowedIp = (value: string) => {
  if (!value.includes("/")) return isIpv4(value)
  const parts = value.split("/")
  return (
    parts.length === 2 &&
    isIpv4(parts[0] ?? "") &&
    /^(0|[1-9]|[12]\d|3[0-2])$/.test(parts[1] ?? "") &&
    value !== "0.0.0.0/0"
  )
}
const lifecycleValues = ["permanent", "90d", "30d", "24h"]

/** Native lifecycle is immutable; model and network policies remain editable. */
export function novitaKeyEditor(
  request: ApiServiceRequest,
  baseline?: {
    name: string
    modelPolicy: NovitaModelPolicy
    allowedIps: string[]
    canRename?: boolean
  },
  nameHint?: string,
): AccountKeyResourceEditorDefinition<NovitaKeyCommand> {
  const { apiKey, consoleToken } = parseNovitaCredentials(
    request.auth.accessToken,
  )
  const savedModelOptions = [
    ...new Set([
      ...(baseline?.modelPolicy.allowedModels.map((model) => model.id) ?? []),
      ...(baseline?.modelPolicy.excludedModels.map((model) => model.id) ?? []),
    ]),
  ].map((value) => ({ value, displayLabel: value }))
  let publicHintsRequest: Promise<ResourceFieldOption[]> | undefined
  const loadPublicHints = () => {
    publicHintsRequest ??= fetchNovitaPublicModelCatalog(request.abortSignal)
      .then((models) => {
        const hints = new Map(
          savedModelOptions.map((option) => [option.value, option]),
        )
        for (const model of models) {
          const id = model.id.trim()
          if (!hints.has(id)) hints.set(id, { value: id, displayLabel: id })
        }
        return [...hints.values()]
      })
      .catch((error: unknown) => {
        publicHintsRequest = undefined
        if (request.abortSignal?.aborted) throw error
        // Suggestions are optional: an unavailable catalog must not block policy edits.
        return savedModelOptions
      })
    return publicHintsRequest
  }
  const fields: ResourceFieldDescriptor[] = [
    ...(baseline?.canRename === false
      ? []
      : [{ fieldId: "name", type: types.Text, required: true }]),
    ...(!baseline
      ? [
          {
            fieldId: "lifecycle",
            type: types.Select,
            required: true,
            options: lifecycleValues.map((value) => ({ value })),
          } as ResourceFieldDescriptor,
        ]
      : []),
    {
      fieldId: "model_mode",
      type: types.Select,
      required: true,
      options: [{ value: "all_enabled" }, { value: "selected" }],
    },
    {
      fieldId: "excluded_models",
      type: types.MultiSelect,
      allowCustom: true,
      options: savedModelOptions,
      optionLoader: { dependsOn: [] },
    },
    {
      fieldId: "allowed_models",
      type: types.MultiSelect,
      allowCustom: true,
      options: savedModelOptions,
      optionLoader: { dependsOn: [] },
    },
    { fieldId: "ip_restricted", type: types.Boolean },
    { fieldId: "allowed_ips", type: types.Textarea },
  ]
  const initialValues: EditableResourceProjection = {
    name:
      baseline?.name ?? (nameHint?.trim() || DEFAULT_AUTO_PROVISION_KEY_NAME),
    ...(!baseline ? { lifecycle: "permanent" } : {}),
    model_mode: baseline?.modelPolicy.mode ?? "all_enabled",
    allowed_models:
      baseline?.modelPolicy.allowedModels.map((model) => model.id) ?? [],
    excluded_models:
      baseline?.modelPolicy.excludedModels.map((model) => model.id) ?? [],
    ip_restricted: Boolean(baseline?.allowedIps.length),
    allowed_ips: baseline?.allowedIps.join("\n") ?? "",
  }
  return {
    fields,
    initialValues,
    loadOptions: async () => {
      // The public catalog offers hints, not an account-specific policy allowlist.
      if (!consoleToken) return loadPublicHints()
      try {
        return await fetchNovitaManagementModels({
          ...request,
          auth: {
            ...request.auth,
            accessToken: encodeNovitaConsoleCredential(consoleToken),
          },
        })
      } catch (error) {
        if (apiKey && isNovitaAuthFailureError(error)) return loadPublicHints()
        throw error
      }
    },
    validate: (values) => {
      const issues: ResourceFieldIssue[] = []
      if (typeof values.name !== "string" || !values.name.trim())
        issues.push({ fieldId: "name", code: "required" })
      if (!baseline && !lifecycleValues.includes(String(values.lifecycle)))
        issues.push({ fieldId: "lifecycle", code: "unsupported_option" })
      if (!["all_enabled", "selected"].includes(String(values.model_mode)))
        issues.push({ fieldId: "model_mode", code: "unsupported_option" })
      const modelField =
        values.model_mode === "selected" ? "allowed_models" : "excluded_models"
      const models = values[modelField]
      if (
        !Array.isArray(models) ||
        models.some((id) => typeof id !== "string" || !id.trim()) ||
        (values.model_mode === "selected" && !models.length)
      )
        issues.push({ fieldId: modelField, code: "invalid_value" })
      const ips = list(values.allowed_ips)
      if (
        values.ip_restricted &&
        (!ips.length || ips.length > 100 || !ips.every(isAllowedIp))
      )
        issues.push({ fieldId: "allowed_ips", code: "invalid_value" })
      return issues.length ? { valid: false, issues } : { valid: true }
    },
    buildCommand: (values) => ({
      name: String(values.name).trim(),
      lifecycle: String(values.lifecycle ?? "permanent"),
      modelPolicy: {
        schemaVersion: 1,
        productScope: "model_api",
        mode: values.model_mode === "selected" ? "selected" : "all_enabled",
        allowedModels:
          values.model_mode === "selected"
            ? (values.allowed_models as string[]).map((id) => ({
                type: "llm",
                id,
              }))
            : [],
        excludedModels:
          values.model_mode === "all_enabled"
            ? (values.excluded_models as string[]).map((id) => ({
                type: "llm",
                id,
              }))
            : [],
      },
      allowedIps: values.ip_restricted
        ? [...new Set(list(values.allowed_ips))]
        : [],
    }),
  }
}
