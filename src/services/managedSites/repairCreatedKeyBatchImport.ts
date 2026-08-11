import { resolveRepairCreatedRuntimeSecret } from "~/services/accounts/accountKeyAutoProvisioning/repairCreatedRuntimeSecrets"
import {
  buildAccountKeyResourceRuntimeKey,
  buildAccountKeyResourceRuntimeKeyId,
} from "~/services/accounts/accountRuntimeKeys"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import {
  ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS,
  type AccountKeyResourceRef,
  type AccountKeyResourceSession,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  type AccountKeyRepairManagedSiteImportStatus,
  type AccountKeyRepairProgress,
  type AccountKeyRepairRequirementResult,
} from "~/types/accountKeyAutoProvisioning"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportBlockedDetailCode,
  type ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

export const REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS = {
  CURRENT_SESSION: "current-session",
  HISTORICAL: "historical",
} as const

export const REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS = {
  NOT_READY: "not-ready",
  REFERENCES_UNAVAILABLE: "references-unavailable",
  NOTHING_PENDING: "nothing-pending",
} as const

type RepairCreatedKeyBatchImportFreshness =
  (typeof REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS)[keyof typeof REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS]

interface ResolveRepairCreatedKeyBatchImportCandidateParams {
  progress: AccountKeyRepairProgress
  accounts: DisplaySiteData[]
  targetFingerprint: string
  freshness: RepairCreatedKeyBatchImportFreshness
  forceCompleteVerification?: boolean
  /** Re-check terminal same-target receipts only through the complete verifier. */
  includeCompletedReferences?: boolean
}

interface RepairCreatedKeyBatchImportCandidate {
  items: ManagedSiteTokenBatchExportItemInput[]
  intent: Extract<
    ManagedSiteBatchImportIntent,
    { source: typeof MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED }
  >
}

type RepairCreatedKeyBatchImportAbsenceReason =
  (typeof REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS)[keyof typeof REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS]

type CreatedRequirementResult = Extract<
  AccountKeyRepairRequirementResult,
  { created: unknown }
>

interface CreatedResourceReferenceEntry {
  accountId: string
  accountLabel: string
  resultSiteType: DisplaySiteData["siteType"]
  siteUrlOrigin: string
  ref: AccountKeyResourceRef
  label: string
}

type CreatedReferenceResolution =
  | { absenceReason: RepairCreatedKeyBatchImportAbsenceReason }
  | {
      absenceReason: null
      references: CreatedResourceReferenceEntry[]
      candidateReferences: CreatedResourceReferenceEntry[]
      targetReceipts: Map<string, AccountKeyRepairManagedSiteImportStatus>
    }

const getReceiptKey = (targetFingerprint: string, ref: AccountKeyResourceRef) =>
  JSON.stringify([targetFingerprint, buildAccountKeyResourceRuntimeKeyId(ref)])

const getAccountLabel = (accountName: string, accountId: string) =>
  accountName.trim() || accountId

const getOriginKey = (siteUrl: string) =>
  normalizeUrlForOriginKey(siteUrl, {
    lowerCase: true,
    stripTrailingSlashes: false,
  })

const buildBlockedReference = (params: {
  ref: AccountKeyResourceRef
  accountLabel: string
  label: string
  detailCode: ManagedSiteTokenBatchExportBlockedDetailCode
}): ManagedSiteTokenBatchExportItemInput => ({
  kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.BLOCKED_REFERENCE,
  id: buildAccountKeyResourceRuntimeKeyId(params.ref),
  accountLabel: params.accountLabel,
  keyLabel: params.label,
  blockingReasonCode:
    MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
  blockingDetailCode: params.detailCode,
})

const buildResolvedReference = (params: {
  account: DisplaySiteData
  ref: AccountKeyResourceRef
  label: string
  secret: string
}): ManagedSiteTokenBatchExportItemInput => ({
  kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
  account: params.account,
  runtimeKey: buildAccountKeyResourceRuntimeKey(params.account, {
    ref: params.ref,
    label: params.label,
    secret: params.secret,
  }),
})

const isCreatedRequirementResult = (
  result: AccountKeyRepairRequirementResult,
): result is CreatedRequirementResult => "created" in result

const getCreatedReferenceEntries = (
  progress: AccountKeyRepairProgress,
): CreatedResourceReferenceEntry[] => {
  const referencesByKey = new Map<string, CreatedResourceReferenceEntry>()

  for (const accountResult of progress.results) {
    for (const result of accountResult.requirementResults) {
      if (!isCreatedRequirementResult(result)) continue
      const ref = result.created.ref
      const key = buildAccountKeyResourceRuntimeKeyId(ref)
      if (referencesByKey.has(key)) continue
      referencesByKey.set(key, {
        accountId: accountResult.accountId,
        accountLabel: getAccountLabel(
          accountResult.accountName,
          accountResult.accountId,
        ),
        resultSiteType: accountResult.siteType,
        siteUrlOrigin: accountResult.siteUrlOrigin,
        ref,
        label: result.requirement.displayName,
      })
    }
  }

  return Array.from(referencesByKey.values())
}

const getTargetReceipts = (
  progress: AccountKeyRepairProgress,
  targetFingerprint: string,
) => {
  const receipts = new Map<string, AccountKeyRepairManagedSiteImportStatus>()
  const receiptUpdatedAt = new Map<string, number>()

  for (const receipt of progress.managedSiteImportReceipts ?? []) {
    if (receipt.targetFingerprint !== targetFingerprint) continue
    const key = getReceiptKey(targetFingerprint, receipt.resourceRef)
    const currentUpdatedAt = receiptUpdatedAt.get(key)
    if (
      currentUpdatedAt !== undefined &&
      receipt.updatedAt < currentUpdatedAt
    ) {
      continue
    }
    receiptUpdatedAt.set(key, receipt.updatedAt)
    receipts.set(key, receipt.status)
  }

  return receipts
}

