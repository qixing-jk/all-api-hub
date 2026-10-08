import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  ManagedResourceError,
  type ManagedResourceRef,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  CLI_PROXY_API_PROVIDER_KINDS,
  CliProxyApiError,
  cliProxyApiManagementUrl,
  listCliProxyApiProviders,
  type CliProxyApiProviderKind,
  type CliProxyApiResource,
} from "~/services/apiService/cliProxyApi"
import type { CliProxyApiConfig } from "~/types/cliProxyApiConfig"

export const invalid = () =>
  new ManagedResourceError({ code: "validation_failed" })

export const providerKind = (value: string): CliProxyApiProviderKind => {
  if (!CLI_PROXY_API_PROVIDER_KINDS.includes(value as CliProxyApiProviderKind))
    throw invalid()
  return value as CliProxyApiProviderKind
}

export const cliProxyApiScope = (config: CliProxyApiConfig) =>
  cliProxyApiManagementUrl(config.baseUrl).href

/** Map native failures without exposing management response bodies. */
export function cliProxyApiFailure(error: unknown): ResourceFailure {
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

/** Validate a provider id and return its provider kind. */
const decodeProviderKind = (id: string) => {
  const [kind, digest] = id.split(":")
  if (!kind || !digest || !/^[a-f0-9]{64}$/.test(digest)) throw invalid()
  return providerKind(kind)
}

/** Validate a provider id without changing it. */
export const decodeId = (id: string) => {
  decodeProviderKind(id)
  return id
}

/** Resolve exactly one provider from its current collection by identity. */
export async function readCliProxyApiResource(
  config: CliProxyApiConfig,
  id: string,
  options?: ResourceOperationOptions,
) {
  const kind = decodeProviderKind(id)
  const list = await listCliProxyApiProviders(config, kind, options)
  const matches = list.filter((item) => item.id === id)
  const [resource] = matches
  if (!resource || matches.length !== 1)
    throw new ManagedResourceError({
      code: matches.length ? "validation_failed" : "not_found",
    })
  return { resource, list }
}

/** Read the current provider without retaining an inventory beyond this operation. */
export async function getCliProxyApiResource(
  config: CliProxyApiConfig,
  id: string,
  options?: ResourceOperationOptions,
): Promise<CliProxyApiResource> {
  return (await readCliProxyApiResource(config, id, options)).resource
}
