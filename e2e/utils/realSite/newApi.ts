import type { Page } from "@playwright/test"

import {
  getCompatibleApiRealSiteSkipReason,
  loginToCompatibleApiRealSite,
  resolveCompatibleApiRealSiteConfig,
  type CompatibleApiRealSiteConfig,
  type CompatibleApiRealSiteLoginResult,
} from "./compatibleApi"

const NEW_API_ENV_PREFIX = "NEW_API"
const NEW_API_LABEL = "New API"

type RequiredNewApiRealSiteEnvKey =
  | "AAH_E2E_NEW_API_BASE_URL"
  | "AAH_E2E_NEW_API_USERNAME"
  | "AAH_E2E_NEW_API_PASSWORD"

type NewApiRealSiteResolution = {
  config: CompatibleApiRealSiteConfig | null
  missingEnvKeys: RequiredNewApiRealSiteEnvKey[]
}

/**
 * Environment-driven config for the real New API E2E flow.
 *
 * Required:
 * - AAH_E2E_NEW_API_BASE_URL
 * - AAH_E2E_NEW_API_USERNAME
 * - AAH_E2E_NEW_API_PASSWORD
 *
 * Optional overrides:
 * - AAH_E2E_NEW_API_LOGIN_PATH
 * - AAH_E2E_NEW_API_LOGIN_API_PATH
 * - AAH_E2E_NEW_API_LOGIN_2FA_API_PATH
 * - AAH_E2E_NEW_API_USERNAME_SELECTOR
 * - AAH_E2E_NEW_API_PASSWORD_SELECTOR
 * - AAH_E2E_NEW_API_SUBMIT_SELECTOR
 * - AAH_E2E_NEW_API_AGREE_SELECTOR
 * - AAH_E2E_NEW_API_TOTP_SECRET
 */
export function resolveNewApiRealSiteConfig(): NewApiRealSiteResolution {
  return resolveCompatibleApiRealSiteConfig({
    envPrefix: NEW_API_ENV_PREFIX,
  }) as NewApiRealSiteResolution
}

export function getNewApiRealSiteSkipReason(
  missingEnvKeys: RequiredNewApiRealSiteEnvKey[],
) {
  return getCompatibleApiRealSiteSkipReason({
    label: NEW_API_LABEL,
    missingEnvKeys,
  })
}

export async function loginToRealNewApiSite(
  page: Page,
  config: CompatibleApiRealSiteConfig,
): Promise<CompatibleApiRealSiteLoginResult> {
  return await loginToCompatibleApiRealSite(page, config, {
    label: NEW_API_LABEL,
    envPrefix: NEW_API_ENV_PREFIX,
    authBundle: true,
    logSessionDiagnostics: true,
  })
}