const resolveCreatedReferenceState = (
  progress: AccountKeyRepairProgress,
  targetFingerprint: string,
  includeCompletedReferences = false,
): CreatedReferenceResolution => {
  if (
    progress.schemaVersion !== ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION ||
    progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed
  ) {
    return {
      absenceReason: REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.NOT_READY,
    }
  }

  const references = getCreatedReferenceEntries(progress)
  if (references.length === 0) {
    return {
      absenceReason:
        REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.REFERENCES_UNAVAILABLE,
    }
  }

  const targetReceipts = getTargetReceipts(progress, targetFingerprint)
  const candidateReferences = includeCompletedReferences
    ? references
    : references.filter((reference) => {
        const status = targetReceipts.get(
          getReceiptKey(targetFingerprint, reference.ref),
        )
        return (
          status !== ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created &&
          status !==
            ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent
        )
      })

  if (candidateReferences.length === 0) {
    return {
      absenceReason:
        REPAIR_CREATED_KEY_BATCH_IMPORT_ABSENCE_REASONS.NOTHING_PENDING,
    }
  }

  return {
    absenceReason: null,
    references,
    candidateReferences,
    targetReceipts,
  }
}

export const getRepairCreatedKeyBatchImportAbsenceReason = (params: {
  progress: AccountKeyRepairProgress
  targetFingerprint: string
}) =>
  resolveCreatedReferenceState(params.progress, params.targetFingerprint)
    .absenceReason

/** Resolves exact repair-created refs into the shared managed-import input. */
export async function resolveRepairCreatedKeyBatchImportCandidate(
  params: ResolveRepairCreatedKeyBatchImportCandidateParams,
): Promise<RepairCreatedKeyBatchImportCandidate | null> {
  const resolution = resolveCreatedReferenceState(
    params.progress,
    params.targetFingerprint,
    params.includeCompletedReferences,
  )
  if (resolution.absenceReason) return null

  const accountsById = new Map(
    params.accounts.map((account) => [account.id, account]),
  )
  const sessionsByAccountId = new Map<
    string,
    Promise<AccountKeyResourceSession | null>
  >()
  const getAccountKeyResourceSession = (account: DisplaySiteData) => {
    const existingSession = sessionsByAccountId.get(account.id)
    if (existingSession) return existingSession

    const session = (async () => {
      const context = createDisplayAccountApiContext(account)
      const keyResources = context.capabilities.account?.keyResources
      if (!keyResources) return null

      return keyResources.open({
        account: {
          id: account.id,
          name: account.name,
          siteType: account.siteType,
        },
        request: context.request,
      })
    })()
    sessionsByAccountId.set(account.id, session)
    return session
  }
  const resolvedItems = await Promise.all(
    resolution.candidateReferences.map(async (reference) => {
      const account = accountsById.get(reference.accountId)
      if (
        !account ||
        account.siteType !== reference.resultSiteType ||
        getOriginKey(account.baseUrl) !== reference.siteUrlOrigin ||
        reference.ref.accountId !== reference.accountId ||
        reference.ref.siteType !== reference.resultSiteType
      ) {
        return buildBlockedReference({
          ref: reference.ref,
          accountLabel: reference.accountLabel,
          label: reference.label,
          detailCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_ACCOUNT_UNAVAILABLE,
        })
      }

      const createdSecret =
        params.freshness ===
        REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION
          ? await resolveRepairCreatedRuntimeSecret(
              params.progress.jobId,
              reference.ref,
            )
          : null
      if (createdSecret) {
        return buildResolvedReference({
          account,
          ref: reference.ref,
          label: reference.label,
          secret: createdSecret,
        })
      }

      try {
        const session = await getAccountKeyResourceSession(account)
        if (!session?.runtimeKey) {
          return buildBlockedReference({
            ref: reference.ref,
            accountLabel: reference.accountLabel,
            label: reference.label,
            detailCode:
              MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_KEY_INVENTORY_UNAVAILABLE,
          })
        }

        const runtimeResolution = await session.runtimeKey.resolve(
          reference.ref,
        )
        if (
          runtimeResolution.kind !==
            ACCOUNT_KEY_RUNTIME_KEY_RESOLUTION_KINDS.Resolved ||
          runtimeResolution.secret.trim().length === 0
        ) {
          return buildBlockedReference({
            ref: reference.ref,
            accountLabel: reference.accountLabel,
            label: reference.label,
            detailCode:
              MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.CREATED_KEY_UNAVAILABLE,
          })
        }

        return buildResolvedReference({
          account,
          ref: reference.ref,
          label: reference.label,
          secret: runtimeResolution.secret,
        })
      } catch {
        return buildBlockedReference({
          ref: reference.ref,
          accountLabel: reference.accountLabel,
          label: reference.label,
          detailCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_DETAIL_CODES.SOURCE_KEY_INVENTORY_UNAVAILABLE,
        })
      }
    }),
  )

  const hasReconciliationReceipt = resolution.candidateReferences.some(
    (reference) => {
      const status = resolution.targetReceipts.get(
        getReceiptKey(params.targetFingerprint, reference.ref),
      )
      return (
        status === ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed ||
        status === ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain
      )
    },
  )
  const verification =
    !params.includeCompletedReferences &&
    params.freshness ===
      REPAIR_CREATED_KEY_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION &&
    !params.forceCompleteVerification &&
    !hasReconciliationReceipt
      ? MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW
      : MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE

  return {
    items: resolvedItems,
    intent: {
      source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
      verification,
    },
  }
}
