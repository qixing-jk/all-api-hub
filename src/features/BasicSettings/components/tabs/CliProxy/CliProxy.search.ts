import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const cliProxySearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:cli-proxy",
    "cliProxy",
    "cli-proxy",
    "settings:cliProxy.title",
    360,
    {
      keywords: ["cli", "cliproxy"],
    },
  ),
]

export const cliProxySearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:cli-proxy-base-url",
    "cliProxy",
    "cli-proxy-base-url",
    "settings:cliProxy.baseUrlLabel",
    680,
    {
      descriptionKey: "settings:cliProxy.urlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.cliProxy",
        "settings:cliProxy.title",
      ],
      keywords: ["cli", "proxy", "base url"],
    },
  ),
  buildControlDefinition(
    "control:cli-proxy-management-key",
    "cliProxy",
    "cli-proxy-management-key",
    "settings:cliProxy.managementKeyLabel",
    681,
    {
      descriptionKey: "settings:cliProxy.keyDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.cliProxy",
        "settings:cliProxy.title",
      ],
      keywords: ["cli", "proxy", "key", "management key"],
    },
  ),
  buildControlDefinition(
    "control:cli-proxy-check-connection",
    "cliProxy",
    "cli-proxy-check-connection",
    "settings:cliProxy.checkConnectionLabel",
    682,
    {
      descriptionKey: "settings:cliProxy.checkConnectionDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.cliProxy",
        "settings:cliProxy.title",
      ],
      keywords: ["cli", "proxy", "check connection", "verify"],
    },
  ),
]
