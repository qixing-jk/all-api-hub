import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  ManagedResourceError,
  type EditableResourceProjection,
  type ManagedChannelImportCreateSeed,
  type ManagedResourceRef,
  type ResourceDisplayFacts,
  type ResourceFailure,
  type ResourceFieldDescriptor,
  type ResourceFieldIssue,
  type ResourceOperationOptions,
  type ResourceValidationResult,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import type {
  ResourceSecretListEntry,
  ResourceSecretListValue,
} from "~/services/apiAdapters/contracts/resourceNative"
import { defineNativeResourceKind } from "~/services/apiAdapters/managedResources/factory"
import {
  CLI_PROXY_API_PROVIDER_KINDS,
  CliProxyApiError,
  cliProxyApiManagementUrl,
  cliProxyApiResource,
  listAllCliProxyApiProviders,
  listCliProxyApiProviders,
  requestCliProxyApi,
  type CliProxyApiProvider,
  type CliProxyApiProviderKind,
  type CliProxyApiResource,
} from "~/services/apiService/cliProxyApi"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type { ManagedSiteMutationResult } from "~/services/managedSites/mutations"
import { getManagedSiteRuntimeConfigForType } from "~/services/managedSites/runtimeConfig"
import type { CliProxyApiConfig } from "~/types/cliProxyApiConfig"

const invalid = () => new ManagedResourceError({ code: "validation_failed" })
export const cliProxyApiScope = (config: CliProxyApiConfig) =>
  cliProxyApiManagementUrl(config.baseUrl).href

/** Map native failures without exposing management response bodies. */
function cliProxyApiFailure(error: unknown): ResourceFailure {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof Error && error.name === "AbortError")
    return { code: "aborted" }
  if (error instanceof CliProxyApiError) {
    const code =
      error.status === 401
        ? "authentication_failed"
        : error.status === 403
          ? "permission_denied"
          : error.status === 404
            ? "not_found"
            : error.status === 400
              ? "upstream_rejected"
              : "unavailable"
    return { code }
  }
  return { code: "unexpected" }
}

/** Scope a provider reference to its management deployment. */
export function cliProxyApiRef(
  config: CliProxyApiConfig,
  resource: CliProxyApiResource,
): ManagedResourceRef {
  return {
    siteType: SITE_TYPES.CLI_PROXY_API,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: cliProxyApiScope(config),
    resourceId: resource.id,
  }
}

/** Read native credentials for internal matching and explicit secret access. */
export function cliProxyApiKeys(resource: CliProxyApiResource): string[] {
  return resource.kind === "openai-compatibility"
    ? (resource.value["api-key-entries"] ?? []).map((entry) => entry["api-key"])
    : [resource.value["api-key"] ?? ""]
}

/** Project a provider into display facts without exposing its credentials. */
function toFacts(
  resource: CliProxyApiResource,
  ref: ManagedResourceRef,
): ResourceDisplayFacts {
  const value = resource.value
  const name = value.name || value["base-url"] || resource.kind
  return {
    ref,
    displayName: name,
    status:
      value.disabled === true ||
      (Array.isArray(value["excluded-models"]) &&
        value["excluded-models"].includes("*"))
        ? "disabled"
        : "enabled",
    fields: [
      { fieldId: "name", kind: "text", value: name },
      { fieldId: "type", kind: "text", value: resource.kind },
      {
        fieldId: "status",
        kind: "text",
        value:
          value.disabled === true ||
          (Array.isArray(value["excluded-models"]) &&
            value["excluded-models"].includes("*"))
            ? "disabled"
            : "enabled",
      },
      { fieldId: "baseURL", kind: "text", value: value["base-url"] ?? "" },
      {
        fieldId: "supportedModels",
        kind: "list",
        value: (value.models ?? []).map((model) => model.alias || model.name),
      },
      {
        fieldId: "key",
        kind: "secret",
        state: cliProxyApiKeys(resource).some(Boolean)
          ? "available"
          : "unavailable",
      },
      {
        fieldId: "proxy_url",
        kind: "text",
        value: typeof value["proxy-url"] === "string" ? value["proxy-url"] : "",
      },
      {
        fieldId: "prefix",
        kind: "text",
        value: typeof value.prefix === "string" ? value.prefix : "",
      },
    ],
    actions: { canUpdate: true, canDelete: true },
  }
}

