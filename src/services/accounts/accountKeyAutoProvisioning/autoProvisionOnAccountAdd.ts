import toast from "react-hot-toast"

import { ensureDefaultApiTokenForAccount } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { accountStorage } from "~/services/accounts/accountStorage"
import { DefaultTokenLifecyclePolicyBlockedError } from "~/services/accounts/defaultTokenLifecycle"
import {
  canRunAccountDefaultTokenAutomation,
  createStoredAccountKeyProductContext,
} from "~/services/accounts/keyProductCapabilities"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountOperations")

/** Best-effort default API key provisioning after an account is added. */
export async function autoProvisionKeyOnAccountAdd(
  accountId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return

  try {
    const account = await accountStorage.getAccountById(accountId)
    if (!account) {
      logger.warn("Auto-provision skipped: account not found", { accountId })
      return
    }

    if (account.disabled === true || account.authType === AuthTypeEnum.None) {
      return
    }

    if (
      !canRunAccountDefaultTokenAutomation(
        createStoredAccountKeyProductContext(account),
      )
    ) {
      return
    }

    const { created } = await ensureDefaultApiTokenForAccount({ account })

    if (created) {
      toast.success(
        t("messages:accountOperations.autoProvisionCreated", {
          accountName: account.site_name,
        }),
      )
    } else {
      showWarningToast(
        t("messages:accountOperations.autoProvisionAlreadyHad", {
          accountName: account.site_name,
        }),
      )
    }
  } catch (error) {
    if (error instanceof DefaultTokenLifecyclePolicyBlockedError) {
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
