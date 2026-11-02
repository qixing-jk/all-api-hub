import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Spinner } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import type { AuthConfig } from "~/services/apiTransport/type"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import type { CheckInFeedbackSnapshot } from "~/services/checkin/feedback/report"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { SiteAccount } from "~/types"
import { openAccountManagerWithSearch } from "~/utils/navigation"

import { FeedbackForm } from "./FeedbackForm"
import type { CheckInFeedbackSource } from "./useCheckInFeedback"

/** Orders saved credentials so complete cookies are redacted before contained tokens. */
function getAccountSecrets(account: SiteAccount): string[] {
  return [
    account.account_info.access_token,
    account.cookieAuth?.sessionCookie,
    account.sub2apiAuth?.refreshToken,
  ]
    .filter((secret): secret is string => Boolean(secret))
    .sort((a, b) => b.length - a.length)
}

/** Redacts saved execution messages without replacing editor authentication. */
function sanitizeExecution(
  execution: CheckInFeedbackSnapshot["execution"],
  account: SiteAccount | null,
) {
  if (!execution || !account) return execution
  const secrets = getAccountSecrets(account)
  return {
    ...execution,
    rawMessage: execution.rawMessage
      ? toSanitizedErrorSummary(execution.rawMessage, secrets)
      : execution.rawMessage,
  }
}

/** Projects only saved refresh facts needed by the public report. */
function getRefreshSnapshot(
  account: SiteAccount,
): NonNullable<CheckInFeedbackSnapshot["refresh"]> {
  const secrets = getAccountSecrets(account)
  return {
    health: {
      ...account.health,
      reason: account.health.reason
        ? toSanitizedErrorSummary(account.health.reason, secrets)
        : account.health.reason,
    },
    last_sync_time: account.last_sync_time,
  }
}

/** Preserves editor drafts while enriching identified accounts with saved execution facts. */
export default function CheckInFeedbackDialog({
  source,
  onClose,
}: {
  source: CheckInFeedbackSource
  onClose: () => void
}) {
  const { t } = useTranslation(["accountDialog", "autoCheckin"])
  const [data, setData] = useState<{
    snapshot: CheckInFeedbackSnapshot
    auth?: AuthConfig
  } | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    if ("snapshot" in source) {
      const accountId = source.accountId
      if (accountId) {
        void Promise.all([
          accountQueries.getAccountById(accountId).catch(() => null),
          source.snapshot.execution
            ? Promise.resolve(null)
            : autoCheckinStorage.getStatus().catch(() => null),
        ]).then(([account, status]) => {
          if (active)
            setData({
              ...source,
              snapshot: {
                ...source.snapshot,
                refresh: account
                  ? getRefreshSnapshot(account)
                  : source.snapshot.refresh,
                execution: sanitizeExecution(
                  source.snapshot.execution ?? status?.perAccount?.[accountId],
                  account,
                ),
              },
            })
        })
      } else {
        setData(source)
      }
    } else {
      void accountQueries
        .getAccountById(source.accountId)
        .then(async (account) => {
          if (!active) return
          if (!account) {
            setUnavailable(true)
            return
          }
          const execution =
            source.execution ??
            (await autoCheckinStorage.getStatus().catch(() => null))
              ?.perAccount?.[source.accountId]
          if (!active) return
          setData({
            snapshot: {
              baseUrl: account.site_url,
              siteType: account.site_type,
              checkIn: account.checkIn,
              refresh: getRefreshSnapshot(account),
              execution,
            },
            auth: {
              authType: account.authType,
              accessToken: account.account_info.access_token,
              cookie: account.cookieAuth?.sessionCookie,
              refreshToken: account.sub2apiAuth?.refreshToken,
              userId: account.account_info.id,
            },
          })
        })
        .catch(() => {
          if (active) setUnavailable(true)
        })
    }
    return () => {
      active = false
    }
  }, [source])
  if (data) return <FeedbackForm {...data} onClose={onClose} />
  return (
    <Modal
      isOpen
      title={t("checkInFeedback.title")}
      header={
        <h2 className="text-lg font-semibold">{t("checkInFeedback.title")}</h2>
      }
      onClose={onClose}
      size="md"
    >
      {unavailable ? (
        <div className="space-y-density-3">
          <p role="alert">{t("checkInFeedback.accountUnavailable")}</p>
          <Button
            type="button"
            onClick={() => {
              void openAccountManagerWithSearch(source.accountId ?? "")
              onClose()
            }}
          >
            {t("checkInFeedback.accounts")}
          </Button>
        </div>
      ) : (
        <Spinner />
      )}
    </Modal>
  )
}
