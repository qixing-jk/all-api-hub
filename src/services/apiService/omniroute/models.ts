/**
 * OmniRoute model catalogue.
 *
 * `GET /api/models` answers `{ models: [...] }` and is the deployment's own view
 * of which built-in providers it serves. OmniRoute has no per-channel model
 * list: models come from the provider catalogue plus gateway-level aliases and
 * a gateway disabled-list, and a connection only stores `defaultModel`.
 * https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/src/app/api/models/route.ts
 */

import type { OmniRouteModelEntry } from "~/types/omniroute"
import type { OmniRouteConfig } from "~/types/omnirouteConfig"

import { readOmniRouteModelEntries } from "./parsing"
import { callOmniRoute, type OmniRouteRequestOptions } from "./request"

/** Reads the gateway's model catalogue. */
async function listOmniRouteModels(
  config: OmniRouteConfig,
  options?: OmniRouteRequestOptions,
): Promise<OmniRouteModelEntry[]> {
  return readOmniRouteModelEntries(
    await callOmniRoute<unknown>({
      baseUrl: config.baseUrl,
      path: "/api/models",
      method: "GET",
      token: config.token,
      options,
    }),
  )
}

const readEntryId = (entry: OmniRouteModelEntry): string => {
  for (const candidate of [entry.fullModel, entry.model, entry.name]) {
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim()
  }
  return ""
}

/** Reads the routable model ids, deduplicated and sorted. */
export async function listOmniRouteModelIds(
  config: OmniRouteConfig,
  options?: OmniRouteRequestOptions,
): Promise<string[]> {
  const ids = new Set<string>()
  for (const entry of await listOmniRouteModels(config, options)) {
    const id = readEntryId(entry)
    if (id) ids.add(id)
  }
  return [...ids].sort((left, right) => left.localeCompare(right))
}

/**
 * Collects the built-in provider ids the deployment actually serves.
 *
 * Used to offer a truthful provider choice: the gateway exposes no
 * provider-catalogue route, so anything else would be guesswork.
 */
export async function listOmniRouteModelProviderIds(
  config: OmniRouteConfig,
  options?: OmniRouteRequestOptions,
): Promise<string[]> {
  const providerIds = new Set<string>()
  for (const entry of await listOmniRouteModels(config, options)) {
    const provider =
      typeof entry.provider === "string" ? entry.provider.trim() : ""
    if (provider) providerIds.add(provider)
  }
  return [...providerIds].sort((left, right) => left.localeCompare(right))
}
