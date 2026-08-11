import { buildAccountKeyResourceRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_KEY_PROVISIONING_COVERAGE,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS,
  ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS,
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  type AccountKeyProvisionedResource,
  type AccountKeyProvisioningRequirement,
  type AccountKeyProvisioningSnapshot,
  type AccountKeyResourceSession,
  type ResourceFailure,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/accountKeyResource"

export const ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES = {
  Complete: "complete",
  Incomplete: "incomplete",
} as const

export const ACCOUNT_KEY_RECONCILIATION_OUTCOMES = {
  Covered: "covered",
  Created: "created",
  CoveredAfterUncertain: "covered-after-uncertain",
  BlockedIncompleteInventory: "blocked-incomplete-inventory",
  BlockedInputRequired: "blocked-input-required",
  Rejected: "rejected",
  Uncertain: "uncertain",
} as const

const ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES = {
  Applied: "applied",
  Rejected: "rejected",
  Uncertain: "uncertain",
} as const

export const ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS = {
  OrphanedPlacement: "orphaned-placement",
} as const

export const ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES = {
  DuplicateResourceRefs: "duplicate-resource-refs",
  InheritedAccountGroupUnavailable: "inherited-account-group-unavailable",
  InvalidRequirementPlacement: "invalid-requirement-placement",
  PartialFailure: "partial-failure",
  RefreshFailed: "refresh-failed",
  UnknownCoverage: "unknown-coverage",
  UnknownPlacement: "unknown-placement",
} as const

export type AccountKeyReconciliationInventoryIssue = {
  readonly code: (typeof ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES)[keyof typeof ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES]
  readonly count: number
}

export type AccountKeyReconciliationRequirementResult =
  | {
      readonly requirement: AccountKeyProvisioningRequirement
      readonly outcome: typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered
    }
  | {
      readonly requirement: AccountKeyProvisioningRequirement
      readonly outcome: typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created
      readonly created: AccountKeyProvisionedResource
    }
  | {
      readonly requirement: AccountKeyProvisioningRequirement
      readonly outcome:
        | typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory
        | typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired
    }
  | {
      readonly requirement: AccountKeyProvisioningRequirement
      readonly outcome:
        | typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain
        | typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain
      readonly failure: ResourceFailure
    }
  | {
      readonly requirement: AccountKeyProvisioningRequirement
      readonly outcome: typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected
      readonly failure: ResourceFailure
    }

export type AccountKeyReconciliationInvalidResource = {
  readonly ref: AccountKeyProvisioningSnapshot["items"][number]["ref"]
  readonly displayLabel?: string
  readonly groupLabel?: string
  readonly reasonCode: typeof ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS.OrphanedPlacement
}

export type AccountKeyReconciliationRenameResult =
  | {
      readonly ref: AccountKeyProvisioningSnapshot["items"][number]["ref"]
      readonly outcome: typeof ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES.Applied
    }
  | {
      readonly ref: AccountKeyProvisioningSnapshot["items"][number]["ref"]
      readonly outcome: typeof ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES.Rejected
      readonly failure: ResourceFailure
    }
  | {
      readonly ref: AccountKeyProvisioningSnapshot["items"][number]["ref"]
      readonly outcome: typeof ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES.Uncertain
      readonly failure: ResourceFailure
    }

export type AccountKeyInventoryReconciliationResult = {
  readonly inventoryStatus: (typeof ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES)[keyof typeof ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES]
  readonly requirementResults: readonly AccountKeyReconciliationRequirementResult[]
  readonly invalidResources: readonly AccountKeyReconciliationInvalidResource[]
  readonly renameResults: readonly AccountKeyReconciliationRenameResult[]
  readonly inventoryIssues?: readonly AccountKeyReconciliationInventoryIssue[]
  readonly partialFailure?: ResourceFailure
}

type AccountKeyInventoryReconciliationOptions = ResourceOperationOptions & {
  readonly renameSuggestedResources?: boolean
}

const collectCoveredRequirementKeys = (
  snapshot: AccountKeyProvisioningSnapshot,
  requirementKeys: ReadonlySet<string>,
) =>
  new Set(
    snapshot.items.flatMap((item) =>
      item.coverage === ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable &&
      item.placement.kind ===
        ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement &&
      isValidRequirementPlacement(item.placement.requirementKeys) &&
      item.placement.requirementKeys.every((requirementKey) =>
        requirementKeys.has(requirementKey),
      )
        ? item.placement.requirementKeys
        : [],
    ),
  )

const getRequirementIdentities = (snapshot: AccountKeyProvisioningSnapshot) => {
  const identities = snapshot.requirements.map(
    ({ requirementKey }) => requirementKey,
  )
  if (
    identities.some(
      (requirementKey) =>
        requirementKey.trim().length === 0 || requirementKey.length > 2048,
    ) ||
    new Set(identities).size !== identities.length
  ) {
    throw new Error("Invalid account key provisioning requirements")
  }
  return identities
}

const isValidRequirementPlacement = (
  requirementKeys: readonly string[],
): boolean =>
  requirementKeys.length > 0 &&
  requirementKeys.every(
    (requirementKey) =>
      requirementKey.trim().length > 0 && requirementKey.length <= 2048,
  ) &&
  new Set(requirementKeys).size === requirementKeys.length

const mergeInventoryIssues = (
  ...groups: readonly (readonly AccountKeyReconciliationInventoryIssue[])[]
): AccountKeyReconciliationInventoryIssue[] => {
  const counts = new Map<
    AccountKeyReconciliationInventoryIssue["code"],
    number
  >()
  for (const issue of groups.flat()) {
    counts.set(issue.code, (counts.get(issue.code) ?? 0) + issue.count)
  }
  return Array.from(counts, ([code, count]) => ({ code, count }))
}

const collectInventoryIssues = (
  snapshot: AccountKeyProvisioningSnapshot,
  requirementKeys: ReadonlySet<string>,
  resourceRefKeys: readonly string[],
): AccountKeyReconciliationInventoryIssue[] => {
  const issues: AccountKeyReconciliationInventoryIssue[] = []
  const add = (
    code: AccountKeyReconciliationInventoryIssue["code"],
    count = 1,
  ) => issues.push({ code, count })

  if (snapshot.partialFailure) {
    add(ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.PartialFailure)
  }

  const resourceRefCounts = new Map<string, number>()
  for (const refKey of resourceRefKeys) {
    resourceRefCounts.set(refKey, (resourceRefCounts.get(refKey) ?? 0) + 1)
  }
  const duplicateResourceRefs = Array.from(resourceRefCounts.values()).filter(
    (count) => count > 1,
  ).length
  if (duplicateResourceRefs > 0) {
    add(
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.DuplicateResourceRefs,
      duplicateResourceRefs,
    )
  }

  for (const item of snapshot.items) {
    if (item.coverage === ACCOUNT_KEY_PROVISIONING_COVERAGE.Unknown) {
      add(ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.UnknownCoverage)
    }
    if (
      item.placement.kind === ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Unknown
    ) {
      add(
        item.placement.reasonCode ===
          ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS.InheritedAccountGroupUnavailable
          ? ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.InheritedAccountGroupUnavailable
          : ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.UnknownPlacement,
      )
    }
    if (
      item.placement.kind ===
        ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement &&
      (!isValidRequirementPlacement(item.placement.requirementKeys) ||
        item.placement.requirementKeys.some(
          (requirementKey) => !requirementKeys.has(requirementKey),
        ))
    ) {
      add(
        ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.InvalidRequirementPlacement,
      )
    }
  }

  return mergeInventoryIssues(issues)
}

const analyzeSnapshot = (
  snapshot: AccountKeyProvisioningSnapshot,
  expectedRequirementIdentities?: readonly string[],
) => {
  const requirementIdentities = getRequirementIdentities(snapshot)
  const requirementKeys = new Set(requirementIdentities)
  if (
    expectedRequirementIdentities &&
    (expectedRequirementIdentities.length !== requirementIdentities.length ||
      expectedRequirementIdentities.some(
        (requirementKey) => !requirementKeys.has(requirementKey),
      ))
  ) {
    throw new Error("Account key provisioning requirements changed")
  }

  const resourceRefKeys = snapshot.items.map(({ ref }) =>
    buildAccountKeyResourceRuntimeKeyId(ref),
  )
  const inventoryIssues = collectInventoryIssues(
    snapshot,
    requirementKeys,
    resourceRefKeys,
  )
  const incomplete = inventoryIssues.length > 0
  const invalidResources = snapshot.items.flatMap((item) =>
    item.placement.kind === ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Orphaned
      ? [
          {
            ref: item.ref,
            ...(item.displayName ? { displayLabel: item.displayName } : {}),
            ...(item.placement.displayName
              ? { groupLabel: item.placement.displayName }
              : {}),
            reasonCode:
              ACCOUNT_KEY_RECONCILIATION_INVALID_REASONS.OrphanedPlacement,
          },
        ]
      : [],
  )

  return {
    coveredRequirementKeys: collectCoveredRequirementKeys(
      snapshot,
      requirementKeys,
    ),
    incomplete,
    inventoryIssues,
    invalidResources,
    requirementIdentities,
  }
}

/** Reconciles one complete native key inventory without replaying uncertain mutations. */
export async function reconcileAccountKeyInventory(
  session: AccountKeyResourceSession,
  options?: AccountKeyInventoryReconciliationOptions,
): Promise<AccountKeyInventoryReconciliationResult> {
  const provisioning = session.provisioning
  if (!provisioning) {
    throw new Error("Account key provisioning is not supported")
  }

  const operationOptions = options?.signal
    ? { signal: options.signal }
    : undefined
  const snapshot = await provisioning.inspect(operationOptions)
  const initialAnalysis = analyzeSnapshot(snapshot)
  const requirementIdentities = initialAnalysis.requirementIdentities
  let coveredRequirementKeys = initialAnalysis.coveredRequirementKeys
  const requirementResults: AccountKeyReconciliationRequirementResult[] = []
  let inventoryIncomplete = initialAnalysis.incomplete
  let inventoryIssues = initialAnalysis.inventoryIssues
  let invalidResources = initialAnalysis.invalidResources
  let partialFailure = snapshot.partialFailure
  const renameResults: AccountKeyReconciliationRenameResult[] = []

  if (options?.renameSuggestedResources && !inventoryIncomplete) {
    const renameCandidates = snapshot.items.filter(
      (item) =>
        item.renameSuggestion !== undefined &&
        item.coverage === ACCOUNT_KEY_PROVISIONING_COVERAGE.Usable &&
        item.placement.kind ===
          ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS.Requirement,
    )
    if (renameCandidates.length > 0 && !provisioning.rename) {
      throw new Error("Account key provisioning rename is not supported")
    }
    for (const item of renameCandidates) {
      const renameResult = await provisioning.rename!(
        item.ref,
        operationOptions,
      )
      if (renameResult.certainty === "applied") {
        renameResults.push({
          ref: item.ref,
          outcome: ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES.Applied,
        })
      } else if (renameResult.certainty === "not-applied") {
        renameResults.push({
          ref: item.ref,
          outcome: ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES.Rejected,
          failure: renameResult.failure,
        })
      } else {
        renameResults.push({
          ref: item.ref,
          outcome: ACCOUNT_KEY_RECONCILIATION_MUTATION_OUTCOMES.Uncertain,
          failure: renameResult.failure,
        })
      }
    }
  }

  for (const requirement of snapshot.requirements) {
    if (coveredRequirementKeys.has(requirement.requirementKey)) {
      requirementResults.push({
        requirement,
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
      })
      continue
    }

    if (inventoryIncomplete) {
      requirementResults.push({
        requirement,
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory,
      })
      continue
    }

    if (
      requirement.provisioning.kind ===
      ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.InputRequired
    ) {
      requirementResults.push({
        requirement,
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
      })
      continue
    }

    const result = await provisioning.provision(
      requirement.requirementKey,
      operationOptions,
    )
    if (result.certainty === "applied") {
      requirementResults.push({
        requirement,
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
        created: result.value,
      })
    } else if (result.certainty === "not-applied") {
      requirementResults.push({
        requirement,
        outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
        failure: result.failure,
      })
    } else {
      let coveredAfterUncertain = false
      try {
        const refreshedSnapshot = await provisioning.inspect(operationOptions)
        const refreshedAnalysis = analyzeSnapshot(
          refreshedSnapshot,
          requirementIdentities,
        )
        if (refreshedSnapshot.partialFailure) {
          partialFailure = refreshedSnapshot.partialFailure
        }
        if (refreshedAnalysis.incomplete) {
          inventoryIncomplete = true
          inventoryIssues = refreshedAnalysis.inventoryIssues
        } else {
          inventoryIssues = []
          coveredRequirementKeys = refreshedAnalysis.coveredRequirementKeys
          invalidResources = refreshedAnalysis.invalidResources
          coveredAfterUncertain = coveredRequirementKeys.has(
            requirement.requirementKey,
          )
        }
      } catch {
        inventoryIncomplete = true
        inventoryIssues = mergeInventoryIssues(inventoryIssues, [
          {
            code: ACCOUNT_KEY_RECONCILIATION_INVENTORY_ISSUES.RefreshFailed,
            count: 1,
          },
        ])
      }
      requirementResults.push({
        requirement,
        outcome: coveredAfterUncertain
          ? ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain
          : ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain,
        failure: result.failure,
      })
    }
  }

  return {
    inventoryStatus: inventoryIncomplete
      ? ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Incomplete
      : ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Complete,
    requirementResults,
    invalidResources: inventoryIncomplete ? [] : invalidResources,
    renameResults,
    ...(inventoryIssues.length > 0 ? { inventoryIssues } : {}),
    ...(partialFailure ? { partialFailure } : {}),
  }
}
