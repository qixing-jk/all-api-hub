import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, InlineMessage } from "~/components/ui"
import { getNewApiWebsiteTokenCreationTarget } from "~/services/apiAdapters/newApi/variantOperations/tokenCreationPage"
import type { openNewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/client"
import {
  NewApiTokenSessionError,
  NEW_API_TOKEN_SESSION_ERRORS as SESSION_ERRORS,
} from "~/services/apiService/newApiFamily/accessTokens/sessionError"

import { NewApiAccessTokenForm } from "./NewApiAccessTokenForm"
import { NewApiTokenSetupError } from "./NewApiTokenSetupError"
import { NewApiTokenSetupLoading } from "./NewApiTokenSetupLoading"
import {
  NewApiTokenSiteFallback,
  TOKEN_SITE_FALLBACK_REASONS,
  type NewApiTokenSiteFallbackReason,
} from "./NewApiTokenSiteFallback"

type TokenSession = Awaited<ReturnType<typeof openNewApiAccessTokenCreation>>

/** Acquire a website session only after the user's explicit create action. */
export function NewApiTokenCreator({
  siteUrl,
  userId,
  onCreated,
  onReturnToAccount,
  reviewing,
  onReviewingChange,
  footer,
  onBusyChange,
}: {
  siteUrl: string
  userId: string
  onCreated: (token: string) => void
  onReturnToAccount: () => void
  reviewing: boolean
  onReviewingChange: (reviewing: boolean) => void
  footer: HTMLElement | null
  onBusyChange: (busy: boolean) => void
}) {
  const { t } = useTranslation("accountDialog")
  const [session, setSession] = useState<TokenSession>()
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<NewApiTokenSessionError>()
  const [reviewReconnectError, setReviewReconnectError] =
    useState<NewApiTokenSessionError>()
  const [loadStartedAt, setLoadStartedAt] = useState<number>()
  const [siteOpening, setSiteOpening] = useState(false)
  const [openingSiteTab, setOpeningSiteTab] = useState(false)
  const [siteTabOpenFailed, setSiteTabOpenFailed] = useState(false)
  const owner = useRef<{
    active: boolean
    opening: boolean
    session?: TokenSession
  }>({ active: false, opening: false })
  const open = useCallback(
    async (tabId?: number, refresh = false, inReview = false) => {
      const current = owner.current
      if (!current.active || current.opening) return
      current.opening = true
      setLoadStartedAt(Date.now())
      setPending(true)
      setSiteTabOpenFailed(false)
      if (inReview) setReviewReconnectError(undefined)
      let reloading = refresh
      try {
        const { openNewApiAccessTokenCreation, reloadNewApiTokenTab } =
          await import("~/services/apiService/newApiFamily/accessTokens/client")
        if (!current.active) return
        const targetTabId = refresh
          ? await reloadNewApiTokenTab(siteUrl, tabId)
          : tabId
        reloading = false
        if (!current.active) return
        const session = await openNewApiAccessTokenCreation(
          siteUrl,
          userId,
          targetTabId,
        )
        if (!current.active) {
          session.cancel()
          return
        }
        if (current.session) {
          current.session.flow.reconnect(session.flow)
          session.flow = current.session.flow
        }
        current.session?.cancel()
        current.session = session
        setSession(session)
        setFailure(undefined)
      } catch (error) {
        if (!current.active) return
        const sessionError =
          error instanceof NewApiTokenSessionError
            ? error
            : new NewApiTokenSessionError(
                reloading
                  ? SESSION_ERRORS.RELOAD_REQUIRED
                  : SESSION_ERRORS.UNAVAILABLE,
                tabId,
              )
        if (inReview) setReviewReconnectError(sessionError)
        else setFailure(sessionError)
      } finally {
        current.opening = false
        if (current.active) setPending(false)
      }
    },
    [siteUrl, userId],
  )
  useEffect(() => {
    const current = {
      active: true,
      opening: false,
      session: undefined as TokenSession | undefined,
    }
    owner.current = current
    setSession(undefined)
    setFailure(undefined)
    // Defer acquisition until the effect's active lifetime is established.
    queueMicrotask(() => {
      if (current.active) void open()
    })
    return () => {
      current.active = false
      current.session?.cancel()
    }
  }, [open])
  useEffect(() => {
    if (!reviewing) setReviewReconnectError(undefined)
  }, [reviewing])

  const siteTarget = getNewApiWebsiteTokenCreationTarget(siteUrl)
  const renderSiteFallback = (
    reason: NewApiTokenSiteFallbackReason,
    secondaryAction?: ReactNode,
  ) =>
    siteTarget && (
      <NewApiTokenSiteFallback
        target={siteTarget}
        userId={userId}
        reason={reason}
        disabled={
          reason === TOKEN_SITE_FALLBACK_REASONS.UNAVAILABLE &&
          (pending || openingSiteTab)
        }
        promotedActions={
          secondaryAction ? { footer, secondaryAction } : undefined
        }
        onOpeningChange={setSiteOpening}
        onOpened={() => {
          if (owner.current.active) onReturnToAccount()
        }}
      />
    )
  const openSite = async () => {
    const current = owner.current
    setOpeningSiteTab(true)
    setSiteTabOpenFailed(false)
    try {
      const { focusNewApiTokenTab } =
        await import("~/services/apiService/newApiFamily/accessTokens/client")
      if (current.active) await focusNewApiTokenTab(siteUrl, failure?.tabId)
    } catch {
      if (current.active) setSiteTabOpenFailed(true)
    } finally {
      if (current.active) setOpeningSiteTab(false)
    }
  }

  const reloadRequired = failure?.code === SESSION_ERRORS.RELOAD_REQUIRED
  const unsupported = failure?.code === SESSION_ERRORS.UNSUPPORTED
  const promoteSite = unsupported && Boolean(siteTarget)
  const retry = failure && (
    <Button
      type="button"
      variant={promoteSite ? "outline" : "default"}
      loading={pending}
      disabled={siteOpening || openingSiteTab}
      leftIcon={<RefreshCw className="size-4" />}
      onClick={() => void open(failure.tabId, reloadRequired)}
    >
      {reloadRequired
        ? t("tokenCreation.connection.reloadAndRetry")
        : t("common:actions.retry")}
    </Button>
  )

  return (
    <>
      {session ? (
        <div hidden={Boolean(failure)}>
          <NewApiAccessTokenForm
            flow={session.flow}
            onCreated={(token) => {
              if (owner.current.active) onCreated(token)
            }}
            footer={failure ? null : footer}
            onBusyChange={onBusyChange}
            reviewing={reviewing}
            onReviewingChange={onReviewingChange}
            onReturnToAccount={onReturnToAccount}
            onReconnect={() => {
              if (reviewing) {
                void open(
                  reviewReconnectError?.tabId,
                  reviewReconnectError?.code === SESSION_ERRORS.RELOAD_REQUIRED,
                  true,
                )
              } else void open()
            }}
            reconnecting={pending}
            reconnectError={reviewReconnectError}
            sessionRevision={session}
            loadStartedAt={loadStartedAt}
            renderSiteFallback={failure ? undefined : renderSiteFallback}
            siteOpening={siteOpening}
          />
        </div>
      ) : !failure ? (
        <NewApiTokenSetupLoading
          startedAt={loadStartedAt}
          renderSiteFallback={renderSiteFallback}
        />
      ) : null}
      {failure && (
        <NewApiTokenSetupError
          title={
            unsupported
              ? t("tokenCreation.connection.unsupportedTitle")
              : t("tokenCreation.connection.title")
          }
          message={
            reloadRequired
              ? t("tokenCreation.connection.reloadRequired")
              : failure.code === SESSION_ERRORS.IDENTITY_MISMATCH
                ? t("tokenCreation.connection.identityMismatch")
                : unsupported
                  ? t("tokenCreation.connection.unsupported")
                  : t("tokenCreation.connection.sessionRequired")
          }
          footer={footer}
          actions={
            promoteSite ? undefined : (
              <>
                {!unsupported && !reloadRequired && (
                  <Button
                    type="button"
                    variant="outline"
                    loading={openingSiteTab}
                    disabled={pending || siteOpening}
                    leftIcon={<WorkflowTransitionIcon className="size-4" />}
                    onClick={() => void openSite()}
                  >
                    {t("tokenCreation.connection.openSite")}
                  </Button>
                )}
                {retry}
              </>
            )
          }
        >
          {siteTabOpenFailed && (
            <InlineMessage role="alert" tone="warning" size="sm">
              {t("tokenCreation.connection.openSiteFailed")}
            </InlineMessage>
          )}
          {renderSiteFallback(
            TOKEN_SITE_FALLBACK_REASONS.UNAVAILABLE,
            promoteSite ? retry : undefined,
          )}
        </NewApiTokenSetupError>
      )}
    </>
  )
}
