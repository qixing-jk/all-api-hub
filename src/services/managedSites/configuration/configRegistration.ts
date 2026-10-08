import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { isManagedSiteAdminUserId } from "~/services/managedSites/utils/adminUserId"
import type { UserPreferences } from "~/services/preferences/preferencesSchema"
import {
  DEFAULT_AXON_HUB_CONFIG,
  type AxonHubConfig,
} from "~/types/axonHubConfig"
import {
  DEFAULT_CLAUDE_CODE_HUB_CONFIG,
  type ClaudeCodeHubConfig,
} from "~/types/claudeCodeHubConfig"
import {
  DEFAULT_CLI_PROXY_API_CONFIG,
  normalizeCliProxyApiDeploymentUrl,
  type CliProxyApiConfig,
} from "~/types/cliProxyApiConfig"
import {
  DEFAULT_DONE_HUB_CONFIG,
  type DoneHubConfig,
} from "~/types/doneHubConfig"
import {
  DEFAULT_GPT_LOAD_CONFIG,
  normalizeGptLoadBaseUrl,
  type GptLoadConfig,
} from "~/types/gptLoadConfig"
import type { NewApiConfig } from "~/types/newApiConfig"
import {
  DEFAULT_OCTOPUS_CONFIG,
  type OctopusConfig,
} from "~/types/octopusConfig"
import {
  DEFAULT_OMNIROUTE_CONFIG,
  normalizeOmniRouteBaseUrl,
  type OmniRouteConfig,
} from "~/types/omnirouteConfig"
import {
  DEFAULT_SUB2API_MANAGED_SITE_CONFIG,
  type Sub2ApiManagedSiteConfig,
} from "~/types/sub2apiManagedSiteConfig"
import type { VeloeraConfig } from "~/types/veloeraConfig"

export type ManagedSiteRuntimeConfig =
  | { siteType: typeof SITE_TYPES.CLI_PROXY_API; config: CliProxyApiConfig }
  | { siteType: typeof SITE_TYPES.NEW_API; config: NewApiConfig }
  | { siteType: typeof SITE_TYPES.DONE_HUB; config: DoneHubConfig }
  | { siteType: typeof SITE_TYPES.VELOERA; config: VeloeraConfig }
  | { siteType: typeof SITE_TYPES.OCTOPUS; config: OctopusConfig }
  | { siteType: typeof SITE_TYPES.AXON_HUB; config: AxonHubConfig }
  | {
      siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB
      config: ClaudeCodeHubConfig
    }
  | { siteType: typeof SITE_TYPES.SUB2API; config: Sub2ApiManagedSiteConfig }
  | { siteType: typeof SITE_TYPES.OMNIROUTE; config: OmniRouteConfig }
  | { siteType: typeof SITE_TYPES.GPT_LOAD; config: GptLoadConfig }

export type ManagedSiteRuntimeConfigValue = ManagedSiteRuntimeConfig["config"]
export type ManagedSiteRuntimeConfigForType<TSiteType extends ManagedSiteType> =
  Extract<ManagedSiteRuntimeConfig, { siteType: TSiteType }>
export type ManagedSiteRuntimeConfigValueForType<
  TSiteType extends ManagedSiteType,
> = ManagedSiteRuntimeConfigForType<TSiteType>["config"]

type ConfigRegistration<Config> = {
  select(preferences: UserPreferences): Config | undefined
  hasInput(preferences: UserPreferences): boolean
  resolve(preferences: UserPreferences): Config | null
  principal(config: Config): string
}

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

/** Keeps stored input, settings defaults and runnable configuration distinct. */
function defineConfig<Config>(options: {
  read(preferences: UserPreferences): Config | undefined
  required: readonly (keyof Config)[]
  defaultConfig?: Config
  validate?(config: Config): boolean
  normalize?(config: Config): Config
  principal?(config: Config): string
}): ConfigRegistration<Config> {
  return {
    select: (preferences) => options.read(preferences) ?? options.defaultConfig,
    hasInput: (preferences) => {
      const config = options.read(preferences)
      return Boolean(
        config && options.required.some((field) => hasText(config[field])),
      )
    },
    resolve: (preferences) => {
      const config = options.read(preferences)
      if (
        !config ||
        !options.required.every((field) => hasText(config[field])) ||
        (options.validate && !options.validate(config))
      )
        return null
      return options.normalize ? options.normalize(config) : config
    },
    principal: options.principal ?? (() => "admin"),
  }
}

