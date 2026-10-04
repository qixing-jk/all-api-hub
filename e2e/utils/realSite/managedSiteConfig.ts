import { type ManagedSiteType, type SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteRuntimeConfigValueForType } from "~/services/managedSites/runtimeConfig"

import { readEnv } from "./shared"

type ManagedSiteEnvKey =
  | `AAH_E2E_${string}_BASE_URL`
  | `AAH_E2E_${string}_ADMIN_TOKEN`
  | `AAH_E2E_${string}_MANAGEMENT_KEY`
  | `AAH_E2E_${string}_ADMIN_USER_ID`
  | `AAH_E2E_${string}_USERNAME`
  | `AAH_E2E_${string}_PASSWORD`
  | `AAH_E2E_${string}_EMAIL`

type ManagedSiteConfigResolution<TSiteType extends ManagedSiteType> = {
  config: ManagedSiteRuntimeConfigValueForType<TSiteType> | null
  missingEnvKeys: ManagedSiteEnvKey[]
}

const accessTokenManagedSiteEnv = <TPrefix extends string>(prefix: TPrefix) => {
  const baseUrlKey = `AAH_E2E_${prefix}_BASE_URL` as const
  const adminTokenKey = `AAH_E2E_${prefix}_ADMIN_TOKEN` as const
  const adminUserIdKey = `AAH_E2E_${prefix}_ADMIN_USER_ID` as const
  const baseUrl = readEnv(baseUrlKey)
  const adminToken = readEnv(adminTokenKey)
  const userId = readEnv(adminUserIdKey)
  const missingEnvKeys = [
    ...(!baseUrl ? [baseUrlKey] : []),
    ...(!adminToken ? [adminTokenKey] : []),
    ...(!userId ? [adminUserIdKey] : []),
  ] satisfies ManagedSiteEnvKey[]

  if (!baseUrl || !adminToken || !userId) {
    return {
      config: null,
      missingEnvKeys,
    }
  }

  return {
    config: {
      baseUrl,
      adminToken,
      userId,
    },
    missingEnvKeys: [],
  }
}

export function resolveNewApiManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.NEW_API
> {
  const resolved = accessTokenManagedSiteEnv("NEW_API")
  if (!resolved.config) return resolved

  return {
    config: {
      ...resolved.config,
      username: readEnv("AAH_E2E_NEW_API_ADMIN_USERNAME") ?? "",
      password: readEnv("AAH_E2E_NEW_API_ADMIN_PASSWORD") ?? "",
      totpSecret: readEnv("AAH_E2E_NEW_API_ADMIN_TOTP_SECRET") ?? "",
    },
    missingEnvKeys: [],
  }
}

export function resolveVeloeraManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.VELOERA
> {
  return accessTokenManagedSiteEnv("VELOERA")
}

export function resolveDoneHubManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.DONE_HUB
> {
  return accessTokenManagedSiteEnv("DONE_HUB")
}

export function resolveSub2ApiManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.SUB2API
> {
  const baseUrlKey = "AAH_E2E_SUB2API_BASE_URL" as const
  const adminTokenKey = "AAH_E2E_SUB2API_ADMIN_TOKEN" as const
  const baseUrl = readEnv(baseUrlKey)
  const adminToken = readEnv(adminTokenKey)
  const missingEnvKeys = [
    ...(!baseUrl ? [baseUrlKey] : []),
    ...(!adminToken ? [adminTokenKey] : []),
  ] satisfies ManagedSiteEnvKey[]

  if (!baseUrl || !adminToken) {
    return { config: null, missingEnvKeys }
  }

  return {
    config: { baseUrl, adminToken },
    missingEnvKeys: [],
  }
}

/**
 * Reads a ready-made OmniRoute `admin` access token.
 *
 * The password path is deliberately not exercised here: exchanging a password
 * mints a persistent token on the deployment under test, so the E2E uses a
 * token the operator created beforehand and leaves the exchange to the
 * settings-page tests.
 */
export function resolveOmniRouteManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.OMNIROUTE
> {
  const baseUrlKey = "AAH_E2E_OMNIROUTE_BASE_URL" as const
  const tokenKey = "AAH_E2E_OMNIROUTE_ADMIN_TOKEN" as const
  const baseUrl = readEnv(baseUrlKey)
  const token = readEnv(tokenKey)
  const missingEnvKeys = [
    ...(!baseUrl ? [baseUrlKey] : []),
    ...(!token ? [tokenKey] : []),
  ] satisfies ManagedSiteEnvKey[]

  if (!baseUrl || !token) {
    return { config: null, missingEnvKeys }
  }

  return {
    config: { baseUrl, token },
    missingEnvKeys: [],
  }
}

