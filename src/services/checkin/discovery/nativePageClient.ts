import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { safeRandomUUID } from "~/utils/core/identifier"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

import { runCheckInBrowserScan } from "./evidence/browserScanTask"
import type { NativeCheckInPageExploration } from "./nativePageDiscovery"

/** Explicit configuration command. No credential or mutation options can cross this boundary. */
export async function findNativeCheckInPagesInBrowser(
  input: {
    siteUrl: string
    siteType: AccountSiteType
    nativePagePath?: string
  },
  signal: AbortSignal,
): Promise<NativeCheckInPageExploration> {
  signal.throwIfAborted()
  const originUrl = tryParseHttpUrl(input.siteUrl)?.origin
  if (!originUrl) throw new Error("page_origin")
  const requestId = safeRandomUUID()
  const result = await runCheckInBrowserScan({
    requestId,
    cancelAction: RuntimeActionIds.CancelCheckinPageDiscovery,
    signal,
    execute: () =>
      executeProtectionBypassTask({
        execution: createUserCommandProtectionBypassExecution(
          PROTECTION_BYPASS_USER_COMMANDS.FindCheckinPage,
          getCurrentTempWindowRequestSource(),
        ),
        task: {
          kind: TEMP_CONTEXT_TASK_KINDS.CheckinPageDiscovery,
          params: {
            originUrl,
            requestId,
            siteType: input.siteType,
            ...(input.nativePagePath
              ? { nativePagePath: input.nativePagePath }
              : {}),
          },
        },
      }),
  })
  signal.throwIfAborted()
  if (!result.success || !result.data || result.data.inspectionUnavailable)
    throw new Error("page_scan_unavailable")
  return result.data
}
