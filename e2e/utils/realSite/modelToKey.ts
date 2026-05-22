import type { Page, TestInfo } from "@playwright/test"

import { runModelToKeyManagementScenario } from "~~/e2e/scenarios/modelToKeyManagement"
import { forceExtensionLanguage } from "~~/e2e/utils/commonUserFlows"
import {
  buildRealSiteRunId,
  buildRealSiteTestTokenName,
} from "~~/e2e/utils/realSite/keyManagement"

type RealSiteModelToKeyConfig = Record<string, never>

export type RealSiteModelToKeyEnvPrefix =
  | "NEW_API"
  | "VELOERA"
  | "ONE_HUB"
  | "DONE_HUB"
  | "SUB2API"

const SUPPORTED_REAL_SITE_MODEL_TO_KEY_ENV_PREFIXES = new Set<string>([
  "NEW_API",
  "VELOERA",
  "ONE_HUB",
  "DONE_HUB",
])

function isSupportedRealSiteModelToKeyEnvPrefix(
  envPrefix: string,
): envPrefix is RealSiteModelToKeyEnvPrefix {
  return SUPPORTED_REAL_SITE_MODEL_TO_KEY_ENV_PREFIXES.has(envPrefix)
}

export function resolveRealSiteModelToKeyConfig(
  envPrefix: RealSiteModelToKeyEnvPrefix,
): RealSiteModelToKeyConfig | null {
  if (!isSupportedRealSiteModelToKeyEnvPrefix(envPrefix)) {
    return null
  }

  return {}
}

export function getRealSiteModelToKeySkipReason(
  envPrefix: RealSiteModelToKeyEnvPrefix,
  label: string,
): string {
  if (!isSupportedRealSiteModelToKeyEnvPrefix(envPrefix)) {
    return `${label} model-to-key flow skipped because this site type does not expose an account-backed model catalog.`
  }

  return `${label} model-to-key flow skipped because no account-backed model is available.`
}

export async function maybeRunRealSiteModelToKeyScenario(params: {
  testInfo: TestInfo
  page: Page
  extensionId: string
  accountId: string
  envPrefix: RealSiteModelToKeyEnvPrefix
  label: string
  hasAvailableModel?: boolean
}) {
  const config = resolveRealSiteModelToKeyConfig(params.envPrefix)

  if (!config || params.hasAvailableModel === false) {
    params.testInfo.annotations.push({
      type: "skip",
      description: getRealSiteModelToKeySkipReason(
        params.envPrefix,
        params.label,
      ),
    })
    return
  }

  await runModelToKeyManagementScenario({
    page: params.page,
    extensionId: params.extensionId,
    accountId: params.accountId,
    createdKeyName: buildRealSiteTestTokenName({
      label: params.label,
      runId: buildRealSiteRunId(),
    }),
    cleanupCreatedKey: true,
    prepareKeyManagementPage: async (keysPage) => {
      await forceExtensionLanguage(keysPage, "en")
    },
  })
}
