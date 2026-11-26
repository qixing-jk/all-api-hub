import { RefreshCw } from "lucide-react"
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Button, InlineMessage } from "~/components/ui"
import type { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"
import type { NewApiTokenSessionError } from "~/services/apiService/newApiFamily/accessTokens/sessionError"

import { NewApiTokenDetails } from "./NewApiTokenDetails"
import { NewApiTokenPermissions } from "./NewApiTokenPermissions"
import { NewApiTokenRecovery } from "./NewApiTokenRecovery"
import { NewApiTokenSetupError } from "./NewApiTokenSetupError"
import { NewApiTokenSetupLoading } from "./NewApiTokenSetupLoading"
import {
  TOKEN_SITE_FALLBACK_REASONS,
  type NewApiTokenSiteFallbackReason,
} from "./NewApiTokenSiteFallback"
import { NewApiTokenVerificationFields } from "./NewApiTokenVerificationFields"
import {
  TOKEN_CREATION_FEEDBACK as FEEDBACK,
  siteFallbackErrors,
  type TokenCreationError,
} from "./tokenCreationFeedback"
import { useNewApiTokenCreation } from "./useNewApiTokenCreation"

/** Explicit, draft-bound management credential creation. */
export function NewApiAccessTokenForm({
  flow,
  onCreated,
  onReconnect,
  reconnecting = false,
  reconnectError,
  sessionRevision,
  loadStartedAt,
  renderSiteFallback,
  siteOpening = false,
  footer,
  onBusyChange,
  reviewing,
  onReviewingChange,
  onReturnToAccount,
}: {
  flow: NewApiAccessTokenCreation
  onCreated: (token: string) => void
  onReconnect?: () => void
  reconnecting?: boolean
  reconnectError?: NewApiTokenSessionError
  sessionRevision?: unknown
  loadStartedAt?: number
  renderSiteFallback?: (reason: NewApiTokenSiteFallbackReason) => ReactNode
  siteOpening?: boolean
  footer?: HTMLElement | null
  onBusyChange?: (busy: boolean) => void
  reviewing: boolean
  onReviewingChange: (reviewing: boolean) => void
  onReturnToAccount?: () => void
}) {
  const { t } = useTranslation("accountDialog")
  const {
    capabilities,
    settings,
    permissions,
    verification,
    hasAvailableMethods,
    complete,
    created,
    disabled,
    pending,
    canSubmit,
    canCancel,
    cancelVerification,
    error,
    retryLoad,
    submit,
    recovery,
  } = useNewApiTokenCreation({
    flow,
    onCreated,
    onReconnect,
    reconnecting,
    sessionRevision,
    siteOpening,
    onBusyChange,
    reviewing,
    onReviewingChange,
  })
  const { uncertain } = recovery
  const uncertaintyNotice = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (uncertain && !reviewing) uncertaintyNotice.current?.focus()
  }, [uncertain, reviewing])

  if (complete) return <p role="status">{t("tokenCreation.complete")}</p>
  if (!capabilities) {
    if (!error || reconnecting)
      return (
        <NewApiTokenSetupLoading
          startedAt={loadStartedAt}
          renderSiteFallback={renderSiteFallback}
        />
      )
    return (
      <NewApiTokenSetupError
        title={t("tokenCreation.connection.optionsTitle")}
        message={t("tokenCreation.unavailable")}
        tone="destructive"
        footer={footer}
        actions={
          <Button
            type="button"
            disabled={siteOpening}
            leftIcon={<RefreshCw className="size-4" />}
            onClick={retryLoad}
          >
            {t("common:actions.retry")}
          </Button>
        }
      >
        {renderSiteFallback?.(TOKEN_SITE_FALLBACK_REASONS.UNAVAILABLE)}
      </NewApiTokenSetupError>
    )
  }
  if (reviewing)
    return (
      <NewApiTokenRecovery
        flow={flow}
        draftName={settings.name}
        footer={footer}
        uncertain={uncertain}
        onReturnToAccount={onReturnToAccount}
        onPendingChange={recovery.setRecoveryPending}
        onReconnect={onReconnect}
        reconnecting={reconnecting}
        reconnectError={reconnectError}
        sessionRevision={sessionRevision}
        onReviewed={recovery.finishReview}
        onRevokedCreated={recovery.clearCreated}
      />
    )
  if (uncertain) {
    const reviewAction = (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onReturnToAccount && (
          <Button type="button" variant="ghost" onClick={onReturnToAccount}>
            {t("tokenCreation.useExistingToken")}
          </Button>
        )}
        <Button type="button" onClick={() => onReviewingChange(true)}>
          {t("tokenCreation.reviewTokens")}
        </Button>
      </div>
    )
    return (
      <section
        className="space-y-4 text-sm"
        aria-label={t("tokenCreation.title")}
      >
        <InlineMessage
          ref={uncertaintyNotice}
          tabIndex={-1}
          role="alert"
          tone="warning"
        >
          {t("tokenCreation.uncertain")}
        </InlineMessage>
        <p className="wrap-anywhere text-muted-foreground">
          {t("tokenCreation.reviewDraft", { name: settings.name })}
        </p>
        {footer ? createPortal(reviewAction, footer) : reviewAction}
      </section>
    )
  }
  const showSiteFallback =
    !pending &&
    !created &&
    !reconnecting &&
    ((error !== "" && siteFallbackErrors.has(error)) || !hasAvailableMethods)
  const errorCopy: Record<TokenCreationError, string> = {
    [FEEDBACK.UNAVAILABLE]: t("tokenCreation.unavailable"),
    [FEEDBACK.VALIDATION_FAILED]: t("tokenCreation.validationFailed"),
    [FEEDBACK.UNCERTAIN]: t("tokenCreation.uncertain"),
    [FEEDBACK.BUSY]: t("tokenCreation.busy"),
    [FEEDBACK.FAILED]: t("tokenCreation.failed"),
    [FEEDBACK.LOCKED]: t("tokenCreation.locked"),
    [FEEDBACK.LIMIT]: t("tokenCreation.limit"),
    [FEEDBACK.IDENTITY]: t("tokenCreation.identity"),
    [FEEDBACK.SESSION]: t("tokenCreation.sessionRequired"),
    [FEEDBACK.INVALID_PASSWORD]: t("tokenCreation.invalidPassword"),
    [FEEDBACK.INVALID_CODE]: t("tokenCreation.invalidCode"),
    [FEEDBACK.CANCELLED]: t("tokenCreation.cancelled"),
    [FEEDBACK.TIMEOUT]: t("tokenCreation.timeout"),
  }
  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canCancel && (
        <Button type="button" variant="outline" onClick={cancelVerification}>
          {t("common:actions.cancel")}
        </Button>
      )}
      <Button
        type="button"
        onClick={() => void submit()}
        disabled={pending || !canSubmit}
        loading={pending}
      >
        {pending
          ? t("tokenCreation.verifying")
          : created
            ? t("tokenCreation.retryValidation")
            : t("tokenCreation.create")}
      </Button>
    </div>
  )
  const showReconnect =
    onReconnect &&
    (error === FEEDBACK.SESSION || error === FEEDBACK.VALIDATION_FAILED)
  const showReview =
    error === FEEDBACK.LIMIT || error === FEEDBACK.VALIDATION_FAILED

  return (
    <section
      className="space-y-5 text-sm text-foreground"
      aria-label={t("tokenCreation.title")}
    >
      <p className="text-muted-foreground">{t("tokenCreation.description")}</p>
      <div className="space-y-5">
        <NewApiTokenDetails
          {...settings}
          defaultExpiryDays={capabilities.catalog.default_expiry_days}
          disabled={disabled}
        />
        <NewApiTokenPermissions {...permissions} disabled={disabled} />
        <div className="space-y-3">
          <NewApiTokenVerificationFields
            verification={capabilities.verification}
            {...verification}
            feedbackMessage={error ? errorCopy[error] : undefined}
            feedbackTone={
              error === FEEDBACK.CANCELLED ? "neutral" : "destructive"
            }
            disabled={disabled}
            onSubmit={() => void submit()}
          />
          {(showReconnect || showReview) && (
            <div className="flex flex-wrap gap-2">
              {showReconnect && (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || reconnecting}
                  onClick={onReconnect}
                >
                  {t("tokenCreation.reconnect")}
                </Button>
              )}
              {showReview && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onReviewingChange(true)}
                >
                  {t("tokenCreation.reviewTokens")}
                </Button>
              )}
            </div>
          )}
          {!hasAvailableMethods && (
            <InlineMessage role="alert" tone="destructive" size="sm">
              {t("tokenCreation.noMethods")}
            </InlineMessage>
          )}
          {showSiteFallback &&
            renderSiteFallback?.(TOKEN_SITE_FALLBACK_REASONS.UNAVAILABLE)}
        </div>
      </div>
      {footer ? createPortal(actions, footer) : actions}
    </section>
  )
}
