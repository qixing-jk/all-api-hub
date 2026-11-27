import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountSiteType } from "~/constants/siteType"
import {
  CHECK_IN_EVIDENCE_SCAN_PURPOSES,
  FEEDBACK_SCAN_STATUSES,
  type CheckInEvidence,
} from "~/services/checkin/discovery/evidence/scanTypes"
import type { NativeCheckInPageExploration } from "~/services/checkin/discovery/nativePageDiscovery"

/** Reuses the bounded page/resource reader, with account queries explicitly disabled. */
export async function scanNativeCheckInPageSources(input: {
  originUrl: string
  siteType: AccountSiteType
  requestId: string
  send: (action: string, details: Record<string, unknown>) => Promise<unknown>
}): Promise<NativeCheckInPageExploration> {
  const reply = (await input.send(RuntimeActionIds.ContentCheckinFeedbackScan, {
    params: {
      originUrl: input.originUrl,
      requestId: input.requestId,
      input: {
        baseUrl: input.originUrl,
        siteType: input.siteType,
        purpose: CHECK_IN_EVIDENCE_SCAN_PURPOSES.NativePage,
      },
    },
  })) as { success?: boolean; data?: CheckInEvidence }
  return {
    candidates: reply?.success ? (reply.data?.pageCandidates ?? []) : [],
    complete:
      reply?.success === true &&
      reply.data?.status !== FEEDBACK_SCAN_STATUSES.Partial &&
      !reply.data?.issues?.length,
  }
}
