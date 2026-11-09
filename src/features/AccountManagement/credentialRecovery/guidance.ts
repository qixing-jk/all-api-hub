import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  ACCOUNT_MANAGEMENT_ROUTE_ACTIONS,
  ACCOUNT_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/AccountManagement/routeParams"
import toast from "~/lib/notify"
import { supportsAccountCredentialRecovery as supportsRecovery } from "~/services/accountCredentialRecovery/policy"
import {
  ACCOUNT_AUTH_HEALTH_STATUS_CODES,
  SiteHealthStatus,
  type DisplaySiteData,
} from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"
import { openTargetedOptionsPage } from "~/utils/navigation/optionsPage"

const logger = createLogger("AccountCredentialRecoveryGuidance")

type RecoveryAccount = Pick<
  DisplaySiteData,
  "siteType" | "authType" | "baseUrl"
> &
  Partial<Pick<DisplaySiteData, "disabled" | "health">>

/** Only adopted accounts can use account login to replace their saved credential. */
export function supportsAccountCredentialRecovery(
  account: RecoveryAccount | null | undefined,
): boolean {
  return Boolean(
    account &&
      !account.disabled &&
      supportsRecovery({
        authType: account.authType,
        site_type: account.siteType,
        site_url: account.baseUrl,
        account_info: {},
      }),
  )
}

/** Uses the recorded authentication cause rather than guessing from warning text. */
export function hasCredentialRecoveryAuthenticationFailure(
  account: RecoveryAccount | null | undefined,
): boolean {
  return Boolean(
    supportsAccountCredentialRecovery(account) &&
      account?.health?.status === SiteHealthStatus.Warning &&
      account.health.code ===
        ACCOUNT_AUTH_HEALTH_STATUS_CODES.AUTHENTICATION_REQUIRED,
  )
}

/** Targets the account editor's login section from any extension surface. */
export function buildCredentialRecoveryNavigationTarget(accountId: string) {
  return {
    menuItemId: MENU_ITEM_IDS.ACCOUNT,
    params: {
      [ACCOUNT_MANAGEMENT_ROUTE_PARAMS.Action]:
        ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Edit,
      [ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountId]: accountId,
      [ACCOUNT_MANAGEMENT_ROUTE_PARAMS.FocusSection]: "account-login",
    },
  }
}

/** Reuses the active options page or opens one with the same account and section target. */
export async function openAccountCredentialRecoverySettings(accountId: string) {
  const target = buildCredentialRecoveryNavigationTarget(accountId)
  try {
    await openTargetedOptionsPage({
      targetHash: `#${target.menuItemId}`,
      inPageSearchParams: target.params,
      newTabSearchParams: target.params,
    })
  } catch (error) {
    logger.error("Failed to open account login configuration", {
      accountId,
      error,
    })
    toast.error(
      getErrorMessage(error, t("messages:toast.error.operationFailedGeneric")),
    )
    throw error
  }
}
