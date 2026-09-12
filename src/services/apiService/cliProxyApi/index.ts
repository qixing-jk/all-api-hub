import type { ResourceOperationOptions } from "~/services/apiAdapters/contracts/resourceNative"
import type { CliProxyApiConfig } from "~/types/cliProxyApiConfig"

export const CLI_PROXY_API_PROVIDER_KINDS = [
  "openai-compatibility",
  "codex-api-key",
  "claude-api-key",
  "gemini-api-key",
  "vertex-api-key",
  "xai-api-key",
  "interactions-api-key",
] as const
export type CliProxyApiProviderKind =
  (typeof CLI_PROXY_API_PROVIDER_KINDS)[number]
export type CliProxyApiProvider = Record<string, unknown> & {
  name?: string
  "base-url"?: string
  "api-key"?: string
  "api-key-entries"?: Array<Record<string, unknown> & { "api-key": string }>
  models?: Array<Record<string, unknown> & { name: string; alias?: string }>
}
export type CliProxyApiResource = {
  id: string
  kind: CliProxyApiProviderKind
  value: CliProxyApiProvider
}

export class CliProxyApiError extends Error {
  constructor(readonly status?: number) {
    // Management replies may contain credentials: never forward raw bodies.
    super(
      status === undefined
        ? "CLIProxyAPI request failed"
        : `CLIProxyAPI HTTP ${status}`,
    )
    this.name = "CliProxyApiError"
  }
}

/** Accept a deployment root or the released /v0/management setting, including reverse-proxy prefixes. */
export function cliProxyApiManagementUrl(baseUrl: string): URL {
  const url = new URL(baseUrl.trim())
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new CliProxyApiError(400)
  }
  url.search = ""
  url.hash = ""
  const pathname = url.pathname
    .replace(/\/+$/, "")
    .replace(/\/management\.html$/, "")
  url.pathname = pathname.endsWith("/v0/management")
    ? pathname
    : `${pathname}/v0/management`
  return url
}

