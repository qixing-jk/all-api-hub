import toast from "~/lib/notify"
import { ensureAllGroupKeysForAccount } from "~/services/accounts/accountKeyAutoProvisioning/ensureAllGroupKeys"
import { ensureDefaultApiTokenForAccount } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
  type AccountKeyInventoryReconciliationResult,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { DefaultTokenLifecyclePolicyBlockedError } from "~/services/accounts/defaultTokenLifecycle"
import {
  canRunAccountDefaultTokenAutomation,
  createStoredAccountKeyProductContext,
} from "~/services/accounts/keyProductCapabilities"
import {
  ACCOUNT_USER_FEATURE_IDS,
  resolveAccountUserFeatureAvailability,
} from "~/services/apiAdapters/accountCapabilitySupport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"
import {
  ACCOUNT_KEY_AUTO_PROVISION_MODES,
  type AccountKeyAutoProvisionMode,
} from "~/types/accountKeyAutoProvisioning"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountOperations")

/** Reports group coverage without disclosing resource identifiers or secrets. */
function showAllGroupProvisioningResult(
  accountName: string,
  result: AccountKeyInventoryReconciliationResult | null,
) {
  const actionLabel = t("keyManagement:repairMissingKeys.action")
  if (!result) {
    toast.warning(
      t("messages:accountOperations.autoProvisionGroupsUnsupported", {
        accountName,
      }),
    )
    return
  }

  const createdCount = result.requirementResults.filter(
    ({ outcome }) => outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
  ).length
  const coveredCount = result.requirementResults.filter(
    ({ outcome }) =>
      outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered ||
      outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain,
  ).length
  const pendingCount =
    result.requirementResults.length - createdCount - coveredCount

  if (
    result.inventoryStatus ===
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Incomplete ||
    pendingCount > 0
  ) {
    toast.warning(
      t("messages:accountOperations.autoProvisionGroupsIncomplete", {
        accountName,
        count: createdCount,
        actionLabel,
      }),
    )
    return
  }

  if (result.requirementResults.length === 0) {
    toast.warning(
      t("messages:accountOperations.autoProvisionGroupsUnavailable", {
        accountName,
        actionLabel,
      }),
    )
    return
  }

  toast.success(
    createdCount > 0
      ? t("messages:accountOperations.autoProvisionGroupsCreated", {
          accountName,
          count: createdCount,
        })
      : t("messages:accountOperations.autoProvisionGroupsCovered", {
          accountName,
        }),
  )
}

/** Best-effort API key provisioning after an account is added. */
export async function autoProvisionKeyOnAccountAdd(
  accountId: string,
  enabled: boolean,
  mode: AccountKeyAutoProvisionMode = ACCOUNT_KEY_AUTO_PROVISION_MODES.Default,
): Promise<void> {
  if (!enabled) return

  let accountName = ""
  try {
    const account = await accountQueries.getAccountById(accountId)
    if (!account) {
      logger.warn("Auto-provision skipped: account not found", { accountId })
      return
    }

    accountName = account.site_name

    if (account.disabled === true || account.authType === AuthTypeEnum.None) {
      return
    }

    if (mode === ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups) {
      showAllGroupProvisioningResult(
        accountName,
        await ensureAllGroupKeysForAccount(account),
      )
      return
    }

    const capabilities = getSiteTypeCapabilities(account.site_type)
    const featureAvailability = resolveAccountUserFeatureAvailability(
      account.site_type,
      ACCOUNT_USER_FEATURE_IDS.DefaultTokenAutomation,
      capabilities,
    )
    if (featureAvailability.status === "unsupported") {
      toast.warning(
        t("messages:accountOperations.autoProvisionUnsupported", {
          accountName: account.site_name,
        }),
      )
      logger.info("Auto-provision unavailable for account site type", {
        accountId,
        siteType: account.site_type,
        reason: featureAvailability.reason,
      })
      return
    }

    if (
      !canRunAccountDefaultTokenAutomation(
        createStoredAccountKeyProductContext(account),
      )
    )
      return

    const { created } = await ensureDefaultApiTokenForAccount({ account })

    if (created) {
      toast.success(
        t("messages:accountOperations.autoProvisionCreated", {
          accountName: account.site_name,
        }),
      )
    } else {
      toast.warning(
        t("messages:accountOperations.autoProvisionAlreadyHad", {
          accountName: account.site_name,
        }),
      )
    }
  } catch (error) {
    if (error instanceof DefaultTokenLifecyclePolicyBlockedError) {
      toast.warning(
        t("messages:accountOperations.autoProvisionNeedsManualAction", {
          accountName,
          actionLabel: t("keyManagement:dialog.createToken"),
        }),
      )
      logger.info("Auto-provision requires a manual key workflow", {
        accountId,
        reason: error.reason,
      })
      return
    }

    toast.error(
      t("messages:accountOperations.autoProvisionFailed", {
        actionLabel: t("keyManagement:repairMissingKeys.action"),
      }),
    )
    logger.warn("Auto-provision key after account add failed", {
      accountId,
      error: getErrorMessage(error),
    })
  }
}
