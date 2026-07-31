import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { normalizeHttpUrl } from "~/utils/core/url"

interface ManagedSiteConsoleRoutes {
  channels: string
  tokens: string
}

/**
 * Verified upstream console routes.
 * New API/Veloera/DoneHub: upstream route definitions; Wheel (octopus):
 * https://github.com/kunish/wheel/blob/HEAD/apps/web/src/routes.tsx
 * AxonHub: https://github.com/looplj/axonhub/blob/HEAD/frontend/src/routeTree.gen.ts
 * Claude Code Hub: https://github.com/ding113/claude-code-hub/tree/HEAD/src/app
 */
const MANAGED_SITE_CONSOLE_ROUTES: Record<
  ManagedSiteType,
  ManagedSiteConsoleRoutes
> = {
  [SITE_TYPES.NEW_API]: { channels: "/channels", tokens: "/keys" },
  [SITE_TYPES.VELOERA]: {
    channels: "/admin/channels",
    tokens: "/app/tokens",
  },
  [SITE_TYPES.DONE_HUB]: {
    channels: "/panel/channel",
    tokens: "/panel/token",
  },
  [SITE_TYPES.OCTOPUS]: { channels: "/model", tokens: "/keys" },
  [SITE_TYPES.AXON_HUB]: { channels: "/channels", tokens: "/api-keys" },
  [SITE_TYPES.CLAUDE_CODE_HUB]: {
    channels: "/settings/providers",
    tokens: "/dashboard/users",
  },
}

const joinConsolePath = (baseUrl: string, path: string) =>
  `${(normalizeHttpUrl(baseUrl) ?? baseUrl.trim()).replace(/\/+$/, "")}${path}`

export const buildManagedSiteChannelConsoleUrl = (
  baseUrl: string,
  siteType: ManagedSiteType,
) => joinConsolePath(baseUrl, MANAGED_SITE_CONSOLE_ROUTES[siteType].channels)

export const buildManagedSiteTokenConsoleUrl = (
  baseUrl: string,
  siteType: ManagedSiteType,
) => joinConsolePath(baseUrl, MANAGED_SITE_CONSOLE_ROUTES[siteType].tokens)
