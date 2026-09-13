import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Spinner } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import type { AuthConfig } from "~/services/apiTransport/type"
import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"
import type { CheckInFeedbackSnapshot } from "~/services/checkin/feedback/report"
import { openAccountManagerWithSearch } from "~/utils/navigation"

import { FeedbackForm } from "./FeedbackForm"
import type { CheckInFeedbackSource } from "./useCheckInFeedback"

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
      if (source.accountId && !source.snapshot.execution) {
        void autoCheckinStorage
          .getStatus()
          .catch(() => null)
          .then((status) => {
            if (active)
              setData({
                ...source,
                snapshot: {
                  ...source.snapshot,
                  execution: status?.perAccount?.[source.accountId!],
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
        <div className="space-y-3">
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
