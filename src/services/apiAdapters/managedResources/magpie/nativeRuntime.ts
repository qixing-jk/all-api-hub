import {
  ManagedResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  listMagpieProviders,
  type MagpieProvider,
} from "~/services/apiService/magpie/providers"
import {
  MagpieApiError,
  type MagpieRequestOptions,
} from "~/services/apiService/magpie/request"
import { normalizeMagpieBaseUrl, type MagpieConfig } from "~/types/magpieConfig"

export const magpieScope = (config: MagpieConfig) =>
  normalizeMagpieBaseUrl(config.baseUrl)

/** Keep subscription-owned providers visible but outside API-key mutations. */
export function requireMagpieApiProvider(provider: MagpieProvider) {
  if (provider.account)
    throw new ManagedResourceError({ code: "permission_denied" })
  return provider
}

/** Resolve a native id from a fresh complete inventory. */
export async function getMagpieProvider(
  config: MagpieConfig,
  id: string,
  options?: MagpieRequestOptions,
) {
  const provider = (await listMagpieProviders(config, options)).find(
    (item) => item.id === id,
  )
  if (!provider) throw new ManagedResourceError({ code: "not_found" })
  return provider
}

/** Translate protocol evidence into the existing resource recovery vocabulary. */
export function magpieFailure(error: unknown): ResourceFailure {
  if (error instanceof ManagedResourceError) return error.failure
  if (error instanceof Error && error.name === "AbortError")
    return { code: "aborted" }
  if (error instanceof MagpieApiError)
    return {
      code:
        error.status === 401
          ? "authentication_failed"
          : error.status === 403
            ? "permission_denied"
            : error.status === 404
              ? "not_found"
              : "unavailable",
      message: error.message,
    }
  return { code: "unexpected" }
}
