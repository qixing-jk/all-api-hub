import {
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type {
  ResourceSecretListEntry,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"
import {
  cliProxyApiKeys,
  invalid,
  providerKind,
} from "~/services/apiAdapters/managedResources/cliProxyApiNativeRuntime"
import {
  CLI_PROXY_API_PROVIDER_KINDS,
  type CliProxyApiProvider,
  type CliProxyApiProviderKind,
  type CliProxyApiResource,
} from "~/services/apiService/cliProxyApi"
import { isValidProxyUrl } from "~/utils/core/proxyUrl"

const text = (values: EditableResourceProjection, field: string): string =>
  typeof values[field] === "string" ? (values[field] as string) : ""

/** Parse one model mapping per line and reject ambiguous aliases. */
function parseModels(
  value: string,
): NonNullable<CliProxyApiProvider["models"]> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("=").map((part) => part.trim())
      if (parts.length > 2 || !parts[0] || (parts.length === 2 && !parts[1]))
        throw invalid()
      return { name: parts[0], alias: parts[1] || parts[0] }
    })
}

/** Parse header lines while preserving colons inside values. */
function parseHeaders(value: string): Record<string, string> {
  const entries = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(":")
      if (index <= 0) throw invalid()
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    })
  return Object.fromEntries(entries)
}

/** Validate the shared editor projection against provider requirements. */
export function validate(
  values: EditableResourceProjection,
  detail?: CliProxyApiResource,
): ResourceValidationResult {
  const issues: ResourceFieldIssue[] = []
  const add = (fieldId: string) =>
    issues.push({ fieldId, code: "invalid_value" })
  let kind: CliProxyApiProviderKind
  try {
    kind = providerKind(text(values, "type"))
  } catch {
    return {
      valid: false,
      issues: [{ fieldId: "type", code: "unsupported_option" }],
    }
  }
  if (kind === "openai-compatibility" && !text(values, "name").trim())
    add("name")
  for (const field of ["baseURL", "proxy_url"]) {
    if (field === "proxy_url" && kind === "openai-compatibility") continue
    const value = text(values, field).trim()
    if (!value) {
      if (
        field === "baseURL" &&
        ["openai-compatibility", "codex-api-key"].includes(kind)
      )
        add(field)
      continue
    }
    if (field === "proxy_url") {
      if (!isValidProxyUrl(value)) add(field)
      continue
    }
    try {
      const url = new URL(value)
      if (!["http:", "https:"].includes(url.protocol)) add(field)
    } catch {
      add(field)
    }
  }
  try {
    parseModels(text(values, "supportedModels"))
  } catch {
    add("supportedModels")
  }
  try {
    parseHeaders(text(values, "headers"))
  } catch {
    add("headers")
  }
  const secret = values.key
  if (kind === "openai-compatibility") {
    try {
      buildCredentials(values, detail?.value)
    } catch {
      add("credentials")
    }
  } else if (
    !secret ||
    typeof secret !== "object" ||
    !("kind" in secret) ||
    secret.kind === "clear" ||
    (secret.kind === "replace" && !secret.value.trim())
  )
    add("key")
  return issues.length ? { valid: false, issues } : { valid: true }
}

/** Decode only this editor's credential rows; never infer a saved secret from a list position supplied by the UI. */
function credentialRows(
  values: EditableResourceProjection,
): readonly ResourceSecretListEntry[] {
  const value = values.credentials
  if (
    !value ||
    typeof value !== "object" ||
    !("kind" in value) ||
    value.kind !== "secret-list" ||
    !Array.isArray(value.entries)
  )
    throw invalid()
  const ids = new Set<string>()
  for (const row of value.entries) {
    if (
      !row ||
      typeof row.id !== "string" ||
      !row.id ||
      ids.has(row.id) ||
      !row.secret ||
      typeof row.secret !== "object" ||
      !row.fields ||
      typeof row.fields !== "object" ||
      Array.isArray(row.fields)
    )
      throw invalid()
    if (Object.values(row.fields).some((value) => typeof value !== "string"))
      throw invalid()
    ids.add(row.id)
  }
  return value.entries
}

