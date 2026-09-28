import {
  KIMI_CONSOLE_ORIGIN,
  KIMI_GLOBAL_CONSOLE_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"

const KIMI_SITE_TYPE = "kimi"
const KIMI_GLOBAL_SITE_TYPE = "kimi-global"

/**
 * Kimi Open Platform is one protocol with two account universes.
 * Keys, currency, and JWT regions do not cross these origins.
 * Verified against the signed-in consoles on 2026-09-29.
 */
export const KIMI_OPEN_PLATFORM_DEPLOYMENTS = {
  cn: {
    siteType: KIMI_SITE_TYPE,
    consoleOrigin: KIMI_CONSOLE_ORIGIN,
    hostnames: ["platform.kimi.com"] as const,
    inferenceOrigin: "https://api.moonshot.cn",
    openaiBaseUrl: "https://api.moonshot.cn/v1",
    anthropicBaseUrl: "https://api.moonshot.cn/anthropic",
    currency: "CNY",
  },
  global: {
    siteType: KIMI_GLOBAL_SITE_TYPE,
    consoleOrigin: KIMI_GLOBAL_CONSOLE_ORIGIN,
    hostnames: ["platform.kimi.ai"] as const,
    inferenceOrigin: "https://api.moonshot.ai",
    openaiBaseUrl: "https://api.moonshot.ai/v1",
    anthropicBaseUrl: "https://api.moonshot.ai/anthropic",
    currency: "USD",
  },
} as const

export type KimiOpenPlatformDeployment =
  (typeof KIMI_OPEN_PLATFORM_DEPLOYMENTS)[keyof typeof KIMI_OPEN_PLATFORM_DEPLOYMENTS]

export type KimiOpenPlatformCurrency = KimiOpenPlatformDeployment["currency"]

const DEPLOYMENT_LIST = [
  KIMI_OPEN_PLATFORM_DEPLOYMENTS.cn,
  KIMI_OPEN_PLATFORM_DEPLOYMENTS.global,
] as const

/** Returns the deployment for a console or inference URL, if it is one of the two sites. */
export function resolveKimiOpenPlatformDeployment(
  value: string,
): KimiOpenPlatformDeployment | null {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return (
      DEPLOYMENT_LIST.find(
        (deployment) =>
          deployment.hostnames.some((allowed) => allowed === hostname) ||
          new URL(deployment.inferenceOrigin).hostname === hostname,
      ) ?? null
    )
  } catch {
    return null
  }
}

/** Returns the deployment registered for a site type. */
export function getKimiOpenPlatformDeployment(
  siteType: string,
): KimiOpenPlatformDeployment | null {
  return (
    DEPLOYMENT_LIST.find((deployment) => deployment.siteType === siteType) ??
    null
  )
}

/** Whether the site type belongs to the Kimi Open Platform family. */
export function isKimiOpenPlatformSiteType(siteType: string): boolean {
  return getKimiOpenPlatformDeployment(siteType) !== null
}