export function resolveOctopusManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.OCTOPUS
> {
  const baseUrlKey = "AAH_E2E_OCTOPUS_BASE_URL" as const
  const usernameKey = "AAH_E2E_OCTOPUS_USERNAME" as const
  const passwordKey = "AAH_E2E_OCTOPUS_PASSWORD" as const
  const baseUrl = readEnv(baseUrlKey)
  const username = readEnv(usernameKey)
  const password = readEnv(passwordKey)
  const missingEnvKeys = [
    ...(!baseUrl ? [baseUrlKey] : []),
    ...(!username ? [usernameKey] : []),
    ...(!password ? [passwordKey] : []),
  ] satisfies ManagedSiteEnvKey[]

  if (!baseUrl || !username || !password) {
    return { config: null, missingEnvKeys }
  }

  return {
    config: { baseUrl, username, password },
    missingEnvKeys: [],
  }
}

export function resolveAxonHubManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.AXON_HUB
> {
  const baseUrlKey = "AAH_E2E_AXON_HUB_BASE_URL" as const
  const emailKey = "AAH_E2E_AXON_HUB_EMAIL" as const
  const passwordKey = "AAH_E2E_AXON_HUB_PASSWORD" as const
  const baseUrl = readEnv(baseUrlKey)
  const email = readEnv(emailKey)
  const password = readEnv(passwordKey)
  const missingEnvKeys = [
    ...(!baseUrl ? [baseUrlKey] : []),
    ...(!email ? [emailKey] : []),
    ...(!password ? [passwordKey] : []),
  ] satisfies ManagedSiteEnvKey[]

  if (!baseUrl || !email || !password) {
    return { config: null, missingEnvKeys }
  }

  return {
    config: { baseUrl, email, password },
    missingEnvKeys: [],
  }
}

export function resolveClaudeCodeHubManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.CLAUDE_CODE_HUB
> {
  const baseUrlKey = "AAH_E2E_CLAUDE_CODE_HUB_BASE_URL" as const
  const adminTokenKey = "AAH_E2E_CLAUDE_CODE_HUB_ADMIN_TOKEN" as const
  const baseUrl = readEnv(baseUrlKey)
  const adminToken = readEnv(adminTokenKey)
  const missingEnvKeys = [
    ...(!baseUrl ? [baseUrlKey] : []),
    ...(!adminToken ? [adminTokenKey] : []),
  ] satisfies ManagedSiteEnvKey[]

  if (!baseUrl || !adminToken) {
    return { config: null, missingEnvKeys }
  }

  return {
    config: { baseUrl, adminToken },
    missingEnvKeys: [],
  }
}

/** Resolve CLIProxyAPI's management connection independently from client API keys. */
export function resolveCliProxyApiConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.CLI_PROXY_API
> {
  const baseUrlKey = "AAH_E2E_CLI_PROXY_API_BASE_URL" as const
  const adminTokenKey = "AAH_E2E_CLI_PROXY_API_ADMIN_TOKEN" as const
  const baseUrl = readEnv(baseUrlKey)
  const adminToken = readEnv(adminTokenKey)
  return {
    config: baseUrl && adminToken ? { baseUrl, adminToken } : null,
    missingEnvKeys: [
      ...(!baseUrl ? [baseUrlKey] : []),
      ...(!adminToken ? [adminTokenKey] : []),
    ],
  }
}

export function getManagedSiteRealSiteSkipReason(params: {
  label: string
  missingEnvKeys: string[]
}) {
  return `Missing real-site ${params.label} managed-site E2E env: ${params.missingEnvKeys.join(", ")}`
}

/** gpt-load uses the root AUTH_KEY, independently of downstream access keys. */
export function resolveGptLoadManagedSiteConfig(): ManagedSiteConfigResolution<
  typeof SITE_TYPES.GPT_LOAD
> {
  const baseUrlKey = "AAH_E2E_GPT_LOAD_BASE_URL" as const
  const managementKeyKey = "AAH_E2E_GPT_LOAD_MANAGEMENT_KEY" as const
  const baseUrl = readEnv(baseUrlKey)
  const managementKey = readEnv(managementKeyKey)
  return {
    config: baseUrl && managementKey ? { baseUrl, managementKey } : null,
    missingEnvKeys: [
      ...(!baseUrl ? [baseUrlKey] : []),
      ...(!managementKey ? [managementKeyKey] : []),
    ],
  }
}
