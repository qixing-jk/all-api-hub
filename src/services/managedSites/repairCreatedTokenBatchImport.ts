import {
  buildAccountTokenRuntimeKeyId,
  buildDisplayAccountTokenRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import type { ApiToken, DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  type AccountKeyRepairAccountResult,
  type AccountKeyRepairManagedSiteImportStatus,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"

export const REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS = {
  CURRENT_SESSION: "current-session",
  HISTORICAL: "historical",
} as const

export const REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS = {
  NOT_READY: "not-ready",
  REFERENCES_UNAVAILABLE: "references-unavailable",
  NOTHING_PENDING: "nothing-pending",
} as const

type RepairCreatedTokenBatchImportFreshness =
  (typeof REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS)[keyof typeof REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS]

interface ResolveRepairCreatedTokenBatchImportCandidateParams {
  progress: AccountKeyRepairProgress
  accounts: DisplaySiteData[]
  targetFingerprint: string
  freshness: RepairCreatedTokenBatchImportFreshness
  forceCompleteVerification?: boolean
  /** Re-check terminal same-target receipts only through the complete verifier. */
  includeCompletedReferences?: boolean
}

interface RepairCreatedTokenBatchImportCandidate {
  items: ManagedSiteTokenBatchExportItemInput[]
  intent: Extract<
    ManagedSiteBatchImportIntent,
    { source: typeof MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED }
  >
}

interface CreatedTokenReferenceEntry {
  accountId: string
  accountLabel: string
  group: string
  tokenId: number
}

interface CreatedGroupEntry {
  accountId: string
  accountLabel: string
  group: string
}

type RepairCreatedTokenBatchImportAbsenceReason =
  (typeof REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS)[keyof typeof REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS]

type CreatedReferenceResolution =
  | { absenceReason: RepairCreatedTokenBatchImportAbsenceReason }
  | {
      absenceReason: null
      references: CreatedTokenReferenceEntry[]
      ambiguousGroups: CreatedGroupEntry[]
      candidateReferences: CreatedTokenReferenceEntry[]
      targetReceipts: Map<string, AccountKeyRepairManagedSiteImportStatus>
    }

const normalizeGroup = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const getReferenceKey = (accountId: string, tokenId: number) =>
  JSON.stringify([accountId, tokenId])

const getReceiptKey = (
  targetFingerprint: string,
  accountId: string,
  tokenId: number,
) => JSON.stringify([targetFingerprint, accountId, tokenId])

const getAccountLabel = (result: AccountKeyRepairAccountResult) =>
  result.accountName.trim() || result.accountId

const getGroupLabel = (group: string) => group || "Created key"

const BLOCKED_MESSAGES = {
  accountMissing: "The source account is no longer available.",
  inventoryUnavailable: "The source account keys could not be loaded.",
  tokenUnavailable: "The newly created key is no longer available.",
  referenceUnavailable: "The newly created key could not be matched safely.",
} as const

const buildBlockedReference = (params: {
  id: string
  accountLabel: string
  group: string
  message: string
}): ManagedSiteTokenBatchExportItemInput => ({
  kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.BLOCKED_REFERENCE,
  id: params.id,
  accountLabel: params.accountLabel,
  keyLabel: getGroupLabel(params.group),
  blockingReasonCode:
    MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
  localFallback: params.message,
})

const getCreatedReferenceEntries = (
  progress: AccountKeyRepairProgress,
): {
  references: CreatedTokenReferenceEntry[]
  ambiguousGroups: CreatedGroupEntry[]
  hasExplicitReferenceData: boolean
} => {
  const referenceCandidates = new Map<
    string,
    CreatedTokenReferenceEntry & { groups: Set<string> }
  >()
  const createdGroups: CreatedGroupEntry[] = []
  const references: CreatedTokenReferenceEntry[] = []
  const ambiguousGroups: CreatedGroupEntry[] = []
  const ambiguousGroupKeys = new Set<string>()

  for (const result of progress.results) {
    if (result.outcome !== ACCOUNT_KEY_REPAIR_OUTCOMES.Created) continue

    const accountLabel = getAccountLabel(result)
    const createdTokens = result.createdTokens

    for (const reference of createdTokens ?? []) {
      const tokenId = reference.tokenId
      if (!Number.isSafeInteger(tokenId)) continue

      const group = normalizeGroup(reference.group)
      const referenceKey = getReferenceKey(result.accountId, tokenId)
      const existing = referenceCandidates.get(referenceKey)
      if (existing) {
        existing.groups.add(group)
      } else {
        referenceCandidates.set(referenceKey, {
          accountId: result.accountId,
          accountLabel,
          group,
          tokenId,
          groups: new Set([group]),
        })
      }
    }

    for (const rawGroup of result.createdGroups ?? []) {
      createdGroups.push({
        accountId: result.accountId,
        accountLabel,
        group: normalizeGroup(rawGroup),
      })
    }
  }

  const unambiguousGroupKeys = new Set<string>()
  const addAmbiguousGroup = (entry: CreatedGroupEntry) => {
    const groupKey = JSON.stringify([entry.accountId, entry.group])
    if (
      unambiguousGroupKeys.has(groupKey) ||
      ambiguousGroupKeys.has(groupKey)
    ) {
      return
    }
    ambiguousGroupKeys.add(groupKey)
    ambiguousGroups.push(entry)
  }

  for (const candidate of referenceCandidates.values()) {
    if (candidate.groups.size !== 1) {
      for (const group of candidate.groups) {
        addAmbiguousGroup({
          accountId: candidate.accountId,
          accountLabel: candidate.accountLabel,
          group,
        })
      }
      continue
    }

    const [group] = candidate.groups
    const groupKey = JSON.stringify([candidate.accountId, group])
    unambiguousGroupKeys.add(groupKey)
    references.push({
      accountId: candidate.accountId,
      accountLabel: candidate.accountLabel,
      group,
      tokenId: candidate.tokenId,
    })
  }

  for (const entry of createdGroups) {
    const groupKey = JSON.stringify([entry.accountId, entry.group])
    if (!unambiguousGroupKeys.has(groupKey)) {
      addAmbiguousGroup(entry)
    }
  }

  return {
    references,
    ambiguousGroups,
    hasExplicitReferenceData: progress.results.some(
      (result) =>
        result.outcome === ACCOUNT_KEY_REPAIR_OUTCOMES.Created &&
        result.createdTokens !== undefined,
    ),
  }
}

const getTargetReceipts = (
  progress: AccountKeyRepairProgress,
  targetFingerprint: string,
) => {
  const receipts = new Map<string, AccountKeyRepairManagedSiteImportStatus>()
  const receiptUpdatedAt = new Map<string, number>()

  for (const receipt of progress.managedSiteImportReceipts ?? []) {
    if (receipt.targetFingerprint !== targetFingerprint) continue
    const key = getReceiptKey(
      targetFingerprint,
      receipt.accountId,
      receipt.tokenId,
    )
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
  if (progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
    return {
      absenceReason:
        REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.NOT_READY,
    }
  }

  const { references, ambiguousGroups, hasExplicitReferenceData } =
    getCreatedReferenceEntries(progress)

  // Older progress snapshots have no exact references. Do not infer keys from
  // the human-readable createdGroups list.
  if (references.length === 0 && !hasExplicitReferenceData) {
    return {
      absenceReason:
        REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.REFERENCES_UNAVAILABLE,
    }
  }

  const targetReceipts = getTargetReceipts(progress, targetFingerprint)
  const candidateReferences = includeCompletedReferences
    ? references
    : references.filter((reference) => {
        const status = targetReceipts.get(
          getReceiptKey(
            targetFingerprint,
            reference.accountId,
            reference.tokenId,
          ),
        )
        return (
          status !== ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created &&
          status !==
            ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent
        )
      })

  if (candidateReferences.length === 0 && ambiguousGroups.length === 0) {
    return {
      absenceReason:
        references.length > 0
          ? REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.NOTHING_PENDING
          : REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.REFERENCES_UNAVAILABLE,
    }
  }

  return {
    absenceReason: null,
    references,
    ambiguousGroups,
    candidateReferences,
    targetReceipts,
  }
}

export const getRepairCreatedTokenBatchImportAbsenceReason = (params: {
  progress: AccountKeyRepairProgress
  targetFingerprint: string
}) =>
  resolveCreatedReferenceState(params.progress, params.targetFingerprint)
    .absenceReason

/**
 * Resolves exact keys created by a completed repair job into the shared
 * managed-site batch-import input shape. Inventory is loaded only for
 * affected accounts and is never used to guess a nearby replacement key.
 */
export async function resolveRepairCreatedTokenBatchImportCandidate(
  params: ResolveRepairCreatedTokenBatchImportCandidateParams,
): Promise<RepairCreatedTokenBatchImportCandidate | null> {
  const resolution = resolveCreatedReferenceState(
    params.progress,
    params.targetFingerprint,
    params.includeCompletedReferences,
  )
  if (resolution.absenceReason) return null
  const { references, ambiguousGroups, candidateReferences, targetReceipts } =
    resolution

  const hasReconciliationReceipt = candidateReferences.some((reference) => {
    const status = targetReceipts.get(
      getReceiptKey(
        params.targetFingerprint,
        reference.accountId,
        reference.tokenId,
      ),
    )
    return (
      status === ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed ||
      status === ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain
    )
  })

  const accountsById = new Map(
    params.accounts.map((account) => [account.id, account]),
  )
  const inventoryByAccountId = new Map<string, Promise<ApiToken[]>>()

  const loadInventory = (account: DisplaySiteData): Promise<ApiToken[]> => {
    const existing = inventoryByAccountId.get(account.id)
    if (existing) return existing

    const inventory = Promise.resolve().then(() => {
      const { keyManagement, request } = createDisplayAccountApiContext(account)
      if (!keyManagement) {
        throw new Error("key_management_unavailable")
      }
      return keyManagement.fetchAllTokens
        ? keyManagement.fetchAllTokens(request)
        : keyManagement.fetchTokens(request)
    })
    inventoryByAccountId.set(account.id, inventory)
    return inventory
  }

  const resolvedItems = await Promise.all(
    candidateReferences.map(async (reference) => {
      const account = accountsById.get(reference.accountId)
      const id = buildAccountTokenRuntimeKeyId(
        reference.accountId,
        reference.tokenId,
      )

      if (!account) {
        return buildBlockedReference({
          id,
          accountLabel: reference.accountLabel,
          group: reference.group,
          message: BLOCKED_MESSAGES.accountMissing,
        })
      }

      let tokens: ApiToken[]
      try {
        tokens = await loadInventory(account)
      } catch {
        return buildBlockedReference({
          id,
          accountLabel: reference.accountLabel,
          group: reference.group,
          message: BLOCKED_MESSAGES.inventoryUnavailable,
        })
      }

      const matches = tokens.filter(
        (token) =>
          token.id === reference.tokenId &&
          normalizeGroup(token.group) === reference.group,
      )
      if (matches.length !== 1) {
        return buildBlockedReference({
          id,
          accountLabel: reference.accountLabel,
          group: reference.group,
          message:
            matches.length === 0
              ? BLOCKED_MESSAGES.tokenUnavailable
              : BLOCKED_MESSAGES.referenceUnavailable,
        })
      }

      return {
        kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
        account,
        runtimeKey: buildDisplayAccountTokenRuntimeKey(account, matches[0]),
      } satisfies ManagedSiteTokenBatchExportItemInput
    }),
  )

  const referencedGroupKeys = new Set(
    references.map((reference) =>
      JSON.stringify([reference.accountId, reference.group]),
    ),
  )
  const ambiguousItems = ambiguousGroups
    .filter(
      ({ accountId, group }) =>
        !referencedGroupKeys.has(JSON.stringify([accountId, group])),
    )
    .map(({ accountId, accountLabel, group }) =>
      buildBlockedReference({
        id: `repair-created:${accountId}:${group}`,
        accountLabel,
        group,
        message: BLOCKED_MESSAGES.referenceUnavailable,
      }),
    )

  const verification =
    !params.includeCompletedReferences &&
    candidateReferences.length > 0 &&
    params.freshness ===
      REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION &&
    !params.forceCompleteVerification &&
    !hasReconciliationReceipt
      ? MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW
      : MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE

  return {
    items: [...resolvedItems, ...ambiguousItems],
    intent: {
      source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
      verification,
    },
  }
}