const text = (values: EditableResourceProjection, field: string): string =>
  typeof values[field] === "string" ? (values[field] as string) : ""
const providerKind = (value: string): CliProxyApiProviderKind => {
  if (!CLI_PROXY_API_PROVIDER_KINDS.includes(value as CliProxyApiProviderKind))
    throw invalid()
  return value as CliProxyApiProviderKind
}

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
function validate(
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
    try {
      const url = new URL(value)
      const protocols =
        field === "proxy_url"
          ? ["http:", "https:", "socks5:", "socks5h:"]
          : ["http:", "https:"]
      if (!protocols.includes(url.protocol)) add(field)
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
    if (proxy) {
      let url: URL
      try {
        url = new URL(proxy)
      } catch {
        throw invalid()
      }
      if (!["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol))
        throw invalid()
    }
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
function editor(detail?: CliProxyApiResource) {
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
        if (index >= 0) return value["api-key-entries"]![index]["api-key"]
      }
      if (fieldId !== "key" || keys.length !== 1) throw invalid()
      return keys[0]
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

const decodeId = (id: string) => {
  const [kind, digest] = id.split(":")
  providerKind(kind)
  if (!/^[a-f0-9]{64}$/.test(digest ?? "")) throw invalid()
  return id
}

/** Resolve exactly one provider from its current collection by identity. */
export async function getCliProxyApiResource(
  config: CliProxyApiConfig,
  id: string,
  options?: ResourceOperationOptions,
): Promise<CliProxyApiResource> {
  decodeId(id)
  const list = await listCliProxyApiProviders(
    config,
    providerKind(id.split(":")[0]),
    options,
  )
  const matches = list.filter((item) => item.id === id)
  if (matches.length !== 1)
    throw new ManagedResourceError({
      code: matches.length ? "validation_failed" : "not_found",
    })
  return matches[0]
}

type Command = {
  kind: CliProxyApiProviderKind
  value: CliProxyApiProvider
  expected?: string
}

/** Compare persisted editable values while accepting omitted empty/default fields. */
function normalizedConfiguration(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return undefined
  if (Array.isArray(value))
    return value.length ? value.map(normalizedConfiguration) : undefined
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, value]) => {
        const normalized = normalizedConfiguration(value)
        return normalized === undefined ? [] : [[key, normalized]]
      })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  return value
}

/** Confirm the server persisted the requested editable configuration. */
function confirmsEditableConfiguration(
  expected: CliProxyApiProvider,
  actual: CliProxyApiProvider,
) {
  return [
    "name",
    "base-url",
    "api-key",
    "api-key-entries",
    "models",
    "prefix",
    "headers",
    "proxy-url",
    "excluded-models",
    "disabled",
  ].every((key) => {
    if (key === "disabled")
      return Boolean(expected[key]) === Boolean(actual[key])
    const normalize = (provider: CliProxyApiProvider) =>
      normalizedConfiguration(
        key === "models"
          ? provider.models?.map((model) => ({
              ...model,
              alias: model.alias || model.name,
            }))
          : provider[key],
      )
    return (
      JSON.stringify(normalize(expected)) === JSON.stringify(normalize(actual))
    )
  })
}

/** Serialize this extension's collection writes; upstream has no compare-and-swap API. */
async function mutateUnlocked(
  config: CliProxyApiConfig,
  operation: "create" | "update" | "delete",
  command: Command | undefined,
  original: CliProxyApiResource | undefined,
  options?: ResourceOperationOptions,
): Promise<ManagedSiteMutationResult<CliProxyApiResource | undefined>> {
  let dispatched = false
  try {
    if (
      original &&
      command?.expected !== undefined &&
      JSON.stringify(original.value) !== command.expected
    )
      throw new ManagedResourceError({ code: "resource_changed" })
    const kind = command?.kind ?? original!.kind
    const list = await listCliProxyApiProviders(config, kind, options)
    const matches = original
      ? list.filter((item) => item.id === original.id)
      : []
    if (
      original &&
      (matches.length !== 1 ||
        JSON.stringify(matches[0].value) !== JSON.stringify(original.value))
    )
      throw new ManagedResourceError({ code: "resource_changed" })
    const next = command
      ? await cliProxyApiResource(kind, command.value)
      : undefined
    if (
      next &&
      list.some((item) => item.id === next.id && item.id !== original?.id)
    )
      throw invalid()
    const index = original
      ? list.findIndex((item) => item.id === original.id)
      : -1
    options?.signal?.throwIfAborted()
    dispatched = true
    if (operation === "delete") {
      await requestCliProxyApi(
        config,
        `${kind}?index=${index}`,
        "DELETE",
        undefined,
        options,
      )
    } else if (
      operation === "create" ||
      (["gemini-api-key", "interactions-api-key"].includes(kind) &&
        JSON.stringify(original?.value.models) !==
          JSON.stringify(next?.value.models))
    ) {
      // https://github.com/router-for-me/CLIProxyAPI/blob/7fac6b15/internal/api/handlers/management/config_lists.go
      // No POST exists; Gemini PATCH omits models entirely. PUT is required here.
      const values = list.map((item) => item.value)
      if (operation === "create") values.push(next!.value)
      else values[index] = next!.value
      await requestCliProxyApi(config, kind, "PUT", values, options)
    } else {
      await requestCliProxyApi(
        config,
        kind,
        "PATCH",
        { index, value: next!.value },
        options,
      )
    }
    const refreshed = await listCliProxyApiProviders(config, kind, options)
    const result = next ? refreshed.filter((item) => item.id === next.id) : []
    if (
      next
        ? result.length !== 1
        : refreshed.some((item) => item.id === original!.id)
    )
      throw new CliProxyApiError()
    if (next && !confirmsEditableConfiguration(next.value, result[0].value))
      throw new CliProxyApiError()
    return {
      outcome: "succeeded",
      data: result[0],
      confirmedEffects: [
        {
          kind:
            operation === "create"
              ? "resource-created"
              : operation === "delete"
                ? "resource-deleted"
                : "resource-updated",
          resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          resourceId: next?.id ?? original!.id,
        },
      ],
    }
  } catch (error) {
    return {
      outcome:
        dispatched &&
        (!(error instanceof CliProxyApiError) ||
          error.status === undefined ||
          error.status >= 500)
          ? "uncertain"
          : "rejected",
      diagnostic: {
        code: cliProxyApiFailure(error).code,
        message: cliProxyApiFailure(error).code,
      },
    }
  }
}

/** Coordinate read/modify/write across the extension's management callers. */
function mutate(...args: Parameters<typeof mutateUnlocked>) {
  return withExtensionStorageWriteLock(
    `cliproxy:${cliProxyApiScope(args[0])}`,
    () => mutateUnlocked(...args),
  )
}

/** Map a shared channel import seed into the native provider editor. */
function importProjection(
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
  create: async (config, command: Command, options) =>
    mutate(config, "create", command, undefined, options) as Promise<
      ManagedSiteMutationResult<CliProxyApiResource>
    >,
  update: async (config, detail, command: Command, options) =>
    mutate(config, "update", command, detail, options) as Promise<
      ManagedSiteMutationResult<CliProxyApiResource>
    >,
  delete: async (config, id, options) => {
    const result = await mutate(
      config,
      "delete",
      undefined,
      await getCliProxyApiResource(config, id, options),
      options,
    )
    return result.outcome === "succeeded"
      ? { ...result, data: undefined }
      : (result as ManagedSiteMutationResult<void>)
  },
  mapFailure: cliProxyApiFailure,
})
