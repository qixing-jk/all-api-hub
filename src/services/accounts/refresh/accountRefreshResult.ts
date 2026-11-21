import type {
  AccountData,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { SiteHealthStatus } from "~/types"
import { t } from "~/utils/i18n/core"

/** Map a snapshot read to the standard refresh result. */
export async function readAccountRefreshResult(
  read: () => Promise<AccountData>,
  onError?: (error: unknown) => void,
): Promise<RefreshAccountResult> {
  try {
    const data = await read()
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    onError?.(error)
    return { success: false, healthStatus: determineHealthStatus(error) }
  }
}