/** Keep saved keys as unchanged intents and expose only their editable non-secret attributes. */
function credentialProjection(
  value?: CliProxyApiProvider,
): ResourceSecretListValue {
  return {
    kind: "secret-list",
    entries: value
      ? (value["api-key-entries"] ?? []).map((entry, index) => ({
          id: `saved-${index}`,
          secret: { kind: "unchanged" },
          fields: {
            proxy_url: String(entry["proxy-url"] ?? ""),
            weight: entry.weight == null ? "" : String(entry.weight),
          },
        }))
      : [{ id: "new", secret: { kind: "replace", value: "" }, fields: {} }],
  }
}

/** Reconstruct native entries from scoped row ids, preserving unknown per-key fields and omitted defaults. */
function buildCredentials(
  values: EditableResourceProjection,
  original?: CliProxyApiProvider,
): NonNullable<CliProxyApiProvider["api-key-entries"]> {
  const saved = new Map(
    (original?.["api-key-entries"] ?? []).map((entry, index) => [
      `saved-${index}`,
      entry,
    ]),
  )
  return credentialRows(values).map((row) => {
    const existing = saved.get(row.id)
    const secret =
      row.secret.kind === "unchanged"
        ? existing?.["api-key"]
        : row.secret.kind === "replace" && typeof row.secret.value === "string"
          ? row.secret.value.trim()
          : undefined
    if (!secret) throw invalid()
    const entry: NonNullable<CliProxyApiProvider["api-key-entries"]>[number] = {
      ...existing,
      "api-key": secret,
    }
    const proxy = (row.fields.proxy_url ?? "").trim()
    if (proxy && !isValidProxyUrl(proxy)) throw invalid()
    if (!existing || proxy !== String(existing["proxy-url"] ?? ""))
      entry["proxy-url"] = proxy
    const weight = (row.fields.weight ?? "").trim()
    // CLIProxyAPI config_types.go OpenAICompatibilityAPIKey: omitted weight defaults to 1; non-positive values exclude the key.
    if (
      weight &&
      (!/^-?\d+$/.test(weight) ||
        !Number.isSafeInteger(Number(weight)) ||
        Number(weight) > 1_000_000)
    )
      throw invalid()
    if (weight !== (existing?.weight == null ? "" : String(existing.weight))) {
      if (weight) entry.weight = Number(weight)
      else delete entry.weight
    }
    return entry
  })
}

