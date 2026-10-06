import {
  MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES,
  type BatchVerifyApiTypeMode,
  type BatchVerifyModelItem,
} from "~/features/ModelList/batchVerification"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { type ProductAnalyticsErrorCategory } from "~/services/productAnalytics/contracts"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

export const BATCH_VERIFY_ROW_STATUSES = {
  PENDING: "pending",
  RUNNING: "running",
  PASS: "pass",
  FAIL: "fail",
  SKIPPED: "skipped",
} as const

export type BatchVerifyRowStatus =
  (typeof BATCH_VERIFY_ROW_STATUSES)[keyof typeof BATCH_VERIFY_ROW_STATUSES]

export type BatchVerifyRow = {
  item: BatchVerifyModelItem
  status: BatchVerifyRowStatus
  latencyMs: number
  summary:
    | "pending"
    | "running"
    | "no-key"
    | "no-probes"
    | "results"
    | "failed"
    | "stopped"
    | "not-selected"
  results: ApiVerificationProbeResult[]
  runtimeKeyName?: string
  errorCategory?: ProductAnalyticsErrorCategory
}

export type AccountBatchVerifyModelItem = BatchVerifyModelItem & {
  source: Extract<
    BatchVerifyModelItem["source"],
    { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT }
  >
}

/** Normalize optional secrets before passing them to shared redaction. */
export function filterRedactions(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value))
}

/** Build the initial row state for the current batch item snapshot. */
export function buildRows(items: BatchVerifyModelItem[]): BatchVerifyRow[] {
  return items.map((item) => ({
    item,
    status: BATCH_VERIFY_ROW_STATUSES.PENDING,
    latencyMs: 0,
    summary: "pending",
    results: [],
  }))
}

/** Resolve the initial API type mode from the first profile-backed item. */
export function getDefaultApiTypeMode(
  items: BatchVerifyModelItem[],
): BatchVerifyApiTypeMode {
  const profileItem = items.find(
    (
      item,
    ): item is BatchVerifyModelItem & {
      source: Extract<
        BatchVerifyModelItem["source"],
        { kind: typeof MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE }
      >
    } => item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE,
  )
  return (
    profileItem?.source.profile.apiType ??
    MODEL_LIST_BATCH_VERIFY_API_TYPE_MODES.AUTO
  )
}

/** Narrow a batch row to account-backed sources before token lookup. */
export function isAccountBatchVerifyModelItem(
  item: BatchVerifyModelItem,
): item is AccountBatchVerifyModelItem {
  return item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
}

/** Check whether a row status is terminal for progress accounting. */
export function isCompletedStatus(status: BatchVerifyRowStatus) {
  return (
    status === BATCH_VERIFY_ROW_STATUSES.PASS ||
    status === BATCH_VERIFY_ROW_STATUSES.FAIL ||
    status === BATCH_VERIFY_ROW_STATUSES.SKIPPED
  )
}

/** Collapse probe results into the row status shown in the batch table. */
export function deriveBatchVerifyRowStatus(
  results: ApiVerificationProbeResult[],
): BatchVerifyRowStatus {
  if (results.length === 0) return BATCH_VERIFY_ROW_STATUSES.SKIPPED
  if (
    results.some(
      (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
    )
  ) {
    return BATCH_VERIFY_ROW_STATUSES.FAIL
  }
  if (
    results.some(
      (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
    )
  ) {
    return BATCH_VERIFY_ROW_STATUSES.PASS
  }
  return BATCH_VERIFY_ROW_STATUSES.SKIPPED
}

/** Extract stable identifiers for failure logs without exposing secrets. */
export function getBatchVerifyFailureLogIds(item: BatchVerifyModelItem) {
  return {
    accountId:
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? item.source.account.id
        : undefined,
    profileId:
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
        ? item.source.profile.id
        : undefined,
  }
}

/** Sum the latencies reported by all completed probes for a row. */
export function getRowLatency(results: ApiVerificationProbeResult[]) {
  return results.reduce((total, result) => total + (result.latencyMs || 0), 0)
}

/** Pick a valid probe id for synthetic failure records. */
export function getFirstApplicableProbeId(
  apiType: ApiVerificationApiType,
  selectedProbeIds: ApiVerificationProbeId[],
): ApiVerificationProbeId {
  const probeDefinitions = getApiVerificationProbeDefinitions(apiType)
  const availableProbeIds = new Set(probeDefinitions.map((probe) => probe.id))
  return (
    selectedProbeIds.find((probeId) => availableProbeIds.has(probeId)) ??
    probeDefinitions[0]?.id ??
    API_VERIFICATION_PROBE_IDS.TextGeneration
  )
}

export const DEFAULT_SELECTED_PROBE_IDS: ApiVerificationProbeId[] = [
  API_VERIFICATION_PROBE_IDS.TextGeneration,
]
