import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, Spinner } from "~/components/ui"
import { Modal } from "~/components/ui/Dialog/Modal"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import type { AuthConfig } from "~/services/apiTransport/type"
import {
  readFeedbackExecution,
  type FeedbackExecutionEvidence,
} from "~/services/checkin/feedback/execution"
import {
  FEEDBACK_EXECUTION_RECORDS,
  FEEDBACK_EXECUTION_SOURCES,
} from "~/services/checkin/feedback/executionTypes"
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
    account.kimiOpenPlatformAuth?.refreshToken,
    account.aimlApiAuth?.apiKey,
  ]
    .filter((secret): secret is string => Boolean(secret))
    .sort((a, b) => b.length - a.length)
}

/** Redacts public execution messages without replacing editor authentication. */
function sanitizeExecutionEvidence(
  evidence: FeedbackExecutionEvidence,
  account: SiteAccount | null,
): FeedbackExecutionEvidence {
  const { execution } = evidence
  if (!execution) return { ...evidence, execution }
  if (!account)
    return {
      ...evidence,
      execution: { ...execution, rawMessage: undefined, message: undefined },
    }
  const secrets = getAccountSecrets(account)
  return {
    ...evidence,
    execution: {
      ...execution,
      message: execution.message
        ? toSanitizedErrorSummary(execution.message, secrets)
        : execution.message,
      rawMessage: execution.rawMessage
        ? toSanitizedErrorSummary(execution.rawMessage, secrets)
        : execution.rawMessage,
    },
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

/** Retains only the identity needed to keep a later reload tied to this dialog. */
function getAccountIdentity(account: SiteAccount) {
  return {
    siteUrl: account.site_url,
    siteType: account.site_type,
    userId: normalizeAccountIdentity(account.account_info.id),
  }
}

/** Preserves editor drafts while enriching identified accounts with saved execution facts. */
export default function CheckInFeedbackDialog({
  source,
  isOpen = true,
  onClose,
  onCloseComplete,
}: {
  source: CheckInFeedbackSource
  isOpen?: boolean
  onClose: () => void
  onCloseComplete?: () => void
}) {
  const { t } = useTranslation(["accountDialog", "autoCheckin"])
  const [data, setData] = useState<{
    snapshot: CheckInFeedbackSnapshot
    auth?: AuthConfig
    savedAccountIdentity?: ReturnType<typeof getAccountIdentity>
  } | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let active = true
    if ("snapshot" in source) {
      const accountId = source.accountId
      if (accountId) {
        void accountQueries
          .getAccountById(accountId)
          .catch(() => null)
          .then(async (account) => {
            if (!active) return
            const draftUserId = normalizeAccountIdentity(source.auth?.userId)
            if (
              account &&
              (account.site_url !== source.snapshot.baseUrl ||
                account.site_type !== source.snapshot.siteType ||
                (draftUserId !== null &&
                  normalizeAccountIdentity(account.account_info.id) !==
                    draftUserId))
            ) {
              setData({
                ...source,
                snapshot: {
                  ...source.snapshot,
                  execution: undefined,
                  executionRecord: FEEDBACK_EXECUTION_RECORDS.NotLinked,
                  executionSource: FEEDBACK_EXECUTION_SOURCES.UnlinkedDraft,
                },
              })
              return
            }
            const evidence = await readFeedbackExecution(
              accountId,
              source.snapshot.execution,
            )
            if (active)
              setData({
                ...source,
                savedAccountIdentity: account
                  ? getAccountIdentity(account)
                  : undefined,
                snapshot: {
                  ...source.snapshot,
                  siteName: source.snapshot.siteName ?? account?.site_name,
                  refresh: account
                    ? getRefreshSnapshot(account)
                    : source.snapshot.refresh,
                  ...sanitizeExecutionEvidence(evidence, account),
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
          const evidence = await readFeedbackExecution(
            source.accountId,
            source.execution,
          )
          if (!active) return
          setData({
            savedAccountIdentity: getAccountIdentity(account),
            snapshot: {
              baseUrl: account.site_url,
              siteName: account.site_name,
              siteType: account.site_type,
              checkIn: account.checkIn,
              refresh: getRefreshSnapshot(account),
              ...sanitizeExecutionEvidence(evidence, account),
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
  const accountId = source.accountId
  const providedExecution =
    "snapshot" in source ? source.snapshot.execution : source.execution
  /** Rechecks the saved identity before replacing execution evidence. */
  async function reloadExecution(): Promise<FeedbackExecutionEvidence> {
    const notLinked: FeedbackExecutionEvidence = {
      executionRecord: FEEDBACK_EXECUTION_RECORDS.NotLinked,
      executionSource: FEEDBACK_EXECUTION_SOURCES.UnlinkedDraft,
    }
    if (!accountId || !data?.savedAccountIdentity) return notLinked
    const account = await accountQueries.getAccountById(accountId)
    if (!account) return notLinked
    const identity = getAccountIdentity(account)
    if (
      identity.siteUrl !== data.savedAccountIdentity.siteUrl ||
      identity.siteType !== data.savedAccountIdentity.siteType ||
      identity.userId !== data.savedAccountIdentity.userId
    )
      return notLinked
    const evidence = await readFeedbackExecution(accountId)
    return sanitizeExecutionEvidence(evidence, account)
  }
  if (data)
    return (
      <FeedbackForm
        snapshot={data.snapshot}
        auth={data.auth}
        reloadExecution={
          accountId && !providedExecution ? reloadExecution : undefined
        }
        isOpen={isOpen}
        onClose={onClose}
        onCloseComplete={onCloseComplete}
      />
    )
  return (
    <Modal
      isOpen={isOpen}
      onCloseComplete={onCloseComplete}
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
