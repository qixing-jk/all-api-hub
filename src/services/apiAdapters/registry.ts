import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { AGENT_ROUTER_ORIGINS } from "~/services/accountLogin/providers/agentrouter/config"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
  type AccountSiteBackendFamily,
  type AccountSiteType,
} from "~/services/accountSiteDefinitions"
import type { ManagedSiteRuntimeConfigValueForType } from "~/services/managedSites/runtimeConfig"

import { aihubmixCapabilities } from "./aihubmix"
import type {
  AccountLoginCapability,
  AccountLoginTarget,
} from "./contracts/accountLogin"
import type { ManagedSiteCapabilities } from "./contracts/managedSiteCapabilities"
import type {
  SiteType,
  SiteTypeCapabilities,
} from "./contracts/siteTypeCapabilities"
import { freeModelCapabilities } from "./freemodel"
import { grsaiCapabilities } from "./grsai"
import { createKimiOpenPlatformCapabilities } from "./kimiOpenPlatform"
import { axonHubManagedSiteCapabilities } from "./managedSites/axonHub"
import { claudeCodeHubManagedSiteCapabilities } from "./managedSites/claudeCodeHub"
import { cliProxyApiCapabilities } from "./managedSites/cliProxyApi"
import { doneHubManagedSiteCapabilities } from "./managedSites/doneHub"
import { gptLoadManagedSiteCapabilities } from "./managedSites/gptLoad"
import { newApiManagedSiteCapabilities } from "./managedSites/newApi"
import { octopusManagedSiteCapabilities } from "./managedSites/octopus"
import { omniRouteManagedSiteCapabilities } from "./managedSites/omniroute"
import { sub2ApiManagedSiteCapabilities } from "./managedSites/sub2api"
import { veloeraManagedSiteCapabilities } from "./managedSites/veloera"
import { createNewApiCapabilities } from "./newApi"
import { agentRouterAccountLogin } from "./newApi/agentRouterAccountLogin"
import { openRouterCapabilities } from "./openrouter"
import { rightCodeCapabilities } from "./rightcode"
import { sharedChatCapabilities } from "./sharedchat"
import { sub2ApiCapabilities } from "./sub2api"
import { voApiV2Capabilities } from "./voapiV2"

const managedSitesBySiteType = {
  [SITE_TYPES.CLI_PROXY_API]: cliProxyApiCapabilities,
  [SITE_TYPES.NEW_API]: newApiManagedSiteCapabilities,
  [SITE_TYPES.VELOERA]: veloeraManagedSiteCapabilities,
  [SITE_TYPES.DONE_HUB]: doneHubManagedSiteCapabilities,
  [SITE_TYPES.OCTOPUS]: octopusManagedSiteCapabilities,
  [SITE_TYPES.AXON_HUB]: axonHubManagedSiteCapabilities,
  [SITE_TYPES.CLAUDE_CODE_HUB]: claudeCodeHubManagedSiteCapabilities,
  [SITE_TYPES.SUB2API]: sub2ApiManagedSiteCapabilities,
  [SITE_TYPES.OMNIROUTE]: omniRouteManagedSiteCapabilities,
  [SITE_TYPES.GPT_LOAD]: gptLoadManagedSiteCapabilities,
} satisfies Record<ManagedSiteType, ManagedSiteCapabilities>

const withManagedSites = (
  capabilities: SiteTypeCapabilities,
): SiteTypeCapabilities => {
  const managedSites = isManagedSiteCapabilityType(capabilities.siteType)
    ? managedSitesBySiteType[capabilities.siteType]
    : undefined

  if (!managedSites) {
    return capabilities
  }

  return {
    ...capabilities,
    managedSites,
  }
}

const isManagedSiteCapabilityType = (
  siteType: SiteType,
): siteType is ManagedSiteType =>
  Object.hasOwn(managedSitesBySiteType, siteType)

/** Every backend family declares its capability factory, including unsupported sites. */
const accountCapabilityFactories = {
  [ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily]: (siteType) =>
    createNewApiCapabilities(siteType as AccountSiteType),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api]: () => sub2ApiCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2]: () => voApiV2Capabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix]: () => aihubmixCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat]: () => sharedChatCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.FreeModel]: () => freeModelCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.RightCode]: () => rightCodeCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter]: () => openRouterCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform]: (siteType) =>
    createKimiOpenPlatformCapabilities(siteType as AccountSiteType),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Grsai]: () => grsaiCapabilities,
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported]: (siteType) => ({ siteType }),
} satisfies Record<
  AccountSiteBackendFamily,
  (siteType: SiteType) => SiteTypeCapabilities
>

/** Returns account capabilities through the family registration, then attaches managed support. */
export function getSiteTypeCapabilities(
  siteType: SiteType,
): SiteTypeCapabilities {
  const adapterFamily =
    getAccountSiteDefinition(siteType)?.adapterFamily ??
    ACCOUNT_SITE_ADAPTER_FAMILIES.Unsupported
  return withManagedSites(accountCapabilityFactories[adapterFamily](siteType))
}

/** Resolves a deployment override before the optional site-type login capability. */
export function getAccountLoginCapability(
  account: AccountLoginTarget,
): AccountLoginCapability | undefined {
  let hostname: string
  try {
    hostname = new URL(account.site_url).hostname
  } catch {
    return undefined
  }
  // Reserve the deployment even for an invalid scheme/port so it cannot fall
  // through to a generic New API protocol with different session semantics.
  const capability = AGENT_ROUTER_ORIGINS.some(
    (origin) => new URL(origin).hostname === hostname,
  )
    ? agentRouterAccountLogin
    : account.site_type
      ? getSiteTypeCapabilities(account.site_type).account?.login
      : undefined
  return capability?.supports(account) ? capability : undefined
}

/** Returns the registered managed-site capabilities without remapping their interfaces. */
export function getManagedSiteCapabilities<TSiteType extends ManagedSiteType>(
  siteType: TSiteType,
): ManagedSiteCapabilities<
  ManagedSiteRuntimeConfigValueForType<TSiteType>,
  TSiteType
> {
  const capabilities = managedSitesBySiteType[siteType]
  if (!capabilities) {
    throw new Error(
      `managedSites capabilities are not implemented for ${siteType}`,
    )
  }
  return capabilities as ManagedSiteCapabilities<
    ManagedSiteRuntimeConfigValueForType<TSiteType>,
    TSiteType
  >
}
