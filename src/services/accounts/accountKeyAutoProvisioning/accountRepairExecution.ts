import {
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
  reconcileAccountKeyInventory,
  type AccountKeyInventoryReconciliationResult,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { SiteAccount } from "~/types"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairRequirementResult,
  AccountKeyRepairStartOptions,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import { getErrorMessage } from "~/utils/core/error"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import { captureRepairCreatedRuntimeSecrets } from "./repairCreatedRuntimeSecrets"
import { getControlledAccountKeyResourceFailure } from "./repairRequestValidation"

export const createEmptyAccountItemResults = () => ({
  requirementResults: [],
  createdRefs: [],
  invalidResources: [],
  renameResults: [],
})

const stripCreatedSecrets = (
  requirementResults: AccountKeyInventoryReconciliationResult["requirementResults"],
): AccountKeyRepairRequirementResult[] =>
  requirementResults.map((result) =>
    "created" in result
      ? {
          requirement: result.requirement,
          outcome: result.outcome,
          created: { ref: result.created.ref },
        }
      : result,
  )

const classifyReconciliationResult = (
  result: AccountKeyInventoryReconciliationResult,
): AccountKeyRepairAccountResult["outcome"] => {
  if (
    result.requirementResults.length === 0 &&
    result.inventoryStatus ===
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Incomplete
  ) {
    return ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked
  }

  if (
    result.inventoryStatus ===
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Complete &&
    result.requirementResults.every(
      ({ outcome }) =>
        outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered ||
        outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
    ) &&
    result.renameResults.every(
      ({ outcome }) => outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
    )
  ) {
    return result.requirementResults.some(
      ({ outcome }) => outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
    )
      ? ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired
      : ACCOUNT_KEY_REPAIR_OUTCOMES.Covered
  }

  if (
    result.requirementResults.length > 0 &&
    result.requirementResults.every(
      ({ outcome }) =>
        outcome ===
          ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory ||
        outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
    )
  ) {
    return ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked
  }

  return ACCOUNT_KEY_REPAIR_OUTCOMES.Partial
}

/** Derives the shared per-origin repair queue and result identity. */
export function getOriginKey(siteUrl: string): string {
  return normalizeUrlForOriginKey(siteUrl, {
    lowerCase: true,
    stripTrailingSlashes: false,
  })
}

/** Executes one account repair, captures temporary secrets and publishes only safe results. */
export async function executeAccountKeyRepair({
  jobId,
  account,
  accountName,
  abortSignal,
  options,
  recordResult,
}: {
  jobId: string
  account: SiteAccount
  accountName: string
  abortSignal: AbortSignal
  options: AccountKeyRepairStartOptions
  recordResult: (result: AccountKeyRepairAccountResult) => Promise<void>
}): Promise<void> {
  const originKey = getOriginKey(account.site_url)
  try {
    if (abortSignal.aborted) {
      return
    }

    const keyResourceManagement = getSiteTypeCapabilities(account.site_type)
      .account?.keyResourceManagement
    if (!keyResourceManagement) {
      await recordResult({
        accountId: account.id,
        accountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
        skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
        ...createEmptyAccountItemResults(),
        finishedAt: Date.now(),
      })
      return
    }

    const { request } = createAccountApiRequestFromStoredAccount(account)
    const session = await keyResourceManagement.open(
      {
        account: {
          id: account.id,
          name: accountName,
          siteType: account.site_type,
        },
        request,
      },
      { signal: abortSignal },
    )

    if (abortSignal.aborted) {
      return
    }

    if (!session.provisioning) {
      await recordResult({
        accountId: account.id,
        accountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
        skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
        ...createEmptyAccountItemResults(),
        finishedAt: Date.now(),
      })
      return
    }

    const result = await reconcileAccountKeyInventory(session, {
      signal: abortSignal,
      renameSuggestedResources: options.renameAutoTemplateTokens !== false,
    })

    if (abortSignal.aborted) {
      return
    }

    await captureRepairCreatedRuntimeSecrets(
      jobId,
      result.requirementResults.flatMap((requirementResult) =>
        "created" in requirementResult &&
        requirementResult.created.createdSecret
          ? [
              {
                ref: requirementResult.created.ref,
                secret: requirementResult.created.createdSecret.secret,
              },
            ]
          : [],
      ),
    )
    const requirementResults = stripCreatedSecrets(result.requirementResults)

    await recordResult({
      accountId: account.id,
      accountName,
      siteType: account.site_type,
      siteUrlOrigin: originKey,
      outcome: classifyReconciliationResult(result),
      inventoryStatus: result.inventoryStatus,
      ...(result.inventoryIssues?.length
        ? { inventoryIssues: [...result.inventoryIssues] }
        : {}),
      ...(result.partialFailure
        ? { partialFailure: result.partialFailure }
        : {}),
      requirementResults,
      createdRefs: requirementResults.flatMap((requirementResult) =>
        "created" in requirementResult ? [requirementResult.created.ref] : [],
      ),
      invalidResources: result.invalidResources.map((resource) => ({
        accountId: account.id,
        accountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        ref: resource.ref,
        ...(resource.displayLabel
          ? { displayLabel: resource.displayLabel }
          : {}),
        ...(resource.groupLabel ? { groupLabel: resource.groupLabel } : {}),
        reason: resource.reasonCode,
      })),
      renameResults: [...result.renameResults],
      finishedAt: Date.now(),
    })
  } catch (error) {
    if (abortSignal.aborted) {
      return
    }

    const failure = getControlledAccountKeyResourceFailure(error)

    await recordResult({
      accountId: account.id,
      accountName,
      siteType: account.site_type,
      siteUrlOrigin: originKey,
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
      ...(failure ? { failure } : { errorMessage: getErrorMessage(error) }),
      ...createEmptyAccountItemResults(),
      finishedAt: Date.now(),
    })
  }
}
