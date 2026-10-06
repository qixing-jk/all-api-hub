import type { ComponentType } from "react"

import type { ManagedSiteType } from "~/constants/siteType"

import AxonHubSettings from "./AxonHubSettings"
import ClaudeCodeHubSettings from "./ClaudeCodeHubSettings"
import CliProxyApiSettings from "./CliProxyApiSettings"
import DoneHubSettings from "./DoneHubSettings"
import GptLoadSettings from "./GptLoadSettings"
import {
  resolveManagedSiteSettingsPanelId,
  type ManagedSiteSettingsPanelId,
} from "./managedSiteSettingsSearchRegistry"
import NewApiSettings from "./NewApiSettings"
import OctopusSettings from "./OctopusSettings"
import OmniRouteSettings from "./OmniRouteSettings"
import Sub2ApiSettings from "./Sub2ApiSettings"
import VeloeraSettings from "./VeloeraSettings"

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
