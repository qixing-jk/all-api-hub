import type { ManagedSiteType } from "~/constants/siteType"
import { cliProxyApiSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/CliProxyApi.search"
import { axonHubSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteAxonHub.search"
import { claudeCodeHubSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteClaudeCodeHub.search"
import { doneHubSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteDoneHub.search"
import { gptLoadSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteGptLoad.search"
import { newApiSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteNewApi.search"
import { octopusSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteOctopus.search"
import { omniRouteSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteOmniRoute.search"
import { sub2ApiSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteSub2Api.search"
import { veloeraSettingsSearch } from "~/features/BasicSettings/components/tabs/ManagedSite/search/ManagedSiteVeloera.search"

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
