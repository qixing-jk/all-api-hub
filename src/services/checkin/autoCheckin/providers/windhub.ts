import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { WINDHUB_CHECKIN_PAGE, WINDHUB_ORIGIN } from "~/constants/windhub"
import type { WindhubPageResult } from "~/services/apiAdapters/windhub/pageCheckin"
import { detectWithStatusReadback } from "~/services/checkin/autoCheckin/providers/detection"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import {
  createTab,
  removeTab,
  sendTabMessageWithRetry,
} from "~/utils/browser/browserApi"

import type { AutoCheckinProvider } from "./contracts"

/** Checks the exact site and account configuration before any tab work. */
function isWindhub(account: SiteAccount): boolean {
  try {
    return (
      account.site_type === SITE_TYPES.WINDHUB &&
      new URL(account.site_url).origin === WINDHUB_ORIGIN &&
      account.authType === AuthTypeEnum.None &&
      Number.isSafeInteger(Number(account.account_info.id)) &&
      Number(account.account_info.id) > 0
    )
  } catch {
    return false
  }
}

/** Use a fresh inactive tab so old content scripts cannot affect the run. */
async function withPage(
  action: (tabId: number) => Promise<WindhubPageResult>,
  retainOnError = false,
): Promise<WindhubPageResult> {
  const tab = await createTab(WINDHUB_CHECKIN_PAGE, false)
  if (typeof tab?.id !== "number") throw new Error("Windhub page unavailable")
  let close = true
  try {
    const result = await action(tab.id)
    if (result.kind === "unconfirmed") close = false
    return result
  } catch (error) {
    if (retainOnError) close = false
    throw error
  } finally {
    if (close) await removeTab(tab.id).catch(() => undefined)
  }
}

/** Sends one account-bound command to the page content script. */
async function send(
  tabId: number,
  userId: string,
  mode: "status" | "execute",
): Promise<WindhubPageResult> {
  return await sendTabMessageWithRetry<WindhubPageResult>(
    tabId,
    {
      action: RuntimeActionIds.ContentWindhubCheckin,
      mode,
      expectedUserId: userId,
    },
    { frameId: 0 },
  )
}

/** Verifies the account session and reads today's state without posting. */
export async function readWindhubBrowserStatus(
  userId: string,
): Promise<WindhubPageResult> {
  return await withPage((tabId) => send(tabId, userId, "status"))
}

export const windhubProvider: AutoCheckinProvider = {
  requiresAuthoritativeStatusBeforeMutation: true,
  getReadiness(account) {
    return isWindhub(account)
      ? { ready: true }
      : {
          ready: false,
          reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
        }
  },
  detect(context) {
    return detectWithStatusReadback(context, (value) =>
      windhubProvider.getStatus!(value),
    )
  },
  async getStatus(context) {
    const account = context.account
    if (!account || !isWindhub(account)) return undefined
    try {
      const result = await readWindhubBrowserStatus(
        String(account.account_info.id),
      )
      if (result.kind !== "status") {
        return {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
          reason:
            result.kind === "identity_mismatch"
              ? "identity_mismatch"
              : "source_unavailable",
          attemptedAt: context.observedAt,
        }
      }
      return {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        availability: result.enabled
          ? CHECK_IN_METHOD_AVAILABILITIES.Enabled
          : CHECK_IN_METHOD_AVAILABILITIES.Disabled,
        today: result.checked
          ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
          : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        evidence: {
          source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
          observedAt: context.observedAt,
        },
      }
    } catch {
      return {
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
        reason: "source_unavailable",
        attemptedAt: context.observedAt,
      }
    }
  },
  async checkIn(value, context) {
    const account = value as SiteAccount
    if (
      !isWindhub(account) ||
      context.statusProof?.availability !==
        CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      context.statusProof.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
    ) {
      return {
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
      }
    }
    try {
      const result = await withPage(
        (tabId) => send(tabId, String(account.account_info.id), "execute"),
        true,
      )
      if (result.kind === "checked")
        return {
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        }
      if (result.kind === "already")
        return {
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          messageKey:
            AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.alreadyCheckedToday,
        }
      if (result.kind === "identity_mismatch")
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
        }
      if (result.kind === "unavailable")
        return {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
        }
      return {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      }
    } catch {
      return {
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      }
    }
  },
}
