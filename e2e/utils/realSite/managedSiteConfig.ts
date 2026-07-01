import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { ManagedSiteRuntimeConfigValueForType } from "~/services/managedSites/runtimeConfig"

import { readEnv } from "./shared"

type ManagedSiteEnvKey =
  | `AAH_E2E_${string}_BASE_URL`
  | `AAH_E2E_${string}_ADMIN_TOKEN`
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
      username: readEnv("AAH_E2E_NEW_API_USERNAME") ?? "",
      password: readEnv("AAH_E2E_NEW_API_PASSWORD") ?? "",
      totpSecret: readEnv("AAH_E2E_NEW_API_TOTP_SECRET") ?? "",
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

export function getManagedSiteRealSiteSkipReason(params: {
  label: string
  missingEnvKeys: string[]
}) {
  return `Missing real-site ${params.label} managed-site E2E env: ${params.missingEnvKeys.join(", ")}`
}