/** CLIProxyAPI config_lists.go at 7fac6b15: Bearer management key, GET envelopes, PUT collection replacement. */
export async function requestCliProxyApi(
  config: CliProxyApiConfig,
  path: string,
  method: "GET" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  options?: ResourceOperationOptions,
): Promise<unknown> {
  const url = cliProxyApiManagementUrl(config.baseUrl)
  const [pathname, query] = path.split("?")
  url.pathname += `/${pathname}`
  url.search = query ?? ""
  const callerSignal = options?.signal
  if (callerSignal?.aborted) throw callerSignal.reason
  const controller = new AbortController()
  const cancel = () => controller.abort(callerSignal?.reason)
  callerSignal?.addEventListener("abort", cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.adminToken.trim()}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    })
    if (!response.ok) throw new CliProxyApiError(response.status)
    const result: unknown = await response.json()
    if (
      method !== "GET" &&
      (!result ||
        typeof result !== "object" ||
        !("status" in result) ||
        result.status !== "ok")
    ) {
      throw new CliProxyApiError()
    }
    return result
  } catch (error) {
    if (callerSignal?.aborted || error instanceof CliProxyApiError) throw error
    throw new CliProxyApiError()
  } finally {
    clearTimeout(timeout)
    callerSignal?.removeEventListener("abort", cancel)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/** GET adds auth-index metadata which is not part of the persisted provider configuration. */
function stripReadMetadata(
  value: Record<string, unknown>,
): CliProxyApiProvider {
  const { "auth-index": _authIndex, ...provider } = value
  // Nil Go slices/maps are valid empty optional configuration, including older management responses.
  for (const field of [
    "models",
    "api-key-entries",
    "headers",
    "excluded-models",
  ]) {
    if (provider[field] === null) delete provider[field]
  }
  if (Array.isArray(provider["api-key-entries"])) {
    provider["api-key-entries"] = provider["api-key-entries"].map((entry) => {
      if (!isRecord(entry)) throw new CliProxyApiError()
      const { "auth-index": _index, ...credential } = entry
      return credential
    })
  }
  return provider as CliProxyApiProvider
}

/** Public resource identities must never contain API keys or depend on list positions. */
async function providerId(
  kind: CliProxyApiProviderKind,
  value: CliProxyApiProvider,
): Promise<string> {
  const identity =
    kind === "openai-compatibility"
      ? [value.name ?? "", value["base-url"] ?? ""]
      : [value["api-key"] ?? "", value["base-url"] ?? "", value.prefix ?? ""]
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([kind, ...identity])),
  )
  return `${kind}:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

/** Attach a deterministic opaque identity to native provider configuration. */
export async function cliProxyApiResource(
  kind: CliProxyApiProviderKind,
  value: CliProxyApiProvider,
): Promise<CliProxyApiResource> {
  return { kind, value, id: await providerId(kind, value) }
}

/** Validate a provider collection before allowing read-modify-write operations. */
export async function listCliProxyApiProviders(
  config: CliProxyApiConfig,
  kind: CliProxyApiProviderKind,
  options?: ResourceOperationOptions,
): Promise<CliProxyApiResource[]> {
  const response = await requestCliProxyApi(
    config,
    kind,
    "GET",
    undefined,
    options,
  )
  const list = Array.isArray(response)
    ? response
    : isRecord(response)
      ? response[kind]
      : undefined
  if (list !== null && !Array.isArray(list)) throw new CliProxyApiError()
  return Promise.all(
    (list ?? []).map((value: unknown) => {
      if (!isRecord(value)) throw new CliProxyApiError()
      const provider = stripReadMetadata(value)
      for (const field of [
        "name",
        "base-url",
        "api-key",
        "prefix",
        "proxy-url",
      ])
        if (
          provider[field] !== undefined &&
          typeof provider[field] !== "string"
        )
          throw new CliProxyApiError()
      if (
        provider.models !== undefined &&
        (!Array.isArray(provider.models) ||
          provider.models.some(
            (model) =>
              !isRecord(model) ||
              typeof model.name !== "string" ||
              (model.alias !== undefined && typeof model.alias !== "string"),
          ))
      )
        throw new CliProxyApiError()
      if (
        provider["api-key-entries"] !== undefined &&
        (!Array.isArray(provider["api-key-entries"]) ||
          provider["api-key-entries"].some(
            (entry) => !isRecord(entry) || typeof entry["api-key"] !== "string",
          ))
      )
        throw new CliProxyApiError()
      if (
        provider.headers !== undefined &&
        (!isRecord(provider.headers) ||
          Object.values(provider.headers).some(
            (header) => typeof header !== "string",
          ))
      )
        throw new CliProxyApiError()
      if (
        provider["excluded-models"] !== undefined &&
        (!Array.isArray(provider["excluded-models"]) ||
          provider["excluded-models"].some(
            (model) => typeof model !== "string",
          ))
      )
        throw new CliProxyApiError()
      if (
        kind === "openai-compatibility"
          ? typeof provider.name !== "string" ||
            typeof provider["base-url"] !== "string"
          : typeof provider["api-key"] !== "string"
      )
        throw new CliProxyApiError()
      return cliProxyApiResource(kind, provider)
    }),
  )
}

/** Read all supported families, tolerating absent later-added endpoints. */
export async function listAllCliProxyApiProviders(
  config: CliProxyApiConfig,
  options?: ResourceOperationOptions,
) {
  return (
    await Promise.all(
      CLI_PROXY_API_PROVIDER_KINDS.map(async (kind) => {
        try {
          return await listCliProxyApiProviders(config, kind, options)
        } catch (error) {
          // Older releases do not expose these later-added provider families.
          if (
            ["vertex-api-key", "xai-api-key", "interactions-api-key"].includes(
              kind,
            ) &&
            error instanceof CliProxyApiError &&
            error.status === 404
          )
            return []
          throw error
        }
      }),
    )
  ).flat()
}
