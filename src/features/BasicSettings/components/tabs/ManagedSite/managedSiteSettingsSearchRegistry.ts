import type { ManagedSiteType } from "~/constants/siteType"

import { cliProxyApiSettingsSearch } from "./CliProxyApi.search"
import { axonHubSettingsSearch } from "./ManagedSiteAxonHub.search"
import { claudeCodeHubSettingsSearch } from "./ManagedSiteClaudeCodeHub.search"
import { doneHubSettingsSearch } from "./ManagedSiteDoneHub.search"
import { gptLoadSettingsSearch } from "./ManagedSiteGptLoad.search"
import { newApiSettingsSearch } from "./ManagedSiteNewApi.search"
import { octopusSettingsSearch } from "./ManagedSiteOctopus.search"
import { omniRouteSettingsSearch } from "./ManagedSiteOmniRoute.search"
import { sub2ApiSettingsSearch } from "./ManagedSiteSub2Api.search"
import { veloeraSettingsSearch } from "./ManagedSiteVeloera.search"

/** One settings owner supplies both its search targets and its panel selection. */
export const managedSiteSettingsSearchModules = {
  newApi: newApiSettingsSearch,
  doneHub: doneHubSettingsSearch,
  veloera: veloeraSettingsSearch,
  octopus: octopusSettingsSearch,
  axonHub: axonHubSettingsSearch,
  claudeCodeHub: claudeCodeHubSettingsSearch,
  sub2Api: sub2ApiSettingsSearch,
  omniRoute: omniRouteSettingsSearch,
  gptLoad: gptLoadSettingsSearch,
  cliProxyApi: cliProxyApiSettingsSearch,
}
export type ManagedSiteSettingsPanelId =
  keyof typeof managedSiteSettingsSearchModules
/** Preserve the established New API fallback for unrecognized settings selections. */
export function resolveManagedSiteSettingsPanelId(
  siteType: ManagedSiteType,
): ManagedSiteSettingsPanelId {
  return (
    (
      Object.keys(
        managedSiteSettingsSearchModules,
      ) as ManagedSiteSettingsPanelId[]
    ).find(
      (id) => managedSiteSettingsSearchModules[id].siteType === siteType,
    ) ?? "newApi"
  )
}