/** Build a native editor that retains fields the user has not changed. */
export function editor(detail?: CliProxyApiResource) {
  const value = detail?.value ?? {}
  const keys = detail ? cliProxyApiKeys(detail) : []
  const fields: ResourceFieldDescriptor[] = [
    {
      fieldId: "type",
      type: "select",
      required: true,
      readOnly: !!detail,
      options: CLI_PROXY_API_PROVIDER_KINDS.map((value) => ({
        value,
      })),
    },
    { fieldId: "name", type: "text" },
    { fieldId: "status", type: "boolean" },
    { fieldId: "baseURL", type: "text" },
    {
      fieldId: "key",
      type: "secret",
      required: true,
      secretState: keys.some(Boolean) ? "available" : "unavailable",
      canReplace: keys.length <= 1,
      canLoadSecret: keys.length === 1,
      allowClear: false,
      ...(keys.length > 1
        ? { readOnly: true, replacementBlockReason: "multiple_credentials" }
        : {}),
    },
    {
      fieldId: "credentials",
      type: "secret-list",
      savedEntries: (value["api-key-entries"] ?? []).map((entry, index) => ({
        id: `saved-${index}`,
        secretState: entry["api-key"] ? "available" : "unavailable",
        loadFieldId: `credentials:saved-${index}`,
      })),
      entryFields: [
        { fieldId: "proxy_url", type: "text" },
        { fieldId: "weight", type: "number", max: 1_000_000 },
      ],
    },
    { fieldId: "supportedModels", type: "textarea" },
    { fieldId: "proxy_url", type: "text" },
    { fieldId: "prefix", type: "text" },
    { fieldId: "headers", type: "textarea" },
    { fieldId: "excluded_models", type: "textarea" },
  ]
  const initialValues: EditableResourceProjection = {
    type: detail?.kind ?? "openai-compatibility",
    name: value.name ?? "",
    status:
      value.disabled !== true &&
      !(
        Array.isArray(value["excluded-models"]) &&
        value["excluded-models"].includes("*")
      ),
    baseURL: value["base-url"] ?? "",
    key: detail ? { kind: "unchanged" } : { kind: "replace", value: "" },
    credentials: credentialProjection(
      detail?.kind === "openai-compatibility" ? value : undefined,
    ),
    supportedModels: (value.models ?? [])
      .map((model) =>
        model.alias && model.alias !== model.name
          ? `${model.name} = ${model.alias}`
          : model.name,
      )
      .join("\n"),
    proxy_url:
      detail?.kind === "openai-compatibility"
        ? String(value["api-key-entries"]?.[0]?.["proxy-url"] ?? "")
        : typeof value["proxy-url"] === "string"
          ? value["proxy-url"]
          : "",
    prefix: typeof value.prefix === "string" ? value.prefix : "",
    headers:
      value.headers && typeof value.headers === "object"
        ? Object.entries(value.headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n")
        : "",
    excluded_models: Array.isArray(value["excluded-models"])
      ? value["excluded-models"].join("\n")
      : "",
  }
  return {
    fields,
    initialValues,
    validate: (values: EditableResourceProjection) => validate(values, detail),
    loadSecret: async (fieldId: string) => {
      const entry = fields.find((field) => field.type === "secret-list")
      if (
        detail?.kind === "openai-compatibility" &&
        entry?.type === "secret-list"
      ) {
        const index = entry.savedEntries.findIndex(
          (item) => item.loadFieldId === fieldId,
        )
        const savedEntry = value["api-key-entries"]?.[index]
        if (index >= 0 && savedEntry) return savedEntry["api-key"]
      }
      if (fieldId !== "key" || keys.length !== 1) throw invalid()
      const [key] = keys
      if (key === undefined) throw invalid()
      return key
    },
    buildCommand: (values: EditableResourceProjection) => {
      const kind = providerKind(text(values, "type"))
      if (detail && detail.kind !== kind) throw invalid()
      const next: CliProxyApiProvider = { ...value }
      if (kind === "openai-compatibility")
        next["api-key-entries"] = buildCredentials(values, detail?.value)
      const changed = (field: string) =>
        !detail || values[field] !== initialValues[field]
      if (changed("baseURL")) next["base-url"] = text(values, "baseURL").trim()
      if (changed("prefix")) next.prefix = text(values, "prefix").trim()
      // Retain per-model native fields when only aliases/names are edited.
      if (changed("supportedModels"))
        next.models = parseModels(text(values, "supportedModels")).map(
          (model) => ({
            ...value.models?.find((entry) => entry.name === model.name),
            ...model,
          }),
        )
      if (changed("headers"))
        next.headers = parseHeaders(text(values, "headers"))
      if (kind !== "openai-compatibility" && changed("excluded_models"))
        next["excluded-models"] = text(values, "excluded_models")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      if (kind === "openai-compatibility" && changed("name"))
        next.name = text(values, "name").trim()
      const secret = values.key
      if (
        kind !== "openai-compatibility" &&
        secret &&
        typeof secret === "object" &&
        "kind" in secret &&
        secret.kind === "replace"
      ) {
        next["api-key"] = secret.value.trim()
      } else if (!detail && kind !== "openai-compatibility") throw invalid()
      if (kind !== "openai-compatibility" && changed("proxy_url"))
        next["proxy-url"] = text(values, "proxy_url").trim()
      if (changed("status")) {
        if (typeof values.status !== "boolean") throw invalid()
        if (kind === "openai-compatibility") next.disabled = !values.status
        else {
          const excluded = Array.isArray(next["excluded-models"])
            ? next["excluded-models"].filter((model) => model !== "*")
            : []
          next["excluded-models"] = values.status
            ? excluded
            : [...excluded, "*"]
        }
      }
      return {
        kind,
        value: next,
        expected: detail ? JSON.stringify(detail.value) : undefined,
      }
    },
  }
}

export type Command = {
  kind: CliProxyApiProviderKind
  value: CliProxyApiProvider
  expected?: string
}

/** Map a shared channel import seed into the native provider editor. */
export function importProjection(
  seed: ManagedChannelImportCreateSeed,
): EditableResourceProjection {
  return {
    ...editor().initialValues,
    type: seed.channelType,
    status: seed.enabled,
    name: seed.name,
    baseURL: seed.baseUrl,
    key: { kind: "replace", value: seed.credential },
    credentials: {
      kind: "secret-list",
      entries: [
        {
          id: "new",
          secret: { kind: "replace", value: seed.credential },
          fields: {},
        },
      ],
    },
    supportedModels: seed.models.join("\n"),
  }
}
