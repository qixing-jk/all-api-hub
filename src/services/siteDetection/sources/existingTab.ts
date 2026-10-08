import { AUTO_DETECT_STRATEGIES } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import {
  getAccountBrowserSessionTabs,
  readAccountBrowserSessionFromExistingTabs,
  type ReadAccountBrowserSessionFromExistingTabsOptions,
} from "~/services/accountBrowserSession"
import { type AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"

import type { AutoDetectResult } from "../autoDetectContracts"
import { getAccountSiteType } from "../detectSiteType"
import {
  combineUserDataAndSiteType,
  createAutoDetectContext,
  normalizeSiteTypeHint,
  userDataFromBrowserSession,
  withAutoDetectContext,
} from "./resultAssembly"

/** Reads a reusable session without opening a temporary page for site detection. */
export async function autoDetectFromExistingTab(
  url: string,
  browserContext: NonNullable<
    ReadAccountBrowserSessionFromExistingTabsOptions["browserContext"]
  >,
  protectionBypassExecution?: ProtectionBypassExecution,
  diagnostics?: AccountDetectionDiagnostics,
): Promise<AutoDetectResult | null> {
  const candidateTabs = await getAccountBrowserSessionTabs(
    url,
    browserContext,
    diagnostics,
  )
  const siteType = candidateTabs.length
    ? await getAccountSiteType(url, protectionBypassExecution)
    : undefined
  const session = siteType
    ? await readAccountBrowserSessionFromExistingTabs({
        baseUrl: url,
        siteType,
        browserContext,
        candidateTabs,
        protectionBypassExecution,
        diagnostics,
      })
    : null
  if (session) {
    const sessionSiteType = normalizeSiteTypeHint(session.siteTypeHint)
    const result = await combineUserDataAndSiteType(
      {
        ...userDataFromBrowserSession(session),
        siteTypeHint:
          sessionSiteType && sessionSiteType !== SITE_TYPES.UNKNOWN
            ? sessionSiteType
            : siteType !== SITE_TYPES.UNKNOWN
              ? siteType
              : undefined,
      },
      url,
      protectionBypassExecution,
      diagnostics,
    )
    if (
      result.success &&
      result.data &&
      result.data.siteType !== SITE_TYPES.UNKNOWN
    ) {
      return withAutoDetectContext(
        result,
        createAutoDetectContext({
          strategy: AUTO_DETECT_STRATEGIES.ExistingTab,
          siteType: result.data?.siteType,
          fetchContext: session.fetchContext,
        }),
      )
    }
  }
  return null
}
