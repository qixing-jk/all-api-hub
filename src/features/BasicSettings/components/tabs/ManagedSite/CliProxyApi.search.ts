import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const cliProxyApiSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:cli-proxy",
    "managedSite",
    "cli-proxy",
    "settings:cliProxyApi.title",
    360,
    {
      keywords: ["cli", "cliproxy", "cliproxyapi"],
      isVisible: (context) =>
        context.managedSiteType === SITE_TYPES.CLI_PROXY_API,
    },
  ),
]

export const cliProxyApiSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:cli-proxy-base-url",
    "managedSite",
    "cli-proxy-base-url",
    "settings:cliProxyApi.baseUrlLabel",
    680,
    {
      descriptionKey: "settings:cliProxyApi.urlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:cliProxyApi.title",
      ],
      keywords: ["cli", "proxy", "base url"],
      isVisible: (context) =>
        context.managedSiteType === SITE_TYPES.CLI_PROXY_API,
    },
  ),
  buildControlDefinition(
    "control:cli-proxy-management-key",
    "managedSite",
    "cli-proxy-management-key",
    "settings:cliProxyApi.managementKeyLabel",
    681,
    {
      descriptionKey: "settings:cliProxyApi.keyDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:cliProxyApi.title",
      ],
      keywords: ["cli", "proxy", "key", "management key"],
      isVisible: (context) =>
        context.managedSiteType === SITE_TYPES.CLI_PROXY_API,
    },
  ),
  buildControlDefinition(
    "control:cli-proxy-check-connection",
    "managedSite",
    "cli-proxy-check-connection",
    "settings:cliProxyApi.checkConnectionLabel",
    682,
    {
      descriptionKey: "settings:cliProxyApi.checkConnectionDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.managedSite",
        "settings:cliProxyApi.title",
      ],
      keywords: ["cli", "proxy", "check connection", "verify"],
      isVisible: (context) =>
        context.managedSiteType === SITE_TYPES.CLI_PROXY_API,
    },
  ),
]
