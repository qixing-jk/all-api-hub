import type { ManagedSiteType } from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { normalizeHttpUrl } from "~/utils/core/url"

/** Resolves navigation owned by the managed registration; missing routes are a registry error. */
function getConsoleRoutes(siteType: ManagedSiteType) {
  const routes =
    getAccountSiteDefinition(siteType)?.managedResource?.consoleRoutes
  if (!routes)
    throw new Error(`Managed site ${siteType} is missing console routes`)
  return routes
}

const joinConsolePath = (baseUrl: string, path: string): string | null => {
  const normalizedBaseUrl = normalizeHttpUrl(baseUrl)
  if (!normalizedBaseUrl) return null

  return `${normalizedBaseUrl.replace(/\/+$/, "")}${path}`
}

export const buildManagedSiteChannelConsoleUrl = (
  baseUrl: string,
  siteType: ManagedSiteType,
) => joinConsolePath(baseUrl, getConsoleRoutes(siteType).channels)

export const buildManagedSiteTokenConsoleUrl = (
  baseUrl: string,
  siteType: ManagedSiteType,
) => joinConsolePath(baseUrl, getConsoleRoutes(siteType).tokens)
