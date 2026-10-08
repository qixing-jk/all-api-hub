import type { ComponentType } from "react"

import type { ManagedSiteType } from "~/constants/siteType"
import AxonHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/AxonHubSettings"
import ClaudeCodeHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/ClaudeCodeHubSettings"
import CliProxyApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/CliProxyApiSettings"
import DoneHubSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/DoneHubSettings"
import GptLoadSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/GptLoadSettings"
import NewApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/NewApiSettings"
import OctopusSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/OctopusSettings"
import OmniRouteSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/OmniRouteSettings"
import Sub2ApiSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/Sub2ApiSettings"
import VeloeraSettings from "~/features/BasicSettings/components/tabs/ManagedSite/providers/VeloeraSettings"
import {
  resolveManagedSiteSettingsPanelId,
  type ManagedSiteSettingsPanelId,
} from "~/features/BasicSettings/components/tabs/ManagedSite/search/managedSiteSettingsSearchRegistry"

const panels = {
  newApi: NewApiSettings,
  doneHub: DoneHubSettings,
  veloera: VeloeraSettings,
  octopus: OctopusSettings,
  axonHub: AxonHubSettings,
  claudeCodeHub: ClaudeCodeHubSettings,
  sub2Api: Sub2ApiSettings,
  omniRoute: OmniRouteSettings,
  gptLoad: GptLoadSettings,
  cliProxyApi: CliProxyApiSettings,
} satisfies Record<ManagedSiteSettingsPanelId, ComponentType>
/** Render the panel belonging to the same module that declares its search targets. */
export function ManagedSiteSettingsPanel({
  siteType,
}: {
  siteType: ManagedSiteType
}) {
  const Panel = panels[resolveManagedSiteSettingsPanelId(siteType)]
  return <Panel />
}