const accessTokenRules = {
  required: ["baseUrl", "adminToken", "userId"],
  validate: (config: NewApiConfig | DoneHubConfig | VeloeraConfig) =>
    isManagedSiteAdminUserId(config.userId),
  principal: (config: NewApiConfig | DoneHubConfig | VeloeraConfig) =>
    config.userId.trim(),
} as const

// All consumers share the same complete registration; new managed types must
// declare their configuration behavior here before the type check can pass.
const registrations = {
  [SITE_TYPES.NEW_API]: defineConfig<NewApiConfig>({
    read: (prefs) => prefs.newApi,
    ...accessTokenRules,
  }),
  [SITE_TYPES.DONE_HUB]: defineConfig<DoneHubConfig>({
    read: (prefs) => prefs.doneHub,
    defaultConfig: DEFAULT_DONE_HUB_CONFIG,
    ...accessTokenRules,
  }),
  [SITE_TYPES.VELOERA]: defineConfig<VeloeraConfig>({
    read: (prefs) => prefs.veloera,
    ...accessTokenRules,
  }),
  [SITE_TYPES.CLI_PROXY_API]: defineConfig<CliProxyApiConfig>({
    read: (prefs) => prefs.cliProxyApi,
    defaultConfig: DEFAULT_CLI_PROXY_API_CONFIG,
    required: ["baseUrl", "adminToken"],
    normalize: (config) => ({
      ...config,
      baseUrl: normalizeCliProxyApiDeploymentUrl(config.baseUrl),
    }),
  }),
  [SITE_TYPES.OCTOPUS]: defineConfig<OctopusConfig>({
    read: (prefs) => prefs.octopus,
    defaultConfig: DEFAULT_OCTOPUS_CONFIG,
    required: ["baseUrl", "username", "password"],
    principal: (config) => config.username.trim(),
  }),
  [SITE_TYPES.AXON_HUB]: defineConfig<AxonHubConfig>({
    read: (prefs) => prefs.axonHub,
    defaultConfig: DEFAULT_AXON_HUB_CONFIG,
    required: ["baseUrl", "email", "password"],
    principal: (config) => config.email.trim(),
  }),
  [SITE_TYPES.CLAUDE_CODE_HUB]: defineConfig<ClaudeCodeHubConfig>({
    read: (prefs) => prefs.claudeCodeHub,
    defaultConfig: DEFAULT_CLAUDE_CODE_HUB_CONFIG,
    required: ["baseUrl", "adminToken"],
  }),
  [SITE_TYPES.SUB2API]: defineConfig<Sub2ApiManagedSiteConfig>({
    read: (prefs) => prefs.sub2apiManagedSite,
    defaultConfig: DEFAULT_SUB2API_MANAGED_SITE_CONFIG,
    required: ["baseUrl", "adminToken"],
  }),
  [SITE_TYPES.OMNIROUTE]: defineConfig<OmniRouteConfig>({
    read: (prefs) => prefs.omniroute,
    defaultConfig: DEFAULT_OMNIROUTE_CONFIG,
    required: ["baseUrl", "token"],
    normalize: (config) => ({
      ...config,
      baseUrl: normalizeOmniRouteBaseUrl(config.baseUrl),
    }),
  }),
  [SITE_TYPES.GPT_LOAD]: defineConfig<GptLoadConfig>({
    read: (prefs) => prefs.gptLoad,
    defaultConfig: DEFAULT_GPT_LOAD_CONFIG,
    required: ["baseUrl", "managementKey"],
    normalize: (config) => ({
      ...config,
      baseUrl: normalizeGptLoadBaseUrl(config.baseUrl),
    }),
  }),
} satisfies {
  [Type in ManagedSiteType]: ConfigRegistration<
    ManagedSiteRuntimeConfigValueForType<Type>
  >
}

/** Preserves the correlated site/config type at the one registry dispatch boundary. */
export function getManagedSiteConfigRegistration<Type extends ManagedSiteType>(
  siteType: Type,
): ConfigRegistration<ManagedSiteRuntimeConfigValueForType<Type>> | undefined {
  return Object.prototype.hasOwnProperty.call(registrations, siteType)
    ? (registrations[siteType] as ConfigRegistration<
        ManagedSiteRuntimeConfigValueForType<Type>
      >)
    : undefined
}
