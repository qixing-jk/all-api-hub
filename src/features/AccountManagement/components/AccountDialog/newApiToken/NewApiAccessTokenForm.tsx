import { RefreshCw } from "lucide-react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Button, InlineMessage } from "~/components/ui"
import type { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"

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
  sessionRevision,
  loadStartedAt,
  renderSiteFallback,
  siteOpening = false,
  footer,
  onBusyChange,
}: {
  flow: NewApiAccessTokenCreation
  onCreated: (token: string) => void
  onReconnect?: () => void
  reconnecting?: boolean
  sessionRevision?: unknown
  loadStartedAt?: number
  renderSiteFallback?: (reason: NewApiTokenSiteFallbackReason) => ReactNode
  siteOpening?: boolean
  footer?: HTMLElement | null
  onBusyChange?: (busy: boolean) => void
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
  })
  const { uncertain, recovering, reviewed } = recovery

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
  const showSiteFallback =
    !pending &&
    !created &&
    !uncertain &&
    !reconnecting &&
    !recovering &&
    ((error !== "" && siteFallbackErrors.has(error)) || !hasAvailableMethods)
  const errorCopy: Record<TokenCreationError, string> = {
    [FEEDBACK.UNAVAILABLE]: t("tokenCreation.unavailable"),
    [FEEDBACK.VALIDATION_FAILED]: t("tokenCreation.validationFailed"),
    [FEEDBACK.UNCERTAIN]: t("tokenCreation.uncertain"),
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
    (error === FEEDBACK.SESSION ||
      error === FEEDBACK.VALIDATION_FAILED ||
      uncertain)
  const showReview =
    !recovering &&
    (uncertain ||
      error === FEEDBACK.LIMIT ||
      error === FEEDBACK.VALIDATION_FAILED)

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
                  disabled={pending || reconnecting || recovery.recoveryPending}
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
                  onClick={recovery.startReview}
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
      {recovering && (
        <NewApiTokenRecovery
          flow={flow}
          onPendingChange={recovery.setRecoveryPending}
          onReconnect={onReconnect}
          reconnecting={reconnecting}
          sessionRevision={sessionRevision}
          onReviewed={recovery.finishReview}
        />
      )}
      {uncertain && (
        <div className="space-y-2">
          <label className="flex gap-2">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => recovery.setReviewed(event.target.checked)}
            />
            {t("tokenCreation.reviewed")}
          </label>
          <Button
            type="button"
            disabled={!reviewed || pending}
            onClick={() => void recovery.acknowledgeUncertain()}
          >
            {t("tokenCreation.allowNewAttempt")}
          </Button>
        </div>
      )}
      {footer ? createPortal(actions, footer) : actions}
    </section>
  )
}
